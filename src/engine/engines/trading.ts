import type { AccountType, GameState, MarketNode, OptionQuote, OrderRequest, OrderResult, Position, TradeThesis } from "../schemas";
import * as data_loader from "../data_loader";
import { new_id } from "../ids";
import * as margin_engine from "./margin";
import * as thesis_history_engine from "./thesis_history";
import * as trade_review_engine from "./trade_review";
import * as v28_integrity from "./v28_market_integrity";

export const SHARE_LOT = 100;
export type QuoteFn = (option_type: "call" | "put", strike: number, expiration: string) => OptionQuote;

function account_rules_text_legacy(account_type: AccountType): string {
  if (account_type === "TFSA") return "TFSA 模式：禁止保证金交易，也不允许裸卖期权。Covered Call 每张合约需要先持有 100 股正股作抵押；Cash-Secured Put 需要账户备好足额现金担保。本产品用的是教学风控模型，实际下单权限以券商规则为准。";
  if (account_type === "Margin") return `Margin 模式：买股票只需要付 ${(margin_engine.SHARE_INITIAL_MARGIN_PCT * 100).toFixed(0)}% 现金，差额记作保证金负债（不计利息）；Cash-Secured Put 按风险模型收取部分现金担保（约标的市值的 20% 减去虚值部分，随 Gamma/Vega 上浮，下限为 Strike 的 10%），不再要求 100% 全额现金。仍然不开放无限风险的裸卖 Call/Put；账户净值跌破维持保证金要求会确定性触发 Margin Call。这是简化的教学风控模型。`;
  return "Cash 模式：账户不使用任何借款；卖出 Put 必须用现金全额担保（Cash-Secured Put）。Covered Call 同样需要先持有 100 股正股才能卖出。";
}

export function account_rules_text(account_type: AccountType): string {
  if (account_type === 'Margin') {
    return 'Margin 教学模型：买股初始保证金、CSP collateral reservation 与逐日融资利息都会计入；本构建不是 SPAN/TIMS。V28 另显示 DERIVED_STRESS_MODEL 压力保证金，不冒充券商账单。';
  }
  if (account_type === 'Cash' || account_type === 'TFSA') {
    return 'Cash/TFSA：卖 Put 需要可用现金担保，已锁定 collateral 不计入可用现金；V28 不使用隐形借款。';
  }
  return account_rules_text_legacy(account_type);
}

export function can_write_covered_call(state: GameState, qty: number): boolean {
  return ((state.shares ?? 0) - margin_engine.shares_locked_by_covered_calls(state.positions ?? [])) >= 100 * qty;
}
export function can_write_cash_secured_put(state: GameState, requirement: number): boolean { return state.cash >= requirement; }

function execution_label(order_kind: "Market" | "Limit" | undefined, quote: OptionQuote): string {
  if (order_kind === "Limit") return "SIMULATED EXECUTION";
  return quote.provenance.source_type?.startsWith("REAL") ? "REAL QUOTE FILL" : "ESTIMATED MODEL FILL";
}
function reject(message: string): OrderResult { return { accepted: false, message }; }
function make_thesis(order: OrderRequest, node: MarketNode, contract_or_symbol: string): TradeThesis | null {
  if (!order.thesis) return null;
  return { id: new_id(), contract_or_symbol, direction: order.thesis.direction, catalyst: order.thesis.catalyst, expected_move_pct: order.thesis.expected_move_pct, time_horizon_days: order.thesis.time_horizon_days, invalidation_level: order.thesis.invalidation_level, why_instrument: order.thesis.why_instrument, risk_budget_usd: order.thesis.risk_budget_usd, created_at_date: node.date };
}

