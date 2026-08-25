/**
 * V29-UI-B — optional continuous daily-history packs, used ONLY for indicator computation.
 *
 * The load-bearing distinction: a campaign's `MarketNode[]` is the PLAYABLE timeline — the
 * dates the player actually advances through. R1 has 7 of them, H1 has 10. Dropping 620 daily
 * bars into that array would turn a 7-day campaign into a 620-day one, which changes the game
 * rather than enriching it.
 *
 * So admitted daily history lives in its own series, keyed by ticker, and is consumed only by
 * the fundamentals panel to compute 52-week extremes and moving averages. The campaign
 * timeline is untouched.
 *
 * Packs are OPTIONAL by construction. `import.meta.glob` resolves to `{}` when the directory
 * holds no pack, so a build with no captured history compiles and runs exactly as before, and
 * the fundamentals panel keeps reporting DATA_UNAVAILABLE with its stated reason. Dropping an
 * admitted pack into `data/daily_history/` is the entire integration step — no code change.
 *
 * Expected pack shape (`data/daily_history/NVDA.json`):
 *
 *   {
 *     "ticker": "NVDA",
 *     "source_name": "Yahoo Finance daily",
 *     "source_url": "https://…",
 *     "batch_id": "OT-HDF-B37-20260818",
 *     "truth": "REAL",
 *     "bars": [ { "date": "2024-01-02", "open": …, "high": …, "low": …, "close": …, "volume": … } ]
 *   }
 *
 * A pack that fails validation here is DROPPED with a console warning rather than partially
 * admitted — a half-loaded price series would silently corrupt every indicator computed from it.
 */
import type { FundamentalsBar } from './engines/fundamentals';

export interface DailyHistoryPack {
  ticker: string;
  source_name?: string;
  source_url?: string | null;
  batch_id?: string;
  truth?: string;
  bars: FundamentalsBar[];
}

