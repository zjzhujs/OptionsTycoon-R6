import type { GameState, ThesisSessionReasoningProfile, ThesisCollision, ThesisCollisionDecision, ThesisSignal, ThesisSignalClassification } from '../schemas';
import * as decisionTimeline from './decision_timeline';
import * as noiseStream from './noise_stream_engine';
import * as stateNoiseSignals from './state_noise_signal_engine';
import * as characterEmotions from './character_emotion_engine';
import * as reflexivity from './reflexivity_engine';
import * as shockPropagation from './shock_propagation_engine';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function default_thesis_session_profile(): ThesisSessionReasoningProfile {
  return { conviction: 52, adaptability: 52, curiosity: 55, second_order_thinking: 42, noise_filter: 48, ego_risk: 28 };
}

function signal(id: string, source_name: string, source_role: string, kind: ThesisSignal['kind'], stance: ThesisSignal['stance'], order: ThesisSignal['order'], headline: string, body: string, reliability: ThesisSignal['reliability'], motive = ''): ThesisSignal {
  return { id, source_name, source_role, kind, stance, order, headline, body, reliability, motive };
}

function currentDate(state: GameState): string { return state.market_clock?.current_node_date || state.updated_at?.slice(0,10) || '2025-01-23'; }

function templateForEpisode(ep: number): Omit<ThesisCollision,'id'|'date'|'episode'|'resolved'|'decision'|'player_reason'|'result_narrative'> | null {
  const templates: Record<number, Omit<ThesisCollision,'id'|'date'|'episode'|'resolved'|'decision'|'player_reason'|'result_narrative'>> = {
    2: {
      headline: '你的狗屁 Thesis 刚落笔，房间里四种截然不同的解释就全他妈撞了上来',
      framing_question: '“效率提升”到底是在摧毁算力需求，还是在给总需求加杠杆？短期价格和长期产业逻辑必须是同一个该死的答案吗？',
      setup: 'DeepSeek 冲击之后，所有人都在拿同一组该死的事实证明自己想要的结论。你现在最致命的不是信息不足，而是像个懦夫一样挑一条最顺耳的解释当答案。',
      signals: [
        signal('ep2_maya','Maya Chen','基本面研究','FUNDAMENTAL','SUPPORT','FIRST_ORDER','别把“效率更高”和“需求消失”强行焊死成一条因果链','单位推理成本只是一个他妈的变量。调用量、utilization、客户 CapEx 可能全往不同方向狂奔；先去给我找哪一个真的坏了。','MEDIUM','Maya 的职业声誉和这该死的 AI Capex Thesis 绑死了。'),
        signal('ep2_victor','Victor Hale','风险 / 宏观','MACRO','CHALLENGE','FIRST_ORDER','市场绝对可以先把你打爆，再慢悠悠地给你产业答案','长期需求没崩也救不了你短期的 cash runway。估值锚、回撤、风险预算会先把你挤碎；方向对，不等于你他妈活得到验证的那一天。','HIGH','Victor 现在的唯一 KPI 就是别让基金爆仓。'),
        signal('ep2_leo','Leo Park','期权做市','MARKET_STRUCTURE','ORTHOGONAL','FIRST_ORDER','这根血红的 K 线里，有一部分是盘口自己在恐慌踩油门','Put skew、gamma 对冲和被动减仓就像火灾时的拥挤出口：人越急，价格越他妈踩踏。今天 -15% 绝对不能直接翻译成永久基本面重估。','HIGH','Leo 只看成交与库存风险，不管你死活。'),
        signal('ep2_adrian','Adrian Cross','竞争对手基金','COUNTERPARTY','CHALLENGE','FIRST_ORDER','“你们这帮蠢货都在讨论需求，老子在盯着谁必须斩仓。”','他声称真正的血腥机会来自高杠杆多头被迫爆仓，而不是去猜什么狗屁 AI 产业终局。','CONFLICTED','Adrian 既可能在扔烟雾弹，也可能是在引诱你暴露底牌。'),
      ],
      second_order_signal: signal('ep2_second','二阶效应','PM 反方压力测试','BEHAVIORAL','ORTHOGONAL','SECOND_ORDER','最容易漏掉的一层绞肉机：稀缺性和价格会一起重估','如果效率提升让单位算力更便宜，需求可能爆发；但如果硬件门槛同时雪崩，原先靠“稀缺”撑起来的超额利润也会被洗劫一空。需求量、单位经济和估值可以朝三个不同方向撕裂。','MEDIUM','这是反方压力测试，不是他妈的送分题。'),
      second_order_revealed: false,
    },
    3: {
      headline: '反弹开始了，但你他妈面对的是五种完全不同的“为什么”',
      framing_question: '反弹是基本面修复、空头回补、波动率坍塌，还是你自己在自欺欺人地寻找“把昨天赚回来”的狗屁理由？',
      setup: '价格向上并不会自动证明你昨天的 Thesis。真正的问题是：你赚的到底是方向、波动、流动性，还是纯粹的狗屎运！',
      signals: [
        signal('ep3_maya','Maya Chen','基本面研究','FUNDAMENTAL','SUPPORT','FIRST_ORDER','产业逻辑不会一天换两次器官！','供应链、客户 CapEx 和单位经济没有因为两根绿 K 线就他妈重写；反弹只能说明价格在修复，绝不能替代硬核的基本面证据。','MEDIUM','她仍然死命想证明原 Thesis 没有被击穿。'),
        signal('ep3_leo','Leo Park','期权做市','MARKET_STRUCTURE','ORTHOGONAL','FIRST_ORDER','方向对了，昂贵的票价照样能把你生吞了','就像高价黄牛票：演出没取消，不代表你买得值！方向、IV、期限、spread 必须全给我拆开算。','HIGH','Leo 的利润来自吸血般的定价和流动性，而不是押注什么公司故事。'),
        signal('ep3_daniel','Daniel Ross','Prime Broker','COUNTERPARTY','CHALLENGE','FIRST_ORDER','别把 forced cover 意淫成市场写给你的情书','空头回补、保证金释放和融资条件改善都能制造漂亮的虚假买盘；它们只是冷血的资产负债表动作，绝不等于长期看多。','HIGH','Daniel 优先观察资产负债表和真实的资金流。'),
      ],
      second_order_signal: signal('ep3_second','二阶效应','PM 反方压力测试','BEHAVIORAL','CHALLENGE','SECOND_ORDER','你可能根本不是在交易反弹，你只是在交易自己的损失厌恶','如果“昨天亏了多少”正在潜移默化改变你今天愿意承担的风险，那你这破头寸已经不再是由市场机会决定的了。','HIGH','心理扭曲压力测试。'),
      second_order_revealed: false,
    },
    4: {
      headline: '财报前，你的投资判断和“怎么向 LP 解释”开始互相严重污染',
      framing_question: '如果一笔交易最吸引你的地方，仅仅是它能让月报看起来更漂亮，这他妈还叫投资 Thesis 吗？',
      setup: '市场、媒体和 LP 同时张开嘴要一个故事。越多人逼你解释，你就越容易把“好解释”误当成“好交易”。',
      signals: [
        signal('ep4_evelyn','Evelyn Shaw','财经记者','BEHAVIORAL','ORTHOGONAL','FIRST_ORDER','市场可以活在复杂里，头版不行','一旦你把复杂的交易强行剪成一句吸睛的 headline，那句话就会反过来死死咬住你，约束你下一次怎么解释、怎么改口。','MEDIUM','Evelyn 需要一个能卖钱的故事。'),
        signal('ep4_victor','Victor Hale','风险','MACRO','CHALLENGE','FIRST_ORDER','财报前别比谁更有信仰，先比谁更清楚最大损失','信心当不了 collateral。先给我写下 tail loss、cash runway、risk budget，再来谈你那不值钱的 conviction！','HIGH','Victor 的唯一 KPI 就是活下来。'),
        signal('ep4_leo','Leo Park','期权做市','MARKET_STRUCTURE','ORTHOGONAL','FIRST_ORDER','好答案也可能卖成吸血的坏赔率','就像决赛门票：比赛再精彩，黄牛价照样能让你后悔到吐血。事件前 IV、skew 和期限可能早就把“正确”卖得太贵了。','HIGH','Leo 看的是赤裸裸的定价。'),
      ],
      second_order_signal: signal('ep4_second','二阶效应','PM 反方压力测试','BEHAVIORAL','CHALLENGE','SECOND_ORDER','声誉本身会彻底改变你未来的风险承受能力','一笔为了“证明自己”的破交易如果扩大了回撤，损失的绝不只是 P&L，还包括 LP 的容忍度；这会让你下一次真正有优势时，反而连下注的资本都没有。','HIGH','把资本关系当作未来期权价值。'),
      second_order_revealed: false,
    },
    5: {
      headline: '公司 Thesis、利率 Thesis、组合 Thesis 正在死咬同一个风险预算',
      framing_question: '你他妈到底是在押一家公司，还是在无意中押注久期、流动性和宏观 Beta？',
      setup: '一个单股多头可以同时是公司判断、利率判断和极度危险的拥挤度判断。你必须知道自己身上到底背着哪颗雷！',
      signals: [
        signal('ep5_maya','Maya Chen','基本面','FUNDAMENTAL','SUPPORT','FIRST_ORDER','十年期动个几基点，服务器不会因此拔电源！','公司现金流、订单和竞争位置仍然要单独验证；别把贴现率变化直接焊死成产业需求消失！','MEDIUM','Maya 天然更相信公司层面的硬核持续性。'),
        signal('ep5_victor','Victor Hale','宏观 / 风险','MACRO','CHALLENGE','FIRST_ORDER','高估值就是他妈的长久期穿了件公司外套','哪怕公司判断完全正确，贴现率照样能让你亏到吐血。Risk budget 绝不会因为 logo 漂亮就给你暂停计时！','HIGH','Victor 永远以组合不爆仓为第一目标。'),
        signal('ep5_daniel','Daniel Ross','Prime Broker','COUNTERPARTY','ORTHOGONAL','FIRST_ORDER','五个仓位，也可能只有一张催命的抵押品账单','表面分散绝不等于融资风险分散！相关性一飙升，margin 和 collateral 会把这些不同名字的破烂瞬间合并。','HIGH','PB 只看净敞口和致命的相关性。'),
      ],
      second_order_signal: signal('ep5_second','二阶效应','PM 反方压力测试','MACRO','CHALLENGE','SECOND_ORDER','对冲会改变你“需要正确多少”的容错率','一个好的对冲不仅能减少大出血，更会决定在错误持续更久时你还能不能苟活到 Thesis 兑现。风险管理不是观点的敌人，是观点他妈的时间价值！','HIGH','二阶组合崩盘效应。'),
      second_order_revealed: false,
    },
    6: {
      headline: '最致命的毒药，就是那条你最想相信的“独家内幕”',
      framing_question: '信息比市场快一步，究竟是让你收割的优势，还是让你大脑停机的麻醉剂？',
      setup: '监管、人才战和高价值情报同时出现。来源越“接近真相”，你就越容易忽略来源的狗屁动机、合法性和可验证性。',
      signals: [
        signal('ep6_marcus','Marcus Reed','监管','POLICY','CHALLENGE','FIRST_ORDER','可交易价值和合法可使用价值是两条绝对平行的线','来源、取得方式、谁在什么鬼时候知道了什么——这些硬性标准决定了你能否使用它。价值再高也洗不白肮脏的证据链。','HIGH','Marcus 的职责就是用手铐让边界变得具体。'),
        signal('ep6_maya','Maya Chen','研究','FUNDAMENTAL','SUPPORT','FIRST_ORDER','真正的研究优势必须能从公开变量里重新跑出来','如果离开“某个人偷偷告诉我”就无法重建因果链，那就不叫研究，那只是一条随时会断的眼线！','MEDIUM','Maya 希望研究团队的价值不被下三滥的关系网取代。'),
        signal('ep6_adrian','Adrian Cross','对手基金','COUNTERPARTY','ORTHOGONAL','FIRST_ORDER','“你不拿，别人也会拿，别装清高”','他把极端的竞争压力包装成使用灰色危险信息的完美理由。','CONFLICTED','Adrian 就是在等着看你踩雷。'),
      ],
      second_order_signal: signal('ep6_second','二阶效应','PM 反方压力测试','BEHAVIORAL','CHALLENGE','SECOND_ORDER','最昂贵的情报可能不是假的，而是让你过度膨胀集中','信息越是“独家”，你就越容易病态地提高信心、仓位和杠杆；哪怕方向最后对了，过程也足以把整个基金暴露在单点死穴上。','HIGH','信息优势的致命行为学反噬。'),
      second_order_revealed: false,
    },
    7: {
      headline: '当所有人都在发疯般要现金时，“正确”已经变成了一个可悲的奢侈品',
      framing_question: '一笔最终会赚大钱的仓位，如果你他妈活不到那一天，它对你还有个屁的价值？！',
      setup: 'LP 赎回、PB 保证金、波动率和核心持仓同时挤压你干瘪的现金。这里没有任何一个单独的变量能解释这场大屠杀。',
      signals: [
        signal('ep7_victor','Victor Hale','风险','MACRO','CHALLENGE','FIRST_ORDER','先算 runway，再来谈谁更有狗屁信心','最大损失、现金、被迫交易的死点。只有基金活着，观点才有资格站在这里等验证！','HIGH','Victor 已经全面进入生存模式。'),
        signal('ep7_daniel','Daniel Ross','Prime Broker','COUNTERPARTY','CHALLENGE','FIRST_ORDER','信用额度最像晴雨伞：真正下暴雨时，条款会被我们无情重写','保证金和 haircut 瞬间上调，会把昨天“可持有”的优质仓位变成今天必须吐出来的 forced flow。','HIGH','Daniel 正在不择手段地保护银行。'),
        signal('ep7_maya','Maya Chen','基本面','FUNDAMENTAL','SUPPORT','FIRST_ORDER','危机里最先被甩卖的，常常不是最烂的资产，而是最好卖的','别把 forced sale 当成基本面崩溃！如果订单、CapEx、竞争位置没坏，你就要承认你现在卖的只是流动性，不是放弃 Thesis。','MEDIUM','Maya 在死守最后的研究判断。'),
        signal('ep7_leo','Leo Park','市场结构','MARKET_STRUCTURE','ORTHOGONAL','FIRST_ORDER','减风险也得买门票，而且恐慌时的售票员砍人最狠','Spread、IV 和深度会让“我想卖一点”和“我真的能逃出去”变成完全不同的两码事。先看盘口，再谈动作！','HIGH','Leo 盯着极速关闭的执行窗口。'),
      ],
      second_order_signal: signal('ep7_second','二阶效应','PM 反方压力测试','COUNTERPARTY','CHALLENGE','SECOND_ORDER','你今天卖了什么，会决定别人明天还愿不愿意给你续命','如果 PB 和 LP 看到你在高压下仍然死抱着最拥挤、最难退出的风险，他们会直接拉黑你的融资和赎回通道。你的仓位管理会反向摧毁你的资本生命线。','HIGH','资产负债表的二阶死亡螺旋。'),
      second_order_revealed: false,
    },
  };
  return templates[ep] ?? null;
}

