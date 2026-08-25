/**
 * 组合希腊字母合计。
 *
 * 这套测试盯三件会让玩家亏钱的事：
 *   1. 乘数（一张 = 100 股）
 *   2. 卖方符号（short 必须整体取反）
 *   3. **定价失败的腿不许静默跳过** —— 少算两条腿的 Δ 会直接误导对冲决策
 */
import { describe, expect, it } from 'vitest';
import {
  computePortfolioGreeks,
  normalizeGreeksForRadar,
  describeDirection,
  EMPTY_PORTFOLIO_GREEKS,
} from '../engines/portfolio_greeks';
import type { OptionQuote, Position } from '../schemas';

const leg = (over: Partial<Position> = {}): Position => ({
  id: 'p1',
  kind: 'option',
  underlying: 'SPY',
  type: 'call',
  strike: 400,
  expiration: '2026-03-20',
  qty: 1,
  entry_price: 5,
  ...over,
});

const quote = (g: { delta: number; gamma: number; theta: number; vega: number } | null): OptionQuote =>
  ({
    contract_key: 'k',
    underlying: 'SPY',
    type: 'call',
    strike: 400,
    expiration: '2026-03-20',
    bid: 1,
    ask: 2,
    mid: 1.5,
    greeks: g,
    provenance: { source: 'test', label: 'SIMULATED' },
  } as unknown as OptionQuote);

describe('组合希腊字母 — 口径', () => {
  it('一张合约 = 100 股：Δ0.5 的单张 call 合计 Δ=50', () => {
    const g = computePortfolioGreeks(
      { positions: [leg()], shares: 0 },
      () => quote({ delta: 0.5, gamma: 0.01, theta: -0.2, vega: 0.3 }),
    );
    expect(g.delta).toBeCloseTo(50, 6);
    expect(g.gamma).toBeCloseTo(1, 6);
    expect(g.theta).toBeCloseTo(-20, 6);
    expect(g.vega).toBeCloseTo(30, 6);
    expect(g.contracts_counted).toBe(1);
    expect(g.partial).toBe(false);
  });

  it('卖方整体取反：同一张合约做空，四个希腊字母全部变号', () => {
    const q = quote({ delta: 0.5, gamma: 0.01, theta: -0.2, vega: 0.3 });
    const long = computePortfolioGreeks({ positions: [leg()], shares: 0 }, () => q);
    const short = computePortfolioGreeks({ positions: [leg({ short: true })], shares: 0 }, () => q);
    expect(short.delta).toBeCloseTo(-long.delta, 6);
    expect(short.gamma).toBeCloseTo(-long.gamma, 6);
    expect(short.theta).toBeCloseTo(-long.theta, 6);
    expect(short.vega).toBeCloseTo(-long.vega, 6);
  });

  it('数量线性叠加：3 张 = 1 张 ×3', () => {
    const q = quote({ delta: 0.4, gamma: 0.02, theta: -0.1, vega: 0.25 });
    const one = computePortfolioGreeks({ positions: [leg()], shares: 0 }, () => q);
    const three = computePortfolioGreeks({ positions: [leg({ qty: 3 })], shares: 0 }, () => q);
    expect(three.delta).toBeCloseTo(one.delta * 3, 6);
    expect(three.contracts_counted).toBe(3);
  });

  it('正股按 Δ=1 计入，且不污染其他希腊字母', () => {
    const g = computePortfolioGreeks({ positions: [], shares: 250 }, () => null);
    expect(g.delta).toBe(250);
    expect(g.gamma).toBe(0);
    expect(g.theta).toBe(0);
    expect(g.vega).toBe(0);
    expect(g.shares_counted).toBe(250);
  });

  it('多空腿相消：买一张 + 卖一张同合约 = 完全对冲', () => {
    const q = quote({ delta: 0.5, gamma: 0.01, theta: -0.2, vega: 0.3 });
    const g = computePortfolioGreeks(
      { positions: [leg({ id: 'a' }), leg({ id: 'b', short: true })], shares: 0 },
      () => q,
    );
    expect(g.delta).toBeCloseTo(0, 9);
    expect(g.vega).toBeCloseTo(0, 9);
    expect(g.contracts_counted).toBe(2); // 相消了，但确实算过两张
  });
});

