import type { CounterpartyProfile, MarketNode, ParticipantType } from "../schemas";

export function evaluate_counterparty_profile(node: MarketNode, campaign_id: string): CounterpartyProfile {
  const vix = node.vix?.close ?? 16;
  let dominant_participant: ParticipantType;
  let potential_participants: ParticipantType[];
  let dealer_inventory_bias: string;
  let retail: number;
  let institutional: number;
  let flow: string;
  if (vix > 22) {
    dominant_participant = "VOLATILITY_FUND";
    potential_participants = ["MARKET_MAKER", "CTA_MOMENTUM", "SHORT_SELLER", "RETAIL_0DTE"];
    dealer_inventory_bias = "SHORT_GAMMA"; retail = 28; institutional = 72; flow = "PUT_HEDGING_SWEEP";
  } else if (vix < 14) {
    dominant_participant = "VOL_CONTROL";
    potential_participants = ["LONG_ONLY", "RISK_PARITY", "INDEX_ETF"];
    dealer_inventory_bias = "LONG_GAMMA"; retail = 12; institutional = 88; flow = "CALL_OVERWRITING";
  } else {
    dominant_participant = "MARKET_MAKER";
    potential_participants = ["HEDGE_FUND", "LONG_ONLY", "RETAIL_0DTE", "CTA_MOMENTUM"];
    dealer_inventory_bias = "BALANCED"; retail = 18; institutional = 82; flow = "BID_BUYING";
  }
  return {
    ticker: campaign_id === "r1" ? "NVDA" : "SPX",
    dominant_participant,
    potential_participants,
    dealer_inventory_bias,
    estimated_retail_share_pct: retail,
    estimated_institutional_share_pct: institutional,
    flow_predominance: flow,
    dealer_inventory_bias_source_type: "DERIVED_HEURISTIC",
    dealer_inventory_signed_source_type: "DATA_UNAVAILABLE",
    dealer_inventory_note: "Signed dealer inventory is unavailable; this is a volatility-regime heuristic.",
    participant_share_source_type: "SIMULATED",
    source_type: "DERIVED_HEURISTIC",
  };
}

