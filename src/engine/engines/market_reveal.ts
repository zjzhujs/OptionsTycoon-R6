import type {
  DeskPressureLevel,
  GameState,
  MarketDecisionBeatKind,
  MarketDecisionConsequence,
  MarketRevealCharacterBeat,
  MarketRevealState,
  MarketRevealWindow,
  MarketSeasonContinuityBeat,
  MarketWindowAction,
  RevealedPriceBar,
} from '../schemas';
import {
  getOfflineIntradaySession,
  normalizedIntradayBars,
  type OfflineIntradayBar,
  type OfflineIntradaySession,
} from './offline_content_pack';

/**
 * V21 盘中揭示引擎（2026-08-18 claude 实现）
 *
 * ── 这个引擎存在的理由 ───────────────────────────────────────────────
 *
 * 在此之前，一个交易日就是一个点：点「推进市场」，蜡烛瞬间出现，结束。
 * 2025-01-27 那天 NVDA 从 142 跌到 118，玩家的全部体验是"闪出一根绿柱"。
 * 事情发生过，但没人经历过它。
 *
 * 这个引擎把那一天拆成若干个**必须停下来做决定**的时点，并且保证在每个时点上，
 * 玩家看到的东西和当时真实能看到的东西一样多——不多一根 K 线。
 *
 * ── 防前视是结构性的，不是纪律性的 ───────────────────────────────────
 *
 * 最容易犯的错是"把全天数据发给前端，让 UI 自己别显示后面的"。那种做法迟早
 * 泄露：一个 console.log、一次状态导出、一个存档文件就够了。所以这里的做法是：
 * 未揭晓的窗口**根本不进 state**。`windows` 数组逐个增长，玩家状态里读不到
 * 还没发生的事。收盘前最后半小时永远不进——因为看到它就等于提前知道结算价。
 *
 * ── 后果只谈过程 ─────────────────────────────────────────────────────
 *
 * 决策后果不写"你做对了/错了"。原因是判断对错必须引用当天收盘，而收盘在决策
 * 那一刻属于未来。用未来给当下的决策打分，教出来的是结果导向的赌徒。
 * 所以后果只记录可观察的过程特征：你是不是在反复把门槛后移；你有没有在
 * 把观点和仓位混为一谈。
 */

/**
 * 节拍剧本按**交易日**编排。
 *
 * 这不是偷懒的硬编码——同样是"逐小时揭晓"，1/27 和 1/31 考验的心理弱点根本不同：
 *   1/27 隔夜利空砸下来：观点被撞 → 价格发现 → 自我合理化 → 仓位 vs 观点 → 过夜
 *   1/31 反弹日：松口气 → 有没有跟进 → 反转信号 → 过周末
 * 用一套通用节拍套两天，就会出现"反弹日问你观点被撞了吗"这种错位。
 *
 * `premarket` 表示当天是否有盘前窗口：1/27 有隔夜事件所以有，1/31 没有。
 */
interface RevealScript {
  premarket: boolean;
  beats: MarketDecisionBeatKind[];
}

const SCRIPTS: Record<string, RevealScript> = {
  '2025-01-27': {
    premarket: true,
    beats: ['THESIS_HIT', 'PRICE_DISCOVERY', 'RATIONALIZATION_TEST', 'POSITION_VS_THESIS', 'OVERNIGHT_GATE'],
  },
  '2025-01-31': {
    premarket: false,
    beats: ['RELIEF_RALLY', 'FOLLOW_THROUGH_TEST', 'REVERSAL_SIGNAL', 'WEEKEND_GATE'],
  },
};

/** 没有专门编排的日子，退回一套通用节拍，而不是崩掉 */
const DEFAULT_SCRIPT: RevealScript = {
  premarket: false,
  beats: ['PRICE_DISCOVERY', 'RATIONALIZATION_TEST', 'POSITION_VS_THESIS', 'OVERNIGHT_GATE'],
};

function scriptFor(date: string): RevealScript {
  return SCRIPTS[date] ?? DEFAULT_SCRIPT;
}

