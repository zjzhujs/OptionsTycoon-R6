import type { CharacterAffect, CharacterEmotion, GameState, HumanActionChoice, HumanActionEvent, ThesisCollision, ThesisDecisionReaction, ThesisSignalStance } from '../schemas';
import { record_memory } from './character_arc_engine';
import * as relationshipStages from './relationship_stage_engine';
import { renderCalibrationVoice, renderDecisionReactionVoice, renderOutcomeReactionVoice, renderPlayerResponseVoice } from './character_voice_engine';

export type PlayerResponseTone = 'PRESS' | 'CHALLENGE' | 'REASSURE';

const CHARACTER_IDS = ['maya_chen','victor_hale','evelyn_shaw','daniel_ross','marcus_reed','adrian_cross','leo_park'] as const;

const clamp = (value: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, value));

const DELIVERY: Record<CharacterEmotion, string> = {
  CALM: '语气平稳，几乎没有多余动作。',
  FOCUSED: '说得很快，但每一句都在压缩成结论。',
  UNEASY: '停顿比平时多，目光不断回到风险数字上。',
  PRESSURED: '声音压低了，语速明显加快。',
  FEAR: '呼吸有些紧，讲话开始反复确认最坏情况。',
  PANIC: '连续打断别人，几乎不给会议留下空白。',
  ANGRY: '压着火，说话变短，几乎每个词都带着锋利的停顿。',
  FRUSTRATED: '明显失去耐心，长停顿后才继续说。',
  HURT: '没有提高音量，但整个人明显冷了下来。',
  SUSPICIOUS: '没有立刻接话，只盯着你看了几秒。',
  CONFIDENT: '语气很稳，像已经把下一步推演过几遍。',
  EUPHORIC: '兴奋几乎藏不住，讲话速度比平时快了一倍。',
};

function affect(emotion: CharacterEmotion, intensity: number, toward_player: CharacterAffect['toward_player'], trigger: string, episode: number, source: CharacterAffect['source'] = 'DERIVED'): CharacterAffect {
  return { emotion, intensity: clamp(intensity), toward_player, trigger, delivery: DELIVERY[emotion], updated_episode: episode, source };
}

export function default_character_emotions(): Record<string, CharacterAffect> {
  return Object.fromEntries(CHARACTER_IDS.map((id) => [id, affect('CALM', 24, 'OPEN', '新基金刚刚开始运转。', 1)]));
}

function latestSentiment(state: GameState, characterId: string): string {
  const memories = state.character_memories?.[characterId] ?? [];
  return String(memories[memories.length - 1]?.sentiment ?? '');
}

