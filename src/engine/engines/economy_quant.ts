import quantCopy from '../data/economy_copy/quant_copy.json';
import { new_id } from '../ids';
import type {
  EconomySettlementRecord,
  Employee,
  GameState,
  HumanActionChoice,
  HumanActionEvent,
  QuantCapabilities,
  QuantCapability,
  QuantIncidentRecord,
  QuantInfraState,
  QuantModule,
  QuantModuleHealth,
  QuantPreset,
  QuantStressCase,
  QuantTier,
} from '../schemas';
import { ensureEconomyState, isCashPreservation, settleMonth } from './economy_core';

type QuantTierCopy = {
  tier_id: QuantTier;
  name_cn: string;
  name_en: string;
  deployment_cost: number;
  monthly_burn: number;
  summary_pitch: string;
  scanner_desc: string;
  greeks_desc: string;
  gex_desc: string;
  stress_desc: string;
  execution_desc: string;
  hard_rule_note: string;
};

type QuantChoiceCopy = {
  choice_id: string;
  label: string;
  action_cost_desc: string;
  feedback_text: string;
  risk_impact_summary: string;
};

type QuantIncidentCopy = {
  incident_id: string;
  title: string;
  description: string;
  trigger_conditions: string;
  choices: QuantChoiceCopy[];
};

export const QUANT_TIERS = quantCopy.tiers as QuantTierCopy[];
export const QUANT_INCIDENTS = quantCopy.incidents as QuantIncidentCopy[];
export const QUANT_STATUS_NOTICES = quantCopy.status_notices as Record<string, string>;

export const QUANT_TIER_ORDER: QuantTier[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
export const QUANT_MODULES: QuantModule[] = ['scanner', 'gex', 'greeks', 'stress', 'execution'];

const tierById = (tier: QuantTier): QuantTierCopy => {
  const copy = QUANT_TIERS.find((candidate) => candidate.tier_id === tier);
  if (!copy) throw new Error(`Unknown quant tier: ${tier}`);
  return copy;
};

const incidentById = (incidentId: string): QuantIncidentCopy => {
  const copy = QUANT_INCIDENTS.find((candidate) => candidate.incident_id === incidentId);
  if (!copy) throw new Error(`Unknown quant incident: ${incidentId}`);
  return copy;
};

const rank = (tier: QuantTier): number => QUANT_TIER_ORDER.indexOf(tier);
const tierAt = (value: number): QuantTier => QUANT_TIER_ORDER[Math.max(0, Math.min(4, Math.trunc(value)))];
const cents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clamp = (value: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(value * 100) / 100));
const monthOf = (date: string): string => date.slice(0, 7);

function defaultModuleHealth(): Record<QuantModule, QuantModuleHealth> {
  return { scanner: 'HEALTHY', gex: 'HEALTHY', greeks: 'HEALTHY', stress: 'HEALTHY', execution: 'HEALTHY' };
}

export function createQuantInfraState(): QuantInfraState {
  return {
    purchased_tier: 'T0',
    effective_tier: 'T0',
    staff_supported_tier: 'T1',
    quant_staff_capacity: 0,
    monthly_burn: 0,
    deployment_paid: false,
    deployment_paid_amount: 0,
    activated_node: 0,
    presets: [],
    saved_stress_cases: [],
    quant_reliability: 70,
    dependency_score: 0,
    key_person_id: null,
    quant_key_person_id: null,
    backup_staff_ids: [],
    grace_nodes_left: 0,
    module_health: defaultModuleHealth(),
    incident_history: [],
    status: 'ACTIVE',
    false_confidence_flags: [],
    stale_module_flags: [],
    custom_score_usage: {
      model_id: null,
      consecutive_nodes: 0,
      last_node_index: null,
      order_node_indices: [],
    },
    consecutive_high_load_nodes: 0,
    last_high_load_node_index: null,
    suspension_nodes: 0,
    model_cooling_nodes: 0,
    module_degradation_nodes: 0,
    external_backup_burn: 0,
    pending_review_process_penalty: 0,
    pending_dependency_reduction: 0,
    dependency_reduction_due_node: null,
    last_staff_supported_tier: 'T1',
    last_settlement_month: null,
  };
}

/**
 * Adds the P1 state without rewriting any existing save data. This is called on
 * new games, save/load, and views so old v4 saves gain only safe defaults.
 */