function execute_order_impl(state: GameState, node: MarketNode, quote_fn: QuoteFn, order: OrderRequest): [GameState, OrderResult] {
  const qty = order.qty ?? 1;
  if (order.side === 'exercise_long_option') {
    return v28_integrity.exerciseLongOption(state, node, order);
  }
  if (order.side === 'buy_vertical_spread' || order.side === 'buy_straddle') {
    return v28_integrity.executeStrategyOrder(state, node, quote_fn, order);
  }
  if (order.side === "buy_shares") {
    const price = node.underlying_bar.close;
    const cost = price * SHARE_LOT;
    const [cash_required, debt_incurred] = margin_engine.share_purchase_cash_required(price, SHARE_LOT, state.account_type ?? "Cash");
    if (cash_required > state.cash) return [state, reject(`REJECTED: 可用现金不足。买入需要 ${cash_required.toFixed(2)}，当前现金 ${state.cash.toFixed(2)}。` )];
    const old_qty = state.shares ?? 0;
    const old_basis = state.share_cost_basis ?? 0;
    state.share_cost_basis = (old_basis * old_qty + cost) / (old_qty + SHARE_LOT);
    state.shares = old_qty + SHARE_LOT;
    state.cash -= cash_required;
    state.margin_debt = (state.margin_debt ?? 0) + debt_incurred;
    const thesis = make_thesis(order, node, `${price} shares`);
    if (thesis) { (state.active_theses ??= {}).shares = thesis; thesis_history_engine.record_entry(state, "shares", thesis, price); }
    return [state, { accepted: true, message: `FILLED: 买入 100 股 @ ${price.toFixed(2)}，支付 ${cash_required.toFixed(2)}${debt_incurred > 0 ? `，新增保证金负债 ${debt_incurred.toFixed(2)}。` : "。"}`, fill_price: price, execution_label: debt_incurred > 0 ? "SIMULATED EXECUTION (MARGIN)" : "SIMULATED EXECUTION" }];
  }

  if (order.side === "sell_shares") {
    const price = node.underlying_bar.close;
    const locked = margin_engine.shares_locked_by_covered_calls(state.positions ?? []);
    const shares = state.shares ?? 0;
    if (shares - locked < SHARE_LOT) return [state, reject(locked > 0 ? `REJECTED: 持仓股数不足。有 ${locked} 股被 Covered Call 锁定担保。` : "REJECTED: 没有 100 股可供卖出。")];
    const basis = state.share_cost_basis ?? 0;
    const pl = (price - basis) * SHARE_LOT;
    const debt_repaid = (state.margin_debt ?? 0) * (SHARE_LOT / shares);
    state.margin_debt = (state.margin_debt ?? 0) - debt_repaid;
    state.realized_pl = (state.realized_pl ?? 0) + pl;
    state.shares = shares - SHARE_LOT;
    state.cash += price * SHARE_LOT - debt_repaid;
    const dummy: Position = { id: new_id(), kind: "shares", underlying: node.label !== "SPX" ? "NVDA" : "SPX", qty: SHARE_LOT, entry_price: basis, entry_date: node.date, thesis: state.active_theses?.shares, origin_campaign: state.campaign_id ?? "r1", thesis_id: state.active_theses?.shares?.id ?? null, contract_multiplier: 1 };
    const review = trade_review_engine.create_trade_review(dummy, node, price, pl, { active_thesis: state.active_theses?.shares, exit_reason: 'MANUAL_CLOSE', state, nodes: data_loader.get_campaign_nodes(state.campaign_id ?? "r1") });
    (state.trade_reviews ??= []).push(review);
    if (state.shares === 0) { state.share_cost_basis = 0; state.margin_debt = 0; delete state.active_theses?.shares; }
    return [state, { accepted: true, message: `FILLED: 卖出 100 股 @ ${price.toFixed(2)}，实现盈亏 ${pl.toFixed(2)}${debt_repaid > 0 ? `，清偿保证金负债 ${debt_repaid.toFixed(2)}。` : "。"}`, fill_price: price, execution_label: "SIMULATED EXECUTION", realized_pl: pl, trade_review_id: review.trade_id }];
  }

  if (order.side === "buy_to_open") {
    const type = order.type;
    const strike = order.strike;
    const expiration = order.expiration;
    if (!type || strike == null || !expiration) return [state, reject("REJECTED: 缺少期权类型、行权价或到期日。")];
    const quote = quote_fn(type, strike, expiration);
    let price: number;
    if (order.order_kind === "Limit") {
      if (order.limit_price == null) return [state, reject("REJECTED: 限价单必须指定价格。")];
      if (order.limit_price < quote.ask) return [state, reject(`REJECTED: 限价 ${order.limit_price.toFixed(2)} 未触及 Ask ${quote.ask.toFixed(2)}，挂单失败。`)];
      price = Math.min(order.limit_price, quote.ask);
    } else price = quote.ask;
    const cost = price * 100 * qty;
    if (cost > state.cash) return [state, reject(`REJECTED: 可用现金不足。需 ${cost.toFixed(2)}，当前 ${state.cash.toFixed(2)}。`)];
    const thesis = make_thesis(order, node, `${type.toUpperCase()} ${strike} (${expiration})`);
    const position: Position = { id: new_id(), kind: "option", underlying: quote.underlying, type, strike, expiration, qty, entry_price: price, entry_date: node.date, short: false, thesis, origin_campaign: state.campaign_id ?? "r1", thesis_id: thesis?.id ?? null, contract_multiplier: 100 };
    state.cash -= cost;
    (state.positions ??= []).push(position);
    if (thesis) { (state.active_theses ??= {})[position.id] = thesis; thesis_history_engine.record_entry(state, position.id, thesis, node.underlying_bar.close); }
    (state.entry_snapshots ??= {})[position.id] = trade_review_engine.create_entry_snapshot(
      position,
      node,
      state,
      thesis ?? undefined,
      { fill_price: price, qty, entry_iv: quote.iv ?? null },
    );
    return [state, { accepted: true, message: `FILLED (BTO): ${qty}x ${type.toUpperCase()} ${strike} @ ${price.toFixed(2)}。`, fill_price: price, execution_label: execution_label(order.order_kind, quote) }];
  }

  if (order.side === "sell_to_close" || order.side === "buy_to_close") {
    const type = order.type;
    const strike = order.strike;
    const expiration = order.expiration;
    if (!type || strike == null || !expiration) return [state, reject("REJECTED: 缺少平仓合约要素。")];
    const quote = quote_fn(type, strike, expiration);
    const is_long_close = order.side === "sell_to_close";
    const position = (state.positions ?? []).find((candidate) => (is_long_close ? !candidate.short : candidate.short) && candidate.type === type && candidate.strike === strike && candidate.expiration === expiration && candidate.qty > 0);
    if (!position) return [state, reject(is_long_close ? "REJECTED: 未找到对应的多头持仓可供 STC。" : "REJECTED: 未找到对应的空头持仓可供 BTC。")];
    let price: number;
    if (order.order_kind === "Limit") {
      if (order.limit_price == null) return [state, reject("REJECTED: 限价单必须指定价格。")];
      if (is_long_close && order.limit_price > quote.bid) return [state, reject(`REJECTED: 限价 ${order.limit_price.toFixed(2)} 高于当前 Bid ${quote.bid.toFixed(2)}，挂单失败。`)];
      if (!is_long_close && order.limit_price < quote.ask) return [state, reject(`REJECTED: 限价 ${order.limit_price.toFixed(2)} 未触及 Ask ${quote.ask.toFixed(2)}，挂单失败。`)];
      price = is_long_close ? Math.max(order.limit_price, quote.bid) : Math.min(order.limit_price, quote.ask);
    } else price = is_long_close ? quote.bid : quote.ask;
    const close_qty = Math.min(qty, position.qty);
    const realized_delta = (is_long_close ? price - position.entry_price : position.entry_price - price) * 100 * close_qty;
    if (is_long_close) state.cash += price * 100 * close_qty;
    else {
      const cost = price * 100 * close_qty;
      if (cost > state.cash) return [state, reject(`REJECTED: 可用现金不足。买回需 ${cost.toFixed(2)}，当前 ${state.cash.toFixed(2)}。`)];
      state.cash -= cost;
    }
    state.realized_pl = (state.realized_pl ?? 0) + realized_delta;
    const entry_snap = state.entry_snapshots?.[position.id];
    const exit_snap = trade_review_engine.create_exit_snapshot(
      position,
      node,
      price,
      realized_delta,
      state,
      is_long_close ? "PLAYER_SELL_TO_CLOSE" : "PLAYER_BUY_TO_CLOSE",
    );
    const review = trade_review_engine.create_trade_review(position, node, price, realized_delta, { active_thesis: position.thesis ?? undefined, entry_snapshot: entry_snap, exit_snapshot: exit_snap, exit_reason: 'MANUAL_CLOSE', state, nodes: data_loader.get_campaign_nodes(state.campaign_id ?? "r1") });
    (state.trade_reviews ??= []).push(review);
    position.qty -= close_qty;
    if (position.qty <= 0) { state.positions = (state.positions ?? []).filter((candidate) => candidate !== position); delete state.active_theses?.[position.id]; }
    v28_integrity.recalculateCashCollateral(state);
    return [state, { accepted: true, message: `FILLED (${is_long_close ? "STC" : "BTC"}): ${close_qty}x @ ${price.toFixed(2)}，锁定 ${realized_delta.toFixed(2)}。`, fill_price: price, execution_label: execution_label(order.order_kind, quote), realized_pl: realized_delta, trade_review_id: review.trade_id }];
  }

  if (order.side === "sell_covered_call") {
    if (order.type !== "call") return [state, reject("REJECTED: Covered Call 必须对应 Call 合约。")];
    const strike = order.strike; const expiration = order.expiration;
    if (strike == null || !expiration) return [state, reject("REJECTED: 缺少行权价或到期日。")];
    if (!can_write_covered_call(state, qty)) return [state, reject("REJECTED: Covered Call 每张需 100 股未锁定正股作担保。")];
    const quote = quote_fn("call", strike, expiration); const price = quote.bid;
    state.cash += price * 100 * qty;
    (state.positions ??= []).push({ id: new_id(), kind: "option", underlying: quote.underlying, type: "call", strike, expiration, qty, entry_price: price, entry_date: node.date, short: true, origin_campaign: state.campaign_id ?? "r1", thesis_id: null, contract_multiplier: 100 });
    return [state, { accepted: true, message: `FILLED (STO-CC): ${qty}x CALL ${strike} @ ${price.toFixed(2)}。`, fill_price: price, execution_label: execution_label("Market", quote) }];
  }

  if (order.side === "sell_cash_secured_put") {
    if (order.type !== "put") return [state, reject("REJECTED: CSP 必须对应 Put 合约。")];
    const strike = order.strike; const expiration = order.expiration;
    if (strike == null || !expiration) return [state, reject("REJECTED: 缺少行权价或到期日。")];
    const quote = quote_fn("put", strike, expiration);
    const new_requirement = margin_engine.cash_secured_put_requirement(node.underlying_bar.close, strike, qty, state.account_type ?? "Cash", quote.greeks);
    const already_reserved = margin_engine.total_put_collateral_reserved(state.positions ?? [], node, state.account_type ?? "Cash", quote_fn);
    if (!can_write_cash_secured_put(state, already_reserved + new_requirement)) return [state, reject(state.account_type === "Margin" ? `REJECTED: 保证金不足。已占用 ${already_reserved.toFixed(2)}，本单需 ${new_requirement.toFixed(2)}，当前可用 ${state.cash.toFixed(2)}。` : `REJECTED: 现金担保不足。已占用 ${already_reserved.toFixed(2)}，本单需 ${new_requirement.toFixed(2)}，当前可用 ${state.cash.toFixed(2)}。`)];
    const price = quote.bid;
    state.cash += price * 100 * qty;
    (state.positions ??= []).push({ id: new_id(), kind: "option", underlying: quote.underlying, type: "put", strike, expiration, qty, entry_price: price, entry_date: node.date, short: true, collateral_locked_usd: new_requirement, origin_campaign: state.campaign_id ?? "r1", thesis_id: null, contract_multiplier: 100 });
    v28_integrity.recalculateCashCollateral(state);
    return [state, { accepted: true, message: `FILLED (STO-CSP): ${qty}x PUT ${strike} @ ${price.toFixed(2)}。`, fill_price: price, execution_label: execution_label("Market", quote) }];
  }
  return [state, reject(`REJECTED: 未知订单指令 ${order.side}。`)];
}