/** Eagerly collected so lookups stay synchronous; packs are small JSON and few in number. */
const PACK_MODULES = import.meta.glob<{ default: unknown }>('./data/daily_history/*.json', {
  eager: true,
});

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function isValidBar(b: unknown): b is FundamentalsBar {
  if (!b || typeof b !== 'object') return false;
  const r = b as Record<string, unknown>;
  if (typeof r.date !== 'string' || !DATE_RX.test(r.date)) return false;
  if (typeof r.close !== 'number' || !Number.isFinite(r.close) || r.close <= 0) return false;
  // open/high/low/volume are optional, but when present must be finite and non-negative.
  for (const k of ['open', 'high', 'low', 'volume'] as const) {
    const v = r[k];
    if (v == null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

/**
 * Rejects a pack outright on any structural problem. Order and duplicates are normalized
 * here (dedupe keeps the first occurrence) because a duplicated date would double-weight a
 * day inside a moving average.
 */
function normalizePack(raw: unknown, filename: string): DailyHistoryPack | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[daily_history] ${filename}: 不是对象，已整包丢弃`);
    return null;
  }
  const p = raw as Record<string, unknown>;
  const ticker = typeof p.ticker === 'string' ? p.ticker.toUpperCase() : '';
  if (!ticker) {
    console.warn(`[daily_history] ${filename}: 缺少 ticker 字段，已整包丢弃`);
    return null;
  }
  if (!Array.isArray(p.bars)) {
    console.warn(`[daily_history] ${filename}: bars 不是数组，已整包丢弃`);
    return null;
  }
  const bad = p.bars.filter((b) => !isValidBar(b)).length;
  if (bad > 0) {
    console.warn(
      `[daily_history] ${filename}: ${bad}/${p.bars.length} 行不合法，已整包丢弃（不做部分准入，` +
        `半截价格序列会静默污染所有由它算出的指标）`
    );
    return null;
  }
  const bars = p.bars as FundamentalsBar[];

  const seen = new Set<string>();
  const deduped: FundamentalsBar[] = [];
  let dupes = 0;
  for (const b of bars) {
    if (seen.has(b.date)) {
      dupes += 1;
      continue;
    }
    seen.add(b.date);
    deduped.push(b);
  }
  if (dupes > 0) {
    console.warn(`[daily_history] ${filename}: 去掉 ${dupes} 个重复日期（保留首次出现）`);
  }
  deduped.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    ticker,
    source_name: typeof p.source_name === 'string' ? p.source_name : undefined,
    source_url: typeof p.source_url === 'string' ? p.source_url : null,
    batch_id: typeof p.batch_id === 'string' ? p.batch_id : undefined,
    truth: typeof p.truth === 'string' ? p.truth : undefined,
    bars: deduped,
  };
}

let _cache: Map<string, DailyHistoryPack> | null = null;

function packs(): Map<string, DailyHistoryPack> {
  if (_cache) return _cache;
  const map = new Map<string, DailyHistoryPack>();
  for (const [path, mod] of Object.entries(PACK_MODULES)) {
    const filename = path.split('/').pop() ?? path;
    const pack = normalizePack((mod as { default?: unknown })?.default ?? mod, filename);
    if (pack) map.set(pack.ticker, pack);
  }
  _cache = map;
  return map;
}

/** Tickers with an admitted daily-history pack in this build. */
export function availableDailyHistoryTickers(): string[] {
  return [...packs().keys()].sort();
}

export function getDailyHistoryPack(ticker: string): DailyHistoryPack | null {
  if (!ticker) return null;
  return packs().get(ticker.toUpperCase()) ?? null;
}

/**
 * Daily bars for `ticker` at or before `asOfDate`, oldest first.
 *
 * The date filter is applied HERE as well as in the fundamentals engine. That redundancy is
 * deliberate: this pack spans the whole capture range, so an unfiltered read would hand a
 * caller bars the player has not reached. Two independent gates on look-ahead is the correct
 * amount for a series that is intentionally longer than the campaign.
 */
export function loadDailyHistory(ticker: string, asOfDate: string): FundamentalsBar[] {
  const pack = getDailyHistoryPack(ticker);
  if (!pack) return [];
  return pack.bars.filter((b) => b.date <= asOfDate);
}

/* ── SEC 基本面包（可选，与日线包同样的"丢进去就生效"约定） ─────────────── */

interface SecFundamentalsFile {
  source?: string;
  batch_id?: string;
  retrieved_at_utc?: string;
  method?: string;
  profiles?: Record<string, Record<string, unknown>>;
  valuation?: Record<string, {
    status?: string;
    reason?: string;
    by_date?: Record<string, { eps_ttm?: number; pe?: number; close?: number; status?: string; reason?: string }>;
  }>;
}

const SEC_MODULES = import.meta.glob<{ default: unknown }>('./data/fundamentals_sec.json', {
  eager: true,
});

let _sec: SecFundamentalsFile | null | undefined;

function secFile(): SecFundamentalsFile | null {
  if (_sec !== undefined) return _sec;
  const mods = Object.values(SEC_MODULES);
  const raw = mods.length ? ((mods[0] as { default?: unknown }).default ?? mods[0]) : null;
  _sec = raw && typeof raw === 'object' ? (raw as SecFundamentalsFile) : null;
  return _sec;
}

export function getSecProfile(ticker: string): Record<string, unknown> | null {
  if (!ticker) return null;
  return secFile()?.profiles?.[ticker.toUpperCase()] ?? null;
}

/**
 * Valuation AS OF a specific scene date — never "the latest".
 *
 * The pack stores one entry per game scene date, each computed only from SEC facts whose
 * `filed` date was on or before that scene date. Returning the newest entry instead would
 * hand a January scene a P/E that only became public in June, which is exactly the
 * look-ahead this pipeline exists to prevent. A date with no entry returns null, and the
 * panel renders DATA_UNAVAILABLE rather than reaching for a neighbouring date.
 */
export function getSecValuation(
  ticker: string,
  asOfDate: string
): { eps_ttm?: number | null; pe?: number | null; status?: string; reason?: string } | null {
  if (!ticker) return null;
  const row = secFile()?.valuation?.[ticker.toUpperCase()];
  if (!row) return null;
  if (!row.by_date) {
    // Instrument-level unavailability (an ETF files no EPS at all).
    return { status: row.status, reason: row.reason };
  }
  const hit = row.by_date[asOfDate];
  if (!hit) {
    return {
      status: 'DATA_UNAVAILABLE',
      reason: `本数据包只覆盖游戏内的场景日，${asOfDate} 不在其中；不取邻近日期顶替。`,
    };
  }
  return hit;
}

export function secPackMeta(): { batch_id?: string; source?: string; retrieved_at_utc?: string } | null {
  const f = secFile();
  return f ? { batch_id: f.batch_id, source: f.source, retrieved_at_utc: f.retrieved_at_utc } : null;
}

/**
 * The REAL close and day-over-day change for `ticker` on exactly `date`, or null when the
 * pack has no row for that date.
 *
 * Used by the scanner to replace an authored constant with an observed price. Deliberately
 * exact-match: if the pack has no row for that trading day, the caller must fall back to its
 * declared derived path rather than borrow the nearest day, which would put a price on a date
 * it never traded at.
 */
export function realDailyRow(
  ticker: string,
  date: string
): { close: number; change_pct: number | null; volume: number | null; source_name?: string } | null {
  const pack = getDailyHistoryPack(ticker);
  if (!pack) return null;
  const i = pack.bars.findIndex((b) => b.date === date);
  if (i < 0) return null;
  const cur = pack.bars[i];
  const prev = i > 0 ? pack.bars[i - 1] : null;
  return {
    close: cur.close,
    change_pct: prev && prev.close ? ((cur.close - prev.close) / prev.close) * 100 : null,
    volume: cur.volume ?? null,
    source_name: pack.source_name,
  };
}
