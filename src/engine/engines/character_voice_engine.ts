import type {
  CharacterEmotion,
  GameState,
  MarketDecisionWindow,
  ReflexivityFrame,
  ThesisCollision,
  ThesisSignalStance,
} from '../schemas';

export type VoiceDisclosure = 'FULL' | 'NORMAL' | 'MINIMUM' | 'FORMAL_ONLY';

export interface CharacterVoiceProfile {
  id: string;
  name: string;
  professional_core: string;
  cadence: string;
  analogy_domains: string[];
  signature_terms: string[];
  reference_habit: string;
  pressure_shift: string;
  anti_pattern: string;
}

export const CHARACTER_VOICE_BIBLE: Record<string, CharacterVoiceProfile> = {
  maya_chen: {
    id: 'maya_chen', name: 'Maya Chen', professional_core: '产业研究 / 单位经济 / 工程因果链',
    cadence: '先拆变量，再指出跳步，最后给可验证问题。平时句子完整；生气后类比减少、问句变短。',
    analogy_domains: ['工程故障树', '生物系统', '供应链', '产品迭代', '医学诊断'],
    signature_terms: ['CapEx', 'utilization', 'unit economics', '供应链', '证伪条件', '需求弹性'],
    reference_habit: '很少流行文化引用；类比主要来自工程、科研和真实产业流程。',
    pressure_shift: '压力越高越拒绝故事化表达，直接要求变量、时间戳和证伪条件。',
    anti_pattern: '不说交易员俏皮话，不把价格本身当基本面答案。',
  },
  victor_hale: {
    id: 'victor_hale', name: 'Victor Hale', professional_core: '组合生存 / 尾部风险 / 资本预算',
    cadence: '短句、三段式、排比。把复杂争论压缩成损失、现金、时间。',
    analogy_domains: ['氧气', '跑道', '防火门', '救生艇', '军事补给'],
    signature_terms: ['runway', 'tail loss', 'risk budget', 'correlation', 'liquidity', 'drawdown'],
    reference_habit: '几乎不用流行文化；偶尔用历史灾难或生存场景，但永远为了压缩风险问题。',
    pressure_shift: 'HIGH/CRITICAL 时句子更短，命令式增加，修辞减少。',
    anti_pattern: '不炫专业名词，不讲长故事，不把勇气当风险管理。',
  },
  leo_park: {
    id: 'leo_park', name: 'Leo Park', professional_core: '期权定价 / 做市库存 / 微观结构',
    cadence: '先来一个生活/体育/赌场式类比，再迅速落回 IV、skew、spread、gamma、期限与流动性。冷幽默。',
    analogy_domains: ['拍卖', '赌场', '体育盘口', '暴雪买发电机', '保险', '二手车', '酒吧最后一轮'],
    signature_terms: ['IV', 'skew', 'spread', 'gamma', 'theta', 'mid', 'liquidity'],
    reference_habit: '四个核心角色里最爱文化和日常类比；但每次引用必须解释价格/赔率，而不是单纯玩梗。',
    pressure_shift: '压力高时玩笑缩短，直接报“你为这个观点付了什么价格”。',
    anti_pattern: '不替基本面下结论；永远区分“方向对”与“表达买得对”。',
  },
  daniel_ross: {
    id: 'daniel_ross', name: 'Daniel Ross', professional_core: 'Prime Brokerage / 融资 / 抵押品 / 对手方经济',
    cadence: '礼貌、完整、像商务谈判。越危险越客气；最后一句通常落在“谁替谁买单”。',
    analogy_domains: ['房贷', '保险', '餐厅账单', '信用额度', '抵押品', '生意条款'],
    signature_terms: ['haircut', 'financing spread', 'margin', 'collateral', 'forced flow', 'risk committee'],
    reference_habit: '很少引用影视；更喜欢银行、房贷、保险、饭局和合同的日常经验。',
    pressure_shift: '压力高时礼貌不消失，但可选择空间会明显收窄。',
    anti_pattern: '不大喊大叫，不把融资约束伪装成投资真理。',
  },
  evelyn_shaw: {
    id: 'evelyn_shaw', name: 'Evelyn Shaw', professional_core: '媒体叙事 / 信息来源 / 公共解释',
    cadence: '像编辑一样拆“事实、镜头、标题、遗漏”。会逼对方把行话翻译成人话。',
    analogy_domains: ['剪辑室', '预告片', '头版', '舞台', '采访'],
    signature_terms: ['source', 'on record', 'headline', 'timeline', 'narrative'],
    reference_habit: '可使用电影/电视的结构类比，但不复述原台词；重点是“你在给观众看哪一幕”。',
    pressure_shift: '怀疑上升时问题更短，开始抓停顿、改口与时间线。',
    anti_pattern: '不替玩家做投资判断，她攻击的是叙事完整性。',
  },
  marcus_reed: {
    id: 'marcus_reed', name: 'Marcus Reed', professional_core: '监管 / 审计 / 证据链',
    cadence: '平、准、几乎没有修辞。使用时间戳、记录、证据门槛。越平静越危险。',
    analogy_domains: ['审计轨迹', '证据链'],
    signature_terms: ['timestamp', 'record', 'chain of custody', 'evidence threshold'],
    reference_habit: '几乎不用文化引用。',
    pressure_shift: '压力高时不提高音量，只减少可解释空间。',
    anti_pattern: '不做戏，不用夸张比喻，不把怀疑写成证据。',
  },
  adrian_cross: {
    id: 'adrian_cross', name: 'Adrian Cross', professional_core: '竞争博弈 / 掠夺策略 / 对手心理',
    cadence: '挑衅、竞技化、黑色幽默。常把市场变成拳台、牌桌、赛车或战役，但落点必须是博弈行为。',
    analogy_domains: ['扑克', '拳击', '赛车', '围城', '季后赛', '战争史'],
    signature_terms: ['tell', 'bluff', 'forced seller', 'liquidity', 'positioning'],
    reference_habit: '最适合短文化/体育引用，但不能复制影视台词，也不能为了显聪明而引用。',
    pressure_shift: '受挫时笑话更毒；真正尊重玩家时反而减少废话，直接攻击弱点。',
    anti_pattern: '不能只说狠话；每次挑衅必须暴露一个真实博弈假设。',
  },
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function quote(value: string | null | undefined, max = 118): string {
  const text = clean(value).replace(/[。！？!?]+$/, '');
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[stableHash(seed) % items.length];
}

function affectFor(state: GameState, characterId: string): { emotion: CharacterEmotion; intensity: number } {
  const affect = state.character_emotions?.[characterId];
  return { emotion: affect?.emotion ?? 'CALM', intensity: Number(affect?.intensity ?? 30) };
}

function hardPressure(state: GameState, characterId: string, pressure?: string | null): boolean {
  if (pressure === 'CRITICAL' || pressure === 'HIGH') return true;
  const a = affectFor(state, characterId);
  return a.intensity >= 72 || ['PANIC', 'ANGRY', 'PRESSURED'].includes(a.emotion);
}

function guarded(state: GameState, characterId: string, disclosure?: VoiceDisclosure): boolean {
  if (disclosure === 'FORMAL_ONLY' || disclosure === 'MINIMUM') return true;
  const rel = state.relationships?.[characterId];
  const a = state.character_emotions?.[characterId];
  return Number(rel?.trust ?? 50) < 30 || a?.toward_player === 'COLD' || a?.toward_player === 'HOSTILE';
}

function marketContext(window: MarketDecisionWindow): string {
  return `${window.session_date}|${window.reveal_time_label ?? ''}|${window.dramatic_beat ?? ''}|${window.sequence}`;
}

export function renderMarketWindowVoice(
  state: GameState,
  characterId: string,
  window: MarketDecisionWindow,
  previous: MarketDecisionWindow | null,
  pressure?: string | null,
): string {
  const time = window.reveal_time_label ?? '';
  const prior = quote(previous?.player_reason);
  const hard = hardPressure(state, characterId, pressure);
  const seed = `${characterId}|market|${marketContext(window)}|${prior}`;

  if (characterId === 'maya_chen') {
    if (window.stage === 'PREMARKET') return hard
      ? '停！别他妈把“效率更高”直接翻译成“GPU 需求消失”。CapEx、利用率、调用量——哪一个真的崩了？说不出来，就还没证伪 Thesis，别在这自己吓自己！'
      : '把这当工程故障树，不是新闻标题。DeepSeek 先改变了单位推理成本；接下来死盯调用量、utilization 和 hyperscaler CapEx。到底是哪一条链断了？';
    if (time === '11:30 ET' && prior) return hard
      ? `你 10:30 写的是“${prior}”。第二段暴跌已经来了。哪个产业变量变了？没有的话，就别拿账面的疼当成基本面的溃烂！`
      : `你 10:30 把“${prior}”写进记录。现在像做故障诊断：价格又坏了一段，但 CapEx、订单、utilization 哪个传感器真的变了？如果没有，别把症状当病因。`;
    if (time === '13:30 ET') return hard
      ? '上午的确认少了一块。基本面没有权利跟着每根 K 线改口，别像个韭菜一样随风倒。告诉我新增或消失的变量！'
      : '上午像一次漂亮的 A/B test，下午却把样本又污染了。先别急着改结论：供应链、客户订单、单位经济，究竟哪个新事实让你的概率分布变了？';
    return pick([
      '别让我看一根 K 线做尸检。价格只告诉你哪里疼；供应链、CapEx 和 utilization 才告诉你为什么疼。现在你缺的是哪块硬证据？',
      '这不是把三个变量压成一个红绿灯的问题。需求弹性、单位经济、竞争反应要分开看。你现在到底更新了哪一个？别糊弄我。',
    ], seed);
  }

  if (characterId === 'victor_hale') {
    if (hard) {
      if (time === '15:30 ET') return '三件事：最大隔夜损失，现金 runway，被迫交易点。最后 30 分钟就是个绞肉机，没人知道会发生什么。把这三个数给我死死守住，再谈你那该死的 conviction！';
      if (time === '11:30 ET' && prior) return `你一小时前写：“${prior}”。现在别跟我扯别的，只回答三件事：STOP 到没到，risk budget 还剩多少，现金还能撑多久。别他妈乱挪门柱！`;
      return '先活下来！最大损失。现金 runway。被迫交易点。方向对错我们明天再争，今天先保证基金别死。';
    }
    if (time === '15:30 ET') return '风险就像氧气，平时没人讨论，缺的时候一切 Thesis 都是狗屁。最后 30 分钟没人能看透；把 overnight tail、cash runway 和 forced-seller 点白纸黑字写清楚。';
    if (time === '11:30 ET' && prior) return `你一小时前给自己的原则是“${prior}”。风险框架像防火门：真着火的时候再去推门槛，那就不叫门了。现在红线到了没有？`;
    return pick([
      '谁对谁错可以先放一边。先问三件事：能亏多少，能错多久，什么时候会被迫斩仓。基金活着，你的观点才有机会去兑现。',
      'Correlation 平时像一群互不认识的人，火警一响全往同一个出口挤。你现在的 risk budget 够不够那个出口变窄时的踩踏？',
    ], seed);
  }

  if (characterId === 'leo_park') {
    if (hard) return time === '15:30 ET'
      ? '别跟我讲故事！IV、skew、spread、两夜 theta。你为这个破观点付的价格已经印在票上了。到底值不值这个价，回答我！'
      : '把方向先塞回桌底下。看 IV、skew、spread、gamma。你现在的问题根本不是“想法好不好”，是“这张票你买贵没有”！';
    if (time === '14:30 ET') return pick([
      '这就像暴雪警报响了一小时才想起来买发电机：东西当然有用，问题是全城都在抢。方向可以对；但 IV、skew 和 spread 照样能把你生剥了。',
      '公司故事是车，期权是你签的贷款。车没坏，不代表 APR 不荒唐。现在把 IV、期限和 spread 单独拎出来审。',
    ], seed);
    if (time === '15:30 ET') return pick([
      '周五最后 30 分钟就是拍卖会收槌：每个人都知道钟要响，所以“能成交”和“好价格”完全是两码事。看 IV、skew、两夜 theta——你真要把这张破票带到周一？',
      '现在买隔夜保护，像暴风雪下起来了才给航班买保险。不是没用，是赔率已经变了。最后 30 分钟是盲盒；你只决定这个 expression 值不值扛两夜 gap。',
    ], seed);
    if (time === '11:30 ET') return pick([
      '第二段继续狂飙，很像牌桌上连赢两手——最要命的不是好运，是你开始把好运当 skill。加 conviction 可以，先告诉我赔率到底哪里真的变好了？',
      '反弹追到第二段，就像二手车拍卖里隔壁三个凯子突然一起举牌。车没因此多长个发动机。IV、spread 和追价成本到底给你剩了什么肉？',
    ], seed);
    return '盘口就是酒吧最后一轮：越晚大家越急，价格越不讲规矩。先看 spread、IV 和 gamma，再决定你是不是非得现在干了这一杯。';
  }

  if (characterId === 'daniel_ross') {
    if (hard) return '我完全尊重你的狗屁观点。但现在请把观点放一边。Haircut、margin、collateral、forced flow——这四样东西决定我还能让你把多少敞口带走。';
    if (time === '15:30 ET') return pick([
      '我当然可以继续给你信用，就像银行愿意给优质客户发房贷。区别只在首付。周末前 haircut、margin 和 collateral 全得重新算一遍，你还愿意签这张单吗？',
      '饭局可以继续，账单不会自己长脚跑了。今天流动性还在；过钟以后谁先动手、financing spread 怎么抽风，根本不由你的 Thesis 决定。你准备让谁替这两夜买单？',
    ], seed);
    return pick([
      '我相信你有观点。银行也相信按时还贷的良民，所以才收抵押品。把 collateral、haircut 和 forced-flow 死亡线摆出来，我们再谈你想拿多久。',
      '公司事实可以慢慢证明，risk committee 可不会慢慢等。Financing spread、margin、collateral——条件变了，同一个 Thesis 就不再是同一笔融资了。',
    ], seed);
  }

  if (characterId === 'evelyn_shaw') return '你可以剪一个很漂亮的预告片，但市场可是会播完整版的。哪一段是干货，哪一段是你为了让故事圆起来自己瞎补的？';
  if (characterId === 'marcus_reed') return '给我时间戳、当时可见的信息和你的交易记录。其余的废话修辞别往证据链里塞。';
  if (characterId === 'adrian_cross') return '牌桌上最贵的 tell 不是手抖，是你开始急着替自己找补。你现在到底是在更新模型，还是在给烂仓位找台阶下？';
  return '新的已知条件已经改变。把原承诺拿回来，再决定是不是要抠扳机。';
}

export function renderSeasonContinuityVoice(
  state: GameState,
  characterId: string | null,
  source: MarketDecisionWindow,
  current: MarketDecisionWindow,
): string {
  const old = quote(source.player_reason, 122);
  const sourceLabel = `${source.session_date} ${source.reveal_time_label ?? ''}`.trim();
  const hard = characterId ? hardPressure(state, characterId) : false;

  if (characterId === 'maya_chen') return hard
    ? `${sourceLabel} 你写过“${old}”。今天哪一个变量让它报废了？没有变量，就别他妈让账面浮亏替你改实验结论！`
    : `${sourceLabel} 你把“${old}”锁进记录。把它当实验假设：今天的供应链、CapEx、utilization 哪一项真的换了条件？如果都没有，价格没有资格替你偷偷重写证据标准。`;
  if (characterId === 'victor_hale') return hard
    ? `${sourceLabel}：“${old}”。旧原则碰上新压力。STOP、risk budget、runway——这些该死的红线现在还算数吗？`
    : `${sourceLabel} 你留下“${old}”。风险原则像救生艇容量，不会因为今天海面风平浪静就自动变大。我不问当时赚没赚钱；我只问今天这条底线还算不算数。`;
  if (characterId === 'leo_park') return `${sourceLabel} 你吹过“${old}”。同一个 Thesis 换了 IV、skew、期限和 spread，就像同一辆破车换了高利贷合同——车还是那辆车，交易早他妈不是那笔交易了。你现在死扛的是原则，还是下不来台的仓位？`;
  if (characterId === 'daniel_ross') return `${sourceLabel} 你给自己的理由是“${old}”。那是当时的 collateral 和融资条件。房贷利率飙升以后，房子没变，月供会要命。今天你还愿意为同一句狗屁原则付多少 haircut 和 margin？`;
  if (characterId === 'evelyn_shaw') return `${sourceLabel} 你的旧版本是“${old}”。今天如果要改稿，明确告诉我是哪条新事实进了第二版，不要只给我换个擦边球标题。`;
  if (characterId === 'marcus_reed') return `${sourceLabel} 的记录是“${old}”。如要改变结论，请指出之后出现的新证据及时间戳，审计轨迹不会听你讲故事。`;
  if (characterId === 'adrian_cross') return `${sourceLabel} 你把“${old}”亮在牌桌上。现在最有意思的不是你当时到底对不对，而是你会不会在筹码崩盘以后，像个输不起的混蛋一样假装自己从没说过。`;
  return `${sourceLabel} 你把“${old}”锁进记录。新的已知条件已经出现：这条承诺还成立，还是你明确宣布它失效？`;
}

export function renderReflexivityVoice(
  state: GameState,
  characterId: string,
  frame: ReflexivityFrame,
  disclosure: VoiceDisclosure = 'NORMAL',
): string {
  const first = quote(frame.first_order_driver, 92);
  const feedback = quote(frame.success_feedback, 92);
  const failure = quote(frame.reflexive_failure, 92);
  const stop = quote(frame.observable_stop_trigger, 92);
  const hard = hardPressure(state, characterId);
  const isGuarded = guarded(state, characterId, disclosure);
  let line = '';

  if (characterId === 'maya_chen') line = hard
    ? `一阶驱动：“${first}”。成功反馈：“${feedback}”。别他妈给我写故事！竞争者、客户、供应商哪个会先倒戈？哪个变量一变，“${failure}”就直接兑现？`
    : `把它当工程故障树。你的一阶驱动是“${first}”；如果“${feedback}”真的发生，竞争者、客户和供应商会怎样重新布线？最后哪个反馈会把利润池短路成“${failure}”？`;
  else if (characterId === 'victor_hale') line = hard
    ? `失败条件：“${failure}”。STOP：“${stop}”。就问两件事：信号够不够早，看到以后你他妈会不会真的切断电源？其余全都不重要！`
    : `你写了“${failure}”，也写了 STOP“${stop}”。防火门的意义是在烟起来以前能关。这个信号会不会在 P&L 已经烧穿 risk budget 之前出现？`;
  else if (characterId === 'leo_park') line = `“${first}”方向可以成立，期权照样能把你生吞了。像演唱会门票：歌手没失约，不代表你黄牛价买票是好交易。市场是不是早就把“${feedback}”塞进 IV、skew 和期限结构里了？`;
  else if (characterId === 'daniel_ross') line = `我接受“${first}”可能成立。现在谈账单：如果参与者按“${feedback}”行动，haircut、margin、inventory 和 forced flow 谁先暴雷？公司没错，也可能是融资条件先让“${failure}”发生。`;
  else if (characterId === 'evelyn_shaw') line = `第一幕是“${first}”，第二幕是“${feedback}”。我就想知道你是不是把烂尾结局“${failure}”藏在剪辑台下面了。哪条公开事实会逼你承认故事必须改稿？`;
  else if (characterId === 'marcus_reed') line = `记录四项：driver“${first}”；feedback“${feedback}”；failure“${failure}”；stop“${stop}”。请确保每一项都能对应未来可验证的硬证据。`;
  else if (characterId === 'adrian_cross') line = `你把“${first}”当 edge。很好。扑克里最漂亮的陷阱就是所有人看见同一张牌以后一起改变打法。“${feedback}”会不会正好把你的 edge 挤成“${failure}”，让你死得明明白白？`;
  else line = `驱动“${first}”，反馈“${feedback}”，失败“${failure}”，STOP“${stop}”。把它们写成能被现实检验的链条。`;

  if (disclosure === 'FORMAL_ONLY') return `${line.split('。')[0]}。其余判断由你自己完成。`;
  if (disclosure === 'MINIMUM' || isGuarded) return `${line} 我只给到这里，不替你把链补完。`;
  if (disclosure === 'FULL') return `${line} 你把标准写死，我会继续帮你找最早出现的反证。`;
  return line;
}

export function renderDecisionReactionVoice(
  state: GameState,
  characterId: string,
  decision: NonNullable<ThesisCollision['decision']>,
  stance: ThesisSignalStance,
  emotion: CharacterEmotion,
  intensity: number,
): string {
  // 2026-08-19：这一行在文本润色那一轮被误删了，而下面 maya / victor 两个分支
  // 仍在用 `hard`——等于引用了一个未声明的变量，函数一被调用就炸。
  // 这个文件有历史遗留的坏 import（relationship_stage_engine 缺失），
  // 所以 tsc 和 vitest 都跑不到这里，是靠「结构声明计数 70→69」抓出来的。
  // **润色任务只许改字符串内容，删声明属于改逻辑。**
  const hard = intensity >= 72 || ['ANGRY', 'PRESSURED', 'PANIC'].includes(emotion);
  if (characterId === 'maya_chen') {
    if (decision === 'HOLD') return hard ? '可以扛。但别他妈死扛故事！盯死你自己写的 falsifier；只要变量一坏，立马给我改！' : '好。那就像做长期实验：别用“我相信”保护烂样本。盯供应链、CapEx 和你自己写下的证伪条件。';
    if (decision === 'REVISE') return '改模型没问题。工程师换假设不丢人；因为机器报警就把传感器拔掉才丢人。告诉我，到底是新证据变了，还是账面的血让你疼了？';
    if (decision === 'PAUSE') return '先停实验、补数据。研究最怕的不是晚一天，是为了赶时间把未知瞎编成已知。';
    return '可以不做。把缺的那块证据写清楚，下次同一结构回来，别让大家再从零开始陪你耗。';
  }
  if (characterId === 'victor_hale') {
    if (decision === 'HOLD') return hard ? '可以。Falsifier。Runway。最大损失。我从现在开始就像死神一样只盯着这三样。' : '你听完风险还是决定扛，可以。救生艇已经编号：falsifier、cash runway、最大损失。别在浪卷过来以后再去重新数座位！';
    if (decision === 'REVISE') return '这不是谁赢了辩论。是 risk budget 终于他妈的进了模型。方向可以改，生存条件给我死死咬住。';
    if (decision === 'PAUSE') return '暂停不是怂。没有 edge 的时候，现金本身就是最狠的仓位；有火的时候，门先关上。';
    return '没有优势就别去浪费风险预算。市场明天还开门，我希望基金明天也最好还在。';
  }
  if (characterId === 'leo_park') {
    if (decision === 'HOLD') return '方向你可以坚持，价格别他妈瞎坚持。像同一场球买不同盘口：球队没变，赔率早就变了。Spread、IV、期限不会因为你有 conviction 就给你打折。';
    if (decision === 'REVISE') return '对！把 Thesis 和票价拆开。歌还是那首歌，黄牛价就不一定值得付了；方向不改，也可以把 IV、strike、期限全给我重做一遍。';
    if (decision === 'PAUSE') return '等盘口给你一个能交易的价格。酒吧最后一轮你不喝，不会有混蛋来取消你的华尔街会员卡。';
    return '最便宜的坏交易永远是老子不做。等赔率回来。';
  }
  if (characterId === 'daniel_ross') {
    if (decision === 'HOLD') return '当然可以继续持有。银行也允许快破产的房主继续住。现在给我首付版本：如果你错两天，margin 和 collateral 你准备从哪抠出来？';
    if (decision === 'REVISE') return '很好。观点可以改，但抵押品可不会等你慢慢接受现实。我们把 haircut 和融资空间全部重新算一遍。';
    if (decision === 'PAUSE') return '暂停新增风险我还能向委员会解释。真失控了你再让我去解释，那就只剩直接抽干你的信用额度了。';
    return '不做这笔交易，risk committee 没人会给你扣分。活不到下一笔才会。';
  }
  if (characterId === 'evelyn_shaw') return decision === 'REVISE' ? '改稿总比假装第一版从没错过要来得可信。告诉我，到底是哪条新事实逼得你改了第二版。' : '好，版本已经上 record。市场会拿着刀替这句话做事实核查的。';
  if (characterId === 'marcus_reed') return '决定已记录。之后你只需要保证新证据、时间戳和下一次修改能互相解释。';
  if (characterId === 'adrian_cross') return decision === 'REVISE' ? 'Fuck，你居然还会换打法。麻烦了——拳台上最容易打爆的就是只会一套组合拳的蠢货。' : '继续。牌已经亮了。现在我就看谁先把自己的 tell 当成了神圣不可侵犯的原则。';
  return '决定已经记下。现在让市场继续。';
}

export function renderCalibrationVoice(
  state: GameState,
  characterId: string,
  collision: ThesisCollision,
): string | null {
  const confidence = collision.hypothesis_frame?.confidence_pct;
  if (typeof confidence !== 'number') return null;
  const classifications = collision.signal_classifications ?? {};
  const watchCount = Object.values(classifications).filter((v) => v === 'WATCH').length;

  if (confidence >= 85 && watchCount >= 2) {
    if (characterId === 'maya_chen') return `${confidence}% 可以。可你自己还留着 ${watchCount} 条 WATCH。做实验不能一边把两个传感器贴红标签，一边宣布系统 95% 正常。哪条铁证让你敢这么压缩不确定性？`;
    if (characterId === 'victor_hale') return `${confidence}%。${watchCount} 条 WATCH。这两个狗屁数字根本不可能住在同一间房里。别用你那虚无缥缈的语气替 risk budget 做担保！`;
    if (characterId === 'leo_park') return `${confidence}% 是你的信念，不是市场给你发的 coupon。${watchCount} 条 WATCH 还在，别拿你那不值钱的 conviction 去给 IV 付溢价。`;
    if (characterId === 'daniel_ross') return `${confidence}% 我听见了。很遗憾，融资委员会从不收 confidence 当 collateral；尤其你自己账面上还标着 ${watchCount} 条 WATCH。`;
  }
  if (confidence <= 35 && collision.decision === 'HOLD') {
    if (characterId === 'maya_chen') return `${confidence}% 算哪门子 conviction？样本还不够就继续观察，别他妈把“没想清楚”包装成所谓的坚持！`;
    if (characterId === 'victor_hale') return `${confidence}%，你还要强占 risk budget？方向先别说。最大损失、runway、为什么值得占资本——立刻给我三个答案！`;
    if (characterId === 'leo_park') return `${confidence}% 还要付期权溢价，这就像连电影讲什么都不知道就先去黄牛手里抢首映票。先确认你买的是赔率，不是他妈的参与感。`;
    if (characterId === 'daniel_ross') return `${confidence}% 当然也可以持有。只是信用委员会会把这翻译成另一句很难听的话：你在用我们的 collateral 为一个低确信度判断付高昂的租金。`;
  }
  return null;
}


export type PlayerVoiceResponseTone = 'PRESS' | 'CHALLENGE' | 'REASSURE';

export function renderPlayerResponseVoice(state: GameState, characterId: string, tone: PlayerVoiceResponseTone, currentEmotion: CharacterEmotion): string {
  const hard = hardPressure(state, characterId);
  if (characterId === 'maya_chen') {
    if (tone === 'PRESS') return '“可以。别光问我结论，问我哪个变量最先死：供应链、CapEx、utilization，还是客户订单。我把硬证据摊开。”';
    if (tone === 'CHALLENGE') return hard ? '“指出变量！别他妈拿账面回撤当反证！”' : '“那就按工程评审来。指出你认为我错的变量；如果你只是害怕亏钱，那是你自己的懦弱，不是对 Thesis 的反证！”';
    return currentEmotion === 'HURT' ? '“我不需要狗屁安慰。我只需要知道，下次研究被验证时，你会不会给团队真正的授权！”' : '“好。那让我把 failure mode 讲完。你不必站我这边，但别只想听一个顺耳的结论。”';
  }
  if (characterId === 'victor_hale') {
    if (tone === 'PRESS') return hard ? '“最坏情况。现金。保证金。立刻给我按顺序写下来！”' : '“最坏情况？流动性先消失，相关性一起往一走。Cash runway、margin、STOP 顺序——白纸黑字写下来！”';
    if (tone === 'CHALLENGE') return '“可以反驳。先写最大损失、能错多久、forced-seller 点。算清楚了我们再谈谁更有种。”';
    return '“别来安抚我。稳住现金，稳住保证金，稳住你自己！风险官的心情从来不是风险变量。”';
  }
  if (characterId === 'leo_park') {
    if (tone === 'PRESS') return '“看盘口，别只盯着中间价自慰！拍卖场里你越急，别人越知道你非买不可。Spread、IV、可退出量，先把这三样看明白！”';
    if (tone === 'CHALLENGE') return '“当然可以跟我争方向。Spread 不跟你争——它直接从你口袋里掏钱。把赔率拿出来，我们再接着吵。”';
    return '“我没事。你把单子挂在 Mid 附近，我心情会更好；做市商也能少吸点血。”';
  }
  if (characterId === 'daniel_ross') {
    if (tone === 'PRESS') return '“四十八小时就是四十八小时。之后 risk committee 会直接替我扣扳机。请给我 cash、haircut、collateral 计划，别给我扯什么交情。”';
    if (tone === 'CHALLENGE') return '“你当然可以不同意我的条款。房主也可以不同意法拍估值；抵押品可是从来不参加辩论的。”';
    return '“我希望你成功，真的。只是我替你多扛一天，就要向上面解释一天。礼貌换不来 collateral。”';
  }
  if (characterId === 'evelyn_shaw') {
    if (tone === 'PRESS') return '“给我具体的数字、时间、到底是谁说的！别给我‘市场误解了我们’这种只能当预告片的废话。”';
    if (tone === 'CHALLENGE') return '“很好。这句话敢 on record 吗？不敢的话，它就只是剪辑室里的废料。”';
    return '“我不是来毁你的，我是来写故事的。你给我一句真话，我至少不会替你脑补一段假对白。”';
  }
  if (characterId === 'marcus_reed') {
    if (tone === 'PRESS') return '“从第一条时间戳开始。一条一条对清楚。”';
    if (tone === 'CHALLENGE') return '“可以反驳。但时间戳不会发火，交易记录更不会。”';
    return '“我不需要你让我放心。我只需要你的记录在法理上自洽。”';
  }
  if (characterId === 'adrian_cross') {
    if (tone === 'PRESS') return '“终于问到点子上了：谁先被迫卖，谁还有现金，谁耗不起。扑克桌上，位置比手牌更早暴露你是个软蛋。”';
    if (tone === 'CHALLENGE') return '“这才像点样子。拳台上只点头是得不了分的。现在证明给我看，你比我更能扛打。”';
    return '“别来安慰我。老子输了会自己认。你最好也会——不然你每次眨眼都会变成致命的 tell。”';
  }
  return '“继续。把真正的判断说清楚。”';
}

export function renderOutcomeReactionVoice(state: GameState, characterId: string): string {
  const current = state.character_emotions?.[characterId];
  if (!current) return '';
  const e = current.emotion;
  if (characterId === 'maya_chen') {
    if (e === 'HURT') return 'Maya：“明白了。那以后别他妈再提‘我们团队’，这个变量现在已经不在模型里了！”';
    if (e === 'ANGRY') return 'Maya：“写下来：你到底认为我错在哪一个变量！别像个废物一样等市场替你做研究！”';
    if (e === 'FEAR') return 'Maya：“给我十分钟。我把最坏 failure mode 重新跑一遍，如果这都撑不住我们就死定了。”';
    if (e === 'CONFIDENT') return 'Maya：“给我授权。我把结果和他妈的反证一起拿回来，甩他们脸上！”';
  }
  if (characterId === 'victor_hale') {
    if (e === 'ANGRY') return 'Victor：“给我记进风险记录里。等爆仓的时候，别说老子没给你们画过这条红线！”';
    if (e === 'PRESSURED') return 'Victor：“讨论结束。现金。保证金。最大损失。立刻，马上！”';
    if (e === 'CONFIDENT') return 'Victor：“边界还在。你可以下注。但眼睛给我睁大点。”';
  }
  if (characterId === 'leo_park') {
    if (e === 'FRUSTRATED') return 'Leo：“观点随你。但 Spread 照样会狠狠吸干你的血。”';
    if (e === 'UNEASY') return 'Leo：“我可以继续报价，但别他妈把十分钟前的 liquidity 当成你的终身会员权益。”';
    if (e === 'CONFIDENT') return 'Leo：“行。这张票虽然贵，但至少死也能死个明白。”';
  }
  if (characterId === 'daniel_ross') {
    if (e === 'PRESSURED') return 'Daniel：“我把方案带回 committee。下一通电话请给我数字；至于你们的狗屁故事，我们饭后再聊。”';
    if (e === 'UNEASY') return 'Daniel：“我希望你对，因为我的饭碗也绑在这段 relationship 上。但银行绝不会替客户赌命。”';
    if (e === 'CONFIDENT') return 'Daniel：“这份 collateral story 我能向上面交代。继续保持，别弄砸了。”';
  }
  if (characterId === 'evelyn_shaw') {
    if (e === 'SUSPICIOUS') return 'Evelyn：“可以。你今天不敢回答的那一幕，我会一字不落地写进明天的头版。”';
    if (e === 'FRUSTRATED') return 'Evelyn：“别给我整那种只能 background 成立、一上 record 就他妈神秘消失的句子。”';
  }
  if (characterId === 'marcus_reed') return e === 'ANGRY' || e === 'SUSPICIOUS' ? 'Marcus：“继续。你的所有借口，都会和时间戳、交易记录订死在同一页上。”' : 'Marcus：“来源、时间、决策过程。全部留在记录里，任何漏洞都会变成污点。”';
  if (characterId === 'adrian_cross') {
    if (e === 'EUPHORIC') return 'Adrian：“谢谢你，蠢货。你刚刚把自己的致命 tell 直接挂在了时代广场的大屏幕上。”';
    if (e === 'ANGRY' || e === 'FRUSTRATED') return 'Adrian：“好，算你有种。没按我的剧本走。现在这场才他妈值得打。”';
    if (e === 'CONFIDENT') return 'Adrian：“我开始尊重你了。坏消息是，我通常只会亲手宰了值得赢的对手。”';
  }
  return '';
}

export function renderPressureVoice(state: GameState, characterId: string): string | undefined {
  const current = state.character_emotions?.[characterId];
  if (!current || current.intensity < 64) return undefined;
  const e = current.emotion;
  if (characterId === 'maya_chen') {
    if (e === 'FEAR' || e === 'PANIC') return '我不是说逻辑死了！我是说如果样本再错一次，我们可能他妈的根本拿不出第三次实验预算！';
    if (e === 'ANGRY' || e === 'FRUSTRATED') return '给我指出变量！供应链、CapEx、订单，哪个断了？别他妈拿账面回撤来当反证！';
    if (e === 'HURT') return '你要我的研究，但上一次你连做研究的人都没保下来。这个该死的变量我不会假装看不见。';
    if (e === 'CONFIDENT') return '给我 risk budget。老子愿意把名字和职业生涯押在这套因果链后面。';
  }
  if (characterId === 'victor_hale') {
    if (e === 'PRESSURED' || e === 'PANIC') return '把你那狗屁观点页给我关了！最坏损失！现金 runway！告诉我我们到底还能苟活几个交易日！';
    if (e === 'ANGRY' || e === 'FRUSTRATED') return '老子不是来这赢辩论的。只要这条红线越过去，我们全他妈得死，没有第二次机会！';
    if (e === 'CONFIDENT') return 'Risk budget 还没穿。你可以下注。但别把严守纪律当成胆小。';
  }
  if (characterId === 'leo_park') {
    if (e === 'FRUSTRATED' || e === 'UNEASY') return '先别他妈跟我扯方向。告诉我，当 spread 扩一倍、IV 暴走、盘口直接消失的时候，你到底还能不能逃命？！';
    if (e === 'CONFIDENT') return '结构现在在替你卖命。别像个刚赢两把就开始上头的赌徒——赔率可没因此变得对你更好。';
  }
  if (characterId === 'daniel_ross') {
    if (e === 'PRESSURED') return '我的 committee 正在盯着这张快要暴雷的资产负债表。请马上给我 haircut、margin 和 collateral 的实操计划，我不要你那分文不值的信心！';
    if (e === 'UNEASY') return '我愿意继续给你信用额度。就像银行愿意续贷——前提是，你别他妈把新增额度当成不用还的免费资本。';
    if (e === 'CONFIDENT') return '资本现在愿意跟你做生意。但你最好记清楚，信用窗口关门的时候，从来都不会提前按喇叭。';
  }
  if (characterId === 'evelyn_shaw') return e === 'SUSPICIOUS' ? '你可以死鸭子嘴硬。但你的心虚也会直接被剪进成片，我保证那绝不是你想要的镜头。' : '别给我这种能过合规审查，却什么屁用都没有的废话预告片。';
  if (characterId === 'marcus_reed') return '我不需要你喜欢这些问题。我只要求你的时间戳、情报来源和交易记录在审计时能互相解释，别露出马脚。';
  if (characterId === 'adrian_cross') {
    if (e === 'EUPHORIC') return '终于感觉到疼了？现在我就看着你，是先砍掉仓位，还是先卖掉你自己信誓旦旦的原则。';
    if (e === 'FRUSTRATED' || e === 'ANGRY') return '好极了。第一套组合拳没能把你放倒。那接下来我直接朝你肋骨上踹。';
    if (e === 'CONFIDENT') return '我开始尊重你了。别急着高兴——这只意味着老子会一帧一帧地研究你流血的录像，而不是去读你公关稿里的废话。';
  }
  return undefined;
}

export function renderGeneralCharacterDialogue(state: GameState, characterId: string, context = 'WAR_ROOM'): string {
  const rel = state.relationships?.[characterId];
  const trust = Number(rel?.trust ?? 40);
  const traits = new Set(state.player_traits ?? []);
  const hard = hardPressure(state, characterId);
  const seed = `${characterId}|general|${context}|${state.current_episode_number ?? 1}|${trust}|${[...traits].sort().join(',')}`;

  if (characterId === 'maya_chen') {
    if (trust < 30) return '如果产业链检查每次都排在狗屁故事后面，那就别侮辱“研究”这两个字！给我订单、CapEx、utilization 三个硬变量，我给你结论；否则你得到的只是你自己虚荣心的回声。';
    if (traits.has('HOLDS_LOSERS')) return '账面浮亏不会把一只破股票自动洗白成价值投资！数据都他妈开始漂移了：先去查算力 CapEx、客户订单和你的失效条件，再来决定你是在坚守耐心，还是在死保自尊！';
    return pick([
      '别一上来就问我多空！北美 hyperscaler 长期 CapEx 还没同时掉头，真正要死盯的是单位推理成本下降以后，utilization 和总调用量到底怎么反馈。把因果链给我一层层拆开！',
      '产业链不是他妈的一根温度计。订单、CapEx、utilization、竞争供给必须给我一起看；敢漏掉一个变量，你得到的就是童话故事，不是模型。',
    ], seed);
  }
  if (characterId === 'victor_hale') {
    if (traits.has('IGNORES_MACRO')) return hard ? '贴现率！现金！最大损失！你不能每次亏到吐血了才突然他妈的发现宏观原来还存在！' : '你每次亏钱了就突然转行当长线投资者是吧？可贴现率就像地心引力，不会因为你把头埋在沙子里就消失。先给我看 cash runway 和组合相关性！';
    return pick([
      '我不反对观点，我反对的是在真空中做梦的狗屁观点！收益率曲线、相关性、现金 runway——先保证你的基金活得到 Thesis 兑现的那一天！',
      '宏观不是你交易时的背景音乐！贴现率、流动性、相关性一变，所有所谓的“独立”仓位全会像疯狗一样挤向同一个出口。给我实质的风险预算，别给我吹嘘你的勇气。',
    ], seed);
  }
  if (characterId === 'leo_park') {
    if (traits.has('OVERTRADES')) return '你方向抓得再准，在 5.10/5.80 的吃人 spread 里无脑按 Market Buy，就像进机场了才去换外币：抢钱的柜台当然欢迎你这个凯子！挂 Mid，别把你的急迫感白送给做市商！';
    return pick([
      'Gamma 墙不是什么护城河，它是下班高峰期拥挤的地铁口：人一多，所有人的对冲全挤在同一个方向踩踏。别去猜底，先看 skew、spread 和干涸的流动性。',
      '盘口就是赤裸裸的拍卖。你喊得越急，别人越知道你今天非买不可，不宰你宰谁？Limit 挂在 Mid 附近，让时间去替你杀价。',
    ], seed);
  }
  if (characterId === 'daniel_ross') return pick([
    '我当然希望你赚钱，优质客户赚钱我们才有肉吃。可这和房贷一个道理：你的收入画饼画得再大，collateral 和 haircut 照样得按规矩一分不少地算清楚。',
    '信用从来不是友谊，它是一张每天都在无情重算的账单。Financing spread、margin、collateral 都舒服的时候，我们可以喝着酒谈理想；它们一旦变脸，我们就只谈条款。',
  ], seed);
  if (characterId === 'evelyn_shaw') return '别给我那种塞满套话、拿去过公关审查的破稿子。明确告诉我第一幕发生了什么、你当时究竟知道什么、哪一条新事实逼得第二幕被改写！读者能听懂人话以后，才算你真的想明白了。';
  if (characterId === 'marcus_reed') return '我不需要听你讲好听的故事。给我信息来源、时间戳、谁在什么见鬼的时候知道了什么，以及完整的交易记录。证据能互相咬合，就够了。';
  if (characterId === 'adrian_cross') return trust >= 50
    ? '我们在拳台上打这么久，至少都清楚对方的 jab 从哪边挥过来。真有 forced seller，我不介意跟你坐下来一起吃干流动性；但别把这误会成我闭着眼睛不看你的 tell。'
    : '拳台上从没有人会因为对手被打出血就大发慈悲地暂停计时。Dante Capital 如果真被逼得斩仓，我会照单全收；这不是因为我有多恨你，只是因为 forced seller 吐出来的筹码，价格通常最甜。';
  return '市场正在无情地重定价。先把事实、风险和你真正能做的动作切分开。';
}

export function voiceFingerprintSample(state: GameState, characterId: string): string {
  const fakeWindow = {
    window_id: 'voice_fingerprint', session_date: '2025-01-27', sequence: 99,
    reveal_time_label: '14:30 ET', stage: 'INTRADAY', truth_mode: 'REAL_INTRADAY', resolved: false,
    source_type: 'REAL_VENDOR', headline: 'voice fingerprint', price_reveal_available: true,
  } as unknown as MarketDecisionWindow;
  return renderMarketWindowVoice(state, characterId, fakeWindow, null, 'ELEVATED');
}
