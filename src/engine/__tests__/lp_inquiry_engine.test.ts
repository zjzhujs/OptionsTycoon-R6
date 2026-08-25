import { describe, it, expect } from 'vitest';
import { assessInquiryTier, maxDrawdownPct, buildInquiry, applyInquiryOutcome, inquiryDue } from '../engines/lp_inquiry_engine';

const base = (over: Record<string, unknown> = {}) => ({
  campaign_id: 'r1',
  cash: 50000,
  nav_history: [{ d: 0, v: 50000 }, { d: 1, v: 52000 }, { d: 2, v: 51000 }],
  fund_stats: { aum: 50000, nav: 50000, high_water_mark: 52000, sharpe_ratio: 0, win_rate: 0, compliance_risk: 10, lp_confidence: 50, reputation: 50 },
  trade_reviews: [{ trade_id: 't1' }],
  ...over,
}) as never;

describe('LP inquiry engine', () => {
  it('computes drawdown and tiers honestly', () => {
    expect(maxDrawdownPct([{ v: 100 }, { v: 80 }, { v: 90 }])).toBeCloseTo(20, 5);
    expect(assessInquiryTier(base({ nav_history: [{ d: 0, v: 50000 }, { d: 1, v: 40000 }] }), 40000)).toBe('MAJOR_DRAWDOWN');
    expect(assessInquiryTier(base({ fund_stats: { compliance_risk: 60, lp_confidence: 50, reputation: 50, aum: 50000, nav: 0, high_water_mark: 0, sharpe_ratio: 0, win_rate: 0 } }), 51000)).toBe('COMPLIANCE_BLEMISH');
    expect(assessInquiryTier(base(), 56000)).toBe('SUPER_ALPHA');
    expect(assessInquiryTier(base(), 51000)).toBe('STEADY_ON_TARGET');
  });

  it('builds inquiry views with speakers and choices from the bank', () => {
    const v = buildInquiry(base(), 51000, '2025-01-31');
    expect(v).not.toBeNull();
    expect(v!.inquirers.length).toBeGreaterThanOrEqual(1);
    expect(v!.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('applies bounded outcomes and marks the campaign done exactly once', () => {
    const s = base() as { fund_stats: { lp_confidence: number; reputation: number }; lp_inquiry_done_campaigns?: string[] };
    applyInquiryOutcome(s as never, 'ADMIT_AND_REFORM');
    expect(s.fund_stats.lp_confidence).toBe(54);
    expect(s.fund_stats.reputation).toBe(48);
    expect(s.lp_inquiry_done_campaigns).toContain('r1');
    expect(inquiryDue(s as never, 6, 7)).toBe(false);
  });

  it('inquiryDue only fires on the final node with reviews', () => {
    expect(inquiryDue(base(), 6, 7)).toBe(true);
    expect(inquiryDue(base(), 3, 7)).toBe(false);
    expect(inquiryDue(base({ trade_reviews: [] }), 6, 7)).toBe(false);
  });
});
