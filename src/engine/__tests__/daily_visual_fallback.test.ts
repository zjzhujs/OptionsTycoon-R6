import { describe, expect, it } from 'vitest';
import { buildDailyAnchoredVisualSeries } from '../engines/intraday_path';
import type { RevealedPriceBar } from '../schemas';

const DAILY: RevealedPriceBar = {
  ts: '2025-01-23',
  label: '2025-01-23 DAILY OHLC',
  open: 145.05,
  high: 147.23,
  low: 143.72,
  close: 147.22,
  volume: 155_000_000,
};

describe('Day-1 daily-OHLC visual fallback', () => {
  it('creates a dense truth-labelled RTH visual tape without changing the anchors', () => {
    const built = buildDailyAnchoredVisualSeries(DAILY, '2025-01-23', 169);
    expect(built).not.toBeNull();
    expect(built!.mode).toBe('DERIVED_FROM_DAILY_OHLC');
    expect(built!.truthLabel).toBe('SIMULATED');
    expect(built!.points).toHaveLength(169);
    expect(built!.points[0].price).toBe(DAILY.open);
    expect(built!.points[built!.points.length - 1].price).toBe(DAILY.close);

    const prices = built!.points.map((point) => point.price);
    expect(Math.min(...prices)).toBeCloseTo(DAILY.low, 2);
    expect(Math.max(...prices)).toBeCloseTo(DAILY.high, 2);
    expect(prices.every((price) => price >= DAILY.low && price <= DAILY.high)).toBe(true);
  });

  it('covers only the 6.5 hour regular session and preserves total daily volume', () => {
    const built = buildDailyAnchoredVisualSeries(DAILY, '2025-01-23', 169)!;
    const span = built.points[built.points.length - 1].timeSec - built.points[0].timeSec;
    expect(span).toBe(6.5 * 3600);
    expect(built.volume).not.toBeNull();
    expect(built.volume!.reduce((sum, bar) => sum + bar.volume, 0)).toBe(DAILY.volume);
  });

  it('refuses malformed OHLC instead of inventing a chart', () => {
    expect(buildDailyAnchoredVisualSeries({ ...DAILY, high: Number.NaN }, '2025-01-23')).toBeNull();
  });
});
