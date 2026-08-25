export type SourceType =
  | 'REAL'
  | 'REAL_PRIMARY'
  | 'REAL_VENDOR'
  | 'DERIVED'
  | 'DERIVED_REAL_INPUTS'
  | 'DERIVED_MODEL'
  | 'DERIVED_HEURISTIC'
  | 'ESTIMATED'
  | 'SIMULATED'
  | 'DATA_UNAVAILABLE';

export interface Provenance {
  source_type: SourceType;
  source_name?: string;
  source_url_or_identifier?: string | null;
  published_at?: string | null;
  retrieved_at?: string | null;
  confidence?: string | null;
  description?: string;
  as_of?: string;
}

export interface Bar {
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
  vwap?: number | null;
  transactions?: number | null;
}

export interface MarketNode {
  date: string;
  underlying_bar: Bar;
  secondary_close?: number | null;
  vix?: Bar | null;
  label?: string | null;
  move_summary?: string | null;
  severity?: number | null;
  point_only: boolean;
  provenance: Provenance;
}

export interface MacroEvent {
  id: string;
  ts?: string | null;
  date: string;
  tag: string;
  headline: string;
  body?: string | null;
  source: string;
  url?: string | null;
  provenance: Provenance;
}

export interface CampaignMeta {
  id: string;
  title: string;
  note: string;
  playable: boolean;
  underlying: string;
  secondary: string;
  account_default: string;
  default_account_type?: AccountType;
  default_start_cash?: number;
  data_start: string;
  data_end: string;
  node_count: number;
}

export type OptionType = 'call' | 'put' | 'CALL' | 'PUT';

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho?: number;
}

export interface OptionQuote {
  contract_key: string;
  underlying: string;
  type: OptionType;
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  mid: number;
  open_interest?: number | null;
  volume?: number | null;
  iv?: number | null;
  greeks?: Greeks | null;
  provenance: Provenance;
}

export interface GexPoint {
  strike: number;
  raw_gamma_1pct_usd: number;
  call_raw_gamma?: number;
  put_raw_gamma?: number;
  call_oi?: number;
  put_oi?: number;
  heuristic_gex_1pct_usd: number;
  total_oi: number;
  dealer_gex_1pct_usd?: number | null;
}

export interface GexSummary {
  as_of_date: string;
  spot: number;
  gamma_concentration_wall?: number | null;
  heuristic_gamma_wall?: number | null;
  call_wall_raw_gamma?: number | null;
  put_wall_raw_gamma?: number | null;
  warning: string;
  points: GexPoint[];
  provenance: Provenance;
}

export interface YieldCurvePoint {
  tenor: string;
  yield_pct: number;
}

export interface MacroSnapshot {
  date: string;
  fed_funds?: number | null;
  sofr?: number | null;
  ust_2y?: number | null;
  ust_5y?: number | null;
  ust_10y?: number | null;
  ust_30y?: number | null;
  curve_2s10s?: number | null;
  real_yield_10y?: number | null;
  usdjpy?: number | null;
  eurusd?: number | null;
  broad_usd?: number | null;
  vix?: number | null;
  wti?: number | null;
  gold?: number | null;
  yield_curve: YieldCurvePoint[];
  provenance: Provenance;
}

export interface ScannerRow {
  ticker: string;
  name: string;
  asset_type: string;
  game_role: string;
  price: number;
  daily_change_pct: number;
  volume: number;
  relative_volume: number;
  iv: number;
  iv_rank: number;
  options_volume: number;
  open_interest: number;
  spread_quality: string;
  upcoming_event?: string | null;
  sector: string;
  momentum: string;
  news_heat: number;
  analyst_conviction: string;
  macro_sensitivity: string;
  price_source_type?: SourceType;
  price_source_name?: string;
  price_data_status?: 'ADMITTED_REAL_DAILY' | 'PARTIAL_REAL_PRICE' | 'DERIVED_FALLBACK';
}

export interface ScannerResult {
  date: string;
  rows: ScannerRow[];
  highlighted_tickers: string[];
}

export interface TradeThesis {
  id: string;
  contract_or_symbol: string;
  direction: string;
  catalyst: string;
  expected_move_pct: number;
  time_horizon_days: number;
  invalidation_level: number;
  why_instrument: string;
  risk_budget_usd: number;
  created_at_date: string;
}

export interface ThesisRequest {
  contract_or_symbol: string;
  direction: string;
  catalyst: string;
  expected_move_pct: number;
  time_horizon_days: number;
  invalidation_level: number;
  why_instrument: string;
  risk_budget_usd: number;
}

export interface WhatIfScenario {
  scenario_name: string;
  alternative_pnl: number;
  difference_vs_actual: number;
  takeaway?: string;
  reasoning?: string;
}

export interface ProcessScore {
  thesis_quality: number;
  timing_score: number;
  instrument_selection: number;
  risk_management: number;
  execution_discipline: number;
  overall_process_score: number;
  feedback: string;
  pnl_independence_note?: string;
  position_size_score?: number;
  iv_entry_score?: number;
  abstention_quality_score?: number;
  process_notes?: string[];
}

export interface VerdictFinding {
  kind: 'GOOD' | 'WARNING';
  text: string;
}

export interface FundManagerVerdict {
  headline: string;
  narrative: string;
  findings: VerdictFinding[];
  ignored_event_count: number;
}

export interface EventImpact {
  event_name: string;
  window: string;
  underlying_move: number;
  transmission_summary: string;
  attribution_confidence: string;
}

export interface PnLAttribution {
  delta: number;
  gamma?: number;
  theta: number;
  vega: number;
  residual: number;
  net: number;
  note?: string;
}

export interface WhoWasRight {
  participant_id: string;
  participant_name: string;
  role_or_type: string;
  predicted_stance: string;
  predicted_thesis: string;
  outcome_verdict: 'RIGHT' | 'WRONG' | 'PARTIAL' | 'UNRESOLVED';
  explanation: string;
}

export interface DriverRanking {
  rank: number;
  factor_name: string;
  factor_category: string;
  pnl_impact_pct: number;
  explanation: string;
}

export interface TransmissionStep {
  step_index: number;
  trigger: string;
  intermediary: string;
  market_reaction: string;
  portfolio_impact: string;
}