const BEAT_QUESTIONS: Record<MarketDecisionBeatKind, string> = {
  THESIS_HIT: '这条消息是打断了你的 Thesis，还是仅仅把市场吓尿了？',
  PRICE_DISCOVERY: '这是单纯的价格发现，还是深渊的开始？你的护城河在哪。',
  RATIONALIZATION_TEST: '你是在做客观分析，还是在给自己死扛头寸找借口？',
  POSITION_VS_THESIS: '逻辑没破，不代表你手里的合约不会归零。你把观点和仓位分开看了吗？',
  OVERNIGHT_GATE: '最后半小时盲盒时间。你确定要带着这堆雷过夜吗？',
  RELIEF_RALLY: '喘口气的反弹最容易骗人。你的基本盘到底有没有修复？',
  FOLLOW_THROUGH_TEST: '第一波拉升后根本没资金接盘。没有跟进的反弹叫死猫跳，还要人教你吗？',
  REVERSAL_SIGNAL: '如果这只是下跌中继的诱多，你的保证金能扛得住下一刀吗？',
  WEEKEND_GATE: '未来 48 小时你连平仓的键都摸不到。这个敞口，你敢带进周末？',
  GENERIC: '这根 K 线砸下来，你的护城河还在吗？',
};

/* ── 谁开口：由当下压力选人，不是固定剧本 ───────────────────────────── */

interface DeskPressure {
  level: DeskPressureLevel;
  drawdown: number;
  lpConfidence: number;
  leverage: number;
}

function readPressure(state: GameState): DeskPressure {
  const s = state as any;
  const drawdown = Number(s.max_drawdown_pct ?? 0);
  const lpConfidence = Number(s.fund_stats?.lp_confidence ?? 50);
  const cash = Number(s.cash ?? 0);
  const debt = Number(s.margin_debt ?? 0);
  const leverage = cash > 0 ? debt / cash : debt > 0 ? Infinity : 0;

  // 任意一维触顶就升级——风险不会因为另外两维还好看就消失
  let level: DeskPressureLevel = 'LOW';
  if (drawdown >= 15 || lpConfidence <= 35 || leverage >= 3) level = 'CRITICAL';
  else if (drawdown >= 10 || lpConfidence <= 45 || leverage >= 1.5) level = 'HIGH';
  else if (drawdown >= 5 || lpConfidence <= 48 || leverage >= 0.5) level = 'ELEVATED';

  return { level, drawdown, lpConfidence, leverage };
}

/**
 * 压力越大，越轮到风控官说话。
 * 这不是排班表，是真实机构里的规律：顺风时分析师主导议题，
 * 逼近强平线时风控官会直接打断所有人。
 */
function leadCharacter(p: DeskPressure): { id: string; name: string } {
  if (p.level === 'CRITICAL' || p.level === 'HIGH') {
    return { id: 'victor_hale', name: 'Victor Hale' };
  }
  return { id: 'maya_chen', name: 'Maya Chen' };
}

function characterLine(
  beat: MarketDecisionBeatKind,
  p: DeskPressure,
  lead: { id: string; name: string },
  priorReason: string | null,
): string {
  if (beat === 'RATIONALIZATION_TEST' && priorReason) {
    // 关键设计：把玩家上一轮**自己写的话**原样端回他面前。
    // 这比任何 NPC 台词都更有压迫感——因为那是他自己说的。
    // 引号内去掉句末标点，否则会和外层的句号叠成「……。」。
    const quoted = priorReason.replace(/[。．.!！?？;；,，]+$/u, '');
    return `你上一小时写的是「${quoted}」。现在第二波已经来了，那句话还成立吗？`;
  }
  if (lead.id === 'victor_hale') {
    if (p.level === 'CRITICAL') {
      return `别跟我扯什么狗屁基本面。回撤 ${p.drawdown.toFixed(0)}%，LP 信心跌到 ${p.lpConfidence.toFixed(0)}，立刻把敞口砍到能活过今晚的底线。`;
    }
    return '风控警告：现在不是争论你看法对错的时候，是评估你手里的头寸能不能扛住下一根断头铡。';
  }
  if (beat === 'THESIS_HIT') {
    return '别盯着盘面发抖。弄清楚，这条消息是砸断了需求端，还是纯粹在杀估值？动作别乱。';
  }
  return '我列出了底线条件。如果条件触发，不管你有多铁的信仰，因果链断了就得跑。';
}

