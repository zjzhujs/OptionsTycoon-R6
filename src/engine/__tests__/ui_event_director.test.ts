import { describe, expect, it } from 'vitest';
import {
  UI_EVENT_PRIORITY,
  isBlockingTier,
  selectActiveUIEvent,
} from '../uiEventDirector';

describe('UIEventDirector', () => {
  it('keeps the required priority order', () => {
    expect(UI_EVENT_PRIORITY).toEqual([
      'INTRUSIVE_DRAMA',
      'MANDATORY_STORY',
      'CRITICAL_COMPLIANCE',
      'POSITION_DECISION',
      'MANDATORY_TUTORIAL',
      'SIDE_EVENT',
      'REVIEW_OUTCOME',
      'NON_BLOCKING_NOTIFICATION',
    ]);
  });

  it('selects exactly one winner and lets intrusive drama pre-empt the ordinary story surface', () => {
    const winner = selectActiveUIEvent([
      { id: 'review', tier: 'REVIEW_OUTCOME', active: true },
      { id: 'story', tier: 'MANDATORY_STORY', active: true },
      { id: 'drama', tier: 'INTRUSIVE_DRAMA', active: true },
      { id: 'tutorial', tier: 'MANDATORY_TUTORIAL', active: true },
    ]);

    expect(winner?.id).toBe('drama');
    expect(isBlockingTier(winner?.tier)).toBe(true);
  });

  it('uses declaration order for same-tier events', () => {
    const winner = selectActiveUIEvent([
      { id: 'first-review', tier: 'REVIEW_OUTCOME', active: true },
      { id: 'second-review', tier: 'REVIEW_OUTCOME', active: true },
    ]);

    expect(winner?.id).toBe('first-review');
  });

  it('returns no event when every candidate is inactive', () => {
    expect(selectActiveUIEvent([{ id: 'story', tier: 'MANDATORY_STORY', active: false }])).toBeNull();
    expect(isBlockingTier('NON_BLOCKING_NOTIFICATION')).toBe(false);
  });
});
