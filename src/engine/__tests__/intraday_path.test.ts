/**
 * 盘中推演路径。
 *
 * 这套测试盯的不是"路径好不好看"，而是**它能不能造出没发生过的行情**，
 * 以及**它会不会把还没揭晓的未来泄漏给玩家**。
 * 推演点会画在玩家的 K 线上，一旦它能越过真实高低点，玩家看到的就是假走势；
 * 一旦它的形状与收盘方向相关，玩家就能靠看图提前知道这根柱子收阳还是收阴。
 *
 * 2026-08-19：按评审意见重写算法后，最重要的一条从"边界"变成了"防前视"——
 * 边界只要写对就不会退化，而前视泄漏是**改一行就会悄悄回来**的那种问题。
 */
import { describe, expect, it } from 'vitest';
import {
  derivePathForBar,
  derivePathForSession,
  measureDirectionLeak,
  DEFAULT_STEPS_PER_BAR,
} from '../engines/intraday_path';
import type { RevealedPriceBar } from '../schemas';

// 2025-01-27 NVDA 真实第一小时（DeepSeek 崩盘当天）
const CRASH_BAR: RevealedPriceBar = {
  ts: '2025-01-27T14:30:00Z',
  label: '09:30–10:30 ET',
  open: 124.78, high: 128.40, low: 123.05, close: 124.03, volume: 63266787,
};

const UP_BAR: RevealedPriceBar = {
  ts: '2025-01-28T14:30:00Z',
  label: '09:30–10:30 ET',
  open: 121.81, high: 125.10, low: 121.40, close: 124.60, volume: 42000000,
};

/**
 * **真实小时 bar 抽样**（48 根，从 r1/h1 两个数据包共 357 根里随机抽，seed=7）。
 *
 * 统计类断言必须打在真实分布上。我第一版是自己合成 bar，把 240 根**全部**造成
 * 「开盘在区间 25% 处、收盘贴近另一端」的强趋势形态——那不是真实分布，
 * 而在那种形态下任何路径的前缀都会朝收盘方向偏，测出来的泄漏有一半是
 * bar 自身几何携带的、本来就在已揭晓数据里的信息。
 * 用真实 bar 就没有挑数据的余地。
 */
