import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';

beforeEach(() => {
  localStorage.clear();
});

describe('R2 P2 integrity', () => {
  it('does not manufacture drawdown from a zero-capital start', () => {
    const view = game.new_game({
      campaign_id: 'r1',
      mode: 'SANDBOX',
      account_type: 'Margin',
      start_cash: 0,
      story_seed: 2001,
    });

    expect(view.state.peak_aum).toBe(0);
    expect(view.state.max_drawdown_pct).toBe(0);
  });
});