export function close_strategy(state: GameState, node: MarketNode, quote_fn: QuoteFn, strategyId: string): [GameState, OrderResult] {
  const legs = (state.positions ?? []).filter((p) => p.strategy_id === strategyId && p.qty > 0);
  if (legs.length === 0) return [state, reject('REJECTED: 未找到指定的组合策略持仓。')];
  const results: string[] = [];
  let totalPl = 0;
  let cashBefore = state.cash;
  for (const leg of legs) {
    // schemas.ts Position exposes `short`; `is_short` only exists on the UI-layer types.ts
    // Position, so reading it here was a type error that never compiled.
    const isShort = Boolean(leg.short);
    const quote = quote_fn(leg.type as 'call' | 'put', leg.strike!, leg.expiration!);
    const price = isShort ? quote.ask : quote.bid;
    const pl = (isShort ? leg.entry_price - price : price - leg.entry_price) * 100 * leg.qty;
    if (isShort) {
      const cost = price * 100 * leg.qty;
      if (cost > state.cash) return [state, reject(`REJECTED: 组合平仓资金不足。买回 ${leg.type?.toUpperCase()} ${leg.strike} 需 ${cost.toFixed(2)}。`)];
      state.cash -= cost;
    } else {
      state.cash += price * 100 * leg.qty;
    }
    state.realized_pl = (state.realized_pl ?? 0) + pl;
    totalPl += pl;
    const entry_snap = state.entry_snapshots?.[leg.id];
    const exit_snap = trade_review_engine.create_exit_snapshot(leg, node, price, pl, state, "STRATEGY_CLOSE");
    const review = trade_review_engine.create_trade_review(leg, node, price, pl, { active_thesis: leg.thesis ?? undefined, entry_snapshot: entry_snap, exit_snapshot: exit_snap, exit_reason: 'MANUAL_CLOSE', state, nodes: data_loader.get_campaign_nodes(state.campaign_id ?? 'r1') });
    (state.trade_reviews ??= []).push(review);
    state.positions = (state.positions ?? []).filter((c) => c !== leg);
    delete state.active_theses?.[leg.id];
    results.push(`${isShort ? 'Buy to Close' : 'Sell to Close'} ${leg.type?.toUpperCase()} ${leg.strike} @ ${price.toFixed(2)}`);
  }
  v28_integrity.recalculateCashCollateral(state);
  const cashDelta = state.cash - cashBefore;
  return [state, {
    accepted: true,
    message: `FILLED (STRATEGY CLOSE): ${results.join(' + ')}。实现盈亏 ${totalPl.toFixed(2)}，现金净变动 ${cashDelta >= 0 ? '+' : ''}${cashDelta.toFixed(2)}。`,
    fill_price: 0,
    realized_pl: totalPl,
    execution_label: 'STRATEGY CLOSE · DERIVED MODEL',
  }];
}

