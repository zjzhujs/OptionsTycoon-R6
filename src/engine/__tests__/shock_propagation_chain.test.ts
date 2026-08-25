import { describe, expect, it } from 'vitest';
import * as game from '../game';
import * as dataLoader from '../data_loader';

function ready(): { sid: string; collisionId: string } {
  const sid = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', account_type: 'Margin', start_cash: 1_000_000, story_seed: 1414 }).state.session_id;
  const state = game.get_session(sid); state.current_episode_number = 2;
  game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 Thesis ready', 'shock map');
  let view = game.get_view(sid); const collision = view.state.thesis_collisions!.find((c) => !c.resolved)!;
  const briefing = view.pending_story_public?.find((event) => event.template_id === 'day1_briefing_maya');
  if (briefing) game.resolve_story_choice(sid, briefing.id, 'neutral_wait');
  while (true) {
    view = game.get_view(sid); const incoming = view.state.noise_stream!.find((x) => x.arrived && !x.classification);
    if (!incoming) break; game.classify_thesis_collision_signal(sid, collision.id, incoming.signal_id, 'WATCH');
  }
  return { sid, collisionId: collision.id };
}

const R = ['低成本推理扩大调用量。','客户与竞争者会重新调整供需和议价。','扩产成功可能消灭稀缺溢价。','CapEx 下修且利用率恶化就停。'] as const;
const S = ['AI 模型效率冲击首先改变算力需求预期和芯片估值锚。','云厂商会调整模型、芯片与资本开支组合而不是只做单一减仓。','资本开支、融资成本与产业竞争会继续反馈到订单和估值。','第一轮受损的芯片链之外，低成本推理应用和替代算力可能出现二阶赢家。','观察云厂商 CapEx 指引、GPU 利用率与推理调用量是否朝同一方向变化。'] as const;

describe('V14 shock propagation chain', () => {
  it('anchors only to a verified event already public by the current game date', () => {
    const { sid, collisionId } = ready(); const view = game.get_view(sid); const collision = view.state.thesis_collisions!.find(c=>c.id===collisionId)!;
    expect(collision.shock_anchor?.date <= view.state.market_clock!.current_node_date).toBe(true);
    expect(collision.shock_anchor?.date).toBe('2025-01-20');
    expect(collision.shock_anchor?.headline).toContain('DeepSeek-R1');
    expect(collision.shock_anchor?.source_type).toBe('REAL');
    expect(collision.shock_anchor?.headline).not.toContain('收盘暴跌'); // Jan 27 is still future on Jan 23.
  });

  it('freezes the player-authored propagation chain into entry and restores it in Review', () => {
    const { sid, collisionId } = ready();
    game.update_thesis_hypothesis_frame(sid,collisionId,'调用量扩张必须抵消单位经济压缩。','云厂商下修投入且利用率不回升。','可能低估反馈。',65,R[0],R[1],R[2],R[3],S[0],S[1],S[2],S[3],S[4]);
    game.resolve_thesis_collision(sid,collisionId,'HOLD','传导链还没被公开数据证伪，但我会等下一条链路。');
    const [,buy]=game.place_order(sid,{side:'buy_to_open',qty:1,order_kind:'Market',type:'call',strike:140,expiration:'2025-01-31',thesis:{contract_or_symbol:'CALL 140',direction:'BULLISH',catalyst:'AI demand',expected_move_pct:3,time_horizon_days:5,invalidation_level:130,why_instrument:'convexity',risk_budget_usd:5000}});
    expect(buy.accepted).toBe(true); const state=game.get_session(sid), pos=state.positions![0];
    const shockFrame = state.thesis_collisions!.find((collision) => collision.id === collisionId)!.hypothesis_frame?.shock_propagation_frame;
    expect(shockFrame).toBeTruthy();
    const frozen=JSON.stringify(shockFrame);
    game.revise_thesis(sid,{position_id:pos.id,direction:'BULLISH',catalyst:'revised',expected_move_pct:2,time_horizon_days:6,invalidation_level:129,why_instrument:'lower risk',risk_budget_usd:4000,revision_reason:'幅度改变，但事件传导假设未被重写。'});
    expect(JSON.stringify(game.get_session(sid).thesis_collisions!.find((collision) => collision.id === collisionId)!.hypothesis_frame?.shock_propagation_frame)).toBe(frozen);
    const nodes=dataLoader.get_campaign_nodes('r1'); state.game_day_index=3; state.market_clock!.current_node_index=3; state.market_clock!.current_node_date=nodes[3].date;
    const [closed,close]=game.place_order(sid,{side:'sell_to_close',qty:1,order_kind:'Market',type:'call',strike:140,expiration:'2025-01-31'}); expect(close.accepted).toBe(true);
    const review=closed.state.trade_reviews!.find(r=>r.trade_id===close.trade_review_id)!;
    expect(review.trade_id).toBe(close.trade_review_id);
    expect(review.entry_snapshot).toBeTruthy();
    expect(review.exit_snapshot).toBeTruthy();
  });
});
