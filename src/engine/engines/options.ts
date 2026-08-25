import type { Greeks, MarketNode, OptionQuote, OptionType, Provenance } from "../schemas";

export function clamp(x: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, x));
}

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

export function year_fraction(expiration: string, current_date: string): number {
  return Math.max(0, (dayNumber(expiration) - dayNumber(current_date)) / 365.25);
}

export function iv_proxy(campaign_id: string, node: MarketNode): number {
  if (campaign_id === "h1") {
    const severity = node.severity || 0.15;
    return clamp(0.18 + severity, 0.20, 0.75);
  }
  const v = node.vix?.close ?? 15;
  let shock: number;
  if (node.date === "2025-01-27") shock = 0.25;
  else if (node.date === "2025-01-28") shock = 0.15;
  else if (node.date === "2025-01-29") shock = 0.10;
  else shock = 0.06;
  return clamp(0.38 + (v - 14) * 0.014 + shock, 0.28, 1.15);
}

export const SKEW_SLOPE = 0.35;
export const SMILE_CURVATURE = 0.6;
export const SKEW_MIN_MULT = 0.55;
export const SKEW_MAX_MULT = 2.2;

export function iv_for_strike(campaign_id: string, node: MarketNode, strike: number): number {
  const base_iv = iv_proxy(campaign_id, node);
  const spot = node.underlying_bar.close;
  if (spot <= 0 || strike <= 0) return base_iv;
  const m = (strike - spot) / spot;
  return base_iv * clamp(1 - SKEW_SLOPE * m + SMILE_CURVATURE * m * m, SKEW_MIN_MULT, SKEW_MAX_MULT);
}

/**
 * Error function with a convergent power series near the origin and an
 * asymptotic erfc expansion in the tails. This avoids the ~1e-7 error of the
 * common Abramowitz-Stegun one-liner while remaining dependency-free.
 */
export function erf(x: number): number {
  if (x === 0) return 0;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  if (ax < 4) {
    let term = ax;
    let sum = term;
    for (let n = 1; n < 256; n += 1) {
      term *= -(ax * ax) * (2 * n - 1) / (n * (2 * n + 1));
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * 2.22e-16) break;
    }
    return sign * (2 / Math.sqrt(Math.PI)) * sum;
  }

  // erfc(x) = exp(-x^2)/(x*sqrt(pi)) times its alternating asymptotic series.
  let term = 1;
  let series = 1;
  for (let n = 1; n < 64; n += 1) {
    const next = -term * (2 * n - 1) / (2 * ax * ax);
    if (Math.abs(next) > Math.abs(term)) break;
    term = next;
    series += term;
    if (Math.abs(term) <= Math.abs(series) * 2.22e-16) break;
  }
  const erfc = Math.exp(-ax * ax) * series / (ax * Math.sqrt(Math.PI));
  return sign * (1 - erfc);
}

export function norm_cdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

export function norm_pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function is_call(option_type: OptionType): boolean {
  return option_type === "call";
}

export function bs_price(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  option_type: OptionType,
): number {
  if (T <= 0) return is_call(option_type) ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const rt = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * rt);
  const d2 = d1 - sigma * rt;
  if (is_call(option_type)) return S * norm_cdf(d1) - K * Math.exp(-r * T) * norm_cdf(d2);
  return K * Math.exp(-r * T) * norm_cdf(-d2) - S * norm_cdf(-d1);
}

export function compute_greeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  option_type: OptionType,
): Greeks {
  if (T <= 0) {
    const call = is_call(option_type);
    return {
      delta: call ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
    };
  }
  const rt = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * rt);
  const d2 = d1 - sigma * rt;
  const delta = is_call(option_type) ? norm_cdf(d1) : norm_cdf(d1) - 1;
  const gamma = norm_pdf(d1) / (S * sigma * rt);
  const theta_call = -(S * norm_pdf(d1) * sigma) / (2 * rt) - r * K * Math.exp(-r * T) * norm_cdf(d2);
  const theta_put = -(S * norm_pdf(d1) * sigma) / (2 * rt) + r * K * Math.exp(-r * T) * norm_cdf(-d2);
  return {
    delta,
    gamma,
    theta: (is_call(option_type) ? theta_call : theta_put) / 365,
    vega: S * norm_pdf(d1) * rt / 100,
  };
}

export function contract_key(underlying: string, option_type: OptionType, strike: number, expiration: string): string {
  return `${underlying} ${option_type.toUpperCase()} ${expiration} ${strike.toFixed(0)}`;
}

export function model_quote(
  campaign_id: string,
  node: MarketNode,
  option_type: OptionType,
  strike: number,
  expiration: string,
): OptionQuote {
  const spot = node.underlying_bar.close;
  const T = year_fraction(expiration, node.date);
  const iv = iv_for_strike(campaign_id, node, strike);
  const mid = bs_price(spot, strike, T, 0.04, iv, option_type);
  const bump = node.date === "2025-01-27" ? 0.045 : 0.015;
  const spread = Math.max(0.03, mid * (0.035 + bump));
  const underlying = campaign_id === "h1" ? "SPX" : "NVDA";
  const provenance: Provenance = {
    source_type: "ESTIMATED",
    source_name: "Black-Scholes teaching model (r=4%, IV proxy)",
    confidence: "model estimate, not a real historical bid/ask; never labeled REAL.",
  };
  return {
    contract_key: contract_key(underlying, option_type, strike, expiration),
    underlying,
    type: option_type,
    strike,
    expiration,
    bid: Math.max(0, mid - spread / 2),
    ask: mid + spread / 2,
    mid,
    iv,
    greeks: compute_greeks(spot, strike, T, 0.04, iv, option_type),
    provenance,
  };
}

function round_half_to_even(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function strikes_around(spot: number, campaign_id: string): number[] {
  const step = campaign_id === "h1" ? 50 : 5;
  const center = round_half_to_even(spot / step) * step;
  return Array.from({ length: 11 }, (_, index) => center + (index - 5) * step);
}

