import talentCopy from '../data/economy_copy/talent_copy.json';
import gpCopy from '../data/economy_copy/gp_copy.json';
import { appendImmutableEvidence, ensureEconomyState, isCashPreservation } from './economy_core';
import { recompute_cost_buckets } from './management_company';
import * as economyQuant from './economy_quant';
import { new_id } from '../ids';
import type {
  BriberyAssessment,
  EconomySettlementRecord,
  Employee,
  EmployeeRole,
  GPSpendItemId,
  GPSpendRecord,
  GameState,
  HumanActionChoice,
  HumanActionEvent,
  TalentActionId,
  TalentEventHistoryEntry,
  TalentRetentionChoice,
  TalentRoleId,
  TalentRosterEntry,
  TalentTeamEventId,
} from '../schemas';

type TalentRoleCopy = {
  role_id: TalentRoleId;
  name_cn: string;
  name_en: string;
  signing_cost: number;
  monthly_burn: number;
  conflict_tags: string[];
  bio_pitch: string;
  passive_ability_desc: string;
  active_ability_desc: string;
  dialogue: Record<string, string>;
};

type TeamChoiceCopy = {
  choice_id: string;
  label: string;
  action_cost_desc: string;
  feedback_text: string;
  risk_impact_summary: string;
};

type TeamEventCopy = {
  event_id: string;
  title: string;
  description: string;
  trigger_conditions: string;
  choices: TeamChoiceCopy[];
};

type GPItemCopy = {
  item_id: GPSpendItemId;
  name_cn: string;
  name_en: string;
  cost_range_desc: string;
  recurring_burn_desc: string;
  summary_pitch: string;
  gameplay_unlocked: string;
  feedback_text: string;
  optics_risk_note: string;
};

export const TALENT_ROLES = talentCopy.roles as TalentRoleCopy[];
export const TALENT_TEAM_EVENTS = talentCopy.team_events as TeamEventCopy[];
export const GP_SPEND_ITEMS = gpCopy.items as GPItemCopy[];

const DEFAULT_NODE_DATE = '2025-01-23';
const TALENT_TO_EMPLOYEE_ROLE: Record<TalentRoleId, EmployeeRole> = {
  ANALYST: 'SENIOR_ANALYST',
  QUANT: 'QUANT_RESEARCHER',
  COUNSEL: 'LEGAL_COUNSEL',
  CRISIS_PR: 'INVESTOR_RELATIONS',
  EX_REG: 'COMPLIANCE_OFFICER',
};

const cents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const clamp = (value: number, low = 0, high = 100): number => Math.max(low, Math.min(high, Math.round(value * 100) / 100));
const monthOf = (date: string): string => date.slice(0, 7);
const roleCopy = (roleId: TalentRoleId): TalentRoleCopy => {
  const copy = TALENT_ROLES.find((candidate) => candidate.role_id === roleId);
  if (!copy) throw new Error(`Unknown talent role: ${roleId}`);
  return copy;
};
const teamCopy = (eventId: TalentTeamEventId): TeamEventCopy => {
  const copyIds: Record<TalentTeamEventId, string> = {
    STAR_JEALOUSY: 'EVT_TALENT_STAR_JEALOUSY',
    CONFLICT_OF_INTEREST: 'EVT_TALENT_CONFLICT_INTEREST',
    ANALYST_VS_QUANT: 'EVT_TALENT_ANALYST_VS_QUANT',
  };
  const copy = TALENT_TEAM_EVENTS.find((candidate) => candidate.event_id === copyIds[eventId]);
  if (!copy) throw new Error(`Unknown talent team event: ${eventId}`);
  return copy;
};
const spendCopy = (itemId: GPSpendItemId): GPItemCopy => {
  const copy = GP_SPEND_ITEMS.find((candidate) => candidate.item_id === itemId);
  if (!copy) throw new Error(`Unknown GP spend item: ${itemId}`);
  return copy;
};

function nodeId(state: GameState, date: string, nodeIndex = state.game_day_index ?? 0): string {
  return `${state.campaign_id ?? 'r1'}:${nodeIndex}:${date || DEFAULT_NODE_DATE}`;
}

function recordTalentHistory(
  state: GameState,
  entry: Omit<TalentEventHistoryEntry, 'id' | 'node_id'> & { node_id?: string },
): void {
  (state.talent_events_history ??= []).push({
    id: new_id(),
    node_id: entry.node_id ?? nodeId(state, entry.date),
    ...entry,
  });
}

function remember(state: GameState, key: string, date: string, summary: string): void {
  const memories = (state.character_memories ??= {});
  (memories[key] ??= []).push({
    timestamp: date,
    episode_id: 'talent_retainer_gp_power',
    summary,
    sentiment: 'RECORDED',
    key_fact: summary,
  });
}

function ensureEvidenceState(state: GameState): void {
  state.evidence_state ??= {
    evidence_points: 0,
    witness_count: 0,
    internal_awareness: 0,
    external_awareness: 0,
    whistleblower_risk: 0,
    enforcement_interest: 0,
    investigation_stage: 'CLEAN',
    records: [],
    investigator_character_id: 'marcus_reed',
    last_escalation_date: '',
    simulated_notice: 'Talent/GP compliance effects are simulated ledger entries; no real person or case is implied.',
  };
  state.evidence_state.records ??= [];
}

export function ensureTalentState(state: GameState): GameState {
  state.talent_roster ??= [];
  state.talent_events_history ??= [];
  state.talent_team_events ??= [];
  state.team_jealousy ??= 0;
  state.gp_spend_history ??= [];
  state.gp_visibility ??= 0;
  state.lp_optics ??= 0;
  state.media_attention ??= 0;
  state.gift_ledger ??= [];
  state.gp_wealth ??= {};
  state.gp_wealth.personal_monthly_burn ??= 0;
  state.gp_wealth.club_membership_active ??= false;
  state.gp_wealth.luxury_home_active ??= false;
  state.gp_wealth.jet_charter_count ??= 0;
  state.gp_wealth.last_personal_burn_month ??= null;
  state.gp_wealth.personal_burn_delinquent ??= false;
  state.bribery_flags ??= [];
  return state;
}