/* ── 窗口构造 ────────────────────────────────────────────────────────── */

/**
 * 挑一条更早那天的承诺回响。
 *
 * 规则刻意收紧：
 *   - 只在第 2、第 4 个时点出现（下标 1 和 3）。第一个时点保持安静——
 *     刚开盘就翻旧账，玩家还没进入当天的语境。
 *   - 同一天内不重复引用同一笔承诺。
 *   - 只回响**更早日期**的，绝不引用当天自己刚写的（那不是回响，是复读）。
 */
function pickContinuity(
  state: GameState,
  sessionDate: string,
  windowIndex: number,
): MarketSeasonContinuityBeat | null {
  if (windowIndex !== 1 && windowIndex !== 3) return null;
  const history = ((state as any).market_window_history ?? []) as any[];

  const usedToday = new Set(
    history
      .filter((h) => h.session_date === sessionDate && h.season_continuity_beat)
      .map((h) => h.season_continuity_beat.source_window_id),
  );

  const candidates = history.filter(
    (h) =>
      h.session_date &&
      h.session_date < sessionDate &&
      typeof h.reason === 'string' &&
      h.reason.length > 0 &&
      !usedToday.has(h.window_id),
  );
  if (candidates.length === 0) return null;

  // 取最近一天的承诺，按时间顺序轮换，让两次回响落在不同的时点上
  const latestDate = candidates[candidates.length - 1].session_date;
  const sameDay = candidates.filter((h) => h.session_date === latestDate);
  const pick = sameDay[usedToday.size % sameDay.length] ?? sameDay[0];

  return {
    source_date: pick.session_date,
    source_window_id: pick.window_id,
    source_reason: pick.reason,
    line: `${pick.session_date} ${pick.reveal_time_label}，你写下的是「${pick.reason}」。`,
  };
}

function toRevealedBar(b: any, label: string): RevealedPriceBar {
  return {
    ts: b.ts,
    label,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume ?? null,
  };
}

/** 盘前窗口：有事件、没有价格。这是"拒绝编造成交价"的落点 */
function buildPremarketWindow(
  session: OfflineIntradaySession,
  state: GameState,
): MarketRevealWindow {
  const p = readPressure(state);
  const lead = leadCharacter(p);
  return {
    window_id: `mw_premarket_${session.ticker.toLowerCase()}_${session.date}`,
    date: session.date,
    session_date: session.date,
    reveal_ts: `${session.date}T13:00:00Z`,
    reveal_time_label: '盘前 PRE-MARKET',
    truth_mode: 'EVENT_ONLY',
    price_reveal_available: false,
    headline: '盘前：隔夜出现一条直接冲击持仓逻辑的消息',
    detail:
      '消息已经在市场里传开，但常规时段还没开始——本地没有任何这一刻的真实成交价。' +
      '你现在只能处理信息本身，不能处理价格。',
    dramatic_beat: 'THESIS_HIT',
    dramatic_question: BEAT_QUESTIONS.THESIS_HIT,
    character_beat: {
      character_id: lead.id,
      character_name: lead.name,
      pressure_level: p.level,
      line: characterLine('THESIS_HIT', p, lead, null),
    },
    previous_decision_quote: null,
    visible_price_bars: null,
    price_snapshot: null,
    future_lock_note: '本地没有盘前真实成交价，此刻不提供任何可执行价格。',
    resolved: false,
    chosen_action: null,
    chosen_reason: null,
  };
}

