import type {
  GameState,
  MarketNode,
  OptionQuote,
  OrderRequest,
  OrderResult,
  Position,
  ExitReason,
} from '../schemas';
import { new_id } from '../ids';

export type V28StrategyKind = 'VERTICAL_SPREAD' | 'STRADDLE';
export type V28LegSide = 'LONG' | 'SHORT';

export interface V28StrategyLeg {
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  side: V28LegSide;
}

export interface V28StressMargin {
  requirement: number;
  downside_equity_loss: number;
  upside_equity_loss: number;
  model_label: 'DERIVED_STRESS_MODEL';
  disclaimer: string;
}

export const V28_STRESS_MODEL_DISCLAIMER =
  'DERIVED_STRESS_MODEL：基于 ±15% 标的瞬间冲击与逐仓期权内在价值 (Intrinsic Value) 重估；该模型非 SPAN/TIMS 标准，亦非历史真实保证金账单映射。';

function reject(message: string): OrderResult {
  return { accepted: false, message };
}

function optionIntrinsic(type: 'call' | 'put', strike: number, spot: number): number {
  return type === 'call' ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
}

function removeQuantity(state: GameState, position: Position, qty: number): void {
  position.qty -= qty;
  if (position.qty <= 0) {
    state.positions = (state.positions ?? []).filter((candidate) => candidate !== position);
    if (state.active_theses) delete state.active_theses[position.id];
  }
}

export function recalculateCashCollateral(state: GameState): number {
  const reserved = (state.positions ?? [])
    .filter((position) => position.kind === 'option' && position.short && position.type === 'put')
    .reduce((sum, position) => sum + Math.max(0, position.collateral_locked_usd ?? 0), 0);
  state.cash_collateral_reserved = reserved;
  return reserved;
}

export function stressMarginRequirement(state: GameState, spot: number): V28StressMargin {
  const positions = state.positions ?? [];
  const stress = (stressedSpot: number): number => positions.reduce((loss, position) => {
    if (position.kind !== 'option' || position.strike == null || !position.type) return loss;
    const stressedIntrinsic = optionIntrinsic(position.type, position.strike, stressedSpot);
    const entry = Math.max(0, position.entry_price);
    const optionLoss = position.short
      ? Math.max(0, stressedIntrinsic - entry) * 100 * position.qty
      : Math.max(0, entry - stressedIntrinsic) * 100 * position.qty;
    return loss + optionLoss;
  }, 0);
  const downside = stress(spot * 0.85);
  const upside = stress(spot * 1.15);
  return {
    requirement: Math.max(downside, upside),
    downside_equity_loss: downside,
    upside_equity_loss: upside,
    model_label: 'DERIVED_STRESS_MODEL',
    disclaimer: V28_STRESS_MODEL_DISCLAIMER,
  };
}

function addPosition(
  state: GameState,
  leg: V28StrategyLeg,
  quote: OptionQuote,
  price: number,
  qty: number,
  strategyId: string,
  strategyKind: V28StrategyKind,
  node: MarketNode,
  collateralLocked = 0,
): void {
  (state.positions ??= []).push({
    id: new_id(),
    kind: 'option',
    underlying: quote.underlying,
    type: leg.type,
    strike: leg.strike,
    expiration: leg.expiration,
    qty,
    entry_price: price,
    entry_date: node.date,
    short: leg.side === 'SHORT',
    strategy_id: strategyId,
    strategy_kind: strategyKind,
    collateral_locked_usd: collateralLocked,
    origin_campaign: state.campaign_id ?? 'r1',
    thesis_id: null,
    contract_multiplier: 100,
  });
}

