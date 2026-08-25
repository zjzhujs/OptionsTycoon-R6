import type { AccountType, Greeks, MarketNode, OptionQuote, OptionType, Position } from "../schemas";

export const SHARE_INITIAL_MARGIN_PCT = 0.5;
export const SHARE_MAINTENANCE_MARGIN_PCT = 0.25;
export const PUT_MARGIN_BASE_PCT = 0.2;
export const PUT_MARGIN_OTM_CREDIT_PCT = 1.0;
export const PUT_MARGIN_FLOOR_PCT = 0.1;
export const GAMMA_RISK_BUFFER_PER_UNIT = 25.0;
export const VEGA_RISK_BUFFER_PER_UNIT = 5.0;
export const MARGIN_CALL_FLAG_KEY = "margin_call_active";

export function share_purchase_cash_required(price: number, qty: number, account_type: AccountType): [number, number] {
  const cost = price * qty;
  if (account_type !== "Margin") return [cost, 0];
  const cash_required = cost * SHARE_INITIAL_MARGIN_PCT;
  return [cash_required, cost - cash_required];
}

export function cash_secured_put_requirement(
  spot: number,
  strike: number,
  qty: number,
  account_type: AccountType,
  greeks?: Greeks | null,
): number {
  const notional = strike * 100 * qty;
  if (account_type !== "Margin") return notional;
  const otm_amount = Math.max(0, spot - strike) * 100 * qty;
  let base = Math.max(
    PUT_MARGIN_BASE_PCT * spot * 100 * qty - PUT_MARGIN_OTM_CREDIT_PCT * otm_amount,
    PUT_MARGIN_FLOOR_PCT * strike * 100 * qty,
  );
  if (greeks) {
    base += Math.abs(greeks.gamma) * 100 * qty * GAMMA_RISK_BUFFER_PER_UNIT;
    base += Math.abs(greeks.vega) * 100 * qty * VEGA_RISK_BUFFER_PER_UNIT;
  }
  return Math.min(base, notional);
}

export type QuoteFn = (option_type: OptionType, strike: number, expiration: string) => OptionQuote;

export function share_maintenance_requirement(shares: number, spot: number, margin_debt: number): number {
  if (margin_debt <= 0 || shares <= 0) return 0;
  return SHARE_MAINTENANCE_MARGIN_PCT * shares * spot;
}

export function shares_locked_by_covered_calls(positions: Position[]): number {
  return positions.reduce(
    (total, position) => total + (position.kind === "option" && position.short && position.type === "call" ? 100 * position.qty : 0),
    0,
  );
}

export function total_put_collateral_reserved(
  positions: Position[],
  node: MarketNode,
  account_type: AccountType,
  quote_fn: QuoteFn,
): number {
  let total = 0;
  const spot = node.underlying_bar.close;
  for (const position of positions) {
    if (position.kind !== "option" || !position.short || position.type !== "put" || position.strike == null || position.expiration == null) continue;
    const quote = quote_fn(position.type, position.strike, position.expiration);
    total += cash_secured_put_requirement(spot, position.strike, position.qty, account_type, quote.greeks);
  }
  return total;
}

export function total_margin_requirement(
  positions: Position[],
  node: MarketNode,
  account_type: AccountType,
  quote_fn: QuoteFn,
  shares = 0,
  margin_debt = 0,
  pb_haircut_multiplier = 1,
): number {
  if (account_type !== "Margin") return 0;
  const base = share_maintenance_requirement(shares, node.underlying_bar.close, margin_debt)
    + total_put_collateral_reserved(positions, node, account_type, quote_fn);
  return base * Math.max(0.5, pb_haircut_multiplier);
}

export function buying_power(cash: number, margin_requirement: number, account_type: AccountType): number {
  return account_type === "Margin" ? Math.max(0, cash - margin_requirement) : 0;
}

export function pb_haircut_multiplier(relationship_tier: string): number {
  if (relationship_tier === "TIER_1_PARTNER") return 0.85;
  if (relationship_tier === "PREFERRED") return 0.95;
  if (relationship_tier === "RESTRICTED") return 1.3;
  return 1.1;
}

export const DAILY_FINANCING_SOFR_PCT = 4.3;

export function daily_financing_cost(margin_debt: number, financing_spread_bps: number): number {
  if (margin_debt <= 0) return 0;
  const annual_rate_pct = DAILY_FINANCING_SOFR_PCT + financing_spread_bps / 100;
  return margin_debt * (annual_rate_pct / 100) / 365;
}