export function refresh_character_emotions(state: GameState, equity: number, unrealizedPnl: number, marginCallActive: boolean): Record<string, CharacterAffect> {
  const episode = state.current_episode_number ?? 1;
  const rel = state.relationships ?? {};
  const previous = state.character_emotions ?? default_character_emotions();
  const marginDebt = state.margin_debt ?? 0;
  const marginRatio = equity > 0 ? marginDebt / equity : 1;
  const lp = state.fund_stats?.lp_confidence ?? 85;
  const reputation = state.fund_stats?.reputation ?? 60;
  const morale = state.fund_stats?.staff_morale ?? 70;
  const heat = state.political_state?.regulatory_heat ?? 0;
  const drawdown = state.max_drawdown_pct ?? 0;
  const traits = new Set(state.player_traits ?? []);

  const next: Record<string, CharacterAffect> = {};
  for (const id of CHARACTER_IDS) {
    const sticky = previous[id];
    const emergencyOverride = (marginCallActive && (id === 'victor_hale' || id === 'daniel_ross')) || (id === 'marcus_reed' && heat > 75);
    if (!emergencyOverride && sticky?.source && sticky.source !== 'DERIVED' && sticky.updated_episode === episode && sticky.intensity >= 32) {
      next[id] = sticky;
      continue;
    }
    const relationship = rel[id] ?? { character_id: id, trust: 40, respect: 40, fear: 10, favor: 10, rivalry: 0 };
    const trust = relationship.trust ?? 40;
    const respect = relationship.respect ?? 40;
    const rivalry = relationship.rivalry ?? 0;
    const sentiment = latestSentiment(state, id);

    if (id === 'maya_chen') {
      if (morale < 42 || trust < 24) next[id] = affect('HURT', 72, trust < 20 ? 'COLD' : 'GUARDED', morale < 42 ? '团队士气正在恶化，她认为研究团队没有被保护。' : '她觉得自己的判断被反复忽视。', episode);
      else if (sentiment.includes('FRICTION') || sentiment.includes('CONFLICT')) next[id] = affect('ANGRY', 64, 'TESTING', '上一轮冲突还没有过去。', episode);
      else if (unrealizedPnl < -Math.max(3500, equity * .045)) next[id] = affect('FEAR', 66, 'OPEN', '她开始担心自己的产业判断正在把基金拖进更深回撤。', episode);
      else if (unrealizedPnl > Math.max(4500, equity * .05) && trust >= 52) next[id] = affect('CONFIDENT', 70, 'LOYAL', '研究观点正在被市场验证。', episode);
      else next[id] = affect('FOCUSED', 38 + Math.max(0, 50 - trust) * .25, trust >= 55 ? 'OPEN' : 'TESTING', '她在等你证明自己会认真使用研究，而不是只引用结论。', episode);
      continue;
    }

    if (id === 'victor_hale') {
      if (marginCallActive || marginRatio > .62) next[id] = affect('PRESSURED', 88, 'TESTING', '保证金和流动性已经进入危险区。Victor 不允许会议继续讨论“观点对不对”。', episode);
      else if (traits.has('IGNORES_MACRO') && drawdown > 7) next[id] = affect('ANGRY', 76, 'COLD', '你过去忽略宏观风险，现在回撤正在兑现他的担忧。', episode);
      else if (unrealizedPnl < -Math.max(5000, equity * .06)) next[id] = affect('FRUSTRATED', 68, 'GUARDED', '组合损失扩大，而他认为风险预算早就给过警告。', episode);
      else if (drawdown < 3 && respect >= 55) next[id] = affect('CONFIDENT', 58, 'OPEN', '风险纪律目前经得起检查。', episode);
      else next[id] = affect('FOCUSED', 42, trust < 30 ? 'GUARDED' : 'OPEN', '他在看组合，而不是单笔交易。', episode);
      continue;
    }

    if (id === 'leo_park') {
      if (traits.has('OVERTRADES')) next[id] = affect('FRUSTRATED', 62, 'TESTING', '他认为你又在把做市商的价差当成不存在。', episode);
      else if (unrealizedPnl < -2500) next[id] = affect('UNEASY', 54, 'OPEN', '价格方向可能没错，但交易结构正在吞掉优势。', episode);
      else if (unrealizedPnl > 7000) next[id] = affect('CONFIDENT', 63, 'OPEN', '执行和结构暂时站在你这边。', episode);
      else next[id] = affect('CALM', 30, 'OPEN', '他更关心流动性和库存，而不是谁在会议上赢了。', episode);
      continue;
    }

    if (id === 'daniel_ross') {
      if (marginCallActive) next[id] = affect('PRESSURED', 91, 'GUARDED', '他的风险委员会已经开始讨论抵押品和融资回收。', episode);
      else if (marginRatio > .48 || lp < 42) next[id] = affect('UNEASY', 66, 'TESTING', '你的融资条件开始变成他自己的职业风险。', episode);
      else if (lp > 88 && reputation > 70) next[id] = affect('CONFIDENT', 57, 'OPEN', '你目前仍然是值得继续做生意的客户。', episode);
      else next[id] = affect('CALM', 32, 'OPEN', '他希望你成功，但他的资产负债表不会替你承担信仰。', episode);
      continue;
    }

    if (id === 'evelyn_shaw') {
      if (reputation < 42 || trust < 25) next[id] = affect('SUSPICIOUS', 72, 'GUARDED', '你的公开叙事和记录之间出现了让她感兴趣的缝隙。', episode);
      else if (sentiment.includes('FRICTION')) next[id] = affect('FRUSTRATED', 60, 'COLD', '她认为你上次在利用关系控制报道。', episode);
      else if (reputation > 75 && trust >= 50) next[id] = affect('CONFIDENT', 52, 'OPEN', '她相信你至少会给一个能被验证的回答。', episode);
      else next[id] = affect('FOCUSED', 36, 'TESTING', '她在等一句值得写进稿子的真话。', episode);
      continue;
    }

    if (id === 'marcus_reed') {
      if (heat > 75 || (state.fund_stats?.compliance_risk ?? 0) > 70) next[id] = affect('ANGRY', 74, 'COLD', '时间线里已经有太多需要解释的重合。', episode);
      else if (heat > 48) next[id] = affect('SUSPICIOUS', 68, 'TESTING', '他还没有结论，但已经不再把异常当巧合。', episode);
      else next[id] = affect('CALM', 34, respect >= 55 ? 'OPEN' : 'GUARDED', '监管者没有情绪化，但会记住每一个解释。', episode);
      continue;
    }

    if (id === 'adrian_cross') {
      if (rivalry > 65 && unrealizedPnl < -Math.max(4000, equity * .05)) next[id] = affect('EUPHORIC', 76, 'HOSTILE', '你的损失正在变成他的机会。', episode);
      else if (rivalry > 55 && unrealizedPnl > Math.max(5500, equity * .055)) next[id] = affect('FRUSTRATED', 64, 'TESTING', '你没有按他预期犯错，他开始重新估计你。', episode);
      else if (trust >= 50 || (relationship.favor ?? 0) > 30) next[id] = affect('CONFIDENT', 54, 'TESTING', '他把你当成值得交易、也值得提防的对手。', episode);
      else next[id] = affect('SUSPICIOUS', 46, rivalry > 30 ? 'HOSTILE' : 'TESTING', '他在找你真正不能承受的东西。', episode);
      continue;
    }
  }

  state.character_emotions = next;
  return next;
}

export function carry_emotions_to_next_episode(state: GameState, nextEpisode: number): void {
  const current = state.character_emotions ?? default_character_emotions();
  const carried: Record<string, CharacterAffect> = {};
  for (const [characterId, old] of Object.entries(current)) {
    let emotion: CharacterEmotion = 'CALM';
    let intensity = Math.max(24, Math.round((old.intensity ?? 30) * .58));
    let toward = old.toward_player;
    let trigger = '上一章的情绪已经降温，但关系记忆仍然存在。';

    if (old.emotion === 'ANGRY') { emotion = 'FRUSTRATED'; intensity = Math.max(48, Math.round(old.intensity * .76)); trigger = '上一章的愤怒没有消失，只是从爆发变成了持续摩擦。'; }
    else if (old.emotion === 'HURT') { emotion = 'HURT'; intensity = Math.max(52, Math.round(old.intensity * .82)); trigger = '这件事跨过了章节边界；他/她还没有把它当作过去。'; }
    else if (old.emotion === 'PANIC' || old.emotion === 'FEAR' || old.emotion === 'PRESSURED') { emotion = 'UNEASY'; intensity = Math.max(44, Math.round(old.intensity * .64)); trigger = '危机最尖锐的部分过去了，但身体和判断仍然处在警戒状态。'; }
    else if (old.emotion === 'SUSPICIOUS') { emotion = 'SUSPICIOUS'; intensity = Math.max(46, Math.round(old.intensity * .78)); trigger = '怀疑不会因为一天结束就自动归零。'; }
    else if (old.emotion === 'EUPHORIC') { emotion = 'CONFIDENT'; intensity = Math.max(46, Math.round(old.intensity * .7)); trigger = '上一章的胜利感仍在，他/她开始更相信自己的判断。'; }
    else if (old.emotion === 'CONFIDENT') { emotion = 'FOCUSED'; intensity = Math.max(38, Math.round(old.intensity * .66)); trigger = '自信退回专注，但对上一章的判断仍然有惯性。'; }
    else if (old.emotion === 'FRUSTRATED') { emotion = 'FRUSTRATED'; intensity = Math.max(42, Math.round(old.intensity * .7)); trigger = '摩擦已经从当场争执变成下一章的背景温度。'; }
    else if (old.emotion === 'FOCUSED') { emotion = 'FOCUSED'; intensity = Math.max(30, Math.round(old.intensity * .7)); }
    else { toward = old.toward_player === 'HOSTILE' ? 'TESTING' : old.toward_player; }

    carried[characterId] = affect(emotion, intensity, toward, trigger, nextEpisode, 'STORY_CHOICE');
  }
  state.character_emotions = carried;
}