export function ensureQuantInfra(state: GameState): QuantInfraState {
  state.quant_infra ??= createQuantInfraState();
  const q = state.quant_infra;
  q.purchased_tier ??= 'T0';
  q.effective_tier ??= 'T0';
  q.staff_supported_tier ??= 'T1';
  q.quant_staff_capacity ??= 0;
  q.monthly_burn ??= tierById(q.purchased_tier).monthly_burn;
  q.deployment_paid ??= false;
  q.deployment_paid_amount ??= 0;
  q.activated_node ??= 0;
  q.presets ??= [];
  q.saved_stress_cases ??= [];
  q.quant_reliability ??= 70;
  q.dependency_score ??= 0;
  q.key_person_id ??= q.quant_key_person_id ?? null;
  q.quant_key_person_id = q.key_person_id;
  q.backup_staff_ids ??= [];
  q.grace_nodes_left ??= 0;
  q.module_health = { ...defaultModuleHealth(), ...(q.module_health ?? {}) };
  q.incident_history ??= [];
  q.status ??= 'ACTIVE';
  q.false_confidence_flags ??= [];
  q.stale_module_flags ??= [];
  q.custom_score_usage ??= {
    model_id: null,
    consecutive_nodes: 0,
    last_node_index: null,
    order_node_indices: [],
  };
  q.custom_score_usage.order_node_indices ??= [];
  q.consecutive_high_load_nodes ??= 0;
  q.last_high_load_node_index ??= null;
  q.suspension_nodes ??= 0;
  q.model_cooling_nodes ??= 0;
  q.module_degradation_nodes ??= 0;
  q.external_backup_burn ??= 0;
  q.pending_review_process_penalty ??= 0;
  q.pending_dependency_reduction ??= 0;
  q.dependency_reduction_due_node ??= null;
  q.last_staff_supported_tier ??= q.staff_supported_tier;
  q.last_settlement_month ??= null;
  q.monthly_burn = cents(tierById(q.purchased_tier).monthly_burn + q.external_backup_burn);
  return q;
}

function employeeIsQuant(employee: Employee): boolean {
  const candidate = employee as Employee & Record<string, unknown>;
  if (candidate.role === 'QUANT_RESEARCHER') return true;
  return candidate.is_quant === true && (candidate.role === 'SENIOR_ANALYST' || candidate.role === 'DATA_ENGINEER');
}

function employeeIsLead(employee: Employee): boolean {
  const candidate = employee as Employee & Record<string, unknown>;
  const level = String(candidate.quant_level ?? candidate.level ?? candidate.title ?? '').toUpperCase();
  return candidate.is_lead === true || level.includes('LEAD') || level.includes('SENIOR') || (employeeIsQuant(employee) && (candidate.skill ?? 0) >= 85);
}

function quantEmployees(state: GameState): Employee[] {
  return (state.employees ?? []).filter(employeeIsQuant);
}

function calculateStaffSupportedTier(state: GameState): QuantTier {
  const staff = quantEmployees(state);
  if (staff.length === 0) return 'T1';
  const leads = staff.filter(employeeIsLead);
  if (staff.length >= 2 || (leads.length > 0 && staff.some((employee) => employee.id !== leads[0].id))) return 'T4';
  if (leads.length > 0) return 'T3';
  return 'T2';
}

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function maintainedPresetShare(q: QuantInfraState): number {
  if (q.presets.length === 0) return 0;
  const key = q.key_person_id;
  if (!key) return 0;
  return q.presets.filter((preset) => preset.maintained_by === key).length / q.presets.length;
}

function lockKeyPersonPresets(q: QuantInfraState, formerKeyPersonId: string): void {
  const owned = q.presets.filter((preset) => preset.maintained_by === formerKeyPersonId && !preset.locked);
  if (owned.length === 0) return;
  const percentage = 0.30 + (stableHash(formerKeyPersonId) % 21) / 100;
  const lockCount = Math.max(1, Math.min(owned.length, Math.ceil(owned.length * percentage)));
  const ordered = [...owned].sort((a, b) => stableHash(a.id) - stableHash(b.id));
  for (const preset of ordered.slice(0, lockCount)) {
    preset.locked = true;
    preset.locked_reason = 'KEY_PERSON_DEPARTED';
  }
}

