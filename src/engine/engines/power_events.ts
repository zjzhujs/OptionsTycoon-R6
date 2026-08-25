/**
 * V30 · 权力事件生成器
 *
 * ── 替换掉什么 ────────────────────────────────────────────────────
 *
 * 原来的 human_actions.ts 把事件钉死在固定日子上：
 *
 *   day_idx === 1 → Adrian 挖角      day_idx === 2 → 内部争执
 *   day_idx === 3 → Adrian 做空      day_idx === 4 → WSJ 质询
 *
 * R1 只有 7 天，演完就没了。而且选完给三个数字加一句结果文案，**没有任何东西记得这件事**。
 * 评测报告说的「感受不到被手下背叛或被同行绞杀」，根源在这里。
 *
 * ── 这个模块做什么 ────────────────────────────────────────────────
 *
 * 生成**后续**事件：读恩怨账本，把玩家早先的选择变成现在找上门来的后果。
 * 它不替换原有的开场剧本（那些写得很好，保留），而是接在它们后面，
 * 让每一次选择长出下一幕。
 *
 * 关键设计：**每个事件都必须引用账本里的具体一条**，文案里写出玩家当时到底做了什么。
 * 泛泛的"对手报复你了"没有实感；"Adrian 在报告里点名你当初用律师函拦他"才有。
 *
 * ── 与既有 evidence_engine 的分工 ────────────────────────────────
 *
 * 合规维度**已经有一套完整系统**：evidence_engine 记录证据点/证人/内外部知情度，
 * 驱动 12 阶段调查（CLEAN → … → CHARGED → CONVICTED/ACQUITTED），还有举报人机制。
 * 本模块**不重复造它**，而是给自己的选项填上 legality_class 与各类 delta，
 * 让 human_actions.resolve_human_action → evidence_engine.record_action 自然接管。
 *
 * 换句话说：evidence_engine 管「监管会不会查你」，本模块的账本管「人会不会记你的仇」。
 * 两条线互补——越线的选项既留下证据（前者），也留下把柄（后者）。
 */
import type { HumanActionChoice, HumanActionEvent, MarketNode } from '../schemas';
import { consumeGrudge, record, standingWith, type LedgerEntry, type LedgerHost } from './grudge_ledger';

/** 与既有 human_actions 保持同样的构造风格，便于混在同一个 feed 里 */
function choice(
  id: string,
  label: string,
  values: Partial<HumanActionChoice> = {}
): HumanActionChoice {
  return { id, label, cost_usd: 0, favor_delta: 0, morale_delta: 0, reputation_delta: 0, ...values };
}

function evt(
  id: string,
  date: string,
  kind: HumanActionEvent['action_kind'],
  characterId: string | null,
  headline: string,
  body: string,
  choices: HumanActionChoice[]
): HumanActionEvent {
  return {
    id, date, action_kind: kind, character_id: characterId,
    headline, body, choices,
    resolved: false, chosen_choice_id: null, source_type: 'SIMULATED',
  };
}

/**
 * 报复事件：对手把旧怨兑现。
 *
 * 只有在账本里真有一笔未结的怨时才会生成，且**取走即标记已用**——
 * 一笔怨只清算一次，不会变成刷屏循环。
 */