export function react_to_war_room_choice(state: GameState, choiceId: string): void {
  const episode = state.current_episode_number ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  if (choiceId === 'opt_aggressive') {
    emotions.maya_chen = affect('CONFIDENT', 74, 'LOYAL', '你愿意让研究观点承担真正的资本权重。', episode, 'WAR_ROOM_CHOICE');
    emotions.victor_hale = affect('FRUSTRATED', 67, 'TESTING', '你选择了更高方向性风险，他会盯着你的失效条件。', episode, 'WAR_ROOM_CHOICE');
    if (episode >= 6) emotions.marcus_reed = affect('SUSPICIOUS', 62, 'GUARDED', '你的风险偏好让信息边界更值得检查。', episode, 'WAR_ROOM_CHOICE');
  } else if (choiceId === 'opt_defensive') {
    emotions.victor_hale = affect('CONFIDENT', 68, 'OPEN', '你把生存和风险预算放在第一位。', episode, 'WAR_ROOM_CHOICE');
    emotions.maya_chen = affect(episode >= 5 ? 'HURT' : 'FRUSTRATED', 58, 'GUARDED', '她担心你把“谨慎”变成了永远不给研究观点资本。', episode, 'WAR_ROOM_CHOICE');
  } else {
    emotions.leo_park = affect('CONFIDENT', 70, 'OPEN', '你选择用结构管理不确定性，而不是只押方向。', episode, 'WAR_ROOM_CHOICE');
    emotions.victor_hale = affect('FOCUSED', 55, 'OPEN', '尾部风险被买下了一部分。', episode, 'WAR_ROOM_CHOICE');
    emotions.maya_chen = affect('UNEASY', 46, 'TESTING', '她接受对冲，但会观察你是否因此失去观点。', episode, 'WAR_ROOM_CHOICE');
  }
}

export function react_to_story_choice(state: GameState, characterId: string, relationshipDelta: number, choiceLabel: string): void {
  const episode = state.current_episode_number ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  if (relationshipDelta >= 4) emotions[characterId] = affect('CONFIDENT', 62, 'OPEN', `你在「${choiceLabel}」里明确站到了他/她能接受的一边。`, episode, 'STORY_CHOICE');
  else if (relationshipDelta <= -4) emotions[characterId] = affect('ANGRY', 72, 'COLD', `你在「${choiceLabel}」里踩中了他/她真正介意的边界。`, episode, 'STORY_CHOICE');
  else if (relationshipDelta < 0) emotions[characterId] = affect('FRUSTRATED', 58, 'GUARDED', `这次选择没有撕破脸，但摩擦已经留下。`, episode, 'STORY_CHOICE');
}

function character_name(characterId: string): string {
  return ({ maya_chen: 'Maya', victor_hale: 'Victor', leo_park: 'Leo', daniel_ross: 'Daniel', evelyn_shaw: 'Evelyn', marcus_reed: 'Marcus', adrian_cross: 'Adrian' } as Record<string, string>)[characterId] ?? characterId;
}

function response_line(state: GameState, characterId: string, tone: PlayerResponseTone, current: CharacterAffect): string {
  return renderPlayerResponseVoice(state, characterId, tone, current.emotion);
}

