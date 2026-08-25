import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';
import * as talent from '../engines/economy_talent';
import * as quant from '../engines/economy_quant';
import { ensureEconomyState } from '../engines/economy_core';
import type { TalentRoleId } from '../schemas';

beforeEach(() => {
  localStorage.clear();
});

function fresh() {
  const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', start_cash: 100_000, story_seed: 83 });
  const state = game.get_session(view.state.session_id);
  ensureEconomyState(state);
  state.economy!.management_cash = 100_000;
  state.economy!.gp_cash = 100_000;
  state.gp_wealth!.cash = 100_000;
  state.human_action_events = [];
  return state;
}

describe('Batch C talent retainers and GP personal wealth', () => {
  it('signs all five roles from management cash and charges their exact monthly burn', () => {
    const state = fresh();
    const fundBefore = state.cash;
    const gpBefore = state.economy!.gp_cash;
    const roles: Array<[TalentRoleId, number, number]> = [
      ['ANALYST', 2_000, 900],
      ['QUANT', 4_000, 1_500],
      ['COUNSEL', 3_500, 1_300],
      ['CRISIS_PR', 2_500, 1_100],
      ['EX_REG', 6_000, 2_200],
    ];

    for (const [role, signing, monthly] of roles) {
      const result = talent.hireTalent(state, role, role, '2025-01-23');
      expect(result.ok).toBe(true);
      expect(result.charged).toBe(signing);
      expect(result.roster?.monthly_burn).toBe(monthly);
    }

    expect(state.economy!.management_cash).toBe(82_000);
    expect(talent.monthlyTalentBurnDue(state)).toBe(7_000);
    expect(state.cash).toBe(fundBefore);
    expect(state.economy!.gp_cash).toBe(gpBefore);
    expect(state.audit_trail?.filter((entry) => entry.action === 'TALENT_SIGNING')).toHaveLength(5);
  });

  it('maps the QUANT retainer into the existing two-node quant grace path', () => {
    const state = fresh();
    const hired = talent.hireTalent(state, 'QUANT', 'Quant specialist', '2025-01-23');
    expect(hired.ok).toBe(true);
    expect(quant.purchaseQuantTier(state, 'T1', '2025-01-23').ok).toBe(true);
    expect(quant.purchaseQuantTier(state, 'T2', '2025-01-23').ok).toBe(true);

    const employeeId = hired.roster!.employee_id;
    game.fire_employee(state.session_id, employeeId);

    expect(state.talent_roster?.find((entry) => entry.role_id === 'QUANT')?.status).toBe('RESIGNED');
    expect(state.quant_infra?.grace_nodes_left).toBe(2);
    expect(state.quant_infra?.status).toBe('GRACE');
  });

  it('uses the outside-offer formula after three high-load nodes instead of a fixed stay fee', () => {
    const state = fresh();
    talent.hireTalent(state, 'ANALYST', 'Analyst', '2025-01-23');
    const entry = state.talent_roster!.find((candidate) => candidate.role_id === 'ANALYST')!;
    entry.loyalty = 50;

    for (let i = 0; i < 3; i += 1) {
      talent.advanceTalentNode(state, {
        date: `2025-01-${24 + i}`,
        previousDate: `2025-01-${23 + i}`,
        nodeIndex: i + 1,
        highLoad: true,
      });
    }

    const event = state.human_action_events?.find((candidate) => candidate.action_kind === 'TALENT_RETENTION_EVENT');
    expect(event).toBeDefined();
    expect(entry.outside_offer_value).toBe(5_400);
    const before = state.economy!.management_cash;
    const result = talent.resolveTalentRetention(state, 'ANALYST', 'MATCH', '2025-01-26');

    expect(result.ok).toBe(true);
    expect(result.value?.charged).toBe(1_890);
    expect(state.economy!.management_cash).toBe(before - 1_890);
    expect(state.economy!.management_cash).not.toBe(before - 25_000);
  });

  it('keeps talent abilities in the evidence/risk lane and marks missing real input unavailable', () => {
    const state = fresh();
    const actions: Array<[TalentRoleId, 'DEEP_DIVE' | 'MODEL_AUDIT' | 'PRIVILEGED_REVIEW' | 'SHAPE_NARRATIVE' | 'REGULATORY_MAP', string]> = [
      ['ANALYST', 'DEEP_DIVE', 'NVDA'],
      ['QUANT', 'MODEL_AUDIT', ''],
      ['COUNSEL', 'PRIVILEGED_REVIEW', ''],
      ['CRISIS_PR', 'SHAPE_NARRATIVE', ''],
      ['EX_REG', 'REGULATORY_MAP', ''],
    ];
    for (const [role] of actions) talent.hireTalent(state, role, role, '2025-01-23');

    let quantResult: ReturnType<typeof talent.useTalentAction> | undefined;
    for (const [role, action, target] of actions) {
      const result = talent.useTalentAction(state, role, action, '2025-01-23', target);
      expect(result.ok).toBe(true);
      if (role === 'QUANT') quantResult = result;
      const output = JSON.stringify(result.value);
      expect(output).not.toMatch(/BUY|SELL|win.?rate|accuracy/i);
    }
    expect(quantResult?.value?.data_status).toBe('DATA_UNAVAILABLE');
    expect(talent.useTalentAction(state, 'QUANT', 'MODEL_AUDIT', '2025-01-23').reason).toBe('ACTION_ON_COOLDOWN');
  });

  it('resolves the three team events with management-only costs and immutable conflict evidence', () => {
    const state = fresh();
    for (const role of ['ANALYST', 'QUANT', 'COUNSEL', 'EX_REG'] as TalentRoleId[]) {
      talent.hireTalent(state, role, role, '2025-01-23');
    }
    const analyst = state.talent_roster!.find((entry) => entry.role_id === 'ANALYST')!;
    const quantEntry = state.talent_roster!.find((entry) => entry.role_id === 'QUANT')!;
    analyst.retention_bonus_total = analyst.monthly_burn * 12 * 0.4;
    quantEntry.loyalty = 50;

    const jealousy = talent.queueTalentTeamEvent(state, 'STAR_JEALOUSY', '2025-01-23')!;
    expect(talent.resolveTalentTeamEvent(state, jealousy.id, 'B_PRIVATE_BONUS', '2025-01-23').ok).toBe(true);
    const conflict = talent.queueTalentTeamEvent(state, 'CONFLICT_OF_INTEREST', '2025-01-24')!;
    expect(talent.resolveTalentTeamEvent(state, conflict.id, 'C_PUSH_THROUGH', '2025-01-24').ok).toBe(true);
    const dispute = talent.queueTalentTeamEvent(state, 'ANALYST_VS_QUANT', '2025-01-25')!;
    expect(talent.resolveTalentTeamEvent(state, dispute.id, 'A_HOLD_FORMAL_IC', '2025-01-25').ok).toBe(true);

    expect(state.talent_team_events?.every((event) => event.resolved)).toBe(true);
    expect(state.fund_stats.compliance_risk).toBeGreaterThanOrEqual(12);
    expect(state.evidence_state?.records.some((record) => record.category === 'TALENT_CONFLICT')).toBe(true);
    expect(state.cash).toBe(100_000);
  });

  it('charges all six GP items only to GP wealth and settles personal recurring burn there', () => {
    const state = fresh();
    const recipient = Object.keys(state.relationships ?? {})[0];
    const fundBefore = state.cash;
    const managementBefore = state.economy!.management_cash;
    const spends = [
      { item_id: 'PRIVATE_DINNER' as const, amount: 750 },
      { item_id: 'CLUB_MEMBERSHIP' as const, amount: 4_000 },
      { item_id: 'CHARITY_GALA' as const, amount: 5_000 },
      { item_id: 'LUXURY_HOME' as const, amount: 20_000 },
      { item_id: 'PRIVATE_JET' as const, amount: 8_000 },
      { item_id: 'GIFT' as const, amount: 300, recipient_id: recipient },
    ];
    for (const input of spends) expect(talent.spendGpPersonal(state, { ...input, date: '2025-01-23' }).ok).toBe(true);

    expect(state.gp_spend_history).toHaveLength(6);
    expect(state.gift_ledger).toHaveLength(1);
    expect(state.gp_wealth!.personal_monthly_burn).toBe(2_000);
    expect(state.economy!.management_cash).toBe(managementBefore);
    expect(state.cash).toBe(fundBefore);

    const gpBeforeBurn = state.economy!.gp_cash;
    const burn = talent.settleGpPersonalBurn(state, '2025-02-01', 9);
    expect(burn).toEqual({ due: 2_000, paid: true });
    expect(state.economy!.gp_cash).toBe(gpBeforeBurn - 2_000);
  });

  it('scores public explicit gifts as BRIBERY_FLAG and preserves the immutable audit trail', () => {
    const state = fresh();
    const recipient = Object.keys(state.relationships ?? {})[0];
    const score = talent.evaluateBriberyScore(6_000, 'PUBLIC_REGULATOR', true, 'EXPLICIT');
    expect(score).toMatchObject({ amount_factor: 3, recipient_factor: 3, timing_factor: 2, quid_pro_quo_factor: 4, classification: 'BRIBERY_FLAG' });
    const result = talent.spendGpPersonal(state, {
      item_id: 'GIFT',
      amount: 5_000,
      recipient_id: recipient,
      recipient_type: 'PUBLIC_REGULATOR',
      major_decision_window: true,
      quid_pro_quo: 'EXPLICIT',
      date: '2025-01-23',
    });
    expect(result.ok).toBe(true);
    expect(result.assessment?.classification).toBe('BRIBERY_FLAG');
    expect(state.bribery_flags?.some((flag) => flag.startsWith('BRIBERY_FLAG:'))).toBe(true);
    expect(state.evidence_ledger?.some((entry) => entry.category === 'BRIBERY')).toBe(true);
  });

  it('persists talent roster and GP ledgers through save/load', () => {
    const state = fresh();
    talent.hireTalent(state, 'COUNSEL', 'Counsel', '2025-01-23');
    const recipient = Object.keys(state.relationships ?? {})[0];
    talent.spendGpPersonal(state, { item_id: 'GIFT', amount: 300, recipient_id: recipient, date: '2025-01-23' });
    game.save_game(state.session_id, 'batch-c-talent');

    const loaded = game.load_game('batch-c-talent');
    expect(loaded.state.talent_roster?.some((entry) => entry.role_id === 'COUNSEL')).toBe(true);
    expect(loaded.state.gp_spend_history).toHaveLength(1);
    expect(loaded.state.gift_ledger).toHaveLength(1);
  });
});
