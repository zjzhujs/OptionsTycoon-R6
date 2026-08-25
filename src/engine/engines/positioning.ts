import type { MarketNode, PositioningSummary } from "../schemas";

export function evaluate_positioning(node: MarketNode, campaign_id: string): PositioningSummary {
  let values: [number, string, string, number, string, string, string];
  if (node.date >= "2025-01-27") values = [88, "EXTREME", "LOW", 2.8, "SELLING", "UPWARD_SHORT_COVERING", "CROWDED_LONG_UNWIND"];
  else if (node.date >= "2025-01-24") values = [92, "HIGH", "LOW", 2.4, "LONG_MAX", "DOWNWARD_MULTIPLE_COMPRESSION", "HIGHLY_CROWDED_LONG"];
  else values = [65, "LOW", "MODERATE", 3.2, "BUYING", "UPWARD_TREND", "NORMAL_EXPANSION"];
  return {
    ticker: campaign_id === "r1" ? "NVDA" : "SPX",
    crowdedness_score: values[0], trapped_long_risk: values[1], trapped_short_risk: values[2], short_interest_pct: values[3],
    cta_exposure_regime: values[4], pain_trade_direction: values[5], regime_label: values[6],
    crowdedness_source_type: "SIMULATED", trapped_risk_source_type: "SIMULATED", source_type: "SIMULATED",
  };
}

