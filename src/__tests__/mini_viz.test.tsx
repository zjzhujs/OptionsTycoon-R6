/**
 * Mini-viz 组件。
 *
 * 这套测试只盯一件事：**没有数据时绝不画出一个看起来有数据的图。**
 *
 * 为什么是它：一个漂亮的环形图里放一个编出来的百分比，比不画更糟——
 * 玩家会当真。本作的核心承诺就是"能说清哪些是真的"，
 * 而图表比文字更容易让人信，所以 mini-viz 的空态纪律必须比文字更严。
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Donut, Sparkline, Radar, MeterBar, Waveform, SeatTrace } from '../components/fx/MiniViz';

describe('Mini-viz — 无数据时不许编', () => {
  it('Donut：value 为 null / undefined / NaN 一律走空态', () => {
    for (const v of [null, undefined, NaN]) {
      const { container } = render(<Donut value={v as any} />);
      expect(container.querySelector('.mv-empty')).toBeTruthy();
      expect(container.querySelector('.mv-donut')).toBeNull();
    }
  });

  it('Sparkline：点数不足 2 个走空态', () => {
    for (const p of [null, [], [1], [1, null, undefined]]) {
      const { container } = render(<Sparkline points={p as any} />);
      expect(container.querySelector('.mv-empty')).toBeTruthy();
    }
  });

  it('Radar：轴少于 3 条走空态', () => {
    const { container } = render(<Radar axes={[{ label: 'Δ', value: 0.5 }]} />);
    expect(container.querySelector('.mv-empty')).toBeTruthy();
  });

  it('MeterBar / Waveform：无数据走空态', () => {
    expect(render(<MeterBar value={null} />).container.querySelector('.mv-empty')).toBeTruthy();
    expect(render(<Waveform points={[1, 2]} />).container.querySelector('.mv-empty')).toBeTruthy();
  });

  it('空态上写着"暂无数据"，不是一条看起来像 0 的线', () => {
    const { container } = render(<Sparkline points={null} />);
    expect(container.textContent).toContain('暂无数据');
  });
});

describe('Mini-viz — 有数据时画对', () => {
  it('Donut 的弧长与 value 成比例，且 0/1 都不越界', () => {
    const arc = (v: number) => {
      const { container } = render(<Donut value={v} />);
      const c = container.querySelectorAll('circle')[1];
      const [len] = (c.getAttribute('stroke-dasharray') || '0 0').split(' ').map(Number);
      return len;
    };
    const full = arc(1);
    expect(arc(0)).toBeCloseTo(0, 3);
    expect(arc(0.5)).toBeCloseTo(full / 2, 1);
    // 越界值必须被夹住，不能画出超过一圈的弧
    expect(arc(1.8)).toBeCloseTo(full, 3);
    expect(arc(-0.5)).toBeCloseTo(0, 3);
  });

  it('Radar：缺值的轴画到 0 并在标签上标出来，不是悄悄跳过', () => {
    // 悄悄跳过会让多边形少一个角，形状本身就在说谎
    const { container } = render(
      <Radar axes={[
        { label: 'Δ', value: 0.8 },
        { label: 'Γ', value: null },
        { label: 'Θ', value: 0.4 },
        { label: 'V', value: 0.6 },
        { label: 'ρ', value: 0.2 },
      ]} />,
    );
    expect(container.querySelector('.mv-radar')).toBeTruthy();
    // 五条轴的标签都在，缺的那条带"·无"
    expect(container.textContent).toContain('Γ·无');
    const shape = container.querySelectorAll('polygon');
    const last = shape[shape.length - 1];
    expect((last.getAttribute('points') || '').split(' ')).toHaveLength(5);
  });

  it('MeterBar 越过阈值换色：正常=good 警戒=gold 危险=risk', () => {
    const fillOf = (v: number) => {
      const { container } = render(<MeterBar value={v} />);
      return container.querySelectorAll('rect')[1].getAttribute('fill');
    };
    expect(fillOf(0.3)).toContain('good');
    expect(fillOf(0.75)).toContain('gold');
    expect(fillOf(0.95)).toContain('risk');
  });

  it('Waveform 传了 domainMax 就按它定标，不跟着观察值自适应', () => {
    // 实机翻车过：席位紧张度是 0–3 的档位，四个人全程平稳（全 0）时
    // 自适应刻度把所有柱子压成 1px，界面上看着像"这里没数据"。
    const h = (points: number[], domainMax?: number) => {
      const { container } = render(<Waveform points={points} domainMax={domainMax} height={30} />);
      return Array.from(container.querySelectorAll('rect')).map((r) => Number(r.getAttribute('height')));
    };
    // 全 0 + 钉死刻度 → 一排等高的贴地低柱（有地板，看得见）
    const flat = h([0, 0, 0, 0, 0], 3);
    expect(new Set(flat).size).toBe(1);
    expect(flat[0]).toBeGreaterThan(0);
    expect(flat[0]).toBeLessThan(8); // 明显低于满格，"平稳"要看起来就是平稳

    // 同一组数据，有人窜到 3 → 柱子明显变高，档位差看得出来
    const spike = h([0, 0, 3, 0, 0], 3);
    expect(spike[2]).toBeGreaterThan(flat[0] * 3);

    // 不传 domainMax 时才自适应（其他场景仍需要这个行为）
    const auto = h([1, 2, 3]);
    expect(auto[2]).toBeGreaterThan(auto[0]);
  });

  it('Waveform 的值超出 domainMax 时顶格，不画出容器', () => {
    const { container } = render(<Waveform points={[0, 99, 0]} domainMax={3} height={30} />);
    const hs = Array.from(container.querySelectorAll('rect')).map((r) => Number(r.getAttribute('height')));
    expect(Math.max(...hs)).toBeLessThanOrEqual(30);
  });

  it('全部颜色走主题 token，没有字面 hex', () => {
    const { container } = render(
      <div>
        <Donut value={0.6} />
        <Sparkline points={[1, 3, 2, 5]} />
        <Radar axes={[{ label: 'a', value: 0.3 }, { label: 'b', value: 0.7 }, { label: 'c', value: 0.5 }]} />
        <MeterBar value={0.4} />
        <Waveform points={[1, -2, 3, -1, 2]} />
      </div>,
    );
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('SeatTrace — WAR ROOM 席位轨迹', () => {
  it('全零 = 账本上没有往来记录，走空态而不是画一条贴零线的直线', () => {
    // 画成直线看着像"关系持续中性"，那是过度解读——真相是什么都没发生过。
    // harv P1 的规矩：无事件则不画波形。
    const { container } = render(<SeatTrace points={[0, 0, 0, 0, 0]} />);
    expect(container.querySelector('.mv-empty')).toBeTruthy();
    expect(container.querySelector('.mv-trace')).toBeNull();
    // 空态要说清缺的是什么：席位写"尚无往来"，不是笼统的"暂无数据"
    expect(container.textContent).toContain('尚无往来');
  });

  it('有往来记录就画连续折线，且带零基线', () => {
    const { container } = render(<SeatTrace points={[3, 1, -2, -5]} />);
    const svg = container.querySelector('.mv-trace');
    expect(svg).toBeTruthy();
    // 零基线是必须的：正负号本身就是信息（之上=他欠你，之下=他记着你）
    expect(svg!.querySelector('line')).toBeTruthy();
    // 主线 + 光晕线各一条
    expect(svg!.querySelectorAll('path').length).toBe(2);
  });

  it('穿越零点画得出来——这是柱状图表达不了的那件事', () => {
    const { container } = render(<SeatTrace points={[5, -5]} domainMax={5} height={40} />);
    const d = container.querySelectorAll('path')[1].getAttribute('d') || '';
    const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    // 一个在上半、一个在下半，中线两侧
    expect(ys[0]).toBeLessThan(20);
    expect(ys[1]).toBeGreaterThan(20);
  });

  it('点数不足 2 走空态', () => {
    expect(render(<SeatTrace points={[4]} />).container.querySelector('.mv-empty')).toBeTruthy();
  });
});
