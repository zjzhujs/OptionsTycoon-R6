/**
 * TypeScript declarations ported from backend/app/schemas.py.
 * This file contains no runtime dependencies.
 */

// Python: class SourceType(str, Enum)
export type SourceType = 'REAL' | 'REAL_PRIMARY' | 'REAL_VENDOR' | 'DERIVED' | 'DERIVED_REAL_INPUTS' | 'DERIVED_MODEL' | 'DERIVED_HEURISTIC' | 'ESTIMATED' | 'SIMULATED' | 'DATA_UNAVAILABLE';

// Python: class Provenance(BaseModel)
export interface Provenance {
  source_type: SourceType;
  source_name: string;
  source_url_or_identifier?: string | null;
  published_at?: string | null;
  retrieved_at?: string | null;
  confidence?: string | null;
}

// Python: class Bar(BaseModel)
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

// Python: class MarketNode(BaseModel)
export interface MarketNode {
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

// Python: class MacroEvent(BaseModel)
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

/**
 * Campaign-level regime vocabulary.
 *
 * The six legacy labels and the eight campaign labels are one shared
 * vocabulary. MacroEvent keeps its historical free-form `tag` string because
 * the existing event packs also contain compound tags (for example
 * `AI/TARIFF`); campaign wiring validates each component against this union.
 */
export type CampaignRegimeTag =
  | 'AI'
  | 'EARNINGS'
  | 'GENERIC'
  | 'NEWS'
  | 'TARIFF'
  | 'WAR'
  | 'CRISIS'
  | 'FED'
  | 'INFLATION'
  | 'M&A'
  | 'MEME'
  | 'RATES'
  | 'REGULATION'
  | 'VOLATILITY';

export type CampaignDateMode = 'CONTIGUOUS' | 'EVENT_NODE' | 'LONG_HORIZON';
export type ArcStatus = 'NOT_STARTED' | 'ACTIVE_FOCUS' | 'ACTIVE_DORMANT' | 'COMPLETED';
export type TransitionKind = 'ENTER' | 'FOCUS' | 'SUSPEND' | 'RESUME' | 'COMPLETE';

export interface BackgroundUpdatePolicy {
  mark_to_market: boolean;
  accrue_financing: boolean;
  apply_corporate_actions: boolean;
  process_story_events: boolean;
}

export interface CompletionRule {
  mode: 'ALL' | 'ANY';
  beat_ids?: string[];
  public_event_ids?: string[];
}

export interface SessionRules {
  opening_gate?: string;
  guided_mode?: boolean;
  allow_time_jump?: boolean;
}

export interface TradeLockWindow {
  id: string;
  start_at: string;
  end_at?: string | null;
  reason: string;
  allowed_sides?: string[];
}

export interface FallbackPolicy {
  mode: 'BLOCK' | 'EVENT_ONLY' | 'LOWER_FREQUENCY' | 'SIMULATED_NOTICE';
  notice: string;
}

export interface InitialStatePolicy {
  mode: 'CAREER_ORIGIN' | 'CONTINUE_LEDGER' | 'REPLAY_SNAPSHOT';
  allow_cash_seed: boolean;
  allow_position_seed: boolean;
}

export interface CarryablePositionPolicy {
  enabled: boolean;
  next_campaign_ids: string[];
  symbols: string[];
  asset_kinds: string[];
}

export interface CarryDataCoverageRule {
  symbol: string;
  from_at: string;
  to_at: string;
  required_fields: string[];
  status: 'VERIFIED' | 'PARTIAL' | 'MISSING';
  available_dates?: string[];
  missing_dates?: string[];
  coverage_ratio?: number;
  source_refs?: string[];
  note?: string;
}

export interface DomainRoleSlot {
  domain: string;
  primary_character_id: string;
  fallback_character_ids: string[];
  minimum_viable: 'CHARACTER' | 'SYSTEM_PANEL' | 'BLOCKED';
}

/**
 * The canonical campaign contract. `prerequisites` are advisory and can
 * trigger scaffolding; they must never block the historical career clock.
 */
export interface CampaignManifest extends CampaignMeta {
  start_at: string;
  end_at?: string | null;
  activation_beats: string[];
  can_overlap: boolean;
  background_update_policy: BackgroundUpdatePolicy;
  completion_rule: CompletionRule;
  date_mode: CampaignDateMode;
  session_rules: SessionRules;
  trade_lock_windows: TradeLockWindow[];
  required_symbols: string[];
  required_fields: string[];
  fallback_policy: FallbackPolicy;
  historical_vs_simulated: 'HISTORICAL' | 'SIMULATED';
  initial_state_policy: InitialStatePolicy;
  carryable_positions: CarryablePositionPolicy;
  carry_data_coverage: CarryDataCoverageRule[];
  domain_role_slots: DomainRoleSlot[];
  prerequisites: string[];
  teaches: string[];
  tests: string[];
  complexity_axes: string[];
  regime_tags: CampaignRegimeTag[];
}

export interface TransitionTrigger {
  kind: 'DATE' | 'PUBLIC_EVENT' | 'CAMPAIGN_BEAT';
  at?: string;
  event_id?: string;
  beat_id?: string;
}

export interface ContinuityPolicy {
  preserve: Array<'RELATIONSHIPS' | 'MEMORIES' | 'TRAITS' | 'LP' | 'PB' | 'COMPLIANCE_META'>;
  position_rule: 'MANIFEST_GATED';
  keep_fund_balance_sheet: true;
}

/** Event-driven arc transition; it is not a linear seven-boundary edge. */
export interface TransitionSpec {
  id: string;
  campaign_id: string;
  kind: TransitionKind;
  trigger: TransitionTrigger;
  source_campaign_id?: string | null;
  target_campaign_id?: string | null;
  continuity: ContinuityPolicy;
}

// Python: class CampaignMeta(BaseModel)
export interface CampaignMeta {
  id: string;
  title: string;
  note: string;
  playable: boolean;
  underlying: string;
  secondary: string;
  account_default?: string;
  default_account_type?: AccountType;
  default_start_cash?: number;
  data_start: string;
  data_end: string;
  node_count: number;
}

// Python: class OptionType(str, Enum)
export type OptionType = 'call' | 'put';

// Python: class Greeks(BaseModel)
export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

// Python: class OptionQuote(BaseModel)
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

// Python: class GexPoint(BaseModel)
export interface GexPoint {
  strike: number;
  raw_gamma_1pct_usd: number;
  call_raw_gamma: number;
  put_raw_gamma: number;
  heuristic_gex_1pct_usd: number;
  total_oi: number;
  dealer_gex_1pct_usd?: number | null;
}

// Python: class GexSummary(BaseModel)
export interface GexSummary {
  as_of_date: string;
  spot: number;
  gamma_concentration_wall?: number | null;
  heuristic_gamma_wall?: number | null;
  call_wall_raw_gamma?: number | null;
  put_wall_raw_gamma?: number | null;
  warning?: string;
  points?: GexPoint[];
  provenance: Provenance;
}

// Python: class YieldCurvePoint(BaseModel)
export interface YieldCurvePoint {
  tenor: string;
  yield_pct: number;
}

// Python: class MacroSnapshot(BaseModel)
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
  yield_curve?: YieldCurvePoint[];
  provenance: Provenance;
}

// Python: class MMQuote(BaseModel)
export interface MMQuote {
  contract_key: string;
  bid: number;
  ask: number;
  spread: number;
  spread_bps: number;
  mm_inventory?: number;
  inventory_risk_status?: string;
  adverse_selection_warning?: boolean;
}

// Python: class MarketMicrostructureState(BaseModel)
export interface MarketMicrostructureState {
  underlying: string;
  date: string;
  mm_sentiment?: string;
  mm_net_delta_shares?: number;
  volatility_regime?: string;
  spread_multiplier?: number;
  commentary?: string;
}

// Python: class ScannerRow(BaseModel)
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
  analyst_conviction?: string;
  macro_sensitivity?: string;
  price_source_type?: SourceType;
  price_source_name?: string;
  price_data_status?: ScannerDataStatus;
}

export type ScannerDataStatus = 'ADMITTED_REAL_DAILY' | 'PARTIAL_REAL_PRICE' | 'DERIVED_FALLBACK';

// Python: class ScannerResult(BaseModel)
export interface ScannerResult {
  date: string;
  rows: ScannerRow[];
  highlighted_tickers?: string[];
}

// Python: class TradeThesis(BaseModel)
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
  volatility_view?: string;
}

// Python: class ThesisRequest(BaseModel)
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

