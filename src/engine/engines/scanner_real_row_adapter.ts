/**
 * V28 Scanner admission boundary.
 *
 * A source row can be historically real and still be unsuitable for product
 * integration until its price basis and provenance have been admitted. This
 * adapter intentionally exposes only rows that are explicitly production
 * ready. The H1 foundation rows remain outside this adapter until Batch17
 * admission is complete.
 */
import * as data_loader from "../data_loader";
import type { SourceType } from "../schemas";

export type ScannerDataStatus =
  | "ADMITTED_REAL_DAILY"
  | "PARTIAL_REAL_PRICE"
  | "DERIVED_FALLBACK";

export interface ScannerDailyAdmission {
  campaign_id: string;
  ticker: string;
  date: string;
  row: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  source_type: Extract<SourceType, "REAL">;
  source_name: string;
  production_ready: true;
  admission_reason: string;
}

/**
 * Return a full daily OHLCV row only when the row is explicitly admitted.
 * R1 NVDA is already the canonical V27 market source. H1 rows are deliberately
 * absent here: their source-basis map is still pending independent admission.
 */
export function resolve_scanner_daily_admission(
  campaign_id: string,
  date: string,
  ticker: string,
): ScannerDailyAdmission | null {
  if (campaign_id !== "r1" || ticker !== "NVDA") return null;

  const node = data_loader.load_r1_2025().find((candidate) => candidate.date === date);
  const bar = node?.underlying_bar;
  if (!node || !bar || bar.open == null || bar.high == null || bar.low == null || bar.volume == null) {
    return null;
  }

  return {
    campaign_id,
    ticker,
    date,
    row: {
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    },
    source_type: "REAL",
    source_name: `LOCAL:r1_2025_market.json#${date}.nvda`,
    production_ready: true,
    admission_reason: "V27 canonical R1 daily settlement source; no H1 rows admitted yet.",
  };
}

export function fallback_scanner_lineage(): {
  source_type: Extract<SourceType, "DERIVED_HEURISTIC">;
  source_name: string;
  data_status: Extract<ScannerDataStatus, "DERIVED_FALLBACK">;
} {
  return {
    source_type: "DERIVED_HEURISTIC",
    source_name: "V28 offline deterministic scanner fallback; no admitted daily row",
    data_status: "DERIVED_FALLBACK",
  };
}

export function partial_real_price_lineage(date: string): {
  source_type: Extract<SourceType, "REAL">;
  source_name: string;
  data_status: Extract<ScannerDataStatus, "PARTIAL_REAL_PRICE">;
} {
  return {
    source_type: "REAL",
    source_name: `LOCAL:r1_2025_market.json#${date}.qqq_close`,
    data_status: "PARTIAL_REAL_PRICE",
  };
}
