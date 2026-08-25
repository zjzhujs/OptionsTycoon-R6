import intelCopy from '../data/economy_copy/intel_copy.json';
import { new_id } from '../ids';
import type { EconomySettlementRecord, GameState, HumanActionChoice, HumanActionEvent, IntelState, IntelTier } from '../schemas';
import { ensureEconomyState, isCashPreservation, settleMonth } from './economy_core';

type TierCopy = {
  tier_id: IntelTier | 'SHADOW';
  name_cn: string;
  name_en: string;
  monthly_cost: number;
  lead_time_nodes: number;
  info_target: number;
  summary_pitch: string;
  risk_note: string;
  capability_unlocked: string;
  source_count_desc: string;
};

type GrayChoiceCopy = {
  choice_id: string;
  label: string;
  action_cost_desc: string;
  feedback_text: string;
  risk_impact_summary: string;
};

type GrayEventCopy = {
  event_id: string;
  title: string;
  description: string;
  trigger_conditions: string;
  choices: GrayChoiceCopy[];
};

export const INTEL_TIERS = intelCopy.subscription_tiers as TierCopy[];
export const INTEL_GRAY_EVENTS = intelCopy.gray_events as GrayEventCopy[];

const tierById = (id: IntelTier | 'SHADOW'): TierCopy => {
  const tier = INTEL_TIERS.find((candidate) => candidate.tier_id === id);
  if (!tier) throw new Error(`Unknown intel tier: ${id}`);
  return tier;
};

const monthOf = (date: string): string => date.slice(0, 7);
const clampNetwork = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
const cents = (value: number): number => Math.round(value * 100) / 100;

export function createIntelState(seed: number): IntelState {
  return {
    tier: 'OFF',
    shadow_enabled: false,
    info_network: 0,
    target: 0,
    paid_through_month: null,
    effective_after_node: 0,
    source_history: [],
    active_leads: [],
    misinfo_seed: seed,
    delinquent_nodes: 0,
    network_cold: false,
    cold_start_until_node: 0,
    status: 'OFF',
    generated_gray_event_ids: [],
  };
}

export function ensureIntelState(state: GameState): IntelState {
  state.intel ??= createIntelState(state.story_seed);
  state.intel.source_history ??= [];
  state.intel.active_leads ??= [];
  state.intel.generated_gray_event_ids ??= [];
  state.intel.delinquent_nodes ??= 0;
  state.intel.network_cold ??= false;
  state.intel.cold_start_until_node ??= 0;
  return state.intel;
}

export function intelMonthlyCost(intel: IntelState): number {
  const base = tierById(intel.tier).monthly_cost;
  return base + (intel.shadow_enabled ? tierById('SHADOW').monthly_cost : 0);
}

export interface SubscribeIntelResult {
  ok: boolean;
  charged: number;
  afterBalance: number;
  reason?: 'INSUFFICIENT_MANAGEMENT_CASH' | 'SHADOW_REQUIRES_ELITE' | 'CASH_PRESERVATION';
}

export function subscribeIntel(
  state: GameState,
  tier: IntelTier,
  shadowEnabled: boolean,
  date: string,
  nodeIndex: number,
): SubscribeIntelResult {
  const economy = ensureEconomyState(state);
  const intel = ensureIntelState(state);
  if (shadowEnabled && tier !== 'ELITE') {
    return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'SHADOW_REQUIRES_ELITE' };
  }
  const monthly = tierById(tier).monthly_cost + (shadowEnabled ? tierById('SHADOW').monthly_cost : 0);
  const reconnect = intel.network_cold && tier !== 'OFF' ? 200 : 0;
  const charge = monthly + reconnect;
  if (economy.management_cash < charge) {
    return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'INSUFFICIENT_MANAGEMENT_CASH' };
  }
  if (tier !== 'OFF' && isCashPreservation(state)) {
    return { ok: false, charged: 0, afterBalance: economy.management_cash, reason: 'CASH_PRESERVATION' };
  }

  economy.management_cash = cents(economy.management_cash - charge);
  intel.tier = tier;
  intel.shadow_enabled = shadowEnabled;
  intel.paid_through_month = tier === 'OFF' ? null : monthOf(date);
  intel.delinquent_nodes = 0;
  const delay = tier === 'OFF' ? 0 : tier === 'BASIC' ? 1 : tier === 'PRO' ? 2 : 3;
  intel.effective_after_node = nodeIndex + delay + (reconnect > 0 ? 1 : 0);
  intel.cold_start_until_node = reconnect > 0 ? nodeIndex + 1 : 0;
  intel.network_cold = false;
  intel.status = tier === 'OFF' ? 'OFF' : 'PENDING';
  intel.target = 0;
  economy.monthly_burn = monthly;
  state.audit_trail!.push({
    id: new_id(),
    date,
    action: tier === 'OFF' ? 'INTEL_CANCELLED' : 'INTEL_SUBSCRIBED',
    wallet: 'MANAGEMENT_CASH',
    amount: charge,
    detail: `${tier}${shadowEnabled ? '+SHADOW' : ''}`,
  });
  return { ok: true, charged: charge, afterBalance: economy.management_cash };
}