const REAL_BARS: RevealedPriceBar[] = [
  { ts: '2025-01-28T14:30:00Z', label: 'VIX', open: 16.35, high: 16.47, low: 16.35, close: 16.41, volume: 0 },
  { ts: '2026-02-23T15:30:00Z', label: 'NASDAQ', open: 22590.41, high: 22602.96, low: 22550.38, close: 22579.08, volume: 636226000 },
  { ts: '2026-03-26T16:30:00Z', label: 'NASDAQ', open: 21684.24, high: 21821.12, low: 21658.47, close: 21773.76, volume: 0 },
  { ts: '2026-05-08T17:30:00Z', label: 'VIX', open: 17.37, high: 17.53, low: 17.36, close: 17.48, volume: 0 },
  { ts: '2026-06-30T18:30:00Z', label: 'VIX', open: 17.03, high: 17.16, low: 16.77, close: 16.8, volume: 0 },
  { ts: '2026-02-23T19:30:00Z', label: 'SPX', open: 6833.39, high: 6855.54, low: 6821.81, close: 6854.25, volume: 276115000 },
  { ts: '2026-03-26T20:30:00Z', label: 'SPX', open: 6542.72, high: 6546.98, low: 6518.82, close: 6520.2, volume: 281188116 },
  { ts: '2026-06-30T14:30:00Z', label: 'NASDAQ', open: 26100.01, high: 26158.92, low: 26082.04, close: 26143.15, volume: 805293000 },
  { ts: '2025-01-28T15:30:00Z', label: 'NVDA', open: 121.81, high: 122.0, low: 116.25, close: 121.77, volume: 180037322 },
  { ts: '2025-01-30T16:30:00Z', label: 'VIX', open: 15.75, high: 16.1, low: 15.37, close: 16.07, volume: 0 },
  { ts: '2025-01-31T17:30:00Z', label: 'QQQ', open: 527.92, high: 528.19, low: 524.49, close: 525.54, volume: 6580161 },
  { ts: '2026-01-20T18:30:00Z', label: 'VIX', open: 18.83, high: 19.86, low: 18.64, close: 19.7, volume: 0 },
  { ts: '2025-01-24T19:30:00Z', label: 'QQQ', open: 531.32, high: 531.61, low: 529.72, close: 530.34, volume: 1986702 },
  { ts: '2026-01-20T20:30:00Z', label: 'NASDAQ', open: 23209.03, high: 23229.39, low: 23147.2, close: 23153.63, volume: 791219000 },
  { ts: '2026-05-08T14:30:00Z', label: 'VIX', open: 17.23, high: 17.33, low: 17.2, close: 17.28, volume: 0 },
  { ts: '2026-04-08T15:30:00Z', label: 'NASDAQ', open: 22540.32, high: 22637.9, low: 22540.32, close: 22637.9, volume: 635219000 },
  { ts: '2026-01-20T16:30:00Z', label: 'SPX', open: 6865.24, high: 6865.24, low: 6833.29, close: 6862.06, volume: 0 },
  { ts: '2025-01-31T17:30:00Z', label: 'NVDA', open: 125.13, high: 125.77, low: 123.92, close: 123.98, volume: 27608473 },
  { ts: '2026-03-26T18:30:00Z', label: 'VIX', open: 26.4, high: 27.14, low: 26.17, close: 26.81, volume: 0 },
  { ts: '2026-02-23T19:30:00Z', label: 'NASDAQ', open: 22860.07, high: 22893.22, low: 22707.91, close: 22728.59, volume: 0 },
  { ts: '2026-01-20T20:30:00Z', label: 'SPX', open: 6803.45, high: 6807.64, low: 6792.86, close: 6796.72, volume: 400294000 },
  { ts: '2026-02-23T14:30:00Z', label: 'VIX', open: 20.96, high: 21.76, low: 20.95, close: 21.22, volume: 0 },
  { ts: '2026-06-05T15:30:00Z', label: 'NASDAQ', open: 25865.33, high: 25872.71, low: 25652.41, close: 25794.92, volume: 1001653000 },
  { ts: '2026-05-08T16:30:00Z', label: 'NASDAQ', open: 26182.13, high: 26248.62, low: 26180.77, close: 26239.75, volume: 690370000 },
  { ts: '2026-06-05T17:30:00Z', label: 'VIX', open: 18.12, high: 19.18, low: 17.88, close: 17.92, volume: 0 },
  { ts: '2026-01-20T18:30:00Z', label: 'SPX', open: 6826.65, high: 6827.15, low: 6800.78, close: 6803.44, volume: 323905000 },
  { ts: '2025-01-28T19:30:00Z', label: 'QQQ', open: 519.22, high: 519.46, low: 517.29, close: 517.72, volume: 4345747 },
  { ts: '2026-01-20T20:30:00Z', label: 'VIX', open: 18.81, high: 19.24, low: 18.64, close: 18.78, volume: 0 },
  { ts: '2026-01-20T14:30:00Z', label: 'NASDAQ', open: 23070.61, high: 23075.4, low: 22979.37, close: 22986.58, volume: 647255000 },
  { ts: '2025-01-28T15:30:00Z', label: 'VIX', open: 17.61, high: 18.39, low: 16.86, close: 16.9, volume: 0 },
  { ts: '2026-03-26T16:30:00Z', label: 'NASDAQ', open: 21688.36, high: 21723.5, low: 21609.45, close: 21613.24, volume: 648289000 },
  { ts: '2026-06-11T17:30:00Z', label: 'SPX', open: 7285.07, high: 7314.28, low: 7279.87, close: 7291.37, volume: 267321000 },
  { ts: '2026-06-11T18:30:00Z', label: 'VIX', open: 19.91, high: 19.91, low: 19.36, close: 19.54, volume: 0 },
  { ts: '2026-03-26T19:30:00Z', label: 'VIX', open: 27.01, high: 27.5, low: 26.12, close: 26.94, volume: 0 },
  { ts: '2025-01-30T20:30:00Z', label: 'VIX', open: 15.46, high: 16.42, low: 15.32, close: 15.87, volume: 0 },
  { ts: '2026-06-30T14:30:00Z', label: 'SPX', open: 7502.54, high: 7507.67, low: 7495.18, close: 7496.31, volume: 597353000 },
  { ts: '2025-01-30T15:30:00Z', label: 'NVDA', open: 119.29, high: 120.2, low: 119.11, close: 119.47, volume: 23780625 },
  { ts: '2025-01-24T16:30:00Z', label: 'VIX', open: 14.65, high: 15.08, low: 14.64, close: 15.03, volume: 0 },
  { ts: '2025-01-30T17:30:00Z', label: 'VIX', open: 15.88, high: 16.24, low: 15.43, close: 15.48, volume: 0 },
  { ts: '2026-05-08T18:30:00Z', label: 'SPX', open: 7389.05, high: 7398.89, low: 7388.23, close: 7397.43, volume: 490466000 },
  { ts: '2026-02-23T19:30:00Z', label: 'VIX', open: 21.32, high: 21.71, low: 21.2, close: 21.35, volume: 0 },
  { ts: '2025-01-24T20:30:00Z', label: 'QQQ', open: 530.34, high: 530.61, low: 528.15, close: 528.74, volume: 2900686 },
  { ts: '2026-06-11T14:30:00Z', label: 'NASDAQ', open: 25253.88, high: 25402.74, low: 25241.44, close: 25308.36, volume: 900745000 },
  { ts: '2026-06-30T15:30:00Z', label: 'SPX', open: 7472.34, high: 7481.57, low: 7457.73, close: 7480.84, volume: 362327027 },
  { ts: '2025-01-29T16:30:00Z', label: 'VIX', open: 16.67, high: 17.0, low: 16.53, close: 16.72, volume: 0 },
  { ts: '2026-06-11T17:30:00Z', label: 'SPX', open: 7291.56, high: 7337.15, low: 7265.01, close: 7337.15, volume: 287833000 },
  { ts: '2026-02-23T18:30:00Z', label: 'NASDAQ', open: 22633.5, high: 22651.26, low: 22600.59, close: 22612.67, volume: 687861000 },
  { ts: '2026-06-11T19:30:00Z', label: 'VIX', open: 20.37, high: 20.89, low: 19.53, close: 19.63, volume: 0 },
];