export interface EntryContextSnapshot {
  snapshot_schema_version: number;
  snapshot_id: string;
  timestamp: string;
  game_date: string;
  ticker: string;
  contract_key?: string;
  fundamental_context: Record<string, any>;
  macro_context?: Record<string, any> | null;
  political_policy_context: Record<string, any>;
  street_consensus_context: Record<string, any>;
  institutional_relationship_context: Record<string, any>;
  counterparty_context: Record<string, any>;
  flow_context: Record<string, any>;
  positioning_context: Record<string, any>;
  market_maker_context: Record<string, any>;
  gex_context?: Record<string, any> | null;
  retail_sentiment_context: Record<string, any>;
  social_narrative_context: Record<string, any>[];
  human_actions_context: Record<string, any>[];
  character_advice_context: Record<string, string>;
  news_context: string[];
  player_thesis?: TradeThesis | null;
  execution_context: Record<string, any>;
  lp_fund_context: Record<string, any>;
  edge_provenance?: Record<string, any>[];
}

export interface ExitContextSnapshot {
  snapshot_schema_version: number;
  snapshot_id: string;
  timestamp: string;
  game_date: string;
  ticker: string;
  exit_price: number;
  pnl_realized: number;
  macro_context?: Record<string, any> | null;
  political_policy_context: Record<string, any>;
  street_consensus_context: Record<string, any>;
  institutional_relationship_context: Record<string, any>;
  counterparty_context: Record<string, any>;
  flow_context: Record<string, any>;
  positioning_context: Record<string, any>;
  retail_sentiment_context: Record<string, any>;
  social_narrative_context: Record<string, any>[];
  human_actions_context: Record<string, any>[];
  lp_fund_context: Record<string, any>;
  reason_for_exit: string;
}

export interface TradeReview {
  trade_id: string;
  contract_or_symbol: string;
  kind: string;
  side: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  realized_pl: number;
  exit_reason?: ExitReason;
  return_pct: number;
  mfe_usd?: number;
  mae_usd?: number;
  entry_thesis?: TradeThesis | null;
  entry_snapshot?: EntryContextSnapshot | null;
  exit_snapshot?: ExitContextSnapshot | null;
  attribution: PnLAttribution;
  who_was_right: WhoWasRight[];
  driver_rankings: DriverRanking[];
  transmission_graph: TransmissionStep[];
  player_profile_tag?: string;
  /** 交易质量评级（P&L 权重=0，dante Q1 规格）。 */
  trade_grade?: import("./engine/engines/trade_grade").TradeGradeResult;
  review_sections: Record<string, { entry: any; exit: any; changed: boolean }>;
  decision_context_matrix?: DecisionContextRow[];
  thesis_evolution?: ThesisRevision[];
  thesis_drift?: ThesisDriftAssessment | null;
  decision_timeline?: TimelineEvent[];
  edge_review?: Record<string, any>[];
  profit_associated_with_illegal_edge?: boolean;
  lesson: string;
  macro_context?: MacroSnapshot | null;
  event_impact?: EventImpact | null;
  what_if: WhatIfScenario[];
  process_score: ProcessScore | number;
  thesis_quality_score?: number;
  fund_manager_verdict?: FundManagerVerdict | null;
}

export interface FinancialTerm {
  id: string;
  term_cn: string;
  term_en: string;
  abbreviation?: string;
  category: string;
  short_def: string;
  detailed_explanation: string;
  example?: string;
  difficulty?: string;
  related_terms?: string[];
  analyst_tip: string;
}

export interface WarRoomMessage {
  character_id: string;
  character_name: string;
  role: string;
  portrait: string;
  message: string;
  /** Batch4 clash stance. Legacy market stances remain valid strings. */
  stance: string;
  evidence: string;
  clash_round?: number;
  reply_to_character_id?: string | null;
  reply_to_excerpt?: string | null;
}

export interface WarRoomMeeting {
  date: string;
  topic: string;
  agenda: string;
  messages: WarRoomMessage[];
  player_decision_prompt: string;
  choices: StoryChoicePublic[];
}

/** Persisted, read-only archive entry for a completed or departed War Room. */
export interface WarRoomHistoryEntry {
  date: string;
  topic: string;
  agenda: string;
  messages: WarRoomMessage[];
  choice_id?: string | null;
  choice_label?: string | null;
}

export interface WarRoomChoiceConsequence {
  visible_consequence: string;
  information_depth: string;
  available_action: string;
  capital_or_crisis: string;
}

export type GameMode = 'STORY_CAMPAIGN' | 'WALL_STREET_REPLAY' | 'EMPIRE_MODE';

export type EpisodePhase =
  | 'OPENING'
  | 'WAR_ROOM'
  | 'SCANNER'
  | 'DECISION_1'
  | 'TRADING'
  | 'MID_EVENT'
  | 'DECISION_2'
  | 'MARKET_RESULT'
  | 'TRADE_REVIEW'
  | 'CONSEQUENCE'
  | 'EPISODE_END';

export interface EpisodeMeta {
  episode_id: string;
  season_id: string;
  number: number;
  title: string;
  subtitle: string;
  market_date_start: string;
  market_date_end: string;
  core_conflict: string;
  target_return_pct: number;
  max_drawdown_limit_pct: number;
  compliance_tolerance_level: string;
  unlocked: boolean;
  completed: boolean;
  main_underlying?: string;
  opening_narrative?: string;
  historical_context?: string;
}

export interface DelayedConsequence {
  id: string;
  source_choice_id: string;
  source_episode: number;
  trigger_episode_delay?: number;
  trigger_condition?: string;
  trigger_game_day_index?: number;
  source_game_date?: string;
  consequence_kind?: 'CRISIS_FERMENTATION' | 'COMPLIANCE_RETALIATION';
  forced_story_template_id?: string;
  headline: string;
  narrative: string;
  compliance_escalation?: number;
  lp_confidence_delta?: number;
  relationship_deltas?: Record<string, Record<string, number>>;
  resolved?: boolean;
  /* legacy UI shape kept optional for old callers/saves */
  trigger_episode?: number;
  status?: 'PENDING' | 'TRIGGERED' | 'DISMISSED';
  pnl_impact_usd?: number;
  reputation_impact?: number;
  compliance_impact?: number;
  relationship_impacts?: Record<string, number>;
}

