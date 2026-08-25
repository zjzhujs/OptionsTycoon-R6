import crisisCopy from '../data/economy_copy/crisis_copy.json';
import { new_id } from '../ids';
import type {
  CrisisActionId,
  CrisisActionLedgerEntry,
  CrisisActionRuntime,
  CrisisActionUse,
  CrisisBacklashChoiceId,
  CrisisEventRecord,
  GameState,
  HumanActionChoice,
  HumanActionEvent,
  InvestigationStage,
} from '../schemas';
import { ensureEconomyState, isCashPreservation, managementRunwayMonths } from './economy_core';

type CrisisActionCopy = {
  action_id: CrisisActionId;
  name_cn: string;
  name_en: string;
  base_cost_desc: string;
  cooldown_nodes: number;
  diminishing_bucket: string;
  summary_pitch: string;
  effect_desc: string;
  forbidden_rule_note: string;
  feedback_text: string;
};

type CrisisBacklashCopy = {
  event_id: string;
  title: string;
  description: string;
  trigger_conditions: string;
  choices: Array<{
    choice_id: CrisisBacklashChoiceId;
    label: string;
    action_cost_desc: string;
    feedback_text: string;
    risk_impact_summary: string;
  }>;
};

export const CRISIS_ACTIONS = crisisCopy.actions as CrisisActionCopy[];
export const CRISIS_BACKLASH = crisisCopy.backfire_event as CrisisBacklashCopy;
const ACTION_IDS: CrisisActionId[] = [
  'OUTSIDE_COUNSEL',
  'LP_COMMUNICATION',
  'PUBLIC_RESPONSE',
  'POLICY_COUNSEL',
  'MEDIA_COUNTER',
  'INTERNAL_REMEDIATION',
];
const PR_ACTIONS = new Set<CrisisActionId>(['PUBLIC_RESPONSE', 'MEDIA_COUNTER']);
const FORMAL_STAGES = new Set<InvestigationStage>([
  'FORMAL_INVESTIGATION',
  'CIVIL_ENFORCEMENT',
  'CRIMINAL_INVESTIGATION',
  'CHARGED',
  'SETTLED',
  'TRIAL',
  'CONVICTED',
]);
const cents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clamp = (value: number, low = 0, high = 100): number => Math.max(low, Math.min(high, cents(value)));
const nodeOf = (state: GameState, input?: CrisisActionInput): number => input?.nodeIndex ?? state.game_day_index ?? 0;
const dateOf = (state: GameState, input?: CrisisActionInput): string => input?.date ?? state.updated_at?.slice(0, 10) ?? '2025-01-23';
const monthOf = (date: string): string => date.slice(0, 7);

export interface CrisisActionInput {
  date?: string;
  nodeIndex?: number;
  hasNewInformation?: boolean;
  disclosureComplete?: boolean;
  admitError?: boolean;
  reportIsFalse?: boolean;
  factsAccurate?: boolean;
  amount?: number;
}

export interface CrisisActionResult {
  ok: boolean;
  action_id: CrisisActionId;
  charged: number;
  effective_multiplier?: number;
  reason?: string;
  event?: CrisisEventRecord;
}

function actionCopy(actionId: CrisisActionId): CrisisActionCopy {
  const copy = CRISIS_ACTIONS.find((entry) => entry.action_id === actionId);
  if (!copy) throw new Error(`Unknown crisis action: ${actionId}`);
  return copy;
}

function runtime(state: GameState, actionId: CrisisActionId): CrisisActionRuntime {
  const found = (state.crisis_actions ?? []).find((entry) => entry.action_id === actionId);
  if (found) return found;
  const copy = actionCopy(actionId);
  const created: CrisisActionRuntime = {
    action_id: actionId,
    cooldown_nodes: copy.cooldown_nodes,
    last_used_node: null,
    diminishing_bucket: copy.diminishing_bucket,
    usage_30d: [],
    month_usage: {},
    blocked_until_node: null,
  };
  (state.crisis_actions ??= []).push(created);
  return created;
}

export function ensureCrisisState(state: GameState): GameState {
  ensureEconomyState(state);
  state.crisis_actions ??= [];
  for (const actionId of ACTION_IDS) runtime(state, actionId);
  state.crisis_action_ledger ??= [];
  state.crisis_events ??= [];
  state.legal_defense_quality ??= 0;
  state.procedural_compliance ??= 0;
  state.future_negative_media_multiplier ??= 1;
  state.future_negative_media_until_node ??= 0;
  state.pr_pressure ??= 0;
  state.misleading_lp_comm ??= false;
  state.gray_actions_blocked_until_node ??= 0;
  managementRunwayMonths(state);
  isCashPreservation(state);
  return state;
}