export function syncTalentRoster(state: GameState): TalentRosterEntry[] {
  ensureTalentState(state);
  const employeeIds = new Set((state.employees ?? []).map((employee) => employee.id));
  for (const entry of state.talent_roster ?? []) {
    if (entry.status !== 'RESIGNED' && !employeeIds.has(entry.employee_id)) {
      entry.status = 'RESIGNED';
      entry.consecutive_high_load_nodes = 0;
    }
  }
  return state.talent_roster ?? [];
}

function activeTalent(state: GameState, roleId: TalentRoleId): TalentRosterEntry | null {
  syncTalentRoster(state);
  return (state.talent_roster ?? []).find((entry) => entry.role_id === roleId && entry.status === 'ACTIVE') ?? null;
}

function activeTalents(state: GameState): TalentRosterEntry[] {
  syncTalentRoster(state);
  return (state.talent_roster ?? []).filter((entry) => entry.status === 'ACTIVE');
}

function spendManagement(
  state: GameState,
  amount: number,
  date: string,
  label: string,
  action: string,
): boolean {
  const economy = ensureEconomyState(state);
  const charge = cents(Math.max(0, amount));
  if (charge > 0 && isCashPreservation(state)) return false;
  if (economy.management_cash < charge) return false;
  economy.management_cash = cents(economy.management_cash - charge);
  if (charge > 0) {
    (state.capital_spend_log ??= []).push({
      id: new_id(),
      date,
      category: 'TEAM',
      label,
      amount_usd: charge,
      wallet: 'MANAGEMENT_COMPANY',
      legality_class: 'LEGAL',
    });
    (state.audit_trail ??= []).push({
      id: new_id(),
      date,
      action,
      wallet: 'MANAGEMENT_CASH',
      amount: charge,
      detail: label,
    });
  }
  return true;
}

function createTalentEmployee(state: GameState, roleId: TalentRoleId, name: string, date: string, salary: number): Employee {
  return {
    id: new_id(),
    name,
    role: TALENT_TO_EMPLOYEE_ROLE[roleId],
    salary_annual: salary * 12,
    hired_date: date,
    bonus_expectation_pct: 0,
    morale: 70,
    loyalty: 70,
    skill: 70,
    capacity_pct: 100,
    poaching_risk: 10,
    fictional: true,
    is_talent: true,
    talent_role_id: roleId,
    simulated_notice: 'SIMULATED TALENT RETAINER -- fictional specialist, not a real person.',
  };
}

export interface TalentHireResult {
  ok: boolean;
  role_id: TalentRoleId;
  charged: number;
  afterBalance: number;
  roster?: TalentRosterEntry;
  reason?: 'ALREADY_SIGNED' | 'INSUFFICIENT_MANAGEMENT_CASH' | 'CASH_PRESERVATION';
}

export function hireTalent(state: GameState, roleId: TalentRoleId, name = '', date = DEFAULT_NODE_DATE): TalentHireResult {
  ensureTalentState(state);
  const copy = roleCopy(roleId);
  const existing = (state.talent_roster ?? []).find((entry) => entry.role_id === roleId && entry.status !== 'RESIGNED');
  const economy = ensureEconomyState(state);
  if (existing) return { ok: false, role_id: roleId, charged: 0, afterBalance: economy.management_cash, reason: 'ALREADY_SIGNED' };
  if (isCashPreservation(state)) return { ok: false, role_id: roleId, charged: 0, afterBalance: economy.management_cash, reason: 'CASH_PRESERVATION' };
  if (!spendManagement(state, copy.signing_cost, date, `${copy.name_cn} 签约金`, 'TALENT_SIGNING')) {
    return { ok: false, role_id: roleId, charged: 0, afterBalance: economy.management_cash, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };
  }

  const employee = createTalentEmployee(state, roleId, name.trim() || copy.name_en, date, copy.monthly_burn);
  (state.employees ??= []).push(employee);
  const roster: TalentRosterEntry = {
    role_id: roleId,
    employee_id: employee.id,
    name: employee.name,
    status: 'ACTIVE',
    loyalty: 70,
    monthly_burn: copy.monthly_burn,
    signing_cost: copy.signing_cost,
    retention_bonus_total: 0,
    market_heat: 0,
    outside_offer_value: cents(copy.monthly_burn * 6),
    conflict_tags: [...copy.conflict_tags],
    active_action_cd: 0,
    last_used_node: null,
    consecutive_high_load_nodes: 0,
    hired_date: date,
    last_action_id: null,
    equity_share_pct: 0,
    grace_nodes_left: 0,
  };
  state.talent_roster = [...(state.talent_roster ?? []).filter((entry) => entry.role_id !== roleId), roster];
  recordTalentHistory(state, { event_id: `SIGNING_${roleId}`, date, kind: 'SIGNING', role_id: roleId, amount: copy.signing_cost, detail: `${copy.name_cn} 已签约：${copy.bio_pitch}` });
  recompute_cost_buckets(state);
  economyQuant.refreshStaffSupport(state, state.game_day_index ?? 0);
  return { ok: true, role_id: roleId, charged: copy.signing_cost, afterBalance: ensureEconomyState(state).management_cash, roster };
}

export function monthlyTalentBurnDue(state: GameState): number {
  return cents(syncTalentRoster(state).filter((entry) => entry.status !== 'RESIGNED').reduce((sum, entry) => sum + entry.monthly_burn, 0));
}

export const monthlyBurnDue = monthlyTalentBurnDue;

export function getTalentPassives(state: GameState): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const entry of activeTalents(state)) {
    if (entry.role_id === 'ANALYST') result.ANALYST = { evidence_chain_per_node: 1, character_memory: true, description: roleCopy('ANALYST').passive_ability_desc };
    if (entry.role_id === 'QUANT') result.QUANT = { quant_staff_capacity: true, supports_quant_infrastructure: true, description: roleCopy('QUANT').passive_ability_desc };
    if (entry.role_id === 'COUNSEL') result.COUNSEL = { legal_readout: true, preserves_facts: true, description: roleCopy('COUNSEL').passive_ability_desc };
    if (entry.role_id === 'CRISIS_PR') result.CRISIS_PR = { reputation_response_branch: true, description: roleCopy('CRISIS_PR').passive_ability_desc };
    if (entry.role_id === 'EX_REG') result.EX_REG = { procedural_warning_nodes: 1, no_outcome_foresight: true, description: roleCopy('EX_REG').passive_ability_desc };
  }
  return result;
}

