/**
 * V29-UI-B — stock fundamentals / technical summary for the panel under the K-line chart.
 *
 * Design rule that drives every line here: this module NEVER invents a number. Each field
 * is returned as a `FundamentalField` carrying either a value plus its truth label, or
 * `DATA_UNAVAILABLE` plus a human-readable reason naming exactly what is missing. The panel
 * renders the reason, so a player is never left staring at a blank cell wondering whether
 * the game failed to load something.
 *
 * Why indicators are computed here rather than captured:
 * a 52-week high/low or a moving average captured from a finance site is a CURRENT value.
 * Painting today's figure onto a January scene would be look-ahead leakage, which the data
 * discipline for this project forbids. Computing from admitted REAL bars up to (and
 * including) the current game date is point-in-time by construction and auditable, so the
 * results are labeled `DERIVED_REAL_INPUTS` — real observations, derived arithmetic.
 *
 * Bars supplied by the caller must already be filtered to the current game date. This module
 * additionally defends against future rows in case a caller passes a full history.
 */
import type { SourceType } from '../schemas';
import type { AnalystConsensus } from './analyst_simulation';

/**
 * Structural input shapes. Deliberately NOT imported from `../schemas` or `../types`: those
 * two declare their own `MarketNode`, and callers hold one or the other. Accepting the
 * minimal shape this module actually reads keeps it usable from both without a cast.
 */
export interface FundamentalsBar {
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
}

export interface FundamentalsNode {
  date: string;
  underlying_bar: FundamentalsBar;
}

export interface FundamentalField<T = number> {
  value: T | null;
  /** Truth label for this specific field. Never a blanket label for the whole panel. */
  source_type: SourceType;
  /** Populated only when value is null. Names the missing input, not a generic apology. */
  unavailable_reason?: string;
  /** How many bars backed this figure, when it was computed from bars. */
  sample_size?: number;
}

export interface TechnicalSummary {
  as_of_date: string;
  last_close: FundamentalField;
  change_pct: FundamentalField;
  /** Highest high (or close, when a bar has no high) over the trailing 52 weeks. */
  week52_high: FundamentalField;
  week52_low: FundamentalField;
  /** Where the last close sits inside the 52-week band, 0..100. */
  week52_position_pct: FundamentalField;
  ma20: FundamentalField;
  ma50: FundamentalField;
  ma200: FundamentalField;
  /** Bars actually available at or before as_of_date. Drives every "not enough data" note. */
  available_bars: number;
}

export interface CompanyProfile {
  ticker: string;
  name: FundamentalField<string>;
  sector: FundamentalField<string>;
  description: FundamentalField<string>;
}

export interface ValuationSummary {
  pe_ratio: FundamentalField;
  eps_ttm: FundamentalField;
  analyst_rating: FundamentalField<string>;
}

export interface FundamentalsSnapshot {
  ticker: string;
  technical: TechnicalSummary;
  /** 模拟卖方共识的完整读数，供面板展示分布、目标价与反指警告。null = 样本不足。 */
  analyst: AnalystConsensus | null;
  /** Which bar series backed the indicators, so the panel can state it rather than imply it. */
  history_source: { used: boolean; name: string };
  profile: CompanyProfile;
  valuation: ValuationSummary;
}

const TRADING_DAYS_52W = 252;
const MA_WINDOWS = { ma20: 20, ma50: 50, ma200: 200 } as const;

function unavailable<T = number>(reason: string): FundamentalField<T> {
  return { value: null, source_type: 'DATA_UNAVAILABLE', unavailable_reason: reason };
}

function derived(value: number, sample_size: number): FundamentalField {
  return { value, source_type: 'DERIVED_REAL_INPUTS', sample_size };
}

/**
 * Bars at or before `asOfDate`, oldest first. Rows dated after the current game date are
 * dropped even if the caller handed us the whole campaign — no indicator may be computed
 * from a bar the player has not reached.
 */