export interface ChoiceLogEntry {
  episode_number: number;
  event_id: string;
  choice_id: string;
  timestamp: string;
  revealed_traits: string[];
}

export interface CharacterMemory {
  event_id: string;
  choice_id: string;
  impact_summary: string;
  game_date: string;
}

export interface CharacterDynamicState {
  character_id: string;
  current_stance: string;
  loyalty_level: number;
  openness_to_risk: number;
  hidden_motive: string;
  dialogue_history: CharacterMemory[];
}

export interface HiddenState {
  sec_investigation_level: number;
  lp_rebellion_meter: number;
  team_defection_risk: number;
  dark_pool_access: boolean;
  street_reputation_tier: string;
}

export interface SurvivalChoice {
  id: string;
  title: string;
  description: string;
  equity_cost_usd: number;
  margin_relief_usd: number;
  reputation_penalty: number;
  compliance_penalty: number;
  relationship_impacts: Record<string, number>;
  narrative_aftermath: string;
}

export interface SeasonReview {
  highest_return_trade: string;
  luckiest_trade: string;
  worst_process_trade: string;
  best_process_trade: string;
  total_process_score_avg: number;
  sec_scrutiny_summary: string;
  lp_retention_rate_pct: number;
  best_trade?: string;
  worst_trade?: string;
  most_trusted_character?: string;
}

export interface SeasonOutcome {
  ending_type: string;
  title: string;
  narrative: string;
  final_equity: number;
  peak_equity: number;
  max_drawdown_pct: number;
  last_significant_drawdown_node?: number;
  total_return_pct: number;
  survival_status: boolean;
  player_archetype: string;
  legacy_score: number;
  adrian_fate: string;
  unlocked_achievements: string[];
  season_review: SeasonReview;
  legacy_card?: any;
  narrative_scenes?: any[];
  ending_title?: string;
  ending_subtitle?: string;
  season_2_inherited_state?: any;
}

export interface EpisodeOutcome {
  episode_number: number;
  passed: boolean;
  realized_pnl: number;
  return_pct: number;
  max_drawdown_pct: number;
  process_score_avg: number;
  process_score?: number;
  lp_confidence_delta: number;
  reputation_delta: number;
  compliance_risk_delta: number;
  key_relationship_deltas: Record<string, number>;
  summary_narrative: string;
  unlocked_clues: string[];
  title?: string;
}

// 7 Wall Street Bank Desks
export interface IPODeal {
  deal_id: string;
  company_name: string;
  ticker: string;
  expected_price_range: [number, number];
  listing_date: string;
  max_allocation_usd: number;
  lockup_days: number;
  sector: string;
}

export interface WallStreetDesk {
  bank_id: string;
  bank_name: string;
  logo: string;
  relationship_tier: string;
  trust_score: number;
  favor_points: number;
  prime_brokerage_available: boolean;
  financing_spread_bps: number;
  stock_borrow_fee_pct: number;
  corporate_access_available: boolean;
  available_ipo_deals: IPODeal[];
  recent_research: Record<string, any>[];
  rep_contact_name: string;
  rep_contact_title: string;
  simulated_notice: string;
}

export interface InstitutionalRelationship {
  trust: number;
  favor: number;
  financing_spread_bps: number;
  borrow_fee_pct?: number;
  research_access_score?: number;
}

export interface PlayerStreetScore {
  total_score: number;
  alpha_reputation: number;
  risk_discipline: number;
  execution_quality: number;
  research_credibility: number;
  institutional_trust: number;
  lp_reputation: number;
  counterparty_standing: number;
  media_profile: number;
  compliance_standing: number;
  talent_magnet: number;
  standing_tier: string;
  human_action_reputation_bonus?: number;
}

// Political & Washington
export interface PolicyEvent {
  id: string;
  date: string;
  branch: string;
  headline: string;
  body: string;
  sector_impact: string;
  potential_transmission: string;
  probability_pct: number;
  source_type: SourceType;
}

export interface PoliticalContact {
  id: string;
  name: string;
  role: string;
  organization: string;
  avatar: string;
  access_cost_capital: number;
  briefing_summary: string;
  favor_balance: number;
}

export interface PoliticalState {
  political_capital: number;
  active_policies: PolicyEvent[];
  contacts: PoliticalContact[];
  washington_sentiment: string;
  regulatory_heat: number;
}

// Sentiment & Social
export interface RetailSentiment {
  ticker: string;
  date: string;
  bullish_pct: number;
  bearish_pct: number;
  fear_greed_index: number;
  euphoria_score: number;
  capitulation_flag: boolean;
  attention_heat: number;
  fomo_velocity: number;
  meme_intensity: number;
  sentiment_regime: string;
  source_type: SourceType;
}

export interface SocialPost {
  id: string;
  timestamp: string;
  author_handle: string;
  author_type: string;
  avatar?: string;
  content: string;
  engagement_likes: number;
  engagement_reposts: number;
  bias: string;
  credibility: number;
  bot_probability: number;
  is_pump: boolean;
  source_type: SourceType;
}

export interface MarketPulse {
  date: string;
  sentiment_regime: string;
  posts: SocialPost[];
}

// Counterparty & Flow
export interface CounterpartyProfile {
  ticker: string;
  dominant_participant: string;
  potential_participants: string[];
  dealer_inventory_bias: string;
  estimated_retail_share_pct: number;
  estimated_institutional_share_pct: number;
  flow_predominance: string;
  // dealer_inventory_bias is a volatility-regime proxy, not an observed dealer book.
  dealer_inventory_bias_source_type?: SourceType;
  dealer_inventory_signed_source_type?: SourceType;
  dealer_inventory_note?: string;
  participant_share_source_type?: SourceType;
  source_type: SourceType;
}