export interface AdvanceIntelInput {
  date: string;
  previousDate: string;
  nodeIndex: number;
  fundNav: number;
  /** P1 quant desk burn is settled in the same atomic monthly ledger entry. */
  quantMonthlyCost?: number;
  /** P1 talent retainer burn shares the same management-cash settlement. */
  talentMonthlyCost?: number;
  /** Reuse the already-created monthly ledger row when the caller settles once. */
  settlementRecord?: EconomySettlementRecord | null;
}

/** Node order is fixed: deduct -> suspend/downgrade -> target -> generate intel. */
export function advanceIntelNode(state: GameState, input: AdvanceIntelInput): EconomySettlementRecord | null {
  const intel = ensureIntelState(state);
  const currentMonth = monthOf(input.date);
  const crossedMonth = currentMonth !== monthOf(input.previousDate);
  let settlement: EconomySettlementRecord | null = null;

  if (crossedMonth) {
    const due = intelMonthlyCost(intel);
    const result = input.settlementRecord
      ? { record: input.settlementRecord, duplicate: true }
      : settleMonth(state, {
        settlementId: `month:${currentMonth}`,
        monthId: currentMonth,
        date: input.date,
        fundNav: input.fundNav,
        intelMonthlyCost: due,
        quantMonthlyCost: input.quantMonthlyCost ?? 0,
        talentMonthlyCost: input.talentMonthlyCost ?? 0,
      });
    settlement = result.record;
    if (result.record.intel_paid && due > 0) intel.paid_through_month = currentMonth;
  }

  const paid = intel.tier === 'OFF' || intel.paid_through_month === currentMonth;
  if (paid && intel.network_cold && intel.cold_start_until_node <= 0) {
    // A re-funded network does not snap back to full information instantly.
    intel.cold_start_until_node = input.nodeIndex + 1;
  }
  const effective = input.nodeIndex >= intel.effective_after_node && input.nodeIndex >= intel.cold_start_until_node;
  if (intel.tier === 'OFF') intel.status = 'OFF';
  else if (!paid) intel.status = intel.network_cold ? 'COLD' : 'SUSPENDED';
  else if (!effective) intel.status = 'PENDING';
  else intel.status = 'ACTIVE';

  if (intel.status === 'ACTIVE') {
    if (intel.network_cold) {
      intel.network_cold = false;
      intel.cold_start_until_node = 0;
    }
    intel.target = intel.shadow_enabled ? 85 : tierById(intel.tier).info_target;
    intel.info_network = clampNetwork(intel.info_network + (intel.target - intel.info_network) * 0.20);
    intel.delinquent_nodes = 0;
    generateCurrentNodeSource(intel, input.date, input.nodeIndex);
  } else {
    intel.target = 0;
    intel.info_network = clampNetwork((intel.info_network - 4) * 0.80);
    if (intel.tier !== 'OFF' && !paid) {
      intel.delinquent_nodes += 1;
      if (intel.delinquent_nodes >= 3) {
        intel.network_cold = true;
        intel.status = 'COLD';
      }
    }
  }
  intel.active_leads = intel.active_leads.filter((lead) => lead.expires_after_node >= input.nodeIndex);
  queueEligibleGrayEvents(state, input.date);
  return settlement;
}

function queueEligibleGrayEvents(state: GameState, date: string): void {
  const intel = ensureIntelState(state);
  if (intel.status !== 'ACTIVE') return;
  const candidates: Array<[string, boolean]> = [
    ['EVT_INTEL_GRAY_SUPPLIER_CFO', intel.shadow_enabled && intel.info_network >= 55],
    ['EVT_INTEL_GRAY_ANALYST_DRAFT', intel.info_network >= 60],
    ['EVT_INTEL_GRAY_POLICY_TARIFF', intel.shadow_enabled && intel.info_network >= 65],
  ];
  for (const [eventId, eligible] of candidates) {
    if (!eligible || intel.generated_gray_event_ids.includes(eventId)) continue;
    const event = createGrayIntelEvent(eventId, date);
    if (!event) continue;
    (state.human_action_events ??= []).push(event);
    intel.generated_gray_event_ids.push(eventId);
  }
}

