import type { MarketMicrostructureState, MarketNode, MMQuote, OptionQuote, Position } from "../schemas";

export function evaluate_microstructure(node: MarketNode, positions: Position[], campaign_id: string): MarketMicrostructureState {
  const vix = node.vix?.close || 16;
  const underlying = campaign_id === "r1" ? "NVDA" : "SPX";
  const player_call_qty = positions.filter((position) => position.type === "call").reduce((sum, position) => sum + position.qty * (position.short ? -1 : 1), 0);
  const player_put_qty = positions.filter((position) => position.type === "put").reduce((sum, position) => sum + position.qty * (position.short ? -1 : 1), 0);
  const mm_net_delta_shares = -player_call_qty * 50 + player_put_qty * 50;
  if (vix > 22) return { underlying, date: node.date, mm_sentiment: "DEFENSIVE", mm_net_delta_shares, volatility_regime: "HIGH_PANIC", spread_multiplier: 1.8, commentary: "Leo Park (MM): '恐慌指数飙升，做市商单边库存承压，全线拉宽 Spread 以防范逆向选择风险。'" };
  if (vix > 17) return { underlying, date: node.date, mm_sentiment: "CAUTIOUS", mm_net_delta_shares, volatility_regime: "ELEVATED", spread_multiplier: 1.3, commentary: "Leo Park (MM): '市场波动率升温，Gamma 集中区间的动态对冲正在加速，流动性适度收紧。'" };
  return { underlying, date: node.date, mm_sentiment: "NEUTRAL", mm_net_delta_shares, volatility_regime: "NORMAL", spread_multiplier: 1, commentary: "Leo Park (MM): '盘口流动性充沛，NBBO 价差维持在常态区间，对冲库存平衡。'" };
}

export function compute_mm_quote(quote: OptionQuote, micro_state: MarketMicrostructureState): MMQuote {
  const spread = quote.ask - quote.bid;
  const mid = quote.mid > 0 ? quote.mid : (quote.bid + quote.ask) / 2;
  const spread_bps = mid > 0 ? spread / mid * 10000 : 100;
  let risk_status = "NORMAL";
  let adverse = false;
  if ((micro_state.spread_multiplier ?? 1) > 1.5) { risk_status = "SPREAD_WIDENED"; adverse = true; }
  else if ((micro_state.spread_multiplier ?? 1) > 1.2) risk_status = "HEAVILY_HEDGED";
  return { contract_key: quote.contract_key, bid: quote.bid, ask: quote.ask, spread: Math.round(spread * 100) / 100, spread_bps: Math.round(spread_bps * 10) / 10, mm_inventory: Math.trunc(-quote.strike * 10), inventory_risk_status: risk_status, adverse_selection_warning: adverse };
}

