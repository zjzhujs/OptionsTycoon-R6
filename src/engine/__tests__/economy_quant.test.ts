import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';
import {
  advanceQuantNode,
  getQuantCapabilities,
  purchaseQuantTier,
  recordCustomScoreUsage,
} from '../engines/economy_quant';

beforeEach(() => {
  localStorage.clear();
});

function fresh(startCash = 100_000) {
  const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', start_cash: startCash, story_seed: 31 });
  const state = game.get_session(view.state.session_id);
  state.economy!.management_cash = 100_000;
  state.economy!.gp_cash = 20_000;
  return state;
}

function addQuantStaff(state: ReturnType<typeof fresh>, count = 1) {
  for (let i = 0; i < count; i += 1) {
    state.employees!.push({
      id: `quant-${i}`,
      name: `Quant ${i}`,
      role: 'QUANT_RESEARCHER',
      salary_annual: 300_000,
      hired_date: '2025-01-23',
      skill: 60,
      capacity_pct: 100,
    });
  }
}

function deploy(state: ReturnType<typeof fresh>, tier: 'T1' | 'T2' | 'T3') {
  const order = { T1: 1, T2: 2, T3: 3 } as const;
  for (const next of (['T1', 'T2', 'T3'] as const).slice(0, order[tier])) {
    const result = purchaseQuantTier(state, next, '2025-01-23', state.game_day_index ?? 0);
    expect(result.ok).toBe(true);
  }
}