/** 价格窗口：只装到 visible_bar_count 为止的真实 bar */
function buildPriceWindow(
  session: OfflineIntradaySession,
  mw: any,
  index: number,
  state: GameState,
  priorReason: string | null,
): MarketRevealWindow {
  const all = normalizedIntradayBars(session);
  const count = Math.max(1, Math.min(Number(mw.visible_bar_count ?? 1), all.length));
  const visible = all.slice(0, count).map((b, i) =>
    toRevealedBar(b, (session.bars[i] as any)?.label_et ?? `#${i + 1}`),
  );
  const latest = visible[visible.length - 1];

  const beats = scriptFor(session.date).beats;
  const beat = beats[Math.min(index, beats.length - 1)];
  const p = readPressure(state);
  const lead = leadCharacter(p);

  // PRICE_DISCOVERY 刻意不给角色台词：第一小时应当由玩家自己判断，
  // 这时候塞一句 NPC 解读，等于替他做了定性。
  const withCharacter = beat !== 'PRICE_DISCOVERY';

  const locked = count < all.length;
  return {
    window_id: mw.window_id,
    date: session.date,
    session_date: session.date,
    season_continuity_beat: pickContinuity(state, session.date, index),
    reveal_ts: mw.reveal_ts,
    reveal_time_label: mw.reveal_time_label,
    truth_mode: 'REAL_INTRADAY',
    price_reveal_available: true,
    headline: mw.headline,
    detail: mw.detail,
    dramatic_beat: beat,
    dramatic_question: BEAT_QUESTIONS[beat],
    character_beat: withCharacter
      ? ({
          character_id: lead.id,
          character_name: lead.name,
          pressure_level: p.level,
          line: characterLine(beat, p, lead, priorReason),
        } as MarketRevealCharacterBeat)
      : null,
    previous_decision_quote: priorReason,
    visible_price_bars: visible,
    price_snapshot: {
      latest_price: latest.close,
      latest_bar_label: latest.label,
      session_high_so_far: Math.max(...visible.map((b) => b.high)),
      session_low_so_far: Math.min(...visible.map((b) => b.low)),
    },
    future_lock_note: locked
      ? 'FUTURE LOCKED · 当日最后 30 分钟不会在这里揭晓——看到它就等于提前知道当日结算。'
      : null,
    resolved: false,
    chosen_action: null,
    chosen_reason: null,
  };
}

/* ── 对外 API ────────────────────────────────────────────────────────── */

export function sessionFor(campaignId: string, date: string, ticker: string): OfflineIntradaySession | null {
  return getOfflineIntradaySession(campaignId, date, ticker);
}

/**
 * 某日的盘中 bar，**已按 canonical 日线基准归一化**（2026-08-20 claude）。
 *
 * 为什么必须有这个函数：`session.bars` 是数据源的原始报价。
 * Dukascopy 给的是 CFD 中间价 `mid=(ask+bid)/2`，跟官方合并行情差一个
 * 每日近似恒定的整体比例 —— R1 七天实测 −0.202% ~ +0.156%，
 * 且开/高/低/收四项的偏移彼此一致到 0.001–0.008 个百分点，
 * 所以它是**基准差**，不是某一项对不上。数据包里的 `normalization.factor`
 * 就是为消掉它而存在的。
 *
 * 踩过的坑：揭示路径（buildPriceWindow）走了归一化，
 * 而 App.tsx 的回退路径直接取 `s.bars`，于是**同一张图**在
 * Golden Day 显示归一化价、在其它日子显示原始 CFD 价，差 0.2% 且无任何提示。
 * 两个价基混在一张图里，比单纯偏一点更糟——玩家没法知道自己在看哪个。
 */
export function normalizedBarsFor(
  campaignId: string,
  date: string,
  ticker: string,
): OfflineIntradayBar[] {
  const s = getOfflineIntradaySession(campaignId, date, ticker);
  if (!s) return [];
  return normalizedIntradayBars(s);
}

/** 该日是否存在需要逐窗走的盘中会话（有数据不等于有窗口——DATA_ONLY 的日子不停） */
export function hasRevealSession(campaignId: string, date: string, ticker: string): boolean {
  const s = getOfflineIntradaySession(campaignId, date, ticker);
  return !!s && (s.material_windows?.length ?? 0) > 0;
}

/** 开启当日盘中：只放出盘前窗口，后面的一律不进 state */
export function beginReveal(
  campaignId: string,
  date: string,
  ticker: string,
  state: GameState,
): MarketRevealState | null {
  const session = getOfflineIntradaySession(campaignId, date, ticker);
  if (!session || (session.material_windows?.length ?? 0) === 0) return null;

  // 有隔夜事件的日子先出盘前窗口（有信息、无价格）；没有的直接从第一个真实小时开始。
  const first = scriptFor(date).premarket
    ? buildPremarketWindow(session, state)
    : buildPriceWindow(session, session.material_windows![0], 0, state, null);

  return {
    campaign_id: campaignId,
    session_date: date,
    ticker,
    awaiting_decision: true,
    current_window_index: 0,
    windows: [first],
  };
}

