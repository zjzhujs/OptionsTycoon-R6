/** Loads the bundled REAL data files, ported from backend/app/data_loader.py.
 * Do NOT add fabricated rows here. If a data file is missing a field, leave it
 * null / undefined, not backfilled. */
import type { Bar, CampaignMeta, Character, MacroEvent, MarketNode, Provenance } from "./schemas";
import c6_2022_raw from "./data/c6_2022_market.json";
import c4_2020_raw from "./data/c4_2020_market.json";
import gme_2021_raw from "./data/gme_2021_market.json";
import c5_2022_raw from "./data/c5_2022_market.json";
import c8_2022_2023_raw from "./data/c8_2022_2023_market.json";
import c7_2025_raw from "./data/c7_2025_market.json";
import r1_2025_raw from "./data/r1_2025_market.json";
import h1_2026_raw from "./data/h1_2026_market_nodes.json";
import events_seed_raw from "./data/events_seed.json";
import characters_raw from "./data/characters.json";
import required_universe_raw from "./data/required_market_universe.json";

interface R1Row {
  date: string;
  nvda: { o: number; h: number; l: number; c: number; v?: number };
  qqq?: number | null;
  vix?: { o: number; h: number; l: number; c: number } | null;
}

interface H1Row {
  date: string;
  underlying_bar: Bar;
  secondary_close?: number | null;
  vix?: Bar | null;
  label?: string | null;
  move_summary?: string | null;
  severity?: number | null;
  point_only?: boolean;
  truth_label?: 'HISTORICAL' | 'PROXY' | 'SIMULATED';
  provenance: Provenance;
}

interface EventRow {
  id: string;
  ts?: string | null;
  date: string;
  tag: string;
  headline: string;
  body?: string | null;
  source: string;
  url?: string | null;
}

function _prov(name: string, url: string | null, note: string, source_type: Provenance["source_type"] = "REAL"): Provenance {
  return { source_type, source_name: name, source_url_or_identifier: url ?? null, confidence: note };
}


interface C4Row {
  date: string;
  spy: { o: number; h: number; l: number; c: number; v?: number };
  tlt?: number | null;
  vix?: { c: number } | null;
  spx?: number | null;
}

let _c4_2020_cache: MarketNode[] | null = null;
export function load_c4_2020(): MarketNode[] {
  if (_c4_2020_cache) return _c4_2020_cache;
  const raw = c4_2020_raw as C4Row[];
  _c4_2020_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: { date: row.date, open: row.spy.o, high: row.spy.h, low: row.spy.l, close: row.spy.c, volume: row.spy.v ?? null },
    secondary_close: row.tlt ?? null,
    vix: row.vix ? { date: row.date, close: row.vix.c } : null,
    point_only: false,
    provenance: _prov(
      "StatMuse adjusted SPY/TLT daily OHLCV + FRED VIXCLS",
      null,
      "March 2020 market crisis dataset (11 trading days)."
    ),
  }));
  return _c4_2020_cache;
}


interface C6Row {
  date: string;
  qqq: { o: number; h: number; l: number; c: number; v?: number };
  tlt?: number | null;
  vix?: { c: number } | null;
  spx?: number | null;
  spy?: { o: number; h: number; l: number; c: number; v?: number } | null;
}

interface GmeRow {
  date: string;
  gme: { o: number; h: number; l: number; c: number; v?: number };
}

interface C5Row {
  date: string;
  nflx: { o: number; h: number; l: number; c: number; v?: number };
}

interface C8Row {
  date: string;
  atvi: { o: number; h: number; l: number; c: number; v?: number };
  msft?: { o: number; h: number; l: number; c: number; v?: number };
}

let _c6_2022_cache: MarketNode[] | null = null;
export function load_c6_2022(): MarketNode[] {
  if (_c6_2022_cache) return _c6_2022_cache;
  const raw = c6_2022_raw as C6Row[];
  _c6_2022_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: { date: row.date, open: row.qqq.o, high: row.qqq.h, low: row.qqq.l, close: row.qqq.c, volume: row.qqq.v ?? null },
    secondary_close: row.tlt ?? null,
    vix: row.vix ? { date: row.date, close: row.vix.c } : null,
    point_only: false,
    provenance: _prov(
      "EarningsAhead displayed QQQ/TLT/SPY daily OHLCV + MarketXLS VIX",
      null,
      "June 2022 rate shock and duration trap dataset (7 trading days)."
    ),
  }));
  return _c6_2022_cache;
}

