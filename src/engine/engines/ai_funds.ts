import type { AIFund, MarketNode } from "../schemas";
import { SeededRNG } from "../rng";

export const FUND_DEFS = [
  { id: "northstar", name: "Northstar Capital", style: "趋势跟踪、动量交易", risk_tolerance: 0.6, leverage: 1.5, information_quality: 0.55, panic_threshold: 0.7 },
  { id: "atlas_macro", name: "Atlas Macro", style: "宏观交易、利率与波动率", risk_tolerance: 0.5, leverage: 1.2, information_quality: 0.6, panic_threshold: 0.6 },
  { id: "redwood", name: "Redwood Partners", style: "价值投资、逆向操作", risk_tolerance: 0.4, leverage: 1, information_quality: 0.5, panic_threshold: 0.8 },
  { id: "helix_vol", name: "Helix Volatility", style: "波动率套利", risk_tolerance: 0.7, leverage: 2, information_quality: 0.65, panic_threshold: 0.5 },
] as const;

export function default_ai_funds(starting_aum = 20_000_000): AIFund[] {
  return FUND_DEFS.map((definition) => ({ ...definition, nav: starting_aum, aum: starting_aum, pnl: 0, max_drawdown: 0, return_pct: 0 }));
}

export function advance_ai_funds(funds: AIFund[], old_node: MarketNode, new_node: MarketNode, rng: SeededRNG): AIFund[] {
  const old_close = old_node.underlying_bar.close; const market_return = old_close ? new_node.underlying_bar.close / old_close - 1 : 0;
  for (const fund of funds) {
    const idiosyncratic = rng.next_range(-1, 1) * 0.01 * (1 - fund.information_quality);
    let raw_return = fund.risk_tolerance * fund.leverage * market_return + idiosyncratic;
    const panic_cap = fund.panic_threshold * 0.08;
    if (Math.abs(raw_return) > panic_cap) raw_return = raw_return > 0 ? panic_cap : -panic_cap;
    const previous_nav = fund.nav; const new_nav = previous_nav * (1 + raw_return);
    const drawdown_today = new_nav < previous_nav ? (new_nav - previous_nav) / previous_nav : 0;
    fund.max_drawdown = Math.min(fund.max_drawdown ?? 0, drawdown_today); fund.pnl = new_nav - fund.aum; fund.return_pct = (new_nav / fund.aum - 1) * 100; fund.nav = new_nav;
  }
  return funds;
}

export function rank_funds(player_equity: number, player_start_cash: number, ai_funds: AIFund[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [{ id: "player", name: "Your Fund", return_pct: player_start_cash ? (player_equity / player_start_cash - 1) * 100 : 0, nav: player_equity, max_drawdown: null, note: "SIMULATED ranking: your return is real portfolio math, but the other funds on this board are illustrative simulated competitors, not real hedge funds." }];
  rows.push(...ai_funds.map((fund) => ({ id: fund.id, name: fund.name, return_pct: fund.return_pct, nav: fund.nav, max_drawdown: fund.max_drawdown })));
  return rows.sort((a, b) => Number(b.return_pct) - Number(a.return_pct));
}

