import { describe, expect, it } from 'vitest';
import * as game from '../game';

const CALL_140 = { type: 'call' as const, strike: 140, expiration: '2025-01-31' };

function storySession(): string {
  return game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', account_type: 'Margin', start_cash: 1_000_000, story_seed: 6601 }).state.session_id;
}

describe('Noise Stream + STOP THE DESK', () => {
  it('releases one source at a time and does not expose internal stance labels', () => {
    const sid = storySession();
    const state = game.get_session(sid);
    state.current_episode_number = 2;
    game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 Thesis ready', 'test');
    let view = game.get_view(sid);
    const collision = view.state.thesis_collisions!.find((item) => !item.resolved)!;
    let items = view.state.noise_stream!.filter((item) => item.collision_id === collision.id);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect('stance' in items[0]).toBe(false);
    expect(items.every((item) => !('stance' in item))).toBe(true);
    expect(collision.signals.length).toBeGreaterThanOrEqual(items.length);
    const marketIndex = view.market_clock!.current_node_index;
    const gated = game.advance_market(sid, 'NEXT_NODE');
    expect(gated.market_clock!.current_node_index).toBeGreaterThanOrEqual(marketIndex);
    expect(gated.state.noise_stream).toBeTruthy();
    const hidden = game.get_session(sid).noise_stream!.find((item) => item.collision_id === collision.id && !item.arrived)!;
    expect(() => game.classify_thesis_collision_signal(sid, collision.id, hidden.signal_id, 'WATCH')).toThrow();

    for (let i = 0; i < collision.signals.length; i += 1) {
      view = game.get_view(sid);
      const incoming = view.state.noise_stream!.find((item) => item.collision_id === collision.id && item.arrived && !item.classification)!;
      game.classify_thesis_collision_signal(sid, collision.id, incoming.signal_id, i === 0 ? 'DRIVER' : i === 1 ? 'NOISE' : 'WATCH');
    }
    view = game.get_view(sid);
    expect(view.state.thesis_collisions!.find((item) => item.id === collision.id)!.ready_for_resolution).toBe(true);
    items = view.state.noise_stream!.filter((item) => item.collision_id === collision.id);
    expect(items.every((item) => Boolean(item.classification))).toBe(true);
  });

  it('snapshots the source emotion at the moment a signal actually arrives', () => {
    const sid = storySession(); const state = game.get_session(sid); state.current_episode_number = 2;
    game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 Thesis ready', 'emotion-arrival test');
    let view = game.get_view(sid); const collision = view.state.thesis_collisions!.find((item) => !item.resolved)!;
    (state.character_emotions = state.character_emotions || {}).victor_hale = { character_id: 'victor_hale', emotion: 'PRESSURED', intensity: 81, toward_player: 'TESTING', delivery: '只问生存数字', trigger: '风险预算逼近红线', updated_episode: 2 };
    const first = view.state.noise_stream!.find((item) => item.collision_id === collision.id)!;
    game.classify_thesis_collision_signal(sid, collision.id, first.signal_id, 'WATCH');
    view = game.get_view(sid);
    const victor = view.state.noise_stream!.find((item) => item.collision_id === collision.id && item.source_name.includes('Victor'))!;
    expect(victor.source_emotion).toBe('PRESSURED');
    expect(victor.source_emotion_intensity).toBe(81);
    expect(victor.source_pressure_line).toContain('最坏情况下');
  });

  it('freezes market time, blocks new risk, permits reductions, and requires evidence to resume', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'HISTORICAL_REPLAY', account_type: 'Margin', start_cash: 1_000_000, story_seed: 6602 });
    const sid = view.state.session_id;
    const [, buy] = game.place_order(sid, {
      side: 'buy_to_open', qty: 1, order_kind: 'Market', ...CALL_140,
      thesis: { contract_or_symbol: 'CALL 140', direction: 'BULLISH', catalyst: 'test', expected_move_pct: 3, time_horizon_days: 5, invalidation_level: 130, why_instrument: 'convexity', risk_budget_usd: 1_000 },
    });
    expect(buy.accepted).toBe(true);
    const before = game.get_view(sid).market_clock!.current_node_index;
    const commandBefore = game.get_view(sid).state.player_persona?.command ?? 0;
    game.stop_the_desk(sid, '信息链出现冲突，我先冻结新增风险重算。');
    expect(game.get_view(sid).state.player_persona?.command).toBeGreaterThan(commandBefore);
    const frozen = game.advance_market(sid, 'NEXT_NODE');
    expect(frozen.market_clock!.current_node_index).toBeGreaterThanOrEqual(before);
    expect(frozen.market_clock!.pause_reasons!.length).toBeGreaterThan(0);

    const [, add] = game.place_order(sid, { side: 'buy_to_open', qty: 1, order_kind: 'Market', ...CALL_140 });
    expect(add.accepted).toBe(false);
    expect(game.get_session(sid).positions).toHaveLength(1);
    const [, close] = game.place_order(sid, { side: 'sell_to_close', qty: 1, order_kind: 'Market', ...CALL_140 });
    expect(close.accepted).toBe(true);
    expect(game.get_session(sid).trade_reviews!.length).toBeGreaterThan(0);
    const [resumed] = game.resume_the_desk(sid, 'mock');
  });

  it('cannot resume a collision-linked stop before resolving the collision', () => {
    const sid = storySession(); const state = game.get_session(sid); state.current_episode_number = 2;
    game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 Thesis ready', 'test');
    let view = game.get_view(sid); let collision = view.state.thesis_collisions!.find((item) => !item.resolved)!;
    for (let i=0;i<collision.signals.length;i+=1) {
      view=game.get_view(sid);
      const incoming=view.state.noise_stream!.find((item)=>item.collision_id===collision.id && item.arrived && !item.classification)!;
      game.classify_thesis_collision_signal(sid, collision.id, incoming.signal_id, 'WATCH');
    }
    game.stop_the_desk(sid, '融资反馈可能改变持仓寿命，先停。', collision.id);
    expect(() => game.resume_the_desk(sid, '我想继续')).toThrow(/先完成这次 Thesis/);
    game.update_thesis_hypothesis_frame(sid, collision.id, '融资空间必须足以支撑我等到 Thesis 验证。', 'PB 提高保证金后现金 runway 低于安全线。', '我可能高估了融资的稳定性。');
    game.resolve_thesis_collision(sid, collision.id, 'REVISE', '融资反馈改变了可持续持仓期限，因此降低表达。');
    const [resumed] = game.resume_the_desk(sid, 'mock');
  });
});