function retaliation(state: LedgerHost, node: MarketNode): HumanActionEvent | null {
  // 对手不会在同一个下午就发点名做空报告——至少隔两个交易日
  const grudge = consumeGrudge(state, 'adrian_cross', node.date, 20, 2);
  if (!grudge) return null;

  return evt(
    `pw_retaliate_${node.date}`,
    node.date,
    'RIVAL_SHORT_ATTACK',
    'adrian_cross',
    'Apex Horizon 狗急跳墙：做空报告直接点名',
    `Adrian Cross 这疯狗不咬别人了——最新报告直接把准星对准了本基金。` +
      `报告硬生生扯了两页皮来扒我们的期权持仓，甚至把底层的行权价和到期日都翻得底朝天，` +
      `脚注里还贱兮兮地写着「据熟悉该基金研究流程的人士」。\n\n` +
      `结尾处他还甩了一句阴阳怪气的话：「有些机构习惯用法务解决竞争问题。」——` +
      `他在点名你当初「${grudge.what}」的那笔旧账。这孙子真够记仇的。`,
    [
      choice('public_rebuttal', '正面刚他：公开爆出我们底牌，逐条把他的脸打肿', {
        cost_usd: 8000, reputation_delta: 12, morale_delta: 5,
        result_narrative: '买方圈子都在看 Apex 的笑话，我们的干货直接把他的论点碾平了。声望大涨，但核心算力估值模型的逻辑也部分暴露给了市场。',
      }),
      choice('stay_silent', '当他放屁：不废话，拿业绩扇他', {
        reputation_delta: -5, morale_delta: -8,
        result_narrative: '外面的人以为咱们怂了。交易室气氛压抑得要命，连那帮 LP 都在群里旁敲侧击地问那份狗屁报告。',
      }),
      choice('counter_leak', '下黑手：把 Apex 自己的底仓放给记者，互相伤害啊', {
        cost_usd: 0, reputation_delta: -8,
        legality_class: 'AGGRESSIVE_LAWFUL',
        external_awareness_delta: 8,
        compliance_risk_delta: 6,
        information_ethics_delta: -10,
        result_narrative: '文章一发，Apex 当场吐血三升。但这口子一开，咱们在华尔街的名声也就彻底臭了。',
      }),
    ]
  );
}

/**
 * 背叛事件：你当初没留住的人，带着东西出现在对手那边。
 *
 * 触发条件是账本里存在一条针对 maya_chen 的怨——也就是你当初选了"任其离职"。
 */
function defection(state: LedgerHost, node: MarketNode): HumanActionEvent | null {
  // 前员工要先入职、再署名发报告，给它更长的酝酿时间
  const g = consumeGrudge(state, 'maya_chen', node.date, 15, 3);
  if (!g) return null;

  return evt(
    `pw_defect_${node.date}`,
    node.date,
    'RIVAL_POACHING',
    'maya_chen',
    '我们的人，成了对家砸盘的枪',
    `操。Apex Horizon 今早的半导体产业链报告里，那个被我们放走的量化建模师赫然挂在署名栏第二位。\n\n` +
      `里面把我们持仓套路的皮都扒了。Maya 铁青着脸把报告甩在你桌上，一字一顿：「当时我提过要留他。」——你当初的处理是「${g.what}」。\n\n` +
      `法务查过，那小子没带走物理文件，但他把我们的脑子带过去送给 Adrian 了。`,
    [
      choice('tighten_process', '扎紧篱笆：所有核心模型分段隔离，谁也别想看全貌', {
        cost_usd: 12000, morale_delta: -6, reputation_delta: 3,
        result_narrative: '防火墙竖起来了，但大家看彼此的眼神像防贼。Maya 黑着脸，再没提过半个字。',
      }),
      choice('apologize_to_maya', '认栽：跟 Maya 承认这波傻逼了，砸钱让她重新招人', {
        cost_usd: 30000, morale_delta: 18, favor_delta: 20,
        result_narrative: 'Maya 盯了你几秒，冷哼一声转头去列猎头清单了。但她心里记下了你敢扛这口锅。',
      }),
    ]
  );
}

/**
 * 求助事件：需要动用人情的时刻。
 *
 * 这是机制 B（人情可透支）真正被使用的地方——不是面板上一个数字，
 * 而是一个你必须开口求人的具体时刻，而对方可能因为旧账拒绝你。
 */
