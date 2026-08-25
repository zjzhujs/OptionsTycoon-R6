import type { CharacterAffect, GameState, Relationship, RelationshipStage, RelationshipStageState } from '../schemas';
import { record_memory } from './character_arc_engine';

const CHARACTER_IDS = ['maya_chen','victor_hale','evelyn_shaw','daniel_ross','marcus_reed','adrian_cross','leo_park'] as const;

function frictionCount(state: GameState, characterId: string): number {
  return (state.character_memories?.[characterId] ?? []).filter((m) => {
    const s = String(m.sentiment ?? '').toUpperCase();
    return s.includes('FRICTION') || s.includes('CONFLICT') || s.includes('BETRAY') || s.includes('HURT');
  }).length;
}

function positiveCount(state: GameState, characterId: string): number {
  return (state.character_memories?.[characterId] ?? []).filter((m) => {
    const s = String(m.sentiment ?? '').toUpperCase();
    return s.includes('TRUST') || s.includes('ALLY') || s.includes('LOYAL') || s.includes('SUPPORTED');
  }).length;
}

function repairProgressFromMemory(state: GameState, characterId: string): number {
  return (state.character_memories?.[characterId] ?? []).reduce((total, memory) => {
    if (String(memory.sentiment ?? '').toUpperCase() !== 'RELATIONSHIP_REPAIR_ACTION') return total;
    const encoded = String(memory.key_fact ?? '').match(/^relationship_repair:(\d+):/);
    return total + Number(encoded?.[1] ?? 10);
  }, 0);
}

function deriveStage(state: GameState, characterId: string, rel: Relationship, affect?: CharacterAffect): { stage: RelationshipStage; reason: string } {
  const trust = rel.trust ?? 40;
  const respect = rel.respect ?? 40;
  const favor = rel.favor ?? 10;
  const rivalry = rel.rivalry ?? 0;
  const friction = frictionCount(state, characterId);
  const repairProgress = repairProgressFromMemory(state, characterId);
  // Old conflict remains in memory, but verified follow-through can gradually offset how
  // much of that history still governs today's working relationship. We never delete
  // the old memory; repair credit only reduces its present stage pressure.
  // Repair credit softens, but does not erase, the friction memories that drive
  // the selector. Keeping a residual pressure prevents one burst of goodwill
  // from jumping a visibly damaged relationship straight back to neutral.
  const activeFriction = Math.max(0, friction - Math.floor(repairProgress / 50));
  const positive = positiveCount(state, characterId);
  const cold = affect?.toward_player === 'COLD' || affect?.toward_player === 'HOSTILE';
  const wounded = (affect?.emotion === 'HURT' || affect?.emotion === 'ANGRY' || affect?.emotion === 'FRUSTRATED') && (affect?.intensity ?? 0) >= 58;

  if (characterId === 'adrian_cross') {
    if (rivalry >= 62) return { stage: 'RIVAL', reason: '竞争强度已经高到双方会主动针对彼此的弱点，但尊重仍可能与敌意并存。' };
    if (trust >= 62 && favor >= 30 && respect >= 58) return { stage: 'ALLY', reason: '你们不是朋友，但已经形成稳定、可被调用的互惠通道。' };
    if (trust < 26 || cold) return { stage: 'TENSE', reason: '他把你视作值得试探、但不值得提前亮底牌的对手。' };
    return { stage: 'PROFESSIONAL', reason: '你们会做生意，也会彼此防备。' };
  }

  // Marcus is a regulator, not a conventional ally. High respect improves process,
  // but never becomes a friendship buff that lowers scrutiny.
  if (characterId === 'marcus_reed') {
    if (trust < 18 || (cold && activeFriction >= 2)) return { stage: 'DETACHED', reason: '沟通只剩正式记录；他不再给予任何非必要解释空间。' };
    if (trust < 30 || activeFriction >= 2 || cold) return { stage: 'TENSE', reason: '他仍会听你解释，但所有回答都被当作需要核验的主张。' };
    return { stage: 'PROFESSIONAL', reason: respect >= 58 ? '他尊重你的流程纪律，但审查强度不因此下降。' : '关系保持在纯粹职业层面。' };
  }

  if (trust <= 13 && activeFriction >= 3) return { stage: 'BROKEN', reason: '这已经不是一次争执。对方不再相信一句安抚或一次正确交易能修复关系。' };
  if (trust < 24 || (cold && wounded) || activeFriction >= 4) return { stage: 'DETACHED', reason: '对方开始职业性抽离：继续履行职责，但不再主动替你补缺口。' };
  if (trust < 38 || activeFriction >= 2 || wounded) return { stage: 'TENSE', reason: '关系处在持续摩擦中；观点仍会给，但语气、信息深度和主动性都开始收缩。' };
  if (trust >= 68 && respect >= 60 && positive >= 1 && !cold) return { stage: 'ALLY', reason: '对方愿意把自己的声誉、时间或内部判断押在你身上。' };
  return { stage: 'PROFESSIONAL', reason: '彼此能合作，但还没有到会替对方承担额外风险的程度。' };
}

