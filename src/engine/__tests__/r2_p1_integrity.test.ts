import { beforeEach, describe, expect, it } from 'vitest';
import * as game from '../game';
import { inquiryDue } from '../engines/lp_inquiry_engine';

beforeEach(() => {
  localStorage.clear();
});

describe('R2 P1 integrity', () => {
  it('uses campaign metadata for Story Campaign defaults while preserving explicit overrides', () => {
    const defaults = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', story_seed: 1001 });
    expect(defaults.state.account_type).toBe('Margin');
    expect(defaults.state.start_cash).toBe(10_000_000);

    const override = game.new_game({
      campaign_id: 'r1',
      mode: 'STORY_CAMPAIGN',
      account_type: 'TFSA',
      start_cash: 75_000,
      story_seed: 1002,
    });
    expect(override.state.account_type).toBe('TFSA');
    expect(override.state.start_cash).toBe(75_000);
  });

  it('gates opening risk on the mandatory briefing and then on a thesis', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', story_seed: 1003 });
    const sid = view.state.session_id;
    const opening = view.pending_story_public!.find((event) => event.template_id === 'day1_briefing_maya')!;
    const [, beforeBriefing] = game.place_order(sid, { side: 'buy_shares', qty: 1, order_kind: 'Market' });
    expect(beforeBriefing.accepted).toBe(false);
    expect(beforeBriefing.execution_label).toBe('BRIEFING_REQUIRED');

    game.resolve_story_choice(sid, opening.id, 'neutral_wait');
    const [, withoutThesis] = game.place_order(sid, { side: 'buy_shares', qty: 1, order_kind: 'Market' });
    expect(withoutThesis.accepted).toBe(false);
    expect(withoutThesis.execution_label).toBe('THESIS_REQUIRED');

    const [, withThesis] = game.place_order(sid, {
      side: 'buy_to_open',
      type: 'call',
      strike: 140,
      expiration: '2025-01-31',
      qty: 1,
      order_kind: 'Market',
      thesis: {
        contract_or_symbol: 'NVDA CALL 140',
        direction: 'BULLISH',
        catalyst: 'Earnings',
        expected_move_pct: 5,
        time_horizon_days: 5,
        invalidation_level: 130,
        why_instrument: 'Convexity',
        risk_budget_usd: 5_000,
      },
    });
    expect(withThesis.execution_label).not.toBe('THESIS_REQUIRED');
  });

  it('records LP inquiry resolution once and keeps the due gate closed after refresh', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', story_seed: 1004 });
    const state = game.get_session(view.state.session_id);
    state.game_day_index = 6;
    state.trade_reviews = [{ trade_id: 'review-1' } as never];
    expect(inquiryDue(state, 6, 7)).toBe(true);

    game.resolve_lp_inquiry(state.session_id, 'ADMIT_AND_REFORM');
    const afterFirst = game.get_session(state.session_id);
    const confidence = afterFirst.fund_stats.lp_confidence;
    const decisionCount = afterFirst.player_decisions?.filter((event) => event.category === 'LP_INQUIRY').length;
    game.resolve_lp_inquiry(state.session_id, 'STAND_GROUND_LOGIC');
    const afterSecond = game.get_session(state.session_id);
    expect(afterSecond.lp_inquiry_state?.answered).toBe(true);
    expect(afterSecond.fund_stats.lp_confidence).toBe(confidence);
    expect(afterSecond.player_decisions?.filter((event) => event.category === 'LP_INQUIRY').length).toBe(decisionCount);
    expect(inquiryDue(afterSecond, 6, 7)).toBe(false);
  });

  it('reports the authoritative filled quantity when closing less than a requested amount', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Margin', start_cash: 1_000_000, story_seed: 1005 });
    const sid = view.state.session_id;
    const [, opened] = game.place_order(sid, {
      side: 'buy_to_open',
      type: 'call',
      strike: 140,
      expiration: '2025-01-31',
      qty: 2,
      order_kind: 'Market',
    });
    expect(opened.accepted).toBe(true);
    const [, closed] = game.place_order(sid, {
      side: 'sell_to_close',
      type: 'call',
      strike: 140,
      expiration: '2025-01-31',
      qty: 5,
      order_kind: 'Market',
    });
    expect(closed.accepted).toBe(true);
    expect(closed.filled_qty).toBe(2);
  });
});