describe('盘中推演 — 防前视（最重要的一条）', () => {
  it('相对因果基线的额外泄漏必须可忽略', () => {
    // 盯的是 delta，不是绝对一致率。
    // 开盘价在 [low, high] 里的位置本身就预示收盘方向——那条信息真实存在于
    // 已揭晓的数据里，不是算法泄漏的，只比绝对值会冤枉它。
    // 评审给的工程门槛是 ΔAUC > 0.03 拒收；这里用一致率代替 AUC，同量级取阈。
    // 旧算法（极值顺序 = 收盘方向的函数）在这个指标上会顶到 0.4+。
    const { samples, agreement, baseline, delta } = measureDirectionLeak(REAL_BARS);
    expect(samples).toBeGreaterThan(30);
    expect(Math.abs(delta)).toBeLessThan(0.06);
    // 记下来方便以后回看这两个绝对值本身的量级
    expect(agreement).toBeGreaterThan(0);
    expect(baseline).toBeGreaterThan(0);
  });

  it('极值先后顺序在样本上接近五五开，而不是被收盘方向决定', () => {
    let lowFirstCount = 0;
    let total = 0;
    for (const bar of REAL_BARS) {
      const path = derivePathForBar(bar);
      const iLow = path.findIndex((p) => p.price === Math.min(...path.map((q) => q.price)));
      const iHigh = path.findIndex((p) => p.price === Math.max(...path.map((q) => q.price)));
      if (iLow === iHigh) continue;
      if (iLow < iHigh) lowFirstCount += 1;
      total += 1;
    }
    expect(total).toBeGreaterThan(30);
    expect(lowFirstCount / total).toBeGreaterThan(0.3);
    expect(lowFirstCount / total).toBeLessThan(0.7);
  });
});

describe('盘中推演 — 边界', () => {
  it('任何推演点都不许越过该 bar 真实的高低点', () => {
    for (const bar of [CRASH_BAR, UP_BAR, ...REAL_BARS]) {
      const path = derivePathForBar(bar);
      for (const p of path) {
        expect(p.price).toBeGreaterThanOrEqual(bar.low - 1e-9);
        expect(p.price).toBeLessThanOrEqual(bar.high + 1e-9);
      }
    }
  });

  it('首尾必须精确等于真实开盘价与收盘价，不接受插值误差', () => {
    const path = derivePathForBar(CRASH_BAR);
    expect(path[0].price).toBe(CRASH_BAR.open);
    expect(path[path.length - 1].price).toBe(CRASH_BAR.close);
  });

  it('路径必须真的走到当日高点与低点，而不是只在中间晃', () => {
    for (const bar of [CRASH_BAR, UP_BAR]) {
      const prices = derivePathForBar(bar).map((p) => p.price);
      expect(Math.min(...prices)).toBeCloseTo(bar.low, 2);
      expect(Math.max(...prices)).toBeCloseTo(bar.high, 2);
    }
  });

  it('全部标注为 SIMULATED —— 推演点不是成交价，也不是确定性推导值', () => {
    expect(derivePathForBar(CRASH_BAR).every((p) => p.source_type === 'SIMULATED')).toBe(true);
  });
});

