import { describe, expect, it } from 'vitest';

import {
  applyTransitionSpec,
  assertCampaignMacroEventTag,
  assertCampaignProgressInvariant,
  assertFundBalanceSheetConsistent,
  createCampaignArcState,
  createEmptyFundBalanceSheet,
  recomputeStateFundBalanceSheet,
  recomputeFundBalanceSheet,
  resolvePrerequisites,
} from '../campaign_contract';
import { CAMPAIGN_MANIFESTS, CAREER_CAMPAIGN_ORDER, validateCampaignManifests } from '../campaign_manifests';
import type { CampaignArcState, ContinuityPolicy, FundBalanceSheet, GameState, PositionLot, TransitionSpec } from '../schemas';

const continuation: ContinuityPolicy = {
  preserve: ['RELATIONSHIPS', 'MEMORIES', 'TRAITS', 'LP', 'PB', 'COMPLIANCE_META'],
  position_rule: 'MANIFEST_GATED' as const,
  keep_fund_balance_sheet: true as const,
};

function makeLedger(): FundBalanceSheet {
  const lot: PositionLot = {
    id: 'lot-1',
    kind: 'option',
    underlying: 'NVDA',
    type: 'call',
    strike: 100,
    expiration: '2025-01-31',
    qty: 2,
    entry_price: 5,
    entry_date: '2025-01-23',
    short: false,
    origin_campaign: 'r1',
    thesis_id: 'thesis-1',
    contract_multiplier: 100,
  };
  return {
    ...createEmptyFundBalanceSheet(1_000, '2025-01-23'),
    margin_debt: 200,
    position_lots: [lot],
  };
}

describe('P1 campaign contract', () => {
  it('has one derived valuation recompute and detects stale caches', () => {
    const ledger = makeLedger();
    const recomputed = recomputeFundBalanceSheet(ledger, { 'lot-1': 8 }, '2025-01-24');

    expect(recomputed.nav).toBe(2_400);
    expect(recomputed.unrealized_pnl).toBe(600);
    expect(recomputed.cost_basis).toBe(1_000);
    expect(recomputed.valuation_cache_valid).toBe(true);
    expect(() => assertFundBalanceSheetConsistent(recomputed, { 'lot-1': 8 })).not.toThrow();

    const stale = { ...recomputed, nav: recomputed.nav + 1 };
    expect(() => assertFundBalanceSheetConsistent(stale, { 'lot-1': 8 })).toThrow(/derived cache mismatch/);
  });

  it('does not resurrect a closed lot from the compatibility cache', () => {
    const state = {
      session_id: 'cache-bridge-test',
      campaign_id: 'r1',
      cash: 1_000,
      start_cash: 1_000,
      realized_pl: 0,
      margin_debt: 0,
      shares: 0,
      positions: [makeLedger().position_lots[0]],
      fund_balance_sheet: makeLedger(),
    } as GameState;

    recomputeStateFundBalanceSheet(state, '2025-01-23', { 'lot-1': 5 });
    expect(state.fund_balance_sheet!.position_lots).toHaveLength(1);
    state.positions = [];
    recomputeStateFundBalanceSheet(state, '2025-01-24', {});
    expect(state.fund_balance_sheet!.position_lots).toHaveLength(0);
  });

  it('enforces sequential beat progress exactly', () => {
    const progress: Record<string, CampaignArcState> = { c8: createCampaignArcState('ACTIVE_FOCUS') };
    progress.c8.resolved_beat_ids.push('c8_1');
    expect(() => assertCampaignProgressInvariant(progress)).toThrow(/next_beat_index/);
    progress.c8.next_beat_index = 1;
    expect(() => assertCampaignProgressInvariant(progress)).not.toThrow();
  });

  it('turns missing prerequisites into scaffolding without blocking time', () => {
    const result = resolvePrerequisites({ prerequisites: ['OPTIONS_EXECUTION', 'COMPLIANCE'] }, ['COMPLIANCE']);
    expect(result.missing).toEqual(['OPTIONS_EXECUTION']);
    expect(result.scaffolding_required).toBe(true);
    expect(result.blocks_timeline).toBe(false);
  });

  it('moves arcs through event-driven transitions without rewinding', () => {
    const state = {
      session_id: 'contract-test',
      campaign_id: 'c8',
      cash: 50_000,
      start_cash: 50_000,
      story_seed: 1,
      fund_stats: {},
      created_at: '2022-01-18',
      updated_at: '2022-01-18',
    } as GameState;

    const transition = (id: string, campaign_id: string, kind: TransitionSpec['kind'], at: string): TransitionSpec => ({
      id,
      campaign_id,
      kind,
      trigger: { kind: 'DATE', at },
      continuity: continuation,
    });

    applyTransitionSpec(state, transition('c8-enter', 'c8', 'ENTER', '2022-01-18'), '2022-01-18');
    applyTransitionSpec(state, transition('c5-focus', 'c5', 'FOCUS', '2022-04-18'), '2022-04-18');
    expect(state.campaign_progress!.c8.status).toBe('ACTIVE_DORMANT');
    expect(state.campaign_progress!.c5.status).toBe('ACTIVE_FOCUS');
    expect(state.active_campaign_ids).toEqual(['c5', 'c8']);
    expect(state.spotlight_campaign_id).toBe('c5');
    expect(() => applyTransitionSpec(state, transition('rewind', 'c5', 'RESUME', '2022-01-01'), '2022-01-01')).toThrow(/rewind|backwards/);
  });

  it('registers all eight manifests in strict historical order', () => {
    validateCampaignManifests();
    expect(CAREER_CAMPAIGN_ORDER).toEqual(['c4', 'gme', 'c8', 'c5', 'c6', 'r1', 'c7', 'h1']);
    expect(Object.keys(CAMPAIGN_MANIFESTS)).toHaveLength(8);
    expect(CAMPAIGN_MANIFESTS.c8.can_overlap).toBe(true);
    expect(CAMPAIGN_MANIFESTS.c8.background_update_policy.mark_to_market).toBe(true);
    expect(CAMPAIGN_MANIFESTS.c5.activation_beats).toHaveLength(7);
    expect(CAMPAIGN_MANIFESTS.gme.regime_tags).toEqual(expect.arrayContaining(['MEME']));
  });

  it('validates compound new-campaign MacroEvent tags against the union vocabulary', () => {
    expect(() => assertCampaignMacroEventTag('AI/TARIFF')).not.toThrow();
    expect(() => assertCampaignMacroEventTag('M&A/REGULATION')).not.toThrow();
    expect(() => assertCampaignMacroEventTag('FOMC')).toThrow(/Unknown campaign regime tag/);
  });
});
