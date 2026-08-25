import type { FlowSummary, MarketNode, OptionQuote } from "../schemas";

export function compute_flow_summary(node: MarketNode, quotes: OptionQuote[], campaign_id: string): FlowSummary {
  const ticker = campaign_id === "r1" ? "NVDA" : "SPX";
  const bar_vol = node.underlying_bar.volume || 50000000;
  let call_vol = quotes.filter((quote) => quote.type === "call").reduce((sum, quote) => sum + (quote.volume || 0), 0);
  let put_vol = quotes.filter((quote) => quote.type === "put").reduce((sum, quote) => sum + (quote.volume || 0), 0);
  let sweeps: number;
  let shock: boolean;
  let flow_source: "DERIVED_HEURISTIC" | "DERIVED_REAL_INPUTS";
  let sweeps_source: "SIMULATED" | "DERIVED_REAL_INPUTS";
  let shock_source: "SIMULATED" | "DERIVED_REAL_INPUTS";
  if (call_vol === 0 && put_vol === 0) {
    const base_options_vol = Math.floor(bar_vol * 0.04);
    const vix_factor = (node.vix?.close ?? 20) / 20;
    if (node.date.includes("01-27") || node.date.includes("01-28")) {
      call_vol = Math.floor(base_options_vol * 0.45 * vix_factor);
      put_vol = Math.floor(base_options_vol * 0.85 * vix_factor);
      sweeps = 34;
      shock = true;
    } else {
      call_vol = Math.floor(base_options_vol * 0.65 * vix_factor);
      put_vol = Math.floor(base_options_vol * 0.40 * vix_factor);
      sweeps = 12;
      shock = false;
    }
    flow_source = "DERIVED_HEURISTIC";
    sweeps_source = "SIMULATED";
    shock_source = "SIMULATED";
  } else {
    sweeps = Math.max(5, Math.floor((call_vol + put_vol) / 10000));
    shock = call_vol + put_vol > 500000;
    flow_source = "DERIVED_REAL_INPUTS";
    sweeps_source = "DERIVED_REAL_INPUTS";
    shock_source = "DERIVED_REAL_INPUTS";
  }
  const pcr = Math.round((put_vol / Math.max(1, call_vol)) * 100) / 100;
  const rel_vol = Math.round(((call_vol + put_vol) / Math.max(1, bar_vol * 0.03)) * 100) / 100;
  const etf_flow_est = Math.round((bar_vol - 50000000) * 0.35);
  return {
    ticker,
    date: node.date,
    call_volume: call_vol,
    put_volume: put_vol,
    put_call_ratio: pcr,
    open_interest_change: Math.floor((call_vol + put_vol) * 0.15),
    large_sweep_count: sweeps,
    relative_options_vol: rel_vol,
    volume_shock_detected: shock,
    block_trade_activity: sweeps > 25 ? "HIGH" : "MODERATE",
    etf_flow_estimate_usd: etf_flow_est,
    etf_flow_source_type: "DERIVED_HEURISTIC",
    put_call_ratio_source_type: flow_source,
    relative_options_vol_source_type: flow_source,
    large_sweep_count_source_type: sweeps_source,
    volume_shock_source_type: shock_source,
    open_interest_change_source_type: "SIMULATED",
    source_type: flow_source,
  };
}