export interface TalentActionResult {
  ok: boolean;
  role_id: TalentRoleId;
  action_id: TalentActionId;
  value?: Record<string, unknown>;
  reason?: 'NOT_SIGNED' | 'ACTION_ON_COOLDOWN' | 'DELINQUENT' | 'NO_TARGET';
}

function actionValue(state: GameState, roleId: TalentRoleId, actionId: TalentActionId, target = ''): Record<string, unknown> {
  if (roleId === 'ANALYST') return { ticker: target || state.active_ticker || 'NVDA', bull_case: '公开数据支持的上行假设待验证。', bear_case: '基本面/估值假设可能失效的路径。', key_risk: '下一节点应观察的可证伪条件。', available_after_node: (state.game_day_index ?? 0) + 1 };
  if (roleId === 'QUANT') {
    const q = economyQuant.ensureQuantInfra(state);
    return { module_health: { ...q.module_health }, stale_flags: [...q.stale_module_flags], false_confidence_flags: [...q.false_confidence_flags], missing_input: q.effective_tier === 'T4' ? '真实历史输入仍需外部提供。' : '无额外真实输入要求。' };
  }
  if (roleId === 'COUNSEL') return { legality: 'PROCEDURAL_READOUT_ONLY', evidence_range: [1, 4], compliance_risk_range: [5, 16], note: '预演不会删除已发生事实。' };
  if (roleId === 'CRISIS_PR') return { reputation_damage_multiplier: 0.65, media_attention_delta: 8, note: '只影响一次媒体事件的声誉损害，不改市场结果。' };
  return { exposure_surfaces: ['证据留档', '通讯与交易日志', '利益冲突披露'], procedural_warning_nodes: 1, outcome_forecast: false };
}

export function useTalentAction(
  state: GameState,
  roleId: TalentRoleId,
  actionId: TalentActionId,
  date = DEFAULT_NODE_DATE,
  target = '',
): TalentActionResult {
  const entry = syncTalentRoster(state).find((candidate) => candidate.role_id === roleId && candidate.status !== 'RESIGNED') ?? null;
  if (!entry) return { ok: false, role_id: roleId, action_id: actionId, reason: 'NOT_SIGNED' };
  if (entry.status === 'DELINQUENT') return { ok: false, role_id: roleId, action_id: actionId, reason: 'DELINQUENT' };
  if (entry.status !== 'ACTIVE') return { ok: false, role_id: roleId, action_id: actionId, reason: 'NOT_SIGNED' };
  if (entry.active_action_cd > 0) return { ok: false, role_id: roleId, action_id: actionId, reason: 'ACTION_ON_COOLDOWN' };
  if (roleId === 'ANALYST' && actionId === 'DEEP_DIVE' && !(target || state.active_ticker)) return { ok: false, role_id: roleId, action_id: actionId, reason: 'NO_TARGET' };

  entry.active_action_cd = 1;
  entry.last_used_node = state.game_day_index ?? 0;
  entry.last_action_id = actionId;
  recordTalentHistory(state, { event_id: `ABILITY_${roleId}_${actionId}`, date, kind: 'ABILITY', role_id: roleId, detail: `${roleCopy(roleId).name_cn} 执行 ${actionId}：${roleCopy(roleId).active_ability_desc}` });
  remember(state, entry.employee_id, date, `${roleCopy(roleId).name_cn} 的 ${actionId} 输出已归档，未提供胜率或买卖结论。`);
  if (roleId === 'CRISIS_PR') state.media_attention = clamp((state.media_attention ?? 0) + 8);
  if (roleId === 'EX_REG' || roleId === 'COUNSEL') queueTalentTeamEvent(state, 'CONFLICT_OF_INTEREST', date);
  const value = actionValue(state, roleId, actionId, target);
  if (roleId === 'QUANT') value.data_status = 'DATA_UNAVAILABLE';
  return { ok: true, role_id: roleId, action_id: actionId, value };
}

function pendingTalentEvent(state: GameState, actionKind: HumanActionEvent['action_kind'], roleId?: TalentRoleId): HumanActionEvent | null {
  return (state.human_action_events ?? []).find((event) => event.action_kind === actionKind && !event.resolved && (!roleId || event.talent_role_id === roleId)) ?? null;
}

function retentionCost(entry: TalentRosterEntry, choice: TalentRetentionChoice): number {
  if (choice === 'MATCH') return cents(Math.min(entry.outside_offer_value * 0.35, entry.monthly_burn * 6));
  if (choice === 'PROMOTE') return cents(entry.monthly_burn * 2);
  return 0;
}

function buildRetentionEvent(state: GameState, entry: TalentRosterEntry, date: string): HumanActionEvent {
  const copy = roleCopy(entry.role_id);
  const match = retentionCost(entry, 'MATCH');
  const promote = retentionCost(entry, 'PROMOTE');
  const eventId = `RETENTION_${entry.role_id}_${date}_${state.game_day_index ?? 0}`;
  const choice = (id: TalentRetentionChoice, label: string, cost: number, narrative: string): HumanActionChoice => ({
    id,
    label,
    cost_usd: cost,
    wallet: cost > 0 ? 'MANAGEMENT_COMPANY' : undefined,
    favor_delta: 0,
    morale_delta: 0,
    reputation_delta: 0,
    result_narrative: narrative,
  });
  return {
    id: eventId,
    date,
    action_kind: 'TALENT_RETENTION_EVENT',
    character_id: entry.employee_id,
    talent_event_id: eventId,
    talent_role_id: entry.role_id,
    headline: `${copy.name_cn} 收到竞争对手挖角报价`,
    body: `${copy.dialogue.retention_dialogue} 外部报价估值 $${entry.outside_offer_value.toFixed(0)}；本次不再使用固定 $25k 留人价。`,
    choices: [
      choice('MATCH', `MATCH：支付 $${match.toFixed(0)} 留任奖金`, match, '现金留任，忠诚度回升。'),
      choice('PROMOTE', `PROMOTE：支付 $${promote.toFixed(0)} 晋升津贴并永久加薪 20%`, promote, '晋升绑定核心人才，但会提高长期团队 burn。'),
      choice('LET_GO', 'LET_GO：放手离职，承受能力真空', 0, '不再支付留任奖金；对应能力和依赖链进入离场处理。'),
      choice('COUNTER_WITH_EQUITY', 'COUNTER_WITH_EQUITY：以后期股权/分成绑定', 0, '仅在后期声誉阶段可用；不触碰 Fund NAV。'),
    ],
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
  };
}