/** Public order boundary adds one authoritative fill quantity to every legacy branch. */
export function execute_order(state: GameState, node: MarketNode, quote_fn: QuoteFn, order: OrderRequest): [GameState, OrderResult] {
  const requested = Math.max(1, order.qty ?? 1);
  let expectedFilled = requested;
  if (order.side === 'buy_shares' || order.side === 'sell_shares') expectedFilled = SHARE_LOT;
  if (order.side === 'sell_to_close' || order.side === 'buy_to_close') {
    const isLong = order.side === 'sell_to_close';
    const existing = (state.positions ?? []).find((candidate) =>
      (isLong ? !candidate.short : candidate.short) &&
      candidate.type === order.type && candidate.strike === order.strike &&
      candidate.expiration === order.expiration && candidate.qty > 0,
    );
    expectedFilled = Math.min(requested, existing?.qty ?? 0);
  }

  const [next, result] = execute_order_impl(state, node, quote_fn, order);
  if (result.filled_qty == null) result.filled_qty = result.accepted ? expectedFilled : 0;
  return [next, result];
}

function settle_expiries_legacy(state: GameState, node: MarketNode): [GameState, string[]] {
  const logs: string[] = [];
  const spot = node.underlying_bar.close;
  for (const position of [...(state.positions ?? [])]) {
    if (position.kind !== "option" || !position.expiration || position.expiration > node.date || position.strike == null || !position.type) continue;
    const intrinsic = position.type === "call" ? Math.max(spot - position.strike, 0) : Math.max(position.strike - spot, 0);
    const pl = (position.short ? position.entry_price - intrinsic : intrinsic - position.entry_price) * 100 * position.qty;
    if (position.short) state.cash -= intrinsic * 100 * position.qty;
    else state.cash += intrinsic * 100 * position.qty;
    state.realized_pl = (state.realized_pl ?? 0) + pl;
    (state.trade_reviews ??= []).push(trade_review_engine.create_trade_review(position, node, intrinsic, pl, { active_thesis: position.thesis ?? undefined, state, nodes: data_loader.get_campaign_nodes(state.campaign_id ?? "r1") }));
    state.positions = (state.positions ?? []).filter((candidate) => candidate !== position);
    delete state.active_theses?.[position.id];
    logs.push(`${position.short ? "空头" : ""}到期结算：${position.type.toUpperCase()} ${position.strike} 内在价值 ${intrinsic.toFixed(2)}，实现盈亏 ${pl.toFixed(2)}。`);
  }
  return [state, logs];
}