/** Recomputes the talent ceiling while retaining purchased infrastructure. */
export function refreshStaffSupport(state: GameState, _nodeIndex = state.game_day_index ?? 0): QuantInfraState {
  const q = ensureQuantInfra(state);
  const staff = quantEmployees(state);
  const activeIds = new Set(staff.map((employee) => employee.id));
  const oldKey = q.key_person_id;
  const nextStaffTier = calculateStaffSupportedTier(state);
  const previousStaffTier = q.staff_supported_tier ?? q.last_staff_supported_tier;

  if (oldKey && !activeIds.has(oldKey)) lockKeyPersonPresets(q, oldKey);
  const preferred = staff.find(employeeIsLead) ?? staff[0] ?? null;
  q.key_person_id = activeIds.has(oldKey ?? '') ? oldKey : preferred?.id ?? null;
  q.quant_key_person_id = q.key_person_id;
  q.backup_staff_ids = staff.filter((employee) => employee.id !== q.key_person_id).map((employee) => employee.id);
  q.quant_staff_capacity = staff.length;
  q.staff_supported_tier = nextStaffTier;

  if (staff.length > 0 && q.dependency_score === 0) q.dependency_score = staff.length === 1 ? 75 : 45;

  const lostSupport = rank(nextStaffTier) < rank(previousStaffTier) && rank(q.purchased_tier) > rank(nextStaffTier);
  if (lostSupport && q.grace_nodes_left === 0 && q.status !== 'SUSPENDED') {
    q.grace_nodes_left = 2;
    q.status = 'GRACE';
  }

  // Hiring back into the support band restores the already-paid desk without a
  // second deployment charge. The normal node hook makes the restoration visible.
  if (q.grace_nodes_left > 0 && rank(nextStaffTier) >= rank(q.purchased_tier) && q.status !== 'SUSPENDED') {
    q.grace_nodes_left = 0;
    q.effective_tier = q.purchased_tier;
    q.status = 'ACTIVE';
  }

  if (q.status !== 'SUSPENDED' && q.grace_nodes_left === 0) {
    q.effective_tier = tierAt(Math.min(rank(q.purchased_tier), rank(nextStaffTier)));
    q.status = 'ACTIVE';
  }
  q.last_staff_supported_tier = nextStaffTier;
  q.monthly_burn = cents(tierById(q.purchased_tier).monthly_burn + q.external_backup_burn);
  refreshModuleHealth(q);
  return q;
}

function refreshModuleHealth(q: QuantInfraState): void {
  const readonly = q.status !== 'ACTIVE' || q.grace_nodes_left > 0 || q.suspension_nodes > 0;
  for (const module of QUANT_MODULES) {
    if (q.stale_module_flags.includes(module)) q.module_health[module] = 'STALE';
    else if (readonly && rank(q.purchased_tier) > 0) q.module_health[module] = 'READ_ONLY';
    else q.module_health[module] = 'HEALTHY';
  }
  if (q.model_cooling_nodes > 0) q.module_health.scanner = 'READ_ONLY';
  if (q.module_degradation_nodes > 0) q.module_health.execution = 'READ_ONLY';
}

export function monthlyBurnDue(state: GameState): number {
  return ensureQuantInfra(state).monthly_burn;
}

export interface QuantPurchaseResult {
  ok: boolean;
  charged: number;
  afterBalance: number;
  reason?: 'ALREADY_AT_OR_ABOVE_TIER' | 'MUST_UPGRADE_ONE_TIER_AT_A_TIME' | 'INSUFFICIENT_MANAGEMENT_CASH' | 'CASH_PRESERVATION';
}

export function purchaseQuantTier(state: GameState, target: QuantTier, date: string, nodeIndex = state.game_day_index ?? 0): QuantPurchaseResult {
  const q = refreshStaffSupport(state, nodeIndex);
  const economy = ensureEconomyState(state);
  const currentRank = rank(q.purchased_tier);
  const targetRank = rank(target);
  if (targetRank <= currentRank) return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'ALREADY_AT_OR_ABOVE_TIER' };
  if (targetRank !== currentRank + 1) return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'MUST_UPGRADE_ONE_TIER_AT_A_TIME' };
  if (isCashPreservation(state)) return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'CASH_PRESERVATION' };

  const cost = tierById(target).deployment_cost;
  if (economy.management_cash < cost) return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };

  economy.management_cash = cents(economy.management_cash - cost);
  q.purchased_tier = target;
  q.deployment_paid = true;
  q.deployment_paid_amount = cents(q.deployment_paid_amount + cost);
  q.activated_node = nodeIndex;
  q.monthly_burn = cents(tierById(target).monthly_burn + q.external_backup_burn);
  q.suspension_nodes = 0;
  q.status = 'ACTIVE';
  q.effective_tier = tierAt(Math.min(rank(target), rank(q.staff_supported_tier)));
  refreshModuleHealth(q);

  (state.capital_spend_log ??= []).push({
    id: new_id(),
    date,
    category: 'TECHNOLOGY',
    label: `量化桌 ${target} 部署`,
    amount_usd: cost,
    wallet: 'MANAGEMENT_COMPANY',
    legality_class: 'LEGAL',
  });
  (state.audit_trail ??= []).push({
    id: new_id(),
    date,
    action: 'QUANT_TIER_DEPLOYMENT',
    wallet: 'MANAGEMENT_CASH',
    amount: cost,
    detail: target,
  });
  return { ok: true, charged: cost, afterBalance: economy.management_cash };
}

