import type { CarryDataCoverageRule, SourceType } from '../schemas';
import r1ManifestRaw from '../data/content_packs/r1_intraday_v1/manifest.json';

export interface OfflineIntradayBar {
  ts: string;
  label_et: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

export interface OfflineIntradayMaterialWindow {
  window_id: string;
  reveal_ts: string;
  reveal_time_label: string;
  visible_bar_count: number;
  headline: string;
  detail: string;
}

export interface OfflineAggregateEvidence {
  mode: 'AGGREGATE_EVIDENCE';
  truth_label: 'REAL_AGGREGATE_EVIDENCE';
  metrics: Record<string, number | null>;
  coverage: Record<string, 'VERIFIED' | 'PARTIAL' | 'MISSING'>;
  source_refs: string[];
  note: string;
  iv_crush_scoring_policy?: 'FULL_CHAIN' | 'DOWNGRADED_PARTIAL_CHAIN';
}

export interface OfflineIntradaySession {
  session_id: string;
  ticker: string;
  date: string;
  timezone: string;
  source_timestamp_timezone: string;
  interval_label: string;
  source_type: SourceType;
  source_name: string;
  source_url_or_identifier?: string | null;
  runtime_network_required: false;
  source_price_basis?: string;
  source_previous_close?: number;
  normalization?: {
    method: 'MULTIPLY_TO_CANONICAL_DAILY_BASIS';
    factor: number;
    source_anchor: { date: string; close: number };
    canonical_anchor: { date: string; close: number };
    note?: string;
  };
  previous_close: number | null;
  daily_cross_check?: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number | null;
  };
  bars: OfflineIntradayBar[];
  material_windows: OfflineIntradayMaterialWindow[];
  integrity_note?: string;
  truth_label?: 'REAL_INTRADAY' | 'REAL_DAILY' | 'PROXY' | 'SIMULATED';
  usage?: string;
  aggregate_evidence?: OfflineAggregateEvidence;
}

export interface OfflineContentPackManifest {
  pack_id: string;
  scenario_id: string;
  version: number;
  generated_at: string;
  runtime_network_required: false;
  truth_label: 'REAL_INTRADAY' | 'REAL_DAILY' | 'PROXY';
  included_sessions: Array<{
    session_id: string;
    ticker: string;
    date: string;
    granularity: string;
    file: string;
    usage?: string;
    material_windows?: number;
    bar_count?: number;
  }>;
  provenance: Array<{
    source_name: string;
    source_url_or_identifier?: string | null;
    source_type: SourceType;
    note: string;
    sha256?: string;
  }>;
  files_sha256?: Record<string, string>;
  distribution_note?: string;
  data_mode?: 'DAILY' | 'INTRADAY' | 'INTRADAY_PLUS_AGGREGATE_EVIDENCE' | 'PROXY';
  carry_data_coverage?: CarryDataCoverageRule[];
  evidence_policy?: {
    mode: 'AGGREGATE_EVIDENCE';
    forbidden_inference_fields: string[];
    notice: string;
  };
}

const r1Manifest = r1ManifestRaw as OfflineContentPackManifest;

/**
 * 会话文件改为**目录发现**，不再逐个静态 import（2026-08-18 claude）。
 *
 * 原来这里写死了三行 `import r1Jan24Raw from '...nvda_2025-01-24.json'`。
 * 那种写法有两个已经真实发生过的后果：
 *
 *  1. 其中两个文件一度从源码树里消失，而 import 还在——整个模块编译不过，
 *     于是它被迫成为死代码，`VALIDATION_V27` 却还声称它验证通过。
 *  2. 反过来也一样糟：往目录里放了新包（补齐的 4 天 NVDA、7 天 QQQ），
 *     manifest 登记了 14 个 session，代码却只认那三个——**登记与实体不符**，
 *     而且不会报错，只会安静地少数据。
 *
 * 用 import.meta.glob 之后，目录即事实：放进去就加载，删掉就没有，
 * manifest 与磁盘再也不会各说各话。这与 daily_history_loader 的做法一致。
 */
const R1_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/r1_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const r1Sessions: OfflineIntradaySession[] = Object.entries(R1_SESSION_MODULES)
  .filter(([path]) => {
    const f = path.split('/').pop() ?? '';
    // manifest 与覆盖率账本不是会话文件
    return f !== 'manifest.json' && !f.startsWith('R1_MARKET_DATA_COVERAGE');
  })
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

