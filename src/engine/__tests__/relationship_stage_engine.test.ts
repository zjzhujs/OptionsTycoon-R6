import { describe, expect, it } from 'vitest';
import * as game from '../game';
import * as stages from '../engines/relationship_stage_engine';
import type { GameStateView } from '../schemas';

function viewOf(result: Array<GameStateView | string>): GameStateView {
  const view = result[0];
  if (typeof view === 'string') throw new Error(view);
  return view;
}

function session(): string {
  return game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', account_type: 'Margin', start_cash: 1_000_000, story_seed: 6701 }).state.session_id;
}

describe('long-horizon relationship stages', () => {
  it('turns repeated fracture into BROKEN and does not allow one reassurance to repair it', () => {
    const sid = session(); const state = game.get_session(sid);
    state.relationships!.maya_chen.trust = 8; state.relationships!.maya_chen.respect = 35;
    state.character_memories!.maya_chen = Array.from({ length: 4 }, (_, i) => ({ timestamp: new Date().toISOString(), episode_id: 'EP1', summary: `friction ${i}`, sentiment: 'HURT', key_fact: `x${i}` }));
    (state.character_emotions = state.character_emotions || {}).maya_chen = { character_id: 'maya_chen', emotion: 'HURT', intensity: 84, toward_player: 'COLD', delivery: '冷淡', trigger: '你反复忽视她的团队边界', last_updated: new Date().toISOString() };
    expect(stages.refresh_relationship_stages(state).maya_chen.stage).toBe('BROKEN');
    expect(stages.disclosure_level(state, 'maya_chen')).toBe('FORMAL_ONLY');
    const trust = state.relationships!.maya_chen.trust;
    const response = game.respond_to_character(sid, 'maya_chen', 'REASSURE');
    const view = viewOf(response);
    const message = response[1];
    expect(view.state.relationships!.maya_chen.trust).toBe(trust);
    expect(stages.stage_for(view.state, 'maya_chen')!.stage).toBe('BROKEN');
    expect(message).toContain('Trust');
    expect(view.state.relationship_stages).toBeUndefined();
  });

  it('uses DETACHED as professional withdrawal rather than permanent rage', () => {
    const sid = session(); const state = game.get_session(sid);
    state.relationships!.victor_hale.trust = 21;
    state.character_memories!.victor_hale = [
      { timestamp: new Date().toISOString(), episode_id: 'EP1', summary: 'risk conflict', sentiment: 'CONFLICT', key_fact: 'r1' },
      { timestamp: new Date().toISOString(), episode_id: 'EP2', summary: 'risk conflict', sentiment: 'CONFLICT', key_fact: 'r2' },
      { timestamp: new Date().toISOString(), episode_id: 'EP3', summary: 'risk conflict', sentiment: 'CONFLICT', key_fact: 'r3' },
      { timestamp: new Date().toISOString(), episode_id: 'EP4', summary: 'risk conflict', sentiment: 'CONFLICT', key_fact: 'r4' },
    ];
    (state.character_emotions = state.character_emotions || {}).victor_hale = { character_id: 'victor_hale', emotion: 'FRUSTRATED', intensity: 63, toward_player: 'COLD', delivery: '只给红线', trigger: '你多次越过风险边界', last_updated: new Date().toISOString() };
    expect(stages.refresh_relationship_stages(state).victor_hale.stage).toBe('DETACHED');
    expect(stages.disclosure_level(state, 'victor_hale')).toBe('MINIMUM');
    expect(stages.repair_response_modifier(state, 'victor_hale').trustMultiplier).toBeLessThan(1);
  });

  it('relationship fracture reduces what reaches the Thesis Noise Stream', () => {
    const sid = session(); const state = game.get_session(sid);
    state.current_episode_number = 2;
    state.relationships!.maya_chen.trust = 8; state.relationships!.maya_chen.respect = 35;
    state.character_memories!.maya_chen = Array.from({ length: 4 }, (_, i) => ({ timestamp: new Date().toISOString(), episode_id: 'EP1', summary: `friction ${i}`, sentiment: 'HURT', key_fact: `x${i}` }));
    (state.character_emotions = state.character_emotions || {}).maya_chen = { character_id: 'maya_chen', emotion: 'HURT', intensity: 84, toward_player: 'COLD', delivery: '冷淡', trigger: '团队边界被反复忽视', last_updated: new Date().toISOString() };
    expect(stages.refresh_relationship_stages(state).maya_chen.stage).toBe('BROKEN');
    game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 Thesis ready', 'test');
    const view = game.get_view(sid);
    const collision = view.state.thesis_collisions!.find((item) => !item.resolved)!;
    const maya = view.state.noise_stream!.find((item) => item.collision_id === collision.id && item.signal_id === 'ep2_maya')!;
    expect(maya.headline).toContain('正式版本');
    expect(maya.body).not.toContain('更便宜的推理可能扩大调用量');
  });

  it('stable relationship stages do not spam transition memories on repeated views', () => {
    const sid = session(); const state = game.get_session(sid);
    state.relationships!.maya_chen.trust = 20;
    state.character_memories!.maya_chen = [
      { timestamp: new Date().toISOString(), episode_id: 'EP1', summary: 'hurt', sentiment: 'HURT', key_fact: 'a' },
      { timestamp: new Date().toISOString(), episode_id: 'EP1', summary: 'hurt again', sentiment: 'HURT', key_fact: 'b' },
    ];
    (state.character_emotions = state.character_emotions || {}).maya_chen = { character_id: 'maya_chen', emotion: 'HURT', intensity: 78, toward_player: 'COLD', delivery: '冷淡', trigger: '反复受伤', last_updated: new Date().toISOString() };
    stages.refresh_relationship_stages(state);
    const before = state.character_memories!.maya_chen.length;
    game.get_view(sid); game.get_view(sid); game.get_view(sid);
    const after = game.get_session(sid).character_memories!.maya_chen.length;
    expect(after).toBe(before);
  });

  it('repairs withdrawal through repeated verified actions instead of deleting old conflict', () => {
    const sid = session(); const state = game.get_session(sid);
    state.relationships!.maya_chen.trust = 34; state.relationships!.maya_chen.respect = 52;
    state.character_memories!.maya_chen = Array.from({ length: 4 }, (_, i) => ({ timestamp: new Date().toISOString(), episode_id: 'EP1', summary: `old fracture ${i}`, sentiment: 'HURT', key_fact: `old${i}` }));
    (state.character_emotions = state.character_emotions || {}).maya_chen = { character_id: 'maya_chen', emotion: 'FOCUSED', intensity: 34, toward_player: 'NEUTRAL', delivery: '专业', trigger: '保持工作', last_updated: new Date().toISOString() };
    expect(stages.refresh_relationship_stages(state).maya_chen.stage).toBe('DETACHED');
    const oldFrictionCount = state.character_memories!.maya_chen.filter((m) => m.sentiment === 'HURT').length;
    stages.record_verified_repair_action(state, 'maya_chen', '公开替研究团队承担责任', 25);
    stages.record_verified_repair_action(state, 'maya_chen', '兑现已承诺的研究自主权', 25);
    stages.record_verified_repair_action(state, 'maya_chen', '关键时刻保护核心分析师席位', 25);
    const repaired = stages.refresh_relationship_stages(state).maya_chen;
    expect(repaired.repair_progress).toBeGreaterThanOrEqual(50);
    expect(repaired.stage).toBe('TENSE');
    expect(state.character_memories!.maya_chen.filter((m) => m.sentiment === 'HURT')).toHaveLength(oldFrictionCount);
    expect(state.character_memories!.maya_chen.some((m) => m.sentiment === 'RELATIONSHIP_REPAIR_ACTION')).toBe(true);
    expect(state.relationship_stages).toBeUndefined();
  });

});