let _gme_2021_cache: MarketNode[] | null = null;
export function load_gme_2021(): MarketNode[] {
  if (_gme_2021_cache) return _gme_2021_cache;
  const raw = gme_2021_raw as GmeRow[];
  _gme_2021_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: {
      date: row.date,
      open: row.gme.o,
      high: row.gme.h,
      low: row.gme.l,
      close: row.gme.c,
      volume: row.gme.v ?? null,
    },
    secondary_close: null,
    vix: null,
    point_only: false,
    provenance: _prov(
      "HFDL GME historical 1m regular-session bars",
      "https://api.hfdatalibrary.com/",
      "19 trading dates; daily OHLCV is deterministically aggregated from the bundled real 1m rows."
    ),
  }));
  return _gme_2021_cache;
}

let _c5_2022_cache: MarketNode[] | null = null;
export function load_c5_2022(): MarketNode[] {
  if (_c5_2022_cache) return _c5_2022_cache;
  const raw = c5_2022_raw as C5Row[];
  _c5_2022_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: {
      date: row.date,
      open: row.nflx.o,
      high: row.nflx.h,
      low: row.nflx.l,
      close: row.nflx.c,
      volume: row.nflx.v ?? null,
    },
    secondary_close: null,
    vix: null,
    point_only: false,
    provenance: _prov(
      "HF Data Library NFLX historical 1m regular-session bars",
      "https://hfdatalibrary.com/pages/download",
      "5 trading dates; daily OHLCV is deterministically aggregated from the bundled real Part41 1m rows."
    ),
  }));
  return _c5_2022_cache;
}

let _c8_2022_2023_cache: MarketNode[] | null = null;
export function load_c8_2022_2023(): MarketNode[] {
  if (_c8_2022_2023_cache) return _c8_2022_2023_cache;
  const raw = c8_2022_2023_raw as C8Row[];
  _c8_2022_2023_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: {
      date: row.date,
      open: row.atvi.o,
      high: row.atvi.h,
      low: row.atvi.l,
      close: row.atvi.c,
      volume: row.atvi.v ?? null,
    },
    secondary_close: row.msft?.c ?? null,
    vix: null,
    point_only: false,
    provenance: _prov(
      "HF Data Library ATVI raw daily OHLCV (Part46)",
      "https://hfdatalibrary.com/pages/download",
      "437 real ATVI dates through 2023-10-12; 2023-10-13 has no ATVI market row and is handled only by deal-term settlement."
    ),
  }));
  return _c8_2022_2023_cache;
}

let _r1_2025_cache: MarketNode[] | null = null;
export function load_r1_2025(): MarketNode[] {
  if (_r1_2025_cache) return _r1_2025_cache;
  const raw = r1_2025_raw as R1Row[];
  _r1_2025_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: { date: row.date, open: row.nvda.o, high: row.nvda.h, low: row.nvda.l, close: row.nvda.c, volume: row.nvda.v ?? null },
    secondary_close: row.qqq ?? null,
    vix: row.vix ? { date: row.date, open: row.vix.o, high: row.vix.h, low: row.vix.l, close: row.vix.c } : null,
    point_only: false,
    provenance: _prov(
      "Public historical NVDA/QQQ dataset + Cboe VIX_History.csv",
      null,
      "NVDA daily OHLC/volume cross-checked with Reuters-reported Jan 27/28 moves; " +
        "QQQ adjusted close from Macrotrends-indexed table; VIX from official Cboe series."
    ),
  }));
  return _r1_2025_cache;
}

let _c7_2025_cache: MarketNode[] | null = null;
export function load_c7_2025(): MarketNode[] {
  if (_c7_2025_cache) return _c7_2025_cache;
  const raw = c7_2025_raw as unknown as MarketNode[];
  _c7_2025_cache = raw.map((row) => ({
    ...row,
    underlying_bar: { ...row.underlying_bar },
    vix: row.vix ? { ...row.vix } : null,
    provenance: { ...row.provenance },
  }));
  return _c7_2025_cache;
}