export interface QuantPresetInput {
  id?: string;
  name: string;
  conditions: number;
  custom_score?: boolean;
  maintained_by?: string | null;
}

export interface QuantActionResult<T = unknown> {
  ok: boolean;
  value?: T;
  reason?: string;
}

function maxPresets(tier: QuantTier): number {
  if (tier === 'T1') return 1;
  if (tier === 'T2') return 3;
  if (rank(tier) >= rank('T3')) return Number.POSITIVE_INFINITY;
  return 0;
}

function maxConditions(tier: QuantTier): number {
  if (tier === 'T1') return 3;
  if (tier === 'T2') return 6;
  if (tier === 'T3') return 10;
  if (tier === 'T4') return Number.POSITIVE_INFINITY;
  return 1;
}

export function saveQuantPreset(state: GameState, input: QuantPresetInput, nodeIndex = state.game_day_index ?? 0): QuantActionResult<QuantPreset> {
  const q = refreshStaffSupport(state, nodeIndex);
  if (q.status !== 'ACTIVE' || q.grace_nodes_left > 0) return { ok: false, reason: 'QUANT_DESK_READ_ONLY' };
  const limit = maxPresets(q.effective_tier);
  if (q.presets.length >= limit) return { ok: false, reason: 'PRESET_LIMIT_REACHED' };
  const conditions = Math.max(1, Math.trunc(input.conditions));
  if (conditions > maxConditions(q.effective_tier)) return { ok: false, reason: 'CONDITION_LIMIT_REACHED' };
  if (input.custom_score && rank(q.effective_tier) < rank('T3')) return { ok: false, reason: 'CUSTOM_SCORE_REQUIRES_T3' };
  const preset: QuantPreset = {
    id: input.id ?? `quant_preset_${new_id()}`,
    name: input.name.trim() || `Preset ${q.presets.length + 1}`,
    conditions,
    custom_score: Boolean(input.custom_score),
    maintained_by: input.maintained_by ?? q.key_person_id,
    locked: false,
    locked_reason: null,
    created_node: nodeIndex,
  };
  q.presets = [...q.presets, preset];
  return { ok: true, value: preset };
}

export function saveQuantStressCase(
  state: GameState,
  input: { id?: string; name: string; factors: string[]; maintained_by?: string | null },
  nodeIndex = state.game_day_index ?? 0,
): QuantActionResult<QuantStressCase> {
  const q = refreshStaffSupport(state, nodeIndex);
  if (q.status !== 'ACTIVE' || q.grace_nodes_left > 0) return { ok: false, reason: 'QUANT_DESK_READ_ONLY' };
  if (rank(q.effective_tier) < rank('T3')) return { ok: false, reason: 'SAVED_STRESS_CASES_REQUIRE_T3' };
  const limit = q.effective_tier === 'T3' ? 3 : Number.POSITIVE_INFINITY;
  if (q.saved_stress_cases.length >= limit) return { ok: false, reason: 'STRESS_CASE_LIMIT_REACHED' };
  const stressCase: QuantStressCase = {
    id: input.id ?? `quant_stress_${new_id()}`,
    name: input.name.trim() || `Stress case ${q.saved_stress_cases.length + 1}`,
    factors: [...new Set(input.factors.map((factor) => factor.trim()).filter(Boolean))],
    maintained_by: input.maintained_by ?? q.key_person_id,
    locked: false,
    created_node: nodeIndex,
  };
  q.saved_stress_cases = [...q.saved_stress_cases, stressCase];
  return { ok: true, value: stressCase };
}

export function recordCustomScoreUsage(state: GameState, modelId: string, nodeIndex: number, usedForOrder = false): void {
  const q = refreshStaffSupport(state, nodeIndex);
  const usage = q.custom_score_usage;
  const consecutive = usage.model_id === modelId && usage.last_node_index === nodeIndex - 1
    ? usage.consecutive_nodes + 1
    : 1;
  usage.model_id = modelId;
  usage.consecutive_nodes = consecutive;
  usage.last_node_index = nodeIndex;
  if (usedForOrder && usage.order_node_indices[usage.order_node_indices.length - 1] !== nodeIndex) {
    usage.order_node_indices = [...usage.order_node_indices, nodeIndex].slice(-5);
  }
}

