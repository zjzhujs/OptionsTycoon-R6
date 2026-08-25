/**
 * V29-UI-B — how an admitted daily-history pack interacts with the campaign timeline.
 *
 * The two rules this suite exists to protect:
 *
 *  1. The history pack feeds the LONG windows (52-week, moving averages) and nothing else.
 *     The campaign node stays the settlement authority for the current day's close and change,
 *     because that is what the chart plots and what positions mark against. A pack whose close
 *     disagrees for the same date must not put a contradicting price on screen.
 *
 *  2. No look-ahead, from either source. The pack deliberately spans far more dates than the
 *     campaign, so an unfiltered read would hand the panel bars the player has not reached.
 */
import { describe, expect, it } from 'vitest';
import { buildFundamentalsSnapshot, computeTechnicalSummaryFromBars } from '../engines/fundamentals';

function bars(count: number, start = '2024-01-01', base = 50, step = 0.3) {
  const out: any[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    const close = base + i * step;
    out.push({
      date: d.toISOString().slice(0, 10),
      open: close - 0.2,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000,
    });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** A short campaign timeline whose dates overlap the tail of the history pack. */
function campaignNodes(dates: string[], closes: number[]) {
  return dates.map((date, i) => ({
    date,
    underlying_bar: { date, open: closes[i], high: closes[i] + 2, low: closes[i] - 2, close: closes[i] },
  }));
}

describe('V29-UI-B history admission — long windows come from the pack', () => {
  it('unlocks 52-week and 200-day figures that the campaign alone cannot support', () => {
    const nodes = campaignNodes(['2024-09-24', '2024-09-25'], [120, 125]);
    const withoutPack = buildFundamentalsSnapshot('NVDA', nodes, '2024-09-25');
    expect(withoutPack.technical.week52_high.value).toBeNull();
    expect(withoutPack.technical.ma200.value).toBeNull();
    expect(withoutPack.history_source.used).toBe(false);

    const withPack = buildFundamentalsSnapshot('NVDA', nodes, '2024-09-25', {
      historyBars: bars(300),
    });
    expect(withPack.technical.week52_high.value).not.toBeNull();
    expect(withPack.technical.ma200.value).not.toBeNull();
    expect(withPack.history_source.used).toBe(true);
  });

  it('reports which series backed the indicators', () => {
    const nodes = campaignNodes(['2024-09-25'], [125]);
    const s = buildFundamentalsSnapshot('NVDA', nodes, '2024-09-25', {
      historyBars: bars(300),
      historySourceName: 'Yahoo daily · OT-HDF-B37',
    });
    expect(s.history_source.name).toContain('OT-HDF-B37');
  });
});

describe('V29-UI-B history admission — campaign node stays the settlement authority', () => {
  it('shows the campaign close, not the pack close, when the two disagree', () => {
    const date = '2024-09-25';
    const packBars = bars(300);
    // Force a disagreement on the as-of date.
    const onDate = packBars.find((b) => b.date === date);
    expect(onDate).toBeTruthy();
    onDate.close = 999;

    const nodes = campaignNodes(['2024-09-24', date], [120, 128.99]);
    const s = buildFundamentalsSnapshot('NVDA', nodes, date, { historyBars: packBars });

    expect(s.technical.last_close.value).toBe(128.99);
    expect(s.technical.last_close.value).not.toBe(999);
  });

  it('derives the day change from the campaign series', () => {
    const nodes = campaignNodes(['2024-09-24', '2024-09-25'], [100, 110]);
    const s = buildFundamentalsSnapshot('NVDA', nodes, '2024-09-25', { historyBars: bars(300) });
    expect(s.technical.change_pct.value).toBeCloseTo(10, 6);
  });

  it('positions the band against the authoritative close', () => {
    const date = '2024-09-25';
    const packBars = bars(300, '2024-01-01', 50, 0.3);
    const nodes = campaignNodes(['2024-09-24', date], [100, 110]);
    const s = buildFundamentalsSnapshot('NVDA', nodes, date, { historyBars: packBars });
    const hi = s.technical.week52_high.value as number;
    const lo = s.technical.week52_low.value as number;
    const expected = ((110 - lo) / (hi - lo)) * 100;
    expect(s.technical.week52_position_pct.value).toBeCloseTo(expected, 6);
  });
});

describe('V29-UI-B history admission — no look-ahead from the pack', () => {
  it('drops pack bars dated after the current game date', () => {
    const all = bars(300);
    const asOf = all[100].date;
    const t = computeTechnicalSummaryFromBars(all, asOf);
    expect(t.available_bars).toBe(101);
  });

  it('a future spike in the pack never reaches the 52-week high', () => {
    const all = bars(400);
    all[380].high = 99999;
    const t = computeTechnicalSummaryFromBars(all, all[300].date);
    expect(t.week52_high.value as number).toBeLessThan(99999);
  });

  it('sorts an out-of-order pack before computing', () => {
    const all = bars(300);
    const shuffled = [all[5], all[1], all[9], ...all.slice(10)];
    const t = computeTechnicalSummaryFromBars(shuffled, all[299].date);
    // Last close must be the latest DATE, not the last array element.
    expect(t.last_close.value).toBe(all[299].close);
  });
});