function favorCall(state: LedgerHost, node: MarketNode, opts: { marginPressure: boolean }): HumanActionEvent | null {
  if (!opts.marginPressure) return null;
  const st = standingWith(state, 'jpmorgan_pb', node.date);
  const canAsk = st.net >= 0;

  return evt(
    `pw_favor_pb_${node.date}`,
    node.date,
    'LP_REDEMPTION_WARNING',
    null,
    '主经纪商催命：今天不补保证金就强平',
    `JPM 的保证金部门跟疯狗一样盘前就来敲门了：换了新口径，我们的维持担保金直接穿仓。` +
      `这帮吸血鬼要求在今日收盘前必须补足缺口，不然就强行砍我们的仓位。\n\n` +
      (canAsk
        ? `好歹和这个台子喝过几顿大酒，打个电话过去装回孙子，没准能拖上一天。`
        : `**操蛋的是我们在他们那有黑历史。**${st.sorest ? `那帮混蛋绝对记着「${st.sorest.what}」这笔账。` : ''}` +
          `现在开口，未必有人接。`),
    [
      choice('ask_forbearance', canAsk ? '打电话求爷爷告奶奶，要一天活命时间' : '哪怕被当面吐唾沫，也得拨这通求救电话', {
        result_narrative: canAsk
          ? '对面冷哼了一声，施舍了我们到明天开盘的时间。这笔人情债以后有得还了。'
          : '电话是通了，但对面像台没有感情的机器一样念完了强平条款。死路一条。',
      }),
      choice('deleverage_now', '去他妈的：老子自己挥刀砍仓，绝不看他们的臭脸', {
        morale_delta: -5, reputation_delta: 5,
        result_narrative: '咬着牙平掉了最痛的几条腿，血流了一地，但命和骨气都保住了。',
      }),
    ]
  );
}

/**
 * 越线的机会。
 *
 * 只在与记者建立过"背景交流"管道之后出现——也就是玩家先走了第一步。
 * 接受它会得到真实的信息优势，代价是在账本上留下一条**对方握着你**的把柄，
 * 那条把柄会在合规调查的取证阶段被翻出来。
 *
 * 这是整套系统里唯一一条明确的越线路径。它存在的意义是：没有可以越的线，权力就没有重量。
 */
function theLine(state: LedgerHost, node: MarketNode): HumanActionEvent | null {
  const st = standingWith(state, 'evelyn_shaw', node.date);
  // 必须先有过背景交流（对方握着你的一条把柄），才会有下一步
  const hasChannel = st.leverageAgainst.length > 0;
  if (!hasChannel) return null;
  // 已经越过一次就不再重复提供
  const already = st.leverageAgainst.some((e: LedgerEntry) => e.origin_choice_id === 'take_mnpi');
  if (already) return null;

  return evt(
    `pw_line_${node.date}`,
    node.date,
    'JOURNALIST_INQUIRY',
    'evelyn_shaw',
    'Evelyn 的钓鱼电话：真正带血的筹码',
    `上次交过底后，Evelyn 这次直接把肉端上桌了。她搞到了一份绝对机密的监管草案，` +
      `里面写死了先进制程 GPU 出口的生杀大权。\n\n` +
      `「别想找我要原件，」她声音压得很低，「但我可以把核心条款报给你。作为交换，` +
      `下次你们在期权链上搞大事，必须让我拿到独家。」\n\n` +
      `别他妈扯什么灰色地带了。这是那条线。`,
    [
      choice('decline_mnpi', '挂断电话：老子只挣干净钱，别拿内幕来脏我的手', {
        reputation_delta: 8, favor_delta: -5,
        legality_class: 'LEGAL',
        information_ethics_delta: 8,
        result_narrative:
          '你死守了规矩。Evelyn 咯咯笑了两声挂了，之后再也没主动给过任何料。你干净了，但也瞎了。',
      }),
      // 真正的越线。legality_class = MNPI_RISK 会让 evidence_engine 生成一条
      // EvidenceRecord，证人数 +1（Evelyn 知道），进而推高举报人风险与执法关注度。
      // 这一步之后，既有的调查升级链就有燃料了。
      choice('take_mnpi', '越界：让她念，把每一个字都听清楚', {
        favor_delta: 10,
        legality_class: 'MNPI_RISK',
        evidence_points_delta: 25,
        witness_delta: 1,
        internal_awareness_delta: 5,
        compliance_risk_delta: 22,
        information_ethics_delta: -25,
        result_narrative:
          '你拿到了能横扫市场的底牌。但从现在起，这女人手里就死死攥着你犯罪的把柄了。',
      }),
    ]
  );
}

/**
 * 生成本日的后续权力事件。
 *
 * 与既有 human_actions.generate_human_action_events 并行使用：那边负责开场剧本，
 * 这边负责由玩家行为长出来的后续。两边的事件混在同一个 feed 里。
 */