export function unresolved_collision(state: GameState): ThesisCollision | null {
  return (state.thesis_collisions ?? []).find((c) => !c.resolved) ?? null;
}

export function maybe_queue_collision(state: GameState): ThesisCollision | null {
  if (state.mode !== 'STORY_CAMPAIGN') return null;
  const ep = state.current_episode_number ?? 1;
  const template = templateForEpisode(ep);
  if (!template) return null;
  const id = `thesis_collision_ep${ep}`;
  const existing = (state.thesis_collisions ?? []).find((c) => c.id === id);
  if (existing) return existing.resolved ? null : existing;
  const dynamicSignals = stateNoiseSignals.current_state_signals(state, ep);
  const collision: ThesisCollision = {
    ...template,
    signals: stateNoiseSignals.interleave_state_signals(template.signals, dynamicSignals),
    id, date: currentDate(state), episode: ep, resolved: false, decision: null, player_reason: null, result_narrative: null,
    signal_classifications: {}, ready_for_resolution: false, hypothesis_frame: null, shock_anchor: shockPropagation.latest_visible_anchor(state),
  };
  (state.thesis_collisions ??= []).push(collision);
  noiseStream.seed_for_collision(state, collision);
  return collision;
}

function mutateReasoning(state: GameState, decision: ThesisCollisionDecision, secondOrderRevealed: boolean): void {
  const p = (state.thesis_session_profile ??= default_thesis_session_profile());
  if (decision === 'HOLD') { p.conviction = clamp(p.conviction + 6); p.ego_risk = clamp(p.ego_risk + (secondOrderRevealed ? 1 : 5)); p.noise_filter = clamp(p.noise_filter + 2); }
  if (decision === 'REVISE') { p.adaptability = clamp(p.adaptability + 7); p.ego_risk = clamp(p.ego_risk - 4); p.second_order_thinking = clamp(p.second_order_thinking + (secondOrderRevealed ? 6 : 2)); }
  if (decision === 'PAUSE') { p.curiosity = clamp(p.curiosity + 5); p.noise_filter = clamp(p.noise_filter + 6); p.ego_risk = clamp(p.ego_risk - 2); }
  if (decision === 'NO_EDGE') { p.adaptability = clamp(p.adaptability + 4); p.noise_filter = clamp(p.noise_filter + 7); p.conviction = clamp(p.conviction - 2); }
}

