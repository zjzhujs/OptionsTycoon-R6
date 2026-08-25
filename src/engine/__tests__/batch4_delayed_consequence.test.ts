import { describe, expect, it, beforeEach } from 'vitest';
import {
  createComplianceRetaliationConsequence,
  createCrisisFermentationConsequence,
  check_and_trigger_delayed_consequences,
} from '../engines/delayed_consequence_engine';
import { save_game, load_game } from '../persistence';

describe('Batch4 crisis fermentation + delayed retaliation timers', () => {
  beforeEach(() => localStorage.clear());

  it('queues next-day accountability only after an already-observed <= -8% daily move', () => {
    const state = { fund_stats: { compliance_risk: 20, lp_confidence: 45 }, current_episode_number: 1 } as any;
    const timer = createCrisisFermentationConsequence(state, '2026-01-20', 100, 91, 4);
    expect(timer?.consequence_kind).toBe('CRISIS_FERMENTATION');
    expect(timer?.trigger_game_day_index).toBe(5);
    expect(timer?.forced_story_template_id).toBe('lp_redemption');
    expect(createCrisisFermentationConsequence(state, '2026-01-20', 100, 95, 4)).toBeNull();
  });

  it('persists a 2-3 trading-day compliance retaliation timer through save/load and turns it into an existing blocking story template when due', () => {
    const base = {
      session_id: 'batch4-save', campaign_id: 'r1', game_day_index: 3, current_episode_number: 1,
      fund_stats: { compliance_risk: 20, lp_confidence: 70 }, delayed_consequences: [], pending_story_events: [],
      cash: 100_000, start_cash: 100_000, story_seed: 1, created_at: 'x', updated_at: 'x',
    } as any;
    const timer = createComplianceRetaliationConsequence(base, 'event-1', 'stonewall', 15, '2026-01-20')!;
    expect([5, 6]).toContain(timer.trigger_game_day_index);
    base.delayed_consequences.push(timer);
    save_game(base, 'batch4-timer', '2026-01-20', 100_000);
    const restored = load_game('batch4-timer')! as any;
    expect(restored.delayed_consequences[0].trigger_game_day_index).toBe(timer.trigger_game_day_index);
    restored.game_day_index = timer.trigger_game_day_index;
    restored.market_clock = { current_node_date: '2026-01-23' };
    const fired = check_and_trigger_delayed_consequences(restored);
    expect(fired).toHaveLength(1);
    expect(restored.pending_story_events[0].template_id).toBe('sec_subpoena');
  });
});
