import { describe, it, expect } from 'vitest';
import { advanceCareerClock } from '../career_orchestrator';
import type { GameState } from '../schemas';

describe('Career Orchestrator', () => {
  it('should handle C8 overlap with C5 and C6', () => {
    const state: GameState = {
      career_clock: { current_at: '2022-01-01', transition_cursor: null, last_advance_at: '2022-01-01' },
      campaign_progress: {},
      spotlight_campaign_id: null,
      active_campaign_ids: []
    } as any;

    // Advance to C8 start (2022-01-18)
    let transitions = advanceCareerClock(state, '2022-01-20');
    
    // Should start C8
    expect(transitions.length).toBeGreaterThan(0);
    expect(transitions[0].campaign_id).toBe('c8');
    expect(transitions[0].kind).toBe('ENTER');
    expect(state.spotlight_campaign_id).toBe('c8');
    expect(state.campaign_progress!['c8'].status).toBe('ACTIVE_FOCUS');

    // Advance to C5 start (2022-04-18)
    transitions = advanceCareerClock(state, '2022-04-20');
    // Should start C5, suspending C8
    expect(transitions.some(t => t.campaign_id === 'c5' && t.kind === 'ENTER')).toBe(true);
    expect(state.spotlight_campaign_id).toBe('c5');
    expect(state.campaign_progress!['c5'].status).toBe('ACTIVE_FOCUS');
    expect(state.campaign_progress!['c8'].status).toBe('ACTIVE_DORMANT');

    // Advance to C5 end
    transitions = advanceCareerClock(state, '2022-05-30');
    // C5 should END, and C8 should RESUME
    expect(transitions.some(t => t.campaign_id === 'c5' && t.kind === 'COMPLETE')).toBe(true);
    expect(transitions.some(t => t.campaign_id === 'c8' && t.kind === 'RESUME')).toBe(true);
    expect(state.spotlight_campaign_id).toBe('c8');
    expect(state.campaign_progress!['c8'].status).toBe('ACTIVE_FOCUS');
  });

  it('should resume dormant campaign with earliest next event, independent of alphabetical ID order', () => {
    // Alphabetically 'c8' < 'gme'.
    // Chronologically 'gme' (ends 2021-02-05) < 'c8' (ends 2023-10-13).
    // If both are dormant and some active campaign ends, it should resume 'gme'.
    const state: GameState = {
      career_clock: { current_at: '2021-01-01', transition_cursor: null, last_advance_at: '2021-01-01' },
      campaign_progress: {
        'c8': { status: 'ACTIVE_DORMANT', resolved_beat_ids: [], next_beat_index: 0 },
        'gme': { status: 'ACTIVE_DORMANT', resolved_beat_ids: [], next_beat_index: 0 },
        'c4': { status: 'ACTIVE_FOCUS', resolved_beat_ids: [], next_beat_index: 0 } // 'c4' will end on 2020-03-23 in the clock advance, but wait, let's just use 'c5'
      },
      spotlight_campaign_id: 'c5', // c5 ends 2022-04-22
      active_campaign_ids: ['c8', 'gme', 'c5']
    } as any;

    // Force date to a time where c5 ends
    state.career_clock.current_at = '2022-04-21';
    const transitions = advanceCareerClock(state, '2022-04-23');
    
    expect(transitions.some(t => t.campaign_id === 'c5' && t.kind === 'COMPLETE')).toBe(true);
    
    // It should pick 'gme' to RESUME because gme's end date (2021-02-05) is EARLIER than c8's end date (2023-10-13).
    const resumeTransition = transitions.find(t => t.kind === 'RESUME');
    expect(resumeTransition).toBeDefined();
    expect(resumeTransition!.campaign_id).toBe('gme');
  });
});
