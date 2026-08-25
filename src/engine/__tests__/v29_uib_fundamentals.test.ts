/**
 * V29-UI-B regression tests for the fundamentals engine.
 *
 * The point of this suite is not that the arithmetic is right — that part is trivial. It is
 * that the module NEVER produces a number it cannot justify: no indicator from too few bars,
 * no value computed from a bar dated after the current game date, and an explicit reason
 * attached to every unavailable field.
 */
import { describe, expect, it } from 'vitest';
import {
  barsUpTo,
  buildFundamentalsSnapshot,
  computeTechnicalSummary,
} from '../engines/fundamentals';

/** Synthetic consecutive daily bars starting 2024-01-01, close = base + i. */
function makeNodes(count: number, base = 100): any[] {
  const out: any[] = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  for (let i = 0; i < count; i += 1) {
    const iso = d.toISOString().slice(0, 10);
    const close = base + i;
    out.push({
      date: iso,
      underlying_bar: { date: iso, open: close, high: close + 1, low: close - 1, close, volume: 1000 },
      provenance: { source_type: 'REAL' },
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe('V29-UI-B fundamentals — no look-ahead', () => {
  it('ignores bars dated after the current game date', () => {
    const nodes = makeNodes(300);
    const asOf = nodes[99].date;
    expect(barsUpTo(nodes, asOf)).toHaveLength(100);
  });

  it('last close comes from the as-of bar, never from a later one', () => {
    const nodes = makeNodes(300, 100);
    const t = computeTechnicalSummary(nodes, nodes[99].date);
    expect(t.last_close.value).toBe(199); // base 100 + index 99
    expect(t.last_close.source_type).toBe('REAL');
  });

  it('a 52-week high never reflects a future spike', () => {
    const nodes = makeNodes(300, 100);
    // Plant a huge spike well after the as-of date.
    nodes[280].underlying_bar.high = 99999;
    const t = computeTechnicalSummary(nodes, nodes[260].date);
    expect(t.week52_high.value).not.toBe(99999);
    expect(t.week52_high.value as number).toBeLessThan(99999);
  });
});

describe('V29-UI-B fundamentals — refuses to invent', () => {
  it('withholds every indicator when there are no bars at all', () => {
    const t = computeTechnicalSummary([], '2025-01-23');
    expect(t.available_bars).toBe(0);
    for (const f of [t.last_close, t.week52_high, t.week52_low, t.ma20, t.ma50, t.ma200]) {
      expect(f.value).toBeNull();
      expect(f.source_type).toBe('DATA_UNAVAILABLE');
      expect(f.unavailable_reason).toBeTruthy();
    }
  });

  it("withholds 52-week extremes on the game's current 17-bar reality", () => {
    const t = computeTechnicalSummary(makeNodes(17), makeNodes(17)[16].date);
    expect(t.week52_high.value).toBeNull();
    expect(t.week52_low.value).toBeNull();
    // The reason must name the actual shortfall so the panel can show it.
    expect(t.week52_high.unavailable_reason).toContain('17');
  });

  it('withholds each moving average until its own window is satisfied', () => {
    const nodes = makeNodes(60);
    const t = computeTechnicalSummary(nodes, nodes[59].date);
    expect(t.ma20.value).not.toBeNull();
    expect(t.ma50.value).not.toBeNull();
    expect(t.ma200.value).toBeNull();
    expect(t.ma200.unavailable_reason).toContain('200');
  });

  it('withholds the 52-week position when the band is unavailable', () => {
    const nodes = makeNodes(30);
    const t = computeTechnicalSummary(nodes, nodes[29].date);
    expect(t.week52_position_pct.value).toBeNull();
  });
});

describe('V29-UI-B fundamentals — labels and arithmetic', () => {
  it('labels computed indicators DERIVED_REAL_INPUTS, not REAL', () => {
    const nodes = makeNodes(260);
    const t = computeTechnicalSummary(nodes, nodes[259].date);
    expect(t.ma200.source_type).toBe('DERIVED_REAL_INPUTS');
    expect(t.week52_high.source_type).toBe('DERIVED_REAL_INPUTS');
    // A directly observed close stays REAL.
    expect(t.last_close.source_type).toBe('REAL');
  });

  it('computes a 20-day average over exactly the last 20 closes', () => {
    const nodes = makeNodes(100, 100);
    const t = computeTechnicalSummary(nodes, nodes[99].date);
    // closes 180..199 -> mean 189.5
    expect(t.ma20.value).toBeCloseTo(189.5, 6);
    expect(t.ma20.sample_size).toBe(20);
  });

  it('falls back to close when a bar carries no high/low (point_only nodes)', () => {
    const nodes = makeNodes(260, 100);
    for (const n of nodes) {
      n.underlying_bar.high = null;
      n.underlying_bar.low = null;
    }
    const t = computeTechnicalSummary(nodes, nodes[259].date);
    // Last 252 closes are 108..359; extremes must come from closes, not crash.
    expect(t.week52_high.value).toBe(359);
    expect(t.week52_low.value).toBe(108);
  });

  it('reports profile and valuation as unavailable with a stated reason', () => {
    const snap = buildFundamentalsSnapshot('NVDA', makeNodes(10), makeNodes(10)[9].date);
    expect(snap.valuation.pe_ratio.value).toBeNull();
    expect(snap.valuation.pe_ratio.unavailable_reason).toBeTruthy();
    expect(snap.valuation.analyst_rating.value).toBeNull();
    // The rating note must warn that in-game analyst copy is fiction, not a real rating.
    expect(snap.valuation.analyst_rating.unavailable_reason).toContain('SIMULATED');
    expect(snap.profile.description.value).toBeNull();
  });

  it('accepts a real name/sector when the caller supplies one', () => {
    const snap = buildFundamentalsSnapshot('NVDA', makeNodes(5), makeNodes(5)[4].date, {
      name: 'NVIDIA',
      sector: 'Semiconductors',
    });
    expect(snap.profile.name.value).toBe('NVIDIA');
    expect(snap.profile.name.source_type).toBe('REAL');
    expect(snap.profile.sector.value).toBe('Semiconductors');
  });
});