let _h1_2026_cache: MarketNode[] | null = null;
export function load_h1_2026(): MarketNode[] {
  if (_h1_2026_cache) return _h1_2026_cache;
  const raw = h1_2026_raw as unknown as H1Row[];
  _h1_2026_cache = raw.map((row) => ({
    date: row.date,
    underlying_bar: { ...row.underlying_bar },
    secondary_close: row.secondary_close ?? null,
    vix: row.vix ? { ...row.vix } : null,
    label: row.label ?? null,
    move_summary: row.move_summary ?? null,
    severity: row.severity ?? null,
    point_only: row.point_only ?? true,
    truth_label: row.truth_label,
    provenance: { ...row.provenance },
  }));
  return _h1_2026_cache;
}

let _events_cache: Record<string, MacroEvent[]> | null = null;
export function load_events(): Record<string, MacroEvent[]> {
  if (_events_cache) return _events_cache;
  const raw = events_seed_raw as unknown as Record<string, EventRow[]>;
  const out: Record<string, MacroEvent[]> = {};
  for (const campaign_key of ["r1_2025", "h1_2026", "c4_2020", "c6_2022", "gme_2021", "c5_2022", "c8_2022_2023", "c7_2025"]) {
    const events: MacroEvent[] = (raw[campaign_key] ?? []).map((row) => ({
      id: row.id,
      ts: row.ts ?? null,
      date: row.date,
      tag: row.tag,
      headline: row.headline,
      body: row.body ?? null,
      source: row.source,
      url: row.url ?? null,
      provenance: _prov(row.source, row.url ?? null, "Bundled verified event record."),
    }));
    out[campaign_key] = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  _events_cache = out;
  return _events_cache;
}

export const CAMPAIGNS: Record<string, CampaignMeta> = {
  c6: {
    id: "c6",
    title: "DURATION TRAP",
    playable: true,
    underlying: "QQQ",
    secondary: "TLT",
    note: "2022-06-09 → 2022-06-17。利率冲击与久期陷阱，QQQ 日 OHLC/Volume、TLT 日收盘、FRED VIX 为真实历史数据。",
    data_start: "2022-06-09",
    data_end: "2022-06-17",
    node_count: 7,
  },
  gme: {
    id: "gme",
    title: "FEEDBACK LOOP",
    playable: true,
    underlying: "GME",
    secondary: "",
    note: "2021-01-11 → 2021-02-05。GME 真实 1m 正股 + FINRA short-sale/SEC FTD/借券/贷款聚合证据；缺失逐合约 IV、Greeks、utilization 不补造。",
    data_start: "2021-01-11",
    data_end: "2021-02-05",
    node_count: 19,
  },
  c5: {
    id: "c5",
    title: "AFTER THE BELL",
    playable: true,
    underlying: "NFLX",
    secondary: "",
    note: "2022-04-18 → 2022-04-22。NFLX 真实 Part41 1m 正股 + Part25 财报周聚合；Part29 完整期权链仅 3/5 日，4/19 与 4/21 缺链，IV crush 走降级路径，不补造合约数据。",
    data_start: "2022-04-18",
    data_end: "2022-04-22",
    node_count: 5,
  },
  c8: {
    id: "c8",
    title: "THE SPREAD",
    playable: true,
    underlying: "ATVI",
    secondary: "MSFT",
    note: "2022-01-18 → 2023-10-13。ATVI Part46 日线 437/437 覆盖至 10/12；FTC、联邦法院、CMA 等 8 个公开节点进入事件流。10/13 无 ATVI 行情，合并结算只按 deal 条款每股 $95，不引用行情。",
    data_start: "2022-01-18",
    data_end: "2023-10-13",
    node_count: 437,
  },
  c7: {
    id: "c7",
    title: "POLICY SHOCKWAVE",
    playable: true,
    underlying: "SPX",
    secondary: "",
    note: "2025-04-02 → 2025-04-11。官方政策文本与生效时间来自 Part2；SPY/QQQ/VIX 仅作真实市场上下文，不冒充现金 SPX/IXIC。",
    data_start: "2025-04-02",
    data_end: "2025-04-11",
    node_count: 8,
  },
  c4: {
    id: "c4",
    title: "DASH FOR CASH",
    playable: true,
    underlying: "SPY",
    secondary: "TLT",
    note: "2020-03-09 → 2020-03-23。2020 流动性危机，SPY 日 OHLC/Volume、TLT 日收盘、FRED VIX 为真实历史数据。",
    data_start: "2020-03-09",
    data_end: "2020-03-23",
    node_count: 11,
  },
  h1: {
    id: "h1",
    default_account_type: "Margin",
    default_start_cash: 10_000_000,
    title: "2026 H1 宏观风暴",
    playable: true,
    underlying: "SPX",
    secondary: "NASDAQ",
    note:
      "可玩：2026-01-20 → 2026-06-30。SPX 与 Nasdaq 只使用已核验的真实事件交易日收盘节点；" +
      "不在节点之间插值伪造每日行情。期权盘口默认 ESTIMATED。",
    data_start: "2026-01-20",
    data_end: "2026-06-30",
    node_count: 10,
  },
  r1: {
    id: "r1",
    default_account_type: "Margin",
    default_start_cash: 10_000_000,
    title: "DeepSeek R1 冲击",
    playable: true,
    underlying: "NVDA",
    secondary: "QQQ",
    note:
      "可玩：2025-01-23 → 2025-01-31。NVDA 日 OHLC/Volume、QQQ 日收盘、Cboe VIX 为真实历史数据；" +
      "期权历史 Bid/Ask 默认不伪造。",
    data_start: "2025-01-23",
    data_end: "2025-01-31",
    node_count: 7,
  },
  nvdaearn: {
    id: "nvdaearn",
    title: "NVDA FY2025 Q4 财报",
    playable: false,
    underlying: "NVDA",
    secondary: "QQQ",
    note: "事件日期已核验（2025-02-26）；本项目未捆绑付费历史期权盘口/分钟数据，因此不开放完整回放。",
    data_start: "2025-02-26",
    data_end: "2025-02-26",
    node_count: 0,
  },
  v4: {
    id: "v4",
    title: "DeepSeek V4 Preview",
    playable: false,
    underlying: "NVDA",
    secondary: "QQQ",
    note: "官方发布日期 2026-04-24 已核验；未捆绑完整历史市场包。",
    data_start: "2026-04-24",
    data_end: "2026-04-24",
    node_count: 0,
  },
  v4pro: {
    id: "v4pro",
    title: "DeepSeek V4-Pro GA",
    playable: false,
    underlying: "NVDA",
    secondary: "QQQ",
    note: "官方发布日期 2026-08-13 已核验；未捆绑完整历史市场包。",
    data_start: "2026-08-13",
    data_end: "2026-08-13",
    node_count: 0,
  },
};

export function get_campaign_nodes(campaign_id: string): MarketNode[] {
  if (campaign_id === "c4") return load_c4_2020();
  if (campaign_id === "c6") return load_c6_2022();
  if (campaign_id === "gme") return load_gme_2021();
  if (campaign_id === "c5") return load_c5_2022();
  if (campaign_id === "c8") return load_c8_2022_2023();
  if (campaign_id === "c7") return load_c7_2025();
  if (campaign_id === "h1") return load_h1_2026();
  if (campaign_id === "r1") return load_r1_2025();
  return [];
}

export function get_campaign_events_key(campaign_id: string): string {
  if (campaign_id === "c4") return "c4_2020";
  if (campaign_id === "c6") return "c6_2022";
  if (campaign_id === "gme") return "gme_2021";
  if (campaign_id === "c5") return "c5_2022";
  if (campaign_id === "c8") return "c8_2022_2023";
  if (campaign_id === "c7") return "c7_2025";
  return campaign_id === "h1" ? "h1_2026" : "r1_2025";
}

let _characters_cache: Character[] | null = null;
export function load_characters(): Character[] {
  if (_characters_cache) return _characters_cache;
  const raw = characters_raw as {
    player: { id: string; name: string; role: string; portrait: string | null };
    npcs: { id: string; name: string; role: string; portrait: string; specialty?: string }[];
  };
  const out: Character[] = [
    { id: raw.player.id, name: raw.player.name, role: raw.player.role, portrait: raw.player.portrait ?? "" },
  ];
  for (const npc of raw.npcs) {
    out.push({ id: npc.id, name: npc.name, role: npc.role, portrait: npc.portrait, specialty: npc.specialty });
  }
  _characters_cache = out;
  return _characters_cache;
}

export interface RequiredUniverseRow {
  ticker: string;
  name: string;
  asset_type: string;
  game_role: string;
}

export function load_required_universe(): RequiredUniverseRow[] {
  return required_universe_raw as RequiredUniverseRow[];
}