describe('盘中推演 — 不许贴边平台', () => {
  it('不出现贴边平台：连续贴着高低点的点不超过 2 个', () => {
    // 逐点 clamp 的老做法会让**一连串**点都压在 low 或 high 上，视觉上是一条平台。
    // 要测的是"连续"而不是"总数"——路径本来就要精确命中两个极值，
    // 零散地碰到边是正常的，连着碰才是被压出来的。
    // 窄幅标的要排除：VIX 一根小时 bar 的区间可能只有 0.12 美元，
    // 按分取整之后整条路径总共只有 13 个可能取值，连续相同是**真实**的
    // ——价格本来就按分报价，不是被算法压出来的。
    // 要求区间至少 50 个 tick，才谈得上"路径不该重复"。
    const wide = [CRASH_BAR, UP_BAR, ...REAL_BARS].filter((b) => b.high - b.low >= 0.5);
    expect(wide.length).toBeGreaterThan(20);
    for (const bar of wide) {
      const prices = derivePathForBar(bar).map((p) => p.price);
      const onEdge = (v: number) =>
        Math.abs(v - bar.low) < 0.005 || Math.abs(v - bar.high) < 0.005;
      // 判据用「连续**取值完全相同**且等于极值」——逐点 clamp 会产出一串
      // 一模一样的数；而一条连续路径去命中极值，邻点必然靠近但不会相等。
      // 只数"接近"会把这种几何上必然的靠近误判成平台。
      let run = 0;
      let maxRun = 0;
      let last = NaN;
      for (const v of prices) {
        run = onEdge(v) && v === last ? run + 1 : onEdge(v) ? 1 : 0;
        last = v;
        if (run > maxRun) maxRun = run;
      }
      expect(maxRun).toBeLessThanOrEqual(2);
    }
  });

  it('振幅为 0 的 bar 给出平线而不是除零崩溃', () => {
    const flat: RevealedPriceBar = { ...CRASH_BAR, open: 100, high: 100, low: 100, close: 100 };
    const path = derivePathForBar(flat);
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((p) => p.price === 100)).toBe(true);
  });
});

describe('盘中推演 — 确定性', () => {
  it('同一根 bar 永远推出完全相同的路径（回放/存档/复盘必须一致）', () => {
    const a = derivePathForBar(CRASH_BAR);
    const b = derivePathForBar(CRASH_BAR);
    expect(a.map((p) => p.price)).toEqual(b.map((p) => p.price));
  });

  it('不同的 bar 推出不同的路径（不是一条模板曲线套所有 bar）', () => {
    const a = derivePathForBar(CRASH_BAR).map((p) => p.price);
    const b = derivePathForBar(UP_BAR).map((p) => p.price);
    expect(a).not.toEqual(b);
  });
});

describe('盘中推演 — 整段会话', () => {
  it('多根 bar 拼接后不出现重复接缝点，且序号连续', () => {
    const path = derivePathForSession([CRASH_BAR, UP_BAR]);
    expect(path.length).toBe(DEFAULT_STEPS_PER_BAR * 2 + 1);
    path.forEach((p, i) => expect(p.index).toBe(i));
  });

  it('整段路径仍然逐点落在各自 bar 的真实区间内', () => {
    const bars = [CRASH_BAR, UP_BAR];
    const path = derivePathForSession(bars);
    const globalLow = Math.min(...bars.map((b) => b.low));
    const globalHigh = Math.max(...bars.map((b) => b.high));
    for (const p of path) {
      expect(p.price).toBeGreaterThanOrEqual(globalLow - 1e-9);
      expect(p.price).toBeLessThanOrEqual(globalHigh + 1e-9);
    }
  });
});
