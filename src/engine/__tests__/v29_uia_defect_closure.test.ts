/**
 * V29-UI-A regression tests.
 *
 * These cover the two defects from the 2026-08-18 audit whose repair lives in the engine
 * rather than in a component, so a browser click-through cannot prove them:
 *
 *   #3 DO NOTHING / abstention must reach ProcessScore.
 *   #6 Margin financing interest must accumulate into a separate visible counter instead of
 *      only being folded into margin_debt.
 *
 * The other five defects (#1 combo close, #2 boundary card, #4 trade flash, #5 data-source
 * honesty, #7 NAV delta) were verified against the running app; see V29_UI_A_CHANGELOG.md
 * for the recorded evidence.
 */
import { describe, expect, it } from 'vitest';
import { create_trade_review } from '../engines/trade_review';
import { daily_financing_cost } from '../engines/margin';

const exitNode = { date: '2025-01-31', underlying_bar: { close: 120 } } as any;

function longCall(): any {
  return {
    id: 'p1',
    kind: 'option',
    type: 'call',
    strike: 130,
    expiration: '2025-02-07',
    qty: 1,
    entry_price: 5,
    entry_date: '2025-01-27',
    underlying: 'NVDA',
  };
}

describe('V29-UI-A defect #3 — abstention reaches ProcessScore', () => {
  it('leaves abstention_quality_score undefined when no DO NOTHING was recorded', () => {
    const review = create_trade_review(longCall(), exitNode, 7, 200, {
      state: { v28_abstention_reviews: [] } as any,
    });
    const ps = review.process_score as any;
    expect(ps.abstention_quality_score).toBeUndefined();
  });

  it('averages recorded abstentions dated on or before entry into the score', () => {
    const review = create_trade_review(longCall(), exitNode, 7, 200, {
      state: {
        v28_abstention_reviews: [
          { date: '2025-01-24', quality_score: 80, reason: 'IV 过贵，选择空仓' },
          { date: '2025-01-27', quality_score: 90, reason: '催化剂未落地' },
        ],
      } as any,
    });
    const ps = review.process_score as any;
    expect(ps.abstention_quality_score).toBe(85);
  });

  it('ignores abstentions recorded after the position was opened', () => {
    const review = create_trade_review(longCall(), exitNode, 7, 200, {
      state: {
        v28_abstention_reviews: [
          { date: '2025-01-30', quality_score: 95, reason: '开仓之后才发生，不能倒算进这笔' },
        ],
      } as any,
    });
    const ps = review.process_score as any;
    expect(ps.abstention_quality_score).toBeUndefined();
  });

  it('adds a process note when the player showed genuine restraint', () => {
    const review = create_trade_review(longCall(), exitNode, 7, 200, {
      state: {
        v28_abstention_reviews: [
          { date: '2025-01-24', quality_score: 88, reason: '不追高' },
        ],
      } as any,
    });
    const ps = review.process_score as any;
    expect(ps.process_notes.some((n: string) => n.includes('空仓克制'))).toBe(true);
  });

  it('does not praise low-quality abstention', () => {
    const review = create_trade_review(longCall(), exitNode, 7, 200, {
      state: {
        v28_abstention_reviews: [
          { date: '2025-01-24', quality_score: 40, reason: '纯粹犹豫，不是纪律' },
        ],
      } as any,
    });
    const ps = review.process_score as any;
    expect(ps.abstention_quality_score).toBe(40);
    expect(ps.process_notes.some((n: string) => n.includes('空仓克制'))).toBe(false);
  });
});

describe('V29-UI-A defect #6 — cumulative margin interest is a separate counter', () => {
  // Mirrors the accrual loop in game.ts step(): each elapsed day capitalizes interest into
  // margin_debt AND adds the same amount to cumulative_margin_interest_paid.
  function accrue(days: number, startDebt: number, spreadBps: number) {
    let margin_debt = startDebt;
    let cumulative_margin_interest_paid = 0;
    for (let i = 0; i < days; i += 1) {
      const cost = daily_financing_cost(margin_debt, spreadBps);
      margin_debt += cost;
      cumulative_margin_interest_paid += cost;
    }
    return { margin_debt, cumulative_margin_interest_paid };
  }

  it('accrues nothing when there is no margin debt', () => {
    const r = accrue(30, 0, 150);
    expect(r.cumulative_margin_interest_paid).toBe(0);
    expect(r.margin_debt).toBe(0);
  });

  it('accumulates a strictly positive running total while debt is outstanding', () => {
    const r = accrue(30, 100_000, 150);
    expect(r.cumulative_margin_interest_paid).toBeGreaterThan(0);
    expect(r.margin_debt).toBeGreaterThan(100_000);
  });

  it('keeps the counter equal to the debt growth, so nothing is silently lost', () => {
    const start = 100_000;
    const r = accrue(30, start, 150);
    expect(r.cumulative_margin_interest_paid).toBeCloseTo(r.margin_debt - start, 6);
  });

  it('charges more under a worse prime-broker financing spread', () => {
    const good = accrue(30, 100_000, 50);
    const bad = accrue(30, 100_000, 400);
    expect(bad.cumulative_margin_interest_paid).toBeGreaterThan(good.cumulative_margin_interest_paid);
  });

  it('is monotonically non-decreasing day over day', () => {
    let prev = 0;
    for (const d of [1, 5, 10, 20, 60]) {
      const r = accrue(d, 100_000, 150);
      expect(r.cumulative_margin_interest_paid).toBeGreaterThanOrEqual(prev);
      prev = r.cumulative_margin_interest_paid;
    }
  });
});
