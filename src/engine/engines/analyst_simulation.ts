/**
 * V29-UI-F — 模拟卖方分析师共识。
 *
 * 为什么是模拟而不是真实数据：历史时点(point-in-time)的分析师评级没有可靠的免费源。
 * claude、Antigravity、chat 三方独立调研的结论一致：公开检索无法还原「某一天当时」的
 * 评级截面，财经网站显示的都是当前值，把当前值填进历史场景就是前视泄露。
 *
 * 所以这里做的是一个**明确标注 SIMULATED 的游戏内参与者**，与既有的 AI 对手基金、
 * Dealer Gamma 暴露同类——不是冒充真实数据。每一处展示都带 SIMULATED 标签与说明。
 *
 * ── 设计意图：让分析师会错，而且错得有教育意义 ──────────────────────────
 *
 * 真实卖方研究有几个众所周知的行为偏差，本模型照实编码，不做"聪明的分析师"：
 *
 *   1. 牛市偏向：卖方极少喊卖出。评级分布向买入倾斜，Sell 罕见。
 *   2. 动量外推：评级与目标价跟随近期涨幅走。涨了就上调，跌了就下调。
 *   3. 锚定滞后：目标价锚在近期高点上，反应慢半拍。
 *   4. 羊群效应：共识聚集，分歧度低；越是趋势明显，分歧越小。
 *
 * 这四条叠加会自然产生一个后果——**在顶部最看多，在底部最看空**。
 * 玩家如果照着共识做，就会在拐点被埋。R1 战役里 2025-01-27 DeepSeek R1 冲击前，
 * NVDA 刚经历一轮上涨，模型会给出接近满仓看多的共识；隔天暴跌 17%。
 * 这不是刻意整玩家，这就是真实卖方在那个位置会做的事。
 *
 * 游戏据此可以奖励"读懂共识在极值处不可信"的玩家，这比给一个永远正确的神谕有意思。
 *
 * ── 确定性 ────────────────────────────────────────────────────────
 *
 * 全部由 (ticker, date, seed) 决定，同一存档反复读取结果一致；不使用 Math.random()。
 * 输入的价格来自已准入的真实日线包，所以"分析师在追什么价"这件事本身是真实的。
 */
import type { FundamentalsBar } from './fundamentals';

export type AnalystRatingLabel = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';

export interface AnalystConsensus {
  ticker: string;
  as_of_date: string;
  /** 1.0 = 强烈买入 … 5.0 = 强烈卖出（与 Wall Street 惯例同向） */
  consensus_score: number;
  consensus_label: AnalystRatingLabel;
  /** 覆盖机构数 */
  analyst_count: number;
  distribution: Record<AnalystRatingLabel, number>;
  /** 平均目标价与区间 */
  target_mean: number;
  target_high: number;
  target_low: number;
  /** 目标价相对现价的隐含涨幅 % */
  implied_upside_pct: number;
  /**
   * 共识拥挤度 0..100。越高说明分歧越小、越一致——在拐点处这恰恰是危险信号。
   * 面板据此给玩家一个"反指警告"。
   */
  crowding: number;
  /** 触发反指警告的原因，没有则为 null */
  contrarian_warning: string | null;
  source_type: 'SIMULATED';
}

