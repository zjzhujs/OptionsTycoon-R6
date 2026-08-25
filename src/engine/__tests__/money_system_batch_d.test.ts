import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';
import { ensureEconomyState, injectGpCapital, settleMonth } from '../engines/economy_core';
import { advanceIntelNode, ensureIntelState, subscribeIntel } from '../engines/economy_intel';
import { advanceQuantNode, purchaseQuantTier } from '../engines/economy_quant';
import { advanceTalentNode, ensureTalentState, hireTalent } from '../engines/economy_talent';
import { executeCrisisAction, ensureCrisisState } from '../engines/economy_legal';

beforeEach(() => localStorage.clear());

function fresh(startCash = 100_000) {
  const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', start_cash: startCash, story_seed: 8081 });
  return game.get_session(view.state.session_id);
}

describe('money system Batch D legal/investigation/LP integration', () => {
  it('settles one month deterministically by priority and never produces negative management cash', () => {
    const state = fresh();
    state.economy!.management_cash = 1_000;
    const fundBefore = state.cash;
    const input = {
      settlementId: 'month:2025-02',
      monthId: '2025-02',
      date: '2025-02-03',
      fundNav: 0,
      talentMonthlyCost: 600,
      legalMonthlyCost: 300,
      quantMonthlyCost: 300,
      intelMonthlyCost: 300,
      prMonthlyCost: 200,
    };
    const first = settleMonth(state, input);

    expect(first.record.talent_paid).toBe(true);
    expect(first.record.legal_paid).toBe(true);
    expect(first.record.quant_paid).toBe(false);
    expect(first.record.intel_paid).toBe(false);
    expect(first.record.pr_paid).toBe(false);
    expect(state.economy!.management_cash).toBe(100);
    expect(state.economy!.management_cash).toBeGreaterThanOrEqual(0);
    expect(state.cash).toBe(fundBefore);

    const balance = state.economy!.management_cash;
    const duplicate = settleMonth(state, input);
    expect(duplicate.duplicate).toBe(true);
    expect(state.economy!.management_cash).toBe(balance);
  });

  it('keeps legal spending out of Fund NAV and requires an explicit GP transfer', () => {
    const state = fresh();
    const fundBefore = state.cash;
    state.economy!.management_cash = 100;
    state.economy!.gp_cash = 5_000;
    state.management_company!.monthly_burn = 125;
    const blocked = executeCrisisAction(state, 'OUTSIDE_COUNSEL', { date: '2025-01-23', nodeIndex: 0 });
    expect(blocked.ok).toBe(false);
    expect(state.cash).toBe(fundBefore);

    expect(injectGpCapital(state, 2_000, '2025-01-23')).toBe(true);
    const result = executeCrisisAction(state, 'OUTSIDE_COUNSEL', { date: '2025-01-23', nodeIndex: 0 });
    expect(result.ok).toBe(true);
    expect(state.cash).toBe(fundBefore);
    expect(state.economy!.transfer_ledger[state.economy!.transfer_ledger.length - 1]?.from_wallet).toBe('GP_CASH');
    expect(state.economy!.management_cash).toBe(100);
  });

  it('enters CASH_PRESERVATION and blocks new hire, quant, intel, counsel, and PR actions', () => {
    const state = fresh();
    state.economy!.management_cash = 3_000;
    state.economy!.monthly_burn = 5_000;
    state.management_company!.monthly_burn = 5_000;
    ensureCrisisState(state);

    expect(state.cash_preservation).toBe(true);
    expect(hireTalent(state, 'COUNSEL', '', '2025-01-23').reason).toBe('CASH_PRESERVATION');
    expect(purchaseQuantTier(state, 'T1', '2025-01-23').reason).toBe('CASH_PRESERVATION');
    expect(subscribeIntel(state, 'PRO', false, '2025-01-23', 0).reason).toBe('CASH_PRESERVATION');
    expect(executeCrisisAction(state, 'OUTSIDE_COUNSEL', { date: '2025-01-23', nodeIndex: 0 }).reason).toBe('CASH_PRESERVATION');
    expect(executeCrisisAction(state, 'PUBLIC_RESPONSE', { date: '2025-01-23', nodeIndex: 0 }).reason).toBe('CASH_PRESERVATION');
  });

  it('applies partial payment in priority order while leaving lower services unpaid', () => {
    const state = fresh();
    state.economy!.management_cash = 1_250;
    const result = settleMonth(state, {
      settlementId: 'month:2025-03',
      monthId: '2025-03',
      date: '2025-03-03',
      fundNav: 0,
      talentMonthlyCost: 1_000,
      quantMonthlyCost: 500,
      intelMonthlyCost: 250,
    });

    expect(result.record.talent_paid).toBe(true);
    expect(result.record.quant_paid).toBe(false);
    expect(result.record.intel_paid).toBe(false);
    expect(state.economy!.management_cash).toBe(250);
    expect(state.economy!.settlement_ledger).toHaveLength(1);
  });

  it('improves lawful damage metrics without changing immutable evidence or flags', () => {
    const state = fresh();
    const economy = ensureEconomyState(state);
    economy.management_cash = 10_000;
    economy.monthly_burn = 0;
    state.management_company!.monthly_burn = 0;
    state.evidence_ledger = [{ id: 'evidence-1', date: '2025-01-22', action_id: 'MNPI_X', category: 'MNPI', evidence_points: 12, fact: 'Recorded fact', truth_state: 'VERIFIED' }];
    state.mnpi_flags = ['MNPI_X'];
    state.bribery_flags = ['BRIBERY_X'];
    state.compliance_state = { scrutiny: 45 };
    state.fund_stats.compliance_risk = 45;
    const evidenceBefore = JSON.stringify(state.evidence_ledger);
    const mnpiBefore = [...state.mnpi_flags];
    const briberyBefore = [...state.bribery_flags];

    const legal = executeCrisisAction(state, 'OUTSIDE_COUNSEL', { date: '2025-01-23', nodeIndex: 0 });
    const lp = executeCrisisAction(state, 'LP_COMMUNICATION', { date: '2025-01-23', nodeIndex: 0, disclosureComplete: true, admitError: true });
    expect(legal.ok).toBe(true);
    expect(lp.ok).toBe(true);
    expect(state.legal_defense_quality).toBeGreaterThan(0);
    expect(state.fund_stats.lp_confidence).toBeGreaterThan(0);
    expect(JSON.stringify(state.evidence_ledger)).toBe(evidenceBefore);
    expect(state.mnpi_flags).toEqual(mnpiBefore);
    expect(state.bribery_flags).toEqual(briberyBefore);
  });

  it('persists crisis cooldowns, evidence, and money infrastructure through save/load', () => {
    const state = fresh();
    state.economy!.management_cash = 20_000;
    state.management_company!.monthly_burn = 0;
    purchaseQuantTier(state, 'T1', '2025-01-23');
    executeCrisisAction(state, 'OUTSIDE_COUNSEL', { date: '2025-01-23', nodeIndex: 0 });
    state.evidence_ledger!.push({ id: 'evidence-save', date: '2025-01-23', action_id: 'BRIBERY_X', category: 'BRIBERY', evidence_points: 4, fact: 'Saved immutable fact', truth_state: 'VERIFIED' });
    game.save_game(state.session_id, 'money-d');

    const loaded = game.load_game('money-d').state;
    expect(loaded.quant_infra!.purchased_tier).toBe('T1');
    expect(loaded.crisis_actions!.find((entry) => entry.action_id === 'OUTSIDE_COUNSEL')!.last_used_node).toBe(0);
    expect(loaded.evidence_ledger!.some((entry) => entry.id === 'evidence-save')).toBe(true);
    expect(loaded.economy!.management_cash).toBe(state.economy!.management_cash);
  });

  it('does not double-charge or duplicate a monthly settlement', () => {
    const state = fresh();
    state.economy!.management_cash = 8_000;
    const input = { settlementId: 'month:2025-04', monthId: '2025-04', date: '2025-04-01', fundNav: 0, intelMonthlyCost: 300, quantMonthlyCost: 250 };
    const first = settleMonth(state, input);
    const balance = state.economy!.management_cash;
    const second = settleMonth(state, input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(state.economy!.management_cash).toBe(balance);
    expect(state.economy!.settlement_ledger.filter((entry) => entry.settlement_id === input.settlementId)).toHaveLength(1);
  });

  it('recovers arrears and purchased quant after funding, while intel cold-starts instead of snapping back', () => {
    const state = fresh();
    ensureTalentState(state);
    ensureIntelState(state);
    state.economy!.management_cash = 100;
    state.economy!.gp_cash = 20_000;
    state.economy!.monthly_burn = 0;
    state.management_company!.monthly_burn = 0;
    const talent = {
      role_id: 'ANALYST' as const,
      employee_id: 'analyst-1',
      name: 'Analyst One',
      status: 'ACTIVE' as const,
      loyalty: 80,
      monthly_burn: 1_000,
      signing_cost: 2_000,
      retention_bonus_total: 0,
      market_heat: 0,
      outside_offer_value: 6_000,
      conflict_tags: [],
      active_action_cd: 0,
      last_used_node: null,
      consecutive_high_load_nodes: 0,
      hired_date: '2025-01-23',
      grace_nodes_left: 0,
    };
    state.talent_roster = [talent];
    state.employees = [
      { id: 'analyst-1', name: 'Analyst One', role: 'SENIOR_ANALYST', salary_annual: 12_000, hired_date: '2025-01-23' },
      { id: 'quant-1', name: 'Quant One', role: 'QUANT_RESEARCHER', salary_annual: 12_000, hired_date: '2025-01-23' },
    ];
    state.quant_infra!.purchased_tier = 'T1';
    state.quant_infra!.effective_tier = 'T1';
    state.quant_infra!.staff_supported_tier = 'T1';
    state.quant_infra!.monthly_burn = 250;
    state.intel!.tier = 'PRO';
    state.intel!.paid_through_month = '2025-01';
    state.intel!.effective_after_node = 0;
    state.intel!.info_network = 70;

    const february = settleMonth(state, {
      settlementId: 'month:2025-02',
      monthId: '2025-02',
      date: '2025-02-03',
      fundNav: 0,
      talentMonthlyCost: 1_000,
      quantMonthlyCost: 250,
      intelMonthlyCost: 300,
    }).record;
    expect(february.talent_paid).toBe(false);
    expect(february.quant_paid).toBe(false);
    expect(february.intel_paid).toBe(false);
    advanceTalentNode(state, { date: '2025-02-03', previousDate: '2025-01-31', nodeIndex: 1, settlementRecord: february });
    advanceQuantNode(state, { date: '2025-02-03', previousDate: '2025-01-31', nodeIndex: 1, settlementRecord: february });
    advanceIntelNode(state, { date: '2025-02-03', previousDate: '2025-01-31', nodeIndex: 1, fundNav: 0, settlementRecord: february });
    expect(state.talent_roster[0].status).toBe('DELINQUENT');
    expect(state.talent_roster[0].payroll_arrears).toBe(1_000);
    expect(state.quant_infra!.status).toBe('SUSPENDED');
    for (const nodeIndex of [2, 3, 4]) {
      advanceIntelNode(state, { date: '2025-02-04', previousDate: '2025-02-04', nodeIndex, fundNav: 0 });
    }
    expect(state.intel!.network_cold).toBe(true);

    expect(injectGpCapital(state, 5_000, '2025-02-05')).toBe(true);
    const march = settleMonth(state, {
      settlementId: 'month:2025-03',
      monthId: '2025-03',
      date: '2025-03-03',
      fundNav: 0,
      talentMonthlyCost: 1_000,
      quantMonthlyCost: 250,
      intelMonthlyCost: 300,
    }).record;
    expect(march.talent_paid).toBe(true);
    advanceTalentNode(state, { date: '2025-03-03', previousDate: '2025-02-04', nodeIndex: 5, settlementRecord: march });
    advanceQuantNode(state, { date: '2025-03-03', previousDate: '2025-02-04', nodeIndex: 5, settlementRecord: march });
    advanceIntelNode(state, { date: '2025-03-03', previousDate: '2025-02-04', nodeIndex: 5, fundNav: 0, settlementRecord: march });
    expect(state.talent_roster[0].status).toBe('ACTIVE');
    expect(state.talent_roster[0].payroll_arrears).toBe(0);
    expect(state.quant_infra!.purchased_tier).toBe('T1');
    expect(state.quant_infra!.effective_tier).toBe('T1');
    expect(state.intel!.status).toBe('PENDING');
    expect(state.intel!.info_network).toBeLessThan(70);
    advanceIntelNode(state, { date: '2025-03-04', previousDate: '2025-03-03', nodeIndex: 6, fundNav: 0 });
    expect(state.intel!.status).toBe('ACTIVE');
  });
});