export const record_custom_score_usage = recordCustomScoreUsage;

export function recordQuantTrade(state: GameState, nodeIndex: number, modelId?: string | null): void {
  if (modelId) recordCustomScoreUsage(state, modelId, nodeIndex, true);
}

export const record_quant_trade = recordQuantTrade;

export function recordHighLoadNode(state: GameState, nodeIndex: number): void {
  const q = ensureQuantInfra(state);
  if (q.last_high_load_node_index === nodeIndex) return;
  q.consecutive_high_load_nodes = q.last_high_load_node_index === nodeIndex - 1 ? q.consecutive_high_load_nodes + 1 : 1;
  q.last_high_load_node_index = nodeIndex;
}

export interface AdvanceQuantInput {
  date: string;
  previousDate: string;
  nodeIndex: number;
  fundNav?: number;
  settlementRecord?: EconomySettlementRecord | null;
  highLoad?: boolean;
  hasRealHistoricalGex?: boolean;
}

export interface AdvanceQuantResult {
  monthly_due: number;
  monthly_paid: boolean;
  status: QuantInfraState['status'];
  effective_tier: QuantTier;
  queued_incident_ids: string[];
}

function currentSettlement(state: GameState, input: AdvanceQuantInput): EconomySettlementRecord | null {
  if (input.settlementRecord) return input.settlementRecord;
  if (monthOf(input.date) === monthOf(input.previousDate)) return null;
  const q = ensureQuantInfra(state);
  const result = settleMonth(state, {
    settlementId: `month:${monthOf(input.date)}`,
    monthId: monthOf(input.date),
    date: input.date,
    fundNav: input.fundNav ?? state.fund_stats.nav ?? state.start_cash,
    quantMonthlyCost: q.monthly_burn,
  });
  return result.record;
}

function hasIncident(q: QuantInfraState, incidentId: string): boolean {
  return q.incident_history.some((entry) => entry.incident_id === incidentId);
}

function appendIncidentRecord(q: QuantInfraState, record: QuantIncidentRecord): void {
  q.incident_history = [...q.incident_history, record];
}

function buildIncidentChoice(incidentId: string, choice: QuantChoiceCopy): HumanActionChoice {
  const costs: Record<string, number> = {
    A_DECOMMISSION: 0,
    B_KEEP_RUNNING: 0,
    C_REVALIDATE: 1500,
    A_CROSS_TRAIN: 2000,
    B_IGNORE: 0,
    C_OUTSOURCE_BACKUP: 0,
    A_FREEZE_MODULE: 0,
    B_HOTFIX: 1000,
    C_IGNORE_DRIFT: 0,
  };
  const cost = costs[choice.choice_id] ?? 0;
  return {
    id: choice.choice_id,
    label: choice.label,
    cost_usd: cost,
    wallet: cost > 0 ? 'MANAGEMENT_COMPANY' : undefined,
    favor_delta: 0,
    morale_delta: 0,
    reputation_delta: 0,
    result_narrative: `${choice.feedback_text} ${choice.risk_impact_summary}`,
  };
}

export function createQuantIncidentEvent(incidentId: string, date: string, nodeIndex: number): HumanActionEvent {
  const copy = incidentById(incidentId);
  return {
    id: `quant_incident_${incidentId}_${nodeIndex}`,
    date,
    action_kind: 'QUANT_INCIDENT',
    character_id: null,
    headline: copy.title,
    body: `${copy.description}\n\n触发条件：${copy.trigger_conditions}`,
    choices: copy.choices.map((choice) => buildIncidentChoice(incidentId, choice)),
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
    quant_incident_id: incidentId,
  };
}

function queueIncident(state: GameState, incidentId: string, date: string, nodeIndex: number): boolean {
  const q = ensureQuantInfra(state);
  if (hasIncident(q, incidentId)) return false;
  const event = createQuantIncidentEvent(incidentId, date, nodeIndex);
  (state.human_action_events ??= []).push(event);
  appendIncidentRecord(q, { incident_id: incidentId, trigger_node: nodeIndex, trigger_date: date, status: 'PENDING', choice_id: null, resolved_date: null });
  return true;
}