export function barsUpTo(nodes: FundamentalsNode[], asOfDate: string): FundamentalsBar[] {
  return nodes
    .filter((n) => n.date <= asOfDate)
    .map((n) => n.underlying_bar)
    .filter((b): b is FundamentalsBar => Boolean(b) && typeof b.close === 'number' && Number.isFinite(b.close))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function movingAverage(bars: FundamentalsBar[], window: number, label: string): FundamentalField {
  if (bars.length < window) {
    return unavailable(
      `${label} 需 ${window} 根日线，当前仅 ${bars.length} 根。缺少历史数据包。`
    );
  }
  const slice = bars.slice(-window);
  const sum = slice.reduce((acc, b) => acc + b.close, 0);
  return derived(sum / window, window);
}

/**
 * 52-week extremes. Uses each bar's high/low when present and falls back to close when a bar
 * is close-only (the h1 nodes are `point_only`). The fallback is reported through
 * `sample_size` and the panel's provenance note rather than hidden, because a close-only
 * series systematically understates the true intraday range.
 */
function week52Extremes(bars: FundamentalsBar[]): { high: FundamentalField; low: FundamentalField } {
  if (bars.length < TRADING_DAYS_52W) {
    const reason =
      `52 周高低需约 ${TRADING_DAYS_52W} 根日线，当前仅 ${bars.length} 根。` +
      `未收录足够历史行情，不估算。`;
    return { high: unavailable(reason), low: unavailable(reason) };
  }
  const slice = bars.slice(-TRADING_DAYS_52W);
  let high = -Infinity;
  let low = Infinity;
  for (const b of slice) {
    const hi = typeof b.high === 'number' && Number.isFinite(b.high) ? b.high : b.close;
    const lo = typeof b.low === 'number' && Number.isFinite(b.low) ? b.low : b.close;
    if (hi > high) high = hi;
    if (lo < low) low = lo;
  }
  return { high: derived(high, slice.length), low: derived(low, slice.length) };
}

export function computeTechnicalSummary(nodes: FundamentalsNode[], asOfDate: string): TechnicalSummary {
  return computeTechnicalSummaryFromBars(barsUpTo(nodes, asOfDate), asOfDate);
}

/**
 * Same computation from a bar series that is already filtered and sorted — the shape an
 * admitted daily-history pack provides. Re-filters against `asOfDate` anyway: a history pack
 * spans the whole capture range, so trusting the caller to have trimmed it would put the
 * no-look-ahead guarantee in someone else's hands.
 */
export function computeTechnicalSummaryFromBars(
  inputBars: FundamentalsBar[],
  asOfDate: string
): TechnicalSummary {
  const bars = inputBars
    .filter((b) => b && b.date <= asOfDate && typeof b.close === 'number' && Number.isFinite(b.close))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = bars.length;

  if (n === 0) {
    const none = '当前日期前无真实日线。';
    return {
      as_of_date: asOfDate,
      last_close: unavailable(none),
      change_pct: unavailable(none),
      week52_high: unavailable(none),
      week52_low: unavailable(none),
      week52_position_pct: unavailable(none),
      ma20: unavailable(none),
      ma50: unavailable(none),
      ma200: unavailable(none),
      available_bars: 0,
    };
  }

  const last = bars[n - 1];
  const last_close: FundamentalField = { value: last.close, source_type: 'REAL', sample_size: 1 };

  const change_pct =
    n >= 2 && bars[n - 2].close !== 0
      ? derived(((last.close - bars[n - 2].close) / bars[n - 2].close) * 100, 2)
      : unavailable('需前一日线以计算涨跌幅，当前仅 1 根。');

  const { high, low } = week52Extremes(bars);

  // Only meaningful when both extremes exist and the band is non-degenerate.
  const week52_position_pct =
    high.value != null && low.value != null && high.value > low.value
      ? derived(((last.close - low.value) / (high.value - low.value)) * 100, TRADING_DAYS_52W)
      : unavailable('52 周区间不可用，无法定位。');

  return {
    as_of_date: asOfDate,
    last_close,
    change_pct,
    week52_high: high,
    week52_low: low,
    week52_position_pct,
    ma20: movingAverage(bars, MA_WINDOWS.ma20, '20 日均线'),
    ma50: movingAverage(bars, MA_WINDOWS.ma50, '50 日均线'),
    ma200: movingAverage(bars, MA_WINDOWS.ma200, '200 日均线'),
    available_bars: n,
  };
}

/**
 * Profile and valuation have no local source yet. They are deliberately returned as explicit
 * DATA_UNAVAILABLE fields rather than omitted, so the panel can lay out the full
 * finance-site format and name the specific missing pack in each empty cell.
 *
 * When a capture batch lands, replace these bodies with a lookup into the admitted pack and
 * keep the same field shape — the panel needs no change.
 */
const NO_PROFILE_PACK = '未收录公司简介包。离线运行，不联网补齐。';
const NO_VALUATION_PACK = '未收录 point-in-time 估值数据。拒绝前视泄露，留空。';
const NO_RATING_PACK = '暂无真实分析师评级。剧情文案已标 SIMULATED，非真实评级。';

/** Shape supplied by the admitted SEC pack; kept structural so the engine does no I/O. */
export interface SecProfileInput {
  sec_entity_name?: string;
  sic_description?: string;
  exchanges?: string[];
  state_of_incorporation?: string;
  filer_category?: string;
  sec_status?: string;
  unavailable_reason?: string;
}

export interface SecValuationInput {
  eps_ttm?: number | null;
  pe?: number | null;
  status?: string;
  reason?: string;
}

export function buildCompanyProfile(
  ticker: string,
  name?: string,
  sector?: string,
  sec?: SecProfileInput | null
): CompanyProfile {
  // SEC's official issuer name and SIC classification outrank the bundled table when present:
  // they are the filed record, not a convenience label.
  const secName = sec?.sec_status === 'REAL_PRIMARY' ? sec.sec_entity_name : undefined;
  const secSic = sec?.sec_status === 'REAL_PRIMARY' ? sec.sic_description : undefined;

  // The "description" is deliberately assembled from filed facts (SIC industry, exchange,
  // state of incorporation, filer category) rather than written prose. Nothing here is
  // authored copy about what the company does.
  //
  // ETF series carry a real SEC record but no SIC industry — the filing entity is the trust,
  // not an operating business. That is a meaningful fact about the instrument, so it is stated
  // rather than collapsed into "no data".
  let description: FundamentalField<string>;
  const real = sec?.sec_status === 'REAL_PRIMARY';
  const parts: string[] = [];
  if (real) {
    if (secSic) parts.push(`SIC 行业：${secSic}`);
    else if (sec?.sec_entity_name) parts.push(`申报主体：${sec.sec_entity_name}（基金信托，无行业分类）`);
    if (sec?.exchanges?.length) parts.push(`上市交易所：${sec.exchanges.join(' / ')}`);
    if (sec?.state_of_incorporation) parts.push(`注册地：${sec.state_of_incorporation}`);
    if (sec?.filer_category) parts.push(`申报人类别：${sec.filer_category}`);
  }
  if (parts.length > 0) {
    description = { value: parts.join(' · '), source_type: 'REAL_PRIMARY', sample_size: 1 };
  } else {
    description = unavailable<string>(
      sec?.unavailable_reason
        ? `${sec.unavailable_reason}（SEC 官方主体缺失，不展示业务描述）`
        : NO_PROFILE_PACK
    );
  }

  return {
    ticker,
    name: secName
      ? { value: secName, source_type: 'REAL_PRIMARY', sample_size: 1 }
      : name
        ? { value: name, source_type: 'REAL', sample_size: 1 }
        : unavailable<string>(NO_PROFILE_PACK),
    sector: secSic
      ? { value: secSic, source_type: 'REAL_PRIMARY', sample_size: 1 }
      : sector
        ? { value: sector, source_type: 'REAL', sample_size: 1 }
        : unavailable<string>(NO_PROFILE_PACK),
    description,
  };
}

/**
 * The analyst field is the one place in this panel that carries a SIMULATED value rather than
 * a gap. That is a deliberate product decision, not a slip: no free point-in-time rating source
 * exists (checked independently by three agents), so instead of an empty cell the game runs a
 * modelled sell-side consensus — and models it with the real profession's biases, so it is
 * wrong at turning points. It is labelled SIMULATED everywhere it appears.
 */
export function buildValuationSummary(
  v?: SecValuationInput | null,
  analyst?: { label: string; score: number; count: number } | null
): ValuationSummary {
  const rating: FundamentalField<string> = analyst
    ? {
        value: `${analyst.label}（共识 ${analyst.score.toFixed(2)} · ${analyst.count} 家覆盖）`,
        source_type: 'SIMULATED',
        sample_size: analyst.count,
      }
    : unavailable<string>(NO_RATING_PACK);

  // No entry at all, or an entry that explicitly says the figure does not exist for this
  // instrument (ETFs file no EPS), both surface as DATA_UNAVAILABLE with the stated reason.
  if (!v || v.eps_ttm == null) {
    const reason = v?.reason ?? NO_VALUATION_PACK;
    return {
      pe_ratio: unavailable(reason),
      eps_ttm: unavailable(reason),
      analyst_rating: rating,
    };
  }
  return {
    // EPS is a filed figure; P/E is arithmetic over that figure and an admitted close.
    eps_ttm: { value: v.eps_ttm, source_type: 'REAL_PRIMARY', sample_size: 4 },
    pe_ratio:
      v.pe != null
        ? { value: v.pe, source_type: 'DERIVED_REAL_INPUTS', sample_size: 4 }
        : unavailable(v.reason ?? 'EPS ≤ 0，不显示负 P/E。'),
    analyst_rating: rating,
  };
}

export function buildFundamentalsSnapshot(
  ticker: string,
  nodes: FundamentalsNode[],
  asOfDate: string,
  opts: {
    name?: string;
    sector?: string;
    /**
     * Admitted continuous daily history for this ticker. When supplied and non-empty it
     * REPLACES the campaign nodes as the indicator input — the campaign timeline is only 7-10
     * trading days, far too short for a 52-week window. Nodes remain the fallback so a build
     * with no captured pack still shows the honest short-series result.
     */
    historyBars?: FundamentalsBar[];
    /** Where the history came from, for the panel's provenance line. */
    historySourceName?: string;
    /** Admitted SEC issuer profile for this ticker, when the pack carries one. */
    secProfile?: SecProfileInput | null;
    /** Admitted point-in-time valuation for this ticker AT asOfDate, not the latest. */
    secValuation?: SecValuationInput | null;
    /** 模拟卖方共识（SIMULATED）。由调用方传入，引擎本身不做 I/O。 */
    analystConsensus?: AnalystConsensus | null;
  } = {}
): FundamentalsSnapshot {
  const useHistory = Boolean(opts.historyBars && opts.historyBars.length > 0);

  let technical: TechnicalSummary;
  if (useHistory) {
    technical = computeTechnicalSummaryFromBars(opts.historyBars as FundamentalsBar[], asOfDate);
    // The campaign node is the immutable settlement authority for THIS trading day — it is
    // what the chart plots and what positions mark against. A history pack may carry a
    // slightly different close for the same date (different provider, different adjustment),
    // and letting it win here would put a price on screen that contradicts the chart above.
    // So the long window comes from the pack, but the spot figures come from the campaign.
    const campaign = computeTechnicalSummary(nodes, asOfDate);
    if (campaign.last_close.value != null) {
      technical.last_close = campaign.last_close;
      technical.change_pct = campaign.change_pct;
      // Recompute band position against the authoritative close, not the pack's.
      const hi = technical.week52_high.value;
      const lo = technical.week52_low.value;
      technical.week52_position_pct =
        hi != null && lo != null && hi > lo
          ? derived(((campaign.last_close.value - lo) / (hi - lo)) * 100, TRADING_DAYS_52W)
          : technical.week52_position_pct;
    }
  } else {
    technical = computeTechnicalSummary(nodes, asOfDate);
  }

  return {
    ticker,
    technical,
    history_source: useHistory
      ? { used: true, name: opts.historySourceName ?? '已准入本地日线包' }
      : { used: false, name: '战役节点（仅 7-10 个交易日，不足 52 周）' },
    analyst: opts.analystConsensus ?? null,
    profile: buildCompanyProfile(ticker, opts.name, opts.sector, opts.secProfile),
    valuation: buildValuationSummary(
      opts.secValuation,
      opts.analystConsensus
        ? {
            label: opts.analystConsensus.consensus_label,
            score: opts.analystConsensus.consensus_score,
            count: opts.analystConsensus.analyst_count,
          }
        : null
    ),
  };
}
