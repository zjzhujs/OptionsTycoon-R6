import { describe, expect, it } from 'vitest';
import { activeConspiracyRules, applyConspiracyThresholdEffects, conspiracyTemplateWeightMultiplier } from '../engines/conspiracy_web_engine';

describe('Batch4 conspiracy web', () => {
  it('crosses hidden thresholds once and changes only existing relationship/fund fields', () => {
    const state = {
      relationships: {
        adrian_cross: { trust: 12, favor: 10, rivalry: 5 },
        daniel_ross: { trust: 12, favor: 10, rivalry: 0 },
      },
      fund_stats: { compliance_risk: 20, counterparty_trust: 70 },
      institutional_relationships: {},
      compliance_state: {},
    } as any;
    expect(activeConspiracyRules(state).map((r) => r.id).sort()).toEqual([
      'adrian_retaliation_web', 'daniel_credit_committee_web',
    ]);
    const template = { id: 'short_seller_report' } as any;
    expect(conspiracyTemplateWeightMultiplier(state, template)).toBeGreaterThan(1);
    applyConspiracyThresholdEffects(state);
    expect(state.fund_stats.compliance_risk).toBe(23);
    expect(state.institutional_relationships.jpmorgan.trust).toBeLessThan(60);
    expect(state.institutional_relationships.jpmorgan.financing_spread_bps).toBe(170);
    const snapshot = JSON.stringify(state);
    applyConspiracyThresholdEffects(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
