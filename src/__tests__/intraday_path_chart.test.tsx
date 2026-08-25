/**
 * 盘中走势图。
 *
 * 这里盯两件事，都不是"好不好看"：
 *   1. **真实锚点画对没有** —— 实心圆必须落在真实小时收盘价上。
 *      画错了比不画更糟：玩家会以为某个模拟点是真实成交价。
 *   2. **诚实标注在不在** —— SIMULATED 徽章和"不参与成交结算"那句话
 *      是这一屏对玩家的承诺，不能被后续的视觉重构顺手删掉。
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntradayPathChart } from '../components/IntradayPathChart';
import { derivePathForSession } from '../engine/engines/intraday_path';
import type { RevealedPriceBar } from '../engine/schemas';

const BARS: RevealedPriceBar[] = [
  { ts: '2025-01-27T14:30:00Z', label: '09:30–10:30 ET', open: 124.78, high: 128.4, low: 123.05, close: 124.03, volume: 63266787 },
  { ts: '2025-01-27T15:30:00Z', label: '10:30–11:30 ET', open: 124.03, high: 125.1, low: 121.4, close: 122.6, volume: 42000000 },
  { ts: '2025-01-27T16:30:00Z', label: '11:30–12:30 ET', open: 122.6, high: 123.9, low: 118.2, close: 118.9, volume: 51000000 },
];

describe('盘中走势图', () => {
  it('真实锚点数量与已揭晓的 bar 数一致', () => {
    const { container } = render(<IntradayPathChart bars={BARS} label="2025-01-27" />);
    expect(container.querySelectorAll('circle.ipc-anchor')).toHaveLength(BARS.length);
  });

  it('锚点纵坐标落在真实收盘价上，而不是落在某个模拟点上', () => {
    // 独立复算一遍映射：路径的取值范围决定 y 轴，锚点必须与 close 一一对上。
    // 这条要是错了，玩家看到的"真实点"其实是个模拟点。
    const path = derivePathForSession(BARS);
    const prices = path.map((p) => p.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const span = hi - lo || 1;
    const H = 132;
    const PAD_Y = 10;
    const expectY = (v: number) => PAD_Y + (1 - (v - lo) / span) * (H - PAD_Y * 2);

    const { container } = render(<IntradayPathChart bars={BARS} />);
    const circles = Array.from(container.querySelectorAll('circle.ipc-anchor'));
    circles.forEach((c, k) => {
      expect(Number(c.getAttribute('cy'))).toBeCloseTo(expectY(BARS[k].close), 1);
    });
  });

  it('SIMULATED 徽章与"不参与成交结算"的说明必须在', () => {
    const { container } = render(<IntradayPathChart bars={BARS} />);
    // SIMULATED 在徽章和正文里各出现一次，所以按类名取徽章那一处，
    // 别用宽泛的文本匹配（会命中两个而报错）
    expect(container.querySelector('.ipc-badge')?.textContent).toMatch(/SIMULATED/);
    expect(screen.getByText(/不参与任何成交与结算/)).toBeTruthy();
    // 真实性的另一半：必须同时说清哪部分是真的
    expect(container.textContent).toMatch(/真实小时收盘/);
  });

  it('没有已揭晓的 bar 时不渲染（而不是画一条空线）', () => {
    const { container } = render(<IntradayPathChart bars={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});

/**
 * 真值标签必须跟着数据走（2026-08-20 claude）
 *
 * 原来 SIMULATED 徽章是写死的。R1 切到真实 1m 之后，写死就成了**反向说谎**：
 * 把真实分钟数据标成模拟。把假的说成真的会骗玩家，
 * 把真的说成假的一样毁掉这套标签的可信度——玩家没法再据此判断什么能信。
 */
describe('真值标签跟随数据粒度', () => {
  const MINUTE_BARS: RevealedPriceBar[] = [0, 1, 2, 3].map((i) => ({
    ts: `2025-01-27T14:3${i}:00Z`,
    label: `09:3${i} ET`,
    open: 124 + i, high: 125 + i, low: 123 + i, close: 124.5 + i, volume: 1000 + i,
  }));

  it('真实分钟数据下标 REAL，且不出现 SIMULATED', () => {
    const { container } = render(<IntradayPathChart bars={MINUTE_BARS} />);
    expect(container.querySelector('.ipc-badge')?.textContent).toMatch(/REAL/);
    expect(container.querySelector('.ipc-badge')?.textContent).not.toMatch(/SIMULATED/);
    expect(container.textContent).toMatch(/没有任何插值或模拟点/);
  });

  it('真实分钟数据下不画锚点圆（每个点都是真的，区分就不存在了）', () => {
    const { container } = render(<IntradayPathChart bars={MINUTE_BARS} />);
    expect(container.querySelectorAll('circle.ipc-anchor')).toHaveLength(0);
  });

  it('真实分钟数据下点数等于 bar 数——多一个就是插出来的', () => {
    const { container } = render(<IntradayPathChart bars={MINUTE_BARS} />);
    const d = container.querySelector('path.ipc-line')?.getAttribute('d') ?? '';
    expect((d.match(/[ML]/g) ?? []).length).toBe(MINUTE_BARS.length);
  });

  it('小时锚点下仍标 SIMULATED（旧行为不能被顺手改掉）', () => {
    const { container } = render(<IntradayPathChart bars={BARS} />);
    expect(container.querySelector('.ipc-badge')?.textContent).toMatch(/SIMULATED/);
  });
});