describe('quant desk Batch B hard rules', () => {
  it('charges deployment only to management cash and keeps fund/GP cash isolated', () => {
    const state = fresh(100_000);
    const fundBefore = state.cash;
    const gpBefore = state.economy!.gp_cash;
    const result = purchaseQuantTier(state, 'T1', '2025-01-23');

    expect(result.ok).toBe(true);
    expect(result.charged).toBe(2_500);
    expect(state.economy!.management_cash).toBe(97_500);
    expect(state.cash).toBe(fundBefore);
    expect(state.economy!.gp_cash).toBe(gpBefore);
  });

  it('separates purchased and effective tiers through the staff ceiling', () => {
    const state = fresh();
    addQuantStaff(state, 1);
    deploy(state, 'T3');
    const q = state.quant_infra!;

    expect(q.purchased_tier).toBe('T3');
    expect(q.effective_tier).toBe('T2');
    expect(q.monthly_burn).toBe(4_000);
  });

  it('exposes only tooling capabilities and never an accuracy edge', () => {
    const state = fresh();
    addQuantStaff(state, 2);
    deploy(state, 'T3');
    const capabilities = getQuantCapabilities(state);

    expect(Object.values(capabilities).every((capability) => capability.tooling_only && !capability.predictive_edge)).toBe(true);
    expect(capabilities.scanner.max_conditions).toBe(10);
    expect(capabilities.greeks.grid).toBe('SPOT_X_IV_5X5');
    expect(capabilities.gex.data_status).toBe('AVAILABLE');
  });

  it('uses DATA_UNAVAILABLE for T4 historical GEX without a real historical input', () => {
    const state = fresh();
    addQuantStaff(state, 2);
    deploy(state, 'T3');
    purchaseQuantTier(state, 'T4', '2025-01-23');

    expect(getQuantCapabilities(state).gex.data_status).toBe('DATA_UNAVAILABLE');
    expect(getQuantCapabilities(state, { hasRealHistoricalGex: true }).gex.data_status).toBe('AVAILABLE');
  });

  it('enters two-node grace after quant staff loss, then downgrades without refund', () => {
    const state = fresh();
    addQuantStaff(state, 1);
    deploy(state, 'T2');
    const beforeDeploymentPaid = state.quant_infra!.deployment_paid_amount;
    const employeeId = state.employees![0].id;
    state.employees = [];

    // Detect the departure, then consume exactly two market nodes of grace.
    const afterDeparture = getQuantCapabilities(state);
    expect(state.quant_infra!.grace_nodes_left).toBe(2);
    expect(afterDeparture.scanner.read_only).toBe(true);
    advanceQuantNode(state, { date: '2025-01-24', previousDate: '2025-01-23', nodeIndex: 1 });
    expect(state.quant_infra!.grace_nodes_left).toBe(1);
    advanceQuantNode(state, { date: '2025-01-27', previousDate: '2025-01-24', nodeIndex: 2 });

    expect(state.quant_infra!.effective_tier).toBe('T1');
    expect(state.quant_infra!.deployment_paid_amount).toBe(beforeDeploymentPaid);
    expect(state.quant_infra!.key_person_id).not.toBe(employeeId);
  });

  it('suspends on unpaid burn, reaches T0 after two nodes, and recovers without redeployment', () => {
    const state = fresh();
    purchaseQuantTier(state, 'T1', '2025-01-23');
    state.economy!.management_cash = 100;
    const fundBefore = state.cash;

    advanceQuantNode(state, {
      date: '2025-02-03',
      previousDate: '2025-01-31',
      nodeIndex: 1,
      fundNav: 100_000,
    });
    expect(state.quant_infra!.status).toBe('SUSPENDED');
    expect(state.quant_infra!.effective_tier).toBe('T1');
    advanceQuantNode(state, { date: '2025-02-04', previousDate: '2025-02-03', nodeIndex: 2 });
    expect(state.quant_infra!.effective_tier).toBe('T0');
    expect(state.cash).toBe(fundBefore);

    state.economy!.management_cash = 1_000;
    advanceQuantNode(state, { date: '2025-02-05', previousDate: '2025-02-04', nodeIndex: 3 });
    expect(state.quant_infra!.status).toBe('ACTIVE');
    expect(state.quant_infra!.effective_tier).toBe('T1');
  });

  it('queues OVERFIT only from usage history and does not alter market prices', () => {
    const state = fresh();
    addQuantStaff(state, 2);
    deploy(state, 'T3');
    const pricesBefore = game.get_market(state.session_id)[0].map((node) => node.underlying_bar.close);
    for (const nodeIndex of [1, 2, 3]) recordCustomScoreUsage(state, 'score-a', nodeIndex, true);
    advanceQuantNode(state, { date: '2025-01-26', previousDate: '2025-01-25', nodeIndex: 3 });

    expect(state.human_action_events!.some((event) => event.quant_incident_id === 'INC_QUANT_OVERFIT_MODEL')).toBe(true);
    expect(game.get_market(state.session_id)[0].map((node) => node.underlying_bar.close)).toEqual(pricesBefore);
  });

  it('settlement is idempotent and quant incident choices never touch fund cash', () => {
    const state = fresh();
    purchaseQuantTier(state, 'T1', '2025-01-23');
    const balanceBefore = state.economy!.management_cash;
    const first = advanceQuantNode(state, {
      date: '2025-02-03',
      previousDate: '2025-01-31',
      nodeIndex: 1,
      fundNav: 100_000,
    });
    const afterFirst = state.economy!.management_cash;
    const second = advanceQuantNode(state, {
      date: '2025-02-03',
      previousDate: '2025-01-31',
      nodeIndex: 1,
      fundNav: 100_000,
    });

    expect(first.monthly_paid).toBe(true);
    expect(second.monthly_paid).toBe(true);
    expect(state.economy!.management_cash).toBe(afterFirst);
    expect(afterFirst).toBeLessThan(balanceBefore);
    expect(state.cash).toBe(100_000);
  });

  it('keeps quant incident flags append-only and defers process penalties without changing P&L', () => {
    const state = fresh();
    addQuantStaff(state, 2);
    deploy(state, 'T3');
    for (const nodeIndex of [1, 2, 3]) recordCustomScoreUsage(state, 'score-b', nodeIndex, true);
    advanceQuantNode(state, { date: '2025-01-26', previousDate: '2025-01-25', nodeIndex: 3 });
    const event = state.human_action_events!.find((candidate) => candidate.quant_incident_id === 'INC_QUANT_OVERFIT_MODEL')!;
    const fundBefore = state.cash;
    const [view] = game.resolve_human_action(state.session_id, event.id, 'A_DECOMMISSION');

    expect(view.state.cash).toBe(fundBefore);
    expect(view.state.quant_infra!.incident_history.filter((entry) => entry.status === 'RESOLVED')).toHaveLength(1);
    expect(view.state.quant_infra!.false_confidence_flags).toEqual([]);
  });

  it('persists quant infrastructure through the existing save schema', () => {
    const state = fresh();
    purchaseQuantTier(state, 'T1', '2025-01-23');
    game.save_game(state.session_id, 'quant-b');
    const loaded = game.load_game('quant-b').state;

    expect(loaded.quant_infra!.purchased_tier).toBe('T1');
    expect(loaded.quant_infra!.deployment_paid_amount).toBe(2_500);
    expect(loaded.economy!.management_cash).toBe(state.economy!.management_cash);
  });
});

