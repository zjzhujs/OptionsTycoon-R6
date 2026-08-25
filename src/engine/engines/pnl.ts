import type { MarketNode, PnLAttribution, Position } from "../schemas";
import { compute_greeks, iv_for_strike, year_fraction } from "./options";

function days_between(start: string, end: string): number {
  const parse = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  };
  return parse(end) - parse(start);
}

export function attribute_pnl(
  old_node: MarketNode,
  new_node: MarketNode,
  campaign_id: string,
  positions: Position[],
  quote_at_node_fn: (position: Position, node: MarketNode) => number,
): PnLAttribution {
  const d_days = days_between(old_node.date, new_node.date);
  const dS = new_node.underlying_bar.close - old_node.underlying_bar.close;
  let total_delta = 0;
  let total_theta = 0;
  let total_vega = 0;
  let total_residual = 0;
  let net = 0;
  for (const position of positions) {
    if (position.kind !== "option" || position.type == null || position.strike == null || position.expiration == null) continue;
    const old_iv = iv_for_strike(campaign_id, old_node, position.strike);
    const new_iv = iv_for_strike(campaign_id, new_node, position.strike);
    const old_greeks = compute_greeks(
      old_node.underlying_bar.close,
      position.strike,
      year_fraction(position.expiration, old_node.date),
      0.04,
      old_iv,
      position.type,
    );
    const old_px = quote_at_node_fn(position, old_node);
    const new_px = quote_at_node_fn(position, new_node);
    const mult = (position.short ? -1 : 1) * 100 * position.qty;
    const delta_c = old_greeks.delta * dS * mult;
    const theta_c = old_greeks.theta * d_days * mult;
    const vega_c = old_greeks.vega * ((new_iv - old_iv) * 100) * mult;
    const actual = (new_px - old_px) * mult;
    const residual = actual - delta_c - theta_c - vega_c;
    total_delta += delta_c;
    total_theta += theta_c;
    total_vega += vega_c;
    total_residual += residual;
    net += actual;
  }
  return { delta: total_delta, theta: total_theta, vega: total_vega, residual: total_residual, net };
}