function maybeQueueIncidents(state: GameState, date: string, nodeIndex: number): string[] {
  const q = ensureQuantInfra(state);
  if (q.status === 'SUSPENDED' || rank(q.effective_tier) < rank('T2')) return [];
  const queued: string[] = [];
  const usage = q.custom_score_usage;
  if (
    rank(q.effective_tier) >= rank('T3') &&
    usage.consecutive_nodes >= 3 &&
    usage.order_node_indices.length >= 2 &&
    queueIncident(state, 'INC_QUANT_OVERFIT_MODEL', date, nodeIndex)
  ) queued.push('INC_QUANT_OVERFIT_MODEL');

  if (
    rank(q.effective_tier) >= rank('T2') &&
    (q.dependency_score >= 70 || maintainedPresetShare(q) >= 0.6) &&
    queueIncident(state, 'INC_QUANT_KEY_PERSON', date, nodeIndex)
  ) queued.push('INC_QUANT_KEY_PERSON');

  if (
    rank(q.effective_tier) >= rank('T3') &&
    q.consecutive_high_load_nodes >= 5 &&
    queueIncident(state, 'INC_QUANT_DATA_DRIFT', date, nodeIndex)
  ) queued.push('INC_QUANT_DATA_DRIFT');
  return queued;
}

export function advanceQuantNode(state: GameState, input: AdvanceQuantInput): AdvanceQuantResult {
  const q = refreshStaffSupport(state, input.nodeIndex);
  const due = monthlyBurnDue(state);
  const settlement = currentSettlement(state, input);
  const crossedMonth = monthOf(input.date) !== monthOf(input.previousDate);
  const managementCash = ensureEconomyState(state).management_cash;
  const paid = rank(q.purchased_tier) === 0 || due === 0 || (
    settlement
      ? settlement.quant_paid !== false
      : (!crossedMonth && (q.status !== 'SUSPENDED' || managementCash >= due))
  );

  if (settlement) {
    q.last_settlement_month = monthOf(input.date);
  }

  if (rank(q.purchased_tier) > 0 && !paid) {
    q.suspension_nodes += 1;
    q.status = 'SUSPENDED';
    q.module_health = { scanner: 'READ_ONLY', gex: 'READ_ONLY', greeks: 'READ_ONLY', stress: 'READ_ONLY', execution: 'READ_ONLY' };
    if (q.suspension_nodes >= 2) q.effective_tier = 'T0';
  } else if (rank(q.purchased_tier) > 0) {
    q.suspension_nodes = 0;
    if (q.grace_nodes_left > 0 && rank(q.staff_supported_tier) < rank(q.purchased_tier)) {
      q.grace_nodes_left -= 1;
      q.status = q.grace_nodes_left > 0 ? 'GRACE' : 'ACTIVE';
      q.effective_tier = q.grace_nodes_left > 0
        ? q.purchased_tier
        : tierAt(Math.min(rank(q.purchased_tier), rank(q.staff_supported_tier)));
    } else if (q.grace_nodes_left > 0) {
      q.grace_nodes_left = 0;
      q.status = 'ACTIVE';
      q.effective_tier = q.purchased_tier;
    } else {
      q.status = 'ACTIVE';
      q.effective_tier = tierAt(Math.min(rank(q.purchased_tier), rank(q.staff_supported_tier)));
    }
  } else {
    q.status = 'ACTIVE';
    q.effective_tier = 'T0';
  }

  if (q.pending_dependency_reduction > 0 && q.dependency_reduction_due_node != null && input.nodeIndex >= q.dependency_reduction_due_node) {
    q.dependency_score = clamp(q.dependency_score - q.pending_dependency_reduction);
    q.pending_dependency_reduction = 0;
    q.dependency_reduction_due_node = null;
  }
  if (q.model_cooling_nodes > 0) q.model_cooling_nodes -= 1;
  if (q.module_degradation_nodes > 0) q.module_degradation_nodes -= 1;
  if (input.highLoad && rank(q.effective_tier) >= rank('T3')) recordHighLoadNode(state, input.nodeIndex);

  refreshModuleHealth(q);
  const queued = maybeQueueIncidents(state, input.date, input.nodeIndex);
  refreshModuleHealth(q);
  return {
    monthly_due: due,
    monthly_paid: paid,
    status: q.status,
    effective_tier: q.effective_tier,
    queued_incident_ids: queued,
  };
}

function findQuantEvent(state: GameState, eventOrIncidentId: string): HumanActionEvent | null {
  return (state.human_action_events ?? []).find((event) =>
    event.id === eventOrIncidentId || event.quant_incident_id === eventOrIncidentId,
  ) ?? null;
}

function directChargeManagement(state: GameState, amount: number, date: string, detail: string): boolean {
  if (amount <= 0) return true;
  const economy = ensureEconomyState(state);
  if (economy.management_cash < amount) return false;
  economy.management_cash = cents(economy.management_cash - amount);
  (state.audit_trail ??= []).push({ id: new_id(), date, action: 'QUANT_INCIDENT_SPEND', wallet: 'MANAGEMENT_CASH', amount, detail });
  return true;
}