// Python: class ThesisDriftLevel(str, Enum)
export type ThesisDriftLevel = 'NONE' | 'MINOR' | 'MATERIAL' | 'SEVERE';

// Python: class ThesisRevision(BaseModel)
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
  revision_reason?: string;
  underlying_at_revision?: number;
  is_entry?: boolean;
}

// Python: class ThesisDriftFinding(BaseModel)
export interface ThesisDriftFinding {
  rule_id: string;
  level: ThesisDriftLevel;
  summary: string;
  evidence: string;
}

// Python: class ThesisDriftAssessment(BaseModel)
export interface ThesisDriftAssessment {
  level?: ThesisDriftLevel;
  findings?: ThesisDriftFinding[];
  revision_count?: number;
  adaptive_notes?: string[];
  note?: string;
}

// Python: class ThesisRevisionRequest(BaseModel)
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

// Python: class TimelineActor(str, Enum)
export type TimelineActor = 'PLAYER' | 'MARKET' | 'CHARACTER' | 'INSTITUTION' | 'POLITICAL' | 'SYSTEM';

// Python: class TimelineEvent(BaseModel)
export interface TimelineEvent {
  event_id: string;
  game_date: string;
  node_index: number;
  actor: TimelineActor;
  category: string;
  headline: string;
  detail?: string;
  position_id?: string;
  source_type?: SourceType;
}

// Python: class PlayerDecisionRequest(BaseModel)
export interface PlayerDecisionRequest {
  category: string;
  headline: string;
  detail?: string;
  position_id?: string;
}

// Python: class HireEmployeeRequest(BaseModel)
export interface HireEmployeeRequest {
  role: EmployeeRole;
  name?: string;
}

// Python: class FireEmployeeRequest(BaseModel)
export interface FireEmployeeRequest {
  employee_id: string;
}

// Python: class AdjustBonusRequest(BaseModel)
export interface AdjustBonusRequest {
  employee_id: string;
  bonus_pct: number;
}

// Python: class DataSubscriptionRequest(BaseModel)
export interface DataSubscriptionRequest {
  subscription_key: string;
}

// Python: class CancelDataSubscriptionRequest(BaseModel)
export interface CancelDataSubscriptionRequest {
  subscription_id: string;
}

// Python: class UpgradeAIStackRequest(BaseModel)
export interface UpgradeAIStackRequest {
  target_level: AIStackLevel;
}

// Python: class GPCapitalMoveRequest(BaseModel)
export interface GPCapitalMoveRequest {
  amount_usd: number;
}

// Python: class WhatIfScenario(BaseModel)
export interface WhatIfScenario {
  scenario_name: string;
  alternative_pnl: number;
  difference_vs_actual: number;
  takeaway: string;
}

// Python: class PnLAttribution(BaseModel)
export interface PnLAttribution {
  delta: number;
  gamma?: number;
  theta: number;
  vega: number;
  residual: number;
  net: number;
  note?: string;
}

// Python: class ProcessScore(BaseModel)
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

// Python: class VerdictFindingKind(str, Enum)
export type VerdictFindingKind = 'GOOD' | 'WARNING';

// Python: class VerdictFinding(BaseModel)
export interface VerdictFinding {
  kind: VerdictFindingKind;
  text: string;
}

// Python: class FundManagerVerdict(BaseModel)
export interface FundManagerVerdict {
  headline: string;
  narrative: string;
  findings?: VerdictFinding[];
  ignored_event_count?: number;
}

// Python: class EventImpact(BaseModel)
export interface EventImpact {
  event_name: string;
  window: string;
  underlying_move: number;
  transmission_summary: string;
  attribution_confidence?: string;
}

// Python: class WhoWasRightVerdict(BaseModel)
export interface WhoWasRightVerdict {
  participant_id: string;
  participant_name: string;
  role_or_type: string;
  predicted_stance: string;
  predicted_thesis: string;
  outcome_verdict: string;
  explanation: string;
}

// Python: class DriverRankingItem(BaseModel)
export interface DriverRankingItem {
  rank: number;
  factor_name: string;
  factor_category: string;
  pnl_impact_pct: number;
  explanation: string;
}

// Python: class MarketTransmissionStep(BaseModel)
export interface MarketTransmissionStep {
  step_index: number;
  trigger: string;
  intermediary: string;
  market_reaction: string;
  portfolio_impact: string;
}

// Python: class EntryContextSnapshot(BaseModel)
export interface EntryContextSnapshot {
  snapshot_schema_version?: number;
  snapshot_id: string;
  timestamp: string;
  game_date: string;
  ticker: string;
  contract_key?: string;
  fundamental_context?: Record<string, unknown>;
  macro_context?: MacroSnapshot | null;
  political_policy_context?: Record<string, unknown>;
  geopolitics_context?: Record<string, unknown>;
  street_consensus_context?: Record<string, unknown>;
  institutional_relationship_context?: Record<string, unknown>;
  counterparty_context?: Record<string, unknown>;
  flow_context?: Record<string, unknown>;
  positioning_context?: Record<string, unknown>;
  market_maker_context?: Record<string, unknown>;
  gex_context?: GexSummary | null;
  retail_sentiment_context?: Record<string, unknown>;
  social_narrative_context?: Record<string, unknown>[];
  human_actions_context?: Record<string, unknown>[];
  character_advice_context?: Record<string, string>;
  news_context?: string[];
  player_thesis?: TradeThesis | null;
  execution_context?: Record<string, unknown>;
  lp_fund_context?: Record<string, unknown>;
  edge_provenance?: Record<string, unknown>[];
}

// Python: class ExitContextSnapshot(BaseModel)
export interface ExitContextSnapshot {
  snapshot_schema_version?: number;
  snapshot_id: string;
  timestamp: string;
  game_date: string;
  ticker: string;
  exit_price: number;
  pnl_realized: number;
  macro_context?: MacroSnapshot | null;
  political_policy_context?: Record<string, unknown>;
  geopolitics_context?: Record<string, unknown>;
  street_consensus_context?: Record<string, unknown>;
  institutional_relationship_context?: Record<string, unknown>;
  counterparty_context?: Record<string, unknown>;
  flow_context?: Record<string, unknown>;
  positioning_context?: Record<string, unknown>;
  retail_sentiment_context?: Record<string, unknown>;
  social_narrative_context?: Record<string, unknown>[];
  human_actions_context?: Record<string, unknown>[];
  lp_fund_context?: Record<string, unknown>;
  reason_for_exit?: string;
}

// Python: class TradeReview(BaseModel)
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
  macro_context?: MacroSnapshot | null;
  event_impact?: EventImpact | null;
  what_if?: WhatIfScenario[];
  process_score: ProcessScore;
  who_was_right?: WhoWasRightVerdict[];
  driver_rankings?: DriverRankingItem[];
  transmission_graph?: MarketTransmissionStep[];
  player_profile_tag?: string;
  /** 交易质量评级（P&L 权重=0，dante Q1 规格）。 */
  trade_grade?: import("./engines/trade_grade").TradeGradeResult;
  review_sections?: Record<string, unknown>;
  decision_context_matrix?: Record<string, unknown>[];
  thesis_evolution?: ThesisRevision[];
  thesis_drift?: ThesisDriftAssessment | null;
  decision_timeline?: TimelineEvent[];
  edge_review?: Record<string, unknown>[];
  profit_associated_with_illegal_edge?: boolean;
  lesson?: string;
  fund_manager_verdict?: FundManagerVerdict | null;
}

// Python: class FinancialTerm(BaseModel)
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
  analyst_tip?: string;
}

// Python: class HumanActionKind(str, Enum)
export type HumanActionKind = 'RIVAL_POACHING' | 'RIVAL_SHORT_ATTACK' | 'RIVAL_COMPETING_BID' | 'RIVAL_MEDIA_ATTACK' | 'EMPLOYEE_DISPUTE' | 'EMPLOYEE_BURNOUT' | 'EMPLOYEE_RESIGNATION_THREAT' | 'LP_REDEMPTION_WARNING' | 'LP_ALLOCATION_PROPOSAL' | 'PB_HAIRCUT_INCREASE' | 'PB_BORROW_RATE_HIKE' | 'JOURNALIST_INQUIRY' | 'REGULATORY_SUBPOENA' | 'FAVOR_REQUEST' | 'LEGAL_EDGE_OFFER' | 'CORPORATE_INSIDER_OFFER' | 'COMMERCIAL_SECRET_OFFER' | 'CORRUPT_PROFESSIONAL_OFFER' | 'POLITICAL_CORRUPTION_OFFER' | 'MARKET_MANIPULATION_OFFER' | 'MNPI_DECISION' | 'QUANT_INCIDENT' | 'INVESTIGATION_ESCALATION' | 'WHISTLEBLOWER_EVENT' | 'TALENT_RETENTION_EVENT' | 'TALENT_TEAM_EVENT' | 'CRISIS_PUBLIC_BACKLASH';