describe('组合希腊字母 — 诚实条款', () => {
  it('拿不到希腊字母的腿计入 contracts_missing，并把 partial 拉起来', () => {
    const g = computePortfolioGreeks(
      { positions: [leg({ id: 'a' }), leg({ id: 'b', qty: 2 })], shares: 0 },
      (p) => (p.id === 'a' ? quote({ delta: 0.5, gamma: 0, theta: 0, vega: 0 }) : quote(null)),
    );
    expect(g.contracts_counted).toBe(1);
    expect(g.contracts_missing).toBe(2);
    expect(g.partial).toBe(true);
    // 关键：合计值只含算得出的那条腿，不拿 0 冒充另一条
    expect(g.delta).toBeCloseTo(50, 6);
  });

  it('希腊字母里只要有一个非有限数，整条腿作废——不许用 0 补', () => {
    // 用 0 补一个缺失的 vega，等于声称"这条腿不吃波动率"，那是假话
    const g = computePortfolioGreeks(
      { positions: [leg()], shares: 0 },
      () => quote({ delta: 0.5, gamma: 0.01, theta: -0.2, vega: NaN }),
    );
    expect(g.contracts_counted).toBe(0);
    expect(g.contracts_missing).toBe(1);
    expect(g.delta).toBe(0);
  });

  it('resolve 抛异常不炸整个合计，按缺失处理', () => {
    const g = computePortfolioGreeks({ positions: [leg()], shares: 0 }, () => {
      throw new Error('quote blew up');
    });
    expect(g.contracts_missing).toBe(1);
    expect(g.partial).toBe(true);
  });

  it('空仓返回全 0 且 partial=false（平的账本确实是 0，不是"没数据"）', () => {
    const g = computePortfolioGreeks({ positions: [], shares: 0 }, () => null);
    expect(g).toEqual(EMPTY_PORTFOLIO_GREEKS);
  });
});

describe('雷达归一化', () => {
  const g = { ...EMPTY_PORTFOLIO_GREEKS, delta: 100, gamma: 2, theta: -50, vega: 200 };

  it('五条轴，顺序固定', () => {
    const axes = normalizeGreeksForRadar(g, 1_000_000, 400, 0.3);
    expect(axes).toHaveLength(5);
    expect(axes.map((a) => a.label)).toEqual(['Δ 方向', 'Γ 加速', 'Θ 时间', 'V 波动', '保证金']);
  });

  it('超出满格顶到 1，不外溢（外溢会画到网格外面去）', () => {
    const huge = { ...g, delta: 99_999_999 };
    const axes = normalizeGreeksForRadar(huge, 1_000_000, 400, 5);
    expect(axes[0].value).toBe(1);
    expect(axes[4].value).toBe(1);
  });

  it('净资产 <= 0 时全轴为 null，不画一个"看起来风险为零"的图', () => {
    const axes = normalizeGreeksForRadar(g, 0, 400, 0.3);
    expect(axes.slice(0, 4).every((a) => a.value === null)).toBe(true);
  });

  it('marginUtil 传 null 时只有那一轴为 null，其余照常', () => {
    const axes = normalizeGreeksForRadar(g, 1_000_000, 400, null);
    expect(axes[4].value).toBeNull();
    expect(axes[0].value).not.toBeNull();
  });

  it('方向描述：多头/空头/中性', () => {
    expect(describeDirection({ ...g, delta: 5000 }, 1_000_000, 400)).toContain('净多头');
    expect(describeDirection({ ...g, delta: -5000 }, 1_000_000, 400)).toContain('净空头');
    expect(describeDirection({ ...g, delta: 1 }, 1_000_000, 400)).toBe('方向中性');
    expect(describeDirection(null, 1_000_000, 400)).toBe('—');
  });
});