function assertFiniteBar(bar: OfflineIntradayBar, index: number, session: OfflineIntradaySession): void {
  for (const [key, value] of Object.entries({ open: bar.open, high: bar.high, low: bar.low, close: bar.close })) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${session.session_id} bar ${index} has invalid ${key}.`);
  }
  if (bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close) || bar.high < bar.low) {
    throw new Error(`${session.session_id} bar ${index} has impossible OHLC ordering.`);
  }
  if (!Number.isFinite(Date.parse(bar.ts))) throw new Error(`${session.session_id} bar ${index} has invalid timestamp.`);
}

export function normalizedIntradayBars(session: OfflineIntradaySession): OfflineIntradayBar[] {
  const factor = session.normalization?.factor ?? 1;
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`${session.session_id} has invalid normalization factor.`);
  return session.bars.map((bar) => ({
    ...bar,
    open: bar.open * factor,
    high: bar.high * factor,
    low: bar.low * factor,
    close: bar.close * factor,
  }));
}

export function validateOfflineIntradaySession(session: OfflineIntradaySession): void {
  if (session.runtime_network_required !== false) throw new Error(`${session.session_id} violates offline runtime rule.`);
  if (!session.bars.length) throw new Error(`${session.session_id} has no intraday bars.`);
  session.bars.forEach((bar, index) => assertFiniteBar(bar, index, session));
  for (let i = 1; i < session.bars.length; i += 1) {
    if (session.bars[i - 1].ts >= session.bars[i].ts) throw new Error(`${session.session_id} bars are not strictly chronological.`);
  }
  for (const window of session.material_windows) {
    if (window.visible_bar_count < 1 || window.visible_bar_count > session.bars.length) {
      throw new Error(`${session.session_id} window ${window.window_id} has invalid visible_bar_count.`);
    }
    const lastVisible = session.bars[window.visible_bar_count - 1];
    const nextHidden = session.bars[window.visible_bar_count];
    if (Date.parse(lastVisible.ts) >= Date.parse(window.reveal_ts)) {
      throw new Error(`${session.session_id} window ${window.window_id} reveals before its visible bar has completed.`);
    }
    if (nextHidden && Date.parse(nextHidden.ts) < Date.parse(window.reveal_ts)) {
      throw new Error(`${session.session_id} window ${window.window_id} hides a bar that should already be visible.`);
    }
  }

  const daily = session.daily_cross_check;
  if (daily) {
    const normalized = normalizedIntradayBars(session);
    const sessionHigh = Math.max(...normalized.map((bar) => bar.high));
    const sessionLow = Math.min(...normalized.map((bar) => bar.low));
    if (Math.abs(sessionHigh - daily.high) > 0.05) throw new Error(`${session.session_id} normalized high does not match daily cross-check.`);
    if (Math.abs(sessionLow - daily.low) > 0.05) throw new Error(`${session.session_id} normalized low does not match daily cross-check.`);
    if (Math.abs(normalized[0].open - daily.open) > 0.05) throw new Error(`${session.session_id} normalized open does not match daily cross-check.`);
    const factor = session.normalization?.factor ?? 1;
    if (session.normalization && Math.abs(session.normalization.source_anchor.close * factor - session.normalization.canonical_anchor.close) > 0.011) {
      throw new Error(`${session.session_id} normalization anchor is inconsistent.`);
    }
  }
}

/**
 * 战役 → 数据包注册表（2026-08-18 claude）
 *
 * 原来 r1 是硬编码的：`campaignId === 'r1' ? r1Manifest : null`。
 * H1 战役有自己的 30 个 session（SPX / NASDAQ / VIX × 10 个事件日），
 * 挂不进去。改成表驱动之后，加一个战役只需要在这里加一行。
 *
 * H1 的 VIX 有两处与股票不同，都写在它自己的 integrity_note 里：
 * 成交量恒为 0（指数没有成交量，那是事实不是缺失），
 * 网格是整点而非 14:30 起步（未做对齐——硬对齐会改掉真实时间戳）。
 */
const H1_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/h1_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const h1Entries = Object.entries(H1_SESSION_MODULES);
const h1ManifestRaw = h1Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const h1Sessions: OfflineIntradaySession[] = h1Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));


const C4_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/c4_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const c4Entries = Object.entries(C4_SESSION_MODULES);
const c4ManifestRaw = c4Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const c4Sessions: OfflineIntradaySession[] = c4Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));


const C6_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/c6_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const c6Entries = Object.entries(C6_SESSION_MODULES);
const c6ManifestRaw = c6Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const c6Sessions: OfflineIntradaySession[] = c6Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

const C7_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/c7_daily_v1/*.json',
  { eager: true, import: 'default' },
);

const c7Entries = Object.entries(C7_SESSION_MODULES);
const c7ManifestRaw = c7Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const c7Sessions: OfflineIntradaySession[] = c7Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => (a.date === b.date ? a.ticker.localeCompare(b.ticker) : a.date.localeCompare(b.date)));

const C8_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/c8_daily_v1/*.json',
  { eager: true, import: 'default' },
);

const c8Entries = Object.entries(C8_SESSION_MODULES);
const c8ManifestRaw = c8Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const c8Sessions: OfflineIntradaySession[] = c8Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => a.date.localeCompare(b.date));

const C5_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/c5_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const c5Entries = Object.entries(C5_SESSION_MODULES);
const c5ManifestRaw = c5Entries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const c5Sessions: OfflineIntradaySession[] = c5Entries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => a.date.localeCompare(b.date));

const GME_SESSION_MODULES = import.meta.glob<Record<string, unknown>>(
  '../data/content_packs/gme_intraday_v1/*.json',
  { eager: true, import: 'default' },
);

const gmeEntries = Object.entries(GME_SESSION_MODULES);
const gmeManifestRaw = gmeEntries.find(([p]) => p.endsWith('/manifest.json'))?.[1];

const gmeSessions: OfflineIntradaySession[] = gmeEntries
  .filter(([p]) => !p.endsWith('/manifest.json'))
  .map(([, mod]) => mod as unknown as OfflineIntradaySession)
  .filter((s) => Array.isArray((s as { bars?: unknown }).bars))
  .sort((a, b) => a.date.localeCompare(b.date));

interface PackRegistryEntry {
  manifest: OfflineContentPackManifest | null;
  sessions: OfflineIntradaySession[];
}

const PACKS: Record<string, PackRegistryEntry> = {
  c4: {
    manifest: (c4ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: c4Sessions,
  },
  c6: {
    manifest: (c6ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: c6Sessions,
  },
  c7: {
    manifest: (c7ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: c7Sessions,
  },
  c8: {
    manifest: (c8ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: c8Sessions,
  },
  c5: {
    manifest: (c5ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: c5Sessions,
  },
  gme: {
    manifest: (gmeManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: gmeSessions,
  },
  r1: { manifest: r1Manifest, sessions: r1Sessions },
  h1: {
    manifest: (h1ManifestRaw as unknown as OfflineContentPackManifest | undefined) ?? null,
    sessions: h1Sessions,
  },
};

export function validateOfflineContentPacks(): void {
  for (const [campaignId, pack] of Object.entries(PACKS)) {
    if (!pack.manifest) continue;
    if (pack.manifest.runtime_network_required !== false) {
      throw new Error(`${campaignId}/${pack.manifest.pack_id} requires runtime networking.`);
    }
    for (const session of pack.sessions) validateOfflineIntradaySession(session);
  }
}

export function getOfflineContentPackManifest(campaignId: string): OfflineContentPackManifest | null {
  return PACKS[campaignId]?.manifest ?? null;
}

export function getOfflineIntradaySession(campaignId: string, date: string, ticker: string): OfflineIntradaySession | null {
  const pack = PACKS[campaignId];
  if (!pack) return null;
  const session = pack.sessions.find((item) => item.date === date && item.ticker === ticker) ?? null;
  if (session) validateOfflineIntradaySession(session);
  return session ? JSON.parse(JSON.stringify(session)) as OfflineIntradaySession : null;
}

export function runtimeNetworkRequired(campaignId: string): boolean {
  return Boolean(getOfflineContentPackManifest(campaignId)?.runtime_network_required);
}

export function checkOfflineDataCoverage(
  campaignId: string,
  targetDate: string,
  requiredFields: string[],
): boolean {
  const rules = getOfflineContentPackManifest(campaignId)?.carry_data_coverage ?? [];
  if (!rules.length || !requiredFields.length) return false;
  return requiredFields.every((field) => {
    const rule = rules.find((candidate) => candidate.required_fields.includes(field));
    if (!rule || rule.status === 'MISSING') return false;
    if (rule.available_dates) return rule.available_dates.includes(targetDate);
    return targetDate >= rule.from_at && targetDate <= rule.to_at;
  });
}