function scrutiny(state: GameState): number {
  const compliance = state.compliance_state ?? {};
  return clamp(Number((compliance as Record<string, unknown>).scrutiny ?? state.fund_stats.compliance_risk ?? 0));
}

function bumpScrutiny(state: GameState, delta: number): void {
  const next = clamp(scrutiny(state) + delta);
  (state.compliance_state ??= {}).scrutiny = next;
  // Existing compliance UI and ending logic read this field. It is a damage
  // risk index, not a deletion of any underlying investigation evidence.
  state.fund_stats.compliance_risk = clamp((state.fund_stats.compliance_risk ?? 0) + delta);
}

function bumpReputation(state: GameState, delta: number): void {
  state.fund_stats.reputation = clamp((state.fund_stats.reputation ?? 0) + delta);
  if (state.player_street_score) {
    state.player_street_score.human_action_reputation_bonus =
      (state.player_street_score.human_action_reputation_bonus ?? 0) + delta;
    state.player_street_score.media_profile = clamp((state.player_street_score.media_profile ?? 0) + delta * 0.5);
  }
}

function bumpLpConfidence(state: GameState, delta: number): void {
  state.fund_stats.lp_confidence = clamp((state.fund_stats.lp_confidence ?? 0) + delta);
  for (const lp of state.lp_profiles ?? []) lp.confidence_score = clamp((lp.confidence_score ?? state.fund_stats.lp_confidence ?? 0) + delta);
}

function investigationIsFormal(state: GameState): boolean {
  return FORMAL_STAGES.has(state.evidence_state?.investigation_stage ?? 'CLEAN');
}

function crisisIsActive(state: GameState): boolean {
  return scrutiny(state) >= 40 || (state.media_attention ?? 0) >= 60 || (state.evidence_state?.investigation_stage ?? 'CLEAN') !== 'CLEAN';
}

function trimUsage(entry: CrisisActionRuntime, nodeIndex: number): CrisisActionUse[] {
  entry.usage_30d = (entry.usage_30d ?? []).filter((use) => nodeIndex - use.node_index < 30 && nodeIndex >= use.node_index);
  return entry.usage_30d;
}

function spend(state: GameState, amount: number, date: string, actionId: string): boolean {
  const economy = ensureEconomyState(state);
  const charge = cents(Math.max(0, amount));
  if (economy.management_cash < charge) return false;
  economy.management_cash = cents(economy.management_cash - charge);
  (state.audit_trail ??= []).push({
    id: new_id(),
    date,
    action: `CRISIS_${actionId}`,
    wallet: 'MANAGEMENT_CASH',
    amount: charge,
    detail: `Legal/PR action ${actionId}; Fund NAV untouched`,
  });
  return true;
}

function actionCost(state: GameState, actionId: CrisisActionId, input: CrisisActionInput): number {
  if (actionId === 'OUTSIDE_COUNSEL') return scrutiny(state) >= 60 || investigationIsFormal(state) ? 3500 : 2000;
  if (actionId === 'LP_COMMUNICATION') return crisisIsActive(state) ? 1250 : 750;
  if (actionId === 'INTERNAL_REMEDIATION') return clamp(input.amount ?? 2000, 1000, 3000);
  if (actionId === 'PUBLIC_RESPONSE') return 1250;
  if (actionId === 'POLICY_COUNSEL') return 2500;
  return 1500;
}

