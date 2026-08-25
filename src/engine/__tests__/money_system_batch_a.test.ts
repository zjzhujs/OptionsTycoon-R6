import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';
import { ensureEconomyState, settleMonth } from '../engines/economy_core';
import {
  advanceIntelNode,
  createGrayIntelEvent,
  ensureIntelState,
  subscribeIntel,
} from '../engines/economy_intel';

const fresh = () => {
  const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', start_cash: 100_000, story_seed: 41 });
  return game.get_session(view.state.session_id);
};

describe('money system Batch A hard rules', () => {
  beforeEach(() => localStorage.clear());

  it('keeps fund, management, and GP wallets isolated', () => {
    const state = fresh();
    const fundBefore = state.cash;
    const gpBefore = ensureEconomyState(state).gp_cash;
    const result = subscribeIntel(state, 'PRO', false, '2025-01-23', 0);
    expect(result.ok).toBe(true);
    expect(state.cash).toBe(fundBefore);
    expect(state.economy!.gp_cash).toBe(gpBefore);
    expect(state.economy!.management_cash).toBe(11_100);
  });

  it('settles management and performance fees without touching fund cash', () => {
    const state = fresh();
    const fundBefore = state.cash;
    const result = settleMonth(state, {
      settlementId: 'month:2025-02',
      monthId: '2025-02',
      date: '2025-02-03',
      fundNav: 110_000,
      intelMonthlyCost: 900,
    });
    expect(result.record.management_fee).toBeCloseTo(183.33, 2);
    expect(result.record.performance_fee).toBe(2_000);
    expect(result.record.high_water_mark_after).toBe(110_000);
    expect(result.record.intel_paid).toBe(true);
    expect(state.cash).toBe(fundBefore);
  });

  it('is idempotent for a repeated settlement_id', () => {
    const state = fresh();
    const input = {
      settlementId: 'month:2025-02', monthId: '2025-02', date: '2025-02-03', fundNav: 105_000, intelMonthlyCost: 300,
    };
    const first = settleMonth(state, input);
    const balance = state.economy!.management_cash;
    const second = settleMonth(state, input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(state.economy!.management_cash).toBe(balance);
    expect(state.economy!.settlement_ledger).toHaveLength(1);
  });

  it('has zero side effects when subscription funds are insufficient', () => {
    const state = fresh();
    state.economy!.management_cash = 100;
    const before = JSON.stringify(state);
    const result = subscribeIntel(state, 'ELITE', true, '2025-01-23', 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_MANAGEMENT_CASH');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('cuts off unpaid intel, decays it, and enters cold state after three nodes', () => {
    const state = fresh();
    const intel = ensureIntelState(state);
    intel.tier = 'PRO';
    intel.info_network = 50;
    intel.paid_through_month = '2025-01';
    for (let nodeIndex = 1; nodeIndex <= 3; nodeIndex += 1) {
      advanceIntelNode(state, {
        date: '2025-02-03', previousDate: '2025-02-03', nodeIndex, fundNav: 100_000,
      });
    }
    expect(intel.target).toBe(0);
    expect(intel.info_network).toBeLessThan(50);
    expect(intel.network_cold).toBe(true);
    expect(intel.status).toBe('COLD');
    expect(intel.source_history).toHaveLength(0);
  });

  it('keeps MNPI evidence and flags append-only after later lawful choices', () => {
    const state = fresh();
    const risky = createGrayIntelEvent('EVT_INTEL_GRAY_SUPPLIER_CFO', '2025-01-23')!;
    state.human_action_events!.push(risky);
    game.resolve_human_action(state.session_id, risky.id, 'C_DEMAND_NUMBERS');
    const evidenceCount = state.evidence_ledger!.length;
    const flags = [...state.mnpi_flags!];

    const lawful = createGrayIntelEvent('EVT_INTEL_GRAY_ANALYST_DRAFT', '2025-01-24')!;
    state.human_action_events!.push(lawful);
    game.resolve_human_action(state.session_id, lawful.id, 'A_DELETE_AND_LOG');
    expect(state.evidence_ledger!.length).toBeGreaterThan(evidenceCount);
    expect(state.mnpi_flags).toEqual(flags);
  });

  it('persists one canonical balance per non-fund wallet and restores aliases', () => {
    const state = fresh();
    state.management_company!.cash = 12_345;
    game.save_game(state.session_id, 'money-a');
    const row = JSON.parse(localStorage.getItem('optionstycoon_save_money-a')!);
    expect(row.schema_version).toBe(4);
    expect(row.payload.economy.management_cash).toBe(12_345);
    expect(Object.prototype.hasOwnProperty.call(row.payload.management_company, 'cash')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row.payload.gp_wealth, 'cash')).toBe(false);

    const loaded = game.load_game('money-a');
    expect(loaded.state.management_company!.cash).toBe(12_345);
    loaded.state.management_company!.cash = 9_999;
    expect(loaded.state.economy!.management_cash).toBe(9_999);
  });

  it('resets untrusted legacy balances during migration and records the reset', () => {
    const state = fresh();
    const legacyPayload = JSON.parse(JSON.stringify(state)) as typeof state;
    delete legacyPayload.economy;
    legacyPayload.management_company = { ...legacyPayload.management_company, cash: 500_000 };
    legacyPayload.gp_wealth = { ...legacyPayload.gp_wealth, cash: 0 };
    localStorage.setItem('optionstycoon_save_money-migration', JSON.stringify({
      schema_version: 3,
      slot: 'money-migration',
      campaign_id: legacyPayload.campaign_id,
      game_date: '2025-01-23',
      equity: legacyPayload.cash,
      updated_at: legacyPayload.updated_at,
      payload: legacyPayload,
    }));

    const loaded = game.load_game('money-migration').state;
    expect(loaded.economy!.management_cash).toBe(12_000);
    expect(loaded.economy!.gp_cash).toBe(6_000);
    const transferReset = loaded.economy!.transfer_ledger.find((entry) => entry.kind === 'MIGRATION_RESET');
    expect(transferReset?.reason).toContain('management_cash=500000');
    expect(transferReset?.reason).toContain('gp_cash=0');
    const auditReset = loaded.audit_trail!.find((entry) => entry.action === 'MIGRATION_RESET');
    expect(auditReset?.detail).toContain('reset to management_cash=12000, gp_cash=6000');
  });

  it('resets a polluted pre-v2 economy object during load', () => {
    const state = fresh();
    const pollutedPayload = JSON.parse(JSON.stringify(state)) as typeof state;
    pollutedPayload.economy = {
      ...pollutedPayload.economy!,
      management_cash: 499_999.07,
      gp_cash: 0,
    };
    delete pollutedPayload.economy.schema_version;
    localStorage.setItem('optionstycoon_save_polluted-economy', JSON.stringify({
      schema_version: 4,
      slot: 'polluted-economy',
      campaign_id: pollutedPayload.campaign_id,
      game_date: '2025-01-23',
      equity: pollutedPayload.cash,
      updated_at: pollutedPayload.updated_at,
      payload: pollutedPayload,
    }));

    const loaded = game.load_game('polluted-economy').state;
    expect(loaded.economy!.schema_version).toBe(2);
    expect(loaded.economy!.management_cash).toBe(12_000);
    expect(loaded.economy!.gp_cash).toBe(6_000);
    expect(loaded.economy!.transfer_ledger.filter((entry) => entry.kind === 'MIGRATION_RESET')).toHaveLength(1);
    expect(loaded.economy!.transfer_ledger[0].reason).toContain('management_cash=499999.07');
    expect(loaded.audit_trail!.filter((entry) => entry.action === 'MIGRATION_RESET')).toHaveLength(1);
    expect(loaded.audit_trail!.find((entry) => entry.action === 'MIGRATION_RESET')!.detail).toContain('gp_cash=0');
  });

  it('exposes all three approved gray events as unverified decisions', () => {
    const ids = [
      'EVT_INTEL_GRAY_SUPPLIER_CFO',
      'EVT_INTEL_GRAY_ANALYST_DRAFT',
      'EVT_INTEL_GRAY_POLICY_TARIFF',
    ];
    for (const id of ids) {
      const event = createGrayIntelEvent(id, '2025-01-23')!;
      expect(event.choices).toHaveLength(3);
      expect(event.choices!.filter((choice) => choice.unlocks_intel).every(
        (choice) => choice.intel_truth_state === 'UNVERIFIED',
      )).toBe(true);
    }
  });
});