function deterministicHalf(seed: string): boolean {
  return stableHash(seed) % 2 === 0;
}

/** Applies the non-wallet effects after the generic human-action resolver charged the choice. */
export function applyQuantIncidentChoice(state: GameState, eventOrIncidentId: string, choiceId: string, date: string): QuantActionResult {
  const q = refreshStaffSupport(state, state.game_day_index ?? 0);
  const event = findQuantEvent(state, eventOrIncidentId);
  if (!event || !event.quant_incident_id) return { ok: false, reason: 'QUANT_INCIDENT_NOT_FOUND' };
  const incidentId = event.quant_incident_id;
  const copy = incidentById(incidentId);
  if (!copy.choices.some((choice) => choice.choice_id === choiceId)) return { ok: false, reason: 'QUANT_INCIDENT_CHOICE_NOT_FOUND' };
  const trigger = q.incident_history.find((entry) => entry.incident_id === incidentId && entry.status === 'PENDING');
  const triggerNode = trigger?.trigger_node ?? state.game_day_index ?? 0;

  if (incidentId === 'INC_QUANT_OVERFIT_MODEL') {
    if (choiceId === 'A_DECOMMISSION') {
      q.quant_reliability = clamp(q.quant_reliability + 8);
      state.fund_stats.reputation = (state.fund_stats.reputation ?? 0) - 1;
    } else if (choiceId === 'B_KEEP_RUNNING') {
      if (deterministicHalf(`${state.story_seed}:${incidentId}:${triggerNode}`)) {
        const flag = `FALSE_CONFIDENCE:${triggerNode}`;
        if (!q.false_confidence_flags.includes(flag)) q.false_confidence_flags = [...q.false_confidence_flags, flag];
        q.pending_review_process_penalty += 6;
        state.fund_stats.compliance_risk = (state.fund_stats.compliance_risk ?? 0) + 2;
      }
    } else if (choiceId === 'C_REVALIDATE') {
      q.quant_reliability = clamp(q.quant_reliability + 12);
      q.model_cooling_nodes = Math.max(q.model_cooling_nodes, 2);
    }
  } else if (incidentId === 'INC_QUANT_KEY_PERSON') {
    if (choiceId === 'A_CROSS_TRAIN') {
      q.pending_dependency_reduction = Math.max(q.pending_dependency_reduction, 25);
      q.dependency_reduction_due_node = triggerNode + 2;
    } else if (choiceId === 'B_IGNORE') {
      q.dependency_score = clamp(q.dependency_score + 10);
    } else if (choiceId === 'C_OUTSOURCE_BACKUP') {
      q.external_backup_burn = cents(q.external_backup_burn + 750);
      q.monthly_burn = cents(tierById(q.purchased_tier).monthly_burn + q.external_backup_burn);
      q.dependency_score = clamp(q.dependency_score - 15);
      const compliance = (state.compliance_state ??= {});
      compliance.info_security_risk = Number(compliance.info_security_risk ?? 0) + 5;
    }
  } else if (incidentId === 'INC_QUANT_DATA_DRIFT') {
    if (choiceId === 'A_FREEZE_MODULE') {
      q.module_degradation_nodes = Math.max(q.module_degradation_nodes, 1);
    } else if (choiceId === 'B_HOTFIX') {
      q.stale_module_flags = q.stale_module_flags.filter((flag) => flag !== 'execution' && flag !== 'scanner');
    } else if (choiceId === 'C_IGNORE_DRIFT') {
      for (const module of ['execution', 'scanner']) {
        if (!q.stale_module_flags.includes(module)) q.stale_module_flags = [...q.stale_module_flags, module];
      }
      q.pending_review_process_penalty += 4;
    }
  }

  appendIncidentRecord(q, {
    incident_id: incidentId,
    trigger_node: triggerNode,
    trigger_date: trigger?.trigger_date ?? date,
    status: 'RESOLVED',
    choice_id: choiceId,
    resolved_date: date,
  });
  refreshModuleHealth(q);
  return { ok: true };
}