export function respond_to_character(state: GameState, characterId: string, tone: PlayerResponseTone, gameDate = ""): string {
  const rel = state.relationships?.[characterId];
  if (!rel) throw new Error(`未知人物：${characterId}`);
  const episode = state.current_episode_number ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  const current = emotions[characterId] ?? affect('CALM', 30, 'OPEN', '', episode);
  let summary = '';

  if (tone === 'PRESS') {
    rel.respect = clamp((rel.respect ?? 40) + 2);
    rel.fear = clamp((rel.fear ?? 10) + (characterId === 'marcus_reed' ? 0 : 1));
    rel.trust = clamp((rel.trust ?? 40) - (current.intensity > 70 ? 2 : 0));
    const emotion: CharacterEmotion = current.emotion === 'HURT'
      ? 'HURT'
      : current.emotion === 'ANGRY' || current.emotion === 'FRUSTRATED'
        ? current.emotion
        : current.emotion === 'FEAR' || current.emotion === 'PANIC'
          ? 'PRESSURED'
          : 'FOCUSED';
    const toward = current.emotion === 'HURT' ? 'COLD' : 'TESTING';
    emotions[characterId] = affect(emotion, clamp(current.intensity + 7), toward, '你没有接受概括，要求他/她把证据和最坏情况说清楚。', episode, 'PLAYER_RESPONSE');
    summary = current.emotion === 'HURT'
      ? '你在关系已经受伤时继续追问。Respect 上升，但对方并没有因此原谅你。'
      : '你追问了证据和最坏情况。对方感到压力，但会更认真地把你当成决策者。';
  } else if (tone === 'CHALLENGE') {
    rel.respect = clamp((rel.respect ?? 40) + (current.toward_player === 'TESTING' || characterId === 'adrian_cross' ? 3 : 1));
    rel.trust = clamp((rel.trust ?? 40) - 2);
    rel.rivalry = clamp((rel.rivalry ?? 0) + (characterId === 'adrian_cross' ? 3 : 0));
    emotions[characterId] = affect(current.emotion === 'HURT' ? 'HURT' : 'ANGRY', clamp(Math.max(62, current.intensity + 10)), 'TESTING', '你当面反驳了他/她的核心判断。', episode, 'PLAYER_RESPONSE');
    summary = '你直接顶了回去。信任下降，但如果对方尊重强势判断，Respect 可能反而上升。';
  } else {
    let trustDelta = 3;
    let respectDelta = 1;
    let intensityDrop = 18;
    let nextToward: CharacterAffect['toward_player'] = 'OPEN';
    let nextEmotion: CharacterEmotion | null = null;
    summary = '你先稳住了对方。情绪强度下降，Trust 上升，但这不等于你接受了他的观点。';

    if (characterId === 'victor_hale' && current.intensity >= 58) {
      trustDelta = 0; respectDelta = -1; intensityDrop = 5; nextToward = 'TESTING';
      nextEmotion = current.emotion === 'ANGRY' ? 'FRUSTRATED' : current.emotion === 'PRESSURED' ? 'PRESSURED' : 'FOCUSED';
      summary = 'Victor 不需要情绪安抚，他要的是风险动作。你的善意没有伤害关系，但也没有替代数字。';
    } else if (characterId === 'marcus_reed') {
      trustDelta = 0; respectDelta = 1; intensityDrop = 1; nextToward = 'GUARDED';
      nextEmotion = current.emotion === 'ANGRY' ? 'SUSPICIOUS' : current.emotion === 'CALM' ? 'CALM' : 'SUSPICIOUS';
      summary = 'Marcus 不会因为态度友好而降低审查强度；他只记录你是否愿意把过程说清楚。';
    } else if (characterId === 'adrian_cross') {
      trustDelta = 0; respectDelta = -2; intensityDrop = 3; nextToward = 'TESTING';
      rel.rivalry = clamp((rel.rivalry ?? 0) + 1);
      nextEmotion = 'SUSPICIOUS';
      summary = 'Adrian 把安抚读成了你在管理气氛，而不是管理胜负。Respect 下降，他反而更想试探你。';
    } else if (characterId === 'evelyn_shaw' && (current.emotion === 'SUSPICIOUS' || current.toward_player === 'GUARDED')) {
      trustDelta = 1; respectDelta = 0; intensityDrop = 4; nextToward = 'GUARDED'; nextEmotion = 'SUSPICIOUS';
      summary = 'Evelyn 接受你愿意沟通，但安抚不能替代可引用的事实。她仍保持怀疑。';
    } else if (characterId === 'daniel_ross' && current.emotion === 'PRESSURED') {
      trustDelta = 1; respectDelta = 0; intensityDrop = 4; nextToward = 'GUARDED'; nextEmotion = 'PRESSURED';
      summary = 'Daniel 知道你理解他的压力，但外部风险委员会不会因为这句话消失。他要的是可执行的融资和去杠杆计划。';
    }

    const repair = relationshipStages.repair_response_modifier(state, characterId);
    trustDelta = Math.round(trustDelta * repair.trustMultiplier);
    intensityDrop = Math.round(intensityDrop * repair.intensityMultiplier);
    if (repair.note) {
      summary = trustDelta > 0
        ? `${summary} ${repair.note}`
        : `你给了对方继续说下去的空间，但这一次没有恢复 Trust。${repair.note}`;
    } else if (trustDelta <= 0 && summary.includes('Trust 上升')) {
      summary = summary.replace('Trust 上升', 'Trust 没有因此上升');
    }
    rel.trust = clamp((rel.trust ?? 40) + trustDelta);
    rel.respect = clamp((rel.respect ?? 40) + respectDelta);
    const calmed = Math.max(30, current.intensity - intensityDrop);
    emotions[characterId] = affect(nextEmotion ?? (calmed > 50 ? 'UNEASY' : 'CALM'), calmed, nextToward, '你明确承认了他/她承担的压力，并给了继续说下去的空间。', episode, 'PLAYER_RESPONSE');
  }

  const spoken = response_line(state, characterId, tone, current);
  const responseSentiment = tone === 'CHALLENGE'
    ? 'FRICTION'
    : tone === 'REASSURE' && summary.includes('Trust 上升')
      ? 'TRUST_GAINED'
      : 'REMEMBERED';
  record_memory(state, characterId, `EP${episode} 沟通中，${summary} ${character_name(characterId)}回应：${spoken}`, responseSentiment, `war_room_response:${tone}`, gameDate);
  return `${character_name(characterId)} ${spoken}  ${summary}`;
}