function canRun(state: GameState, actionId: CrisisActionId, date: string, nodeIndex: number, input: CrisisActionInput): { ok: boolean; reason?: string; multiplier: number; entry: CrisisActionRuntime } {
  const entry = runtime(state, actionId);
  const uses = trimUsage(entry, nodeIndex);
  if (entry.blocked_until_node != null && nodeIndex < entry.blocked_until_node && PR_ACTIONS.has(actionId)) {
    return { ok: false, reason: 'PR_ACTION_LOCKED', multiplier: 0, entry };
  }
  if (entry.last_used_node != null && nodeIndex - entry.last_used_node < entry.cooldown_nodes) {
    return { ok: false, reason: 'ACTION_ON_COOLDOWN', multiplier: 0, entry };
  }
  if (state.cash_preservation && actionId !== 'INTERNAL_REMEDIATION') {
    return { ok: false, reason: 'CASH_PRESERVATION', multiplier: 0, entry };
  }
  const month = monthOf(date);
  if (actionId === 'INTERNAL_REMEDIATION' && (entry.month_usage[month] ?? 0) >= 2) {
    return { ok: false, reason: 'MONTHLY_ACTION_LIMIT', multiplier: 0, entry };
  }
  const sameActionCount = uses.filter((use) => use.action_id === actionId).length;
  const bucketCount = uses.filter((use) => use.action_id === actionId || (PR_ACTIONS.has(actionId) && PR_ACTIONS.has(use.action_id))).length;
  let multiplier = [1, 0.75, 0.5, 0.25][Math.min(3, bucketCount)];
  if (actionId === 'LP_COMMUNICATION' && input.hasNewInformation !== true && sameActionCount >= 1) multiplier *= 0.5;
  return { ok: true, multiplier, entry };
}

function snapshotIntegrity(state: GameState): Pick<CrisisActionLedgerEntry, 'evidence_count_before' | 'mnpi_flags_before' | 'bribery_flags_before'> {
  return {
    evidence_count_before: (state.evidence_ledger ?? []).length,
    mnpi_flags_before: [...(state.mnpi_flags ?? [])],
    bribery_flags_before: [...(state.bribery_flags ?? [])],
  };
}

function maybeQueueBacklash(state: GameState, date: string, nodeIndex: number): CrisisEventRecord | undefined {
  const pending = (state.crisis_events ?? []).find((event) => event.event_id === CRISIS_BACKLASH.event_id && !event.resolved);
  if (pending) return pending;
  const recentPr = (state.crisis_actions ?? [])
    .filter((entry) => PR_ACTIONS.has(entry.action_id))
    .flatMap((entry) => trimUsage(entry, nodeIndex));
  const pressureTrigger = recentPr.length >= 3;
  const attentionTrigger = (state.media_attention ?? 0) >= 65 && recentPr.length >= 1;
  if (!pressureTrigger && !attentionTrigger) return undefined;
  const choices = CRISIS_BACKLASH.choices.map((choice): HumanActionChoice => ({
    id: choice.choice_id,
    label: choice.label,
    cost_usd: choice.choice_id === 'A_GO_SILENT' ? 0 : choice.choice_id === 'B_TRANSPARENT_BRIEFING' ? 750 : 1500,
    wallet: choice.choice_id === 'A_GO_SILENT' ? undefined : 'MANAGEMENT_COMPANY',
    favor_delta: 0,
    morale_delta: 0,
    reputation_delta: 0,
    result_narrative: `${choice.feedback_text} ${choice.risk_impact_summary}`,
  }));
  const record: CrisisEventRecord = {
    id: `${CRISIS_BACKLASH.event_id}_${nodeIndex}`,
    event_id: CRISIS_BACKLASH.event_id,
    date,
    node_index: nodeIndex,
    headline: CRISIS_BACKLASH.title,
    body: `${CRISIS_BACKLASH.description}\n\n触发条件：${CRISIS_BACKLASH.trigger_conditions}`,
    choices: choices.map((choice) => ({ id: choice.id as CrisisBacklashChoiceId, label: choice.label, cost_usd: choice.cost_usd ?? 0, result_narrative: choice.result_narrative ?? '' })),
    resolved: false,
    chosen_choice_id: null,
  };
  (state.crisis_events ??= []).push(record);
  (state.human_action_events ??= []).push({
    id: record.id,
    date,
    action_kind: 'CRISIS_PUBLIC_BACKLASH',
    character_id: 'evelyn_shaw',
    headline: record.headline,
    body: record.body,
    choices,
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
  });
  return record;
}