function queueRetentionOffer(state: GameState, entry: TalentRosterEntry, date: string): HumanActionEvent | null {
  if (pendingTalentEvent(state, 'TALENT_RETENTION_EVENT', entry.role_id)) return null;
  const event = buildRetentionEvent(state, entry, date);
  (state.human_action_events ??= []).push(event);
  entry.consecutive_high_load_nodes = 0;
  return event;
}

function adjustTalentEmployee(state: GameState, entry: TalentRosterEntry): void {
  const employee = (state.employees ?? []).find((candidate) => candidate.id === entry.employee_id);
  if (!employee) return;
  employee.salary_annual = entry.monthly_burn * 12;
  employee.loyalty = entry.loyalty;
}

function removeTalentEmployee(state: GameState, entry: TalentRosterEntry): void {
  state.employees = (state.employees ?? []).filter((employee) => employee.id !== entry.employee_id);
  entry.status = 'RESIGNED';
  entry.consecutive_high_load_nodes = 0;
  recompute_cost_buckets(state);
  economyQuant.refreshStaffSupport(state, state.game_day_index ?? 0);
}

function applyRetentionChoice(
  state: GameState,
  entry: TalentRosterEntry,
  choiceId: TalentRetentionChoice,
  date: string,
  precharged: boolean,
): TalentActionResult {
  const actionId = 'DEEP_DIVE';
  const cost = retentionCost(entry, choiceId);
  if (!precharged && !spendManagement(state, cost, date, `${entry.name} ${choiceId} 留任`, 'TALENT_RETENTION')) {
    return { ok: false, role_id: entry.role_id, action_id: actionId, reason: 'DELINQUENT' };
  }
  if (choiceId === 'MATCH') {
    entry.retention_bonus_total = cents(entry.retention_bonus_total + cost);
    entry.loyalty = clamp(entry.loyalty + 25);
    entry.market_heat = clamp(entry.market_heat - 25);
  } else if (choiceId === 'PROMOTE') {
    entry.retention_bonus_total = cents(entry.retention_bonus_total + cost);
    entry.monthly_burn = cents(entry.monthly_burn * 1.2);
    entry.loyalty = clamp(entry.loyalty + 18);
    entry.market_heat = clamp(entry.market_heat - 18);
    state.team_jealousy = clamp((state.team_jealousy ?? 0) + 10);
    adjustTalentEmployee(state, entry);
    recompute_cost_buckets(state);
  } else if (choiceId === 'LET_GO') {
    removeTalentEmployee(state, entry);
  } else {
    const unlocked = (state.player_street_score?.total_score ?? 0) >= 650 || (state.game_day_index ?? 0) >= 20;
    if (!unlocked) return { ok: false, role_id: entry.role_id, action_id: actionId, reason: 'ACTION_ON_COOLDOWN' };
    entry.equity_share_pct = 2;
    entry.loyalty = clamp(entry.loyalty + 12);
    entry.market_heat = clamp(entry.market_heat - 15);
  }
  const choice_id = choiceId;
  recordTalentHistory(state, { event_id: `RETENTION_${entry.role_id}`, date, kind: 'RETENTION', role_id: entry.role_id, choice_id, amount: cost, detail: `${entry.name} 留任选择 ${choiceId}` });
  entry.status = 'ACTIVE';
  entry.active_action_cd = 0;
  (state.talent_team_events ??= []);
  queueTalentTeamEvent(state, 'STAR_JEALOUSY', date);
  economyQuant.refreshStaffSupport(state, state.game_day_index ?? 0);
  return { ok: true, role_id: entry.role_id, action_id: actionId, value: { choice_id: choiceId, charged: cost, loyalty: entry.loyalty } };
}

export function resolveTalentRetention(
  state: GameState,
  roleId: TalentRoleId,
  choiceId: TalentRetentionChoice,
  date = DEFAULT_NODE_DATE,
  precharged = false,
): TalentActionResult {
  const entry = syncTalentRoster(state).find((candidate) => candidate.role_id === roleId && candidate.status !== 'RESIGNED') ?? null;
  if (!entry) return { ok: false, role_id: roleId, action_id: 'DEEP_DIVE', reason: 'NOT_SIGNED' };
  const event = pendingTalentEvent(state, 'TALENT_RETENTION_EVENT', roleId);
  if (!event && !precharged) return { ok: false, role_id: roleId, action_id: 'DEEP_DIVE', reason: 'ACTION_ON_COOLDOWN' };
  if (event && !precharged) {
    const choice = event.choices?.find((candidate) => candidate.id === choiceId);
    if (!choice) return { ok: false, role_id: roleId, action_id: 'DEEP_DIVE', reason: 'ACTION_ON_COOLDOWN' };
    if (!spendManagement(state, choice.cost_usd ?? 0, date, `${entry.name} ${choiceId} 留任`, 'TALENT_RETENTION')) {
      return { ok: false, role_id: roleId, action_id: 'DEEP_DIVE', reason: 'DELINQUENT' };
    }
    event.resolved = true;
    event.chosen_choice_id = choiceId;
    event.resolved_on_date = date;
    event.impact_summary = choice.result_narrative;
  }
  return applyRetentionChoice(state, entry, choiceId, date, true);
}

function hasPendingTeamEvent(state: GameState, eventId: TalentTeamEventId): boolean {
  return (state.talent_team_events ?? []).some((event) => event.event_id === eventId && !event.resolved);
}

function teamEventHumanKind(eventId: TalentTeamEventId): HumanActionEvent['action_kind'] {
  return eventId === 'CONFLICT_OF_INTEREST' ? 'TALENT_TEAM_EVENT' : 'TALENT_TEAM_EVENT';
}

function teamRoleIds(state: GameState, eventId: TalentTeamEventId): TalentRoleId[] {
  const roles = activeTalents(state).map((entry) => entry.role_id);
  if (eventId === 'STAR_JEALOUSY') return roles.filter((role) => role === 'ANALYST' || role === 'QUANT' || role === 'COUNSEL' || role === 'EX_REG').slice(0, 2);
  if (eventId === 'CONFLICT_OF_INTEREST') return roles.filter((role) => role === 'EX_REG' || role === 'COUNSEL');
  return roles.filter((role) => role === 'ANALYST' || role === 'QUANT');
}