export interface FlowSummary {
  ticker: string;
  date: string;
  call_volume: number;
  put_volume: number;
  put_call_ratio: number;
  open_interest_change: number;
  large_sweep_count: number;
  relative_options_vol: number;
  volume_shock_detected: boolean;
  block_trade_activity: string;
  etf_flow_estimate_usd: number;
  etf_flow_source_type: SourceType;
  put_call_ratio_source_type?: SourceType;
  relative_options_vol_source_type?: SourceType;
  large_sweep_count_source_type?: SourceType;
  volume_shock_source_type?: SourceType;
  open_interest_change_source_type?: SourceType;
  source_type: SourceType;
}

export interface PositioningSummary {
  ticker: string;
  crowdedness_score: number;
  trapped_long_risk: string;
  trapped_short_risk: string;
  short_interest_pct: number;
  cta_exposure_regime: string;
  pain_trade_direction: string;
  regime_label: string;
  crowdedness_source_type?: SourceType;
  trapped_risk_source_type?: SourceType;
  source_type: SourceType;
}

export interface AnalystReport {
  id: string;
  bank_id: string;
  bank_name: string;
  analyst_name: string;
  rating: string;
  target_price: number;
  published_date: string;
  thesis_summary: string;
  source_type: SourceType;
}

export interface StreetConsensus {
  ticker: string;
  as_of_date: string;
  mean_target_price: number;
  median_target_price: number;
  highest_target: number;
  lowest_target: number;
  dispersion_score: number;
  reports: AnalystReport[];
  source_type: SourceType;
}

export interface LPProfile {
  id: string;
  name: string;
  lp_type: string;
  allocated_capital: number;
  target_return_pct: number;
  max_tolerated_drawdown_pct: number;
  liquidity_terms: string;
  confidence_score: number;
  redemption_risk: string;
  key_contact: string;
  relationship_notes: string;
  risk_appetite: string;
  ethical_sensitivity: string;
  compliance_sensitivity: string;
  strategy_preference: string;
  redemption_threshold_pct: number;
  capital_current: number;
  next_review_date: string;
  simulated_notice: string;
}

export type LegalityClass = 'LEGAL' | 'AGGRESSIVE_LAWFUL' | 'MNPI_RISK' | 'ILLEGAL';
export type WalletId = 'FUND_CASH' | 'MANAGEMENT_COMPANY' | 'GP_WEALTH';

export interface HumanActionChoice {
  id: string;
  label: string;
  cost_usd: number;
  favor_delta: number;
  morale_delta: number;
  reputation_delta: number;
  result_narrative: string;
  lp_capital_delta?: number;
  unlocks_intel?: Record<string, unknown> | null;
  wallet?: WalletId;
  legality_class?: LegalityClass;
  evidence_points_delta?: number;
  compliance_risk_delta?: number;
  immutable_evidence_category?: ImmutableEvidenceEntry['category'];
  immutable_flag?: string;
  intel_truth_state?: 'UNVERIFIED' | 'CROSS_VALIDATED';
}

export interface HumanActionEvent {
  id: string;
  date: string;
  action_kind: string;
  character_id?: string | null;
  headline: string;
  body: string;
  choices: HumanActionChoice[];
  resolved: boolean;
  chosen_choice_id?: string | null;
  impact_summary: string;
  source_type: SourceType;
}

export type AccountType = 'TFSA' | 'CASH' | 'MARGIN' | 'Cash' | 'Margin';
export type OrderSide =
  | 'BUY_TO_OPEN'
  | 'SELL_TO_CLOSE'
  | 'SELL_COVERED_CALL'
  | 'BUY_TO_CLOSE'
  | 'SELL_CASH_SECURED_PUT'
  | 'BUY_SHARES'
  | 'SELL_SHARES'
  | 'buy_to_open'
  | 'sell_to_close'
  | 'sell_covered_call'
  | 'buy_to_close'
  | 'sell_cash_secured_put'
  | 'buy_shares'
  | 'sell_shares'
  | 'exercise_long_option'
  | 'buy_vertical_spread'
  | 'buy_straddle';

export type OrderKind = 'MARKET' | 'LIMIT' | 'Market' | 'Limit';

export interface OrderRequest {
  side: OrderSide;
  client_order_id?: string;
  type: OptionType;
  strike: number;
  expiration: string;
  qty: number;
  order_kind?: OrderKind;
  limit_price?: number | null;
  thesis?: ThesisRequest | null;
  strategy_kind?: 'VERTICAL_SPREAD' | 'STRADDLE' | null;
  strategy_legs?: Array<{
    type: OptionType;
    strike: number;
    expiration: string;
    side: 'LONG' | 'SHORT';
  }>;
}

export interface OrderResult {
  accepted: boolean;
  fill_price: number;
  total_cost: number;
  message: string;
  execution_label?: string;
  realized_pl?: number;
  trade_review_id?: string;
  filled_qty?: number;
}

export interface Position {
  id: string;
  type: OptionType;
  strike: number;
  expiration: string;
  qty: number;
  filled_qty?: number;
  entry_price: number;
  current_price: number;
  is_short: boolean;
  short?: boolean;
  collateral_locked_usd?: number;
  underlying_shares_locked: number;
  unrealized_pl: number;
  realized_pl: number;
  peak_unrealized_pl: number;
  trough_unrealized_pl: number;
  strategy_id?: string;
  strategy_kind?: 'VERTICAL_SPREAD' | 'STRADDLE';
}

export type ExitReason = 'MANUAL_CLOSE' | 'EXPIRED_WORTHLESS' | 'EXPIRED_ITM' | 'EXERCISED' | 'ASSIGNED';

export interface Character {
  id: string;
  name: string;
  role: string;
  organization: string;
  avatar: string;
  portrait?: string;
  trust: number;
  favor: number;
  bio: string;
  specialty?: string;
}

export interface Relationship {
  character_id?: string;
  trust: number;
  favor: number;
  rivalry: number;
  leverage?: number;
  respect?: number;
  fear?: number;
  alignment?: string;
}

export interface FundStats {
  aum: number;
  nav: number;
  high_water_mark: number;
  sharpe_ratio: number;
  win_rate: number;
  cash?: number;
  reputation?: number;
  lp_confidence?: number;
  information_network?: number;
  compliance_risk?: number;
  political_capital?: number;
  counterparty_trust?: number;
  staff_morale?: number;
}

