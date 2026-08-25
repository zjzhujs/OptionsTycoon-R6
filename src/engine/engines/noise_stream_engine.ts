import type { GameState, NoiseArrivalContext, NoiseStreamItem, ThesisCollision, ThesisSignal, ThesisSignalClassification } from '../schemas';
import * as relationshipStages from './relationship_stage_engine';
import * as characterEmotions from './character_emotion_engine';



function arrivalReason(state: GameState, signal: ThesisSignal, index = 0): string {
  if (signal.id.includes('_regulatory_')) return '监管状态已经跨过“可以以后再处理”的阈值，这条线路直接插入当前决策。';
  if (signal.id.includes('_human_')) return '这件外部事件在当前日期仍未解决，它正在和你的交易决定争夺同一份注意力。';
  if (signal.id.includes('_balance_sheet')) return '现金与融资约束已经足以改变“你能等多久”，所以在落单前被重新提到主屏。';
  if (signal.id.includes('_pb_')) return 'Prime Broker 的融资条件已经恶化，持仓寿命正在被重新定价。';
  if (signal.id.includes('_lp_')) return 'LP 信心 / 赎回风险刚进入需要主动管理的区间，资本方在你落单前要求被听见。';
  if (signal.id.includes('_intel_')) return '这是你自己主动链接进 Thesis 的情报；系统不会让它在最终决策时神秘消失。';
  if (index === 0) return '你刚写下 Thesis。第一位知道你观点的人立刻把自己的解释推上了桌面。';
  if (signal.kind === 'COUNTERPARTY') return '资金方 / 对手的约束正在变化，它在执行前主动打断。';
  if (signal.kind === 'POLICY') return '政策 / 监管边界已经进入当前交易的可用性与解释责任。';
  if (signal.kind === 'MARKET_STRUCTURE') return '盘口与流动性正在变化；即使方向不变，交易价格和可执行性也可能已经变了。';
  if (signal.kind === 'BEHAVIORAL') return '有人开始质疑：你现在是在更新模型，还是在替自己的情绪找理由。';
  return '新的证据在最终落单前进入工作台。';
}

function characterIdForSource(sourceName: string): string | null {
  const normalized = sourceName.toLowerCase();
  if (normalized.includes('maya')) return 'maya_chen';
  if (normalized.includes('victor')) return 'victor_hale';
  if (normalized.includes('leo')) return 'leo_park';
  if (normalized.includes('daniel')) return 'daniel_ross';
  if (normalized.includes('evelyn')) return 'evelyn_shaw';
  if (normalized.includes('marcus')) return 'marcus_reed';
  if (normalized.includes('adrian')) return 'adrian_cross';
  return null;
}

function disclosedSignal(state: GameState, signal: ThesisSignal): Pick<NoiseStreamItem, 'headline'|'body'|'motive'> {
  const characterId = characterIdForSource(signal.source_name);
  if (!characterId) return { headline: signal.headline, body: signal.body, motive: signal.motive };
  const level = relationshipStages.disclosure_level(state, characterId);
  if (level === 'FULL' || level === 'NORMAL') return { headline: signal.headline, body: signal.body, motive: signal.motive };
  if (level === 'FORMAL_ONLY') {
    return {
      headline: `${signal.source_name} 只发来正式版本`,
      body: `你没有拿到其内部判断或完整推演。正式摘要只确认：${signal.headline}。要不要把这条信息当成核心驱动，必须同时考虑你们当前的关系状态和信息缺口。`,
      motive: `关系已进入正式沟通层。原始动机与内部模型未向你完整披露。`,
    };
  }
  return {
    headline: `${signal.source_name} 给了结论，但没有把底牌全翻开`,
    body: `你拿到的是压缩后的判断：${signal.headline}。对方没有主动补充完整情景、反方变量或内部细节。`,
    motive: `当前关系限制了信息深度；已知公开动机：${signal.motive || '未明确'}`,
  };
}

function emotionalSnapshot(state: GameState, characterId: string | null) {
  if (!characterId) return {};
  const affect = state.character_emotions?.[characterId];
  const stage = relationshipStages.stage_for(state, characterId)?.stage ?? null;
  return {
    source_emotion: affect?.emotion ?? null,
    source_emotion_intensity: affect?.intensity ?? null,
    source_toward_player: affect?.toward_player ?? null,
    source_delivery: affect?.delivery ?? null,
    source_pressure_line: characterEmotions.pressure_line(characterId, affect) ?? null,
    source_relationship_stage: stage,
  };
}

function hydrateForArrival(state: GameState, item: NoiseStreamItem): void {
  const collision = (state.thesis_collisions ?? []).find((candidate) => candidate.id === item.collision_id);
  const signal = collision?.signals.find((candidate) => candidate.id === item.signal_id);
  if (!signal) return;
  relationshipStages.refresh_relationship_stages(state);
  const disclosed = disclosedSignal(state, signal);
  item.source_name = signal.source_name;
  item.source_role = signal.source_role;
  item.kind = signal.kind;
  item.headline = disclosed.headline;
  item.body = disclosed.body;
  item.reliability = signal.reliability;
  item.motive = disclosed.motive;
  item.arrival_reason = arrivalReason(state, signal, item.sequence);
  Object.assign(item, emotionalSnapshot(state, characterIdForSource(signal.source_name)));
}

