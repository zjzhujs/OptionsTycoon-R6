/**
 * WAR ROOM 席位轨迹 · 端到端（组件层）
 *
 * 为什么要有这套：实机探针里四条轨迹一直是空态——那是**对的**
 * （那一局账本确实没记录），但"只验空态"等于没验功能。
 * 必须证明：**账本里真有条目时，折线画得出来。**
 *
 * 我在浏览器里试过端到端注入，卡在一个自己造的坑上：
 * 那个流程一天都没推进，`dateHistory` 只有 1 个日期，
 * 少于 2 点必然走空态——和账本有没有数据完全无关。
 * 组件测试能把两个变量分开，比在浏览器里绕可靠得多。
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WarRoomRail } from '../components/WarRoomRail';

const DATES = ['2025-01-24', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30'];

const withLedger = (entries: any[]) =>
  ({ grudge_ledger: entries, favor_balances: {}, fund_stats: { lp_confidence: 60 } } as any);

describe('WAR ROOM 席位轨迹', () => {
  it('账本为空 → 四条都是空态（无事件则不画波形）', () => {
    const { container } = render(
      <WarRoomRail state={withLedger([])} asOfDate="2025-01-30" dateHistory={DATES} />,
    );
    expect(container.querySelectorAll('.mv-trace')).toHaveLength(0);
    expect(container.querySelectorAll('.mv-empty').length).toBeGreaterThanOrEqual(4);
  });

  it('账本里有条目 → 那个人的折线画得出来，其余仍是空态', () => {
    const { container } = render(
      <WarRoomRail
        state={withLedger([
          { id: 'g1', subject: 'victor_hale', kind: 'GRUDGE', weight: 18, date: '2025-01-27', what: '越过风控加仓' },
          { id: 'd1', subject: 'victor_hale', kind: 'DEBT', weight: 25, date: '2025-01-24', what: '替他扛过一次问责' },
        ])}
        asOfDate="2025-01-30"
        dateHistory={DATES}
      />,
    );
    const traces = container.querySelectorAll('.mv-trace');
    expect(traces).toHaveLength(1);                     // 只有 Victor 有往来
    // 断**注册表 key**而不是字段路径：路径将来会随重构变
    // （这条断言就因为 standingWith → standingHistory 挂过一次），
    // key 是登记在 vizSources.ts 里的稳定标识。
    expect(traces[0].getAttribute('data-source')).toContain('seatStanding');
    // 主线 + 光晕线，且有零基线
    expect(traces[0].querySelectorAll('path')).toHaveLength(2);
    expect(traces[0].querySelector('line')).toBeTruthy();
  });

  it('只走过一天时不画线——点数不够，与账本有没有数据无关', () => {
    // 这正是我在浏览器端到端里踩的坑：没推进天数，永远看不到线
    const { container } = render(
      <WarRoomRail
        state={withLedger([
          { id: 'g1', subject: 'victor_hale', kind: 'GRUDGE', weight: 18, date: '2025-01-24', what: 'x' },
        ])}
        asOfDate="2025-01-24"
        dateHistory={['2025-01-24']}
      />,
    );
    expect(container.querySelectorAll('.mv-trace')).toHaveLength(0);
  });

  it('轨迹不带前视：第 4 天记的怨不影响第 1 天的点', () => {
    const { container } = render(
      <WarRoomRail
        state={withLedger([
          { id: 'g1', subject: 'maya_chen', kind: 'GRUDGE', weight: 40, date: '2025-01-29', what: 'x' },
        ])}
        asOfDate="2025-01-30"
        dateHistory={DATES}
      />,
    );
    const d = container.querySelector('.mv-trace')!.querySelectorAll('path')[1].getAttribute('d')!;
    const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    // 前三天在零基线上（同一高度），第四天才掉下去
    expect(ys[0]).toBeCloseTo(ys[1], 1);
    expect(ys[1]).toBeCloseTo(ys[2], 1);
    expect(ys[3]).toBeGreaterThan(ys[2]);   // y 越大越靠下 = 负值
  });
});