export function react_to_human_action(state: GameState, action: HumanActionEvent, selected: HumanActionChoice): void {
  const episode = state.current_episode_number ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  const favorable = selected.favor_delta ?? 0;

  if (action.character_id) react_to_story_choice(state, action.character_id, favorable, selected.label);

  if (action.action_kind === 'RIVAL_POACHING') {
    if (selected.id === 'match_bonus') {
      emotions.maya_chen = affect('CONFIDENT', 76, 'LOYAL', '你用真金白银和授权保护了她的研究团队。', episode, 'STORY_CHOICE');
      emotions.adrian_cross = affect('FRUSTRATED', 65, 'HOSTILE', '他的挖角被你正面挡了回去。', episode, 'STORY_CHOICE');
    } else if (selected.id === 'let_go_and_reorg') {
      emotions.maya_chen = affect('HURT', 82, 'COLD', '她认为你把核心研究人员当成了可以随时替换的成本项。', episode, 'STORY_CHOICE');
      emotions.adrian_cross = affect('EUPHORIC', 74, 'HOSTILE', '他不仅挖走了人，还确认你不愿为团队付出代价。', episode, 'STORY_CHOICE');
    } else {
      emotions.maya_chen = affect('UNEASY', 58, 'GUARDED', '你保护了团队，但她不确定用律师解决文化问题是不是答案。', episode, 'STORY_CHOICE');
      emotions.adrian_cross = affect('ANGRY', 63, 'HOSTILE', '法律手段打断了他的节奏，他把这当成一次正面交锋。', episode, 'STORY_CHOICE');
    }
  }

  if (action.action_kind === 'EMPLOYEE_DISPUTE') {
    if (selected.id === 'side_with_maya') {
      emotions.maya_chen = affect('CONFIDENT', 80, 'LOYAL', '你当着风控负责人的面把更大风险预算交给了她。', episode, 'STORY_CHOICE');
      emotions.victor_hale = affect('ANGRY', 76, 'COLD', '他认为你在用管理权覆盖风险纪律，而且已经把这件事记进备忘录。', episode, 'STORY_CHOICE');
    } else if (selected.id === 'side_with_victor') {
      emotions.victor_hale = affect('CONFIDENT', 74, 'OPEN', '你明确支持了风险预算的硬边界。', episode, 'STORY_CHOICE');
      emotions.maya_chen = affect('HURT', 72, 'GUARDED', '她认为你又一次在最需要资本表达时把研究观点压了回去。', episode, 'STORY_CHOICE');
    } else {
      emotions.maya_chen = affect('FOCUSED', 52, 'OPEN', '她得到表达观点的空间，但必须接受结构化保护。', episode, 'STORY_CHOICE');
      emotions.victor_hale = affect('FOCUSED', 50, 'OPEN', '他没有赢下限仓，但风险被明确买了保险。', episode, 'STORY_CHOICE');
      emotions.leo_park = affect('CONFIDENT', 64, 'OPEN', '你把冲突转成了他最擅长解决的结构问题。', episode, 'STORY_CHOICE');
    }
  }

  if (action.action_kind === 'LP_REDEMPTION_WARNING') {
    if (selected.id === 'deleveraging_pledge') emotions.daniel_ross = affect('FOCUSED', 60, 'OPEN', '你终于给了一个可以拿回风险委员会解释的去杠杆计划。', episode, 'STORY_CHOICE');
    else if (selected.id === 'in_person_presentation') emotions.daniel_ross = affect('UNEASY', 55, 'TESTING', '你争取到了时间，但融资方仍在等实际风险下降。', episode, 'STORY_CHOICE');
    else emotions.daniel_ross = affect('PRESSURED', 78, 'GUARDED', '部分赎回已经发生，融资条件会跟着 AUM 一起重新计算。', episode, 'STORY_CHOICE');
  }

  if (action.action_kind === 'JOURNALIST_INQUIRY') {
    if (selected.id === 'off_the_record_exchange') emotions.evelyn_shaw = affect('CONFIDENT', 67, 'TESTING', '你给了她背景信息，也欠下了一次未来会被收回的人情。', episode, 'STORY_CHOICE');
    else emotions.evelyn_shaw = affect('FOCUSED', 52, 'OPEN', '公开声明足够干净，但她仍然会继续查真正的故事。', episode, 'STORY_CHOICE');
  }

  if (action.action_kind === 'RIVAL_SHORT_ATTACK') {
    if (selected.id === 'rebuttal_brief') {
      emotions.maya_chen = affect('ANGRY', 68, 'LOYAL', '她把做空报告当成对自己研究信誉的直接攻击，准备正面回击。', episode, 'STORY_CHOICE');
      emotions.adrian_cross = affect('CONFIDENT', 62, 'HOSTILE', '他成功逼你公开站队，接下来会等市场裁决。', episode, 'STORY_CHOICE');
    } else {
      emotions.maya_chen = affect('FRUSTRATED', 60, 'GUARDED', '她不喜欢你利用攻击制造的波动，而不是先回应研究争议。', episode, 'STORY_CHOICE');
      emotions.adrian_cross = affect('SUSPICIOUS', 58, 'TESTING', '你没有按他预想的方式反击，他开始重新估计你的打法。', episode, 'STORY_CHOICE');
    }
  }

}


export function outcome_reaction_line(state: GameState, characterId: string): string {
  return renderOutcomeReactionVoice(state, characterId);
}

export function pressure_line(characterId: string, current?: CharacterAffect): string | undefined {
  if (!current || current.intensity < 64) return undefined;
  const emotion = current.emotion;

  if (characterId === 'maya_chen') {
    if (emotion === 'FEAR' || emotion === 'PANIC') return '我不是说逻辑死了！我是说如果我他妈再错一次，我们未必还能抠出第三次下注的资本！';
    if (emotion === 'ANGRY' || emotion === 'FRUSTRATED') return '你觉得我错，就给我指出变量！别他妈拿账面回撤来当反证！';
    if (emotion === 'HURT') return '你要我的研究，但上一次，你连做研究的人都没保下来。';
    if (emotion === 'CONFIDENT') return '给我风险预算。老子愿意把名字和职业生涯押在这笔判断后面。';
  }
  if (characterId === 'victor_hale') {
    if (emotion === 'PRESSURED' || emotion === 'PANIC') return '把你那狗屁观点页给我关了！先告诉我，最坏情况下我们还能苟活几个交易日！';
    if (emotion === 'ANGRY' || emotion === 'FRUSTRATED') return '老子不是来这赢辩论的。我是在告诉你，哪条红线越过去以后我们全他妈得死，没有第二次机会！';
    if (emotion === 'CONFIDENT') return '风险预算还没穿。你可以下注，但别把老子的纪律误认为是胆小。';
  }
  if (characterId === 'leo_park') {
    if (emotion === 'FRUSTRATED' || emotion === 'UNEASY') return '先别他妈跟我扯方向。告诉我，当这笔东西出事的时候，你到底能不能跑得出去？！';
    if (emotion === 'CONFIDENT') return '结构现在在替你工作。别因为顺手就开始像个赌徒一样乱按按钮。';
  }
  if (characterId === 'daniel_ross') {
    if (emotion === 'PRESSURED') return '我的委员会正在盯着同一组快暴雷的数字。我现在需要一个能拿回去交差的计划，不是你那不值钱的信心！';
    if (emotion === 'UNEASY') return '我愿意继续给你绳子。但你得让我相信你不会拿它再往外多作死一步。';
    if (emotion === 'CONFIDENT') return '现在资本愿意跟你做生意。记住，这种窗口关门的时候，从来都不会提前按喇叭。';
  }
  if (characterId === 'evelyn_shaw') {
    if (emotion === 'SUSPICIOUS') return '你可以死鸭子嘴硬不回答。但你的沉默也会变成一句话，我保证那绝不是你想写的。';
    if (emotion === 'FRUSTRATED') return '别再给我那种能过合规审查、但其实什么屁都没放的废话！';
  }
  if (characterId === 'marcus_reed') {
    if (emotion === 'SUSPICIOUS' || emotion === 'ANGRY') return '我不需要你喜欢我的问题。我只要求你的时间戳和记录能互相咬合，别露出马脚。';
  }
  if (characterId === 'adrian_cross') {
    if (emotion === 'EUPHORIC') return '终于感觉到疼了？现在我就想知道，你会先斩仓，还是先卖掉你那引以为傲的原则。';
    if (emotion === 'FRUSTRATED' || emotion === 'ANGRY') return '好极了。你没按我预期的倒下。那我就换一个你更难受的地方狠狠踹一脚。';
    if (emotion === 'CONFIDENT') return '我开始尊重你了。别急着高兴——这只意味着我会更认真地想怎么亲手宰了你。';
  }
  return undefined;
}