function currentDate(state: GameState): string {
  return state.market_clock?.current_node_date || state.updated_at?.slice(0,10) || '2025-01-23';
}

function currentNodeIndex(state: GameState): number | null {
  const value = state.market_clock?.current_node_index ?? state.game_day_index;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function contextFor(signal: ThesisSignal, index: number): NoiseArrivalContext {
  if (index === 0) return 'THESIS_CREATED';
  if (signal.kind === 'COUNTERPARTY') return 'COUNTERPARTY';
  if (signal.kind === 'POLICY') return 'POLICY';
  if (signal.kind === 'BEHAVIORAL') return 'CHARACTER_CALL';
  return index % 2 === 0 ? 'MARKET_PULSE' : 'CHARACTER_CALL';
}

export function seed_for_collision(state: GameState, collision: ThesisCollision): NoiseStreamItem[] {
  const stream = (state.noise_stream ??= []);
  const existing = stream.filter((item) => item.collision_id === collision.id);
  if (existing.length) return existing;
  const items = collision.signals.map((signal, index): NoiseStreamItem => {
    const disclosed = disclosedSignal(state, signal);
    return ({
    id: `noise_${collision.id}_${signal.id}`,
    collision_id: collision.id,
    signal_id: signal.id,
    date: collision.date || currentDate(state),
    episode: collision.episode,
    sequence: index,
    source_name: signal.source_name,
    source_role: signal.source_role,
    kind: signal.kind,
    headline: disclosed.headline,
    body: disclosed.body,
    reliability: signal.reliability,
    motive: disclosed.motive,
    arrival_context: contextFor(signal, index),
    arrival_reason: arrivalReason(state, signal, index),
    arrived: index === 0,
    arrived_date: index === 0 ? currentDate(state) : null,
    arrival_node_index: index === 0 ? currentNodeIndex(state) : null,
    read: false,
    classification: null,
    deferred: false,
    defer_count: 0,
    ...(index === 0 ? emotionalSnapshot(state, characterIdForSource(signal.source_name)) : {}),
  });
  });
  stream.push(...items);
  return items;
}

export function items_for_collision(state: GameState, collisionId: string): NoiseStreamItem[] {
  return (state.noise_stream ?? []).filter((item) => item.collision_id === collisionId).sort((a,b) => a.sequence - b.sequence);
}

export function arrived_items(state: GameState, collisionId?: string): NoiseStreamItem[] {
  return (state.noise_stream ?? [])
    .filter((item) => item.arrived && (!collisionId || item.collision_id === collisionId))
    .sort((a,b) => b.episode - a.episode || a.sequence - b.sequence);
}

export function current_incoming(state: GameState, collisionId: string): NoiseStreamItem | null {
  return items_for_collision(state, collisionId).find((item) => item.arrived && !item.classification) ?? null;
}

export function reveal_next(state: GameState, collisionId: string): NoiseStreamItem | null {
  const items = items_for_collision(state, collisionId);
  const next = items.find((item) => !item.arrived);
  if (!next) return null;
  hydrateForArrival(state, next);
  next.arrived = true;
  next.arrived_date ??= currentDate(state);
  next.arrival_node_index ??= currentNodeIndex(state);
  return next;
}

export function classify_item(state: GameState, collisionId: string, signalId: string, classification: ThesisSignalClassification): { item: NoiseStreamItem; next: NoiseStreamItem | null; complete: boolean } {
  const item = items_for_collision(state, collisionId).find((candidate) => candidate.signal_id === signalId);
  if (!item) throw new Error('这条信息不在当前噪音流里。');
  if (!item.arrived) throw new Error('这条信息还没有进入你的工作台。');
  item.read = true;
  item.classification = classification;
  const next = reveal_next(state, collisionId);
  const complete = items_for_collision(state, collisionId).every((candidate) => Boolean(candidate.classification));
  return { item, next, complete };
}

export function close_episode_noise(state: GameState, episode: number): void {
  for (const item of state.noise_stream ?? []) {
    if (item.episode === episode && item.arrived) item.read = true;
  }
}


export function defer_item(state: GameState, collisionId: string, signalId: string): { item: NoiseStreamItem; next: NoiseStreamItem | null } {
  const items = items_for_collision(state, collisionId);
  const item = items.find((candidate) => candidate.signal_id === signalId);
  if (!item) throw new Error('这条线路不在当前噪音流里。');
  if (!item.arrived || item.classification) throw new Error('只能压后当前正在响的未处理线路。');
  if (!item.signal_id.startsWith('dyn_')) throw new Error('这条核心研究输入不能靠“先不接”跳过；先判断它。');
  if ((item.defer_count ?? 0) >= 1) throw new Error('你已经把这条线路压后过一次。现在必须接。');

  const characterId = characterIdForSource(item.source_name);
  if (characterId) characterEmotions.react_to_deferred_interrupt(state, characterId);

  const maxSequence = Math.max(...items.map((candidate) => candidate.sequence), 0);
  item.sequence = maxSequence + 1;
  item.arrived = false;
  item.deferred = true;
  item.defer_count = (item.defer_count ?? 0) + 1;
  item.read = false;
  const next = reveal_next(state, collisionId);
  return { item, next };
}