export function classify_signal(state: GameState, collisionId: string, signalId: string, classification: ThesisSignalClassification): string {
  const c = (state.thesis_collisions ?? []).find((x) => x.id === collisionId && !x.resolved);
  if (!c) throw new Error('这个观点碰撞已经结束，或不存在。');
  const sig = c.signals.find((x) => x.id === signalId);
  if (!sig) throw new Error('找不到这条信息。');
  const streamResult = noiseStream.classify_item(state, collisionId, signalId, classification);
  (c.signal_classifications ??= {})[signalId] = classification;
  const p = (state.thesis_session_profile ??= default_thesis_session_profile());
  if (classification === 'WATCH') p.curiosity = clamp(p.curiosity + 1);
  if (streamResult.complete) c.ready_for_resolution = true;
  const nextText = streamResult.next
    ? ` 下一条通信接入：${streamResult.next.source_name} · ${streamResult.next.source_role}。`
    : streamResult.complete ? ' 第一轮噪音已经处理完。现在可以进入观点碰撞，决定是否继续承担风险。' : '';
  return `${sig.source_name} 的信息已标记为 ${classification === 'DRIVER' ? '核心驱动' : classification === 'NOISE' ? '噪音' : '待验证'}。${nextText}`;
}


export function update_hypothesis_frame(
  state: GameState, collisionId: string, mustBeTrue: string, falsifier: string, blindSpot = '', confidencePct = 55,
  firstOrderDriver = '', successFeedback = '', reflexiveFailure = '', observableStopTrigger = '',
  directImpact = '', substitutionResponse = '', capitalPolicyFeedback = '', secondOrderDistribution = '', observableNextLink = '',
): string {
  const c = (state.thesis_collisions ?? []).find((x) => x.id === collisionId && !x.resolved);
  if (!c) throw new Error('这个观点碰撞已经结束，或不存在。');
  if (!c.ready_for_resolution) throw new Error('第一轮信息还没有处理完。先面对所有已接入的声音，再锁定你的假设。');
  if ((mustBeTrue ?? '').trim().length < 8) throw new Error('“什么必须成立”写得太短。至少写清一条可被现实检验的因果条件。');
  if ((falsifier ?? '').trim().length < 8) throw new Error('“什么会证明我错”不能留空。没有证伪条件的观点只是信仰。');
  if (!Number.isFinite(confidencePct) || confidencePct < 5 || confidencePct > 95) throw new Error('事前信心必须在 5%–95% 之间。100% 不是信心，是拒绝证伪。');
  const explicitReflexivity = [firstOrderDriver, successFeedback, reflexiveFailure, observableStopTrigger].some((v) => Boolean(v?.trim()));
  const reflexivityFrame = explicitReflexivity
    ? reflexivity.build_frame(firstOrderDriver, successFeedback, reflexiveFailure, observableStopTrigger)
    : reflexivity.backward_compatible_frame(mustBeTrue, falsifier, blindSpot);
  const explicitShock = [directImpact, substitutionResponse, capitalPolicyFeedback, secondOrderDistribution, observableNextLink].some((v) => Boolean(v?.trim()));
  const shockFrame = explicitShock && c.shock_anchor
    ? shockPropagation.build_frame(c.shock_anchor, directImpact, substitutionResponse, capitalPolicyFeedback, secondOrderDistribution, observableNextLink)
    : c.hypothesis_frame?.shock_propagation_frame ?? null;
  if (explicitShock && !c.shock_anchor) throw new Error('当前日期没有可验证的公开事件可以作为冲击传导锚点。');
  c.hypothesis_frame = {
    must_be_true: mustBeTrue.trim(),
    falsifier: falsifier.trim(),
    blind_spot: (blindSpot ?? '').trim(),
    confidence_pct: Math.round(confidencePct),
    reflexivity_frame: reflexivityFrame,
    shock_propagation_frame: shockFrame,
    updated_at: new Date().toISOString(),
  };
  c.reflexivity_challenges = reflexivity.build_character_challenges(state, reflexivityFrame);
  const p = (state.thesis_session_profile ??= default_thesis_session_profile());
  p.curiosity = clamp(p.curiosity + 1);
  p.noise_filter = clamp(p.noise_filter + 1);
  if (c.hypothesis_frame.blind_spot) p.second_order_thinking = clamp(p.second_order_thinking + 1);
  if (explicitReflexivity) p.second_order_thinking = clamp(p.second_order_thinking + 2);
  if (explicitShock) { p.second_order_thinking = clamp(p.second_order_thinking + 2); p.curiosity = clamp(p.curiosity + 1); }
  return `PM 假设框架与反身性因果链已锁定：事前信心 ${c.hypothesis_frame.confidence_pct}%。这不是答案或仓位指令；它冻结的是未来价格出现前你承诺的因果模型。`;
}

