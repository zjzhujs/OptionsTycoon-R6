import type { MarketNode, RetailSentimentSnapshot } from "../schemas";

export function evaluate_retail_sentiment(node: MarketNode, campaign_id: string): RetailSentimentSnapshot {
  const post_shock = node.date >= "2025-01-27";
  const euphoria = node.date >= "2025-01-24" && !post_shock;
  const values = post_shock
    ? [24, 76, 18, 5, true, 98, 2, 65, "PANIC_CAPITULATION"] as const
    : euphoria
      ? [82, 18, 85, 78, false, 85, 80, 45, "EXTREME_EUPHORIA"] as const
      : [68, 32, 62, 40, false, 60, 45, 30, "BULLISH_OPTIMISM"] as const;
  return {
    ticker: campaign_id === "r1" ? "NVDA" : "SPX", date: node.date,
    bullish_pct: values[0], bearish_pct: values[1], fear_greed_index: values[2], euphoria_score: values[3],
    capitulation_flag: values[4], attention_heat: values[5], fomo_velocity: values[6], meme_intensity: values[7],
    sentiment_regime: values[8], source_type: "DERIVED_HEURISTIC",
  };
}

