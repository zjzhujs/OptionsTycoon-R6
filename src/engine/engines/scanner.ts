/** Morning Opportunity Scanner Engine.
 * Scans the required market universe (28 core stocks/ETFs) for daily opportunities,
 * relative volume, IV rank, spread quality, and upcoming catalysts. */
import type { AIStackLevel, MarketNode, ScannerResult, ScannerRow, SourceType } from "../schemas";
import * as data_loader from "../data_loader";
import { realDailyRow } from "../daily_history_loader";
import {
  fallback_scanner_lineage,
  partial_real_price_lineage,
  resolve_scanner_daily_admission,
  type ScannerDataStatus,
} from "./scanner_real_row_adapter";

// AI Stack level's real, non-fabricated payoff for its ongoing compute cost: more analyst
// bandwidth surfaces more of the scanner's already-real signals as "highlighted" (top-of-list)
// opportunities, rather than inventing better IV/price/volume numbers for the same tickers.
// This was a confirmed dead cost before (real burn, zero effect) -- see DEAD_FEATURE_AUDIT.md.
const HIGHLIGHT_COUNT_BY_AI_LEVEL: Record<AIStackLevel, number> = {
  LEVEL_0_MANUAL: 3,
  LEVEL_1_ASSISTANT: 4,
  LEVEL_2_MULTI_AGENT: 6,
  LEVEL_3_INSTITUTIONAL: 8,
};

const SECTORS: Record<string, string> = {
  NVDA: "Semiconductors", AMD: "Semiconductors", AVGO: "Semiconductors", SMH: "Semiconductors",
  AAPL: "Technology", MSFT: "Technology", XLK: "Technology", PLTR: "Technology",
  META: "Communication", GOOGL: "Communication", NFLX: "Communication",
  AMZN: "Consumer Discretionary", TSLA: "Consumer Discretionary",
  JPM: "Financials", GS: "Financials", BAC: "Financials", XLF: "Financials",
  XOM: "Energy", CVX: "Energy", XLE: "Energy",
  DAL: "Industrials", UAL: "Industrials", LMT: "Defense", RTX: "Defense",
  SPY: "Broad Market", QQQ: "Tech Index", IWM: "Small Cap", DIA: "Large Cap",
};

const BASE_PRICES: Record<string, number> = {
  NVDA: 140.0, QQQ: 515.0, SPY: 600.0, TSLA: 395.0, SMH: 252.0,
  XLE: 92.0, XLF: 48.0, XLK: 235.0, AAPL: 228.0,
  MSFT: 435.0, META: 610.0, GOOGL: 190.0, AMZN: 220.0,
  AMD: 125.0, AVGO: 210.0, NFLX: 880.0, PLTR: 68.0, JPM: 240.0,
  GS: 570.0, BAC: 45.0, XOM: 118.0, CVX: 158.0, DAL: 62.0,
  UAL: 95.0, LMT: 485.0, RTX: 122.0, IWM: 225.0, DIA: 440.0,
};

interface RowInputs {
  px: number;
  chg: number;
  vol: number;
  iv: number;
  iv_rank: number;
  momentum: string;
  spread_q: string;
  analyst: string;
  upcoming: string | null;
  heat: number;
  highlight: boolean;
  price_source_type: SourceType;
  price_source_name: string;
  price_data_status: ScannerDataStatus;
}