/** Direct engine API for tests/tools that do not go through game.resolve_human_action. */
export function resolveQuantIncident(state: GameState, eventOrIncidentId: string, choiceId: string, date: string): QuantActionResult {
  const event = findQuantEvent(state, eventOrIncidentId);
  if (!event || !event.quant_incident_id) return { ok: false, reason: 'QUANT_INCIDENT_NOT_FOUND' };
  const copy = incidentById(event.quant_incident_id);
  const choice = copy.choices.find((candidate) => candidate.choice_id === choiceId);
  if (!choice) return { ok: false, reason: 'QUANT_INCIDENT_CHOICE_NOT_FOUND' };
  const built = buildIncidentChoice(event.quant_incident_id, choice);
  if (!directChargeManagement(state, built.cost_usd ?? 0, date, `${event.headline} · ${choice.label}`)) {
    return { ok: false, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };
  }
  event.resolved = true;
  event.chosen_choice_id = choiceId;
  event.resolved_on_date = date;
  event.impact_summary = `${choice.feedback_text} ${choice.risk_impact_summary}`;
  return applyQuantIncidentChoice(state, event.id, choiceId, date);
}

export interface QuantCapabilityOptions {
  hasRealHistoricalGex?: boolean;
}

function capability(
  q: QuantInfraState,
  module: QuantModule,
  features: string[],
  options: Partial<QuantCapability> = {},
): QuantCapability {
  const health = q.module_health[module];
  const readOnly = health === 'READ_ONLY' || q.status !== 'ACTIVE' || q.grace_nodes_left > 0;
  const dataStatus = health === 'STALE' ? 'STALE' : health === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : 'AVAILABLE';
  return {
    module,
    unlocked: true,
    effective_tier: q.effective_tier,
    health,
    read_only: readOnly,
    data_status: dataStatus,
    features,
    tooling_only: true,
    predictive_edge: false,
    ...options,
  };
}

export function getQuantCapabilities(state: GameState, options: QuantCapabilityOptions = {}): QuantCapabilities {
  const q = refreshStaffSupport(state);
  const copy = tierById(q.effective_tier);
  const historicalGexAvailable = options.hasRealHistoricalGex ?? false;
  const gexDataStatus = rank(q.effective_tier) >= rank('T4') && !historicalGexAvailable ? 'DATA_UNAVAILABLE' : undefined;
  const modules: QuantCapabilities = {
    scanner: capability(q, 'scanner', [copy.scanner_desc], {
      max_conditions: q.effective_tier === 'T4' ? 'UNLIMITED' : maxConditions(q.effective_tier),
      max_presets: q.effective_tier === 'T3' || q.effective_tier === 'T4' ? 'UNLIMITED' : maxPresets(q.effective_tier),
    }),
    greeks: capability(q, 'greeks', [copy.greeks_desc], {
      grid: q.effective_tier === 'T0' ? 'SINGLE_POINT' : q.effective_tier === 'T1' ? 'SPOT_3_POINT' : q.effective_tier === 'T2' ? 'SPOT_X_IV_3X3' : q.effective_tier === 'T3' ? 'SPOT_X_IV_5X5' : 'PORTFOLIO_SHOCK_SURFACE',
    }),
    gex: capability(q, 'gex', [copy.gex_desc], {
      data_status: gexDataStatus ?? (q.module_health.gex === 'STALE' ? 'STALE' : 'AVAILABLE'),
    }),
    stress: capability(q, 'stress', [copy.stress_desc], {
      factor_count: q.effective_tier === 'T4' ? 'MULTI_POSITION' : q.effective_tier === 'T0' || q.effective_tier === 'T1' ? 1 : 3,
    }),
    execution: capability(q, 'execution', [copy.execution_desc], {
      execution_tools: q.effective_tier === 'T4' ? ['MARKET', 'LIMIT', 'TWAP', 'VWAP'] : q.effective_tier === 'T3' ? ['MARKET', 'LIMIT', 'BATCH_EXECUTION'] : ['MARKET', 'LIMIT'],
    }),
  };
  return modules;
}

export const get_quant_capabilities = getQuantCapabilities;

export function getQuantInfraView(state: GameState): QuantInfraState {
  const q = refreshStaffSupport(state);
  return q;
}

// Snake-case aliases keep the engine convenient for the existing facade/test
// style while the public TypeScript API remains readable in camelCase.
export const create_quant_infra_state = createQuantInfraState;
export const ensure_quant_infra = ensureQuantInfra;
export const refresh_staff_support = refreshStaffSupport;
export const monthly_burn_due = monthlyBurnDue;
export const purchase_quant_tier = purchaseQuantTier;
export const save_quant_preset = saveQuantPreset;
export const save_quant_stress_case = saveQuantStressCase;
export const advance_quant_node = advanceQuantNode;
export const create_quant_incident_event = createQuantIncidentEvent;
export const apply_quant_incident_choice = applyQuantIncidentChoice;
export const resolve_quant_incident = resolveQuantIncident;