// Python: class LegalityClass(str, Enum)
export type LegalityClass = 'LEGAL' | 'AGGRESSIVE_LAWFUL' | 'MNPI_RISK' | 'ILLEGAL';

// Python: class InformationReliability(str, Enum)
export type InformationReliability = 'TRUE' | 'PARTIAL' | 'MISLEADING' | 'FABRICATED';

// Python: class ExposureRisk(str, Enum)
export type ExposureRisk = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';

// Python: class HumanActionChoice(BaseModel)
export type WalletId = 'FUND_CASH' | 'MANAGEMENT_COMPANY' | 'GP_WEALTH';

export interface HumanActionChoice {
  id: string;
  label: string;
  cost_usd?: number;
  favor_delta?: number;
  morale_delta?: number;
  reputation_delta?: number;
  result_narrative?: string;
  target_lp_id?: string | null;
  lp_capital_delta?: number;
  wallet?: WalletId;
  legality_class?: LegalityClass;
  evidence_points_delta?: number;
  witness_delta?: number;
  internal_awareness_delta?: number;
  external_awareness_delta?: number;
  compliance_risk_delta?: number;
  information_ethics_delta?: number;
  unlocks_intel?: Record<string, unknown> | null;
  immutable_evidence_category?: ImmutableEvidenceEntry['category'];
  immutable_flag?: string;
  intel_truth_state?: 'UNVERIFIED' | 'CROSS_VALIDATED';
}

// Python: class HumanActionEvent(BaseModel)
export interface HumanActionEvent {
  id: string;
  date: string;
  action_kind: HumanActionKind;
  character_id?: string | null;
  headline: string;
  body: string;
  choices?: HumanActionChoice[];
  resolved?: boolean;
  chosen_choice_id?: string | null;
  resolved_on_date?: string;
  impact_summary?: string;
  source_type?: SourceType;
  /** Optional link used by the quant-infrastructure incident resolver. */
  quant_incident_id?: string;
  talent_event_id?: string;
  talent_role_id?: TalentRoleId;
}

// Python: class PolicyBranch(str, Enum)
export type PolicyBranch = 'WHITE_HOUSE' | 'CONGRESS' | 'REGULATORS' | 'ELECTIONS' | 'GEOPOLITICS';

// Python: class PolicyEvent(BaseModel)
export interface PolicyEvent {
  id: string;
  date: string;
  branch: PolicyBranch;
  headline: string;
  body: string;
  sector_impact: string;
  potential_transmission: string;
  probability_pct?: number;
  source_type?: SourceType;
}

// Python: class PoliticalContact(BaseModel)
export interface PoliticalContact {
  id: string;
  name: string;
  role: string;
  organization: string;
  avatar?: string;
  access_cost_capital?: number;
  briefing_summary?: string;
  favor_balance?: number;
}

// Python: class PoliticalState(BaseModel)
export interface PoliticalState {
  political_capital?: number;
  active_policies?: PolicyEvent[];
  contacts?: PoliticalContact[];
  washington_sentiment?: string;
  regulatory_heat?: number;
}

// Python: class ParticipantType(str, Enum)
export type ParticipantType = 'MARKET_MAKER' | 'LONG_ONLY' | 'HEDGE_FUND' | 'MACRO_FUND' | 'VOLATILITY_FUND' | 'CTA_MOMENTUM' | 'RISK_PARITY' | 'VOL_CONTROL' | 'INDEX_ETF' | 'SHORT_SELLER' | 'RETAIL_0DTE';

// Python: class CounterpartyProfile(BaseModel)
export interface CounterpartyProfile {
  ticker: string;
  dominant_participant: ParticipantType;
  potential_participants?: ParticipantType[];
  dealer_inventory_bias?: string;
  estimated_retail_share_pct?: number;
  estimated_institutional_share_pct?: number;
  flow_predominance?: string;
  dealer_inventory_bias_source_type?: SourceType;
  dealer_inventory_signed_source_type?: SourceType;
  dealer_inventory_note?: string;
  participant_share_source_type?: SourceType;
  source_type?: SourceType;
}

// Python: class FlowSummary(BaseModel)
export interface FlowSummary {
  ticker: string;
  date: string;
  call_volume: number;
  put_volume: number;
  put_call_ratio: number;
  open_interest_change: number;
  large_sweep_count: number;
  relative_options_vol: number;
  volume_shock_detected?: boolean;
  block_trade_activity?: string;
  etf_flow_estimate_usd?: number;
  etf_flow_source_type?: SourceType;
  put_call_ratio_source_type?: SourceType;
  relative_options_vol_source_type?: SourceType;
  large_sweep_count_source_type?: SourceType;
  volume_shock_source_type?: SourceType;
  open_interest_change_source_type?: SourceType;
  source_type?: SourceType;
}

// Python: class PositioningSummary(BaseModel)
export interface PositioningSummary {
  ticker: string;
  crowdedness_score: number;
  trapped_long_risk?: string;
  trapped_short_risk?: string;
  short_interest_pct?: number;
  cta_exposure_regime?: string;
  pain_trade_direction?: string;
  regime_label?: string;
  crowdedness_source_type?: SourceType;
  trapped_risk_source_type?: SourceType;
  source_type?: SourceType;
}

// Python: class RetailSentimentSnapshot(BaseModel)
export interface RetailSentimentSnapshot {
  ticker: string;
  date: string;
  bullish_pct?: number;
  bearish_pct?: number;
  fear_greed_index?: number;
  euphoria_score?: number;
  capitulation_flag?: boolean;
  attention_heat?: number;
  fomo_velocity?: number;
  meme_intensity?: number;
  sentiment_regime?: string;
  source_type?: SourceType;
}

// Python: class SocialPost(BaseModel)
export interface SocialPost {
  id: string;
  timestamp: string;
  author_handle: string;
  author_type: string;
  avatar?: string;
  content: string;
  engagement_likes?: number;
  engagement_reposts?: number;
  bias?: string;
  credibility?: number;
  bot_probability?: number;
  is_pump?: boolean;
  source_type?: SourceType;
}

// Python: class MarketPulseFeed(BaseModel)
export interface MarketPulseFeed {
  date: string;
  sentiment_regime: string;
  posts?: SocialPost[];
}

// Python: class SellSideAnalystReport(BaseModel)
export interface SellSideAnalystReport {
  bank_id: string;
  bank_name: string;
  analyst_name: string;
  ticker: string;
  rating: string;
  target_price: number;
  prev_target: number;
  thesis_summary: string;
  published_date: string;
  source_url_or_identifier?: string | null;
  source_type?: SourceType;
}

// Python: class StreetConsensus(BaseModel)
export interface StreetConsensus {
  ticker: string;
  buy_count?: number;
  hold_count?: number;
  sell_count?: number;
  consensus_rating?: string;
  mean_target_price: number;
  high_target_price: number;
  low_target_price: number;
  rating_dispersion?: string;
  reports?: SellSideAnalystReport[];
  source_type?: SourceType;
}

// Python: class PlayerStreetScore(BaseModel)
export interface PlayerStreetScore {
  total_score?: number;
  alpha_reputation?: number;
  risk_discipline?: number;
  execution_quality?: number;
  research_credibility?: number;
  institutional_trust?: number;
  lp_reputation?: number;
  counterparty_standing?: number;
  media_profile?: number;
  compliance_standing?: number;
  talent_magnet?: number;
  standing_tier?: string;
  human_action_reputation_bonus?: number;
}

// Python: class IPODealOffering(BaseModel)
export interface IPODealOffering {
  deal_id: string;
  company_name: string;
  ticker: string;
  lead_underwriter: string;
  price_range_low: number;
  price_range_high: number;
  final_pricing?: number | null;
  expected_date: string;
  allocation_requested_usd?: number;
  allocation_received_usd?: number;
  status?: string;
}

// Python: class WallStreetBankDesk(BaseModel)
export interface WallStreetBankDesk {
  bank_id: string;
  bank_name: string;
  logo?: string;
  relationship_tier?: string;
  trust_score?: number;
  favor_points?: number;
  prime_brokerage_available?: boolean;
  financing_spread_bps?: number;
  stock_borrow_fee_pct?: number;
  corporate_access_available?: boolean;
  available_ipo_deals?: IPODealOffering[];
  recent_research?: SellSideAnalystReport[];
  rep_contact_name?: string;
  rep_contact_title?: string;
  simulated_notice?: string;
}

