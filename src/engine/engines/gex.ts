import type { GexPoint, GexSummary, MarketNode, OptionQuote } from "../schemas";

export function compute_gex_profile(
  node: MarketNode,
  quotes: OptionQuote[],
  multiplier = 100,
  has_real_oi = false,
): GexSummary {
  const spot = node.underlying_bar.close;
  if (spot <= 0 || quotes.length === 0) {
    return {
      as_of_date: node.date,
      spot,
      warning: "No quotes available to calculate GEX profile.",
      provenance: { source_type: "DATA_UNAVAILABLE", source_name: "GEX Calculator", confidence: "No quotes available." },
    };
  }
  const by_strike = new Map<number, { raw_gamma: number; call_raw_gamma: number; put_raw_gamma: number; heuristic_gex: number; total_oi: number }>();
  for (const quote of quotes) {
    const data = by_strike.get(quote.strike) ?? { raw_gamma: 0, call_raw_gamma: 0, put_raw_gamma: 0, heuristic_gex: 0, total_oi: 0 };
    const gamma = quote.greeks?.gamma ?? 0;
    const moneyness = Math.abs(quote.strike - spot) / spot;
    const oi = quote.open_interest != null ? quote.open_interest : Math.max(50, Math.floor(1500 * (1 - Math.min(0.9, moneyness * 3))));
    const raw_g = Math.abs(gamma) * oi * multiplier * spot ** 2 * 0.01;
    const signed = quote.type === "call" ? raw_g : -raw_g;
    data.raw_gamma += raw_g;
    data.total_oi += oi;
    data.heuristic_gex += signed;
    if (quote.type === "call") data.call_raw_gamma += raw_g;
    else data.put_raw_gamma += raw_g;
    by_strike.set(quote.strike, data);
  }
  const points: GexPoint[] = [...by_strike.entries()].sort(([a], [b]) => a - b).map(([strike, data]) => ({
    strike,
    raw_gamma_1pct_usd: data.raw_gamma,
    call_raw_gamma: data.call_raw_gamma,
    put_raw_gamma: data.put_raw_gamma,
    heuristic_gex_1pct_usd: data.heuristic_gex,
    total_oi: data.total_oi,
    dealer_gex_1pct_usd: null,
  }));
  const maxBy = (items: GexPoint[], key: (point: GexPoint) => number): number | null => items.length ? items.reduce((a, b) => key(a) >= key(b) ? a : b).strike : null;
  const calls = points.filter((point) => point.call_raw_gamma > 0);
  const puts = points.filter((point) => point.put_raw_gamma > 0);
  return {
    as_of_date: node.date,
    spot,
    gamma_concentration_wall: maxBy(points, (point) => point.raw_gamma_1pct_usd),
    heuristic_gamma_wall: maxBy(points, (point) => Math.abs(point.heuristic_gex_1pct_usd)),
    call_wall_raw_gamma: maxBy(calls, (point) => point.call_raw_gamma),
    put_wall_raw_gamma: maxBy(puts, (point) => point.put_raw_gamma),
    warning: has_real_oi
      ? undefined
      : "Heuristic GEX is NOT actual dealer inventory; it is a model-implied profile without signed open-interest data.",
    points,
    provenance: {
      source_type: has_real_oi ? "DERIVED_REAL_INPUTS" : "DERIVED_HEURISTIC",
      source_name: "Options Tycoon GEX / Gamma Wall Engine",
      confidence: "Calculated from historical option chains and Black-Scholes Greeks. Heuristic GEX assumes calls positive, puts negative; not signed dealer inventory.",
    },
  };
}