export function reveal_second_order(state: GameState, collisionId: string): string {
  const c = (state.thesis_collisions ?? []).find((x) => x.id === collisionId && !x.resolved);
  if (!c) throw new Error('这个观点碰撞已经结束，或不存在。');
  if (!c.ready_for_resolution) throw new Error('第一轮信息还没有处理完。先把噪音流里的每条信息判断完，再问二阶效应。');
  c.second_order_revealed = true;
  const p = (state.thesis_session_profile ??= default_thesis_session_profile());
  p.curiosity = clamp(p.curiosity + 3); p.second_order_thinking = clamp(p.second_order_thinking + 3);
  return c.second_order_signal ? `反方二阶效应已展开：${c.second_order_signal.headline}` : '没有额外二阶效应。';
}

export function resolve_collision(state: GameState, collisionId: string, decision: ThesisCollisionDecision, reason: string): string {
  const c = (state.thesis_collisions ?? []).find((x) => x.id === collisionId && !x.resolved);
  if (!c) throw new Error('这个观点碰撞已经结束，或不存在。');
  if (!c.ready_for_resolution) throw new Error('你还没有处理完第一轮信息。系统不会替你把噪音整理好。');
  if (!reason?.trim()) throw new Error('必须写一句你为什么这么决定。');
  if (!c.hypothesis_frame?.must_be_true?.trim() || !c.hypothesis_frame?.falsifier?.trim() || !c.hypothesis_frame?.reflexivity_frame) {
    throw new Error('先锁定 PM 假设框架与反身性因果链：什么必须成立？成功后世界怎么反应？什么反馈会反噬？什么证据会让你停？');
  }
  const classifications = c.signal_classifications ?? {};
  const unclassified = c.signals.filter((sig) => !classifications[sig.id]);
  if (unclassified.length) throw new Error(`还有 ${unclassified.length} 条信息没有被你判断：核心驱动 / 噪音 / 待验证。`);
  mutateReasoning(state, decision, Boolean(c.second_order_revealed));
  const p = (state.thesis_session_profile ??= default_thesis_session_profile());
  const supportDrivers = c.signals.filter((sig) => sig.stance === 'SUPPORT' && classifications[sig.id] === 'DRIVER').length;
  const challengeNoise = c.signals.filter((sig) => sig.stance === 'CHALLENGE' && classifications[sig.id] === 'NOISE').length;
  if (supportDrivers >= 1 && challengeNoise >= 2) p.ego_risk = clamp(p.ego_risk + 7);
  else if (Object.values(classifications).includes('WATCH')) p.noise_filter = clamp(p.noise_filter + 2);
  c.resolved = true; c.decision = decision; c.player_reason = reason.trim();
  c.post_decision_reactions = characterEmotions.react_to_thesis_collision_resolution(state, c);
  const label = decision === 'HOLD' ? '坚持原 Thesis' : decision === 'REVISE' ? '更新 Thesis' : decision === 'PAUSE' ? '暂停交易，继续查证' : '承认没有优势，不交易';
  c.result_narrative = `${label}。真正被记录的不是你“选对了没有”，而是你在冲突信息下为什么这么做。`;
  const nodes = [{ date: c.date }] as any;
  const classLabel = (v: ThesisSignalClassification) => v === 'DRIVER' ? '核心驱动' : v === 'NOISE' ? '噪音' : '待验证';
  const signalDigest = c.signals.map((s) => `${s.source_name}[${classLabel(classifications[s.id])}]：${s.headline}`).join('；');
  const secondDigest = c.second_order_revealed && c.second_order_signal ? `｜二阶效应：${c.second_order_signal.headline}` : '｜二阶效应：未主动展开';
  const confidenceDigest = typeof c.hypothesis_frame.confidence_pct === 'number' ? `${c.hypothesis_frame.confidence_pct}%` : '未记录';
  const rf = c.hypothesis_frame.reflexivity_frame;
  const reflexivityDigest = `｜一阶驱动：${rf.first_order_driver}｜成功后的反馈：${rf.success_feedback}｜反身性失败：${rf.reflexive_failure}｜STOP 条件：${rf.observable_stop_trigger}`;
  const sf = c.hypothesis_frame.shock_propagation_frame;
  const shockDigest = sf ? `｜冲击锚点：${sf.anchor.date} ${sf.anchor.headline} [${sf.anchor.source_type}]｜直接冲击：${sf.direct_impact}｜替代反应：${sf.substitution_response}｜资本/政策反馈：${sf.capital_policy_feedback}｜二阶分布：${sf.second_order_distribution}｜下一验证信号：${sf.observable_next_link}` : '';
  const hypothesisDigest = `｜事前信心：${confidenceDigest}｜必须成立：${c.hypothesis_frame.must_be_true}｜证伪条件：${c.hypothesis_frame.falsifier}${c.hypothesis_frame.blind_spot ? `｜自认盲区：${c.hypothesis_frame.blind_spot}` : ''}${reflexivityDigest}${shockDigest}`;
  decisionTimeline.record_decision(state, nodes, 'THESIS_STRESS_TEST_COMPLETED', `EP${c.episode}: 完成观点压力测试 · ${label}`, `当时信号：${signalDigest}${secondDigest}${hypothesisDigest}｜玩家理由：${c.player_reason}`);
  if (decision === 'NO_EDGE') decisionTimeline.record_decision(state, nodes, 'NO_TRADE_DECISION', `EP${c.episode}: 明确无优势，不交易`, `观点碰撞后主动放弃交易。理由：${c.player_reason}`);
  return c.result_narrative;
}
