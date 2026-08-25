import { describe, expect, it } from 'vitest';
import { deriveMorningEcho } from '../engines/character_echo_engine';

describe('dynamic morning retaliation / validation', () => {
  it('turns yesterday\'s War Room side plus realized day result into a testable echo without mutating state', () => {
    const state = {
      game_day_index: 2,
      start_cash: 100_000,
      nav_history: [
        { d: 0, v: 100_000 },
        { d: 1, v: 92_000 },
        { d: 2, v: 92_000 },
      ],
      player_decisions: [
        { category: 'WAR_ROOM_CHOICE', game_date: '2026-01-19', headline: 'opt_aggressive', detail: '[choice:opt_aggressive]' },
      ],
      relationships: {
        maya_chen: { trust: 60 },
        victor_hale: { trust: 30 },
      },
      grudge_ledger: [
        { id: 'g1', kind: 'GRUDGE', subject: 'victor_hale', date: '2026-01-18', what: 'ignored risk warning', weight: 6, spent: false, source_type: 'SIMULATED' },
      ],
      character_memories: {
        victor_hale: [{ timestamp: '2026-01-19', summary: 'PM ignored the risk budget' }],
      },
    } as any;
    const snapshot = JSON.stringify(state);
    const echo = deriveMorningEcho(state, '2026-01-20', '2026-01-19');
    expect(echo?.characterId).toBe('victor_hale');
    expect(echo?.slot).toBe('OVERRULED_LOSS');
    expect(echo?.pnlUsd).toBe(-8000);
    expect(echo?.line.length).toBeGreaterThan(10);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