export type IntelClass = 'PUBLIC_VERIFIED' | 'PUBLIC_RUMOR' | 'PRIVATE_INTEL' | 'POSSIBLE_MNPI';

export interface StoryChoicePublic {
  id: string;
  label: string;
  thesis_direction?: string;
  suggested_instrument?: string;
  outcome?: WarRoomChoiceConsequence;
  selected?: boolean;
  disabled?: boolean;
}

export interface StoryEventPublic {
  id: string;
  template_id: string;
  game_date: string;
  character_id?: string | null;
  intel_class: IntelClass;
  headline: string;
  body: string;
  resolved: boolean;
  deferred?: boolean;
  mandatory_before_trade?: boolean;
  chosen_choice_id?: string | null;
  sfx: string;
  choices: StoryChoicePublic[];
}

export interface OrderLogEntry {
  date: string;
  message: string;
  kind?: string;
}

export interface AIFund {
  id: string;
  name: string;
  style: string;
  risk_tolerance: number;
  leverage: number;
  information_quality: number;
  panic_threshold: number;
  nav: number;
  aum: number;
  pnl: number;
  max_drawdown: number;
  return_pct: number;
}

export interface GameState {
  session_id: string;
  mode: GameMode;
  campaign_id: string;
  account_type: AccountType;
  game_day_index: number;
  cash: number;
  start_cash: number;
  realized_pl: number;
  shares: number;
  share_cost_basis: number;
  margin_debt: number;
  cumulative_margin_interest_paid: number;
  /**
   * 净值历史：`{ d: 游戏日下标, v: 当日净资产 }`，按日去重。
   * 必须持久化——净值取决于那天的持仓与现金，推进过去就倒推不出来了。
   * （席位轨迹不用存：恩怨账本每条自带日期，能从账本重算。）
   */
  nav_history?: Array<{ d: number; v: number }>;
  /** V30: 恩怨账本 —— 玩家选择的持久后果 */
  grudge_ledger?: GrudgeLedgerEntry[];
  /** V30: 资金链级联的落地日志 */
  cascade_log?: string[];
  positions: Position[];
  real_quotes: Record<string, OptionQuote>;
  real_options_loaded: boolean;
  story_seed: number;
  story_history: any[];
  pending_story_events: any[];
  relationships: Record<string, Relationship>;
  institutional_relationships: Record<string, InstitutionalRelationship>;
  fund_stats: FundStats;
  ai_funds: AIFund[];
  compliance_state: Record<string, any>;
  last_attribution?: PnLAttribution | null;
  order_log: OrderLogEntry[];
  processed_order_ids?: string[];
  lp_inquiry_state?: {
    answered: boolean;
    answer_id?: string;
    answered_date?: string;
    inquiry_id?: string;
  };
  trade_reviews: TradeReview[];
  active_theses: Record<string, TradeThesis>;
  current_season_id: string;
  current_episode_number: number;
  current_phase: EpisodePhase;
  character_emotions?: Record<string, any>;
  market_reveal_profile?: {
    ego_risk: number;
    deferrals_under_adverse_price: number;
  } | null;
  thesis_session_profile?: {
    conviction: number;
    adaptability: number;
    curiosity: number;
    second_order_thinking: number;
    noise_filter: number;
    ego_risk: number;
  } | null;
  /** Legacy save compatibility only; active engines must not write it. */
  reasoning_profile?: Record<string, unknown> | null;
  /** Legacy save compatibility only; stages are now a pure selector result. */
  relationship_stages?: Record<string, any>;
  hidden_state: HiddenState;
  player_traits: string[];
  delayed_consequences: DelayedConsequence[];
  choice_history: ChoiceLogEntry[];
  completed_episodes: EpisodeOutcome[];
  season_outcome?: SeasonOutcome | null;
  peak_aum: number;
  max_drawdown_pct: number;
  market_clock?: MarketClockState;
  thesis_history?: Record<string, ThesisRevision[]>;
  player_decisions?: TimelineEvent[];
  war_room_history?: WarRoomHistoryEntry[];
  tutorial?: TutorialProgress;
  // Capital, Power & Edge Economy
  management_company: ManagementCompanyState;
  gp_wealth: GPWealthState;
  talent_roster?: TalentRosterEntry[];
  talent_events_history?: TalentEventHistoryEntry[];
  talent_team_events?: TalentTeamEventRecord[];
  team_jealousy?: number;
  gp_spend_history?: GPSpendRecord[];
  gp_visibility?: number;
  lp_optics?: number;
  media_attention?: number;
  gift_ledger?: GiftLedgerEntry[];
  economy?: EconomyState;
  intel?: IntelState;
  evidence_ledger?: ImmutableEvidenceEntry[];
  mnpi_flags?: string[];
  bribery_flags?: string[];
  audit_trail?: EconomyAuditEntry[];
  crisis_actions?: CrisisActionRuntime[];
  crisis_action_ledger?: Array<Record<string, unknown>>;
  crisis_events?: CrisisEventRecord[];
  cash_preservation?: boolean;
  runway_warning?: 'NONE' | 'RUNWAY_2M' | 'CASH_PRESERVATION';
  legal_defense_quality?: number;
  procedural_compliance?: number;
  future_negative_media_multiplier?: number;
  future_negative_media_until_node?: number;
  pr_pressure?: number;
  misleading_lp_comm?: boolean;
  gray_actions_blocked_until_node?: number;
  employees: Employee[];
  data_subscriptions: DataSubscription[];
  ai_stack: AIStackState;
  evidence_state: EvidenceState;
  acquired_intel: AcquiredEdgeIntel[];
  capital_spend_log: CapitalSpendLogEntry[];
  created_at: string;
  updated_at: string;
  cash_collateral_reserved?: number;
  v28_stress_margin_requirement?: number;
  v28_stress_margin_label?: 'DERIVED_STRESS_MODEL';
  v28_abstention_reviews?: Array<{
    date: string;
    action: 'DO_NOTHING' | 'PASS';
    reason: string;
    quality_score: number;
    note: string;
  }>;
}

// ---------------------------------------------------------------------------
// Capital, Power & Edge Economy
// ---------------------------------------------------------------------------