export function executeStrategyOrder(
  state: GameState,
  node: MarketNode,
  quoteFn: (type: 'call' | 'put', strike: number, expiration: string) => OptionQuote,
  order: OrderRequest,
): [GameState, OrderResult] {
  const kind = order.strategy_kind as V28StrategyKind | undefined;
  const legs = (order.strategy_legs ?? []) as V28StrategyLeg[];
  const qty = Math.max(1, order.qty ?? 1);
  if (!kind || !Array.isArray(legs)) return [state, reject('组合订单结构异常：缺失 strategy_kind 或 strategy_legs 参数。')];
  if (kind === 'STRADDLE') {
    if (legs.length !== 2 || legs.some((leg) => leg.side !== 'LONG') ||
      new Set(legs.map((leg) => leg.type)).size !== 2 ||
      new Set(legs.map((leg) => `${leg.strike}|${leg.expiration}`)).size !== 1) {
      return [state, reject('订单被拒：Straddle 组合要求有且仅有同到期日、同 Strike 的 1 张 Call 与 1 张 Put。')];
    }
  } else if (kind === 'VERTICAL_SPREAD') {
    if (legs.length !== 2 || new Set(legs.map((leg) => leg.type)).size !== 1 ||
      new Set(legs.map((leg) => leg.expiration)).size !== 1 ||
      new Set(legs.map((leg) => leg.side)).size !== 2 || legs[0].strike === legs[1].strike) {
      return [state, reject('订单被拒：Vertical Spread 组合要求有且仅有同到期日、同类型、不同 Strike 的一多一空对锁结构。')];
    }
  } else {
    return [state, reject(`订单被拒：系统当前不支持组合策略类型 ${String(kind)}。`)];
  }

  const priced = legs.map((leg) => ({
    leg,
    quote: quoteFn(leg.type, leg.strike, leg.expiration),
    price: leg.side === 'LONG'
      ? quoteFn(leg.type, leg.strike, leg.expiration).ask
      : quoteFn(leg.type, leg.strike, leg.expiration).bid,
  }));
  const netDebit = priced.reduce((sum, item) => sum + (item.leg.side === 'LONG' ? item.price : -item.price), 0) * 100 * qty;
  const creditSpread = kind === 'VERTICAL_SPREAD' && netDebit < 0;
  const width = kind === 'VERTICAL_SPREAD' ? Math.abs(legs[0].strike - legs[1].strike) * 100 * qty : 0;
  const maxLoss = creditSpread ? Math.max(0, width + netDebit) : 0;
  const availableCash = state.cash - (state.cash_collateral_reserved ?? 0);
  if (netDebit > availableCash || (creditSpread && maxLoss > availableCash)) {
    return [state, reject(`资金校验失败：构建该组合需储备 ${Math.max(netDebit, maxLoss).toFixed(2)}，当前账户可用净头寸仅 ${availableCash.toFixed(2)}。`)];
  }

  const strategyId = new_id();
  if (netDebit >= 0) state.cash -= netDebit;
  else state.cash += Math.abs(netDebit);
  for (const item of priced) {
    addPosition(state, item.leg, item.quote, item.price, qty, strategyId, kind, node,
      item.leg.side === 'SHORT' && creditSpread ? maxLoss : 0);
  }
  recalculateCashCollateral(state);
  return [state, {
    accepted: true,
    message: `${kind === 'STRADDLE' ? 'Long Straddle' : 'Vertical Spread'} 组合策略构建成功：共 ${legs.length} 腿，净${netDebit >= 0 ? '支出' : '收入'} ${Math.abs(netDebit).toFixed(2)}。风险敞口最大潜在损失界定为 ${maxLoss.toFixed(2)}。`,
    fill_price: netDebit / (100 * qty),
    total_cost: netDebit,
    execution_label: 'DERIVED MODEL COMBINATION FILL',
  }];
}

export function exerciseLongOption(state: GameState, node: MarketNode, order: OrderRequest): [GameState, OrderResult] {
  const type = order.type;
  const strike = order.strike;
  const expiration = order.expiration;
  if (!type || strike == null || !expiration) return [state, reject('指令参数残缺：行权请求需完整包含期权类型、Strike 与到期日。')];
  const position = (state.positions ?? []).find((candidate) => candidate.kind === 'option' && !candidate.short && candidate.type === type && candidate.strike === strike && candidate.expiration === expiration);
  if (!position) return [state, reject('行权拒绝：账户内未发现与指令匹配的权利仓 (Long) 头寸。')];
  const qty = Math.min(Math.max(1, order.qty ?? 1), position.qty);
  const spot = node.underlying_bar.close;
  if (optionIntrinsic(type, strike, spot) <= 0) return [state, reject('行权拒绝：标的期权处于价外 (OTM) 状态，禁止将无内在价值的合约提交实物行权。')];
  const shares = SHARE_LOT * qty;
  const premiumCost = position.entry_price * shares;
  if (type === 'call') {
    const exerciseCost = strike * shares;
    if (state.account_type !== 'Margin' && state.cash < exerciseCost) return [state, reject(`资金校验失败：Call 行权须全额支付 ${exerciseCost.toFixed(2)} 现金进行实物交收，当前可用现金不足。`)];
    const debt = Math.max(0, exerciseCost - state.cash);
    state.cash -= exerciseCost - debt;
    state.margin_debt = (state.margin_debt ?? 0) + debt;
    const oldQty = state.shares ?? 0;
    const oldBasis = state.share_cost_basis ?? 0;
    state.share_cost_basis = (oldBasis * oldQty + exerciseCost) / Math.max(1, oldQty + shares);
    state.shares = oldQty + shares;
  } else {
    // A long put exercises by selling shares. If the fund does not own them, the
    // broker creates a transparent short-share position rather than cash-settling silently.
    state.shares = (state.shares ?? 0) - shares;
    state.cash += strike * shares;
  }
  removeQuantity(state, position, qty);
  state.realized_pl = (state.realized_pl ?? 0) - premiumCost;
  return [state, {
    accepted: true,
    message: `实物行权结算完成：${qty}x ${type.toUpperCase()} ${strike}，已${type === 'call' ? `提取 ${shares} 股多头现货` : `交付并建立 ${shares} 股现货空头`}；系统拒绝现金静默替代。`,
    fill_price: optionIntrinsic(type, strike, spot),
    total_cost: type === 'call' ? strike * shares : -strike * shares,
    realized_pl: -premiumCost,
    execution_label: 'PHYSICAL EXERCISE · DERIVED SETTLEMENT',
  }];
}