function generateCurrentNodeSource(intel: IntelState, date: string, nodeIndex: number): void {
  if (intel.source_history.some((entry) => entry.node_index === nodeIndex)) return;
  const shadow = intel.shadow_enabled;
  const sourceCount = intel.tier === 'BASIC' ? 2 : intel.tier === 'PRO' ? 2 : 3;
  const baseReliability = shadow ? 82 : intel.tier === 'BASIC' ? 68 : intel.tier === 'PRO' ? 78 : 88;
  const crossValidated = sourceCount >= 2 && !shadow;
  intel.source_history.push({
    id: new_id(),
    date,
    node_index: nodeIndex,
    tier: shadow ? 'SHADOW' : intel.tier,
    source_count: sourceCount,
    reliability: crossValidated ? Math.min(96, Math.round(100 - (100 - baseReliability) * 0.55)) : baseReliability,
    truth_state: crossValidated ? 'CROSS_VALIDATED' : 'UNVERIFIED',
    summary: tierById(shadow ? 'SHADOW' : intel.tier).summary_pitch,
  });
}

type GrayEffect = {
  wallet?: 'GP_WEALTH';
  cost: number;
  risk: number;
  evidence: number;
  legality: HumanActionChoice['legality_class'];
  category: HumanActionChoice['immutable_evidence_category'];
  flag?: string;
};

const GRAY_EFFECTS: Record<string, GrayEffect[]> = {
  EVT_INTEL_GRAY_SUPPLIER_CFO: [
    { cost: 0, risk: -2, evidence: 0, legality: 'LEGAL', category: 'PROCEDURAL' },
    { wallet: 'GP_WEALTH', cost: 600, risk: 18, evidence: 12, legality: 'MNPI_RISK', category: 'OTHER' },
    { wallet: 'GP_WEALTH', cost: 1500, risk: 35, evidence: 28, legality: 'MNPI_RISK', category: 'MNPI', flag: 'MNPI_SUPPLIER_CFO' },
  ],
  EVT_INTEL_GRAY_ANALYST_DRAFT: [
    { cost: 0, risk: -3, evidence: 2, legality: 'LEGAL', category: 'PROCEDURAL' },
    { cost: 0, risk: 10, evidence: 8, legality: 'MNPI_RISK', category: 'MNPI', flag: 'MNPI_ANALYST_DRAFT' },
    { cost: 0, risk: 28, evidence: 22, legality: 'ILLEGAL', category: 'MNPI', flag: 'MNPI_FRONT_RUN' },
  ],
  EVT_INTEL_GRAY_POLICY_TARIFF: [
    { cost: 0, risk: 0, evidence: 0, legality: 'LEGAL', category: 'PROCEDURAL' },
    { wallet: 'GP_WEALTH', cost: 900, risk: 16, evidence: 10, legality: 'MNPI_RISK', category: 'OTHER' },
    { wallet: 'GP_WEALTH', cost: 2500, risk: 40, evidence: 35, legality: 'ILLEGAL', category: 'EXTORTION_RISK', flag: 'POLICY_EXTORTION_RISK' },
  ],
};

/** Builds the three approved gray events from the AVG copy package without altering market odds or prices. */
export function createGrayIntelEvent(eventId: string, date: string): HumanActionEvent | null {
  const copy = INTEL_GRAY_EVENTS.find((candidate) => candidate.event_id === eventId);
  const effects = GRAY_EFFECTS[eventId];
  if (!copy || !effects) return null;
  return {
    id: `${eventId}_${date}`,
    date,
    action_kind: 'MNPI_DECISION',
    character_id: 'marcus_reed',
    headline: copy.title,
    body: copy.description,
    choices: copy.choices.map((choice, index) => {
      const effect = effects[index];
      return {
        id: choice.choice_id,
        label: choice.label,
        cost_usd: effect.cost,
        favor_delta: 0,
        morale_delta: 0,
        reputation_delta: 0,
        result_narrative: choice.feedback_text,
        wallet: effect.wallet,
        legality_class: effect.legality,
        evidence_points_delta: effect.evidence,
        compliance_risk_delta: effect.risk,
        immutable_evidence_category: effect.category,
        immutable_flag: effect.flag,
        intel_truth_state: 'UNVERIFIED',
        unlocks_intel: effect.evidence > 0 ? {
          title: copy.title,
          summary: copy.description,
          reliability: 'PARTIAL',
          truth_state: 'UNVERIFIED',
        } : null,
      };
    }),
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
  };
}