export interface ManagementCompanyState {
  cash: number;
  monthly_burn: number;
  annualized_burn: number;
  runway_months: number;
  management_fee_rate: number;
  performance_fee_rate: number;
  high_water_mark: number;
  fee_income_ytd: number;
  performance_income_ytd: number;
  payroll_cost_annual: number;
  data_cost_annual: number;
  ai_compute_cost_annual: number;
  legal_cost_annual: number;
  compliance_cost_annual: number;
  technology_cost_annual: number;
  ir_cost_annual: number;
  other_operating_cost_annual: number;
  headcount: number;
  last_accrual_date: string;
}

export interface GPWealthState {
  cash: number;
  total_distributions_received: number;
  total_injected_to_company: number;
  legal_defense_spent: number;
  personal_monthly_burn?: number;
  club_membership_active?: boolean;
  luxury_home_active?: boolean;
  jet_charter_count?: number;
  last_personal_burn_month?: string | null;
  personal_burn_delinquent?: boolean;
}

export type IntelTier = 'OFF' | 'BASIC' | 'PRO' | 'ELITE';
export type IntelSubscriptionStatus = 'OFF' | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'COLD';

export interface EconomyTransferEntry {
  id: string;
  date: string;
  from_wallet: 'GP_CASH' | 'MANAGEMENT_CASH';
  to_wallet: 'GP_CASH' | 'MANAGEMENT_CASH';
  amount: number;
  reason: string;
  kind?: 'TRANSFER' | 'MIGRATION_RESET';
}

export interface EconomySettlementRecord {
  settlement_id: string;
  month_id: string;
  date: string;
  fund_nav: number;
  management_cash_before: number;
  management_cash_after: number;
  management_fee: number;
  performance_fee: number;
  high_water_mark_before: number;
  high_water_mark_after: number;
  intel_due: number;
  intel_paid: boolean;
  quant_due?: number;
  quant_paid?: boolean;
  talent_due?: number;
  talent_paid?: boolean;
  legal_due?: number;
  legal_paid?: boolean;
  pr_due?: number;
  pr_paid?: boolean;
  total_burn_due?: number;
}

export interface EconomyAuditEntry {
  id: string;
  date: string;
  action: string;
  wallet: 'FUND_NAV' | 'MANAGEMENT_CASH' | 'GP_CASH' | 'NONE';
  amount: number;
  detail: string;
}

export interface EconomyState {
  /** Canonical economy schema; saves without it are treated as pre-v2. */
  schema_version?: number;
  management_cash: number;
  gp_cash: number;
  high_water_mark: number;
  accrued_mgmt_fee: number;
  accrued_perf_fee: number;
  monthly_burn: number;
  last_month_settled: string | null;
  settled_ids: string[];
  transfer_ledger: EconomyTransferEntry[];
  settlement_ledger: EconomySettlementRecord[];
}

export type CrisisActionId = 'OUTSIDE_COUNSEL' | 'LP_COMMUNICATION' | 'PUBLIC_RESPONSE' | 'POLICY_COUNSEL' | 'MEDIA_COUNTER' | 'INTERNAL_REMEDIATION';
export interface CrisisActionRuntime {
  action_id: CrisisActionId;
  cooldown_nodes: number;
  last_used_node: number | null;
  diminishing_bucket: string;
  usage_30d: Array<{ action_id: CrisisActionId; date: string; node_index: number; has_new_information?: boolean }>;
  month_usage: Record<string, number>;
  blocked_until_node: number | null;
}
export interface CrisisEventRecord {
  id: string;
  event_id: string;
  date: string;
  node_index: number;
  headline: string;
  body: string;
  choices: Array<{ id: 'A_GO_SILENT' | 'B_TRANSPARENT_BRIEFING' | 'C_DOUBLE_DOWN'; label: string; cost_usd: number; result_narrative: string }>;
  resolved: boolean;
  chosen_choice_id: 'A_GO_SILENT' | 'B_TRANSPARENT_BRIEFING' | 'C_DOUBLE_DOWN' | null;
  resolved_on_date?: string;
}

export interface IntelSourceRecord {
  id: string;
  date: string;
  node_index: number;
  tier: IntelTier | 'SHADOW';
  source_count: number;
  reliability: number;
  truth_state: 'UNVERIFIED' | 'CROSS_VALIDATED';
  summary: string;
}

export interface IntelLead {
  id: string;
  date: string;
  node_index: number;
  title: string;
  summary: string;
  truth_state: 'UNVERIFIED' | 'CROSS_VALIDATED';
  reliability: number;
  expires_after_node: number;
}

export interface IntelState {
  tier: IntelTier;
  shadow_enabled: boolean;
  info_network: number;
  target: number;
  paid_through_month: string | null;
  effective_after_node: number;
  source_history: IntelSourceRecord[];
  active_leads: IntelLead[];
  misinfo_seed: number;
  delinquent_nodes: number;
  network_cold: boolean;
  cold_start_until_node: number;
  status: IntelSubscriptionStatus;
  generated_gray_event_ids: string[];
}

export interface ImmutableEvidenceEntry {
  id: string;
  date: string;
  action_id: string;
  category: 'PROCEDURAL' | 'MNPI' | 'BRIBERY' | 'EXTORTION_RISK' | 'OTHER';
  evidence_points: number;
  fact: string;
  truth_state: 'UNVERIFIED' | 'VERIFIED';
}

export type EmployeeRole =
  | 'RESEARCH_ASSOCIATE'
  | 'SENIOR_ANALYST'
  | 'MACRO_STRATEGIST'
  | 'QUANT_RESEARCHER'
  | 'RISK_MANAGER'
  | 'COMPLIANCE_OFFICER'
  | 'LEGAL_COUNSEL'
  | 'DATA_ENGINEER'
  | 'AI_ENGINEER'
  | 'INVESTOR_RELATIONS'
  | 'OPERATIONS';

export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  salary_annual: number;
  bonus_expectation_pct: number;
  morale: number;
  loyalty: number;
  skill: number;
  capacity_pct: number;
  poaching_risk: number;
  hired_date: string;
  fictional: boolean;
  simulated_notice: string;
  talent_role_id?: TalentRoleId;
  is_talent?: boolean;
}