/** xmur3 + mulberry32：确定性、可复现，不依赖 Math.random。 */
function seedFrom(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;
  return function mulberry32() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS: AnalystRatingLabel[] = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'];

function labelFromScore(score: number): AnalystRatingLabel {
  if (score <= 1.5) return 'STRONG_BUY';
  if (score <= 2.4) return 'BUY';
  if (score <= 3.4) return 'HOLD';
  if (score <= 4.2) return 'SELL';
  return 'STRONG_SELL';
}

function pctReturn(bars: FundamentalsBar[], lookback: number): number | null {
  if (bars.length < lookback + 1) return null;
  const now = bars[bars.length - 1].close;
  const then = bars[bars.length - 1 - lookback].close;
  if (!then) return null;
  return ((now - then) / then) * 100;
}

/**
 * 生成某标的在某日的分析师共识。
 *
 * `bars` 必须已按日期过滤到当前游戏日期及之前——模型只能看到玩家能看到的价格，
 * 否则分析师就成了先知，那就完全失去意义了。
 */
export function simulateAnalystConsensus(
  ticker: string,
  asOfDate: string,
  bars: FundamentalsBar[],
  opts: { seed?: string } = {}
): AnalystConsensus | null {
  const visible = bars.filter((b) => b.date <= asOfDate);
  if (visible.length < 25) return null; // 样本太短，宁可不给

  const rng = seedFrom(`${opts.seed ?? 'v29f'}|${ticker}|${asOfDate}`);
  const last = visible[visible.length - 1].close;

  // 动量外推：近 60 日与近 20 日涨幅共同决定情绪，短期权重更高（追得更急）。
  const m60 = pctReturn(visible, Math.min(60, visible.length - 1)) ?? 0;
  const m20 = pctReturn(visible, Math.min(20, visible.length - 1)) ?? 0;
  const momentum = m60 * 0.4 + m20 * 0.6;

  // 基准分 2.35：卖方长期偏多，平均落在 BUY 与 HOLD 之间偏 BUY 一侧。
  // 动量每 10% 大约拉动 0.28 分，涨得越多评级越乐观。
  let score = 2.35 - (momentum / 10) * 0.28;
  score += (rng() - 0.5) * 0.24; // 机构间的固有噪声
  score = Math.max(1.05, Math.min(4.6, score));

  // 覆盖机构数：大盘股覆盖多。用价格与样本长度做一个稳定的代理，不引入外部数据。
  const base = 18 + Math.floor(rng() * 22);
  const analyst_count = Math.max(6, Math.min(62, base + Math.floor(last / 90)));

  // 分布：围绕共识分数铺开；羊群效应体现为趋势越强、分布越集中。
  const spread = Math.max(0.55, 1.35 - Math.abs(momentum) / 45);
  const distribution: Record<AnalystRatingLabel, number> = {
    STRONG_BUY: 0, BUY: 0, HOLD: 0, SELL: 0, STRONG_SELL: 0,
  };
  for (let i = 0; i < analyst_count; i += 1) {
    const individual = score + (rng() - 0.5) * 2 * spread;
    // 卖方极少喊卖出：把落在 SELL 区间的一部分强行拉回 HOLD，这是真实的机构压力。
    const biased = individual > 3.6 && rng() < 0.55 ? 3.2 : individual;
    distribution[labelFromScore(Math.max(1, Math.min(5, biased)))] += 1;
  }
  // 用实际分布回算共识分，保证两者自洽
  let sum = 0;
  LABELS.forEach((l, i) => { sum += distribution[l] * (i + 1); });
  const consensus_score = Math.round((sum / analyst_count) * 100) / 100;

  // 目标价：锚定近 60 日高点，再叠一层随动量放大的乐观度。
  // 这天然造成"涨到顶时目标价最高"，也就是最容易把玩家骗进去的位置。
  const window = visible.slice(-Math.min(60, visible.length));
  const recentHigh = Math.max(...window.map((b) => (typeof b.high === 'number' ? b.high : b.close)));
  const optimism = 1.06 + Math.max(-0.05, Math.min(0.22, momentum / 240));
  const target_mean = Math.round(recentHigh * optimism * 100) / 100;
  const dispersion = 0.10 + (rng() * 0.06) + Math.max(0, (1.35 - spread) * 0.05);
  const target_high = Math.round(target_mean * (1 + dispersion) * 100) / 100;
  const target_low = Math.round(target_mean * (1 - dispersion * 0.85) * 100) / 100;
  const implied_upside_pct = Math.round(((target_mean - last) / last) * 1000) / 10;

  // 拥挤度：分歧越小越拥挤。买入占比越高、分布越窄，越拥挤。
  const bullish = distribution.STRONG_BUY + distribution.BUY;
  const bullishShare = bullish / analyst_count;
  const crowding = Math.round(
    Math.max(0, Math.min(100, bullishShare * 70 + (1.35 - spread) * 40))
  );

  // 反指警告：这是给玩家的"强度"提示，但它只描述共识本身的状态，不预测未来。
  let contrarian_warning: string | null = null;
  if (crowding >= 72 && implied_upside_pct > 12) {
    contrarian_warning =
      '共识高度拥挤且目标价明显高于现价。卖方研究倾向在涨势末端最乐观——' +
      '此处的一致看多本身就是一种风险信号，而不是安全保证。';
  } else if (crowding <= 28 && implied_upside_pct < 0) {
    contrarian_warning =
      '共识罕见地转向悲观，目标价已低于现价。卖方通常在跌势末端才下调评级——' +
      '这类位置历史上常常出现在反弹之前。';
  }

  return {
    ticker,
    as_of_date: asOfDate,
    consensus_score,
    consensus_label: labelFromScore(consensus_score),
    analyst_count,
    distribution,
    target_mean,
    target_high,
    target_low,
    implied_upside_pct,
    crowding,
    contrarian_warning,
    source_type: 'SIMULATED',
  };
}

export const RATING_TEXT: Record<AnalystRatingLabel, string> = {
  STRONG_BUY: '强烈买入',
  BUY: '买入',
  HOLD: '持有',
  SELL: '卖出',
  STRONG_SELL: '强烈卖出',
};