export function judgment_bias(characterId: string, current?: CharacterAffect): string | undefined {
  if (!current || current.intensity < 54) return undefined;
  const emotion = current.emotion;
  const high = current.intensity >= 75;

  if (characterId === 'maya_chen') {
    if (emotion === 'FEAR' || emotion === 'PANIC') return high
      ? '她正在过度权衡“再错一次”的代价，可能把原本有优势的仓位表达压得过小。产业证据没有因此改变，但她的风险承受表达明显更保守。'
      : '恐惧让她更容易先看最坏情景，再看基础概率。她的证据仍值得听，但仓位建议可能偏保守。';
    if (emotion === 'ANGRY') return '她可能把对 Thesis 的质疑感受成对研究能力的质疑，因此更用力捍卫原观点。注意区分“证据变强”与“她更想证明自己是对的”。';
    if (emotion === 'HURT') return '她对你的关系伤害正在影响信息共享意愿。她未必改变行业判断，但可能不再主动替你补齐反方情景。';
    if (emotion === 'CONFIDENT' && high) return '连续验证正在压缩她对尾部风险的敏感度。自信本身不是证据，尤其要检查失效条件有没有被悄悄放宽。';
  }

  if (characterId === 'victor_hale') {
    if (emotion === 'PRESSURED' || emotion === 'PANIC') return high
      ? '生存本能已经压过收益目标。他可能建议比必要程度更激进地去杠杆、留现金和削减方向风险。'
      : '他现在会把流动性和保证金放在所有概率判断之前，可能低估“风险已被价格充分计入”的机会。';
    if (emotion === 'ANGRY' || emotion === 'FRUSTRATED') return '他对过去风险纪律被忽视仍有情绪，可能把“证明流程必须被尊重”混进当前风险建议。红线要听，但仓位削减幅度仍需你自己判断。';
    if (emotion === 'CONFIDENT' && high) return '连续纪律正确可能让他过度相信风险框架能覆盖下一次结构变化。模型稳定不等于市场结构稳定。';
  }

  if (characterId === 'leo_park') {
    if (emotion === 'FRUSTRATED') return '他正在过度关注价差、滑点和库存风险，可能低估方向性不对称本身的价值。别把“执行很贵”自动等同于“交易不值得做”。';
    if (emotion === 'UNEASY') return '近期结构损耗让他更偏好简单、可退出的表达，可能牺牲一部分凸性来换流动性确定性。';
    if (emotion === 'CONFIDENT' && high) return '近期执行顺利可能让他低估极端行情下盘口突然消失的风险。平静市场里的流动性不是承诺。';
  }

  if (characterId === 'daniel_ross') {
    if (emotion === 'PRESSURED' || emotion === 'UNEASY') return '他的建议不再是中性的融资建议：风险委员会、抵押品和他自己的职业风险都在推动他收紧信用。把“Daniel 需要保护资产负债表”与“你的投资观点错了”分开。';
    if (emotion === 'CONFIDENT' && high) return '你现在是好客户，这可能让他暂时低估相关性上升时信用条件恶化的速度。融资承诺不是永久资本。';
  }

  if (characterId === 'evelyn_shaw') {
    if (emotion === 'SUSPICIOUS') return '她正在把模糊、停顿和前后不一致视为“故事信号”。这能帮你发现叙事风险，也可能让她把普通的不确定性组织成更戏剧化的因果。';
    if (emotion === 'FRUSTRATED') return '她对你控制叙事的警惕会让她更主动寻找反证和匿名来源。她可能比平时更愿意相信“被压住的另一面”。';
  }

  if (characterId === 'marcus_reed') {
    if (emotion === 'SUSPICIOUS' || emotion === 'ANGRY') return '审查密度正在上升，他会把更多异常纳入同一条调查时间线。注意：这改变的是审查强度，不改变证据门槛；没有证据仍然不能自动变成违规。';
  }

  if (characterId === 'adrian_cross') {
    if (emotion === 'EUPHORIC') return '他正在把你的压力当成自己的优势，可能高估你被迫平仓/犯错的概率，并低估你反击或获得外部资本支持的能力。';
    if (emotion === 'FRUSTRATED' || emotion === 'ANGRY') return '他可能开始为了“重新夺回主动权”而过度纠偏。敌意会让他更愿意承担本来不需要承担的风险。';
    if (emotion === 'CONFIDENT' && high) return '他把你当成值得尊重的对手，但也更相信自己能预测你的反应。这种自信可能让他的博弈模型过度依赖你过去的行为。';
  }

  return undefined;
}

export function emotion_label(emotion: CharacterEmotion): string {
  const map: Record<CharacterEmotion, string> = {
    CALM: '冷静', FOCUSED: '专注', UNEASY: '不安', PRESSURED: '承压', FEAR: '恐惧', PANIC: '恐慌', ANGRY: '愤怒', FRUSTRATED: '烦躁', HURT: '受伤', SUSPICIOUS: '怀疑', CONFIDENT: '自信', EUPHORIC: '亢奋',
  };
  return map[emotion];
}