export function queueTalentTeamEvent(state: GameState, eventId: TalentTeamEventId, date = DEFAULT_NODE_DATE): HumanActionEvent | null {
  ensureTalentState(state);
  if (hasPendingTeamEvent(state, eventId)) return null;
  const roleIds = teamRoleIds(state, eventId);
  if (eventId === 'STAR_JEALOUSY') {
    const bonus = activeTalents(state).some((entry) => entry.retention_bonus_total >= entry.monthly_burn * 12 * 0.4);
    const lowLoyalty = activeTalents(state).some((entry) => entry.loyalty < 60);
    if (!bonus || !lowLoyalty) return null;
  }
  if (eventId === 'CONFLICT_OF_INTEREST' && roleIds.length === 0) return null;
  if (eventId === 'ANALYST_VS_QUANT' && roleIds.length < 2) return null;
  const copy = teamCopy(eventId);
  const recordId = `${copy.event_id}_${date}_${state.game_day_index ?? 0}`;
  const record = { id: recordId, event_id: eventId, date, node_id: nodeId(state, date), role_ids: roleIds, resolved: false, choice_id: null };
  (state.talent_team_events ??= []).push(record);
  const costs: Record<string, number> = { B_PRIVATE_BONUS: 1500, A_HOLD_FORMAL_IC: 750 };
  const choices: HumanActionChoice[] = copy.choices.map((choice) => ({
    id: choice.choice_id,
    label: choice.label,
    cost_usd: costs[choice.choice_id] ?? 0,
    wallet: (costs[choice.choice_id] ?? 0) > 0 ? 'MANAGEMENT_COMPANY' : undefined,
    favor_delta: 0,
    morale_delta: 0,
    reputation_delta: 0,
    result_narrative: `${choice.feedback_text} ${choice.risk_impact_summary}`,
  }));
  const event: HumanActionEvent = {
    id: recordId,
    date,
    action_kind: teamEventHumanKind(eventId),
    character_id: null,
    talent_event_id: recordId,
    headline: copy.title,
    body: copy.description,
    choices,
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
  };
  (state.human_action_events ??= []).push(event);
  return event;
}

function addComplianceEvidence(state: GameState, date: string, points: number, risk: number, detail: string, flag = false): void {
  ensureEvidenceState(state);
  state.evidence_state!.evidence_points = Math.max(0, (state.evidence_state!.evidence_points ?? 0) + points);
  state.evidence_state!.enforcement_interest = clamp((state.evidence_state!.enforcement_interest ?? 0) + points * 0.5);
  state.fund_stats.compliance_risk = clamp((state.fund_stats.compliance_risk ?? 0) + risk);
  state.evidence_state!.records!.push({
    id: new_id(),
    date,
    category: flag ? 'BRIBERY' : 'TALENT_CONFLICT',
    description: detail,
    evidence_points: points,
    witness_ids: [],
    legality_class: flag ? 'ILLEGAL' : 'MNPI_RISK',
    related_action_id: `talent_${date}`,
  });
}

function addAnalystEvidenceChain(state: GameState, entry: TalentRosterEntry, date: string, nodeIndex: number): void {
  ensureEvidenceState(state);
  const relatedActionId = `talent_analyst_chain_${nodeIndex}`;
  if (state.evidence_state!.records!.some((record) => record.related_action_id === relatedActionId)) return;
  state.evidence_state!.evidence_points = (state.evidence_state!.evidence_points ?? 0) + 1;
  state.evidence_state!.records!.push({
    id: new_id(),
    date,
    category: 'TALENT_EVIDENCE_CHAIN',
    description: 'Analyst passive: one additional evidence-chain entry was recorded for this node.',
    evidence_points: 1,
    witness_ids: [],
    legality_class: 'LEGAL',
    related_action_id: relatedActionId,
  });
  remember(state, entry.employee_id, date, 'Analyst passive evidence-chain entry recorded; no outcome or trade recommendation was generated.');
}

export function resolveTalentTeamEvent(state: GameState, eventId: string, choiceId: string, date = DEFAULT_NODE_DATE, precharged = false): TalentActionResult {
  const record = (state.talent_team_events ?? []).find((candidate) => candidate.id === eventId && !candidate.resolved);
  const event = (state.human_action_events ?? []).find((candidate) => candidate.id === eventId && !candidate.resolved);
  if (!record || !event) return { ok: false, role_id: 'ANALYST', action_id: 'DEEP_DIVE', reason: 'ACTION_ON_COOLDOWN' };
  const choice = event.choices?.find((candidate) => candidate.id === choiceId);
  if (!choice) return { ok: false, role_id: record.role_ids[0] ?? 'ANALYST', action_id: 'DEEP_DIVE', reason: 'ACTION_ON_COOLDOWN' };
  if (!precharged && !spendManagement(state, choice.cost_usd ?? 0, date, `${event.headline} · ${choice.label}`, 'TALENT_TEAM_EVENT')) {
    return { ok: false, role_id: record.role_ids[0] ?? 'ANALYST', action_id: 'DEEP_DIVE', reason: 'DELINQUENT' };
  }
  if (!precharged) {
    event.resolved = true;
    event.chosen_choice_id = choiceId;
    event.resolved_on_date = date;
    event.impact_summary = choice.result_narrative;
  }
  const low = activeTalents(state).find((entry) => entry.loyalty < 60) ?? activeTalents(state)[0];
  if (record.event_id === 'STAR_JEALOUSY') {
    if (choiceId === 'A_PUBLIC_RAISE' && low) {
      low.monthly_burn = cents(low.monthly_burn * 1.15);
      low.loyalty = clamp(low.loyalty + 15);
      adjustTalentEmployee(state, low);
      recompute_cost_buckets(state);
      state.team_jealousy = 0;
    } else if (choiceId === 'B_PRIVATE_BONUS' && low) {
      low.loyalty = clamp(low.loyalty + 10);
      state.team_jealousy = clamp((state.team_jealousy ?? 0) + 15);
      remember(state, low.employee_id, date, '记录：区别对待与暗箱操作；未来团队事件复发权重提高。');
    } else if (low) {
      low.loyalty = clamp(low.loyalty - 18);
      low.active_action_cd = Math.max(low.active_action_cd, 3);
    }
  } else if (record.event_id === 'CONFLICT_OF_INTEREST') {
    const target = activeTalents(state).find((entry) => entry.role_id === 'EX_REG') ?? activeTalents(state).find((entry) => entry.role_id === 'COUNSEL');
    if (choiceId === 'A_RECUSE' && target) target.active_action_cd = Math.max(target.active_action_cd, 2);
    if (choiceId === 'B_DISCLOSE') {
      state.fund_stats.reputation = clamp((state.fund_stats.reputation ?? 0) - 3);
      addComplianceEvidence(state, date, 1, 0, '人才利益冲突已披露，审计证据追加。');
    }
    if (choiceId === 'C_PUSH_THROUGH') addComplianceEvidence(state, date, 2, 12, '人才利益冲突被强行推进，后续监管风险上升。');
  } else {
    const analyst = activeTalents(state).find((entry) => entry.role_id === 'ANALYST');
    const quant = activeTalents(state).find((entry) => entry.role_id === 'QUANT');
    if (choiceId === 'A_HOLD_FORMAL_IC') {
      if (analyst) analyst.loyalty = clamp(analyst.loyalty + 5);
      if (quant) quant.loyalty = clamp(quant.loyalty + 5);
      remember(state, 'investment_committee', date, 'Analyst 与 Quant 的冲突论点已冻结进决策时间轴。');
    } else if (choiceId === 'B_BACK_ANALYST') {
      if (analyst) analyst.loyalty = clamp(analyst.loyalty + 8);
      if (quant) quant.loyalty = clamp(quant.loyalty - 12);
    } else if (quant) {
      quant.loyalty = clamp(quant.loyalty + 8);
      if (analyst) analyst.loyalty = clamp(analyst.loyalty - 12);
    }
    for (const entry of [analyst, quant]) if (entry) adjustTalentEmployee(state, entry);
    const q = economyQuant.ensureQuantInfra(state);
    if (choiceId === 'B_BACK_ANALYST') q.quant_reliability = clamp(q.quant_reliability - 5);
    if (choiceId === 'C_BACK_QUANT') q.quant_reliability = clamp(q.quant_reliability + 2);
  }
  record.resolved = true;
  record.choice_id = choiceId;
  recordTalentHistory(state, { event_id: record.id, date, kind: 'TEAM_EVENT', choice_id: choiceId, detail: `${event.headline}：${choiceId}` });
  return { ok: true, role_id: record.role_ids[0] ?? 'ANALYST', action_id: 'DEEP_DIVE', value: { event_id: record.event_id, choice_id: choiceId } };
}

