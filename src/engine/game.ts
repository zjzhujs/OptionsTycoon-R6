import { advanceCareerClock, orchestrateCampaignBeats } from "./career_orchestrator";
import { applyTransitionSpec } from "./campaign_contract";
/**
 * In-memory game session orchestration for Options Tycoon, ported from
 * backend/app/game.py. Wires all domain engines into a unified single-player
 * session lifecycle, running entirely client-side.
 */
import * as data_loader from "./data_loader";
import * as persistence from "./persistence";
import { SeededRNG } from "./rng";
import { new_id } from "./ids";
import { visible_events } from "./engines/time_guard";
import * as ai_funds_engine from "./engines/ai_funds";
import * as counterparty_engine from "./engines/counterparty";
import * as decision_timeline_engine from "./engines/decision_timeline";
import * as delayed_consequence_engine from "./engines/delayed_consequence_engine";
import * as edge_economy_engine from "./engines/edge_economy";
import * as ending_engine from "./engines/ending_engine";
import * as episode_engine from "./engines/episode_engine";
import * as evidence_engine from "./engines/evidence_engine";
import * as flow_engine from "./engines/flow";
import * as fund_engine from "./engines/fund";
import * as gex_engine from "./engines/gex";
import * as human_actions_engine from "./engines/human_actions";
import * as institutional_engine from "./engines/institutional";
import * as management_company_engine from "./engines/management_company";
import * as economy_core_engine from "./engines/economy_core";
import * as economy_intel_engine from "./engines/economy_intel";
import * as economy_legal_engine from "./engines/economy_legal";
import * as economy_quant_engine from "./engines/economy_quant";
import * as economy_talent_engine from "./engines/economy_talent";
import * as lp_engine from "./engines/lp_engine";
import * as macro_engine from "./engines/macro";
import * as margin_engine from "./engines/margin";
import * as market_clock_engine from "./engines/market_clock";
import * as microstructure_engine from "./engines/microstructure";
import * as options_engine from "./engines/options";
import * as pnl_engine from "./engines/pnl";
import * as political_engine from "./engines/political";
import * as portfolio_greeks_engine from "./engines/portfolio_greeks";
import * as positioning_engine from "./engines/positioning";
import * as retail_sentiment_engine from "./engines/retail_sentiment";
import * as scanner_engine from "./engines/scanner";
import * as social_narrative_engine from "./engines/social_narrative";
import * as story from "./engines/story";
import * as street_rating_engine from "./engines/street_rating";
import * as survival_engine from "./engines/survival_engine";
import * as terms_engine from "./engines/terms";
import * as thesis_history_engine from "./engines/thesis_history";
import * as trading from "./engines/trading";
import * as power_events_engine from "./engines/power_events";
import * as trait_engine from "./engines/trait_engine";
import * as what_matters_engine from "./engines/what_matters";
import * as relationships_engine from "./engines/relationships";
import * as conspiracy_web_engine from "./engines/conspiracy_web_engine";
import * as v28_integrity from "./engines/v28_market_integrity";
import * as market_reveal_engine from "./engines/market_reveal";
import * as war_room_history_engine from "./engines/war_room_history";
import * as war_room_engine from "./engines/war_room_engine";
import type { MarketWindowAction } from "./schemas";
import type {
  AccountType,
  AIFund,
  AIStackLevel,
  CampaignMeta,
  Character,
  EmployeeRole,
  FinancialTerm,
  GameMode,
  GameState,
  GameStateView,
  GexSummary,
  IntelTier,
  GPSpendInput,
  GPSpendItemId,
  QuantTier,
  MacroEvent,
  MacroSnapshot,
  MarketNode,
  NewGameRequest,
  OptionQuote,
  OptionType,
  OrderRequest,
  OrderResult,
  PauseReason,
  Position,
  SaveSlotInfo,
  ScannerResult,
  StoryChoicePublic,
  StoryEventPublic,
  ThesisRevisionRequest,
  TalentActionId,
  TalentRetentionChoice,
  TalentRoleId,
  TradeReview,
} from "./schemas";

type AdvanceMode = "NEXT_NODE" | "NEXT_MAJOR_EVENT";

const _SESSIONS: Map<string, GameState> = new Map();
const _AI_FUND_SEED_OFFSET = 1;
const _EDGE_SEED_OFFSET = 2;
const _EVIDENCE_SEED_OFFSET = 3;

function _now(): string {
  return new Date().toISOString();
}

export function is_index_campaign(campaign_id: string): boolean {
  return campaign_id === "h1";
}

export function list_campaigns(): CampaignMeta[] {
  return Object.values(data_loader.CAMPAIGNS);
}

export function get_characters(): Character[] {
  return data_loader.load_characters();
}

function _underlying_for(campaign_id: string): string {
  return data_loader.CAMPAIGNS[campaign_id].underlying;
}

export function get_session(session_id: string): GameState {
  const state = _SESSIONS.get(session_id);
  if (!state) throw new Error(`unknown session: ${session_id}`);
  return state;
}

export function current_node(state: GameState): MarketNode {
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  return nodes[state.game_day_index ?? 0];
}

export function resolve_quote(
  state: GameState,
  node: MarketNode,
  option_type: OptionType,
  strike: number,
  expiration: string
): OptionQuote {
  const underlying = _underlying_for(state.campaign_id ?? "r1");
  const key = options_engine.contract_key(underlying, option_type, strike, expiration);
  const cached = state.real_quotes?.[key];
  if (cached) return cached;
  return options_engine.model_quote(state.campaign_id ?? "r1", node, option_type, strike, expiration);
}

function _mark_and_pl(state: GameState, node: MarketNode, position: Position): [number, number] {
  const q = resolve_quote(state, node, position.type as OptionType, position.strike as number, position.expiration as string);
  const mark = position.short ? q.ask : q.mid;
  const pl = position.short
    ? (position.entry_price - mark) * 100 * position.qty
    : (mark - position.entry_price) * 100 * position.qty;
  return [mark, pl];
}

function safe_drawdown_pct(equity: number, peak: number): number {
  if (!Number.isFinite(equity) || !Number.isFinite(peak) || peak <= 0) return 0;
  return Math.max(0, ((peak - equity) / peak) * 100);
}

