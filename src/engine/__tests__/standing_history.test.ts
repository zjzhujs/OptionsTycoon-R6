/**
 * 往来净值历史 · 防前视
 *
 * 这套测试只盯一件事：**用后来发生的事重写历史**。
 *
 * WAR ROOM 的席位折线画的是逐日净值。如果玩家第 5 天得罪了 Victor，
 * 而第 2 天那个点也跟着变负，那条线就在说谎——它会让玩家以为
 * "我第 2 天就已经把他得罪了"，从而错误复盘自己的决策。
 */
import { describe, expect, it } from 'vitest';
import { standingHistory, standingWith } from '../engines/grudge_ledger';

const host = (entries: any[]) => ({ grudge_ledger: entries } as any);
const DATES = ['2025-01-24', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30'];

describe('standingHistory — 不许用后来的事重写历史', () => {
  it('第 4 天记的怨，不能出现在第 1、2 天的点上', () => {
    const h = host([
      { subject: 'victor_hale', kind: 'GRUDGE', weight: 20, date: '2025-01-29', what: '越过风控加仓' },
    ]);
    const series = standingHistory(h, 'victor_hale', DATES);
    // 前三天账本上什么都没有
    expect(series[0]).toBe(0);
    expect(series[1]).toBe(0);
    expect(series[2]).toBe(0);
    // 第四天起才记上这笔怨
    expect(series[3]).toBeLessThan(0);
    expect(series[4]).toBeLessThan(0);
  });

  it('末点必须等于"此刻"的 standingWith——历史线的终点就是当前状态', () => {
    const h = host([
      { subject: 'maya_chen', kind: 'DEBT', weight: 12, date: '2025-01-24' },
      { subject: 'maya_chen', kind: 'GRUDGE', weight: 5, date: '2025-01-28' },
    ]);
    const series = standingHistory(h, 'maya_chen', DATES);
    const now = standingWith(h, 'maya_chen', DATES[DATES.length - 1]).net;
    expect(series[series.length - 1]).toBeCloseTo(now, 9);
  });

  it('穿越零点画得出来：先欠人情，后来结仇', () => {
    const h = host([
      { subject: 'leo_park', kind: 'DEBT', weight: 30, date: '2025-01-24' },
      { subject: 'leo_park', kind: 'GRUDGE', weight: 50, date: '2025-01-29' },
    ]);
    const series = standingHistory(h, 'leo_park', DATES);
    expect(series[0]).toBeGreaterThan(0);   // 他欠你
    expect(series[4]).toBeLessThan(0);      // 翻脸了
  });

  it('别人的账不算到这个人头上', () => {
    const h = host([
      { subject: 'daniel_ross', kind: 'GRUDGE', weight: 40, date: '2025-01-24' },
    ]);
    expect(standingHistory(h, 'victor_hale', DATES).every((v) => v === 0)).toBe(true);
  });

  it('空账本 = 全零（由 UI 决定走空态，引擎不替它判断）', () => {
    expect(standingHistory(host([]), 'maya_chen', DATES)).toEqual([0, 0, 0, 0, 0]);
  });
});