export interface AdvanceTalentInput {
  date: string;
  previousDate: string;
  nodeIndex: number;
  settlementRecord?: EconomySettlementRecord | null;
  highLoad?: boolean;
}

export interface AdvanceTalentResult {
  monthly_due: number;
  monthly_paid: boolean;
  queued_retention_ids: string[];
  queued_team_event_ids: string[];
}

export function settleGpPersonalBurn(state: GameState, date: string, nodeIndex = state.game_day_index ?? 0): { due: number; paid: boolean } {
  ensureTalentState(state);
  const month = monthOf(date);
  if (state.gp_wealth!.last_personal_burn_month === month) return { due: 0, paid: true };
  const due = cents(state.gp_wealth!.personal_monthly_burn ?? 0);
  state.gp_wealth!.last_personal_burn_month = month;
  if (due <= 0) return { due: 0, paid: true };
  const before = cents(state.gp_wealth!.cash ?? 0);
  const paidAmount = cents(Math.min(before, due));
  state.gp_wealth!.cash = cents(before - paidAmount);
  const paid = paidAmount >= due;
  state.gp_wealth!.personal_burn_delinquent = !paid;
  const record: GPSpendRecord = {
    id: new_id(),
    item_id: 'CLUB_MEMBERSHIP',
    date,
    node_id: nodeId(state, date, nodeIndex),
    amount: paidAmount,
    wallet: 'GP_WEALTH',
    source: 'GP_PERSONAL',
    before,
    after: state.gp_wealth!.cash,
    reason: paid ? 'Club/home personal monthly burn' : 'Personal monthly burn unpaid; no management or fund fallback',
    visibility_delta: 0,
    lp_optics_delta: 0,
    media_attention_delta: 0,
  };
  (state.gp_spend_history ??= []).push(record);
  (state.audit_trail ??= []).push({ id: new_id(), date, action: 'GP_PERSONAL_MONTHLY_BURN', wallet: 'GP_CASH', amount: paidAmount, detail: record.reason });
  return { due, paid };
}

function queueAutomaticTeamEvents(state: GameState, date: string): string[] {
  const ids: string[] = [];
  const event = queueTalentTeamEvent(state, 'STAR_JEALOUSY', date);
  if (event?.talent_event_id) ids.push(event.talent_event_id);
  return ids;
}

export function advanceTalentNode(state: GameState, input: AdvanceTalentInput): AdvanceTalentResult {
  ensureTalentState(state);
  syncTalentRoster(state);
  const crossedMonth = monthOf(input.date) !== monthOf(input.previousDate);
  if (crossedMonth) settleGpPersonalBurn(state, input.date, input.nodeIndex);
  const settlementTalentDue = input.settlementRecord?.talent_due ?? 0;
  const settlementTalentPaid = input.settlementRecord?.talent_paid ?? true;
  const queuedRetentionIds: string[] = [];
  for (const entry of state.talent_roster ?? []) {
    if (entry.status === 'RESIGNED') continue;
    entry.active_action_cd = Math.max(0, entry.active_action_cd - 1);
    if (entry.status === 'ACTIVE' && entry.role_id === 'ANALYST') addAnalystEvidenceChain(state, entry, input.date, input.nodeIndex);
    if (settlementTalentDue > 0 && !settlementTalentPaid) {
      entry.status = 'DELINQUENT';
      entry.payroll_arrears = cents((entry.payroll_arrears ?? 0) + entry.monthly_burn);
      entry.loyalty = clamp(entry.loyalty - 10);
      adjustTalentEmployee(state, entry);
      recordTalentHistory(state, { event_id: `PAYROLL_${entry.role_id}_${input.date}`, date: input.date, kind: 'MONTHLY_PAYROLL', role_id: entry.role_id, amount: entry.monthly_burn, detail: `${entry.name} 欠薪：管理现金不足，未向 GP 或 Fund 转嫁。` });
      continue;
    }
    if (entry.status === 'DELINQUENT') {
      entry.status = 'ACTIVE';
      entry.payroll_arrears = 0;
      adjustTalentEmployee(state, entry);
    }
    if (input.highLoad && entry.status === 'ACTIVE') {
      entry.consecutive_high_load_nodes += 1;
      entry.market_heat = clamp(entry.market_heat + 8);
      if ((entry.loyalty < 65 || entry.market_heat > 70) && entry.consecutive_high_load_nodes >= 3) {
        const event = queueRetentionOffer(state, entry, input.date);
        if (event) queuedRetentionIds.push(event.id);
      }
    }
  }
  const queuedTeamEventIds = queueAutomaticTeamEvents(state, input.date);
  economyQuant.refreshStaffSupport(state, input.nodeIndex);
  return { monthly_due: monthlyTalentBurnDue(state), monthly_paid: settlementTalentPaid, queued_retention_ids: queuedRetentionIds, queued_team_event_ids: queuedTeamEventIds };
}