export type TalentRoleId = 'ANALYST' | 'QUANT' | 'COUNSEL' | 'CRISIS_PR' | 'EX_REG';
export type TalentRosterStatus = 'ACTIVE' | 'GRACE' | 'DELINQUENT' | 'RESIGNED' | 'SUSPENDED';
export type TalentActionId = 'DEEP_DIVE' | 'MODEL_AUDIT' | 'PRIVILEGED_REVIEW' | 'SHAPE_NARRATIVE' | 'REGULATORY_MAP';
export type TalentRetentionChoice = 'MATCH' | 'PROMOTE' | 'LET_GO' | 'COUNTER_WITH_EQUITY';
export type TalentTeamEventId = 'STAR_JEALOUSY' | 'CONFLICT_OF_INTEREST' | 'ANALYST_VS_QUANT';
export type GPSpendItemId = 'PRIVATE_DINNER' | 'CLUB_MEMBERSHIP' | 'CHARITY_GALA' | 'LUXURY_HOME' | 'PRIVATE_JET' | 'GIFT';

export interface TalentRosterEntry {
  role_id: TalentRoleId;
  employee_id: string;
  name: string;
  status: TalentRosterStatus;
  loyalty: number;
  monthly_burn: number;
  signing_cost: number;
  retention_bonus_total: number;
  market_heat: number;
  outside_offer_value: number;
  conflict_tags: string[];
  active_action_cd: number;
  last_used_node: number | null;
  consecutive_high_load_nodes: number;
  hired_date: string;
  last_action_id?: TalentActionId | null;
  equity_share_pct?: number;
  grace_nodes_left?: number;
  payroll_arrears?: number;
}

export interface TalentEventHistoryEntry {
  id: string;
  event_id: string;
  date: string;
  node_id: string;
  kind: 'SIGNING' | 'RETENTION' | 'RESIGNATION' | 'ABILITY' | 'TEAM_EVENT' | 'MONTHLY_PAYROLL';
  role_id?: TalentRoleId;
  choice_id?: string;
  amount?: number;
  detail: string;
}

export interface TalentTeamEventRecord {
  id: string;
  event_id: TalentTeamEventId;
  date: string;
  node_id: string;
  role_ids: TalentRoleId[];
  resolved: boolean;
  choice_id?: string | null;
}

export interface GPSpendRecord {
  id: string;
  item_id: GPSpendItemId;
  date: string;
  node_id: string;
  amount: number;
  wallet: 'GP_WEALTH';
  source: 'GP_PERSONAL';
  before: number;
  after: number;
  reason: string;
  visibility_delta: number;
  lp_optics_delta: number;
  media_attention_delta: number;
  bribery_score?: number;
}

export interface GiftLedgerEntry {
  id: string;
  date: string;
  node_id: string;
  recipient_id: string;
  recipient_type: string;
  amount: number;
  bribery_score: number;
  classification: 'GIFT' | 'GRAY_AREA' | 'BRIBERY_FLAG';
  quid_pro_quo: 'NONE' | 'IMPLIED' | 'EXPLICIT';
  evidence_added: number;
  compliance_risk_added: number;
}

export interface BriberyAssessment {
  amount_factor: number;
  recipient_factor: number;
  timing_factor: number;
  quid_pro_quo_factor: number;
  score: number;
  classification: 'GIFT' | 'GRAY_AREA' | 'BRIBERY_FLAG';
  evidence_delta: number;
  compliance_risk_delta: number;
}

export interface DataSubscription {
  id: string;
  name: string;
  category: string;
  monthly_cost: number;
  active: boolean;
  subscribed_date: string;
  provenance_note: string;
}

export type AIStackLevel =
  | 'LEVEL_0_MANUAL'
  | 'LEVEL_1_ASSISTANT'
  | 'LEVEL_2_MULTI_AGENT'
  | 'LEVEL_3_INSTITUTIONAL';

export interface AIStackState {
  level: AIStackLevel;
  monthly_compute_cost: number;
  engineering_headcount: number;
  hallucination_risk: number;
  model_risk_note: string;
}

export type InvestigationStage =
  | 'CLEAN'
  | 'SUSPICIOUS'
  | 'INTERNAL_CONCERN'
  | 'REGULATORY_INQUIRY'
  | 'FORMAL_INVESTIGATION'
  | 'CIVIL_ENFORCEMENT'
  | 'CRIMINAL_INVESTIGATION'
  | 'CHARGED'
  | 'SETTLED'
  | 'TRIAL'
  | 'CONVICTED'
  | 'ACQUITTED';

export interface EvidenceRecord {
  id: string;
  date: string;
  category: string;
  description: string;
  evidence_points: number;
  witness_ids: string[];
  legality_class: LegalityClass;
  related_action_id: string;
}

export interface EvidenceState {
  evidence_points: number;
  witness_count: number;
  internal_awareness: number;
  external_awareness: number;
  whistleblower_risk: number;
  enforcement_interest: number;
  investigation_stage: InvestigationStage;
  records: EvidenceRecord[];
  investigator_character_id: string;
  last_escalation_date: string;
  simulated_notice: string;
}

export type InformationReliability = 'TRUE' | 'PARTIAL' | 'MISLEADING' | 'FABRICATED';

export interface AcquiredEdgeIntel {
  id: string;
  headline: string;
  body: string;
  legality_class: LegalityClass;
  source_type: SourceType;
  reliability: InformationReliability;
  acquired_date: string;
  cost_usd: number;
  who_else_knows: string[];
  ticker: string;
  traded_on: boolean;
}

export type CapitalSpendCategory =
  | 'TEAM'
  | 'RESEARCH'
  | 'DATA'
  | 'AI'
  | 'TECHNOLOGY'
  | 'RISK'
  | 'COMPLIANCE'
  | 'LEGAL'
  | 'INSTITUTIONAL'
  | 'POLICY'
  | 'INTELLIGENCE'
  | 'SPECIAL_OPERATIONS'
  | 'OPERATIONS';

export interface CapitalSpendLogEntry {
  id: string;
  date: string;
  category: CapitalSpendCategory;
  label: string;
  amount_usd: number;
  wallet: WalletId;
  legality_class: LegalityClass;
}

