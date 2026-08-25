import { describe, expect, it } from 'vitest';
import { directionalExposure, revealedSessionDrawdown, selectPositionShowdown } from '../engines/position_showdown_engine';

const reveal = {
  ticker: 'NVDA',
  current_window_index: 1,
  windows: [
    {
      visible_price_bars: [
        { ts: '1', label: '10:00', open: 100, high: 102, low: 99, close: 101 },
        { ts: '2', label: '10:30', open: 101, high: 105, low: 100, close: 104 },
      ],
    },
    {
      visible_price_bars: [
        { ts: '1', label: '10:00', open: 100, high: 102, low: 99, close: 101 },
        { ts: '2', label: '10:30', open: 101, high: 105, low: 100, close: 104 },
        { ts: '3', label: '11:00', open: 104, high: 104, low: 99, close: 100 },
      ],
    },
  ],
} as any;

const longCall = {
  id: 'p1', kind: 'option', underlying: 'NVDA', type: 'call', strike: 100,
  expiration: '2025-02-07', qty: 2, short: false,
} as any;

describe('position showdown engine', () => {
  it('derives drawdown only from already-visible bars and triggers at the configured threshold', () => {
    expect(revealedSessionDrawdown(reveal)?.drawdownPct).toBeCloseTo(-4.7619, 3);
    const result = selectPositionShowdown({
      gameDate: '2025-01-27',
      marketReveal: reveal,
      positions: [longCall],
      playerDecisions: [],
      thresholdPct: 4,
    });
    expect(result?.positionId).toBe('p1');
    expect(result?.direction).toBe('BULLISH');
    expect(result?.proposals.map((proposal) => proposal.claim)).toEqual(['STOP', 'HEDGE', 'ADD']);
  });

  it('enforces once per position per day from persisted player_decisions', () => {
    const result = selectPositionShowdown({
      gameDate: '2025-01-27',
      marketReveal: reveal,
      positions: [longCall],
      playerDecisions: [{ category: 'INTRADAY_SHOWDOWN', game_date: '2025-01-27', position_id: 'p1' } as any],
      thresholdPct: 4,
    });
    expect(result).toBeNull();
  });

  it('never triggers from a one-bar or sub-threshold revealed tape', () => {
    expect(selectPositionShowdown({
      gameDate: '2025-01-27',
      marketReveal: { ...reveal, windows: [{ visible_price_bars: [{ ts: '1', label: '10:00', open: 100, high: 100, low: 99, close: 99 }] }] } as any,
      positions: [longCall],
    })).toBeNull();

    const mild = structuredClone(reveal);
    mild.windows[1].visible_price_bars[2].close = 102;
    expect(selectPositionShowdown({ gameDate: '2025-01-27', marketReveal: mild, positions: [longCall], thresholdPct: 4 })).toBeNull();
  });

  it('rationalises short/long option direction without reading P&L or future price', () => {
    expect(directionalExposure({ type: 'call', short: false } as any)).toBe('BULLISH');
    expect(directionalExposure({ type: 'put', short: false } as any)).toBe('BEARISH');
    expect(directionalExposure({ type: 'put', short: true } as any)).toBe('BULLISH');
    expect(directionalExposure({ type: 'call', short: true } as any)).toBe('BEARISH');
  });
});