export function generatePowerEvents(
  state: LedgerHost,
  node: MarketNode,
  opts: { marginPressure?: boolean } = {}
): HumanActionEvent[] {
  const out: HumanActionEvent[] = [];
  const push = (e: HumanActionEvent | null) => { if (e) out.push(e); };

  push(retaliation(state, node));
  push(defection(state, node));
  push(theLine(state, node));
  push(favorCall(state, node, { marginPressure: Boolean(opts.marginPressure) }));

  return out;
}

/**
 * 玩家做出选择后，把这一笔记进账本。
 *
 * 这是整套系统的闭环点：没有这一步，选择依然会蒸发。
 * 映射表明确写出「哪个选项在谁那里留下什么」，不靠猜。
 */
export function recordChoiceConsequence(
  state: LedgerHost,
  eventId: string,
  choiceId: string,
  onDate: string
): LedgerEntry | null {
  const map: Record<
    string,
    { subject: string; kind: 'DEBT' | 'GRUDGE' | 'LEVERAGE'; weight: number; what: string; holder?: 'PLAYER' | 'SUBJECT' }
  > = {
    // ── 开场剧本的三个选项，各自留下不同的账 ──
    legal_injunction: {
      subject: 'adrian_cross', kind: 'GRUDGE', weight: 40,
      what: '用竞业禁止律师函冻结了他的挖角',
    },
    match_bonus: {
      subject: 'maya_chen', kind: 'DEBT', weight: 35,
      what: '花 $25,000 留住了她的核心建模师',
    },
    let_go_and_reorg: {
      subject: 'maya_chen', kind: 'GRUDGE', weight: 25,
      what: '拒绝竞价，任由她的建模师被挖走',
    },
    side_with_maya: {
      subject: 'victor_hale', kind: 'GRUDGE', weight: 30,
      what: '当众否决了他的限仓要求',
    },
    side_with_victor: {
      subject: 'maya_chen', kind: 'GRUDGE', weight: 20,
      what: '在她看准的位置上强行限了仓',
    },
    compromise_hedge: {
      subject: 'leo_park', kind: 'DEBT', weight: 15,
      what: '把折中方案交给他执行，给了他表现的机会',
    },
    off_the_record_exchange: {
      subject: 'evelyn_shaw', kind: 'LEVERAGE', weight: 25,
      what: '与她做过一次不留记录的背景交流', holder: 'SUBJECT',
    },
    // ── 后续事件的选项 ──
    counter_leak: {
      subject: 'evelyn_shaw', kind: 'LEVERAGE', weight: 30,
      what: '通过记者放料打击竞争对手', holder: 'SUBJECT',
    },
    apologize_to_maya: {
      subject: 'maya_chen', kind: 'DEBT', weight: 40,
      what: '公开承认当初判断失误并请她重建团队',
    },
    take_mnpi: {
      subject: 'evelyn_shaw', kind: 'LEVERAGE', weight: 60,
      what: '接受了尚未公开的监管草案内容', holder: 'SUBJECT',
    },
    ask_forbearance: {
      subject: 'jpmorgan_pb', kind: 'GRUDGE', weight: 10,
      what: '在保证金缺口时开口求过宽限',
    },
  };

  Object.assign(map, {
    opt_aggressive: {
      subject: 'victor_hale', kind: 'GRUDGE', weight: 20,
      what: 'War Room 里把方向性风险压过了他的风险预算',
    },
    opt_defensive: {
      subject: 'maya_chen', kind: 'GRUDGE', weight: 18,
      what: 'War Room 里把研究观点压回了风险预算之后',
    },
    opt_macro_hedge: {
      subject: 'leo_park', kind: 'DEBT', weight: 15,
      what: 'War Room 里把对冲执行交给 Leo 负责',
    },
  });
  const m = map[choiceId];
  if (!m) return null;
  return record(state, {
    subject: m.subject,
    date: onDate,
    kind: m.kind,
    weight: m.weight,
    what: m.what,
    holder: m.holder,
    origin_event_id: eventId,
    origin_choice_id: choiceId,
  });
}