// Python: class LPProfile(BaseModel)
export interface LPProfile {
  id: string;
  name: string;
  lp_type: string;
  allocated_capital: number;
  target_return_pct?: number;
  max_tolerated_drawdown_pct?: number;
  liquidity_terms?: string;
  confidence_score?: number;
  redemption_risk?: string;
  key_contact: string;
  relationship_notes?: string;
  risk_appetite?: string;
  ethical_sensitivity?: string;
  compliance_sensitivity?: string;
  strategy_preference?: string;
  redemption_threshold_pct?: number;
  capital_current?: number;
  next_review_date?: string;
  simulated_notice?: string;
}

// Python: class GameMode(str, Enum)
export type GameMode = 'STORY_CAMPAIGN' | 'WALL_STREET_REPLAY' | 'EMPIRE_MODE' | 'SANDBOX' | 'HISTORICAL_REPLAY';

// Python: class EpisodePhase(str, Enum)
export type EpisodePhase = 'OPENING' | 'WAR_ROOM' | 'SCANNER' | 'DECISION_1' | 'TRADING' | 'MID_EVENT' | 'DECISION_2' | 'MARKET_RESULT' | 'TRADE_REVIEW' | 'CONSEQUENCE' | 'EPISODE_END';

// Python: class CharacterMemoryItem(BaseModel)
export interface CharacterMemoryItem {
  timestamp: string;
  episode_id: string;
  summary: string;
  sentiment?: string;
  key_fact?: string;
}

// Python: class HiddenState(BaseModel)
export interface HiddenState {
  ego?: number;
  discipline?: number;
  dependency_maya?: number;
  team_building?: number;
  information_ethics?: number;
  loyalty?: number;
  risk_identity?: string;
}

// Python: class DelayedConsequence(BaseModel)
export interface DelayedConsequence {
  id: string;
  source_choice_id: string;
  source_episode: number;
  trigger_episode_delay: number;
  trigger_condition?: string;
  /** Batch4 trading-day timer. Optional so all legacy episode timers remain valid. */
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
}

// Python: class ChoiceLogEntry(BaseModel)
export interface ChoiceLogEntry {
  timestamp: string;
  episode_id: string;
  phase: EpisodePhase;
  choice_id: string;
  player_choice_label: string;
  visible_context: string;
  immediate_effect_summary: string;
  delayed_consequence_id?: string | null;
}

// Python: class EpisodeMeta(BaseModel)
export interface EpisodeMeta {
  episode_id: string;
  season_id?: string;
  number: number;
  title: string;
  subtitle: string;
  date_start: string;
  date_end: string;
  main_underlying: string;
  historical_context: string;
  opening_narrative: string;
  focus_characters?: string[];
}

// Python: class EpisodeOutcome(BaseModel)
export interface EpisodeOutcome {
  episode_id: string;
  season_id: string;
  number: number;
  title: string;
  portfolio_return_pct: number;
  realized_pnl: number;
  process_score: number;
  lp_confidence_delta: number;
  reputation_delta: number;
  compliance_risk_delta: number;
  key_relationship_deltas?: Record<string, number>;
  summary_narrative: string;
  unlocked_clues?: string[];
}

// Python: class EndingType(str, Enum)
export type EndingType = 'THE_NEXT_KING' | 'LUCKY_BASTARD' | 'THE_SURVIVOR' | 'EMPTY_OFFICE' | 'UNDER_INVESTIGATION' | 'REDEMPTION_SPIRAL' | 'CROSSED_THE_LINE' | 'YOU_BUILT_A_STAR' | 'THE_MACHINE' | 'THE_GAMBLER';

// Python: class AdrianFate(str, Enum)
export type AdrianFate = 'DESTROYED' | 'DEFEATED' | 'EQUAL_RIVAL' | 'ALLY' | 'DOMINANT_RIVAL' | 'PARTNER';

// Python: class LegacyCard(BaseModel)
export interface LegacyCard {
  fund_name: string;
  era: string;
  total_return_pct: number;
  max_drawdown_pct: number;
  peak_aum: number;
  investment_style: string;
  risk_profile: string;
  reputation_title: string;
  team_loyalty_rating: string;
  compliance_grade: string;
  legacy_quote: string;
  season_summary: string;
}

// Python: class SeasonReview(BaseModel)
export interface SeasonReview {
  best_trade: string;
  worst_trade: string;
  luckiest_trade: string;
  best_process_trade: string;
  most_trusted_character: string;
  biggest_rival: string;
  compliance_incidents_count: number;
  lp_redemptions_count: number;
}

// Python: class SeasonOutcome(BaseModel)
export interface SeasonOutcome {
  ending_type: EndingType;
  ending_title: string;
  ending_subtitle: string;
  narrative_scenes?: string[];
  adrian_fate: AdrianFate;
  legacy_card: LegacyCard;
  season_review: SeasonReview;
  season_2_inherited_state?: Record<string, unknown>;
}

// Python: class WarRoomMessage(BaseModel)
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