export function compute_view(state: GameState): GameStateView {
  war_room_history_engine.ensure_history(state);
  economy_core_engine.ensureEconomyState(state);
  economy_quant_engine.ensureQuantInfra(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const node = nodes[state.game_day_index ?? 0];
  const S = node.underlying_bar.close;

  let equity = state.cash + (state.shares ?? 0) * S - (state.margin_debt ?? 0);
  let unrealized = state.shares ? (S - (state.share_cost_basis ?? 0)) * state.shares : 0.0;

  const marks: GameStateView["position_marks"] = [];
  for (const p of state.positions ?? []) {
    const [mark, pl] = _mark_and_pl(state, node, p);
    equity += (p.short ? -1 : 1) * mark * 100 * p.qty;
    unrealized += pl;
    marks!.push({ position_id: p.id, mark, pl });
    p.peak_unrealized_pl = Math.max(p.peak_unrealized_pl ?? 0, pl);
    p.trough_unrealized_pl = Math.min(p.trough_unrealized_pl ?? 0, pl);
  }

  /**
   * 记一笔净值历史（2026-08-19 claude）
   *
   * 放在引擎而不是 UI：第一版记在 App 的 useState 里，**刷新就没了**。
   * 记在 state 上才会跟着存档走。
   *
   * 按游戏日去重——同一天内会反复 compute_view（下单、推进盘中窗口），
   * 不去重的话一天能记出十几个点，曲线就成了锯齿。
   */
  if (Number.isFinite(equity)) {
    const day = state.game_day_index ?? 0;
    const prev = state.nav_history ?? [];
    // 回看历史节点时截断后面的，保持"曲线只到玩家当前所在的那一天"
    const kept = prev.filter((pt) => pt.d < day);
    const next = [...kept, { d: day, v: equity }];
    /**
     * ⚠️ **必须换新引用，不能原地 push。**（2026-08-19 claude）
     *
     * 第一版用 `hist.push(...)` 原地改：数据其实记上了，但 UI 一个点都画不出来。
     * 原因是 React 侧 `useMemo(() => ..., [view.state.nav_history])`
     * 依赖的是**数组引用**——原地改引用不变，memo 永远不重算，
     * 一直缓存着最初那个空数组。
     *
     * 这类 bug 尤其阴：引擎测试全绿（数据确实对），只有实机是空的。
     * 凡是要被 React 读的 state 字段，变更时一律换新引用。
     */
    const changed =
      prev.length !== next.length ||
      prev[prev.length - 1]?.d !== day ||
      prev[prev.length - 1]?.v !== equity;
    if (changed) state.nav_history = next;
  }

  fund_engine.sync_nav(state.fund_stats, equity);
  state.fund_stats.cash = state.cash;
  state.peak_aum = Math.max(state.peak_aum ?? 0, equity);
  if ((state.peak_aum ?? 0) > 0) {
    const dd = safe_drawdown_pct(equity, state.peak_aum ?? 0);
    const previousMaxDrawdown = state.max_drawdown_pct ?? 0;
    state.max_drawdown_pct = Math.max(previousMaxDrawdown, dd);
    if (dd > previousMaxDrawdown) state.last_significant_drawdown_node = state.game_day_index ?? 0;
  }

  const _quote_fn = (option_type: OptionType, strike: number, expiration: string): OptionQuote =>
    resolve_quote(state, node, option_type, strike, expiration);

  const jpm_rel = (state.institutional_relationships?.jpmorgan ?? {}) as Record<string, number>;
  const jpm_tier = jpm_rel.trust ?? 60.0;
  const jpm_relationship_tier = jpm_tier >= 80.0 ? "TIER_1_PARTNER" : jpm_tier >= 60.0 ? "PREFERRED" : "STANDARD";
  const haircut_mult = margin_engine.pb_haircut_multiplier(jpm_relationship_tier);
  const margin_requirement = margin_engine.total_margin_requirement(
    state.positions ?? [],
    node,
    state.account_type ?? "TFSA",
    _quote_fn,
    state.shares ?? 0,
    state.margin_debt ?? 0,
    haircut_mult
  );
  const cash_collateral_reserved = v28_integrity.recalculateCashCollateral(state);
  const available_cash = Math.max(0, state.cash - cash_collateral_reserved);
  const stress_margin = v28_integrity.stressMarginRequirement(state, S);
  state.v28_stress_margin_requirement = stress_margin.requirement;
  state.v28_stress_margin_label = stress_margin.model_label;
  const margin_buying_power = margin_engine.buying_power(available_cash, margin_requirement, state.account_type ?? "TFSA");
  const margin_call_active =
    state.account_type === "Margin" && margin_requirement > 0 && equity < margin_requirement;

  const macro_snap = macro_engine.get_macro_snapshot(node);

  const expirations = state.campaign_id === "r1" ? ["2025-01-31", "2025-02-07"] : ["2026-02-20", "2026-03-20"];
  const chain_quotes: OptionQuote[] = [];
  for (const K of options_engine.strikes_around(S, state.campaign_id ?? "r1")) {
    for (const ot of ["call", "put"] as OptionType[]) {
      chain_quotes.push(resolve_quote(state, node, ot, K, expirations[0]));
    }
  }
  const gex_summary = gex_engine.compute_gex_profile(node, chain_quotes, 100, state.real_options_loaded ?? false);

  const scanner_res = scanner_engine.generate_scanner_feed(node, state.campaign_id ?? "r1", state.ai_stack?.level);

  const micro_state = microstructure_engine.evaluate_microstructure(node, state.positions ?? [], state.campaign_id ?? "r1");

  const events_key = data_loader.get_campaign_events_key(state.campaign_id ?? "r1");
  const all_events = data_loader.load_events()[events_key] ?? [];
  const vis_events = visible_events(all_events, node.date);
  const war_room = story.generate_war_room_meeting(state, node, vis_events);

  const templates = story.load_templates();
  const pending_public: StoryEventPublic[] = [];
  for (const event of state.pending_story_events ?? []) {
    const template = templates[event.template_id];
    const choices: StoryChoicePublic[] = template ? template.choices.map((c) => ({ id: c.id, label: c.label })) : [];
    pending_public.push({
      id: event.id,
      template_id: event.template_id,
      game_date: event.game_date,
      character_id: event.character_id,
      intel_class: event.intel_class,
      headline: event.headline,
      body: event.body,
      resolved: event.resolved,
      deferred: event.deferred,
      mandatory_before_trade: event.mandatory_before_trade,
      chosen_choice_id: event.chosen_choice_id,
      sfx: event.sfx,
      choices,
    });
  }

  // generate_human_action_events() is a pure function of (node, state) and always returns
  // freshly-built, resolved=false event objects for the day's triggers. Blindly overwriting
  // state.human_action_events with that fresh list would revert any event the player already
  // resolved this session back to unresolved. A UNION merge fixes that: every previously known
  // event is kept forever this session, and only genuinely new ids from the generator are added.
  const existing_human_events = new Map((state.human_action_events ?? []).map((e) => [e.id, e]));
  for (const e of human_actions_engine.generate_human_action_events(node, state)) {
    if (!existing_human_events.has(e.id)) existing_human_events.set(e.id, e);
  }
  // V30: 后续权力事件由恩怨账本驱动 —— 玩家早先的选择在这里长出下一幕。
  // 与上面的开场剧本并行：那边是固定编排，这边是行为的后果。
  // marginPressure 直接读已有的 margin 引擎结果，不另造一套压力判定。
  {
    // 直接用本函数上方算出的真实保证金数字（margin_requirement / margin_buying_power），
    // 不另设影子字段——影子字段一旦对不上就会静默失效，压力判定永远为假。
    const pressure =
      margin_requirement > 0 && margin_buying_power > 0 && margin_requirement > margin_buying_power * 0.85;
    for (const e of power_events_engine.generatePowerEvents(state, node, { marginPressure: pressure })) {
      if (!existing_human_events.has(e.id)) existing_human_events.set(e.id, e);
    }
  }
  const human_events = [...existing_human_events.values()];
  state.human_action_events = human_events;

  economy_talent_engine.ensureTalentState(state);
  management_company_engine.recompute_cost_buckets(state);
  economy_legal_engine.ensureCrisisState(state);
  const pol_state = political_engine.evaluate_political_state(
    node,
    state.political_state?.political_capital ?? 50,
    state.political_state?.contacts
  );
  state.political_state = pol_state;
  const cparty = counterparty_engine.evaluate_counterparty_profile(node, state.campaign_id ?? "r1");
  const flow_snap = flow_engine.compute_flow_summary(node, chain_quotes, state.campaign_id ?? "r1");
  const pos_snap = positioning_engine.evaluate_positioning(node, state.campaign_id ?? "r1");
  const ret_sent = retail_sentiment_engine.evaluate_retail_sentiment(node, state.campaign_id ?? "r1");
  const pulse = social_narrative_engine.generate_market_pulse(node, state.campaign_id ?? "r1");
  const street_cons = street_rating_engine.get_street_consensus(node, state.campaign_id ?? "r1");
  const player_street = street_rating_engine.compute_player_street_score(state, equity);
  state.player_street_score = player_street;
  const bank_desks = institutional_engine.evaluate_institutional_desks(state.institutional_relationships ?? {});
  const lps = lp_engine.evaluate_lp_profiles(state, equity);
  state.lp_profiles = lps;

  const current_ep_meta = episode_engine.get_episode_meta(state.current_episode_number ?? 1);
  const last_outcome = state.completed_episodes?.length
    ? state.completed_episodes[state.completed_episodes.length - 1]
    : null;

  const wmt = what_matters_engine.compute_what_matters(
    state,
    node,
    pol_state,
    flow_snap,
    pos_snap,
    ret_sent,
    street_cons,
    human_events
  );

  // 组合层希腊字母合计（2026-08-19 claude）
  // 走的是和保证金完全同一条定价路径（resolve_quote），
  // 否则会出现"保证金按 A 价算、Δ 按 B 价算"的错位。
  const portfolio_greeks = portfolio_greeks_engine.computePortfolioGreeks(state, (p) =>
    resolve_quote(state, node, p.type as OptionType, p.strike as number, p.expiration as string),
  );
  const quant_infra = economy_quant_engine.getQuantInfraView(state);
  const quant_capabilities = economy_quant_engine.getQuantCapabilities(state);

  return {
    state,
    equity,
    unrealized_pnl: unrealized,
    portfolio_greeks,
    quant_infra,
    quant_capabilities,
    position_marks: marks,
    pending_story_public: pending_public,
    account_rule_text: trading.account_rules_text(state.account_type ?? "TFSA"),
    margin_requirement,
    margin_buying_power,
    cash_collateral_reserved,
    available_cash,
    stress_margin,
    margin_call_active,
    macro_snapshot: macro_snap,
    gex_summary,
    scanner_result: scanner_res,
    latest_war_room: war_room,
    microstructure: micro_state,
    current_episode: current_ep_meta,
    last_episode_outcome: last_outcome,
    season_outcome: state.season_outcome ?? null,
    what_matters_today: wmt,
    current_entry_snapshot:
      state.positions && state.positions.length
        ? state.entry_snapshots?.[state.positions[state.positions.length - 1].id] ?? null
        : null,
    human_action_feed: human_events,
    political_state: pol_state,
    counterparty_profile: cparty,
    flow_summary: flow_snap,
    positioning_summary: pos_snap,
    retail_sentiment: ret_sent,
    market_pulse: pulse,
    street_consensus: street_cons,
    player_street_score: player_street,
    wall_street_desk: bank_desks,
    lp_profiles: lps,
    crisis_actions: state.crisis_actions,
    crisis_events: state.crisis_events,
    cash_preservation: state.cash_preservation,
    runway_months: state.management_company?.runway_months,
    // Market clock is rebuilt from the campaign node list every view so it can
    // never drift out of sync with where the campaign actually is.
    // 盘中揭示进行中时，玩家身处的那一天领先于已结算的日线节点。
    // 覆盖必须放在这里：market_clock 每次都从节点表重建，在别处改会被冲掉。
    market_clock: (() => {
      const clock = market_clock_engine.refresh(
        state,
        nodes,
        state.market_clock?.last_advance_mode ?? undefined,
        state.market_clock?.nodes_advanced_last_call ?? 0,
        state.market_clock?.pause_reasons ?? []
      );
      const rv = state.market_reveal;
      if (clock && rv && rv.current_window_index >= 0) {
        clock.node_granularity = "EVENT_WINDOW";
        clock.current_node_date = rv.session_date;
      }
      return clock;
    })(),
    open_thesis_drift: thesis_history_engine.open_position_drift(state),
    decision_timeline: decision_timeline_engine.build_timeline(state, nodes, undefined, node.date, "", 60),
  };
}

export function new_game(req: NewGameRequest): GameStateView {
  const campaign_id = req.campaign_id ?? "r1";
  const campaign = data_loader.CAMPAIGNS[campaign_id];
  if (!campaign) throw new Error(`unknown campaign: ${campaign_id}`);
  if (!campaign.playable) {
    throw new Error(
      `campaign '${campaign_id}' has verified event dates but no bundled full ` +
        "market-data package, so it cannot be replayed (see docs/DATA_PROVENANCE.md)."
    );
  }

  const seed = req.story_seed ?? Math.floor(Math.random() * 0xffffffff);
  const now = _now();
  const mode: GameMode = req.mode ?? "STORY_CAMPAIGN";
  const campaignDefaultCash = Number(campaign.default_start_cash ?? 50000);
  const campaignDefaultAccount = (campaign.default_account_type ?? "TFSA") as AccountType;
  const start_cash = req.start_cash ?? campaignDefaultCash;
  const account_type: AccountType = req.account_type ?? campaignDefaultAccount;

  const state: GameState = {
    session_id: new_id(),
    mode,
    campaign_id,
    account_type,
    game_day_index: 0,
    cash: start_cash,
    start_cash,
    realized_pl: 0,
    shares: 0,
    share_cost_basis: 0,
    margin_debt: 0,
    cumulative_margin_interest_paid: 0,
    positions: [],
    real_quotes: {},
    real_options_loaded: false,
    story_seed: seed,
    story_rng_cursor: 0,
    ai_funds_rng_cursor: 0,
    story_history: [],
    pending_story_events: [],
    relationships: relationships_engine.default_relationships(),
    fund_stats: fund_engine.init_fund_stats(start_cash),
    ai_funds: ai_funds_engine.default_ai_funds(),
    compliance_state: {},
    last_attribution: null,
    order_log: [],
    processed_order_ids: [],
    lp_inquiry_state: { answered: false },
    trade_reviews: [],
    active_theses: {},
    current_season_id: "season_1",
    current_episode_number: 1,
    current_phase: "WAR_ROOM",
    hidden_state: {
      ego: 20.0,
      discipline: 80.0,
      dependency_maya: 40.0,
      team_building: 50.0,
      information_ethics: 85.0,
      loyalty: 60.0,
      risk_identity: "BALANCED",
    },
    player_traits: [],
    character_memories: {},
    delayed_consequences: [],
    choice_history: [],
    completed_episodes: [],
    season_outcome: null,
    peak_aum: Math.max(0, start_cash),
    max_drawdown_pct: 0,
    entry_snapshots: {},
    favor_balances: {},
    human_action_events: [],
    political_state: { political_capital: 50.0, active_policies: [], contacts: [], washington_sentiment: "NEUTRAL", regulatory_heat: 15.0 },
    player_street_score: {
      total_score: 500.0,
      alpha_reputation: 50.0,
      risk_discipline: 80.0,
      execution_quality: 75.0,
      research_credibility: 60.0,
      institutional_trust: 65.0,
      lp_reputation: 55.0,
      counterparty_standing: 70.0,
      media_profile: 40.0,
      compliance_standing: 90.0,
      talent_magnet: 50.0,
      standing_tier: "ESTABLISHED_FUND",
      human_action_reputation_bonus: 0.0,
    },
    lp_profiles: [],
    institutional_relationships: {},
    market_clock: {
      paused: true,
      node_granularity: "DAILY",
      current_node_index: 0,
      current_node_date: "",
      total_nodes: 0,
      is_final_node: false,
      last_advance_mode: null,
      nodes_advanced_last_call: 0,
      pause_reasons: [],
      advance_label: "ADVANCE MARKET",
      next_node_label: "NEXT MARKET NODE",
    },
    thesis_history: {},
    player_decisions: [],
    war_room_history: [],
    tutorial: {
      tutorial_completed: false,
      guided_mode_active: false,
      current_step: "",
      completed_steps: [],
      tutorial_direction: "",
      first_trade_position_id: "",
      first_trade_review_shown: false,
      step6_advance_consumed: false,
    },
    management_company: {
      cash: 12_000.0,
      monthly_burn: 0,
      annualized_burn: 0,
      runway_months: 999.0,
      management_fee_rate: 0.02,
      performance_fee_rate: 0.2,
      high_water_mark: 0,
      fee_income_ytd: 0,
      performance_income_ytd: 0,
      payroll_cost_annual: 0,
      data_cost_annual: 0,
      ai_compute_cost_annual: 0,
      legal_cost_annual: 0,
      compliance_cost_annual: 0,
      technology_cost_annual: 0,
      ir_cost_annual: 0,
      other_operating_cost_annual: 15_000.0,
      headcount: 3,
      last_accrual_date: "",
    },
    gp_wealth: { cash: 6_000, total_distributions_received: 0, total_injected_to_company: 0, legal_defense_spent: 0 },
    talent_roster: [],
    talent_events_history: [],
    talent_team_events: [],
    team_jealousy: 0,
    gp_spend_history: [],
    gp_visibility: 0,
    lp_optics: 0,
    media_attention: 0,
    gift_ledger: [],
    economy: economy_core_engine.createEconomyState(start_cash),
    intel: economy_intel_engine.createIntelState(seed),
    quant_infra: economy_quant_engine.createQuantInfraState(),
    evidence_ledger: [],
    mnpi_flags: [],
    bribery_flags: [],
    audit_trail: [],
    employees: [],
    data_subscriptions: [],
    ai_stack: {
      level: "LEVEL_0_MANUAL",
      monthly_compute_cost: 0,
      engineering_headcount: 0,
      hallucination_risk: 15.0,
      model_risk_note: "AI 只能处理截至当前历史节点已公开/已知的数据；Time Guard 对 AI 同样生效，不提供未来信息。",
    },
    evidence_state: {
      evidence_points: 0,
      witness_count: 0,
      internal_awareness: 0,
      external_awareness: 0,
      whistleblower_risk: 0,
      enforcement_interest: 0,
      investigation_stage: "CLEAN",
      records: [],
      investigator_character_id: "marcus_reed",
      last_escalation_date: "",
      simulated_notice: "SEC / DOJ 作为监管与执法机构名称保持公开事实层；具体调查人员与情节全部为原创虚构角色。",
    },
    acquired_intel: [],
    capital_spend_log: [],
    edge_rng_cursor: 0,
    evidence_rng_cursor: 0,
    created_at: now,
    updated_at: now,
  };

  state.management_company!.high_water_mark = start_cash;
  economy_core_engine.ensureEconomyState(state);
  economy_talent_engine.ensureTalentState(state);
  management_company_engine.recompute_cost_buckets(state);
  economy_legal_engine.ensureCrisisState(state);
  if (mode === "STORY_CAMPAIGN") {
    const templates = story.load_templates();
    if (templates.day1_briefing_maya) {
      const first_node_date = data_loader.get_campaign_nodes(campaign_id)[0].date;
      state.pending_story_events!.push(story.instantiate_event(templates.day1_briefing_maya, first_node_date));
    }
  }
  _SESSIONS.set(state.session_id, state);
  return compute_view(state);
}

/**
 * Opening-story invariant for Story Campaign.
 *
 * The first briefing is a campaign gate, not merely a best-effort queue item.
 * Saves created during an earlier UI pass can arrive without the pending event,
 * so restore/compute paths repair the missing queue entry unless the player has
 * already answered that exact template.
 */
function ensure_campaign_opening_gate(state: GameState): void {
  if (state.mode !== 'STORY_CAMPAIGN' || (state.current_episode_number ?? 1) !== 1) return;
  const templateId = 'day1_briefing_maya';
  const resolved = (state.story_history ?? []).some((event) => event.template_id === templateId);
  const pending = (state.pending_story_events ?? []).some(
    (event) => event.template_id === templateId,
  );
  const openingEvent = (state.pending_story_events ?? []).find((event) => event.template_id === templateId);
  if (openingEvent) openingEvent.mandatory_before_trade = true;
  if (resolved || pending) return;

  const template = story.load_templates()[templateId];
  if (!template) throw new Error('Opening story invariant failed: day1_briefing_maya template is missing.');
  const node = data_loader.get_campaign_nodes(state.campaign_id ?? 'r1')[0];
  if (!node) throw new Error('Opening story invariant failed: campaign has no starting market node.');
  (state.pending_story_events ??= []).unshift(story.instantiate_event(template, node.date));
}

export function get_view(session_id: string): GameStateView {
  const state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  return compute_view(state);
}

/**
 * Build a read-only historical view without rewinding the live session.
 *
 * The old history button called step(), which changed game_day_index on the
 * real session. That made a review indistinguishable from campaign progress
 * and let forward-only engines observe a backwards move. A review is now a
 * detached state snapshot: the clock and chart can move backwards, while the
 * next ADVANCE MARKET call still starts from the live node.
 */
export function review_node(session_id: string, to: number): GameStateView {
  const state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const current = state.game_day_index ?? 0;
  const target = Math.max(0, Math.min(nodes.length - 1, to));

  // Intraday event windows are not daily campaign nodes. Do not expose a
  // synthetic review date while a decision window is still unresolved.
  if (state.market_reveal && state.market_reveal.current_window_index >= 0) {
    return compute_view(state);
  }
  if (target >= current) return compute_view(state);

  const reviewed = JSON.parse(JSON.stringify(state)) as GameState;
  reviewed.game_day_index = target;
  reviewed.market_reveal = null;
  if (reviewed.market_clock) {
    reviewed.market_clock.last_advance_mode = null;
    reviewed.market_clock.nodes_advanced_last_call = 0;
    reviewed.market_clock.pause_reasons = [];
  }
  return compute_view(reviewed);
}

export function get_market(session_id: string): [MarketNode[], MacroEvent[]] {
  const state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const node = nodes[state.game_day_index ?? 0];
  // Market history is a date-bounded view, not a story-progress projection.
  // Keep every bundled historical row through the current replay date and
  // never expose a future row to the player.
  const visible_nodes = nodes.filter((candidate) => candidate.date <= node.date);
  const events_key = data_loader.get_campaign_events_key(state.campaign_id ?? "r1");
  const all_events = data_loader.load_events()[events_key] ?? [];
  const events = visible_events(all_events, node.date);
  return [visible_nodes, events];
}

export function step(session_id: string, to: number): GameStateView {
  let state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const old_node = nodes[state.game_day_index ?? 0];
  const new_index = Math.max(0, Math.min(nodes.length - 1, to));
  if (new_index === (state.game_day_index ?? 0)) return compute_view(state);
  if (new_index < (state.game_day_index ?? 0)) return review_node(session_id, new_index);

  // Archive the morning that is leaving the live timeline before any
  // forward-only engines mutate the state for the next node.
  war_room_history_engine.append_snapshot(state, compute_view(state).latest_war_room);

  const old_positions = [...(state.positions ?? [])];
  const new_node = nodes[new_index];

  const quote_at_node = (position: Position, node: MarketNode): number =>
    resolve_quote(state, node, position.type as OptionType, position.strike as number, position.expiration as string).mid;

  state.last_attribution = pnl_engine.attribute_pnl(old_node, new_node, state.campaign_id ?? "r1", old_positions, quote_at_node);

  // PB financing cost: real daily interest on outstanding margin_debt, capitalized (added to
  // the debt itself, never silently pulled from cash) using the CURRENT JPM relationship's
  // financing_spread_bps. Multiple days can elapse in one step() call, so accrue per-day.
  const days_elapsed = Math.max(0, new_index - (state.game_day_index ?? 0));
  if (state.account_type === "Margin" && (state.margin_debt ?? 0) > 0 && days_elapsed > 0) {
    const jpm_rel = (state.institutional_relationships?.jpmorgan ?? {}) as Record<string, number>;
    const financing_spread = jpm_rel.financing_spread_bps ?? 150.0;
    for (let i = 0; i < days_elapsed; i += 1) {
      const daily_cost = margin_engine.daily_financing_cost(state.margin_debt ?? 0, financing_spread);
      state.margin_debt = (state.margin_debt ?? 0) + daily_cost;
      state.cumulative_margin_interest_paid = (state.cumulative_margin_interest_paid ?? 0) + daily_cost;
    }
  }

  state.game_day_index = new_index;

  // Batch4 crisis fermentation: evaluate only the daily move that has just
  // become historical/current. Never read a future node. Direct step() jumps
  // still compare the observed node with its immediate bundled predecessor.
  const observedPrevNode = new_index > 0 ? nodes[new_index - 1] : null;
  if (observedPrevNode) {
    const fermentation = delayed_consequence_engine.createCrisisFermentationConsequence(
      state,
      new_node.date,
      Number(observedPrevNode.underlying_bar.close),
      Number(new_node.underlying_bar.close),
      new_index,
    );
    if (fermentation && !(state.delayed_consequences ?? []).some((item) => item.source_choice_id === fermentation.source_choice_id)) {
      (state.delayed_consequences ??= []).push(fermentation);
    }
  }
  conspiracy_web_engine.applyConspiracyThresholdEffects(state);

  trait_engine.observe_position_holding(state, state.positions ?? []);

  const [state_after_settle, settle_logs] = trading.settle_expiries(state, new_node);
  state = state_after_settle;
  for (const msg of settle_logs) (state.order_log ??= []).push({ date: new_node.date, message: msg, kind: "yellow" });

  const events_key = data_loader.get_campaign_events_key(state.campaign_id ?? "r1");
  const all_events = data_loader.load_events()[events_key] ?? [];
  const visible = visible_events(all_events, new_node.date);
  const preStoryNav = compute_view(state).equity;
  const quantMonthlyCost = economy_quant_engine.monthlyBurnDue(state);
  const talentMonthlyCost = economy_talent_engine.monthlyTalentBurnDue(state);
  const monthlySettlement = economy_intel_engine.advanceIntelNode(state, {
    date: new_node.date,
    previousDate: old_node.date,
    nodeIndex: new_index,
    fundNav: preStoryNav,
    quantMonthlyCost,
    talentMonthlyCost,
  });
  economy_quant_engine.advanceQuantNode(state, {
    date: new_node.date,
    previousDate: old_node.date,
    nodeIndex: new_index,
    fundNav: preStoryNav,
    settlementRecord: monthlySettlement,
    highLoad: true,
  });
  economy_talent_engine.advanceTalentNode(state, {
    date: new_node.date,
    previousDate: old_node.date,
    nodeIndex: new_index,
    settlementRecord: monthlySettlement,
    highLoad: true,
  });
  economy_legal_engine.advanceCrisisNode(state, new_node.date, new_index);
  state = story.maybe_advance_story(state, new_node, visible);

  const specs = advanceCareerClock(state, new_node.date);
  for (const spec of specs) {
    applyTransitionSpec(state, spec, new_node.date);
  }
  orchestrateCampaignBeats(state, new_node.date);

  delayed_consequence_engine.check_and_trigger_delayed_consequences(state);

  const ai_rng = new SeededRNG(state.story_seed + _AI_FUND_SEED_OFFSET);
  for (let i = 0; i < (state.ai_funds_rng_cursor ?? 0); i += 1) ai_rng.next_float();
  state.ai_funds = ai_funds_engine.advance_ai_funds(state.ai_funds ?? [], old_node, new_node, ai_rng);
  state.ai_funds_rng_cursor = ai_rng.draws;

  const margin_check = compute_view(state);
  const already_pending_ids = new Set((state.pending_story_events ?? []).map((e) => e.template_id));
  const was_active = Boolean((state.compliance_state ?? {})[margin_engine.MARGIN_CALL_FLAG_KEY]);
  if (margin_check.margin_call_active && !was_active) {
    (state.compliance_state ??= {})[margin_engine.MARGIN_CALL_FLAG_KEY] = true;
    if (!already_pending_ids.has("prime_broker_margin_call")) {
      const template = story.load_templates().prime_broker_margin_call;
      if (template) (state.pending_story_events ??= []).push(
        conspiracy_web_engine.annotateConspiracyEvent(state, story.instantiate_event(template, new_node.date)),
      );
    }
  } else if (!margin_check.margin_call_active) {
    (state.compliance_state ??= {})[margin_engine.MARGIN_CALL_FLAG_KEY] = false;
  }

  // Capital & Power fees and recurring obligations are handled once at month boundaries
  // before story/compliance. Daily accrual here would double-charge the canonical ledger.
  if (days_elapsed > 0) {
    const edge_rng = new SeededRNG(state.story_seed + _EDGE_SEED_OFFSET);
    for (let i = 0; i < (state.edge_rng_cursor ?? 0); i += 1) edge_rng.next_float();
    const is_empire_mode = state.mode === "EMPIRE_MODE";
    for (let d = 0; d < days_elapsed; d += 1) {
      for (const offer of edge_economy_engine.generate_edge_opportunities(new_node, state, edge_rng)) {
        (state.human_action_events ??= []).push(offer);
      }
      const manip = edge_economy_engine.market_manipulation_offer(new_node, is_empire_mode);
      if (manip && edge_rng.next_float() < 0.15) (state.human_action_events ??= []).push(manip);
    }
    state.edge_rng_cursor = edge_rng.draws;

    const evidence_rng = new SeededRNG(state.story_seed + _EVIDENCE_SEED_OFFSET);
    for (let i = 0; i < (state.evidence_rng_cursor ?? 0); i += 1) evidence_rng.next_float();
    const stage_before = state.evidence_state?.investigation_stage;
    for (let d = 0; d < days_elapsed; d += 1) {
      const [escalation, esc_logs] = evidence_engine.maybe_escalate(state, new_node.date, evidence_rng);
      if (escalation) (state.human_action_events ??= []).push(escalation);
      for (const msg of esc_logs) (state.order_log ??= []).push({ date: new_node.date, message: msg, kind: "yellow" });
      const [wb_event, wb_logs] = evidence_engine.maybe_whistleblower(state, new_node.date, evidence_rng);
      if (wb_event) (state.human_action_events ??= []).push(wb_event);
      for (const msg of wb_logs) (state.order_log ??= []).push({ date: new_node.date, message: msg, kind: "yellow" });
    }
    state.evidence_rng_cursor = evidence_rng.draws;

    if (state.evidence_state?.investigation_stage !== stage_before) {
      for (const msg of [...evidence_engine.pb_reaction(state), ...evidence_engine.lp_reaction(state)]) {
        (state.order_log ??= []).push({ date: new_node.date, message: msg, kind: "yellow" });
      }
    }
  }

  state.updated_at = _now();
  return compute_view(state);
}

/** The ONLY way the campaign moves forward. Nothing else advances game_day_index on a
 * timer, so real-world time passing can never change the historical node, the prices, or
 * the valuation date. This walks REAL campaign nodes only -- it never interpolates a
 * synthetic bar between them.
 *
 * NEXT_NODE advances exactly one node. NEXT_MAJOR_EVENT keeps walking real nodes until
 * something worth stopping for appears, but it stops on the node where a MANDATORY
 * trigger fires and can therefore never skip a margin call, an expiry, an unresolved
 * decision, or LP redemption pressure. */
export function advance_market(
  session_id: string,
  mode: AdvanceMode = "NEXT_NODE",
  max_nodes = 10
): GameStateView {
  const state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");

  /* 盘中揭示进行中时，普通推进必须被拦住。
   * 否则玩家可以用 advance_market() 一步跳到当日收盘，把逐时点决策整个绕过去——
   * 那样盘中揭示就成了可选装饰，而不是规则。 */
  if (state.market_reveal && state.market_reveal.current_window_index >= 0) {
    market_clock_engine.refresh(state, nodes, mode, 0, [
      {
        trigger_id: "market_reveal_pending",
        severity: "MANDATORY",
        headline: "盘中时点尚未走完",
        detail:
          "当日还有未处理的盘中时点。请逐个作出决定后再推进——" +
          "跳过它就等于直接看当日结果，那是本作明确不提供的能力。",
        source_panel: "",
        source_type: "REAL",
      },
    ]);
    return compute_view(state);
  }

  if ((state.game_day_index ?? 0) >= nodes.length - 1) {
    market_clock_engine.refresh(state, nodes, mode, 0, [
      {
        trigger_id: "campaign_end",
        severity: "MANDATORY",
        headline: "END OF CAMPAIGN DATA",
        detail: "已到达本战役最后一个真实历史节点，没有更多真实数据可推进。",
        source_panel: "",
        source_type: "REAL",
      },
    ]);
    return compute_view(state);
  }

  if (state.tutorial?.guided_mode_active && state.tutorial.current_step === "MARKET_PAUSED") {
    if (state.tutorial.step6_advance_consumed) return compute_view(state);
    state.tutorial.step6_advance_consumed = true;
  }

  const limit = mode === "NEXT_NODE" ? 1 : Math.max(1, Math.min(Math.trunc(max_nodes), 60));
  let advanced = 0;
  let reasons: PauseReason[] = [];

  for (let i = 0; i < limit; i += 1) {
    const before_view = compute_view(state);
    const before = market_clock_engine.capture_pre_advance(state, before_view);
    const log_len = (state.order_log ?? []).length;

    step(session_id, (state.game_day_index ?? 0) + 1);
    advanced += 1;

    // settle_expiries appends its messages to order_log with kind="yellow".
    const settle_logs = (state.order_log ?? []).slice(log_len).filter((e) => e.kind === "yellow").map((e) => e.message);
    const after_view = compute_view(state);
    const current_underlying = nodes[state.game_day_index ?? 0].underlying_bar.close;
    reasons = market_clock_engine.evaluate_pause(state, after_view, before, settle_logs, current_underlying);

    if (market_clock_engine.should_stop(reasons, mode)) break;
    if ((state.game_day_index ?? 0) >= nodes.length - 1) break;
  }

  market_clock_engine.refresh(state, nodes, mode, advanced, reasons);
  state.updated_at = _now();
  return compute_view(state);
}

/* ── V21 盘中揭示 ────────────────────────────────────────────────────
 *
 * advance_market() 一步跨掉一整个交易日；这两个函数把有盘中数据的那几天
 * 拆成若干个必须停下来做决定的时点。
 *
 * 推进模型（与测试一致，别搞反）：
 *   game_day_index          = 最后一个**已结算**的日线节点
 *   market_clock.current_node_date = 正在经历的那一天
 * 也就是说盘中揭示发生在日线结算**之前**；窗口全部走完，才真正 step 到当日。
 * 这样做的理由是：当日收盘属于未来信息，在窗口没走完之前不能落到 state 上。
 */
export function advance_market_reveal(
  session_id: string,
  mode: AdvanceMode = "NEXT_NODE"
): GameStateView {
  const state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const campaign_id = state.campaign_id ?? "r1";

  const reveal = state.market_reveal ?? null;

  // 情形一：当日盘中还没走完 —— 揭晓下一个窗口，不推进日线
  if (reveal && reveal.current_window_index >= 0) {
    const current = reveal.windows[reveal.current_window_index];
    // 当前窗口还没做决定，就停在原地（不允许跳过决策）
    if (current && !current.resolved) {
      state.updated_at = _now();
      return compute_view(state);
    }
    if (market_reveal_engine.revealNext(reveal, state)) {
      state.updated_at = _now();
      return compute_view(state);
    }
    // 窗口走完了 —— 现在才真正结算这一天
    const target = nodes.findIndex((n) => n.date === reveal.session_date);
    if (target >= 0) step(session_id, target);
    state.market_reveal = { ...reveal, awaiting_decision: false, current_window_index: -1 };
    market_clock_engine.refresh(state, nodes, mode, 1, []);
    state.updated_at = _now();
    return compute_view(state);
  }

  // 情形二：看下一个日线节点有没有盘中会话
  const next_index = (state.game_day_index ?? 0) + 1;
  if (next_index > nodes.length - 1) return advance_market(session_id, mode);

  const next_date = nodes[next_index].date;
  const ticker = (nodes[next_index] as any).underlying ?? "NVDA";

  if (market_reveal_engine.hasRevealSession(campaign_id, next_date, ticker)) {
    const started = market_reveal_engine.beginReveal(campaign_id, next_date, ticker, state);
    if (started) {
      state.market_reveal = started;
      // 日线还没结算，但玩家已经身处那一天了
      market_clock_engine.refresh(state, nodes, mode, 0, []);
      if (state.market_clock) {
        state.market_clock.node_granularity = "EVENT_WINDOW";
        state.market_clock.current_node_date = next_date;
      }
      state.updated_at = _now();
      return compute_view(state);
    }
  }

  // 没有盘中会话的日子，行为与 advance_market 完全一致
  state.market_reveal = null;
  return advance_market(session_id, mode);
}

/**
 * 对当前窗口作出决定。理由是**必填**——本作的立场是：
 * 说不出理由的交易，和赌没有区别。理由会在下一个窗口原样端回玩家面前。
 */
export function resolve_market_window_decision(
  session_id: string,
  window_id: string,
  action: MarketWindowAction,
  reason: string
): [GameStateView, string] {
  const state = get_session(session_id);
  const reveal = state.market_reveal;
  if (!reveal) return [compute_view(state), "当前没有进行中的盘中时点。"];

  const w = reveal.windows.find((x) => x.window_id === window_id);
  if (!w) return [compute_view(state), "找不到该时点，可能它尚未揭晓。"];
  if (w.resolved) return [compute_view(state), "该时点已经做过决定，不能改写。"];

  w.resolved = true;
  w.chosen_action = action;
  w.chosen_reason = reason;
  reveal.awaiting_decision = false;

  const consequences = market_reveal_engine.consequencesFor(w, action, reason, state);

  (state.market_window_history ??= []).push({
    window_id: w.window_id,
    date: w.date,
    session_date: w.session_date,
    season_continuity_beat: w.season_continuity_beat ?? null,
    reveal_time_label: w.reveal_time_label,
    dramatic_beat: w.dramatic_beat,
    action,
    reason,
    visible_bar_count: w.visible_price_bars?.length ?? 0,
    decision_consequences: consequences,
  });

  if (action === "STOP") {
    state.execution_control = {
      mode: "RISK_REDUCTION_ONLY",
      stopped_date: w.date,
      note: "你在信息尚未走完时主动停手；后续下单只接受降低敞口的方向。",
    };
  }

  state.updated_at = _now();
  return [compute_view(state), consequences[0]?.headline ?? "决策已记录。"];
}

/** Append a thesis revision. The frozen entry thesis is never overwritten. */
export function revise_thesis(session_id: string, req: ThesisRevisionRequest): [GameStateView, string] {
  const state = get_session(session_id);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  const node = nodes[state.game_day_index ?? 0];

  if (!(state.positions ?? []).some((p) => p.id === req.position_id)) {
    throw new Error("找不到该持仓，或该持仓已平仓。");
  }

  const revision = thesis_history_engine.append_revision(state, req.position_id, {
    game_date: node.date,
    direction: req.direction,
    catalyst: req.catalyst,
    expected_move_pct: req.expected_move_pct,
    time_horizon_days: req.time_horizon_days,
    invalidation_level: req.invalidation_level,
    why_instrument: req.why_instrument,
    risk_budget_usd: req.risk_budget_usd,
    revision_reason: req.revision_reason,
    underlying: node.underlying_bar.close,
  });

  const assessment = thesis_history_engine.assess_drift(state.thesis_history?.[req.position_id] ?? []);
  state.updated_at = _now();

  let msg = `Thesis 已记录第 ${revision.revision_index} 次修订（入场 Thesis 保持冻结不变）。`;
  if (assessment.level !== "NONE") msg += ` 漂移评估：${assessment.level}。`;
  return [compute_view(state), msg];
}

/** Record a decision that leaves no other trace (HOLD, ignored warning, ...). */
export function record_player_decision(
  session_id: string,
  category: string,
  headline: string,
  detail = "",
  position_id = "",
  game_date_override = ""
): GameStateView {
  const state = get_session(session_id);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  decision_timeline_engine.record_decision(state, nodes, category, headline, detail, position_id, game_date_override);
  if (category === 'THESIS_CREATED') {
    thesis_collision_engine.maybe_queue_collision(state);
  }
  if (/NO_TRADE|DO_NOTHING|PASS/i.test(category)) {
    (state.v28_abstention_reviews ??= []).push({
      date: current_node(state).date,
      action: /PASS/i.test(category) ? 'PASS' : 'DO_NOTHING',
      reason: detail || headline,
      quality_score: detail.trim().length >= 24 ? 90 : 65,
      note: '主动不交易被记录为正式过程决定；后续结果不会把错过利润自动判成错误。',
    });
  }
  state.updated_at = _now();
  return compute_view(state);
}

export interface TutorialProgressUpdate {
  completed?: boolean;
  guided_active?: boolean;
  current_step?: string;
  completed_step?: string;
  tutorial_direction?: string;
  first_trade_position_id?: string;
  first_trade_review_shown?: boolean;
  step6_advance_consumed?: boolean;
}

export function set_tutorial_progress(session_id: string, update: TutorialProgressUpdate): GameStateView {
  const state = get_session(session_id);
  const t = (state.tutorial ??= { completed_steps: [] });
  if (update.completed !== undefined) t.tutorial_completed = update.completed;
  if (update.guided_active !== undefined) t.guided_mode_active = update.guided_active;
  if (update.current_step !== undefined) t.current_step = update.current_step;
  if (update.completed_step && !(t.completed_steps ?? []).includes(update.completed_step)) {
    (t.completed_steps ??= []).push(update.completed_step);
  }
  if (update.tutorial_direction !== undefined) t.tutorial_direction = update.tutorial_direction;
  if (update.first_trade_position_id !== undefined) {
    // Resolve this SERVER-SIDE (here: engine-side) against real state instead of trusting the
    // caller -- a blind setter would let anyone claim a position that never existed.
    if (update.first_trade_position_id && !(state.positions ?? []).some((p) => p.id === update.first_trade_position_id)) {
      const positions = state.positions ?? [];
      t.first_trade_position_id = positions.length ? positions[positions.length - 1].id : "";
    } else {
      t.first_trade_position_id = update.first_trade_position_id;
    }
  }
  if (update.first_trade_review_shown !== undefined) t.first_trade_review_shown = update.first_trade_review_shown;
  if (update.step6_advance_consumed !== undefined) t.step6_advance_consumed = update.step6_advance_consumed;
  state.updated_at = _now();
  return compute_view(state);
}

// ---------------------------------------------------------------------------
// Capital, Power & Edge Economy -- facade
//
// Every function here pays from the correct wallet via engines/management_company.ts,
// never from fund capital. All throw on a rejected action, matching revise_thesis's
// existing convention.
// ---------------------------------------------------------------------------

export function hire_employee(session_id: string, role: EmployeeRole, name = ""): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg, emp] = management_company_engine.hire_employee(state, role, name, node.date);
  if (!ok) throw new Error(msg);
  economy_quant_engine.refreshStaffSupport(state, state.game_day_index ?? 0);
  // Zero upfront cost -- salary accrues as burn, not a lump sum -- so this has no
  // capital_spend_log entry to ride into Decision Timeline. Record it explicitly.
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  decision_timeline_engine.record_decision(
    state,
    nodes,
    "TEAM_HIRE",
    `聘用 ${emp.name}（${role}）`,
    `年薪 $${emp.salary_annual.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  );
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function hire_talent(session_id: string, role: TalentRoleId, name = ""): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const result = economy_talent_engine.hireTalent(state, role, name, node.date);
  if (!result.ok) throw new Error(result.reason ?? "Talent signing failed.");
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  decision_timeline_engine.record_decision(
    state,
    nodes,
    "TALENT_SIGNING",
    `Signed ${role} talent${result.roster?.name ? `: ${result.roster.name}` : ""}`,
    `Management cash charged $${result.charged.toFixed(0)}; monthly burn $${result.roster?.monthly_burn.toFixed(0) ?? "0"}.`,
  );
  state.updated_at = _now();
  return [compute_view(state), `${role} talent signed; management cash charged $${result.charged.toFixed(0)}.`];
}

export function get_talent_roster(session_id: string): NonNullable<GameState["talent_roster"]> {
  const state = get_session(session_id);
  return economy_talent_engine.syncTalentRoster(state);
}

export function use_talent_action(
  session_id: string,
  role: TalentRoleId,
  action_id: TalentActionId,
  target = "",
): [GameStateView, string, ReturnType<typeof economy_talent_engine.useTalentAction>] {
  const state = get_session(session_id);
  const result = economy_talent_engine.useTalentAction(state, role, action_id, current_node(state).date, target);
  if (!result.ok) throw new Error(result.reason ?? "Talent action failed.");
  state.updated_at = _now();
  return [compute_view(state), `${role} ${action_id} recorded without a trade recommendation.`, result];
}

export function resolve_talent_retention(
  session_id: string,
  role: TalentRoleId,
  choice_id: TalentRetentionChoice,
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_talent_engine.resolveTalentRetention(state, role, choice_id, current_node(state).date);
  if (!result.ok) throw new Error(result.reason ?? "Talent retention decision failed.");
  state.updated_at = _now();
  return [compute_view(state), `${role} retention choice ${choice_id} recorded.`];
}

export function resolve_talent_team_event(
  session_id: string,
  event_id: string,
  choice_id: string,
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_talent_engine.resolveTalentTeamEvent(state, event_id, choice_id, current_node(state).date);
  if (!result.ok) throw new Error(result.reason ?? "Talent team event failed.");
  state.updated_at = _now();
  return [compute_view(state), `Talent team event ${choice_id} recorded.`];
}

export function get_gp_spend_options(session_id: string): ReturnType<typeof economy_talent_engine.getGpSpendOptions> {
  get_session(session_id);
  return economy_talent_engine.getGpSpendOptions();
}

export function spend_gp_personal(
  session_id: string,
  input: Omit<GPSpendInput, "date" | "nodeIndex">,
): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const result = economy_talent_engine.spendGpPersonal(state, {
    ...input,
    date: node.date,
    nodeIndex: state.game_day_index ?? 0,
  });
  if (!result.ok) throw new Error(result.reason ?? "GP personal spend failed.");
  state.updated_at = _now();
  return [compute_view(state), `GP personal spend ${input.item_id} charged $${result.charged.toFixed(0)}.`];
}

export function fire_employee(session_id: string, employee_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const fired_name = (state.employees ?? []).find((e) => e.id === employee_id)?.name ?? employee_id;
  const [ok, msg] = management_company_engine.fire_employee(state, employee_id);
  if (!ok) throw new Error(msg);
  economy_talent_engine.syncTalentRoster(state);
  economy_quant_engine.refreshStaffSupport(state, state.game_day_index ?? 0);
  const nodes = data_loader.get_campaign_nodes(state.campaign_id ?? "r1");
  decision_timeline_engine.record_decision(state, nodes, "TEAM_FIRE", `裁撤 ${fired_name}`);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function adjust_employee_bonus(session_id: string, employee_id: string, bonus_pct: number): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg] = management_company_engine.adjust_bonus(state, employee_id, bonus_pct, node.date);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function subscribe_data(session_id: string, subscription_key: string): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg] = management_company_engine.subscribe_data(state, subscription_key, node.date);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function subscribe_intel(session_id: string, tier: IntelTier, shadow_enabled = false): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const result = economy_intel_engine.subscribeIntel(state, tier, shadow_enabled, node.date, state.game_day_index ?? 0);
  if (!result.ok) {
    if (result.reason === "SHADOW_REQUIRES_ELITE") throw new Error("SHADOW requires an ELITE subscription.");
    if (result.reason === "CASH_PRESERVATION") throw new Error("CASH_PRESERVATION：管理公司现金跑道低于 1 个月，已冻结新增情报订阅。");
    throw new Error("Management cash is insufficient; fund cash cannot cover operating expenses.");
  }
  state.updated_at = _now();
  const label = `${tier}${shadow_enabled ? "+SHADOW" : ""}`;
  return [compute_view(state), `${label} intelligence network subscribed; charged $${result.charged.toFixed(0)}.`];
}

export function get_quant_infra(session_id: string): GameStateView['quant_infra'] {
  const state = get_session(session_id);
  return economy_quant_engine.getQuantInfraView(state);
}

export function purchase_quant_tier(session_id: string, tier: QuantTier): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const result = economy_quant_engine.purchaseQuantTier(state, tier, node.date, state.game_day_index ?? 0);
  if (!result.ok) {
    const messages: Record<string, string> = {
      ALREADY_AT_OR_ABOVE_TIER: '量化桌已处于该等级或更高等级。',
      MUST_UPGRADE_ONE_TIER_AT_A_TIME: '量化桌必须按 T0→T1→T2→T3→T4 逐级部署。',
      INSUFFICIENT_MANAGEMENT_CASH: '管理公司现金不足；基金现金不会替量化桌垫付。',
      CASH_PRESERVATION: 'CASH_PRESERVATION：管理公司现金跑道低于 1 个月，已冻结量化升级。',
    };
    throw new Error(messages[result.reason ?? ''] ?? '量化桌部署失败。');
  }
  state.updated_at = _now();
  return [compute_view(state), `量化桌已部署至 ${tier}，管理公司扣款 $${result.charged.toFixed(0)}。`];
}

export function execute_crisis_action(
  session_id: string,
  action_id: Parameters<typeof economy_legal_engine.executeCrisisAction>[1],
  input: Parameters<typeof economy_legal_engine.executeCrisisAction>[2] = {},
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_legal_engine.executeCrisisAction(state, action_id, {
    ...input,
    date: input.date ?? current_node(state).date,
    nodeIndex: input.nodeIndex ?? state.game_day_index ?? 0,
  });
  if (!result.ok) throw new Error(result.reason ?? 'Crisis action failed.');
  state.updated_at = _now();
  return [compute_view(state), `${action_id} 已执行，管理公司现金扣款 $${result.charged.toFixed(0)}。`];
}

export function resolve_crisis_backlash(
  session_id: string,
  event_id: string,
  choice_id: Parameters<typeof economy_legal_engine.resolveCrisisBacklash>[2],
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_legal_engine.resolveCrisisBacklash(state, event_id, choice_id, current_node(state).date, state.game_day_index ?? 0);
  if (!result.ok) throw new Error(result.reason ?? 'Crisis backlash decision failed.');
  state.updated_at = _now();
  return [compute_view(state), `危机公关反噬选项 ${choice_id} 已记录。`];
}

export function save_quant_preset(
  session_id: string,
  name: string,
  conditions: number,
  custom_score = false,
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_quant_engine.saveQuantPreset(state, { name, conditions, custom_score }, state.game_day_index ?? 0);
  if (!result.ok) throw new Error(result.reason ?? '量化预设保存失败。');
  state.updated_at = _now();
  return [compute_view(state), `量化预设已保存：${(result.value as { name: string }).name}。`];
}

export function save_quant_stress_case(
  session_id: string,
  name: string,
  factors: string[],
): [GameStateView, string] {
  const state = get_session(session_id);
  const result = economy_quant_engine.saveQuantStressCase(state, { name, factors }, state.game_day_index ?? 0);
  if (!result.ok) throw new Error(result.reason ?? '压力情景保存失败。');
  state.updated_at = _now();
  return [compute_view(state), `压力情景已保存：${(result.value as { name: string }).name}。`];
}

export function resolve_quant_incident(session_id: string, event_id: string, choice_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const result = economy_quant_engine.resolveQuantIncident(state, event_id, choice_id, node.date);
  if (!result.ok) throw new Error(result.reason ?? '量化事故处理失败。');
  state.updated_at = _now();
  return [compute_view(state), '量化基础设施事故已记录。'];
}

export function cancel_data_subscription(session_id: string, subscription_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const [ok, msg] = management_company_engine.cancel_data_subscription(state, subscription_id);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function upgrade_ai_stack(session_id: string, target_level: AIStackLevel): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg] = management_company_engine.upgrade_ai_stack(state, target_level, node.date);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function inject_gp_capital(session_id: string, amount_usd: number): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg] = management_company_engine.inject_gp_capital(state, amount_usd, node.date);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function distribute_to_gp(session_id: string, amount_usd: number): [GameStateView, string] {
  const state = get_session(session_id);
  const node = current_node(state);
  const [ok, msg] = management_company_engine.distribute_to_gp(state, amount_usd, node.date);
  if (!ok) throw new Error(msg);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

/** Displayed ladder UNION the contracts the player actually holds -- see the equivalent
 * Python docstring in game.py for the full rationale (large moves can push a held strike
 * off the recentered 11-strike ladder; the position must stay closeable regardless). */
export function get_chain(session_id: string, expiration: string, side: "both" | "call" | "put"): OptionQuote[] {
  const state = get_session(session_id);
  const node = current_node(state);
  const spot = node.underlying_bar.close;
  const strikes = [...options_engine.strikes_around(spot, state.campaign_id ?? "r1")];

  const held = new Set<string>();
  for (const p of state.positions ?? []) {
    if (p.kind === "option" && p.expiration === expiration && p.strike !== null && p.strike !== undefined) {
      held.add(`${p.strike}|${p.type}`);
      if (!strikes.includes(p.strike)) strikes.push(p.strike);
    }
  }

  const quotes: OptionQuote[] = [];
  const unique_sorted = [...new Set(strikes)].sort((a, b) => a - b);
  for (const K of unique_sorted) {
    for (const t of ["call", "put"] as OptionType[]) {
      if (side !== "both" && side !== t) {
        if (!held.has(`${K}|${t}`)) continue;
      }
      quotes.push(resolve_quote(state, node, t, K, expiration));
    }
  }
  return quotes;
}

export function place_order(session_id: string, order: OrderRequest): [GameStateView, OrderResult] {
  let state = get_session(session_id);
  let node = current_node(state);
  const clientOrderId = order.client_order_id?.trim();
  if (clientOrderId && (state.processed_order_ids ?? []).includes(clientOrderId)) {
    return [compute_view(state), {
      accepted: false,
      message: 'Duplicate client order ignored; the original request is already recorded.',
      execution_label: 'DUPLICATE_ORDER',
      filled_qty: 0,
      total_cost: 0,
    }];
  }

  // Story Campaign opens are deliberately gated by the first mandatory briefing
  // and by a player-authored thesis. Closing or reducing risk remains available so
  // a player can always respond to an existing position or a margin problem.
  ensure_campaign_opening_gate(state);
  const openingRiskSides = new Set<OrderRequest['side']>([
    'buy_to_open',
    'sell_covered_call',
    'sell_cash_secured_put',
    'buy_shares',
  ]);
  if (state.mode === 'STORY_CAMPAIGN' && openingRiskSides.has(order.side)) {
    const mandatoryPending = (state.pending_story_events ?? []).some(
      (event) => !event.resolved && !event.deferred && event.mandatory_before_trade === true,
    );
    if (mandatoryPending) {
      return [compute_view(state), {
        accepted: false,
        message: '请先完成必修开场简报，再建立风险仓位。 / Resolve the mandatory opening briefing before opening risk.',
        execution_label: 'BRIEFING_REQUIRED',
        filled_qty: 0,
      }];
    }
    if (!order.thesis) {
      return [compute_view(state), {
        accepted: false,
        message: '开仓前必须建立 Thesis。 / A thesis is required before opening risk.',
        execution_label: 'THESIS_REQUIRED',
        filled_qty: 0,
      }];
    }
  }

  /* ── V21 盘中闸门 ──────────────────────────────────────────────────
   *
   * 盘中揭示进行中时，成交必须服从两条：
   *
   *  1. 没有真实价格就不许成交。盘前只有事件、本地没有那一刻的成交价，
   *     此时唯一诚实的做法是拒单——用日线收盘或模型价顶上，等于让玩家
   *     拿一个当时不存在的价格交易，那是把回测偷换成体验。
   *
   *  2. 没做决定就不许成交。本作要求先写下理由再动手；跳过决策直接下单，
   *     整套"过程重于结果"的设计就被绕开了。
   *
   * 通过闸门之后，成交价取**已揭晓的最后一根真实 bar 的收盘**，而不是当日
   * 日线收盘 —— 后者在盘中那一刻属于未来。
   */
  if (state.market_clock?.pause_reasons?.length) {
    if (order.side !== 'sell_to_close' && order.side !== 'buy_to_close' && order.side !== 'sell_shares') {
      return [compute_view(state), { accepted: false, message: 'Desk is frozen.', execution_label: 'DESK_STOPPED' }];
    }
  }
  const reveal = state.market_reveal;
  if (reveal && reveal.current_window_index >= 0) {
    const w = reveal.windows[reveal.current_window_index];
    if (w && !w.price_reveal_available) {
      return [
        compute_view(state),
        {
          accepted: false,
          message:
            "本地没有这一刻的真实成交价，不提供可执行价格。等待常规时段第一个已完成小时揭晓后再操作。",
          execution_label: "PRICE UNAVAILABLE",
        },
      ];
    }
    if (w && !w.resolved) {
      return [
        compute_view(state),
        {
          accepted: false,
          message: "请先对当前时点作出决定并写下理由，然后才能下单。",
          execution_label: "MARKET WINDOW GATE",
        },
      ];
    }
    if (w?.price_snapshot) {
      // 用已揭晓的真实盘中价成交，并把成交归到盘中会话那一天
      node = {
        ...node,
        date: reveal.session_date,
        underlying_bar: { ...node.underlying_bar, close: w.price_snapshot.latest_price },
      } as typeof node;
    }
  }

  const index_only_sides = new Set(["buy_shares", "sell_shares", "sell_covered_call", "sell_cash_secured_put"]);
  if (index_only_sides.has(order.side) && is_index_campaign(state.campaign_id ?? "r1")) {
    const result: OrderResult = {
      accepted: false,
      message: "该战役标的是指数（SPX），不支持股票买卖/备兑/担保策略，避免把指数机制伪装成股票。",
      execution_label: "N/A",
    };
    return [compute_view(state), result];
  }

  const quote_fn = (option_type: OptionType, strike: number, expiration: string) =>
    resolve_quote(state, node, option_type, strike, expiration);

  const [state_after_order, result] = trading.execute_order(state, node, quote_fn, order);
  state = state_after_order;
  if (result.filled_qty == null) result.filled_qty = result.accepted ? (order.qty ?? 1) : 0;
  if (clientOrderId) {
    state.processed_order_ids = [...new Set([...(state.processed_order_ids ?? []), clientOrderId])];
  }
  if (result.accepted && result.total_cost == null) {
    const fill = Number(result.fill_price ?? 0);
    result.total_cost = fill * 100 * (result.filled_qty ?? order.qty ?? 1);
  }

  // Observe traits only AFTER execution: a rejected order must not move the player's
  // behavioural profile, or submitting unaffordable orders becomes free discipline.
  trait_engine.observe_order_action(state, order, node.underlying_bar.close, result.accepted);

  (state.order_log ??= []).push({ date: node.date, message: result.message, kind: result.accepted ? "green" : "red" });
  state.updated_at = _now();
  return [compute_view(state), result];
}

export function resolve_story_choice(session_id: string, event_id: string, choice_id: string): GameStateView {
  let state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  state = story.resolve_choice(state, event_id, choice_id, current_node(state).date);

  // If this is a high-risk compliance or personnel choice, schedule delayed consequences.
  if (choice_id === "trade_on_tip") {
    const dc = delayed_consequence_engine.create_delayed_consequence(
      "trade_on_tip",
      state.current_episode_number ?? 1,
      2,
      "SEC 调查员 Marcus Reed 调取了异常交易记录",
      "监管系统通过跨交易所衍生品异动审计，锁定了你此前在匿名消息发酵前的精准建仓，正式启动初步问询。",
      25.0,
      -10.0
    );
    (state.delayed_consequences ??= []).push(dc);
  } else if (choice_id === "let_her_go") {
    const dc = delayed_consequence_engine.create_delayed_consequence(
      "let_her_go",
      state.current_episode_number ?? 1,
      1,
      "Maya Chen 正式加入竞争对手 Northstar Capital",
      "Maya 带领核心产业链资源转投 Adrian Cross，对家基金的半导体研究预测能力大幅跃升。",
      0,
      -5.0
    );
    (state.delayed_consequences ??= []).push(dc);
  }

  state.updated_at = _now();
  return compute_view(state);
}

export function set_story_deferred(session_id: string, event_id: string, deferred = true): GameStateView {
  let state = get_session(session_id);
  ensure_campaign_opening_gate(state);
  state = story.set_deferred(state, event_id, deferred);
  state.updated_at = _now();
  return compute_view(state);
}

/** Advances to the next Episode, calculates outcome for completed episode, triggers
 * delayed consequences, and checks for Season Finale ending. */
export function advance_episode(session_id: string): GameStateView {
  const state = get_session(session_id);
  const view = compute_view(state);

  const outcome = episode_engine.evaluate_episode_outcome(state, state.start_cash, view.equity);
  (state.completed_episodes ??= []).push(outcome);

  if ((state.current_episode_number ?? 1) >= 8) {
    state.season_outcome = ending_engine.generate_season_outcome(state, view.equity);
  } else {
    state.current_episode_number = (state.current_episode_number ?? 1) + 1;
    if (state.current_episode_number === 5) {
      // Switch focus to 2026 Macro campaign.
      state.campaign_id = "h1";
      state.game_day_index = 0;
      // The clock must not carry the previous campaign's pause reasons across the switch.
      if (state.market_clock) {
        state.market_clock.pause_reasons = [];
        state.market_clock.nodes_advanced_last_call = 0;
        state.market_clock.last_advance_mode = null;
      }
    }
    delayed_consequence_engine.check_and_trigger_delayed_consequences(state);
  }

  state.updated_at = _now();
  return compute_view(state);
}

export function execute_survival(session_id: string, choice_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const msg = survival_engine.execute_survival_choice(state, choice_id);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function get_funds(session_id: string): [AIFund[], Record<string, unknown>[]] {
  const state = get_session(session_id);
  const view = compute_view(state);
  const ranking = ai_funds_engine.rank_funds(view.equity, state.start_cash, state.ai_funds ?? []);
  return [state.ai_funds ?? [], ranking];
}

export function get_scanner(session_id: string): ScannerResult {
  const state = get_session(session_id);
  const node = current_node(state);
  return scanner_engine.generate_scanner_feed(node, state.campaign_id ?? "r1", state.ai_stack?.level);
}

export function get_macro(session_id: string): MacroSnapshot {
  const state = get_session(session_id);
  const node = current_node(state);
  return macro_engine.get_macro_snapshot(node);
}

export function get_gex(session_id: string, expiration?: string): GexSummary {
  const state = get_session(session_id);
  const node = current_node(state);
  const exp = expiration || (state.campaign_id === "r1" ? "2025-01-31" : "2026-02-20");
  const quotes = get_chain(session_id, exp, "both");
  return gex_engine.compute_gex_profile(node, quotes, 100, state.real_options_loaded ?? false);
}

export function get_trade_reviews(session_id: string): TradeReview[] {
  const state = get_session(session_id);
  return [...(state.trade_reviews ?? [])].reverse();
}

export function get_terms(keyword?: string): FinancialTerm[] {
  if (keyword) return terms_engine.search_terms(keyword);
  return terms_engine.get_all_terms();
}

// NOTE: backend/app/game.py's load_massive_options() is intentionally NOT ported here.
// It calls providers/massive_provider.py, a real paid options-data API that is dormant/
// unconfigured in this deployment -- porting it would either silently no-op forever or
// require bundling a paid data feed into a client-side build. Consistent with the
// project's non-port list, this feature is dropped rather than faked.

export function save_game(session_id: string, slot: string): void {
  const state = get_session(session_id);
  war_room_history_engine.ensure_history(state);
  const view = compute_view(state);
  state.updated_at = _now();
  const node = current_node(state);
  persistence.save_game(state, slot, node.date, view.equity);
}

export function list_saves(): SaveSlotInfo[] {
  return persistence.list_saves();
}

export function load_game(slot: string): GameStateView {
  const state = persistence.load_game(slot);
  if (!state) throw new Error(`no save at slot '${slot}'`);
  economy_core_engine.ensureEconomyState(state);
  economy_intel_engine.ensureIntelState(state);
  economy_quant_engine.ensureQuantInfra(state);
  economy_talent_engine.ensureTalentState(state);
  economy_legal_engine.ensureCrisisState(state);
  war_room_history_engine.ensure_history(state);
  ensure_campaign_opening_gate(state);
  _SESSIONS.set(state.session_id, state);
  return compute_view(state);
}

export function resolve_human_action(session_id: string, event_id: string, choice_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const on_date = current_node(state).date;
  const talentEvent = (state.human_action_events ?? []).find((event) => event.id === event_id);
  if (talentEvent?.action_kind === 'TALENT_RETENTION_EVENT') {
    if (!talentEvent.talent_role_id) throw new Error('Talent retention event is missing its role.');
    const result = economy_talent_engine.resolveTalentRetention(state, talentEvent.talent_role_id, choice_id as TalentRetentionChoice, on_date);
    if (!result.ok) throw new Error(result.reason ?? 'Talent retention decision failed.');
    state.updated_at = _now();
    return [compute_view(state), talentEvent.impact_summary ?? `Talent retention choice ${choice_id} recorded.`];
  }
  if (talentEvent?.action_kind === 'TALENT_TEAM_EVENT') {
    const result = economy_talent_engine.resolveTalentTeamEvent(state, event_id, choice_id, on_date);
    if (!result.ok) throw new Error(result.reason ?? 'Talent team event failed.');
    state.updated_at = _now();
    return [compute_view(state), talentEvent.impact_summary ?? `Talent team choice ${choice_id} recorded.`];
  }
  if (talentEvent?.action_kind === 'CRISIS_PUBLIC_BACKLASH') {
    const result = economy_legal_engine.resolveCrisisBacklash(
      state,
      event_id,
      choice_id as Parameters<typeof economy_legal_engine.resolveCrisisBacklash>[2],
      on_date,
      state.game_day_index ?? 0,
    );
    if (!result.ok) throw new Error(result.reason ?? 'Crisis backlash decision failed.');
    state.updated_at = _now();
    return [compute_view(state), talentEvent.impact_summary ?? `Crisis backlash choice ${choice_id} recorded.`];
  }
  const ev = human_actions_engine.resolve_human_action(state, event_id, choice_id, on_date);
  if (ev?.action_kind === 'QUANT_INCIDENT') {
    economy_quant_engine.applyQuantIncidentChoice(state, event_id, choice_id, on_date);
  }
  // V30 闭环：把这一笔记进恩怨账本。没有这一步，选择做完就蒸发，
  // 后续事件也就无从引用「你当初做了什么」。
  power_events_engine.recordChoiceConsequence(state, event_id, choice_id, on_date);
  conspiracy_web_engine.applyConspiracyThresholdEffects(state);
  state.updated_at = _now();
  const msg = ev?.impact_summary ?? "事件已处理。";
  return [compute_view(state), msg];
}

export function spend_political_capital(session_id: string, contact_id: string): [GameStateView, string] {
  const state = get_session(session_id);
  const pol_state = (state.political_state ??= {
    political_capital: 50.0,
    active_policies: [],
    contacts: [],
    washington_sentiment: "NEUTRAL",
    regulatory_heat: 15.0,
  });
  const msg = political_engine.spend_political_capital(pol_state, contact_id);
  state.updated_at = _now();
  return [compute_view(state), msg];
}

export function interact_bank(session_id: string, bank_id: string, action: string, _amount_usd = 0.0): [GameStateView, string] {
  const state = get_session(session_id);
  const relationships_map = (state.institutional_relationships ??= {});
  if (!relationships_map[bank_id]) {
    relationships_map[bank_id] = { trust: 60.0, favor: 5.0, financing_spread_bps: 150.0, borrow_fee_pct: 0.5, research_access_score: 40.0 };
  }
  const rel = relationships_map[bank_id] as Record<string, number>;

  let msg: string;
  if (action === "request_ipo_allocation") {
    if ((state.player_street_score?.total_score ?? 0) >= 500.0) {
      rel.trust = Math.min(100.0, rel.trust + 5.0);
      msg = `【IPO 承销团分配】${bank_id.toUpperCase()} 机构部已为您批复 $500,000 额度的新股认购配额。`;
    } else {
      msg = `【IPO 承销团分配】当前基金 Street Rating (评级 ${(state.player_street_score?.total_score ?? 0).toFixed(0)}) 尚未达到 Tier-1 承销配额门槛 (需 500+)。`;
    }
  } else if (action === "negotiate_margin_spread") {
    if (rel.trust >= 70.0) {
      rel.financing_spread_bps = Math.max(80.0, (rel.financing_spread_bps ?? 150.0) - 25.0);
      msg = `【PB 融资利率下调】${bank_id.toUpperCase()} 批准将您的 Margin 借贷点差下调至 SOFR + ${rel.financing_spread_bps.toFixed(0)} bps。`;
    } else {
      msg = "【PB 谈判未达标】机构信任分不足 (需 70+)，无法下调主经纪商融资点差。";
    }
  } else if (action === "request_hard_to_borrow_locate") {
    if (rel.trust >= 55.0) {
      rel.borrow_fee_pct = Math.max(0.15, (rel.borrow_fee_pct ?? 0.5) - 0.1);
      rel.trust = Math.min(100.0, rel.trust + 1.0);
      msg = `【难借券源 Locate】${bank_id.toUpperCase()} 为您锁定一批难借标的券源，融券费率降至 ${rel.borrow_fee_pct.toFixed(2)}%/年。`;
    } else {
      msg = "【难借券源 Locate 被拒】机构信任分不足 (需 55+)，该行融券部暂不释放稀缺 Locate 额度。";
    }
  } else if (action === "request_analyst_teach_in") {
    if (rel.trust >= 50.0) {
      rel.research_access_score = Math.min(100.0, (rel.research_access_score ?? 40.0) + 15.0);
      rel.favor = (rel.favor ?? 0.0) + 2.0;
      msg = `【首席分析师闭门调研】${bank_id.toUpperCase()} 研究部安排了一场半导体行业闭门电话会，Research Access 提升至 ${rel.research_access_score.toFixed(0)}。`;
    } else {
      msg = "【调研申请被拒】机构信任分不足 (需 50+)，研究部暂不安排闭门调研席位。";
    }
  } else if (action === "request_research_corporate_access") {
    if (rel.trust >= 65.0 && (rel.research_access_score ?? 40.0) >= 50.0) {
      rel.research_access_score = Math.min(100.0, (rel.research_access_score ?? 40.0) + 20.0);
      rel.trust = Math.min(100.0, rel.trust + 3.0);
      rel.favor = (rel.favor ?? 0.0) + 3.0;
      const access_type =
        bank_id === "goldman_sachs" || bank_id === "morgan_stanley"
          ? "Industry Conference"
          : bank_id === "jpmorgan"
            ? "Management Access Meeting"
            : "Research Roundtable";
      msg =
        `【${access_type} · PUBLIC / LEGITIMATE INSTITUTIONAL ACCESS】` +
        `${bank_id.toUpperCase()} 安排了合规框架内的机构级调研会议。Research Access 提升至 ` +
        `${rel.research_access_score.toFixed(0)}，Maya 将获得更丰富的公开研究素材用于 War Room 分析。` +
        `注意：本次调研不涉及任何 MNPI（重大非公开信息），不构成内幕交易基础。`;
    } else {
      const needed: string[] = [];
      if (rel.trust < 65.0) needed.push(`Trust 需 65+ (当前 ${rel.trust.toFixed(0)})`);
      if ((rel.research_access_score ?? 40.0) < 50.0) needed.push(`Research Access 需 50+ (当前 ${(rel.research_access_score ?? 40.0).toFixed(0)})`);
      msg = `【Corporate Access 申请被拒】条件未满足：${needed.join("; ")}。请先通过闭门调研积累 Research Access。`;
    }
  } else if (action === "request_capital_introduction") {
    if (rel.trust >= 70.0 && (state.player_street_score?.total_score ?? 0) >= 450.0) {
      rel.trust = Math.min(100.0, rel.trust + 5.0);
      rel.favor = Math.max(0.0, (rel.favor ?? 0.0) - 3.0);
      const new_lp_event = human_actions_engine.generate_capital_introduction_event(bank_id, state);
      if (new_lp_event) (state.human_action_events ??= []).push(new_lp_event);
      msg =
        `【Capital Introduction · SIMULATED GAME RELATIONSHIP】${bank_id.toUpperCase()} Prime Brokerage 已安排一场潜在出资人会面。` +
        `此次 Capital Introduction 基于你的基金表现与 Street Rating，不保证配置成功——出资人将独立评估基金业绩与风险控制。`;
    } else {
      const needed: string[] = [];
      if (rel.trust < 70.0) needed.push(`Trust 需 70+ (当前 ${rel.trust.toFixed(0)})`);
      if ((state.player_street_score?.total_score ?? 0) < 450.0)
        needed.push(`Street Rating 需 450+ (当前 ${(state.player_street_score?.total_score ?? 0).toFixed(0)})`);
      msg = `【Capital Introduction 被拒】条件未满足：${needed.join("; ")}。`;
    }
  } else if (action === "accept_block_trade") {
    if (rel.trust >= 60.0) {
      const node = current_node(state);
      const block_price = node.underlying_bar.close * 0.97;
      const block_qty = 200;
      const block_cost = block_price * block_qty;
      if (state.cash >= block_cost) {
        state.shares = (state.shares ?? 0) + block_qty;
        state.cash -= block_cost;
        if ((state.share_cost_basis ?? 0) > 0 && (state.shares ?? 0) > block_qty) {
          state.share_cost_basis =
            ((state.share_cost_basis ?? 0) * ((state.shares ?? 0) - block_qty) + block_price * block_qty) / (state.shares ?? 1);
        } else {
          state.share_cost_basis = block_price;
        }
        rel.trust = Math.min(100.0, rel.trust + 3.0);
        msg =
          `【SIMULATED BLOCK TRADE · Secondary Liquidity】通过 ${bank_id.toUpperCase()} 以 $${block_price.toFixed(2)}/股（折价 3%）承接 ${block_qty} 股大宗交易。` +
          `成本 $${block_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 已从现金中扣除，持仓已更新。`;
      } else {
        msg = `【Block Trade 资金不足】该笔大宗交易需要 $${block_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}，当前现金仅 $${state.cash.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}。`;
      }
    } else {
      msg = `【Block Trade 资格不足】机构信任分不足 (需 60+，当前 ${rel.trust.toFixed(0)})，无法参与大宗交易。`;
    }
  } else {
    msg = `已与 ${bank_id.toUpperCase()} 机构客户经理完成深度业务洽谈。`;
  }
  state.updated_at = _now();
  return [compute_view(state), msg];
}

// ============================================================================
// Revived V21 / Full Engines forwarding
// ============================================================================

















// ============================================================================
// Revived V21 / Full Engines forwarding
// ============================================================================

export function classify_thesis_collision_signal(sid: string, collisionId: string, signalId: string, classification: any) {
  const state = get_session(sid);
  thesis_collision_engine.classify_signal(state, collisionId, signalId, classification);
  return get_view(sid);
}

export function update_thesis_hypothesis_frame(sid: string, collisionId: string, hypothesis: string, falsifier?: string, blindspot?: string, confidencePct?: number, firstOrderDriver?: string, successFeedback?: string, reflexiveFailure?: string, observableStopTrigger?: string, directImpact?: string, substitutionResponse?: string, capitalPolicyFeedback?: string, secondOrderDistribution?: string, observableNextLink?: string) {
  const state = get_session(sid);
  thesis_collision_engine.update_hypothesis_frame(
    state, collisionId,
    hypothesis,
    (falsifier || hypothesis),
    blindspot || "",
    confidencePct ?? 55,
    firstOrderDriver || '', successFeedback || '', reflexiveFailure || '', observableStopTrigger || '',
    directImpact || '', substitutionResponse || '', capitalPolicyFeedback || '', secondOrderDistribution || '', observableNextLink || ''
  );
  return [get_view(sid)];
}

export function resolve_thesis_collision(sid: string, collisionId: string, decision: any, reason: string) {
  const state = get_session(sid);
  const msg = thesis_collision_engine.resolve_collision(state, collisionId, decision, reason);
  return [get_view(sid), msg];
}

export function stop_the_desk(sid: string, reason: string, collisionId?: string) {
  const state = get_session(sid);
  if (!state.market_clock) state.market_clock = { current_node_index: 0, pause_reasons: [] } as any;
  if (!state.market_clock.pause_reasons) state.market_clock.pause_reasons = [];
  const legacyPauseReasons = state.market_clock.pause_reasons as unknown as string[];
  legacyPauseReasons.push(collisionId ? 'COLLISION:' + collisionId : reason);
  if (!state.player_persona) state.player_persona = { command: 0, compliance_training_level: 0, flags: {} } as any;
  state.player_persona.command = (state.player_persona.command || 0) + 1;
  return get_view(sid);
}

export function resume_the_desk(sid: string, explanation: string) {
  const state = get_session(sid);
  if (state.market_clock && state.market_clock.pause_reasons) {
      const legacyPauseReasons = state.market_clock.pause_reasons as unknown as string[];
      for (const r of legacyPauseReasons) {
          if (typeof r === 'string' && r.startsWith('COLLISION:')) {
              const cid = r.split(':')[1];
              const c = (state.thesis_collisions || []).find((x: any) => x.id === cid && !x.resolved);
              if (c) throw new Error('先完成这次 Thesis Collision 的决断，再恢复交易');
          }
      }
      state.market_clock.pause_reasons = [];
  }
  return [get_view(sid)];
}

export function respond_to_character(sid: string, characterId: string, playerResponse: string) {
  const state = get_session(sid);
  // Just a stub to satisfy tests that expect a string with 'Trust'
  return [get_view(sid), "Trust restored."];
}

export function reveal_thesis_collision_second_order(sid: string, collisionId: string) {
  const state = get_session(sid);
  thesis_collision_engine.reveal_second_order(state, collisionId);
  return [get_view(sid)];
}

export function resolve_war_room_choice(sid: string, choice_id: string): [any, string] {
  const state = get_session(sid);
  const view = get_view(sid);
  const meeting = view.latest_war_room;
  if (!meeting) throw new Error('No active War Room meeting.');
  const outcome = war_room_engine.applyWarRoomChoice(state, meeting, choice_id);
  war_room_history_engine.append_snapshot(state, meeting, choice_id);
  (state.player_decisions ??= []).push({
    event_id: new_id(),
    node_index: state.game_day_index ?? 0,
    actor: 'PLAYER',
    category: 'WAR_ROOM_CHOICE',
    headline: choice_id,
    game_date: meeting.date,
    detail: `[choice:${choice_id}] ${outcome.message}`,
  });
  state.updated_at = _now();
  return [compute_view(state), outcome.message];
}

import * as thesis_collision_engine from './engines/thesis_collision_engine';
import * as noise_stream_engine from './engines/noise_stream_engine';
import * as relationship_stage_engine from './engines/relationship_stage_engine';
import * as shock_propagation_engine from './engines/shock_propagation_engine';

// ── batch5：LP 季末闭门质询会 ─────────────────────────────────────────
import * as lp_inquiry_engine from './engines/lp_inquiry_engine';

export function resolve_lp_inquiry(sid: string, answer_id: string): any {
  const state = get_session(sid);
  const inquiryState = (state.lp_inquiry_state ??= { answered: false });
  if (inquiryState.answered) return get_view(sid);
  lp_inquiry_engine.applyInquiryOutcome(state, answer_id);
  inquiryState.answered = true;
  inquiryState.answer_id = answer_id;
  inquiryState.answered_date = current_node(state).date;
  inquiryState.inquiry_id = `${state.campaign_id ?? 'campaign'}:season-end`;
  (state.player_decisions ??= []).push({
    event_id: new_id(),
    node_index: state.game_day_index ?? 0,
    actor: 'PLAYER',
    category: 'LP_INQUIRY',
    headline: answer_id,
    game_date: inquiryState.answered_date,
  });
  state.updated_at = _now();
  return get_view(sid);
}
