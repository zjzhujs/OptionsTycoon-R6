/**
 * V29-UI-F — 模拟分析师共识。
 *
 * 这套测试要钉住的不是"算得对"，而是三件事：
 *
 *   1. 它是确定性的（同存档重开结果一致），且永远标 SIMULATED。
 *   2. 它看不到未来——共识只由当前游戏日期及之前的价格决定。
 *   3. **它会错，而且错在该错的地方。** 在 R1 战役里，2025-01-27 DeepSeek R1 冲击
 *      之前 NVDA 刚走完一轮上涨，模型必须给出偏乐观的共识；暴跌之后必须转冷。
 *      如果这条断言哪天失败了，说明模型被"修"成了永远正确的神谕，
 *      那它对玩家就没有任何训练价值了。
 */
import { describe, expect, it } from 'vitest';
import { simulateAnalystConsensus } from '../engines/analyst_simulation';
import nvdaPack from '../data/daily_history/NVDA.json';

const BARS = (nvdaPack as { bars: any[] }).bars;

function at(date: string) {
  return simulateAnalystConsensus('NVDA', date, BARS);
}

describe('V29-UI-F 模拟分析师 — 标签与确定性', () => {
  it('永远标 SIMULATED，不冒充真实评级', () => {
    const c = at('2025-01-24');
    expect(c).not.toBeNull();
    expect(c!.source_type).toBe('SIMULATED');
  });

  it('同样输入必须得到同样结果（存档重开不能变）', () => {
    const a = at('2025-01-24');
    const b = at('2025-01-24');
    expect(a).toEqual(b);
  });

  it('不同标的/日期给出不同结果，不是一个常量', () => {
    const a = at('2025-01-24');
    const b = at('2025-01-31');
    expect(a!.consensus_score).not.toBe(b!.consensus_score);
  });

  it('样本太短时宁可不给，也不硬编一个共识', () => {
    expect(simulateAnalystConsensus('NVDA', '2019-01-04', BARS)).toBeNull();
  });
});

describe('V29-UI-F 模拟分析师 — 看不到未来', () => {
  it('共识只由当前日期及之前的价格决定', () => {
    // 把某个未来日期的价格改到天上去，当前日期的共识必须一个字都不变。
    const tampered = BARS.map((b: any) =>
      b.date === '2025-03-03' ? { ...b, close: 99999, high: 99999 } : b
    );
    const normal = simulateAnalystConsensus('NVDA', '2025-01-24', BARS);
    const withFuture = simulateAnalystConsensus('NVDA', '2025-01-24', tampered);
    expect(withFuture).toEqual(normal);
  });

  it('目标价不会超出当前可见价格所能支撑的范围', () => {
    const c = at('2025-01-24')!;
    const visible = BARS.filter((b: any) => b.date <= '2025-01-24');
    const maxHigh = Math.max(...visible.map((b: any) => b.high ?? b.close));
    // 目标价锚在近期高点上再加乐观度，不该离谱到脱离可见价格。
    expect(c.target_mean).toBeLessThan(maxHigh * 1.6);
  });
});

describe('V29-UI-F 模拟分析师 — 必须会错（这是设计，不是缺陷）', () => {
  it('DeepSeek 暴跌前偏乐观：共识落在买入侧且目标价高于现价', () => {
    const before = at('2025-01-24')!; // 暴跌前最后一个交易日
    const closeBefore = BARS.find((b: any) => b.date === '2025-01-24').close;
    // 共识分 <= 2.6 表示落在 STRONG_BUY..BUY 一侧
    expect(before.consensus_score).toBeLessThanOrEqual(2.6);
    expect(before.target_mean).toBeGreaterThan(closeBefore);
    expect(before.implied_upside_pct).toBeGreaterThan(0);
  });

  it('暴跌后共识转冷：评级下移、隐含涨幅被动拉大', () => {
    const before = at('2025-01-24')!;
    const after = at('2025-01-31')!;
    // 分数上升 = 评级变差（1=强买 … 5=强卖）
    expect(after.consensus_score).toBeGreaterThan(before.consensus_score);
  });

  it('跟着共识做的玩家会在拐点被埋 —— 用真实价格验证这件事真的发生了', () => {
    const before = at('2025-01-24')!;
    const p24 = BARS.find((b: any) => b.date === '2025-01-24').close;
    const p27 = BARS.find((b: any) => b.date === '2025-01-27').close;
    // 分析师在 1/24 看多且给了正的隐含涨幅
    expect(before.implied_upside_pct).toBeGreaterThan(0);
    // 而真实价格在下一个交易日暴跌
    expect(p27).toBeLessThan(p24 * 0.9);
    // 也就是说：照共识买入的玩家，隔一个交易日就浮亏超过 10%。
  });

  it('卖出评级罕见 —— 复现卖方不喊卖出的现实', () => {
    const c = at('2025-01-24')!;
    const sells = c.distribution.SELL + c.distribution.STRONG_SELL;
    expect(sells / c.analyst_count).toBeLessThan(0.2);
  });
});

describe('V29-UI-F 模拟分析师 — 反指警告', () => {
  it('拥挤度是 0..100 的有效读数', () => {
    const c = at('2025-01-24')!;
    expect(c.crowding).toBeGreaterThanOrEqual(0);
    expect(c.crowding).toBeLessThanOrEqual(100);
  });

  it('警告只描述共识自身状态，不预测未来涨跌', () => {
    // 扫一段日期，凡是出现警告的，文案都不得包含方向性预测词
    const banned = ['将会', '必然', '预计上涨', '预计下跌', '一定'];
    for (const d of ['2025-01-23', '2025-01-24', '2025-01-27', '2025-01-28', '2025-01-31']) {
      const w = at(d)?.contrarian_warning;
      if (!w) continue;
      for (const b of banned) expect(w).not.toContain(b);
    }
  });

  it('分布之和等于覆盖机构数，共识分与分布自洽', () => {
    const c = at('2025-01-28')!;
    const total = Object.values(c.distribution).reduce((a, b) => a + b, 0);
    expect(total).toBe(c.analyst_count);
    const weights = [1, 2, 3, 4, 5];
    const keys = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'] as const;
    let sum = 0;
    keys.forEach((k, i) => { sum += c.distribution[k] * weights[i]; });
    expect(sum / c.analyst_count).toBeCloseTo(c.consensus_score, 2);
  });
});