// Python: class WarRoomMeeting(BaseModel)
export interface WarRoomMeeting {
  date: string;
  topic: string;
  agenda: string;
  messages?: WarRoomMessage[];
  player_decision_prompt?: string;
  choices?: StoryChoicePublic[];
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

// Python: class AccountType(str, Enum)
export type AccountType = 'TFSA' | 'Cash' | 'Margin';

export type ExitReason = 'MANUAL_CLOSE' | 'EXPIRED_WORTHLESS' | 'EXPIRED_ITM' | 'EXERCISED' | 'ASSIGNED';

// Python: class OrderSide(str, Enum)
export type OrderSide = 'buy_to_open' | 'sell_to_close' | 'buy_to_close' | 'sell_covered_call' | 'sell_cash_secured_put' | 'buy_shares' | 'sell_shares' | 'exercise_long_option' | 'buy_vertical_spread' | 'buy_straddle';

// Python: class OrderKind(str, Enum)
export type OrderKind = 'Market' | 'Limit';

// Python: class OrderRequest(BaseModel)
export interface OrderRequest {
  side: OrderSide;
  client_order_id?: string;
  type?: OptionType | null;
  strike?: number | null;
  expiration?: string | null;
  qty?: number;
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

// Python: class OrderResult(BaseModel)
export interface OrderResult {
  accepted: boolean;
  message: string;
  fill_price?: number | null;
  execution_label?: string;
  realized_pl?: number | null;
  trade_review_id?: string | null;
  total_cost?: number | null;
  filled_qty?: number;
}

// Python: class Position(BaseModel)
export interface Position {
  id: string;
  kind: string;
  underlying: string;
  type?: OptionType | null;
  strike?: number | null;
  expiration?: string | null;
  qty: number;
  filled_qty?: number;
  entry_price: number;
  entry_date?: string;
  short?: boolean;
  thesis?: TradeThesis | null;
  peak_unrealized_pl?: number;
  trough_unrealized_pl?: number;
  significant_profit_decision_fired?: boolean;
  profit_giveback_decision_fired?: boolean;
  invalidation_decision_fired?: boolean;
  strategy_id?: string;
  strategy_kind?: 'VERTICAL_SPREAD' | 'STRADDLE';
  collateral_locked_usd?: number;
  /** P1 provenance: which historical campaign opened this lot. */
  origin_campaign?: string;
  /** P1 provenance: the thesis that owns this lot's attribution. */
  thesis_id?: string | null;
  /** Defaults to 100 for options and 1 for shares. */
  contract_multiplier?: number;
}

/** A position lot with mandatory cross-campaign attribution. */
export interface PositionLot extends Position {
  origin_campaign: string;
  thesis_id: string | null;
  contract_multiplier: number;
}

/**
 * Canonical financial ledger.
 *
 * cash, realized_pnl, margin/borrow and position_lots are mutable ledger
 * inputs. nav, unrealized_pnl and cost_basis are valuation caches produced by
 * the one recomputeFundBalanceSheet() entry point.
 */
export interface FundBalanceSheet {
  valuation_at: string;
  cash: number;
  realized_pnl: number;
  margin_debt: number;
  borrow_liability: number;
  accrued_margin_interest: number;
  accrued_borrow_fee: number;
  collateral_reserved: number;
  position_lots: PositionLot[];
  nav: number;
  unrealized_pnl: number;
  cost_basis: number;
  valuation_cache_valid?: boolean;
}

export interface CampaignArcState {
  status: ArcStatus;
  /** Sequential campaign invariant: next_beat_index === resolved_beat_ids.length. */
  next_beat_index: number;
  resolved_beat_ids: string[];
  last_public_event_at: string | null;
  last_transition_at: string | null;
}

export interface GlobalCareerClock {
  current_at: string;
  event_cursor: string | null;
  transition_cursor: string | null;
  last_advance_at: string | null;
}

export interface PrerequisiteResolution {
  missing: string[];
  scaffolding_required: boolean;
  blocks_timeline: false;
}

// Python: class PnLAttribution(BaseModel)
export interface PnLAttribution {
  delta: number;
  theta: number;
  vega: number;
  residual: number;
  net: number;
  note?: string;
}

// Python: class FundStats(BaseModel)
export interface FundStats {
  cash: number;
  nav: number;
  aum: number;
  reputation?: number;
  lp_confidence?: number;
  information_network?: number;
  compliance_risk?: number;
  political_capital?: number;
  counterparty_trust?: number;
  staff_morale?: number;
}

// Python: class Character(BaseModel)
export interface Character {
  id: string;
  name: string;
  role: string;
  portrait: string;
  specialty?: string;
  opinion_tags?: string[];
}

// Python: class Relationship(BaseModel)
export interface Relationship {
  character_id: string;
  trust?: number;
  respect?: number;
  fear?: number;
  favor?: number;
  rivalry?: number;
}

// Python: class IntelClass(str, Enum)
export type IntelClass = 'PUBLIC_VERIFIED' | 'PUBLIC_RUMOR' | 'PRIVATE_INTEL' | 'POSSIBLE_MNPI';

// Python: class StoryChoice(BaseModel)
export interface StoryChoice {
  id: string;
  label: string;
  compliance_delta?: number;
  relationship_deltas?: Record<string, Record<string, number>>;
  fund_deltas?: Record<string, number>;
  delayed_trigger?: string | null;
  result_text?: string | null;
}

// Python: class StoryTemplate(BaseModel)
export interface StoryTemplate {
  id: string;
  title: string;
  category: string;
  intel_class: IntelClass;
  character_id?: string | null;
  headline_template: string;
  body_template: string;
  regime_bias?: string[];
  requires?: string[];
  forbids?: string[];
  cooldown?: number;
  hidden?: Record<string, number>;
  choices: StoryChoice[];
}

// Python: class StoryEventInstance(BaseModel)
export interface StoryEventInstance {
  id: string;
  template_id: string;
  game_date: string;
  character_id?: string | null;
  intel_class: IntelClass;
  headline: string;
  body: string;
  resolved?: boolean;
  deferred?: boolean;
  mandatory_before_trade?: boolean;
  chosen_choice_id?: string | null;
  resolved_on_date?: string;
  sfx?: string;
}

// Python: class StoryChoicePublic(BaseModel)
export interface StoryChoicePublic {
  id: string;
  label: string;
  outcome?: WarRoomChoiceConsequence;
  selected?: boolean;
  disabled?: boolean;
}

// Python: class StoryEventPublic(BaseModel)
export interface StoryEventPublic {
  id: string;
  template_id: string;
  game_date: string;
  character_id?: string | null;
  intel_class: IntelClass;
  headline: string;
  body: string;
  resolved?: boolean;
  deferred?: boolean;
  mandatory_before_trade?: boolean;
  chosen_choice_id?: string | null;
  sfx?: string;
  choices?: StoryChoicePublic[];
}

// Python: class OrderLogEntry(BaseModel)
export interface OrderLogEntry {
  date: string;
  message: string;
  kind?: string;
}

// Python: class AIFund(BaseModel)
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
  pnl?: number;
  max_drawdown?: number;
  return_pct?: number;
}

// Python: class AdvanceMode(str, Enum)
export type AdvanceMode = 'NEXT_NODE' | 'NEXT_MAJOR_EVENT';

// Python: class PauseSeverity(str, Enum)
export type PauseSeverity = 'MANDATORY' | 'NOTABLE' | 'ROUTINE';

// Python: class PauseReason(BaseModel)
export interface PauseReason {
  trigger_id: string;
  severity?: PauseSeverity;
  headline: string;
  detail?: string;
  source_panel?: string;
  source_type?: SourceType;
  position_id?: string;
}

// Python: class MarketClockState(BaseModel)
export interface MarketClockState {
  paused?: boolean;
  node_granularity?: string;
  current_node_index?: number;
  current_node_date?: string;
  total_nodes?: number;
  is_final_node?: boolean;
  last_advance_mode?: AdvanceMode | null;
  nodes_advanced_last_call?: number;
  pause_reasons?: PauseReason[];
  advance_label?: string;
  next_node_label?: string;
}

// Python: class AdvanceMarketRequest(BaseModel)
export interface AdvanceMarketRequest {
  mode?: AdvanceMode;
  max_nodes?: number;
}

// Python: class TutorialProgress(BaseModel)
export interface TutorialProgress {
  tutorial_completed?: boolean;
  guided_mode_active?: boolean;
  current_step?: string;
  completed_steps?: string[];
  tutorial_direction?: string;
  first_trade_position_id?: string;
  first_trade_review_shown?: boolean;
  step6_advance_consumed?: boolean;
}

// Python: class ManagementCompanyState(BaseModel)
export interface ManagementCompanyState {
  cash?: number;
  monthly_burn?: number;
  annualized_burn?: number;
  runway_months?: number;
  management_fee_rate?: number;
  performance_fee_rate?: number;
  high_water_mark?: number;
  fee_income_ytd?: number;
  performance_income_ytd?: number;
  payroll_cost_annual?: number;
  data_cost_annual?: number;
  ai_compute_cost_annual?: number;
  legal_cost_annual?: number;
  compliance_cost_annual?: number;
  technology_cost_annual?: number;
  ir_cost_annual?: number;
  other_operating_cost_annual?: number;
  headcount?: number;
  last_accrual_date?: string;
}

// Python: class GPWealthState(BaseModel)
export interface GPWealthState {
  cash?: number;
  total_distributions_received?: number;
  total_injected_to_company?: number;
  legal_defense_spent?: number;
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
  /** Optional P1 additions; v4 saves and Batch A callers remain valid. */
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
  /** Canonical non-fund wallets. Legacy cash fields are runtime aliases only. */
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

// ── P1 quant desk / data infrastructure ────────────────────────────────

export type QuantTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
export type QuantModule = 'scanner' | 'gex' | 'greeks' | 'stress' | 'execution';
export type QuantInfraStatus = 'ACTIVE' | 'GRACE' | 'SUSPENDED';
export type QuantModuleHealth = 'HEALTHY' | 'READ_ONLY' | 'STALE' | 'DATA_UNAVAILABLE';

export interface QuantPreset {
  id: string;
  name: string;
  conditions: number;
  custom_score?: boolean;
  maintained_by?: string | null;
  locked?: boolean;
  locked_reason?: string | null;
  created_node?: number;
}

export interface QuantStressCase {
  id: string;
  name: string;
  factors: string[];
  maintained_by?: string | null;
  locked?: boolean;
  created_node?: number;
}

export interface QuantUsageState {
  model_id: string | null;
  consecutive_nodes: number;
  last_node_index: number | null;
  order_node_indices: number[];
}

export interface QuantIncidentRecord {
  incident_id: string;
  trigger_node: number;
  trigger_date: string;
  status: 'PENDING' | 'RESOLVED';
  choice_id?: string | null;
  resolved_date?: string | null;
}

export interface QuantInfraState {
  purchased_tier: QuantTier;
  effective_tier: QuantTier;
  staff_supported_tier: QuantTier;
  quant_staff_capacity: number;
  monthly_burn: number;
  deployment_paid: boolean;
  deployment_paid_amount: number;
  activated_node: number;
  presets: QuantPreset[];
  saved_stress_cases: QuantStressCase[];
  quant_reliability: number;
  dependency_score: number;
  key_person_id: string | null;
  /** Alias retained because the design brief names the field explicitly. */
  quant_key_person_id?: string | null;
  backup_staff_ids: string[];
  grace_nodes_left: number;
  module_health: Record<QuantModule, QuantModuleHealth>;
  incident_history: QuantIncidentRecord[];
  status: QuantInfraStatus;
  false_confidence_flags: string[];
  stale_module_flags: string[];
  custom_score_usage: QuantUsageState;
  consecutive_high_load_nodes: number;
  last_high_load_node_index?: number | null;
  suspension_nodes: number;
  model_cooling_nodes: number;
  module_degradation_nodes: number;
  external_backup_burn: number;
  pending_review_process_penalty: number;
  pending_dependency_reduction: number;
  dependency_reduction_due_node: number | null;
  last_staff_supported_tier: QuantTier;
  last_settlement_month: string | null;
}

export interface QuantCapability {
  module: QuantModule;
  unlocked: boolean;
  effective_tier: QuantTier;
  health: QuantModuleHealth;
  read_only: boolean;
  data_status: 'AVAILABLE' | 'DATA_UNAVAILABLE' | 'STALE';
  features: string[];
  max_conditions?: number | 'UNLIMITED';
  max_presets?: number | 'UNLIMITED';
  grid?: string;
  factor_count?: number | 'MULTI_POSITION';
  execution_tools?: string[];
  tooling_only: true;
  predictive_edge: false;
}

export type QuantCapabilities = Record<QuantModule, QuantCapability>;

export interface ImmutableEvidenceEntry {
  id: string;
  date: string;
  action_id: string;
  category: 'PROCEDURAL' | 'MNPI' | 'BRIBERY' | 'EXTORTION_RISK' | 'OTHER';
  evidence_points: number;
  fact: string;
  truth_state: 'UNVERIFIED' | 'VERIFIED';
}

export type CrisisActionId = 'OUTSIDE_COUNSEL' | 'LP_COMMUNICATION' | 'PUBLIC_RESPONSE' | 'POLICY_COUNSEL' | 'MEDIA_COUNTER' | 'INTERNAL_REMEDIATION';
export type CrisisBacklashChoiceId = 'A_GO_SILENT' | 'B_TRANSPARENT_BRIEFING' | 'C_DOUBLE_DOWN';

export interface CrisisActionUse {
  action_id: CrisisActionId;
  date: string;
  node_index: number;
  has_new_information?: boolean;
}

export interface CrisisActionRuntime {
  action_id: CrisisActionId;
  cooldown_nodes: number;
  last_used_node: number | null;
  diminishing_bucket: string;
  usage_30d: CrisisActionUse[];
  month_usage: Record<string, number>;
  blocked_until_node: number | null;
}

export interface CrisisActionLedgerEntry {
  id: string;
  date: string;
  node_index: number;
  action_id: CrisisActionId;
  cost: number;
  effective_multiplier: number;
  diminishing_count: number;
  reason?: string;
  management_cash_before: number;
  management_cash_after: number;
  evidence_count_before: number;
  evidence_count_after: number;
  mnpi_flags_before: string[];
  mnpi_flags_after: string[];
  bribery_flags_before: string[];
  bribery_flags_after: string[];
}

export interface CrisisEventRecord {
  id: string;
  event_id: string;
  date: string;
  node_index: number;
  headline: string;
  body: string;
  choices: Array<{ id: CrisisBacklashChoiceId; label: string; cost_usd: number; result_narrative: string }>;
  resolved: boolean;
  chosen_choice_id: CrisisBacklashChoiceId | null;
  resolved_on_date?: string;
}

// Python: class EmployeeRole(str, Enum)
export type EmployeeRole = 'RESEARCH_ASSOCIATE' | 'SENIOR_ANALYST' | 'MACRO_STRATEGIST' | 'QUANT_RESEARCHER' | 'RISK_MANAGER' | 'COMPLIANCE_OFFICER' | 'LEGAL_COUNSEL' | 'DATA_ENGINEER' | 'AI_ENGINEER' | 'INVESTOR_RELATIONS' | 'OPERATIONS';

// Python: class Employee(BaseModel)
export interface Employee {
  id: string;
  name: string;
  role: EmployeeRole;
  salary_annual: number;
  bonus_expectation_pct?: number;
  morale?: number;
  loyalty?: number;
  skill?: number;
  capacity_pct?: number;
  poaching_risk?: number;
  hired_date: string;
  fictional?: boolean;
  simulated_notice?: string;
  talent_role_id?: TalentRoleId;
  is_talent?: boolean;
}

export type TalentRoleId = 'ANALYST' | 'QUANT' | 'COUNSEL' | 'CRISIS_PR' | 'EX_REG';
export type TalentRosterStatus = 'ACTIVE' | 'GRACE' | 'DELINQUENT' | 'RESIGNED' | 'SUSPENDED';
export type TalentActionId = 'DEEP_DIVE' | 'MODEL_AUDIT' | 'PRIVILEGED_REVIEW' | 'SHAPE_NARRATIVE' | 'REGULATORY_MAP';
export type TalentRetentionChoice = 'MATCH' | 'PROMOTE' | 'LET_GO' | 'COUNTER_WITH_EQUITY';
export type TalentTeamEventId = 'STAR_JEALOUSY' | 'CONFLICT_OF_INTEREST' | 'ANALYST_VS_QUANT';
export type GPSpendItemId = 'PRIVATE_DINNER' | 'CLUB_MEMBERSHIP' | 'CHARITY_GALA' | 'LUXURY_HOME' | 'PRIVATE_JET' | 'GIFT';

export interface GPSpendInput {
  item_id: GPSpendItemId;
  amount?: number;
  date?: string;
  nodeIndex?: number;
  recipient_id?: string;
  recipient_type?: string;
  major_decision_window?: boolean;
  quid_pro_quo?: 'NONE' | 'IMPLIED' | 'EXPLICIT';
  fund_nav?: number;
  fund_drawdown_pct?: number;
  lp_confidence?: number;
}

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

// Python: class DataSubscription(BaseModel)
export interface DataSubscription {
  id: string;
  name: string;
  category: string;
  monthly_cost: number;
  active?: boolean;
  subscribed_date?: string;
  provenance_note?: string;
}

// Python: class AIStackLevel(str, Enum)
export type AIStackLevel = 'LEVEL_0_MANUAL' | 'LEVEL_1_ASSISTANT' | 'LEVEL_2_MULTI_AGENT' | 'LEVEL_3_INSTITUTIONAL';

// Python: class AIStackState(BaseModel)
export interface AIStackState {
  level?: AIStackLevel;
  monthly_compute_cost?: number;
  engineering_headcount?: number;
  hallucination_risk?: number;
  model_risk_note?: string;
}

// Python: class InvestigationStage(str, Enum)
export type InvestigationStage = 'CLEAN' | 'SUSPICIOUS' | 'INTERNAL_CONCERN' | 'REGULATORY_INQUIRY' | 'FORMAL_INVESTIGATION' | 'CIVIL_ENFORCEMENT' | 'CRIMINAL_INVESTIGATION' | 'CHARGED' | 'SETTLED' | 'TRIAL' | 'CONVICTED' | 'ACQUITTED';

// Python: class EvidenceRecord(BaseModel)
export interface EvidenceRecord {
  id: string;
  date: string;
  category: string;
  description: string;
  evidence_points: number;
  witness_ids?: string[];
  legality_class: LegalityClass;
  related_action_id?: string;
}

// Python: class EvidenceState(BaseModel)
export interface EvidenceState {
  evidence_points?: number;
  witness_count?: number;
  internal_awareness?: number;
  external_awareness?: number;
  whistleblower_risk?: number;
  enforcement_interest?: number;
  investigation_stage?: InvestigationStage;
  records?: EvidenceRecord[];
  investigator_character_id?: string;
  last_escalation_date?: string;
  simulated_notice?: string;
}

// Python: class AcquiredEdgeIntel(BaseModel)
export interface AcquiredEdgeIntel {
  thesis_linked?: boolean;
  related_tickers?: string[];
  transmission_path?: string[];