export function settlePhysicalAssignment(state: GameState, node: MarketNode, position: Position): string {
  const spot = node.underlying_bar.close;
  const intrinsic = optionIntrinsic(position.type!, position.strike!, spot);
  const shares = SHARE_LOT * position.qty;
  if (intrinsic <= 0) {
    state.realized_pl = (state.realized_pl ?? 0) + (position.short ? position.entry_price : -position.entry_price) * shares;
    return `${position.short ? 'Short' : 'Long'} ${position.type!.toUpperCase()} ${position.strike} 合约到期处于价外 (OTM)，已作废并清算权利金。`;
  }
  if (position.short && position.type === 'call') {
    state.shares = (state.shares ?? 0) - shares;
    state.cash += position.strike! * shares;
  } else if (position.short && position.type === 'put') {
    state.shares = (state.shares ?? 0) + shares;
    state.cash -= position.strike! * shares;
    if (state.cash < 0) {
      state.margin_debt = (state.margin_debt ?? 0) + Math.abs(state.cash);
      state.cash = 0;
    }
  } else if (position.type === 'call') {
    const exerciseCost = position.strike! * shares;
    const debt = Math.max(0, exerciseCost - state.cash);
    state.cash -= exerciseCost - debt;
    state.margin_debt = (state.margin_debt ?? 0) + debt;
    state.shares = (state.shares ?? 0) + shares;
  } else {
    state.shares = (state.shares ?? 0) - shares;
    state.cash += position.strike! * shares;
  }
  const optionPl = (position.short ? position.entry_price - intrinsic : intrinsic - position.entry_price) * shares;
  state.realized_pl = (state.realized_pl ?? 0) + optionPl;
  return `实物交收指派 (Physical Assignment) 触发：${position.short ? 'Short' : 'Long'} ${position.type!.toUpperCase()} ${position.strike}，强制执行 ${shares} 股现货清算；市场历史拒绝现金替代。`;
}

export interface ExpirySettlementResult {
  message: string;
  realized_pl: number;
  exit_reason: ExitReason;
  intrinsic: number;
}

/** Structured expiry settlement used by the accounting/review pipeline. */
export function settlePhysicalAssignmentResult(state: GameState, node: MarketNode, position: Position): ExpirySettlementResult {
  const spot = node.underlying_bar.close;
  const intrinsic = optionIntrinsic(position.type!, position.strike!, spot);
  const shares = SHARE_LOT * position.qty;
  if (intrinsic <= 0) {
    const realized_pl = (position.short ? position.entry_price : -position.entry_price) * shares;
    state.realized_pl = (state.realized_pl ?? 0) + realized_pl;
    return {
      message: `${position.short ? 'Short' : 'Long'} ${position.type!.toUpperCase()} ${position.strike} expired worthless (OTM).`,
      realized_pl,
      exit_reason: 'EXPIRED_WORTHLESS',
      intrinsic,
    };
  }

  if (position.short && position.type === 'call') {
    state.shares = (state.shares ?? 0) - shares;
    state.cash += position.strike! * shares;
  } else if (position.short && position.type === 'put') {
    state.shares = (state.shares ?? 0) + shares;
    state.cash -= position.strike! * shares;
    if (state.cash < 0) {
      state.margin_debt = (state.margin_debt ?? 0) + Math.abs(state.cash);
      state.cash = 0;
    }
  } else if (position.type === 'call') {
    const exerciseCost = position.strike! * shares;
    const debt = Math.max(0, exerciseCost - state.cash);
    state.cash -= exerciseCost - debt;
    state.margin_debt = (state.margin_debt ?? 0) + debt;
    state.shares = (state.shares ?? 0) + shares;
  } else {
    state.shares = (state.shares ?? 0) - shares;
    state.cash += position.strike! * shares;
  }

  const realized_pl = (position.short ? position.entry_price - intrinsic : intrinsic - position.entry_price) * shares;
  state.realized_pl = (state.realized_pl ?? 0) + realized_pl;
  return {
    message: `Physical expiry settlement: ${position.short ? 'Short' : 'Long'} ${position.type!.toUpperCase()} ${position.strike}.`,
    realized_pl,
    exit_reason: position.short ? 'ASSIGNED' : 'EXPIRED_ITM',
    intrinsic,
  };
}

const SHARE_LOT = 100;
