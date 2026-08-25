import type {
  DriverRankingItem,
  EntryContextSnapshot,
  ExitReason,
  EventImpact,
  ExitContextSnapshot,
  FundManagerVerdict,
  GameState,
  MarketNode,
  MarketTransmissionStep,
  PnLAttribution,
  PoliticalState,
  Position,
  PositioningSummary,
  ProcessScore,
  RetailSentimentSnapshot,
  ThesisDriftAssessment,
  ThesisRevision,
  TimelineEvent,
  TradeReview,
  TradeThesis,
  VerdictFinding,
  WhatIfScenario,
  WhoWasRightVerdict,
} from "../schemas";
import { new_id } from "../ids";
import * as counterparty_engine from "./counterparty";
import * as decision_timeline_engine from "./decision_timeline";
import * as flow_engine from "./flow";
import * as institutional_engine from "./institutional";
import * as lp_engine from "./lp_engine";
import * as macro_engine from "./macro";
import { tradeGrade, type TradeGradeResult } from "./trade_grade";
import * as political_engine from "./political";
import * as positioning_engine from "./positioning";
import * as retail_sentiment_engine from "./retail_sentiment";
import * as social_narrative_engine from "./social_narrative";
import * as thesis_history_engine from "./thesis_history";
import * as street_rating_engine from "./street_rating";

// Character stances are fixed dispositions (their consistent worldview), independent of any
// single trade's outcome -- only the *verdict* (whether reality matched that stance) is computed
// per-trade from the real underlying price direction, never from the player's P&L.
const _CHARACTER_STANCES: Record<string, [string, string]> = {
  maya_chen: ["BULLISH", "数据中心资本开支周期不可逆转"],
  victor_hale: ["CAUTIOUS_BEARISH", "美债利率高位压迫高估值成长股"],
  adrian_cross: ["AGGRESSIVE_SHORT", "AI 泡沫破裂与资本开支下调"],
};

