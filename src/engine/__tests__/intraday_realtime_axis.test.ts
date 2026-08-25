/**
 * 盘中时间轴真实性（2026-08-20 claude）
 *
 * ── 为什么有这个文件 ──────────────────────────────────────────────
 *
 * `PriceChartPanel` 的盘中模式原来按「一根 bar = 一小时」写死：
 *     const stepSec = 3600 / DEFAULT_STEPS_PER_BAR;
 * 那是数据只有小时锚点时的正确假设。R1 换成真实 1m（390 根/天）之后
 * 它就成了错的：每根分钟 bar 的 24 个子点被摊到整整一小时，
 * 390 条一小时的斜坡互相重叠，末尾还多出一小时。
 *
 * 第一版这条测试是**照抄组件算法**来量的——那是错的写法：
 * 镜像出来的测试会跟着组件一起错，组件改了它也照样绿。
 * 现在判定逻辑挪进了引擎 `buildPlayerIntradaySeries`，
 * 组件和测试用的是同一个函数，这里断言的是**它的输出性质**。
 */
import { describe, expect, it } from 'vitest';
import { getOfflineIntradaySession } from '../engines/offline_content_pack';
import { buildPlayerIntradaySeries } from '../engines/intraday_path';
import type { RevealedPriceBar } from '../schemas';

const RTH_SECONDS = 6.5 * 3600; // 09:30–16:00
const R1_DAYS = [
  '2025-01-23', '2025-01-24', '2025-01-27', '2025-01-28',
  '2025-01-29', '2025-01-30', '2025-01-31',
];

describe('R1 盘中数据真实性', () => {
  it.each(R1_DAYS)('%s 是真实分钟 bar，不是小时锚点', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA');
    expect(s).not.toBeNull();
    expect(s!.bars.length).toBe(390);
  });

  it.each(R1_DAYS)('%s 走 REAL_1M 路径，玩家看到的点全是真实收盘', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA');
    const built = buildPlayerIntradaySeries(s!.bars as unknown as RevealedPriceBar[]);
    expect(built).not.toBeNull();
    expect(built!.mode).toBe('REAL_1M');
    expect(built!.truthLabel).toBe('REAL');
    expect(built!.barGapSec).toBe(60);

    // 点数必须等于 bar 数：多一个就是插出来的
    expect(built!.points.length).toBe(s!.bars.length);
    // 每个点的价必须逐一等于对应 bar 的真实收盘
    const bars = s!.bars as unknown as RevealedPriceBar[];
    built!.points.forEach((p, i) => {
      expect(p.price).toBe(bars[i].close);
    });
  });

  it.each(R1_DAYS)('%s 时间轴跨度等于真实盘中时长，不被摊开', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA');
    const built = buildPlayerIntradaySeries(s!.bars as unknown as RevealedPriceBar[]);
    const pts = built!.points;
    const span = pts[pts.length - 1].timeSec - pts[0].timeSec;
    expect(span).toBeLessThanOrEqual(RTH_SECONDS);
  });

  it.each(R1_DAYS)('%s 时间戳严格递增（重复/回退会让图表丢点）', (date) => {
    const s = getOfflineIntradaySession('r1', date, 'NVDA');
    const pts = buildPlayerIntradaySeries(s!.bars as unknown as RevealedPriceBar[])!.points;
    for (let i = 1; i < pts.length; i += 1) {
      expect(pts[i].timeSec).toBeGreaterThan(pts[i - 1].timeSec);
    }
  });
});

describe('小时锚点仍走推演路径，但步长不写死', () => {
  /** 造 3 根间隔一小时的 bar */
  const hourly: RevealedPriceBar[] = [0, 1, 2].map((i) => ({
    ts: new Date(Date.UTC(2025, 0, 27, 14 + i, 30, 0)).toISOString(),
    label: `${14 + i}:30`,
    open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000,
  }));

  it('识别为 DERIVED_FROM_ANCHORS 且间隔 3600', () => {
    const built = buildPlayerIntradaySeries(hourly)!;
    expect(built.mode).toBe('DERIVED_FROM_ANCHORS');
    expect(built.barGapSec).toBe(3600);
    expect(built.truthLabel).toBe('DERIVED_REAL_INPUTS');
  });

  it('跨度不超过 bar 数 × 间隔（不外溢）', () => {
    const built = buildPlayerIntradaySeries(hourly)!;
    const pts = built.points;
    const span = pts[pts.length - 1].timeSec - pts[0].timeSec;
    expect(span).toBeLessThanOrEqual(hourly.length * 3600);
  });

  it('半分钟间隔的数据会被判成真实，不再走推演', () => {
    const halfMin: RevealedPriceBar[] = [0, 1, 2, 3].map((i) => ({
      ts: new Date(Date.UTC(2025, 0, 27, 14, 30, i * 30)).toISOString(),
      label: `t${i}`, open: 100, high: 101, low: 99, close: 100 + i, volume: 5,
    }));
    expect(buildPlayerIntradaySeries(halfMin)!.mode).toBe('REAL_1M');
  });
});

describe('量的诚实性', () => {
  it('任一根缺量则整段不画量（不做半真半假）', () => {
    const bars: RevealedPriceBar[] = [0, 1, 2].map((i) => ({
      ts: new Date(Date.UTC(2025, 0, 27, 14, 30 + i, 0)).toISOString(),
      label: `t${i}`, open: 100, high: 101, low: 99, close: 100 + i,
      volume: i === 1 ? null : 500,
    }));
    expect(buildPlayerIntradaySeries(bars)!.volume).toBeNull();
  });

  it('每根都有量时逐根照搬真实量，不重新切分', () => {
    const bars: RevealedPriceBar[] = [0, 1, 2].map((i) => ({
      ts: new Date(Date.UTC(2025, 0, 27, 14, 30 + i, 0)).toISOString(),
      label: `t${i}`, open: 100, high: 101, low: 99, close: 100 + i, volume: 7 + i,
    }));
    const vol = buildPlayerIntradaySeries(bars)!.volume!;
    expect(vol.map((v) => v.volume)).toEqual([7, 8, 9]);
  });
});