  id: string;
  headline: string;
  body: string;
  legality_class: LegalityClass;
  source_type?: SourceType;
  reliability?: InformationReliability;
  acquired_date: string;
  cost_usd?: number;
  who_else_knows?: string[];
  ticker?: string;
  traded_on?: boolean;
}

// Python: class CapitalSpendCategory(str, Enum)
export type CapitalSpendCategory = 'TEAM' | 'RESEARCH' | 'DATA' | 'AI' | 'TECHNOLOGY' | 'RISK' | 'COMPLIANCE' | 'LEGAL' | 'INSTITUTIONAL' | 'POLICY' | 'INTELLIGENCE' | 'SPECIAL_OPERATIONS' | 'OPERATIONS';

// Python: class CapitalSpendLogEntry(BaseModel)
export interface CapitalSpendLogEntry {
  id: string;
  date: string;
  category: CapitalSpendCategory;
  label: string;
  amount_usd: number;
  wallet: WalletId;
  legality_class?: LegalityClass;
}

/* ── V21 盘中揭示 (Market Reveal) ────────────────────────────────────
 *
 * 要解决的问题很具体：怎么让玩家在**不知道后面会发生什么**的前提下，
 * 逐小时经历 2025-01-27（DeepSeek 崩盘）那样的一天。
 *
 * 防前视是写进数据结构的，不靠调用方自觉：
 *   - `windows` 只装**已经揭晓**的窗口。后面的窗口不是被标记为隐藏，而是根本
 *     不在数组里——玩家状态里读不出还没发生的事。
 *   - `visible_price_bars` 同理逐窗增长（1 → 2 → 5 → 6）。
 *   - 收盘前最后半小时永不揭晓（`future_lock_note`）：看到它就等于提前知道
 *     当日结算。
 *   - 盘前只有事件、没有价格时 `price_reveal_available=false`，此时下单必须被拒，
 *     而不是拿一个编出来的价格成交。
 */
/**
 * 节拍是**按日编排**的，不是全局固定顺序。
 * 1/27 是隔夜利空砸下来的一天（观点被撞 → 价格发现 → 自我合理化 → 仓位 vs 观点 → 过夜）；
 * 1/31 是反弹日，玩家的心理陷阱完全不同（松口气 → 能不能跟进 → 反转信号 → 过周末），
 * 而且没有盘前窗口——那天没有隔夜事件。
 */
export type MarketDecisionBeatKind =
  // 2025-01-27 崩盘日
  | 'THESIS_HIT'            // 盘前：你的观点被一条新信息正面撞上
  | 'PRICE_DISCOVERY'       // 第一小时：这是价格发现，还是趋势确认？
  | 'RATIONALIZATION_TEST'  // 第二波：你在分析，还是在给"不动"找理由？
  | 'POSITION_VS_THESIS'    // 午后：观点和仓位表达是两件事
  | 'OVERNIGHT_GATE'        // 尾盘：最后半小时不揭晓，带着不确定性过夜
  // 2025-01-31 反弹日
  | 'RELIEF_RALLY'          // 第一小时：反弹很舒服，但舒服不是证据
  | 'FOLLOW_THROUGH_TEST'   // 第二小时：反弹有没有跟进量能
  | 'REVERSAL_SIGNAL'       // 午后：反弹熄火，你认不认
  | 'WEEKEND_GATE'          // 尾盘：周末风险敞口
  | 'GENERIC';

export type MarketWindowAction = 'DO_NOTHING' | 'HOLD' | 'MANAGE_RISK' | 'STOP' | 'REVISE';
export type MarketWindowTruthMode = 'EVENT_ONLY' | 'REAL_INTRADAY';
export type DeskPressureLevel = 'LOW' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export interface RevealedPriceBar {
  ts: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

/** 谁在这个时点开口，由**当下的基金压力**决定，不是固定剧本 */
export interface MarketRevealCharacterBeat {
  character_id: string;
  character_name: string;
  pressure_level: DeskPressureLevel;
  line: string;
}

/**
 * 跨日回响：把玩家在**更早某一天**写下的承诺，在后来的时点端回他面前。
 *
 * 这是整套设计里最狠的一件事。1/27 崩盘时你写下"证伪标准与风险预算只根据已揭晓
 * 事实更新"，1/31 反弹到一半，这句话原样出现在屏幕上。没有人评判你，
 * 只是把你自己说过的话摆出来——你自己会知道有没有做到。
 *
 * 刻意的节制：一天最多回响两次，且必须引用**不同**的那笔承诺。
 * 每个时点都翻旧账，玩家很快就会学会不看它。
 */
export interface MarketSeasonContinuityBeat {
  source_date: string;
  source_window_id: string;
  source_reason: string;
  line: string;
}

export interface MarketRevealWindow {
  window_id: string;
  date: string;
  /** 与 date 同值；调用方按"这是哪一场盘中会话"读它时语义更清楚 */
  session_date: string;
  season_continuity_beat?: MarketSeasonContinuityBeat | null;
  reveal_ts: string;
  reveal_time_label: string;
  truth_mode: MarketWindowTruthMode;
  /** false 时下单必须被拒（PRICE UNAVAILABLE），不允许用任何模型价成交 */
  price_reveal_available: boolean;
  headline: string;
  detail: string;
  dramatic_beat: MarketDecisionBeatKind;
  dramatic_question: string;
  character_beat: MarketRevealCharacterBeat | null;
  /** 上一窗口玩家自己写下的理由，原样回放——让他直面自己说过的话 */
  previous_decision_quote: string | null;
  visible_price_bars: RevealedPriceBar[] | null;
  price_snapshot: {
    latest_price: number;
    latest_bar_label: string;
    session_high_so_far: number;
    session_low_so_far: number;
  } | null;
  future_lock_note: string | null;
  resolved: boolean;
  chosen_action: MarketWindowAction | null;
  chosen_reason: string | null;
}

export interface MarketRevealState {
  campaign_id: string;
  session_date: string;
  ticker: string;
  awaiting_decision: boolean;
  /** 当前窗口下标；-1 表示当日窗口已走完，可进入日线结算 */
  current_window_index: number;
  windows: MarketRevealWindow[];
}

/** 决策后果：只描述**过程**，不给对错判决，也不引用当日收盘（那是未来信息） */
export interface MarketDecisionConsequence {
  kind: 'REASONING_INTEGRITY' | 'RISK_DISCIPLINE' | 'PROCESS_RECORD';
  headline: string;
  detail: string;
  source_action: MarketWindowAction;
  source_reason: string;
  truth_label: 'SIMULATED';
}

export interface MarketWindowHistoryEntry {

    resolved?: boolean;
    player_reason?: string;
    sequence?: number;
    player_action?: string;

  window_id: string;
  date: string;
  session_date: string;
  season_continuity_beat?: MarketSeasonContinuityBeat | null;
  reveal_time_label: string;
  dramatic_beat: MarketDecisionBeatKind;
  action: MarketWindowAction;
  reason: string;
  visible_bar_count: number;
  decision_consequences?: MarketDecisionConsequence[];
}

export interface ExecutionControlState {
  mode: 'NORMAL' | 'RISK_REDUCTION_ONLY';
  stopped_date?: string | null;
  note?: string;
  collision_id?: string | null;
}

/** 推理画像：记录"反复推迟"这类过程特征，不记录盈亏对错 */
/** Market Reveal's process-only profile. It must not be shared with Thesis Collision. */
export interface MarketRevealReasoningProfile {
  ego_risk: number;
  deferrals_under_adverse_price: number;
}

/** Thesis Collision's short-lived session profile. Long-term traits belong elsewhere. */
export interface ThesisSessionReasoningProfile {
  conviction: number;
  adaptability: number;
  curiosity: number;
  second_order_thinking: number;
  noise_filter: number;
  ego_risk: number;
}

// Python: class GameState(BaseModel)
export interface GameState {

  character_emotions?: Record<string, any>;
  thesis_collisions?: Record<string, any>;
  relationship_stages?: Record<string, any>;
  active_ticker?: string;
  noise_stream?: any;

  session_id: string;
  /** P1 canonical ledger; legacy cash/positions fields remain for migration compatibility. */
  fund_balance_sheet?: FundBalanceSheet;
  /** P1 global historical clock; it never rewinds. */
  career_clock?: GlobalCareerClock;
  active_campaign_ids?: string[];
  spotlight_campaign_id?: string | null;
  campaign_progress?: Record<string, CampaignArcState>;
  applied_transition_ids?: string[];
  /** V21 盘中揭示：当日逐窗状态；null 表示该日无盘中会话 */
  market_reveal?: MarketRevealState | null;
  market_window_history?: MarketWindowHistoryEntry[];
  execution_control?: ExecutionControlState | null;
  market_reveal_profile?: MarketRevealReasoningProfile | null;
  thesis_session_profile?: ThesisSessionReasoningProfile | null;
  /** Deprecated save compatibility; no active engine writes this field. */
  reasoning_profile?: Record<string, unknown> | null;
  mode?: GameMode;
  player_persona?: { command?: number };
  campaign_id?: string;
  account_type?: AccountType;
  game_day_index?: number;
  cash: number;
  start_cash: number;
  realized_pl?: number;
  shares?: number;
  share_cost_basis?: number;
  margin_debt?: number;
  cumulative_margin_interest_paid?: number;
  /**
   * 净值历史：`{ d: 游戏日下标, v: 当日净资产 }`，按日去重。
   *
   * 为什么必须**持久化**（而席位轨迹不用）：净值取决于那一天的持仓与现金，
   * 推进过去之后就再也倒推不出来了。恩怨账本的每条记录自带日期，
   * 所以席位轨迹能从账本重算；净值不能，只能记。
   */
  nav_history?: Array<{ d: number; v: number }>;
  /** V30: 恩怨账本 —— 玩家选择的持久后果 */
  grudge_ledger?: GrudgeLedgerEntry[];
  /** V30: 资金链级联的落地日志 */
  cascade_log?: string[];
  positions?: Position[];
  real_quotes?: Record<string, OptionQuote>;
  real_options_loaded?: boolean;
  story_seed: number;
  story_rng_cursor?: number;
  ai_funds_rng_cursor?: number;
  story_history?: StoryEventInstance[];
  pending_story_events?: StoryEventInstance[];
  relationships?: Record<string, Relationship>;
  fund_stats: FundStats;
  ai_funds?: AIFund[];
  compliance_state?: Record<string, unknown>;
  last_attribution?: PnLAttribution | null;
  order_log?: OrderLogEntry[];
  processed_order_ids?: string[];
  lp_inquiry_state?: {
    answered: boolean;
    answer_id?: string;
    answered_date?: string;
    inquiry_id?: string;
  };
  trade_reviews?: TradeReview[];
  active_theses?: Record<string, TradeThesis>;
  current_season_id?: string;
  current_episode_number?: number;
  current_phase?: EpisodePhase;
  hidden_state?: HiddenState;
  player_traits?: string[];
  character_memories?: Record<string, CharacterMemoryItem[]>;
  delayed_consequences?: DelayedConsequence[];
  choice_history?: ChoiceLogEntry[];
  completed_episodes?: EpisodeOutcome[];
  season_outcome?: SeasonOutcome | null;
  peak_aum?: number;
  max_drawdown_pct?: number;
  last_significant_drawdown_node?: number;
  entry_snapshots?: Record<string, EntryContextSnapshot>;
  favor_balances?: Record<string, number>;
  human_action_events?: HumanActionEvent[];
  political_state?: PoliticalState;
  player_street_score?: PlayerStreetScore;
  lp_profiles?: LPProfile[];
  institutional_relationships?: Record<string, Record<string, unknown>>;
  market_clock?: MarketClockState;
  thesis_history?: Record<string, ThesisRevision[]>;
  player_decisions?: TimelineEvent[];
  war_room_history?: WarRoomHistoryEntry[];
  tutorial?: TutorialProgress;
  management_company?: ManagementCompanyState;
  gp_wealth?: GPWealthState;
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
  quant_infra?: QuantInfraState;
  evidence_ledger?: ImmutableEvidenceEntry[];
  mnpi_flags?: string[];
  bribery_flags?: string[];
  audit_trail?: EconomyAuditEntry[];
  crisis_actions?: CrisisActionRuntime[];
  crisis_action_ledger?: CrisisActionLedgerEntry[];
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
  employees?: Employee[];
  data_subscriptions?: DataSubscription[];
  ai_stack?: AIStackState;
  evidence_state?: EvidenceState;
  acquired_intel?: AcquiredEdgeIntel[];
  capital_spend_log?: CapitalSpendLogEntry[];
  edge_rng_cursor?: number;
  evidence_rng_cursor?: number;
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

// Python: class PositionMark(BaseModel)
export interface PositionMark {
  position_id: string;
  mark: number;
  pl: number;
}

/**
 * 组合层希腊字母合计（口径与单位见 engines/portfolio_greeks.ts）。
 * 这里只放结构；计算规矩写在引擎里，免得两处各说各话。
 */
export interface PortfolioGreeksView {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  contracts_counted: number;
  contracts_missing: number;
  shares_counted: number;
  partial: boolean;
}

// Python: class GameStateView(BaseModel)
export interface GameStateView {
  state: GameState;
  equity: number;
  unrealized_pnl: number;
  /** 组合层希腊字母合计。`partial=true` 表示有腿定价失败、没算进去 */
  portfolio_greeks?: PortfolioGreeksView | null;
  quant_infra?: QuantInfraState;
  quant_capabilities?: QuantCapabilities;
  position_marks?: PositionMark[];
  pending_story_public?: StoryEventPublic[];
  account_rule_text?: string;
  margin_requirement?: number;
  margin_buying_power?: number;
  margin_call_active?: boolean;
  macro_snapshot?: MacroSnapshot | null;
  gex_summary?: GexSummary | null;
  scanner_result?: ScannerResult | null;
  latest_war_room?: WarRoomMeeting | null;
  microstructure?: MarketMicrostructureState | null;
  current_episode?: EpisodeMeta | null;
  last_episode_outcome?: EpisodeOutcome | null;
  season_outcome?: SeasonOutcome | null;
  what_matters_today?: Record<string, unknown>[];
  current_entry_snapshot?: EntryContextSnapshot | null;
  human_action_feed?: HumanActionEvent[];
  political_state?: PoliticalState | null;
  counterparty_profile?: CounterpartyProfile | null;
  flow_summary?: FlowSummary | null;
  positioning_summary?: PositioningSummary | null;
  retail_sentiment?: RetailSentimentSnapshot | null;
  market_pulse?: MarketPulseFeed | null;
  street_consensus?: StreetConsensus | null;
  player_street_score?: PlayerStreetScore | null;
  wall_street_desk?: WallStreetBankDesk[];
  lp_profiles?: LPProfile[];
  market_clock?: MarketClockState | null;
  open_thesis_drift?: Record<string, ThesisDriftAssessment>;
  decision_timeline?: TimelineEvent[];
  crisis_actions?: CrisisActionRuntime[];
  crisis_events?: CrisisEventRecord[];
  cash_preservation?: boolean;
  runway_months?: number;
  cash_collateral_reserved?: number;
  available_cash?: number;
  stress_margin?: {
    requirement: number;
    downside_equity_loss: number;
    upside_equity_loss: number;
    model_label: 'DERIVED_STRESS_MODEL';
    disclaimer: string;
  } | null;
}

// Python: class NewGameRequest(BaseModel)
export interface NewGameRequest {
  campaign_id?: string;
  mode?: GameMode;
  account_type?: AccountType;
  start_cash?: number;
  story_seed?: number | null;
}

// Python: class SaveSlotInfo(BaseModel)
export interface SaveSlotInfo {
  slot: string;
  campaign_id: string;
  game_date: string;
  equity: number;
  updated_at: string;
  episode_info?: string;
}

// Python: class StepRequest(BaseModel)
export interface StepRequest {
  to: number;
}

// Python: class StoryChoiceRequest(BaseModel)
export interface StoryChoiceRequest {
  choice_id: string;
}

// Python: class SaveRequest(BaseModel)
export interface SaveRequest {
  slot: string;
}

// Python: class LoadRequest(BaseModel)
export interface LoadRequest {
  slot: string;
}

// Python: class MassiveOptionsRequest(BaseModel)
export interface MassiveOptionsRequest {
  expiration: string;
}

// Python: class MarketView(BaseModel)
export interface MarketView {
  nodes: MarketNode[];
  events: MacroEvent[];
}

// Python: class OrderResponse(BaseModel)
export interface OrderResponse {
  state: GameStateView;
  result: OrderResult;
}

// Python: class FundsView(BaseModel)
export interface FundsView {
  ai_funds: AIFund[];
  ranking: Record<string, unknown>[];
}

// Python: class MassiveOptionsResponse(BaseModel)
export interface MassiveOptionsResponse {
  state: GameStateView;
  loaded: number;
  message: string;
}

// Python: class AdvanceEpisodeRequest(BaseModel)
export interface AdvanceEpisodeRequest {
  target_episode_number?: number | null;
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



export interface MarketDecisionWindow extends MarketWindowHistoryEntry {
    character_beat?: any;
    truth_mode?: any;
    decision_id?: string;
    stage?: string;
    price_ticker?: string;
    price_snapshot?: any;
    dramatic_question?: string;
    decision_prompt?: string;
    previous_decision_quote?: string;
    consequence_snapshot?: any;
    future_lock_note?: string;
}

export type SeasonContinuityBeat = any;
export type ShockEventAnchor = any;
export type ShockPropagationFrame = any;
export type ThesisSignal = any;
export type ReasoningProfileState = any;
export type ThesisCollision = any;
export type ThesisCollisionDecision = any;
export type ThesisSignalClassification = any;
export type CharacterIncentiveSnapshot = any;
export type MarketWindowCharacterBeat = any;
export type MarketWindowConsequenceSnapshot = any;
export type CharacterEmotion = any;
export type ThesisDecisionReaction = any;
export type ThesisSignalStance = any;
export type NoiseArrivalContext = any;
export type NoiseStreamItem = any;
export type IncentivePressureLevel = any;
export type ReflexivityChallenge = any;
export type ReflexivityFrame = any;
export type CharacterAffect = any;
export type RelationshipStage = any;
export type RelationshipStageState = any;
