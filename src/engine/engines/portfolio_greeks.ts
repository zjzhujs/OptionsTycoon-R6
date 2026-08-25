/**
 * 组合层希腊字母合计（2026-08-19 claude）
 *
 * ── 为什么之前没有 ──────────────────────────────────────────────────
 *
 * `options.compute_greeks` 一直算的是**单合约**的希腊字母，
 * 期权链面板上逐行显示。但玩家真正需要判断的是
 * **「我整个仓位现在对标的涨跌/时间/波动率有多敏感」**——
 * 那是组合层的合计，全库从来没人算过。
 *
 * 结果就是：玩家能看到每张合约的 Δ，却看不到自己的账本是多头还是空头。
 * 这是本作教学目标里最基础的一课，反而是缺的。
 *
 * ── 三条口径（写死在这里，免得以后各处各算各的）────────────────────
 *
 * 1. **一张合约 = 100 股。** 合约 Δ 是"每股"口径，
 *    要乘 100 才是这张合约的股票等价敞口。
 * 2. **卖方取负。** `short: true` 的仓位所有希腊字母整体取反。
 * 3. **正股按 Δ=1 计入。** `state.shares` 直接进 delta（每股 Δ 就是 1），
 *    其余希腊字母为 0。h1 这种指数战役里正股仓位是主力，漏掉它
 *    合计出来的 Δ 会离谱。
 *
 * ── 单位 ────────────────────────────────────────────────────────────
 *
 *   delta  股（标的每涨 $1，组合价值变动 ≈ delta 美元）
 *   gamma  股 / $（标的每涨 $1，delta 变动多少）
 *   theta  美元 / 天
 *   vega   美元 / 1 个波动率点
 *
 * ── 诚实条款 ────────────────────────────────────────────────────────
 *
 * 定价失败的合约**不静默跳过**：计入 `contracts_missing`，
 * 由 UI 明说"合计不完整"。一个偷偷少算了两条腿的 Δ，
 * 比不显示 Δ 更危险——玩家会拿它做对冲决策。
 */
import type { GameState, Greeks, MarketNode, OptionQuote, OptionType, Position } from '../schemas';

export interface PortfolioGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  /** 成功计入的期权合约张数（不含正股） */
  contracts_counted: number;
  /** 拿不到希腊字母、**没有**计入合计的合约张数 */
  contracts_missing: number;
  /** 正股股数（已计入 delta） */
  shares_counted: number;
  /** contracts_missing > 0 时为 true —— UI 必须据此标注"不完整" */
  partial: boolean;
}

export const EMPTY_PORTFOLIO_GREEKS: PortfolioGreeks = {
  delta: 0,
  gamma: 0,
  theta: 0,
  vega: 0,
  contracts_counted: 0,
  contracts_missing: 0,
  shares_counted: 0,
  partial: false,
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function greeksOf(q: OptionQuote | null | undefined): Greeks | null {
  const g = q?.greeks;
  if (!g) return null;
  // 四个都得是有限数才算数据完整。缺一个就整条作废——
  // 用 0 补一个缺失的 vega，等于悄悄声称"这条腿不吃波动率"。
  if (!finite(g.delta) || !finite(g.gamma) || !finite(g.theta) || !finite(g.vega)) return null;
  return g;
}

/**
 * @param resolve 把仓位解析成报价。传入 `game.resolve_quote` 的偏应用即可；
 *                独立传进来是为了让这个模块可以脱离 session 单测。
 */
export function computePortfolioGreeks(
  state: Pick<GameState, 'positions' | 'shares'>,
  resolve: (p: Position) => OptionQuote | null | undefined,
): PortfolioGreeks {
  const out: PortfolioGreeks = { ...EMPTY_PORTFOLIO_GREEKS };

  const shares = finite(state.shares) ? state.shares : 0;
  if (shares !== 0) {
    out.delta += shares;
    out.shares_counted = shares;
  }

  for (const p of state.positions ?? []) {
    const qty = finite(p.qty) ? p.qty : 0;
    if (qty === 0) continue;
    // 只有期权腿走这条路；正股类仓位已在上面按 Δ=1 计过
    if (!p.type || !finite(p.strike as number) || !p.expiration) continue;

    let g: Greeks | null = null;
    try {
      g = greeksOf(resolve(p));
    } catch {
      g = null;
    }
    if (!g) {
      out.contracts_missing += Math.abs(qty);
      continue;
    }

    const sign = p.short ? -1 : 1;
    const mult = sign * qty * 100;
    out.delta += g.delta * mult;
    out.gamma += g.gamma * mult;
    out.theta += g.theta * mult;
    out.vega += g.vega * mult;
    out.contracts_counted += Math.abs(qty);
  }

  out.partial = out.contracts_missing > 0;
  return out;
}

/**
 * 把合计值压到雷达图要的 0–1。
 *
 * 归一化基准一律是**净资产**，不是"历史最大值"——
 * 后者会让同一个仓位在不同时候画出不同形状，图形就没法横向比较了。
 *
 * 各轴的满格定义（超过就顶格，不外溢）：
 *
 *   delta  |Δ×S| = 2× 净资产   （2 倍杠杆的方向敞口）
 *   gamma  |Γ×S²/100| = 净资产 20%
 *   theta  |Θ| = 净资产 1% / 天
 *   vega   |V| = 净资产 5% / vol pt
 *
 * 这些是教学口径下"已经很极端"的量级，不是行业标准。
 * 改动请连同 UI 里的说明一起改。
 */
export function normalizeGreeksForRadar(
  g: PortfolioGreeks | null | undefined,
  equity: number,
  spot: number,
  /** 保证金占用率 = 维持保证金 / 净资产。拿不到就传 null，那一轴画成"无"。 */
  marginUtil: number | null,
): Array<{ label: string; value: number | null }> {
  const ok = !!g && finite(equity) && equity > 0 && finite(spot) && spot > 0;
  const cap = (v: number, full: number) => (full > 0 ? Math.min(1, Math.abs(v) / full) : null);
  return [
    { label: 'Δ 方向', value: ok ? cap(g!.delta * spot, equity * 2) : null },
    { label: 'Γ 加速', value: ok ? cap((g!.gamma * spot * spot) / 100, equity * 0.2) : null },
    { label: 'Θ 时间', value: ok ? cap(g!.theta, equity * 0.01) : null },
    { label: 'V 波动', value: ok ? cap(g!.vega, equity * 0.05) : null },
    // 第五轴不是希腊字母，是"用了多少家当"。五边形要五个角，
    // 而这一项恰好是玩家爆仓前最该盯的那个数——满格 = 保证金占满净资产。
    { label: '保证金', value: finite(marginUtil) ? Math.min(1, Math.max(0, marginUtil)) : null },
  ];
}

/** 给 UI 用的一句话结论：这个组合现在是多头、空头还是中性 */
export function describeDirection(g: PortfolioGreeks | null | undefined, equity: number, spot: number): string {
  if (!g || !finite(equity) || equity <= 0 || !finite(spot) || spot <= 0) return '—';
  const exposure = (g.delta * spot) / equity;
  if (Math.abs(exposure) < 0.05) return '方向中性';
  return `${exposure > 0 ? '净多头' : '净空头'} ${Math.abs(exposure).toFixed(2)}×`;
}

export type { MarketNode, OptionType };