export function executeCrisisAction(state: GameState, actionId: CrisisActionId, input: CrisisActionInput = {}): CrisisActionResult {
  ensureCrisisState(state);
  const date = dateOf(state, input);
  const nodeIndex = nodeOf(state, input);
  const gate = canRun(state, actionId, date, nodeIndex, input);
  if (!gate.ok) return { ok: false, action_id: actionId, charged: 0, reason: gate.reason };
  const cost = actionCost(state, actionId, input);
  const economy = ensureEconomyState(state);
  const beforeCash = economy.management_cash;
  if (!spend(state, cost, date, actionId)) return { ok: false, action_id: actionId, charged: 0, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };
  const integrity = snapshotIntegrity(state);
  const multiplier = gate.multiplier;
  const scale = (value: number): number => Math.round(value * multiplier * 100) / 100;
  const formal = investigationIsFormal(state);

  if (actionId === 'OUTSIDE_COUNSEL') {
    state.legal_defense_quality = clamp((state.legal_defense_quality ?? 0) + scale(14));
    if (!formal) bumpScrutiny(state, -scale(3));
    state.fund_stats.compliance_risk = clamp((state.fund_stats.compliance_risk ?? 0) - scale(4));
    if (state.gp_wealth) state.gp_wealth.legal_defense_spent = cents((state.gp_wealth.legal_defense_spent ?? 0) + cost);
  } else if (actionId === 'LP_COMMUNICATION') {
    if (input.disclosureComplete === false) {
      bumpLpConfidence(state, scale(2));
      state.misleading_lp_comm = true;
    } else {
      bumpLpConfidence(state, scale(6));
      if (input.admitError) bumpReputation(state, scale(2));
    }
  } else if (actionId === 'PUBLIC_RESPONSE') {
    bumpReputation(state, scale(3));
    state.media_attention = clamp((state.media_attention ?? 0) + scale(6));
    state.future_negative_media_multiplier = Math.min(state.future_negative_media_multiplier ?? 1, 0.72);
  } else if (actionId === 'POLICY_COUNSEL') {
    const exRegBoost = (state.talent_roster ?? []).some((entry) => entry.role_id === 'EX_REG' && entry.status === 'ACTIVE') ? 1.5 : 1;
    if (formal) state.legal_defense_quality = clamp((state.legal_defense_quality ?? 0) + scale(12 * exRegBoost));
    else {
      bumpScrutiny(state, -scale(3 * exRegBoost));
      state.fund_stats.compliance_risk = clamp((state.fund_stats.compliance_risk ?? 0) - scale(4 * exRegBoost));
    }
  } else if (actionId === 'MEDIA_COUNTER') {
    state.media_attention = clamp((state.media_attention ?? 0) + scale(9));
    if (input.reportIsFalse === true || input.factsAccurate === false) {
      bumpReputation(state, scale(5));
    } else {
      bumpReputation(state, -scale(5));
      bumpScrutiny(state, scale(4));
      state.future_negative_media_multiplier = 1.5;
      state.future_negative_media_until_node = nodeIndex + 4;
    }
  } else {
    const month = monthOf(date);
    const amountScale = Math.max(0.25, multiplier);
    state.fund_stats.compliance_risk = clamp((state.fund_stats.compliance_risk ?? 0) - scale(9));
    state.procedural_compliance = clamp((state.procedural_compliance ?? 0) + scale(10));
    state.gray_actions_blocked_until_node = Math.max(state.gray_actions_blocked_until_node ?? 0, nodeIndex + Math.max(2, Math.round(3 * amountScale)));
    gate.entry.month_usage[month] = (gate.entry.month_usage[month] ?? 0) + 1;
  }

  const use: CrisisActionUse = { action_id: actionId, date, node_index: nodeIndex, has_new_information: input.hasNewInformation };
  gate.entry.usage_30d.push(use);
  gate.entry.last_used_node = nodeIndex;
  gate.entry.month_usage[monthOf(date)] ??= 0;
  if (actionId !== 'INTERNAL_REMEDIATION') gate.entry.month_usage[monthOf(date)] += 1;
  if (PR_ACTIONS.has(actionId)) state.pr_pressure = (state.pr_pressure ?? 0) + 1;
  const afterIntegrity = snapshotIntegrity(state);
  const ledger: CrisisActionLedgerEntry = {
    id: new_id(),
    date,
    node_index: nodeIndex,
    action_id: actionId,
    cost,
    effective_multiplier: multiplier,
    diminishing_count: gate.entry.usage_30d.length,
    reason: actionCopy(actionId).summary_pitch,
    management_cash_before: beforeCash,
    management_cash_after: economy.management_cash,
    evidence_count_before: integrity.evidence_count_before,
    evidence_count_after: afterIntegrity.evidence_count_before,
    mnpi_flags_before: integrity.mnpi_flags_before,
    mnpi_flags_after: afterIntegrity.mnpi_flags_before,
    bribery_flags_before: integrity.bribery_flags_before,
    bribery_flags_after: afterIntegrity.bribery_flags_before,
  };
  (state.crisis_action_ledger ??= []).push(ledger);
  (state.audit_trail ??= []).push({ id: new_id(), date, action: 'CRISIS_ACTION', wallet: 'MANAGEMENT_CASH', amount: cost, detail: `${actionId} · ${actionCopy(actionId).feedback_text}` });
  const event = PR_ACTIONS.has(actionId) ? maybeQueueBacklash(state, date, nodeIndex) : undefined;
  managementRunwayMonths(state);
  isCashPreservation(state);
  return { ok: true, action_id: actionId, charged: cost, effective_multiplier: multiplier, event };
}