function recipientFactor(recipientType: string): number {
  const value = recipientType.toUpperCase();
  if (/(PUBLIC|OFFICIAL|REGULATOR|AUDITOR|AUDIT|MEDIA_GATEKEEPER|MEDIA_BROKER)/.test(value)) return 3;
  if (/(BANK|SUPPLIER)/.test(value)) return 1;
  return 0;
}

function amountFactor(amount: number): number {
  if (amount <= 500) return 0;
  if (amount <= 2_000) return 1;
  if (amount <= 5_000) return 2;
  return 3;
}

export function evaluateBriberyScore(
  amount: number,
  recipientType = 'ORDINARY_BUSINESS',
  majorDecisionWindow = false,
  quidProQuo: 'NONE' | 'IMPLIED' | 'EXPLICIT' = 'NONE',
): BriberyAssessment {
  const amount_factor = amountFactor(amount);
  const recipient_factor = recipientFactor(recipientType);
  const timing_factor = majorDecisionWindow ? 2 : 0;
  const quid_pro_quo_factor = quidProQuo === 'EXPLICIT' ? 4 : quidProQuo === 'IMPLIED' ? 2 : 0;
  let score = amount_factor + recipient_factor + timing_factor + quid_pro_quo_factor;
  if (recipient_factor === 3 && quidProQuo === 'EXPLICIT') score = Math.max(6, score);
  const classification = score >= 6 ? 'BRIBERY_FLAG' : score >= 3 ? 'GRAY_AREA' : 'GIFT';
  return {
    amount_factor,
    recipient_factor,
    timing_factor,
    quid_pro_quo_factor,
    score,
    classification,
    evidence_delta: classification === 'BRIBERY_FLAG' ? 2 + Math.min(2, Math.max(0, score - 6)) : classification === 'GRAY_AREA' ? 1 : 0,
    compliance_risk_delta: classification === 'BRIBERY_FLAG' ? 20 + Math.min(15, Math.max(0, score - 6) * 3) : classification === 'GRAY_AREA' ? Math.min(12, 5 + Math.max(0, score - 3) * 3) : 0,
  };
}

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

export interface GPSpendResult {
  ok: boolean;
  charged: number;
  before: number;
  after: number;
  reason?: string;
  record?: GPSpendRecord;
  assessment?: BriberyAssessment;
}

function defaultSpendAmount(itemId: GPSpendItemId): number {
  return { PRIVATE_DINNER: 1000, CLUB_MEMBERSHIP: 4000, CHARITY_GALA: 8500, LUXURY_HOME: 30000, PRIVATE_JET: 12000, GIFT: 1000 }[itemId];
}

function spendRange(itemId: GPSpendItemId): [number, number] {
  const range = { PRIVATE_DINNER: [750, 1500], CLUB_MEMBERSHIP: [4000, 4000], CHARITY_GALA: [5000, 12000], LUXURY_HOME: [20000, 40000], PRIVATE_JET: [8000, 20000], GIFT: [300, 5000] }[itemId];
  return [range[0], range[1]];
}

function lpConfidence(state: GameState, input?: number): number {
  if (Number.isFinite(input)) return input as number;
  const profiles = (state.lp_profiles ?? []).map((lp) => lp.confidence_score ?? 100);
  return profiles.length ? Math.min(...profiles) : (state.fund_stats.lp_confidence ?? 100);
}