export interface PositionMark {
  position_id: string;
  mark: number;
  pl: number;
}

export interface WhatMattersItem {
  id: string;
  headline: string;
  impact: string;
  affected: string;
  why_it_matters: string;
  character_voice?: string;
  source_panel: string;
  source_type: string;
  confidence: string;
}

export interface DecisionContextRow {
  factor: string;
  entry: any;
  exit: any;
  change: boolean;
  impact: string;
  source: string;
  confidence: string;
}

export interface GameStateView {
  state: GameState;
  equity: number;
  unrealized_pnl: number;
  /**
   * 组合层希腊字母合计（口径与单位见 engine/engines/portfolio_greeks.ts）。
   * `partial=true` 表示有腿定价失败、**没有**计入合计——UI 必须据此标注不完整。
   */
  portfolio_greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    contracts_counted: number;
    contracts_missing: number;
    shares_counted: number;
    partial: boolean;
  } | null;
  position_marks: PositionMark[];
  pending_story_public: StoryEventPublic[];
  account_rule_text: string;
  margin_requirement: number;
  margin_buying_power: number;
  margin_call_active: boolean;
  macro_snapshot?: MacroSnapshot | null;
  gex_summary?: GexSummary | null;
  scanner_result?: ScannerResult | null;
  latest_war_room?: WarRoomMeeting | null;
  current_episode?: EpisodeMeta | null;
  last_episode_outcome?: EpisodeOutcome | null;
  season_outcome?: SeasonOutcome | null;
  wall_street_desk?: WallStreetDesk[];
  player_street_score?: PlayerStreetScore;
  political_state?: PoliticalState;
  retail_sentiment?: RetailSentiment;
  market_pulse?: MarketPulse;
  counterparty_profile?: CounterpartyProfile;
  flow_summary?: FlowSummary;
  positioning_summary?: PositioningSummary;
  street_consensus?: StreetConsensus;
  lp_profiles?: LPProfile[];
  human_action_feed?: HumanActionEvent[];
  crisis_actions?: CrisisActionRuntime[];
  crisis_events?: CrisisEventRecord[];
  cash_preservation?: boolean;
  runway_months?: number;
  what_matters_today?: WhatMattersItem[];
  market_clock?: MarketClockState | null;
  open_thesis_drift?: Record<string, ThesisDriftAssessment>;
  decision_timeline?: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Final Integrated Gameplay Pass
// ---------------------------------------------------------------------------

export type ThesisDriftLevel = 'NONE' | 'MINOR' | 'MATERIAL' | 'SEVERE';

export interface ThesisRevision {
  revision_index: number;
  revision_id: string;
  game_date: string;
  node_index: number;
  direction: string;
  catalyst: string;
  expected_move_pct: number;
  time_horizon_days: number;
  invalidation_level: number;
  why_instrument: string;
  risk_budget_usd: number;
  revision_reason: string;
  underlying_at_revision: number;
  is_entry: boolean;
}

export interface ThesisDriftFinding {
  rule_id: string;
  level: ThesisDriftLevel;
  summary: string;
  evidence: string;
}

export interface ThesisDriftAssessment {
  level: ThesisDriftLevel;
  findings: ThesisDriftFinding[];
  revision_count: number;
  adaptive_notes: string[];
  note: string;
}

export interface ThesisRevisionRequest {
  position_id: string;
  direction: string;
  catalyst: string;
  expected_move_pct: number;
  time_horizon_days: number;
  invalidation_level: number;
  why_instrument: string;
  risk_budget_usd: number;
  revision_reason: string;
}

export type AdvanceMode = 'NEXT_NODE' | 'NEXT_MAJOR_EVENT';
export type PauseSeverity = 'MANDATORY' | 'NOTABLE' | 'ROUTINE';

export interface PauseReason {
  trigger_id: string;
  severity: PauseSeverity;
  headline: string;
  detail: string;
  source_panel: string;
  source_type: SourceType;
  position_id: string;
}

export interface MarketClockState {
  paused: boolean;
  node_granularity: string;
  current_node_index: number;
  current_node_date: string;
  total_nodes: number;
  is_final_node: boolean;
  last_advance_mode?: AdvanceMode | null;
  nodes_advanced_last_call: number;
  pause_reasons: PauseReason[];
  advance_label: string;
  next_node_label: string;
}

export type TimelineActor =
  | 'PLAYER'
  | 'MARKET'
  | 'CHARACTER'
  | 'INSTITUTION'
  | 'POLITICAL'
  | 'SYSTEM';

export interface TimelineEvent {
  event_id: string;
  game_date: string;
  node_index: number;
  actor: TimelineActor;
  category: string;
  headline: string;
  detail: string;
  position_id: string;
  source_type: SourceType;
}

export interface TutorialProgress {
  tutorial_completed: boolean;
  guided_mode_active: boolean;
  current_step: string;
  completed_steps: string[];
  tutorial_direction: string;
  first_trade_position_id: string;
  first_trade_review_shown: boolean;
}

export interface SaveSlotInfo {
  slot: string;
  campaign_id: string;
  game_date: string;
  equity: number;
  updated_at: string;
  episode_info?: string;
}

export interface NewGameRequest {
  campaign_id: string;
  mode?: GameMode;
  account_type: AccountType;
  start_cash: number;
  story_seed?: number;
}

// ── V30 权力系统 ────────────────────────────────────────────────────────
// 恩怨账本：记录玩家对每个人做过什么。恩会随时间衰减，怨不会——
// 这条不对称是刻意的，也是这类圈子的真实规律。
export type GrudgeKind = 'DEBT' | 'GRUDGE' | 'LEVERAGE';

export interface GrudgeLedgerEntry {
  id: string;
  subject: string;
  date: string;
  kind: GrudgeKind;
  weight: number;
  /** 玩家当时具体做了什么——后续事件文案直接引用这句话 */
  what: string;
  origin_event_id?: string;
  origin_choice_id?: string;
  /** LEVERAGE 专用：'PLAYER' = 你握着对方；'SUBJECT' = 对方握着你 */
  holder?: 'PLAYER' | 'SUBJECT';
  spent?: boolean;
  spent_on_date?: string;
  source_type: 'SIMULATED';
}
