/**
 * 盘中价基一致性（2026-08-20 claude）
 *
 * ── 这条门在守什么 ────────────────────────────────────────────────
 *
 * 数据源（Dukascopy）给的是 CFD 中间价 `mid=(ask+bid)/2`，
 * 跟官方合并行情差一个**每日近似恒定的整体比例**。R1 七天实测：
 *
 *     日期         平均偏移    开/高/低/收四项偏移的极差
 *     2025-01-23   -0.024%    0.001%
 *     2025-01-28   -0.200%    0.004%   ← 七天里最大
 *     2025-01-30   +0.156%    0.008%
 *
 * 四项偏移彼此一致到 0.001–0.008 个百分点，所以这是**价基差**，
 * 不是"收盘价对不上"。数据包的 `normalization.factor` 就是消它用的。
 *
 * 我一开始的猜测是「01-28 尾盘波动大、集合竞价与连续竞价中枢不同」，
 * **那个猜测是错的**——集合竞价只会动收盘，不会把开/高/低同等地推走。
 * 是先量了四项偏移的极差才排掉它。判据要量对东西，这条测试量的就是极差。
 *
 * 两条硬性：
 *   1. 归一化后，盘中极值/首末必须与官方日线对上（不再有 0.2% 的系统性偏移）
 *   2. **所有玩家可见路径必须用同一个价基**。曾经揭示路径归一化、
 *      而 App 的回退路径直接取原始 bar，同一张图混了两个价基。
 */
import { describe, expect, it } from 'vitest';
import {
  getOfflineIntradaySession,
  normalizedIntradayBars,
} from '../engines/offline_content_pack';
import { normalizedBarsFor } from '../engines/market_reveal';

const R1_DAYS = [
  '2025-01-23', '2025-01-24', '2025-01-27', '2025-01-28',
  '2025-01-29', '2025-01-30', '2025-01-31',
];

/** 官方日线对得上的容差：绝对值 5 分钱。归一化后应远小于此 */
const DAILY_TOL = 0.05;

describe('R1 归一化后对齐官方日线', () => {
  it.each(R1_DAYS)('%s 开/高/低/收四项都落在官方日线容差内', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA')!;
    const daily = (s as unknown as { daily_cross_check: Record<string, number> }).daily_cross_check;
    const bars = normalizedIntradayBars(s) as Array<{ open: number; high: number; low: number; close: number }>;

    expect(Math.abs(bars[0].open - daily.open)).toBeLessThanOrEqual(DAILY_TOL);
    expect(Math.abs(bars[bars.length - 1].close - daily.close)).toBeLessThanOrEqual(DAILY_TOL);
    expect(Math.abs(Math.max(...bars.map((b) => b.high)) - daily.high)).toBeLessThanOrEqual(DAILY_TOL);
    expect(Math.abs(Math.min(...bars.map((b) => b.low)) - daily.low)).toBeLessThanOrEqual(DAILY_TOL);
  });

  it.each(R1_DAYS)('%s 原始价与官方的偏移是"整体比例"而非某一项走偏', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA')!;
    const daily = (s as unknown as { daily_cross_check: Record<string, number> }).daily_cross_check;
    const raw = s.bars as unknown as Array<{ open: number; high: number; low: number; close: number }>;

    const offsets = [
      (raw[0].open - daily.open) / daily.open,
      (raw[raw.length - 1].close - daily.close) / daily.close,
      (Math.max(...raw.map((b) => b.high)) - daily.high) / daily.high,
      (Math.min(...raw.map((b) => b.low)) - daily.low) / daily.low,
    ].map((x) => x * 100);

    // 极差 = 四项偏移里最大与最小之差。≈0 才说明是价基差。
    // 若某天极差明显大于此，说明那天不是简单的价基问题，得单独查。
    const spread = Math.max(...offsets) - Math.min(...offsets);
    expect(spread).toBeLessThan(0.02);
  });
});

describe('玩家可见路径只有一个价基', () => {
  it.each(R1_DAYS)('%s normalizedBarsFor 与 normalizedIntradayBars 逐根一致', (date) => {
    const viaEngine = normalizedBarsFor('r1', date, 'NVDA') as Array<{ close: number }>;
    const direct = normalizedIntradayBars(getOfflineIntradaySession('r1', date, 'NVDA')!) as Array<{ close: number }>;
    expect(viaEngine.length).toBe(direct.length);
    expect(viaEngine.length).toBeGreaterThan(0);
    viaEngine.forEach((b, i) => expect(b.close).toBe(direct[i].close));
  });

  it.each(R1_DAYS)('%s 归一化后与原始 bar 确实不同（否则等于没归一化）', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA')!;
    const factor = (s as unknown as { normalization?: { factor: number } }).normalization?.factor ?? 1;
    const norm = normalizedBarsFor('r1', date, 'NVDA') as Array<{ close: number }>;
    const raw = s.bars as unknown as Array<{ close: number }>;
    if (Math.abs(factor - 1) > 1e-9) {
      expect(norm[0].close).not.toBe(raw[0].close);
    }
    // 无论 factor 多少，逐根关系必须严格是"乘同一个因子"
    norm.forEach((b, i) => expect(b.close).toBeCloseTo(raw[i].close * factor, 6));
  });

  it('不存在的日子返回空数组，不抛错也不返回 undefined', () => {
    expect(normalizedBarsFor('r1', '2030-01-01', 'NVDA')).toEqual([]);
  });
});