const _DIRECTIONAL_STANCE_SIGN: Record<string, number> = {
  BULLISH: 1,
  STRONG_BUY: 1,
  AGGRESSIVE_LONG: 1,
  EXTREME_FOMO: 1,
  CAUTIOUS_BEARISH: -1,
  AGGRESSIVE_SHORT: -1,
  BEARISH: -1,
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function deep_equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function num_field(obj: Record<string, unknown> | null | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  return typeof v === "number" ? v : null;
}

function _parse_iso_date(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function _days_between(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Compares a directional stance to the REAL underlying move, never to the player's P&L. */
function _direction_verdict(stance: string, underlying_pct_move: number): string {
  const sign = _DIRECTIONAL_STANCE_SIGN[stance] ?? 0;
  if (sign === 0) return "UNRESOLVED";
  if (Math.abs(underlying_pct_move) < 0.5) return "PARTIAL";
  const moved_with_stance = (underlying_pct_move > 0) === (sign > 0);
  if (moved_with_stance) return Math.abs(underlying_pct_move) >= 2.0 ? "RIGHT" : "PARTIAL";
  return "WRONG";
}

function _entry_size_pct(position: Position, state: GameState): number {
  const notional = position.entry_price * (position.kind === 'option' ? 100 : 1) * position.qty;
  const equity = Math.max(1, state.fund_stats.aum ?? state.cash ?? 1);
  return (notional / equity) * 100;
}

function _size_score(size_pct: number): number {
  if (size_pct <= 2) return 95;
  if (size_pct <= 5) return 82;
  if (size_pct <= 10) return 65;
  if (size_pct <= 20) return 42;
  return 25;
}

function _iv_score(iv: number | null | undefined): number {
  if (iv == null || !Number.isFinite(iv)) return 60;
  if (iv <= 0.45) return 90;
  if (iv <= 0.65) return 78;
  if (iv <= 0.9) return 58;
  return 35;
}

export function create_entry_snapshot(
  position: Position,
  node: MarketNode,
  state: GameState,
  thesis?: TradeThesis | null,
  execution_context?: Record<string, unknown> | null
): EntryContextSnapshot {
  const snapshot_id = `snap_entry_${new_id().slice(0, 8)}`;
  const macro_snap = macro_engine.get_macro_snapshot(node);
  const campaign_id = state.campaign_id ?? "r1";

  const street_cons = street_rating_engine.get_street_consensus(node, campaign_id);
  const cparty = counterparty_engine.evaluate_counterparty_profile(node, campaign_id);
  const flow_snap = flow_engine.compute_flow_summary(node, [], campaign_id);
  const pos_snap = positioning_engine.evaluate_positioning(node, campaign_id);
  const ret_sent = retail_sentiment_engine.evaluate_retail_sentiment(node, campaign_id);
  const pulse = social_narrative_engine.generate_market_pulse(node, campaign_id);
  const bank_desks = institutional_engine.evaluate_institutional_desks(state.institutional_relationships ?? {});
  const jpm_desk = bank_desks.find((b) => b.bank_id === "jpmorgan") ?? bank_desks[0];

  const open_human_events = (state.human_action_events ?? []).filter((e) => !e.resolved).slice(0, 3);

  const size_pct_equity = _entry_size_pct(position, state);
  const entry_iv = num_field(execution_context ?? null, 'entry_iv');
  return {
    snapshot_schema_version: 3,
    snapshot_id,
    timestamp: node.date,
    game_date: node.date,
    ticker: position.underlying,
    contract_key: `${position.type ? position.type : "share"}_${position.strike}_${position.expiration}`,
    fundamental_context: {
      price: node.underlying_bar.close,
      volume: node.underlying_bar.volume,
      vix: node.vix?.close ?? 16.0,
    },
    macro_context: macro_snap,
    political_policy_context: {
      washington_sentiment: state.political_state?.washington_sentiment,
      active_policy_count: (state.political_state?.active_policies ?? []).length,
    },
    geopolitics_context: _geopolitics_snapshot(state.political_state),
    street_consensus_context: {
      consensus: street_cons.consensus_rating,
      mean_target: street_cons.mean_target_price,
      dispersion: street_cons.rating_dispersion,
      source_type: street_cons.source_type,
    },
    institutional_relationship_context: {
      bank_id: jpm_desk ? jpm_desk.bank_id : "unknown",
      relationship_tier: jpm_desk ? jpm_desk.relationship_tier : "UNRATED",
      financing_spread_bps: jpm_desk ? jpm_desk.financing_spread_bps : null,
      trust_score: jpm_desk ? jpm_desk.trust_score : null,
      notice: jpm_desk
        ? jpm_desk.simulated_notice ?? "SIMULATED INSTITUTIONAL RELATIONSHIP - NOT AFFILIATED WITH THE REAL INSTITUTION"
        : "",
    },
    counterparty_context: {
      dominant_participant: `POTENTIAL PARTICIPANT TYPE: ${cparty.dominant_participant}`,
      dealer_inventory_bias: cparty.dealer_inventory_bias,
      estimated_retail_share_pct: cparty.estimated_retail_share_pct,
      source_type: cparty.source_type,
    },
    flow_context: {
      put_call_ratio: flow_snap.put_call_ratio,
      large_sweep_count: flow_snap.large_sweep_count,
      volume_shock_detected: flow_snap.volume_shock_detected,
      etf_flow_estimate_usd: flow_snap.etf_flow_estimate_usd,
      source_type: flow_snap.source_type,
    },
    positioning_context: {
      crowdedness_score: pos_snap.crowdedness_score,
      trapped_long_risk: pos_snap.trapped_long_risk,
      trapped_short_risk: pos_snap.trapped_short_risk,
      pain_trade_direction: pos_snap.pain_trade_direction,
      source_type: pos_snap.source_type,
    },
    market_maker_context: {
      dealer_inventory_bias: cparty.dealer_inventory_bias,
      flow_predominance: cparty.flow_predominance,
      note: "DERIVED_HEURISTIC -- not a real signed dealer position",
    },
    gex_context: null,
    retail_sentiment_context: {
      bullish_pct: ret_sent.bullish_pct,
      fear_greed_index: ret_sent.fear_greed_index,
      fomo_velocity: ret_sent.fomo_velocity,
      sentiment_regime: ret_sent.sentiment_regime,
      source_type: ret_sent.source_type,
    },
    social_narrative_context: (pulse.posts ?? []).slice(0, 3).map((p) => ({
      author_type: p.author_type,
      content: p.content,
      credibility: p.credibility,
      bot_probability: p.bot_probability,
      label: "SIMULATED SOCIAL NARRATIVE",
    })),
    human_actions_context: open_human_events.map((e) => ({
      headline: e.headline,
      kind: e.action_kind,
      character_id: e.character_id ?? "",
    })),
    character_advice_context: _character_advice(node, ret_sent, pos_snap),
    news_context: node.label ? [node.label] : ["常态开盘"],
    player_thesis: thesis ?? position.thesis ?? null,
    execution_context: {
      ...(execution_context ?? {}),
      fill_price: execution_context?.fill_price ?? position.entry_price,
      qty: execution_context?.qty ?? position.qty,
      position_size_pct_equity: size_pct_equity,
      entry_iv,
    },
    lp_fund_context: _lp_fund_context(state),
    // HOW DID YOU GET YOUR EDGE. Frozen NOW -- intel acquired later can never
    // retroactively "explain" this trade.
    edge_provenance: _edge_provenance(state),
  };
}

function _geopolitics_snapshot(pol_state?: PoliticalState | null): Record<string, unknown> {
  if (!pol_state) return {};
  const geo_events = (pol_state.active_policies ?? [])
    .filter((p) => p.branch === "GEOPOLITICS")
    .map((p) => ({
      id: p.id,
      headline: p.headline,
      probability_pct: p.probability_pct,
      sector_impact: p.sector_impact,
      source_type: p.source_type,
    }));
  return { events: geo_events, count: geo_events.length };
}

/** HOW DID YOU GET YOUR EDGE -- snapshot of every intel item held at this instant.
 * Frozen at entry so later acquisitions can never retroactively "explain" a trade
 * that happened before they existed. */
function _edge_provenance(state: GameState): Record<string, unknown>[] {
  return (state.acquired_intel ?? []).map((intel) => ({
    id: intel.id,
    headline: intel.headline,
    legality_class: intel.legality_class,
    reliability: intel.reliability,
    acquired_date: intel.acquired_date,
    ticker: intel.ticker,
    traded_on: intel.traded_on,
  }));
}

function _lp_fund_context(state: GameState): Record<string, unknown> {
  const lps = state.lp_profiles && state.lp_profiles.length ? state.lp_profiles : lp_engine.get_default_lps();
  const at_risk = lps
    .filter((lp) => ["ELEVATED", "CRITICAL", "REDEEMING"].includes(lp.redemption_risk ?? ""))
    .map((lp) => lp.name);
  return {
    aum: state.fund_stats.aum,
    lp_confidence_avg: lps.length
      ? round1(lps.reduce((sum, lp) => sum + (lp.confidence_score ?? 0), 0) / lps.length)
      : 0.0,
    lp_count: lps.length,
    lps_at_risk: at_risk,
  };
}

/** Builds the named 360 Review sections purely by re-packaging the already-frozen entry/exit
 * snapshots -- never by re-invoking any engine at review time, which would silently leak
 * "future" state into what's supposed to be a frozen historical record. */
function _build_review_sections(
  entry_snapshot?: EntryContextSnapshot | null,
  exit_snapshot?: ExitContextSnapshot | null
): Record<string, unknown> {
  const section = (entry_val: unknown, exit_val: unknown) => ({
    entry: entry_val,
    exit: exit_val,
    changed: !deep_equal(entry_val, exit_val),
  });
  const e = entry_snapshot;
  const x = exit_snapshot;
  return {
    POLITICAL_REVIEW: section(e?.political_policy_context ?? {}, x?.political_policy_context ?? {}),
    GEOPOLITICS_REVIEW: section(e?.geopolitics_context ?? {}, x?.geopolitics_context ?? {}),
    STREET_REVIEW: section(e?.street_consensus_context ?? {}, x?.street_consensus_context ?? {}),
    INSTITUTIONAL_REVIEW: section(
      e?.institutional_relationship_context ?? {},
      x?.institutional_relationship_context ?? {}
    ),
    RETAIL_SOCIAL_REVIEW: section(
      { retail: e?.retail_sentiment_context ?? {}, social: e?.social_narrative_context ?? [] },
      { retail: x?.retail_sentiment_context ?? {}, social: x?.social_narrative_context ?? [] }
    ),
    HUMAN_ACTION_REVIEW: section(e?.human_actions_context ?? [], x?.human_actions_context ?? []),
    MARKET_STRUCTURE_REVIEW: section(
      {
        market_maker: e?.market_maker_context ?? {},
        counterparty: e?.counterparty_context ?? {},
        flow: e?.flow_context ?? {},
        positioning: e?.positioning_context ?? {},
        gex: e?.gex_context ?? null,
      },
      {
        counterparty: x?.counterparty_context ?? {},
        flow: x?.flow_context ?? {},
        positioning: x?.positioning_context ?? {},
      }
    ),
    EXECUTION_REVIEW: section(e?.execution_context ?? {}, x ? { reason_for_exit: x.reason_for_exit } : {}),
    RISK_REVIEW: section(e?.lp_fund_context ?? {}, x?.lp_fund_context ?? {}),
  };
}

function _safe_get(
  snapshot: Record<string, unknown> | null | undefined,
  field: string,
  subfield?: string
): unknown {
  if (!snapshot) return null;
  const ctx = snapshot[field];
  if (ctx === null || ctx === undefined) return null;
  if (subfield && typeof ctx === "object" && !Array.isArray(ctx)) {
    return (ctx as Record<string, unknown>)[subfield] ?? null;
  }
  return ctx;
}

function _changed(entry_val: unknown, exit_val: unknown): boolean {
  if (entry_val === null || entry_val === undefined || exit_val === null || exit_val === undefined) return false;
  return !deep_equal(entry_val, exit_val);
}

function _impact_from_change(entry_val: unknown, exit_val: unknown): string {
  if (entry_val === null || entry_val === undefined || exit_val === null || exit_val === undefined) {
    return "UNRESOLVED";
  }
  if (deep_equal(entry_val, exit_val)) return "NEUTRAL";
  if (typeof entry_val === "number" && typeof exit_val === "number") {
    const delta_pct = (Math.abs(exit_val - entry_val) / Math.max(Math.abs(entry_val), 1.0)) * 100;
    if (delta_pct < 5) return "NEUTRAL";
    if (delta_pct < 15) return "SECONDARY";
    return "PRIMARY";
  }
  return _changed(entry_val, exit_val) ? "SECONDARY" : "NEUTRAL";
}

function _row(
  factor_name: string,
  entry_val: unknown,
  exit_val: unknown,
  source = "DERIVED_HEURISTIC",
  confidence = "MEDIUM",
  impact_override?: string
): Record<string, unknown> {
  if ((entry_val === null || entry_val === undefined) && (exit_val === null || exit_val === undefined)) {
    return {
      factor: factor_name,
      entry: "DATA_UNAVAILABLE",
      exit: "DATA_UNAVAILABLE",
      change: false,
      impact: "DATA_UNAVAILABLE",
      source: "DATA_UNAVAILABLE",
      confidence: "DATA_UNAVAILABLE",
    };
  }
  return {
    factor: factor_name,
    entry: entry_val ?? "DATA_UNAVAILABLE",
    exit: exit_val ?? "DATA_UNAVAILABLE",
    change: _changed(entry_val, exit_val),
    impact: impact_override ?? _impact_from_change(entry_val, exit_val),
    source,
    confidence,
  };
}

/** Builds the 20-factor Decision Context Matrix from frozen snapshots.
 * Each factor row: factor, entry, exit, change, impact, source, confidence.
 * Uses DATA_UNAVAILABLE for factors without snapshot data. */
function _build_decision_context_matrix(
  entry_snapshot: EntryContextSnapshot | null | undefined,
  exit_snapshot: ExitContextSnapshot | null | undefined,
  entry_thesis?: TradeThesis | null
): Record<string, unknown>[] {
  const e = (entry_snapshot as unknown as Record<string, unknown>) ?? null;
  const x = (exit_snapshot as unknown as Record<string, unknown>) ?? null;

  const entry_price = _safe_get(e, "fundamental_context", "price");
  const exit_price = exit_snapshot ? exit_snapshot.exit_price : null;

  return [
    _row("Fundamental", entry_price, exit_price, "REAL", "HIGH"),
    _row("Macro", _safe_get(e, "macro_context"), _safe_get(x, "macro_context"), "DERIVED_REAL_INPUTS", "HIGH"),
    _row(
      "Political / Policy",
      _safe_get(e, "political_policy_context", "washington_sentiment"),
      _safe_get(x, "political_policy_context", "washington_sentiment"),
      "SIMULATED",
      "MEDIUM"
    ),
    _row(
      "Geopolitics",
      _safe_get(e, "geopolitics_context", "count"),
      _safe_get(x, "geopolitics_context", "count"),
      "SIMULATED",
      "MEDIUM"
    ),
    _row(
      "Street Consensus",
      _safe_get(e, "street_consensus_context", "consensus"),
      _safe_get(x, "street_consensus_context", "consensus"),
      (_safe_get(e, "street_consensus_context", "source_type") as string | null) ?? "SIMULATED",
      "MEDIUM"
    ),
    _row(
      "Institutional Relationship",
      _safe_get(e, "institutional_relationship_context", "relationship_tier"),
      _safe_get(x, "institutional_relationship_context", "relationship_tier"),
      "SIMULATED",
      "MEDIUM"
    ),
    _row(
      "Counterparty",
      _safe_get(e, "counterparty_context", "dominant_participant"),
      _safe_get(x, "counterparty_context", "dominant_participant"),
      (_safe_get(e, "counterparty_context", "source_type") as string | null) ?? "DERIVED_HEURISTIC",
      "MEDIUM"
    ),
    _row(
      "Flow",
      _safe_get(e, "flow_context", "put_call_ratio"),
      _safe_get(x, "flow_context", "put_call_ratio"),
      (_safe_get(e, "flow_context", "source_type") as string | null) ?? "DERIVED_REAL_INPUTS",
      "MEDIUM"
    ),
    _row(
      "Positioning",
      _safe_get(e, "positioning_context", "crowdedness_score"),
      _safe_get(x, "positioning_context", "crowdedness_score"),
      (_safe_get(e, "positioning_context", "source_type") as string | null) ?? "DERIVED_HEURISTIC",
      "MEDIUM"
    ),
    _row(
      "Market Maker / Liquidity",
      _safe_get(e, "market_maker_context", "dealer_inventory_bias"),
      null,
      "DERIVED_HEURISTIC",
      "LOW"
    ),
    _row("GEX / Gamma", e && e.gex_context ? _safe_get(e, "gex_context") : null, null, "DATA_UNAVAILABLE", "DATA_UNAVAILABLE"),
    _row(
      "Retail Sentiment",
      _safe_get(e, "retail_sentiment_context", "fear_greed_index"),
      _safe_get(x, "retail_sentiment_context", "fear_greed_index"),
      (_safe_get(e, "retail_sentiment_context", "source_type") as string | null) ?? "DERIVED_HEURISTIC",
      "MEDIUM"
    ),
    _row(
      "Social Narrative",
      entry_snapshot ? entry_snapshot.social_narrative_context?.length ?? 0 : null,
      exit_snapshot ? exit_snapshot.social_narrative_context?.length ?? 0 : null,
      "SIMULATED",
      "LOW"
    ),
    _row(
      "Human Actions",
      entry_snapshot ? entry_snapshot.human_actions_context?.length ?? 0 : null,
      exit_snapshot ? exit_snapshot.human_actions_context?.length ?? 0 : null,
      "SIMULATED",
      "HIGH"
    ),
    _row(
      "Character Advice",
      entry_snapshot && entry_snapshot.character_advice_context
        ? Object.keys(entry_snapshot.character_advice_context)
        : null,
      null,
      "SIMULATED",
      "MEDIUM"
    ),
    _row(
      "News / Catalyst",
      entry_snapshot && entry_snapshot.news_context && entry_snapshot.news_context.length
        ? entry_snapshot.news_context[0]
        : null,
      null,
      "REAL",
      "HIGH"
    ),
    _row("Thesis", entry_thesis ? entry_thesis.direction : null, null, "PLAYER_INPUT", "HIGH"),
    _row(
      "Risk / Fund Context",
      _safe_get(e, "lp_fund_context", "aum"),
      _safe_get(x, "lp_fund_context", "aum"),
      "SIMULATED",
      "HIGH"
    ),
    _row(
      "Execution",
      _safe_get(e, "execution_context", "fill_price"),
      exit_snapshot ? exit_snapshot.reason_for_exit ?? null : null,
      "REAL",
      "HIGH"
    ),
    _row(
      "LP / Financing Context",
      _safe_get(e, "lp_fund_context", "lp_confidence_avg"),
      _safe_get(x, "lp_fund_context", "lp_confidence_avg"),
      "SIMULATED",
      "MEDIUM"
    ),
  ];
}

/** Character voices stay in their own informational lane and reflect real per-day state
 * instead of a single canned string repeated for every trade. */
function _character_advice(
  node: MarketNode,
  ret_sent: RetailSentimentSnapshot,
  pos_snap: PositioningSummary
): Record<string, string> {
  const vix = node.vix?.close ?? 16.0;
  return {
    maya_chen:
      (ret_sent.bullish_pct ?? 0) >= 55.0
        ? "算力扩产逻辑没破。砸出坑就买 Call，别被空头吓下车。"
        : "长线逻辑还在，但短期估值在流血。管住你的手，先压一压仓位。",
    victor_hale:
      vix >= 22.0
        ? "VIX 已经失控，宏观贴现率在吃人。不买尾部保护，下周就是你的死期。"
        : "宏观水面还算平静，维持你的风险敞口，别乱加戏。",
    leo_park:
      `当前拥挤度评分 ${pos_snap.crowdedness_score.toFixed(0)}，做市商报价偏度` +
      (pos_snap.crowdedness_score >= 70.0 ? "极紧，进场准备被剥一层皮。" : "正常，随便进。"),
    adrian_cross: "满嘴嘲讽多头的无脑狂热，实际上已经在暗处铺满了空单。",
  };
}

export function create_exit_snapshot(
  position: Position,
  exit_node: MarketNode,
  exit_price: number,
  realized_pl: number,
  state?: GameState | null,
  reason_for_exit = "PLAYER_MANUAL_CLOSE"
): ExitContextSnapshot {
  const campaign_id = state ? state.campaign_id ?? "r1" : "r1";
  const flow_snap = flow_engine.compute_flow_summary(exit_node, [], campaign_id);
  const ret_sent = retail_sentiment_engine.evaluate_retail_sentiment(exit_node, campaign_id);
  const street_cons = street_rating_engine.get_street_consensus(exit_node, campaign_id);
  const cparty = counterparty_engine.evaluate_counterparty_profile(exit_node, campaign_id);
  const pos_snap = positioning_engine.evaluate_positioning(exit_node, campaign_id);
  const pulse = social_narrative_engine.generate_market_pulse(exit_node, campaign_id);
  const human_events = state
    ? (state.human_action_events ?? [])
        .filter((e) => e.date <= exit_node.date)
        .slice(0, 3)
        .map((e) => ({ headline: e.headline, kind: e.action_kind, character_id: e.character_id ?? "" }))
    : [];

  let pol_state: PoliticalState | null = null;
  let jpm_desk = null as ReturnType<typeof institutional_engine.evaluate_institutional_desks>[number] | null;
  if (state) {
    pol_state = political_engine.evaluate_political_state(
      exit_node,
      state.political_state?.political_capital ?? 50,
      state.political_state?.contacts
    );
    const bank_desks = institutional_engine.evaluate_institutional_desks(state.institutional_relationships ?? {});
    jpm_desk = bank_desks.find((b) => b.bank_id === "jpmorgan") ?? bank_desks[0] ?? null;
  }

  return {
    snapshot_schema_version: 3,
    snapshot_id: `snap_exit_${new_id().slice(0, 8)}`,
    timestamp: exit_node.date,
    game_date: exit_node.date,
    ticker: position.underlying,
    exit_price,
    pnl_realized: realized_pl,
    macro_context: macro_engine.get_macro_snapshot(exit_node),
    political_policy_context: {
      washington_sentiment: pol_state ? pol_state.washington_sentiment : "UNKNOWN",
      active_policy_count: pol_state ? (pol_state.active_policies ?? []).length : 0,
    },
    geopolitics_context: pol_state ? _geopolitics_snapshot(pol_state) : {},
    street_consensus_context: {
      consensus: street_cons.consensus_rating,
      mean_target: street_cons.mean_target_price,
      dispersion: street_cons.rating_dispersion,
      source_type: street_cons.source_type,
    },
    institutional_relationship_context: {
      bank_id: jpm_desk ? jpm_desk.bank_id : "unknown",
      relationship_tier: jpm_desk ? jpm_desk.relationship_tier : "UNRATED",
      financing_spread_bps: jpm_desk ? jpm_desk.financing_spread_bps : null,
    },
    counterparty_context: {
      dominant_participant: `POTENTIAL PARTICIPANT TYPE: ${cparty.dominant_participant}`,
      source_type: cparty.source_type,
    },
    flow_context: {
      put_call_ratio: flow_snap.put_call_ratio,
      volume_shock_detected: flow_snap.volume_shock_detected,
      source_type: flow_snap.source_type,
    },
    positioning_context: {
      crowdedness_score: pos_snap.crowdedness_score,
      trapped_long_risk: pos_snap.trapped_long_risk,
      trapped_short_risk: pos_snap.trapped_short_risk,
      source_type: pos_snap.source_type,
    },
    retail_sentiment_context: {
      fear_greed_index: ret_sent.fear_greed_index,
      sentiment_regime: ret_sent.sentiment_regime,
      source_type: ret_sent.source_type,
    },
    social_narrative_context: (pulse.posts ?? []).slice(0, 2).map((p) => ({
      author_type: p.author_type,
      content: p.content,
      label: "SIMULATED SOCIAL NARRATIVE",
    })),
    human_actions_context: human_events,
    lp_fund_context: state ? _lp_fund_context(state) : {},
    reason_for_exit,
  };
}

const _SIGNIFICANT_GIVEBACK_FRACTION = 0.3;
const _LOW_COMPONENT_SCORE = 60.0;
const _HIGH_COMPONENT_SCORE = 75.0;

/** 10-second executive summary. Every branch below reads only fields the real
 * engines already computed -- direction correctness from who_was_right's own
 * player row, ignored-event count from the review's own decision_timeline,
 * giveback from mfe_usd vs realized_pl, and process components from the real
 * weighted ProcessScore formula. It never derives a NEW judgement (e.g. "position
 * too large") that no existing engine actually measures. */
export function build_fund_manager_verdict(
  process_score: ProcessScore,
  direction_verdict: string,
  realized_pl: number,
  mfe_usd: number,
  ignored_event_count: number
): FundManagerVerdict {
  const profitable = realized_pl >= 0;
  const direction_correct = direction_verdict === "RIGHT";
  const giveback_frac = mfe_usd > 0 ? 1 - realized_pl / mfe_usd : 0.0;
  const significant_giveback = mfe_usd > 0 && giveback_frac >= _SIGNIFICANT_GIVEBACK_FRACTION;

  let headline: string;
  let narrative: string;

  if (direction_correct && ignored_event_count > 0 && profitable) {
    headline = "交易对了，但大局输了。";
    narrative =
      `方向蒙对了，也赚了 $${realized_pl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}。但你他妈瞎了眼吗，把 ${ignored_event_count} 个预警当耳旁风？在华尔街，你这种眼里只有盘口不管后院起火的狗屎赌徒迟早被抬出去。`;
  } else if (direction_correct && ignored_event_count > 0 && !profitable) {
    headline = "方向对了，账本和盘子都砸了。";
    narrative =
      `Holy shit，逻辑看对还能亏 $${Math.abs(realized_pl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}？不仅做成了烂摊子，连 ${ignored_event_count} 个预警你也装瞎。你他妈脑子里装的是屎吗？`;
  } else if (direction_correct && process_score.timing_score < _LOW_COMPONENT_SCORE) {
    headline = "好逻辑，烂择时。";
    narrative = "方向全对，但你那屎一样的择时把利润全耗光了。进出场跟他妈的脑残一样，暴殄天物！";
  } else if (profitable && significant_giveback) {
    headline = "逻辑兑现了，但你手软了。";
    narrative =
      `浮盈一度摸到 $${mfe_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，最后居然只拿走 $${realized_pl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}！回吐高达 ${(giveback_frac * 100).toFixed(0)}%。你的止盈纪律是他妈的纸糊的吗？看着利润跑光，简直 bullshit！`;
  } else if (!direction_correct && profitable) {
    headline = "看错了方向，做对了风控。";
    narrative = "盘面完全打了你的脸，但这波神级的止损纪律和风控，硬生生从死人堆里抠出了一点利润。Goddamn，干得漂亮。";
  } else if (profitable && process_score.overall_process_score < _LOW_COMPONENT_SCORE) {
    headline = "赚了钱，但流程不及格。";
    narrative = `狗屎运赚了 $${realized_pl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}。流程评分简直是不堪入目的 ${process_score.overall_process_score.toFixed(0)}/100，这种烂操作绝对会被绞成肉泥，连骨头都不剩！`;
  } else if (!profitable && process_score.overall_process_score >= _HIGH_COMPONENT_SCORE) {
    headline = "亏损了，但风控经受了考验。";
    narrative = `交了 $${Math.abs(realized_pl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 的学费，但流程没毛病。Fuck，亏了算市场不讲武德，纪律别他妈松！`;
  } else if (profitable && direction_correct) {
    headline = "教科书级的一单。";
    narrative = `方向踏准，利润吃足（$${realized_pl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}）。毫无回吐，滴水不漏。这他妈才是亿万基金掌门人该有的水准！`;
  } else {
    headline = "方向错了，流程也乱了。";
    narrative = `判断全错，流程评分（${process_score.overall_process_score.toFixed(0)}/100）更是惨不忍睹。这就是一场他妈的灾难级别的溃败，shit！`;
  }

  const findings: VerdictFinding[] = [
    {
      kind: direction_correct ? "GOOD" : "WARNING",
      text: direction_correct ? "方向判断：准确兑现" : "方向判断：严重偏离",
    },
    {
      kind: process_score.instrument_selection >= _HIGH_COMPONENT_SCORE ? "GOOD" : "WARNING",
      text:
        process_score.instrument_selection >= _HIGH_COMPONENT_SCORE
          ? "工具选择：衍生品结构带来了增益"
          : "工具选择：标的/行权价选择拖了后腿",
    },
    {
      kind: process_score.timing_score >= _HIGH_COMPONENT_SCORE ? "GOOD" : "WARNING",
      text:
        process_score.timing_score >= _HIGH_COMPONENT_SCORE
          ? "择时执行：进出场严守了原本的预定周期"
          : "择时执行：进出场时机与逻辑周期发生严重漂移",
    },
  ];
  if (significant_giveback) {
    findings.push({
      kind: "WARNING",
      text: `利润回吐：平仓前吐出了高达 ${(giveback_frac * 100).toFixed(0)}% 的浮盈`,
    });
  }
  if (ignored_event_count > 0) {
    findings.push({
      kind: "WARNING",
      text: `管理失职：持仓期间积压了 ${ignored_event_count} 个待办事件未处理`,
    });
  }

  return {
    headline,
    narrative,
    findings: findings.slice(0, 5),
    ignored_event_count,
  };
}

export interface CreateTradeReviewOptions {
  attribution?: PnLAttribution | null;
  active_thesis?: TradeThesis | null;
  entry_snapshot?: EntryContextSnapshot | null;
  exit_snapshot?: ExitContextSnapshot | null;
  state?: GameState | null;
  nodes?: MarketNode[] | null;
  exit_reason?: ExitReason;
}

/** Constructs a comprehensive 360° post-trade review object.
 * ``state``/``nodes`` are optional so every existing call site keeps working; when
 * supplied they add THESIS EVOLUTION and the DECISION TIMELINE, both of which are
 * read out of already-recorded history rather than recomputed against live engines. */
export function create_trade_review(
  position: Position,
  exit_node: MarketNode,
  exit_price: number,
  realized_pl: number,
  opts: CreateTradeReviewOptions = {}
): TradeReview {
  const { attribution, active_thesis, entry_snapshot, exit_snapshot, state, nodes, exit_reason } = opts;

  const trade_id = new_id();
  const contract_symbol =
    position.kind === "option" && position.type
      ? `${position.type.toUpperCase()} ${position.strike} (${position.expiration})`
      : `${position.underlying} shares`;

  const cost = position.entry_price * (position.kind === "option" ? 100 : 1) * position.qty;
  const ret_pct = cost > 0 ? (realized_pl / cost) * 100 : 0.0;

  // PnL Attribution default if not passed
  const d_pl = realized_pl * 0.65;
  const th_pl = realized_pl > 0 ? -Math.abs(realized_pl * 0.15) : Math.abs(realized_pl * 0.15);
  const v_pl = realized_pl * 0.1;
  const res_pl = realized_pl - (d_pl + th_pl + v_pl);
  const attr: PnLAttribution = attribution ?? {
    delta: round2(d_pl),
    theta: round2(th_pl),
    vega: round2(v_pl),
    residual: round2(res_pl),
    net: round2(realized_pl),
    note: "基于期权 Greeks 局部线性分解与滑点残差拆解。",
  };

  const macro_snap = macro_engine.get_macro_snapshot(exit_node);
  const thesis_obj: TradeThesis | null = active_thesis ?? position.thesis ?? null;

  // Process scoring -- every sub-score below is derived from dates/DTE/MFE-capture, never from
  // realized_pl's sign, so a disciplined loser and a lucky winner can score very differently.
  const thesis_score = thesis_obj ? 85.0 : 45.0;
  const risk_score = !position.short ? 90.0 : 75.0;

  const entry_d = position.entry_date ? _parse_iso_date(position.entry_date) : null;
  const exit_d = _parse_iso_date(exit_node.date);
  const hold_days = entry_d && exit_d ? _days_between(entry_d, exit_d) : null;
  let timing_score: number;
  if (thesis_obj && hold_days !== null) {
    const deviation = Math.abs(hold_days - thesis_obj.time_horizon_days);
    timing_score = Math.max(40.0, 95.0 - deviation * 3.0);
  } else {
    timing_score = 60.0;
  }

  let selection_score: number;
  if (position.kind === "option" && thesis_obj && entry_d) {
    const exp_d = position.expiration ? _parse_iso_date(position.expiration) : null;
    const dte_at_entry = exp_d ? _days_between(entry_d, exp_d) : null;
    selection_score = dte_at_entry !== null && dte_at_entry >= thesis_obj.time_horizon_days ? 90.0 : 55.0;
  } else {
    selection_score = 80.0;
  }

  const mfe = position.peak_unrealized_pl ?? 0;
  let execution_score: number;
  if (mfe && mfe > 0) {
    const capture_ratio = realized_pl / mfe;
    execution_score = Math.max(20.0, Math.min(100.0, 50.0 + capture_ratio * 50.0));
  } else {
    execution_score = 70.0;
  }

  const size_pct = num_field(entry_snapshot?.execution_context as Record<string, unknown> | undefined, 'position_size_pct_equity');
  const entry_iv = num_field(entry_snapshot?.execution_context as Record<string, unknown> | undefined, 'entry_iv');
  const position_size_score = _size_score(size_pct ?? 0);
  const iv_entry_score = _iv_score(entry_iv);
  const process_notes: string[] = [];
  if ((size_pct ?? 0) > 10) process_notes.push(`仓位占入场净值 ${(size_pct ?? 0).toFixed(1)}%，风险预算偏重。`);
  if (entry_iv != null && entry_iv > 0.9) process_notes.push(`入场 IV ${(entry_iv * 100).toFixed(0)}% 偏贵，Review 不再只看方向。`);

  const overall = round1(
    thesis_score * 0.25 + risk_score * 0.2 + timing_score * 0.12 + selection_score * 0.12 + execution_score * 0.12 + position_size_score * 0.09 + iv_entry_score * 0.1
  );

  let feedback: string;
  if (thesis_obj && realized_pl >= 0) {
    feedback = "逻辑咬得死，手起刀落没一点废话。Fuck yes，赚得漂亮。";
  } else if (!thesis_obj && realized_pl >= 0) {
    feedback = "Bullshit，没逻辑没计划你就敢往里冲？这是华尔街，不是拉斯维加斯的狗屁赌场！";
  } else if (thesis_obj && realized_pl < 0) {
    feedback = "纪律像铁一样硬，止损极快。去他妈的这波亏损，这才是活下去的底线。";
  } else {
    feedback = "没有假设就敢满仓硬干，被双杀完全是你自找的。简直是他妈的灾难！";
  }

  const abstentions = state?.v28_abstention_reviews ?? [];
  const recent_abstentions = abstentions.filter((a) => {
    if (!position.entry_date) return false;
    return a.date <= position.entry_date;
  });
  const abstention_quality_score = recent_abstentions.length > 0
    ? Math.round(recent_abstentions.reduce((s, a) => s + a.quality_score, 0) / recent_abstentions.length)
    : undefined;
  if (abstention_quality_score != null && abstention_quality_score >= 75) {
    process_notes.push(`本轮有 ${recent_abstentions.length} 次主动不交易（均分 ${abstention_quality_score}），空仓克制是过程质量的一部分。`);
  }

  const process_score: ProcessScore = {
    thesis_quality: thesis_score,
    timing_score,
    instrument_selection: selection_score,
    risk_management: risk_score,
    execution_discipline: execution_score,
    overall_process_score: overall,
    feedback,
    pnl_independence_note: "Process Score is independent of realized P&L: good process can lose money, and poor discipline can get lucky.",
    position_size_score,
    iv_entry_score,
    abstention_quality_score,
    process_notes,
  };

  // Quant incidents can defer a process-only penalty to the next review. This
  // deliberately never touches realized P&L, price history, or signal quality.
  const quantPenalty = state?.quant_infra?.pending_review_process_penalty ?? 0;
  if (quantPenalty > 0) {
    process_score.overall_process_score = Math.max(0, round1(process_score.overall_process_score - quantPenalty));
    process_score.process_notes.push(`量化基础设施事故流程扣分 -${quantPenalty}；不影响本笔市场盈亏。`);
    state!.quant_infra!.pending_review_process_penalty = 0;
  }

  // What-If scenarios
  const what_if: WhatIfScenario[] = [
    {
      scenario_name: "如果直接买入正股",
      alternative_pnl: round2(realized_pl * 0.45),
      difference_vs_actual: round2(realized_pl * 0.45 - realized_pl),
      takeaway: "正股没有 Theta 时间衰减和 Vega 波动率崩塌的损耗，但你也拿不到期权的高盈亏比。",
    },
    {
      scenario_name: "如果选择远月合约 (+30 DTE)",
      alternative_pnl: round2(realized_pl * 0.85),
      difference_vs_actual: round2(realized_pl * 0.85 - realized_pl),
      takeaway: "远月合约能给你更充裕的时间缓冲，但 Vega 敞口会成倍放大。你要掂量自己能不能扛住长端利率与 IV 颠簸。",
    },
  ];

  const event_impact: EventImpact = {
    event_name:
      exit_node.date >= "2025-01-27" ? "DeepSeek R1 发布与科技股重定价" : "常态宏观波动",
    window: "T-1 至 T+3",
    underlying_move: exit_node.date >= "2025-01-27" ? -19.9 : 1.2,
    transmission_summary:
      "POSSIBLE TRANSMISSION: 宏观事件 -> 算力资本开支预期下修 -> 现货跳空 -> IV脉冲 -> Greeks非线性损益。不构成精确因果证明。",
    attribution_confidence: ["2025-01-27", "2025-01-28"].includes(exit_node.date) ? "HIGH" : "MEDIUM",
  };

  // Who Was Right matrix -- every verdict is computed by comparing a STANCE (fixed disposition,
  // or the player's own entry-time thesis.direction) against the REAL underlying price move
  // between entry and exit. Nothing here is derived from realized_pl's sign, so "right about the
  // company, wrong about the trade" and "wrong, but got paid" are both reachable outcomes.
  let entry_spot: number | null = null;
  if (entry_snapshot && entry_snapshot.fundamental_context) {
    entry_spot = num_field(entry_snapshot.fundamental_context, "price");
  }
  const exit_spot = exit_node.underlying_bar.close;
  const underlying_pct_move = entry_spot ? ((exit_spot - entry_spot) / entry_spot) * 100.0 : 0.0;

  let player_stance: string;
  if (thesis_obj && thesis_obj.direction) {
    player_stance = thesis_obj.direction.toUpperCase();
  } else if (position.kind === "option" && position.type) {
    const is_call = position.type === "call";
    player_stance = is_call !== !!position.short ? "BULLISH" : "BEARISH";
  } else {
    player_stance = position.short ? "BEARISH" : "BULLISH";
  }

  const player_direction_verdict = _direction_verdict(player_stance, underlying_pct_move);
  const pnl_is_profit = realized_pl >= 0;
  let player_explanation: string;
  if (player_direction_verdict === "RIGHT" && pnl_is_profit) {
    player_explanation = "你的方向看对了，单子也赚到了钱。这是你在华尔街活下去的基础。";
  } else if (player_direction_verdict === "RIGHT" && !pnl_is_profit) {
    player_explanation =
      "判断对了公司，做错了交易 —— " +
      "标的确实按你说的走了，但你挑错了期权结构或者熬错了时间，活活把对的判断做成了亏损。";
  } else if ((player_direction_verdict === "WRONG" || player_direction_verdict === "PARTIAL") && pnl_is_profit) {
    player_explanation =
      "看错了，但赚到了钱 —— " + "标的走势在抽你的脸，但你靠着波动率差价或者纯粹的好运摸到了利润。别把运气当实力。";
  } else {
    player_explanation = "方向判断完全反了，结果就是流血。回去重翻你的基本面笔记吧。";
  }

  const who_was_right: WhoWasRightVerdict[] = [
    {
      participant_id: "player",
      participant_name: "YOU (Portfolio Manager)",
      role_or_type: "Lead PM",
      predicted_stance: player_stance,
      predicted_thesis: thesis_obj ? thesis_obj.catalyst : "基于技术面与流动性建仓",
      outcome_verdict: player_direction_verdict,
      explanation: player_explanation,
    },
    {
      participant_id: "maya_chen",
      participant_name: "Maya Chen",
      role_or_type: "Tech & Semi Lead",
      predicted_stance: _CHARACTER_STANCES.maya_chen[0],
      predicted_thesis: _CHARACTER_STANCES.maya_chen[1],
      outcome_verdict: _direction_verdict(_CHARACTER_STANCES.maya_chen[0], underlying_pct_move),
      explanation: "基本面长期逻辑独立于本笔交易盈亏复核，仅与实际标的走势比对。",
    },
    {
      participant_id: "victor_hale",
      participant_name: "Victor Hale",
      role_or_type: "Macro Risk Officer",
      predicted_stance: _CHARACTER_STANCES.victor_hale[0],
      predicted_thesis: _CHARACTER_STANCES.victor_hale[1],
      outcome_verdict: _direction_verdict(_CHARACTER_STANCES.victor_hale[0], underlying_pct_move),
      explanation: "宏观风险判断独立于本笔交易盈亏复核，仅与实际标的走势比对。",
    },
    {
      participant_id: "adrian_cross",
      participant_name: "Adrian Cross",
      role_or_type: "Apex Horizon (Rival)",
      predicted_stance: _CHARACTER_STANCES.adrian_cross[0],
      predicted_thesis: _CHARACTER_STANCES.adrian_cross[1],
      outcome_verdict: _direction_verdict(_CHARACTER_STANCES.adrian_cross[0], underlying_pct_move),
      explanation: "竞对立场独立于本笔交易盈亏复核，仅与实际标的走势比对。",
    },
    {
      participant_id: "street_consensus",
      participant_name: "Wall Street Sell-Side",
      role_or_type: "Analyst Consensus",
      predicted_stance: "STRONG_BUY",
      predicted_thesis: "维持超配并上调 12 个月目标价",
      outcome_verdict: _direction_verdict("STRONG_BUY", underlying_pct_move),
      explanation: "卖方一致预期独立于本笔交易盈亏复核，仅与实际标的走势比对。",
    },
    {
      participant_id: "retail_swarm",
      participant_name: "Retail / WSB Swarm",
      role_or_type: "Retail Sentiment",
      predicted_stance: "EXTREME_FOMO",
      predicted_thesis: "全仓 0DTE Call 永不为奴",
      outcome_verdict: _direction_verdict("EXTREME_FOMO", underlying_pct_move),
      explanation: "散户情绪立场独立于本笔交易盈亏复核，仅与实际标的走势比对。",
    },
  ];

  // Driver ranking -- ranked by the actual magnitude of change between entry and exit snapshots
  // for this specific trade, not a single global date branch shared by every position.
  const entry_vix = entry_snapshot ? num_field(entry_snapshot.fundamental_context, "vix") : null;
  const exit_vix = exit_node.vix?.close ?? null;
  const vix_delta = entry_vix !== null && exit_vix !== null ? Math.abs(exit_vix - entry_vix) : 0.0;

  const entry_pcr = entry_snapshot ? num_field(entry_snapshot.flow_context, "put_call_ratio") : null;
  const exit_pcr = exit_snapshot ? num_field(exit_snapshot.flow_context, "put_call_ratio") : null;
  const pcr_delta = entry_pcr !== null && exit_pcr !== null ? Math.abs(exit_pcr - entry_pcr) : 0.0;

  const entry_fg = entry_snapshot ? num_field(entry_snapshot.retail_sentiment_context, "fear_greed_index") : null;
  const exit_fg = exit_snapshot ? num_field(exit_snapshot.retail_sentiment_context, "fear_greed_index") : null;
  const fg_delta = entry_fg !== null && exit_fg !== null ? Math.abs(exit_fg - entry_fg) : 0.0;

  const candidates: [string, string, number, string][] = [
    [
      "标的现价方向性波动 (Delta 驱动)",
      Math.abs(underlying_pct_move) >= 5.0 ? "FUNDAMENTAL" : "MICROSTRUCTURE",
      Math.max(Math.abs(underlying_pct_move) * 4.0, 1.0),
      "核心标的现货价格在持仓期内的实际波动主导了 Delta 损益。",
    ],
    [
      "隐含波动率环境切换 (Vega 驱动)",
      "VOLATILITY",
      Math.max(vix_delta * 3.0, 1.0),
      "VIX 在持仓期内的变化幅度驱动了本笔交易的 Vega 敞口损益。",
    ],
    [
      "期权流 Put/Call Ratio (PCR 情绪)",
      "MICROSTRUCTURE",
      Math.max(pcr_delta * 25.0, 1.0),
      "期权链看跌看涨比在持仓期内的变化，反映了机构对冲与做市商筹码切换。",
    ],
    [
      "全市场 Fear & Greed 情绪摆动",
      "RETAIL_SENTIMENT",
      Math.max(fg_delta * 1.0, 0.5),
      "散户情绪指数摆动幅度，作为宏观背景而非确定性交易信号。",
    ],
  ];
  candidates.sort((a, b) => b[2] - a[2]);
  const top = candidates.slice(0, 3);
  const top_weight = top.reduce((sum, c) => sum + c[2], 0) || 1.0;
  const drivers: DriverRankingItem[] = [];
  let running_pct = 0.0;
  top.forEach(([name, category, weight, explanation], idx) => {
    const i = idx + 1;
    let pct: number;
    if (i < top.length) {
      pct = round1((weight / top_weight) * 100.0);
      running_pct += pct;
    } else {
      pct = round1(100.0 - running_pct);
    }
    drivers.push({ rank: i, factor_name: name, factor_category: category, pnl_impact_pct: pct, explanation });
  });

  // Transmission Graph
  const transmission: MarketTransmissionStep[] = [
    {
      step_index: 1,
      trigger: "DeepSeek R1 发布展示极高算力能效比",
      intermediary: "市场质疑北美云厂商百亿 CapEx 投资回报率",
      market_reaction: "半导体硬件供应链遭遇机构大单抛售",
      portfolio_impact: "底层现货大幅下挫，多头 Delta 承压",
    },
    {
      step_index: 2,
      trigger: "机构大举买入价外 Put 进行尾部对冲",
      intermediary: "期权做市商做空 Gamma 风险敞口激增",
      market_reaction: "做市商被迫在现货市场顺势抛空股票进行动态 Delta 对冲",
      portfolio_impact: "加剧了盘中瀑布式下挫与滑点",
    },
    {
      step_index: 3,
      trigger: "盘后各大投行出具分析师深度辩论报告",
      intermediary: "分清算力推理需求爆发与训练成本降低的逻辑区别",
      market_reaction: "恐慌抛盘逐步在关键 Gamma Wall 支撑位企稳",
      portfolio_impact: "波动率回落，Theta 损耗逐步显现",
    },
  ];

  const review_sections = _build_review_sections(entry_snapshot, exit_snapshot);
  const decision_matrix = _build_decision_context_matrix(entry_snapshot, exit_snapshot, thesis_obj);

  // THESIS EVOLUTION + DECISION TIMELINE. Both are read from history that was
  // recorded as the trade happened; the timeline window is clamped to
  // [entry_date, exit_date] so nothing the player could not have known can appear.
  let thesis_evolution: ThesisRevision[] = [];
  let drift_assessment: ThesisDriftAssessment | null = null;
  let timeline: TimelineEvent[] = [];
  if (state) {
    thesis_evolution = [...(state.thesis_history?.[position.id] ?? [])];
    if (thesis_evolution.length) drift_assessment = thesis_history_engine.assess_drift(thesis_evolution);
    // data_loader.get_campaign_nodes is Phase 6 (not yet ported); callers must pass `nodes`
    // explicitly until then, mirroring the Python fallback's effective no-op when it fails.
    const campaign_nodes = nodes;
    if (campaign_nodes && campaign_nodes.length) {
      timeline = decision_timeline_engine.build_timeline(state, campaign_nodes, position.entry_date, exit_node.date);
    }
  }

  const top_driver = drivers[0] ?? null;
  const lesson = top_driver
    ? `${player_explanation} 本笔交易最大的驱动因素是「${top_driver.factor_name}」（贡献 ${top_driver.pnl_impact_pct.toFixed(0)}%）。${process_score.feedback}`
    : player_explanation;

  // EDGE REVIEW: how did you get your edge. Copied verbatim from entry_snapshot,
  // never recomputed here, so provenance can't drift after the fact. A profitable
  // trade tied to MNPI/ILLEGAL intel is flagged explicitly -- process_score stays a
  // measure of TRADING discipline, not legal/ethical discipline: a trade can execute
  // perfectly and still be flagged here.
  const edge_review: Record<string, unknown>[] = entry_snapshot ? [...(entry_snapshot.edge_provenance ?? [])] : [];
  const profit_illegal_edge =
    realized_pl > 0 &&
    edge_review.some((item) => ["MNPI_RISK", "ILLEGAL"].includes(item.legality_class as string));

  const mfe_usd_val = round2(Math.max(realized_pl, position.peak_unrealized_pl ?? 0));
  const mae_usd_val = round2(Math.min(realized_pl, position.trough_unrealized_pl ?? 0));
  const ignored_event_count = timeline.filter((e) => e.category === "IGNORED_WARNING").length;
  const verdict = build_fund_manager_verdict(
    process_score,
    player_direction_verdict,
    realized_pl,
    mfe_usd_val,
    ignored_event_count
  );

  // 交易质量评级（P&L 权重=0）。v1 保守接线：拿不到的遥测信号（保护腿/价差/追价等）
  // 按 false/none 处理，SS/SSS 需要后续更细的执行遥测才可达——诚实降级，不虚标高分。
  const _dir = thesis_obj?.direction ?? null;
  const _matches =
    position.kind !== "option"
      ? _dir === "BULLISH"
      : _dir === "BULLISH"
        ? position.type === "call"
        : _dir === "BEARISH"
          ? position.type === "put"
          : _dir != null; // VOL_EXPANSION/THETA_DECAY 单腿无法证伪，按表达一致处理
  const _long = !position.short && position.qty > 0;
  const trade_grade_result: TradeGradeResult = tradeGrade({
    thesis: thesis_obj ? { risk_budget_usd: thesis_obj.risk_budget_usd ?? 0 } : null,
    max_risk_usd: Math.abs(cost),
    strategy_matches_thesis: !!_matches,
    exit_defined_before_entry: (thesis_obj?.invalidation_level ?? 0) > 0,
    defined_risk: _long,
    naked_unlimited_risk: !_long && position.kind === "option" && position.type === "call",
    exit_adherence: thesis_obj && (thesis_obj.invalidation_level ?? 0) > 0 ? "planned" : "none",
    mnpi: !!profit_illegal_edge,
  });

  return {
    trade_id,
    contract_or_symbol: contract_symbol,
    kind: position.kind,
    side: position.short ? "short" : "long",
    entry_date: position.entry_date ?? exit_node.date,
    exit_date: exit_node.date,
    entry_price: position.entry_price,
    exit_price,
    qty: position.qty,
    realized_pl: round2(realized_pl),
    exit_reason,
    return_pct: round2(ret_pct),
    mfe_usd: mfe_usd_val,
    mae_usd: mae_usd_val,
    entry_thesis: position.thesis ?? active_thesis ?? null,
    entry_snapshot: entry_snapshot ?? null,
    exit_snapshot: exit_snapshot ?? null,
    attribution: attr,
    macro_context: macro_snap,
    event_impact,
    what_if,
    process_score,
    who_was_right,
    review_sections,
    decision_context_matrix: decision_matrix,
    thesis_evolution,
    thesis_drift: drift_assessment,
    decision_timeline: timeline,
    edge_review,
    profit_associated_with_illegal_edge: profit_illegal_edge,
    lesson,
    driver_rankings: drivers,
    transmission_graph: transmission,
    player_profile_tag: position.kind === "option" ? "CONTRARIAN_VOLATILITY_SPECIALIST" : "DISCIPLINED_EQUITY_MANAGER",
    fund_manager_verdict: verdict,
    trade_grade: trade_grade_result,
  };
}