export function spendGpPersonal(state: GameState, input: GPSpendInput): GPSpendResult {
  ensureTalentState(state);
  const date = input.date ?? state.updated_at?.slice(0, 10) ?? DEFAULT_NODE_DATE;
  const nodeIndex = input.nodeIndex ?? state.game_day_index ?? 0;
  const item = spendCopy(input.item_id);
  const [minimum, maximum] = spendRange(input.item_id);
  const amount = cents(input.amount ?? defaultSpendAmount(input.item_id));
  const before = cents(state.gp_wealth!.cash ?? 0);
  if (amount < minimum || amount > maximum) return { ok: false, charged: 0, before, after: before, reason: `金额必须在 $${minimum}-$${maximum} 范围内。` };
  if (input.item_id === 'CLUB_MEMBERSHIP' && state.gp_wealth!.club_membership_active) return { ok: false, charged: 0, before, after: before, reason: 'CLUB_MEMBERSHIP_ALREADY_ACTIVE' };
  if (input.item_id === 'LUXURY_HOME' && state.gp_wealth!.luxury_home_active) return { ok: false, charged: 0, before, after: before, reason: 'LUXURY_HOME_ALREADY_ACTIVE' };
  if (input.item_id === 'GIFT') {
    const recipient = input.recipient_id ?? '';
    const known = Boolean(state.relationships?.[recipient] || state.character_memories?.[recipient] || (state.gift_ledger ?? []).some((entry) => entry.recipient_id === recipient));
    if (!recipient || !known) return { ok: false, charged: 0, before, after: before, reason: 'GIFT_REQUIRES_EXISTING_RELATIONSHIP' };
  }
  if (before < amount) return { ok: false, charged: 0, before, after: before, reason: 'INSUFFICIENT_GP_CASH' };

  const fundNav = input.fund_nav ?? state.fund_stats.nav ?? state.start_cash;
  const drawdown = input.fund_drawdown_pct ?? state.max_drawdown_pct ?? 0;
  const lpScore = lpConfidence(state, input.lp_confidence);
  const drawdownNode = state.last_significant_drawdown_node;
  const recentDrawdown = drawdown > 10 && (drawdownNode === undefined
    ? input.fund_drawdown_pct !== undefined
    : nodeIndex - drawdownNode >= 0 && nodeIndex - drawdownNode <= 2);
  const priorMediaEvents = (state.gp_spend_history ?? []).filter((record) => record.media_attention_delta > 0).length;
  const visualScale = amount > before * 0.20 || amount > fundNav * 0.10;
  let visibilityDelta = visualScale ? 15 : 0;
  let mediaDelta = 0;
  let opticsDelta = 0;
  if (input.item_id === 'CLUB_MEMBERSHIP') visibilityDelta = Math.max(5, visibilityDelta);
  if (input.item_id === 'LUXURY_HOME') mediaDelta += 5;
  if (input.item_id === 'CHARITY_GALA') mediaDelta += 2;
  if (input.item_id === 'PRIVATE_JET' && priorMediaEvents >= 2) {
    mediaDelta += 10;
    opticsDelta = -5;
  }
  if (['CHARITY_GALA', 'LUXURY_HOME', 'PRIVATE_JET'].includes(input.item_id) && (recentDrawdown || lpScore < 50)) {
    opticsDelta = Math.min(opticsDelta, -10);
  }

  const assessment = input.item_id === 'GIFT'
    ? evaluateBriberyScore(amount, input.recipient_type ?? 'ORDINARY_BUSINESS', Boolean(input.major_decision_window), input.quid_pro_quo ?? 'NONE')
    : undefined;
  state.gp_wealth!.cash = cents(before - amount);
  state.gp_visibility = clamp((state.gp_visibility ?? 0) + visibilityDelta);
  state.lp_optics = clamp((state.lp_optics ?? 0) + opticsDelta, -100, 100);
  state.media_attention = clamp((state.media_attention ?? 0) + mediaDelta);
  if (input.item_id === 'CLUB_MEMBERSHIP') {
    state.gp_wealth!.club_membership_active = true;
    state.gp_wealth!.personal_monthly_burn = cents((state.gp_wealth!.personal_monthly_burn ?? 0) + 500);
  }
  if (input.item_id === 'LUXURY_HOME') {
    state.gp_wealth!.luxury_home_active = true;
    state.gp_wealth!.personal_monthly_burn = cents((state.gp_wealth!.personal_monthly_burn ?? 0) + 1500);
  }
  if (input.item_id === 'PRIVATE_JET') state.gp_wealth!.jet_charter_count = (state.gp_wealth!.jet_charter_count ?? 0) + 1;
  if (input.item_id === 'CHARITY_GALA') state.fund_stats.reputation = clamp((state.fund_stats.reputation ?? 0) + 5);
  if (input.item_id === 'PRIVATE_DINNER') remember(state, input.recipient_id ?? 'gp_network', date, 'GP 私人晚宴建立了新的关系记忆入口；未产生内幕信息。');
  if (input.item_id === 'GIFT') {
    const relationship = state.relationships?.[input.recipient_id!];
    const relationshipDelta = Math.min(8, 2 + Math.floor(amount / 800));
    if (relationship) {
      relationship.favor = clamp((relationship.favor ?? 0) + relationshipDelta);
      relationship.trust = clamp((relationship.trust ?? 0) + relationshipDelta * 0.5);
    }
    const gift = {
      id: new_id(),
      date,
      node_id: nodeId(state, date, nodeIndex),
      recipient_id: input.recipient_id!,
      recipient_type: input.recipient_type ?? 'ORDINARY_BUSINESS',
      amount,
      bribery_score: assessment!.score,
      classification: assessment!.classification,
      quid_pro_quo: input.quid_pro_quo ?? 'NONE',
      evidence_added: assessment!.evidence_delta,
      compliance_risk_added: assessment!.compliance_risk_delta,
    };
    (state.gift_ledger ??= []).push(gift);
    if (assessment!.classification !== 'GIFT') {
      addComplianceEvidence(state, date, assessment!.evidence_delta, assessment!.compliance_risk_delta, `GP 礼物 ${input.recipient_id} 判定为 ${assessment!.classification}，score=${assessment!.score}。`, assessment!.classification === 'BRIBERY_FLAG');
      if (assessment!.classification === 'BRIBERY_FLAG') {
        (state.bribery_flags ??= []).push(`BRIBERY_FLAG:${gift.id}`);
        appendImmutableEvidence(state, { date, action_id: `BRIBERY_FLAG:${gift.id}`, category: 'BRIBERY', evidence_points: assessment!.evidence_delta, fact: `Gift to ${input.recipient_id}: score ${assessment!.score}; facts cannot be whitewashed.`, truth_state: 'VERIFIED' });
      }
    }
  }
  const record: GPSpendRecord = {
    id: new_id(),
    item_id: input.item_id,
    date,
    node_id: nodeId(state, date, nodeIndex),
    amount,
    wallet: 'GP_WEALTH',
    source: 'GP_PERSONAL',
    before,
    after: state.gp_wealth!.cash,
    reason: `${item.name_cn}：${item.gameplay_unlocked}`,
    visibility_delta: visibilityDelta,
    lp_optics_delta: opticsDelta,
    media_attention_delta: mediaDelta,
    bribery_score: assessment?.score,
  };
  (state.gp_spend_history ??= []).push(record);
  (state.audit_trail ??= []).push({ id: new_id(), date, action: 'GP_PERSONAL_SPEND', wallet: 'GP_CASH', amount, detail: `${input.item_id} · ${record.reason}` });
  return { ok: true, charged: amount, before, after: state.gp_wealth!.cash, record, assessment };
}

export function getGpSpendOptions(): GPItemCopy[] {
  return GP_SPEND_ITEMS.map((item) => ({ ...item }));
}

export const ensure_talent_state = ensureTalentState;
export const sync_talent_roster = syncTalentRoster;
export const hire_talent = hireTalent;
export const monthly_talent_burn_due = monthlyTalentBurnDue;
export const get_talent_passives = getTalentPassives;
export const use_talent_action = useTalentAction;
export const resolve_talent_retention = resolveTalentRetention;
export const queue_talent_team_event = queueTalentTeamEvent;
export const resolve_talent_team_event = resolveTalentTeamEvent;
export const advance_talent_node = advanceTalentNode;
export const settle_gp_personal_burn = settleGpPersonalBurn;
export const evaluate_bribery_score = evaluateBriberyScore;
export const spend_gp_personal = spendGpPersonal;
export const get_gp_spend_options = getGpSpendOptions;