/**
 * 揭晓下一个窗口。
 * 返回 false 表示当日窗口已走完，调用方应当推进到日线结算。
 */
export function revealNext(reveal: MarketRevealState, state: GameState): boolean {
  const session = getOfflineIntradaySession(reveal.campaign_id, reveal.session_date, reveal.ticker);
  if (!session) return false;
  const mws = session.material_windows ?? [];

  // 有盘前窗口时它占掉 windows[0]，material window 因此整体后移一位
  const offset = scriptFor(reveal.session_date).premarket ? 1 : 0;
  const nextMaterialIndex = reveal.windows.length - offset;
  if (nextMaterialIndex >= mws.length) {
    reveal.current_window_index = -1;
    reveal.awaiting_decision = false;
    return false;
  }

  const prior = reveal.windows[reveal.windows.length - 1];
  const w = buildPriceWindow(
    session,
    mws[nextMaterialIndex],
    reveal.windows.length,
    state,
    prior?.chosen_reason ?? null,
  );
  reveal.windows.push(w);
  reveal.current_window_index = reveal.windows.length - 1;
  reveal.awaiting_decision = true;
  return true;
}

/**
 * 生成决策后果。
 *
 * 三条硬约束（测试逐条盯着）：
 *   1. 不出现"正确"之类的判决词——过程评价不是对错评价
 *   2. 不引用当日收盘——那在决策当下属于未来
 *   3. 数量克制（≤2）：刷屏会让玩家学会忽略它
 */
export function consequencesFor(
  window: MarketRevealWindow,
  action: MarketWindowAction,
  reason: string,
  state: GameState,
): MarketDecisionConsequence[] {
  const out: MarketDecisionConsequence[] = [];
  const s = state as any;
  const profile = (s.market_reveal_profile ??= { ego_risk: 0, deferrals_under_adverse_price: 0 });
  profile.ego_risk = Number.isFinite(profile.ego_risk) ? profile.ego_risk : 0;
  profile.deferrals_under_adverse_price = Number.isFinite(profile.deferrals_under_adverse_price)
    ? profile.deferrals_under_adverse_price
    : 0;

  if (action === 'STOP') {
    out.push({
      kind: 'RISK_DISCIPLINE',
      headline: '交易台切换为只减风险',
      detail:
        '你在信息尚未走完时主动停手。后续下单只接受降低敞口的方向，' +
        '直到你重新开启。这条记录的是处置纪律，不评价这个选择的收益。',
      source_action: action,
      source_reason: reason,
      truth_label: 'SIMULATED',
    });
    return out;
  }

  // "反复推迟"是可观察的过程特征：在价格已经对你不利的窗口里连续选择不动。
  // "价格对你不利"从第一根就成立：开盘那一小时收在开盘价之下，已经是可观察的
  // 不利事实。要求至少两根才算，会把最该被记录的第一次推迟漏掉。
  const bars = window.visible_price_bars ?? [];
  const adverse =
    bars.length >= 1 && bars[bars.length - 1].close < bars[0].open;
  const deferring = action === 'DO_NOTHING' || action === 'HOLD';

  if (adverse && deferring) {
    profile.deferrals_under_adverse_price += 1;
    if (profile.deferrals_under_adverse_price >= 2) {
      profile.ego_risk = Number(profile.ego_risk ?? 0) + 8;
      out.push({
        kind: 'REASONING_INTEGRITY',
        headline: '连续第二次把判断门槛往后移',
        detail:
          '已揭晓的真实盘中价格持续走低，而你连续两个时点都选择继续等待，' +
          '并且每次都给出了新的等待理由。这里记录的是"门槛在移动"这个事实本身，' +
          '与后面会发生什么无关。',
        source_action: action,
        source_reason: reason,
        truth_label: 'SIMULATED',
      });
    }
  }

  if (out.length === 0) {
    out.push({
      kind: 'PROCESS_RECORD',
      headline: '决策已归档',
      detail: `在「${window.reveal_time_label}」这个时点，你基于当时可见的信息作出了选择，并写下了理由。`,
      source_action: action,
      source_reason: reason,
      truth_label: 'SIMULATED',
    });
  }

  return out.slice(0, 2);
}