export function generate_scanner_feed(node: MarketNode, campaign_id: string, ai_stack_level?: AIStackLevel): ScannerResult {
  let universe = data_loader.load_required_universe();
  if (!universe.length) {
    universe = [
      { ticker: "NVDA", name: "NVIDIA", asset_type: "Equity", game_role: "AI/Semiconductors" },
      { ticker: "QQQ", name: "Invesco QQQ Trust", asset_type: "ETF", game_role: "Nasdaq-100 benchmark" },
      { ticker: "SPY", name: "SPDR S&P 500 ETF", asset_type: "ETF", game_role: "Core benchmark" },
      { ticker: "TSLA", name: "Tesla", asset_type: "Equity", game_role: "High beta" },
      { ticker: "AAPL", name: "Apple", asset_type: "Equity", game_role: "Mega-cap tech" },
      { ticker: "MSFT", name: "Microsoft", asset_type: "Equity", game_role: "Software/AI" },
      { ticker: "PLTR", name: "Palantir", asset_type: "Equity", game_role: "AI/high beta" },
      { ticker: "SMH", name: "VanEck Semiconductor ETF", asset_type: "ETF", game_role: "Semiconductor benchmark" },
    ];
  }

  const spot = node.underlying_bar.close;
  const vix = node.vix?.close ?? 16.0;
  const date = node.date;

  let base_seed = 0;
  for (const c of date) base_seed += c.charCodeAt(0);

  const rows: ScannerRow[] = [];
  const highlighted: string[] = [];
  const heat_by_ticker: { ticker: string; heat: number; scripted: boolean }[] = [];

  universe.forEach((item, idx) => {
    const t = item.ticker;
    const name = item.name ?? t;
    const asset_type = item.asset_type ?? "Equity";
    const game_role = item.game_role ?? "Market asset";
    const sec = SECTORS[t] ?? "General";
    const admitted = resolve_scanner_daily_admission(campaign_id, date, t);
    const fallback_lineage = fallback_scanner_lineage();

    let inputs: RowInputs;
    if (admitted) {
      const chg = round2((admitted.row.close / admitted.row.open - 1) * 100);
      inputs = {
        px: admitted.row.close,
        chg,
        vol: admitted.row.volume,
        iv: date === "2025-01-27" || date === "2025-01-28" ? 0.58 : 0.42,
        iv_rank: date === "2025-01-27" ? 88.0 : 55.0,
        momentum: chg < 0 ? "BEARISH" : "BULLISH",
        spread_q: "TIGHT",
        analyst: "Maya Chen: 'DeepSeek R1 冲击推理芯片算力需求假设，波动率剧烈飙升。'",
        upcoming: "FY2025 Q4 财报 (2025-02-26)",
        heat: 98.0,
        highlight: true,
        price_source_type: admitted.source_type,
        price_source_name: admitted.source_name,
        price_data_status: "ADMITTED_REAL_DAILY",
      };
    } else if (campaign_id === "r1" && t === "QQQ") {
      const chg = date === "2025-01-27" ? -1.8 : 0.5;
      const qqq_lineage = node.secondary_close != null ? partial_real_price_lineage(date) : fallback_lineage;
      inputs = {
        px: node.secondary_close ?? 515.0,
        chg,
        vol: 65000000,
        iv: 0.22,
        iv_rank: 45.0,
        momentum: "NEUTRAL",
        spread_q: "TIGHT",
        analyst: "Victor Hale: '科技成长股受宏观利率与半导体链条溢出效应压制。'",
        upcoming: "FOMC 利率决议",
        heat: 75.0,
        highlight: false,
        price_source_type: qqq_lineage.source_type,
        price_source_name: qqq_lineage.source_name,
        price_data_status: qqq_lineage.data_status,
      };
    } else if (campaign_id === "r1" && t === "TSLA") {
      // V29-UI-C: same treatment as SMH above — the admitted pack supplies the observed close
      // and change, the authored analyst line and catalyst stay as written, and the lineage
      // label follows whichever price is actually on screen.
      const tsla = realDailyRow(t, date);
      const chg = tsla?.change_pct != null ? round2(tsla.change_pct) : date === "2025-01-27" ? -4.2 : 1.2;
      inputs = {
        px: tsla ? round2(tsla.close) : date >= "2025-01-27" ? 380.0 : 410.0,
        chg,
        vol: tsla?.volume ?? 85000000,
        iv: 0.62,
        iv_rank: 72.0,
        momentum: chg < 0 ? "BEARISH" : "BULLISH",
        spread_q: "TIGHT",
        analyst: "高 Beta 投机情绪风向标，期权虚值 Call 极度活跃。",
        upcoming: "Robotaxi 监管测试更新",
        heat: 85.0,
        highlight: true,
        price_source_type: tsla ? "REAL" : fallback_lineage.source_type,
        price_source_name: tsla ? (tsla.source_name ?? "已准入本地日线包") : fallback_lineage.source_name,
        price_data_status: tsla ? "ADMITTED_REAL_DAILY" : fallback_lineage.data_status,
      };
    } else if (campaign_id === "r1" && t === "SMH") {
      // V29-UI-C: the authored constants here (238.0 / -6.5%) were a stand-in from before any
      // SMH history existed. An admitted pack now carries the observed close for this date
      // (2025-01-27 really settled at 235.81), so the NUMBERS come from it while the authored
      // narrative fields below — the analyst line, the catalyst, the highlight — stay as
      // written. Real figures, authored story.
      const smh = realDailyRow(t, date);
      inputs = {
        px: smh ? round2(smh.close) : date === "2025-01-27" ? 238.0 : 252.0,
        chg: smh?.change_pct != null ? round2(smh.change_pct) : date === "2025-01-27" ? -6.5 : 0.8,
        vol: smh?.volume ?? 18000000,
        iv: 0.38,
        iv_rank: 80.0,
        momentum: date === "2025-01-27" ? "BEARISH" : "BULLISH",
        spread_q: "TIGHT",
        analyst: "半导体板块全线承压，做市商在平值附近建立重度 Gamma 护栏。",
        upcoming: "ASML 出货数据跟踪",
        heat: 90.0,
        highlight: true,
        // The lineage must follow the price actually shown: labeling an admitted close as
        // DERIVED would be a lie in the honest direction, which is still a lie.
        price_source_type: smh ? "REAL" : fallback_lineage.source_type,
        price_source_name: smh ? (smh.source_name ?? "已准入本地日线包") : fallback_lineage.source_name,
        price_data_status: smh ? "ADMITTED_REAL_DAILY" : fallback_lineage.data_status,
      };
    } else if (realDailyRow(t, date)) {
      // V29-UI-C: an admitted daily-history pack covers this ticker on this date, so the
      // scanner shows the REAL close and the REAL day change instead of the authored
      // BASE_PRICES constant plus deterministic noise.
      //
      // Only price and change are promoted. Options volume, open interest, IV and IV rank
      // stay derived/authored, because no options data was ever captured — swapping in a
      // real price must not be read as making the whole row real.
      const real = realDailyRow(t, date)!;
      inputs = {
        px: round2(real.close),
        chg: real.change_pct == null ? 0 : round2(real.change_pct),
        vol: real.volume ?? Math.trunc(12000000 + ((base_seed * 1000 * idx) % 20000000)),
        iv: round2(0.2 + (vix / 100.0) * 0.8 + (idx % 5) * 0.03),
        iv_rank: round1(Math.min(99.0, Math.max(10.0, vix * 2.5 + (real.change_pct ?? 0) * 5))),
        momentum:
          (real.change_pct ?? 0) > 0.5 ? "BULLISH" : (real.change_pct ?? 0) < -0.5 ? "BEARISH" : "NEUTRAL",
        spread_q: ["SPY", "AAPL", "MSFT", "AMZN"].includes(t) ? "TIGHT" : "MODERATE",
        analyst: "机构基本面跟踪，流动性良好。",
        upcoming: idx % 3 === 0 ? "季度财报窗口" : null,
        heat: 50.0,
        highlight: false,
        price_source_type: "REAL",
        price_source_name: real.source_name ?? "已准入本地日线包",
        price_data_status: "ADMITTED_REAL_DAILY",
      };
    } else {
      const base_p = BASE_PRICES[t] ?? 100.0;
      const noise = (((base_seed * (idx + 1) * 37) % 100) - 50) / 25.0;
      const chg = round2(noise);
      inputs = {
        px: round2(base_p * (1.0 + noise / 100.0)),
        chg,
        vol: Math.trunc(12000000 + ((base_seed * 1000 * idx) % 20000000)),
        iv: round2(0.2 + (vix / 100.0) * 0.8 + (idx % 5) * 0.03),
        iv_rank: round1(Math.min(99.0, Math.max(10.0, vix * 2.5 + noise * 5))),
        momentum: chg > 0.5 ? "BULLISH" : chg < -0.5 ? "BEARISH" : "NEUTRAL",
        spread_q: ["SPY", "AAPL", "MSFT", "AMZN"].includes(t) ? "TIGHT" : "MODERATE",
        analyst: "机构基本面跟踪，流动性良好。",
        upcoming: idx % 3 === 0 ? "季度财报窗口" : null,
        heat: round1(30.0 + ((idx * 7) % 50)),
        highlight: false,
        price_source_type: fallback_lineage.source_type,
        price_source_name: fallback_lineage.source_name,
        price_data_status: fallback_lineage.data_status,
      };
    }

    if (inputs.highlight) highlighted.push(t);
    heat_by_ticker.push({ ticker: t, heat: inputs.heat, scripted: inputs.highlight });

    const r_vol = round2(inputs.vol / (inputs.vol * 0.95));
    const opt_vol = Math.trunc(inputs.vol * 0.12);
    const oi = Math.trunc(opt_vol * 4.5);

    rows.push({
      ticker: t,
      name,
      asset_type,
      game_role,
      price: inputs.px,
      daily_change_pct: inputs.chg,
      volume: inputs.vol,
      relative_volume: r_vol,
      iv: inputs.iv,
      iv_rank: inputs.iv_rank,
      options_volume: opt_vol,
      open_interest: oi,
      spread_quality: inputs.spread_q,
      upcoming_event: inputs.upcoming,
      sector: sec,
      momentum: inputs.momentum,
      news_heat: inputs.heat,
      analyst_conviction: inputs.analyst,
      price_source_type: inputs.price_source_type,
      price_source_name: inputs.price_source_name,
      price_data_status: inputs.price_data_status,
      macro_sensitivity: sec === "Technology" || sec === "Semiconductors" ? "高利率敏感" : "宏观防御",
    });
  });

  // Real payoff for AI Stack level: the always-scripted story tickers stay highlighted at
  // every level; additional slots (more at higher levels) go to the highest real `heat`
  // among the rest -- surfacing more of what the scanner already computed, not inventing
  // better numbers for it.
  const highlight_count = HIGHLIGHT_COUNT_BY_AI_LEVEL[ai_stack_level ?? "LEVEL_0_MANUAL"];
  const extra_slots = Math.max(0, highlight_count - highlighted.length);
  const extra_by_heat = heat_by_ticker
    .filter((h) => !h.scripted)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, extra_slots)
    .map((h) => h.ticker);
  return { date, rows, highlighted_tickers: [...highlighted, ...extra_by_heat].slice(0, highlight_count) };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