export function record_verified_repair_action(
  state: GameState,
  characterId: string,
  description: string,
  strength = 10,
): RelationshipStageState | undefined {
  const current = stage_for(state, characterId);
  if (!current || !['TENSE', 'DETACHED', 'BROKEN'].includes(current.stage)) return current;
  const credit = Math.max(1, Math.min(30, Math.round(strength)));
  const before = current.repair_progress ?? 0;
  const rel = state.relationships?.[characterId];
  if (rel) {
    rel.trust = Math.max(0, Math.min(100, (rel.trust ?? 40) + Math.round(credit * 0.2)));
    rel.respect = Math.max(0, Math.min(100, (rel.respect ?? 40) + Math.round(credit * 0.1)));
  }
  if (credit > 0) {
    record_memory(
      state,
      characterId,
      `你没有靠安抚，而是用可验证行动修复关系：${description}。修复信用 ${before} → ${current.repair_progress}。`,
      'RELATIONSHIP_REPAIR_ACTION',
      `relationship_repair:${credit}:${description.slice(0, 48)}`,
    );
  }
  // Re-evaluate immediately: a serious action may move BROKEN -> DETACHED, but a
  // single action cannot erase low trust or the remaining un-repaired friction.
  return refresh_relationship_stages(state)[characterId];
}

export function refresh_relationship_stages(state: GameState): Record<string, RelationshipStageState> {
  // Selector only: relationship stage is reconstructed from canonical relationships,
  // memories, and the current emotion snapshot. Never write a second truth source.
  const current: Record<string, RelationshipStageState> = {};
  const rels = state.relationships ?? {};

  for (const characterId of CHARACTER_IDS) {
    const rel = rels[characterId];
    if (!rel) continue;
    const derived = deriveStage(state, characterId, rel, state.character_emotions?.[characterId]);
    current[characterId] = {
      stage: derived.stage,
      since_episode: state.current_episode_number ?? 1,
      reason: derived.reason,
      previous_stage: null,
      transition_count: 0,
      repair_progress: Math.min(100, repairProgressFromMemory(state, characterId)),
    };
  }
  return current;
}

export function stage_for(state: GameState, characterId: string): RelationshipStageState | undefined {
  return refresh_relationship_stages(state)[characterId];
}

export function disclosure_level(state: GameState, characterId: string): 'FULL' | 'NORMAL' | 'MINIMUM' | 'FORMAL_ONLY' {
  const stage = stage_for(state, characterId)?.stage ?? 'PROFESSIONAL';
  if (stage === 'ALLY') return 'FULL';
  if (stage === 'DETACHED') return 'MINIMUM';
  if (stage === 'BROKEN') return 'FORMAL_ONLY';
  if (stage === 'RIVAL') return 'MINIMUM';
  return 'NORMAL';
}

export function repair_response_modifier(state: GameState, characterId: string): { trustMultiplier: number; intensityMultiplier: number; note?: string } {
  const stage = stage_for(state, characterId)?.stage;
  if (stage === 'BROKEN') return { trustMultiplier: 0, intensityMultiplier: 0.08, note: '关系已经破裂。一次安抚不会修复它；只有后续可验证的行动会重新建立信任。' };
  if (stage === 'DETACHED') return { trustMultiplier: 0.35, intensityMultiplier: 0.45, note: '对方已经开始抽离。善意会被听见，但不会被当作修复本身。' };
  if (stage === 'TENSE') return { trustMultiplier: 0.7, intensityMultiplier: 0.75 };
  return { trustMultiplier: 1, intensityMultiplier: 1 };
}

export function stage_label(stage?: RelationshipStage): string {
  if (stage === 'ALLY') return '盟友';
  if (stage === 'TENSE') return '紧张';
  if (stage === 'DETACHED') return '抽离';
  if (stage === 'BROKEN') return '破裂';
  if (stage === 'RIVAL') return '竞争对手';
  return '专业合作';
}