function character_id_from_signal_source(sourceName: string): string | null {
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

function reaction_line(characterId: string, decision: ThesisCollision['decision'], stance: ThesisSignalStance): string {
  const lines: Record<string, Partial<Record<NonNullable<ThesisCollision['decision']>, string>>> = {
    maya_chen: {
      HOLD: stance === 'SUPPORT' ? '“好。那就别用‘我相信’这种狗屁废话保护它。给我死死盯着你自己写下的证伪条件。”' : '“你决定继续扛，我接受。但别他妈把死扛本身当成你有什么过人的研究能力。”',
      REVISE: '“改模型没问题。我要确认的是：你改，到底是因为硬证据变了，还是因为账面的血让你疼了？”',
      PAUSE: '“查清楚再下注。研究最怕的不是晚一天，是为了赶时间把未知瞎编成已知！”',
      NO_EDGE: '“可以不做。但把为什么没有优势给我写清楚。下一次同样的结构回来，我们要知道缺的到底是哪块拼图。”',
    },
    victor_hale: {
      HOLD: '“你听完风险还是决定扛，可以。那从现在开始我像死神一样只盯你写下的 falsifier 和现金 runway。”',
      REVISE: '“这不是谁赢了辩论。是你的模型终于他妈的承认，风险变量也是会改变答案的。”',
      PAUSE: '“好。暂停不是怂。没看清的时候，拿着现金本身就是最狠的仓位。”',
      NO_EDGE: '“没有优势就别去浪费风险预算！市场明天还开门，我希望基金明天也最好还在。”',
    },
    leo_park: {
      HOLD: '“方向你可以坚持。价格别他妈瞎坚持。Spread、IV 和期限不会因为你有 conviction 就给你打折！”',
      REVISE: '“很好。把 Thesis 和表达拆开。你可以死咬方向，但必须改你为这个方向付多少高昂的过路费。”',
      PAUSE: '“等盘口给你一个能交易的价格。没必要为了证明自己是个交易员，就必须参与每一分钟的绞肉机。”',
      NO_EDGE: '“最便宜的坏交易，永远是老子不做。等赔率滚回来再说。”',
    },
    daniel_ross: {
      HOLD: '“可以继续持有。现在给我一个首付版本：如果你错两天，填坑的现金你准备从哪里变出来？”',
      REVISE: '“这就对了。观点可以改，抵押品可不会等你慢慢接受现实才暴雷。”',
      PAUSE: '“暂停新增风险我还勉强能向委员会解释。等真失控了你再让我去解释，那就只剩抽干你的信用额度了。”',
      NO_EDGE: '“不做这笔交易，不会有人在风险委员会给你扣分。活不到下一笔才会！”',
    },
    evelyn_shaw: {
      HOLD: '“所以你的公开版本是：证据没变，你也没变？好。那我们就等市场给这句话标个价。”',
      REVISE: '“这比装作从没错过可信多了。真正的问题是，你会不会公开承认你那个破模型变了。”',
      PAUSE: '“没答案本身也是个答案。只是别在镜头前把‘我还不知道’包装成虚伪的确定性。”',
      NO_EDGE: '“终于有人愿意老老实实说一句‘我不知道’了。这句话通常比华尔街大部分的公关废话值钱。”',
    },
    marcus_reed: {
      HOLD: '“方向不是我的问题。你已经写下过程和边界；之后你的记录只需要和它保持严丝合缝。”',
      REVISE: '“更新判断没有问题。把新证据的时间戳留好，别在事后想偷偷重写你当时知道什么。”',
      PAUSE: '“暂停执行，继续核实来源——这是一个可以被完美审计的决定。”',
      NO_EDGE: '“拒绝使用不充分的信息，本身就是一条极好的决策记录。”',
    },
    adrian_cross: {
      HOLD: '“还要死扛？好。我最喜欢看有人把自己的止损点写给全世界看。现在就看谁先扛不住眨眼。”',
      REVISE: '“Fuck. 你居然还会改主意。这下麻烦了——固执的蠢货才最好收割。”',
      PAUSE: '“你停下来想？没关系。市场可不会因为你需要喘息时间就停止找你的弱点。”',
      NO_EDGE: '“今天不赌？算你聪明。也可能只是你害怕了。下一次我会亲手测出来到底是哪一种。”',
    },
  };
  return lines[characterId]?.[decision ?? 'HOLD'] ?? '“决定已经记下。现在让市场来用真金白银证明谁的模型更接近现实。”';
}


function calibration_challenge_line(characterId: string, collision: ThesisCollision): string | null {
  const confidence = collision.hypothesis_frame?.confidence_pct;
  if (typeof confidence !== 'number') return null;
  const classifications = collision.signal_classifications ?? {};
  const watchCount = Object.values(classifications).filter((v) => v === 'WATCH').length;

  // Challenge only obvious *process inconsistency*. This never claims the market view is right or wrong.
  if (confidence >= 85 && watchCount >= 2) {
    if (characterId === 'victor_hale') return `“${confidence}%？你自己账面上还留着 ${watchCount} 条 WATCH。别把老子当傻子，别把虚张声势的语气当成确定性！”`;
    if (characterId === 'maya_chen') return `“${confidence}% 可以。现在给我老实交代：那 ${watchCount} 条你自己标成 WATCH 的东西，为什么还不足以动摇你的破模型？”`;
    if (characterId === 'leo_park') return `“${confidence}% 只是你自己的执念，不是市场给你的折扣。别拿你的 conviction 去给昂贵的 IV 付溢价！”`;
    if (characterId === 'daniel_ross') return `“${confidence}% 我听见了。但融资委员会从不收信心当抵押品——我只看你到底愿意亏多少真金白银！”`;
  }
  if (confidence <= 35 && collision.decision === 'HOLD') {
    if (characterId === 'victor_hale') return `“只有 ${confidence}% 的把握你还要继续扛？！那我不要听什么狗屁方向，我要听你为什么认为这点可怜的信心足以强占风险预算！”`;
    if (characterId === 'maya_chen') return `“${confidence}% 根本算不上 conviction。你可以继续观察，但别把‘我还没想清楚’包装成所谓的坚持！”`;
    if (characterId === 'leo_park') return `“${confidence}% 还要付高昂的期权溢价？先确认你买的是赔率，不是他妈的参与感！”`;
  }
  return null;
}

/**
 * Characters react to the PM's *decision process* and visible action, not to a
 * hidden game answer. Agreement is not a trust button. A disciplined process
 * can earn respect even from the person whose recommendation was rejected.
 */
export function react_to_thesis_collision_resolution(state: GameState, collision: ThesisCollision): ThesisDecisionReaction[] {
  if (!collision.decision) return [];
  const episode = state.current_episode_number ?? collision.episode ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  const relationships = state.relationships ?? {};
  const disciplined = Boolean(
    collision.hypothesis_frame?.must_be_true && collision.hypothesis_frame?.falsifier &&
    collision.player_reason && collision.player_reason.trim().length >= 20
  );
  const participants = new Map<string, ThesisSignalStance>();
  for (const sig of collision.signals) {
    const id = character_id_from_signal_source(sig.source_name);
    if (!id || participants.has(id)) continue;
    participants.set(id, sig.stance);
  }

  const reactions: ThesisDecisionReaction[] = [];
  for (const [characterId, stance] of participants) {
    const current = emotions[characterId] ?? affect('CALM', 30, 'OPEN', '', episode);
    const rel = relationships[characterId];
    if (disciplined && rel) rel.respect = clamp((rel.respect ?? 40) + 1);

    let emotion: CharacterEmotion = 'FOCUSED';
    let intensity = Math.max(46, current.intensity * 0.82);
    let toward: CharacterAffect['toward_player'] = current.toward_player === 'HOSTILE' ? 'TESTING' : current.toward_player;

    if (collision.decision === 'HOLD') {
      if (stance === 'SUPPORT') { emotion = 'CONFIDENT'; intensity = 62; toward = toward === 'COLD' ? 'GUARDED' : 'OPEN'; }
      else if (stance === 'CHALLENGE') { emotion = current.emotion === 'HURT' ? 'HURT' : 'FRUSTRATED'; intensity = Math.max(58, current.intensity); toward = 'TESTING'; }
      else { emotion = current.emotion === 'PRESSURED' ? 'PRESSURED' : 'FOCUSED'; intensity = Math.max(50, current.intensity * .85); }
    } else if (collision.decision === 'REVISE') {
      if (stance === 'CHALLENGE') { emotion = 'CONFIDENT'; intensity = 58; toward = 'OPEN'; }
      else if (stance === 'SUPPORT') { emotion = current.emotion === 'HURT' ? 'HURT' : 'UNEASY'; intensity = Math.max(52, current.intensity * .88); toward = 'TESTING'; }
      else { emotion = 'FOCUSED'; intensity = Math.max(48, current.intensity * .8); }
    } else if (collision.decision === 'PAUSE') {
      emotion = characterId === 'adrian_cross' ? 'SUSPICIOUS' : 'FOCUSED';
      intensity = characterId === 'adrian_cross' ? 54 : 48;
      toward = characterId === 'adrian_cross' ? 'TESTING' : toward;
    } else if (collision.decision === 'NO_EDGE') {
      if (characterId === 'maya_chen' && stance === 'SUPPORT') { emotion = 'UNEASY'; intensity = 50; toward = 'TESTING'; }
      else if (characterId === 'adrian_cross') { emotion = 'SUSPICIOUS'; intensity = 56; toward = 'TESTING'; }
      else { emotion = 'FOCUSED'; intensity = 46; }
    }

    const trigger = `你完成 EP${collision.episode} 的观点碰撞并选择 ${collision.decision}。${disciplined ? '过程里留下了可审计的假设与证伪条件。' : ''}`;
    emotions[characterId] = affect(emotion, intensity, toward, trigger, episode, 'PLAYER_RESPONSE');
    const calibrationLine = renderCalibrationVoice(state, characterId, collision);
    const voicedLine = calibrationLine ?? renderDecisionReactionVoice(state, characterId, collision.decision, stance, emotion, Math.round(intensity));
    reactions.push({ character_id: characterId, character_name: character_name(characterId), line: voicedLine, emotion, intensity: Math.round(intensity), toward_player: toward });
  }
  return reactions.sort((a, b) => b.intensity - a.intensity).slice(0, 4);
}


export function react_to_deferred_interrupt(state: GameState, characterId: string): void {
  const episode = state.current_episode_number ?? 1;
  const emotions = (state.character_emotions ??= default_character_emotions());
  const current = emotions[characterId] ?? affect('CALM', 30, 'OPEN', '', episode);
  let emotion: CharacterEmotion = current.emotion;
  let toward: CharacterAffect['toward_player'] = current.toward_player;
  let trigger = '你把这条线路压后了一次。对方知道你正在决定什么值得先听。';

  if (characterId === 'marcus_reed') { emotion = 'SUSPICIOUS'; toward = 'GUARDED'; trigger = '你把监管线路压后了。Marcus 不会发火，但他会记住优先级。'; }
  else if (characterId === 'daniel_ross') { emotion = current.intensity >= 60 ? 'PRESSURED' : 'FRUSTRATED'; toward = 'TESTING'; trigger = '你把融资线路压后了。Daniel 的风险委员会不会跟着你的节奏等。'; }
  else if (characterId === 'evelyn_shaw') { emotion = 'SUSPICIOUS'; toward = 'GUARDED'; trigger = '你让记者等。Evelyn 开始判断你是在组织事实，还是在组织说法。'; }
  else if (characterId === 'adrian_cross') { emotion = 'EUPHORIC'; toward = 'TESTING'; trigger = '你没有立刻接他的线路。Adrian 把这理解成你正在承受别的压力。'; }
  else if (characterId === 'maya_chen') { emotion = current.emotion === 'HURT' ? 'HURT' : 'FRUSTRATED'; toward = current.emotion === 'HURT' ? 'COLD' : 'TESTING'; trigger = '你把研究线路压后了。Maya 会注意你把什么排在研究之前。'; }
  else if (characterId === 'victor_hale') { emotion = 'FRUSTRATED'; toward = 'TESTING'; trigger = '你把风险线路压后了。Victor 不会把优先级问题当作礼仪问题。'; }
  else if (characterId === 'leo_park') { emotion = 'FOCUSED'; toward = 'TESTING'; trigger = '你让盘口线路等了一轮。Leo 会重新检查你回来时价格还在不在。'; }

  emotions[characterId] = affect(emotion, clamp(Math.max(46, current.intensity + 8)), toward, trigger, episode, 'PLAYER_RESPONSE');
  record_memory(state, characterId, `你在 EP${episode} 的观点乱流里把 ${character_name(characterId)} 的线路压后了一次。`, 'FRICTION', 'NOISE_STREAM_DEFERRED');
}
