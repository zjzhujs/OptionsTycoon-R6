/**
 * 数据源注册表（2026-08-19 claude · harv Batch0-1）
 *
 * ── 为什么从"字符串自律"升级成注册表 ──────────────────────────────
 *
 * 上一轮给每个 mini-viz 加了 `data-source` 字符串，探针一扫就知道
 * 哪张图没出处。dante 认可这已经够作为验收门，但同时点出了它的软肋：
 *
 *   dante：「把 source 从任意 string 收紧成 literal union/registry，
 *           避免以后**字符串存在但字段已漂移**。」
 *   harv：「15/15 viz 必须引用已注册 source；未知 source、
 *          无 source 但绘图，都应让校验失败。」
 *
 * 字符串的问题很具体：`view.portfolio_greeks` 这个字段将来若被改名，
 * `data-source` 里那行字**不会跟着变**——探针照样报"有出处"，
 * 但那个出处已经指向一个不存在的东西。人看不出来，机器也扫不出来。
 *
 * 注册表把它变成**编译期**的事：source 只能取这里登记过的 key，
 * 打错字或用了没登记的来源，tsc 直接拒。
 *
 * ── 登记一条新数据源的规矩 ────────────────────────────────────────
 *
 * 1. `path` 写**真实字段路径**，不是人话描述（人话会漂移，路径不会）
 * 2. `kind` 说清这数据怎么来的——这直接对应本作的真实性标签体系：
 *      REAL              数据包里的真实市场数据
 *      DERIVED           由真实数据算出来（VWAP、组合希腊字母）
 *      PLAYER_STATE      玩家自己的账本（净值、持仓、恩怨）
 *      HEURISTIC         明确标注的启发式/情景指标（不得冒充真实观测）
 * 3. 任何非 REAL/DERIVED/PLAYER_STATE 的图必须把来源类别显式写进注册表；
 *    未登记来源仍视为装饰并禁止绘制。
 */

export const VIZ_SOURCES = {
  /* ── 玩家自身状态 ─────────────────────────────────────────── */
  navHistory: {
    path: 'state.nav_history',
    kind: 'PLAYER_STATE',
    note: '逐日净资产。引擎在 compute_view 里按天记录，跟着存档走。',
  },
  marginUtil: {
    path: 'view.margin_requirement / view.equity',
    kind: 'DERIVED',
    note: '保证金占用率。净资产 <=0 时给 null 走空态，不画成 0%。',
  },
  lpConfidence: {
    path: 'state.fund_stats.lp_confidence',
    kind: 'PLAYER_STATE',
    note: '缺失时给 null。曾经写死 `?? 85` 凭空显示 85%，已改。',
  },
  portfolioGreeks: {
    path: 'view.portfolio_greeks',
    kind: 'DERIVED',
    note: '组合层希腊字母合计，口径见 engine/engines/portfolio_greeks.ts。',
  },
  seatStanding: {
    path: 'grudge_ledger.standingHistory(seat)',
    kind: 'PLAYER_STATE',
    note: '席位往来净值逐日历史。从账本重算（含防前视裁剪），不持久化。',
  },

  /* ── 市场数据（只到玩家当前所在的那一天）──────────────────── */
  underlyingClose: {
    path: 'nodes[0..dayIndex].underlying_bar.close',
    kind: 'REAL',
    note: '主标的日线收盘。切片必须在 App 层做，组件拿不到 dayIndex。',
  },
  secondaryClose: {
    path: 'nodes[0..dayIndex].secondary_close',
    kind: 'REAL',
    note: '对照标的日线收盘。',
  },
  vixClose: {
    path: 'nodes[0..dayIndex].vix.close',
    kind: 'REAL',
    note: 'VIX 日线收盘。用 gold 不用涨跌色——它是恐慌程度不是"涨好跌坏"。',
  },
  tradeAttribution: {
    path: 'review.attribution (delta/gamma/theta/vega/residual/net)',
    kind: 'DERIVED',
    note: 'Greeks 损益归因，trade_review 引擎从真实持仓与行情算出（batch2 BP10 瀑布图）。',
  },
  fundVitals: {
    path: 'view.equity / state.cash / state.fund_stats.* / view.margin_requirement',
    kind: 'PLAYER_STATE',
    note: '总部资金五维雷达。任何一轴缺数就给 null 走空轴，不编造。',
  },
  selectedContractGreeks: {
    path: 'selected OptionQuote.greeks',
    kind: 'DERIVED',
    note: '当前选中合约 Greeks；缺值不绘制。',
  },
  optionOpenInterest: {
    path: 'OptionQuote.open_interest',
    kind: 'REAL',
    note: '逐合约 OI。数据包缺 OI（如部分 GME 链）时明确空态，不用成交量或 bid/ask 冒充。',
  },
  gexPoints: {
    path: 'view.gex_summary.points',
    kind: 'DERIVED',
    note: '由准入期权链输入推导的 raw gamma / OI 结构；不冒充 signed dealer inventory。',
  },
  retailSentiment: {
    path: 'view.retail_sentiment',
    kind: 'HEURISTIC',
    note: '引擎标记 DERIVED_HEURISTIC 的散户情绪情景指标；图上只表达该启发式指标，不声称真实社交样本。',
  },
} as const;

/** 只能取注册表里登记过的 key。打错字或用没登记的来源，tsc 直接拒。 */
export type VizSourceKey = keyof typeof VIZ_SOURCES;

/**
 * 落到 DOM 上给探针核查的字符串。
 * 形如 `navHistory · state.nav_history · PLAYER_STATE`——
 * 既有 key（能反查注册表），也有路径（人能直接读）。
 */
export function vizSourceAttr(key: VizSourceKey): string {
  const e = VIZ_SOURCES[key];
  return `${key} · ${e.path} · ${e.kind}`;
}

/** 探针用：注册表里所有 key，用来核对实机上出现的 source 有没有越界 */
export const VIZ_SOURCE_KEYS = Object.keys(VIZ_SOURCES) as VizSourceKey[];
