import { describe, expect, it } from 'vitest';
import * as game from '../game';
import type { GameStateView } from '../schemas';

function start() { return game.new_game({ campaign_id:'r1', mode:'STORY_CAMPAIGN', account_type:'Margin', start_cash:1_000_000, story_seed:17 }).state.session_id; }

function viewOf(result: Array<GameStateView | string>): GameStateView {
  const view = result[0];
  if (typeof view === 'string') throw new Error(view);
  return view;
}

describe('Thesis Collision', () => {
  it('queues after thesis creation in EP2 and rewards second-order inquiry without forcing an answer', () => {
    const sid=start();
    const st=game.get_session(sid); st.current_episode_number=2;
    game.record_player_decision(sid,'THESIS_CREATED','EP2: Thesis ready','EP2: test');
    let view=game.get_view(sid); const c=view.state.thesis_collisions?.find(x=>!x.resolved);
    expect(c?.episode).toBe(2); expect(c?.second_order_revealed).toBe(false);
    const before=view.state.thesis_session_profile?.second_order_thinking ?? 0;
    // V6: first-order information arrives sequentially through Noise Stream.
    // The second-order chamber is intentionally locked until the player has
    // classified every arrived signal without seeing future signals early.
    for (let i=0;i<c!.signals.length;i++) {
      view=game.get_view(sid);
      const current=view.state.noise_stream?.find(x=>x.collision_id===c!.id && x.arrived && !x.classification);
      expect(current).toBeTruthy();
      game.classify_thesis_collision_signal(sid,c!.id,current!.signal_id,current!.source_name.includes('Victor') ? 'WATCH' : 'DRIVER');
    }
    view=viewOf(game.reveal_thesis_collision_second_order(sid,c!.id));
    expect(view.state.thesis_collisions?.find(x=>x.id===c!.id)?.second_order_revealed).toBe(true);
    expect(view.state.thesis_session_profile!.second_order_thinking).toBeGreaterThan(before);
    game.update_thesis_hypothesis_frame(sid,c!.id,'调用量扩张必须足以抵消单位经济压缩。','云厂商同步下修 CapEx 且利用率没有回升。','我可能低估估值倍数压缩。');
    view=viewOf(game.resolve_thesis_collision(sid,c!.id,'REVISE','效率提升可能扩大调用量，但单位经济和估值并不必然同步，因此我下调仓位表达而不是简单反转方向。'));
    expect(view.state.thesis_collisions?.find(x=>x.id===c!.id)?.resolved).toBe(true);
    expect(view.state.player_decisions?.some(d=>d.category==='THESIS_STRESS_TEST_COMPLETED')).toBe(true);
  });

  it('can explicitly conclude there is no edge', () => {
    const sid=start(); const st=game.get_session(sid); st.current_episode_number=5;
    game.record_player_decision(sid,'THESIS_CREATED','EP5: Thesis ready','EP5: test');
    let view=game.get_view(sid); const c=view.state.thesis_collisions!.find(x=>!x.resolved)!;
    for (let i=0;i<c.signals.length;i+=1) {
      view=game.get_view(sid);
      const incoming=view.state.noise_stream!.find(x=>x.collision_id===c.id && x.arrived && !x.classification)!;
      game.classify_thesis_collision_signal(sid,c.id,incoming.signal_id,'WATCH');
    }
    game.update_thesis_hypothesis_frame(sid,c.id,'公司基本面与宏观久期风险必须能被拆开。','如果相关风险无法被有效对冲，我就没有独立优势。','我可能把分散标的误当成分散风险。');
    view=viewOf(game.resolve_thesis_collision(sid,c.id,'NO_EDGE','公司判断和利率风险无法分离，我没有足够优势去为这组相关风险付价格。'));
    expect(view.state.player_decisions?.some(d=>d.category==='NO_TRADE_DECISION')).toBe(true);
  });

  it('requires a falsifiable PM hypothesis frame before final resolution', () => {
    const sid=start(); const st=game.get_session(sid); st.current_episode_number=2;
    game.record_player_decision(sid,'THESIS_CREATED','EP2 Thesis ready','test');
    let view=game.get_view(sid); const c=view.state.thesis_collisions!.find(x=>!x.resolved)!;
    for(let i=0;i<c.signals.length;i+=1){
      view=game.get_view(sid); const incoming=view.state.noise_stream!.find(x=>x.collision_id===c.id&&x.arrived&&!x.classification)!;
      game.classify_thesis_collision_signal(sid,c.id,incoming.signal_id,'WATCH');
    }
    expect(() => game.resolve_thesis_collision(sid,c.id,'HOLD','我仍然相信原方向。')).toThrow(/假设框架/);
    expect(() => game.update_thesis_hypothesis_frame(sid,c.id,'太短','也短','')).toThrow();
    view=viewOf(game.update_thesis_hypothesis_frame(sid,c.id,'推理调用量必须持续扩张并抵消单位硬件经济压缩。','云厂商同步下修 CapEx 且利用率没有回升。','我可能忽略估值反身性。'));
    expect(view.state.thesis_collisions!.find(x=>x.id===c.id)!.hypothesis_frame).toBeTruthy();
    view=viewOf(game.resolve_thesis_collision(sid,c.id,'HOLD','证伪条件尚未出现，因此暂时坚持，但降低表达强度。'));
    expect(view.state.thesis_collisions!.find(x=>x.id===c.id)!.resolved).toBe(true);
  });

});