export function resolveCrisisBacklash(state: GameState, eventId: string, choiceId: CrisisBacklashChoiceId, date = dateOf(state), nodeIndex = state.game_day_index ?? 0): CrisisActionResult {
  ensureCrisisState(state);
  const record = (state.crisis_events ?? []).find((event) => event.id === eventId || event.event_id === eventId);
  if (!record || record.resolved) return { ok: false, action_id: 'PUBLIC_RESPONSE', charged: 0, reason: 'BACKLASH_EVENT_NOT_FOUND' };
  const choice = record.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) return { ok: false, action_id: 'PUBLIC_RESPONSE', charged: 0, reason: 'BACKLASH_CHOICE_NOT_FOUND' };
  if (state.cash_preservation && choiceId !== 'A_GO_SILENT') return { ok: false, action_id: 'PUBLIC_RESPONSE', charged: 0, reason: 'CASH_PRESERVATION' };
  const cost = choice.cost_usd;
  if (!spend(state, cost, date, `BACKLASH_${choiceId}`)) return { ok: false, action_id: 'PUBLIC_RESPONSE', charged: 0, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };
  if (choiceId === 'A_GO_SILENT') {
    state.media_attention = clamp((state.media_attention ?? 0) - 10);
    bumpReputation(state, -2);
    for (const action of state.crisis_actions ?? []) if (PR_ACTIONS.has(action.action_id)) action.blocked_until_node = nodeIndex + 2;
  } else if (choiceId === 'B_TRANSPARENT_BRIEFING') {
    if (state.misleading_lp_comm) {
      bumpReputation(state, -10);
      bumpScrutiny(state, 10);
    } else {
      bumpReputation(state, 3);
      bumpLpConfidence(state, 4);
    }
  } else {
    bumpReputation(state, 2);
    state.media_attention = clamp((state.media_attention ?? 0) + 15);
    bumpScrutiny(state, 5);
    state.future_negative_media_multiplier = 1.5;
    state.future_negative_media_until_node = nodeIndex + 4;
  }
  record.resolved = true;
  record.chosen_choice_id = choiceId;
  record.resolved_on_date = date;
  const event = (state.human_action_events ?? []).find((candidate) => candidate.id === record.id);
  if (event) {
    event.resolved = true;
    event.chosen_choice_id = choiceId;
    event.resolved_on_date = date;
    event.impact_summary = choice.result_narrative;
  }
  (state.audit_trail ??= []).push({ id: new_id(), date, action: 'CRISIS_BACKLASH', wallet: 'MANAGEMENT_CASH', amount: cost, detail: `${choiceId} · evidence remains append-only` });
  managementRunwayMonths(state);
  isCashPreservation(state);
  return { ok: true, action_id: 'PUBLIC_RESPONSE', charged: cost, event: record };
}

export function advanceCrisisNode(state: GameState, date: string, nodeIndex: number): void {
  ensureCrisisState(state);
  for (const entry of state.crisis_actions ?? []) trimUsage(entry, nodeIndex);
  if (state.future_negative_media_until_node != null && nodeIndex >= state.future_negative_media_until_node) {
    state.future_negative_media_multiplier = 1;
    state.future_negative_media_until_node = 0;
  }
  managementRunwayMonths(state);
  isCashPreservation(state);
  // The UI reads the persisted warning fields; do not append a duplicate log
  // entry on every compute_view call for the same node.
}

export const ensure_crisis_state = ensureCrisisState;
export const execute_crisis_action = executeCrisisAction;
export const useCrisisAction = executeCrisisAction;
export const performCrisisAction = executeCrisisAction;
export const resolve_crisis_backlash = resolveCrisisBacklash;
export const resolveBacklashEvent = resolveCrisisBacklash;
export const getCrisisActions = (): CrisisActionCopy[] => CRISIS_ACTIONS.map((entry) => ({ ...entry }));