/** V28: expiration uses explicit physical assignment/exercise semantics. */
export function settle_expiries(state: GameState, node: MarketNode): [GameState, string[]] {
  const logs: string[] = [];
  for (const position of [...(state.positions ?? [])]) {
    if (position.kind !== 'option' || !position.expiration || position.expiration > node.date || position.strike == null || !position.type) continue;
    const settlement = v28_integrity.settlePhysicalAssignmentResult(state, node, position);
    const exitSnapshot = trade_review_engine.create_exit_snapshot(
      position,
      node,
      settlement.intrinsic,
      settlement.realized_pl,
      state,
      settlement.exit_reason,
    );
    (state.trade_reviews ??= []).push(trade_review_engine.create_trade_review(
      position,
      node,
      settlement.intrinsic,
      settlement.realized_pl,
      { active_thesis: position.thesis ?? undefined, exit_snapshot: exitSnapshot, exit_reason: settlement.exit_reason, state, nodes: data_loader.get_campaign_nodes(state.campaign_id ?? 'r1') },
    ));
    state.positions = (state.positions ?? []).filter((candidate) => candidate !== position);
    if (state.active_theses) delete state.active_theses[position.id];
    logs.push(settlement.message);
  }
  v28_integrity.recalculateCashCollateral(state);
  return [state, logs];
}
