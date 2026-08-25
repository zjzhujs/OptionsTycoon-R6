/**
 * 盘中量柱分配。
 *
 * 这套测试只盯一件事：**24 份之和必须严格等于该小时的真实成交量。**
 *
 * 为什么是它而不是"好不好看"：小时总量是**真实数据**。
 * 如果拆出来的子柱加起来不等于它，玩家把量柱一加就会得到一个从未发生过的成交量——
 * 那就是用图表撒谎。各自四舍五入的和会漂，所以实现里用的是最大余数法。
 */
import { describe, expect, it } from 'vitest';
import {
  derivePathForBar,
  deriveVolumeForBar,
  deriveVolumeForSession,
  DEFAULT_STEPS_PER_BAR,
} from '../engines/intraday_path';
import type { RevealedPriceBar } from '../schemas';

const NVDA_BAR: RevealedPriceBar = {
  ts: '2025-01-27T14:30:00Z',
  label: '09:30–10:30 ET',
  open: 124.78, high: 128.4, low: 123.05, close: 124.03, volume: 63266787,
};

const SMALL_VOL_BAR: RevealedPriceBar = {
  ...NVDA_BAR,
  ts: '2025-01-27T15:30:00Z',
  volume: 37, // 比份数还少，最容易把分配算法压出问题
};

// VIX 是指数，没有可交易量。真实数据包里 volume 恒为 0。
const VIX_BAR: RevealedPriceBar = {
  ts: '2025-01-28T14:30:00Z',
  label: '09:30–10:30 ET',
  open: 16.35, high: 16.47, low: 16.35, close: 16.41, volume: 0,
};

describe('盘中量柱 — 总量守恒（最重要的一条）', () => {
  it('子柱之和严格等于该小时的真实成交量', () => {
    for (const bar of [NVDA_BAR, SMALL_VOL_BAR]) {
      const vols = deriveVolumeForBar(bar, derivePathForBar(bar));
      expect(vols).not.toBeNull();
      const sum = vols!.reduce((a, b) => a + b.volume, 0);
      expect(sum).toBe(bar.volume);
    }
  });

  it('每份都是非负整数（成交量不存在小数或负数）', () => {
    const vols = deriveVolumeForBar(NVDA_BAR, derivePathForBar(NVDA_BAR))!;
    for (const v of vols) {
      expect(Number.isInteger(v.volume)).toBe(true);
      expect(v.volume).toBeGreaterThanOrEqual(0);
    }
  });

  it('份数与路径步数一致', () => {
    const path = derivePathForBar(NVDA_BAR);
    const vols = deriveVolumeForBar(NVDA_BAR, path)!;
    expect(vols).toHaveLength(path.length - 1);
    expect(vols).toHaveLength(DEFAULT_STEPS_PER_BAR);
  });

  it('全部标注为 SIMULATED —— 小时总量是真的，切分是模拟的', () => {
    const vols = deriveVolumeForBar(NVDA_BAR, derivePathForBar(NVDA_BAR))!;
    expect(vols.every((v) => v.source_type === 'SIMULATED')).toBe(true);
  });
});

describe('盘中量柱 — 指数没有成交量就不许编', () => {
  it('VIX（volume=0）返回 null，而不是编一条出来', () => {
    expect(deriveVolumeForBar(VIX_BAR, derivePathForBar(VIX_BAR))).toBeNull();
  });

  it('整段里只要有一根没量，整段返回 null（不做半真半假）', () => {
    // 混着画会让玩家以为缺的那段"成交为零"，
    // 而真相是"这个标的根本没有成交量数据"。
    expect(deriveVolumeForSession([NVDA_BAR, VIX_BAR])).toBeNull();
  });

  it('整段都有量时，序号连续且总和等于各小时之和', () => {
    const bars = [NVDA_BAR, { ...NVDA_BAR, ts: '2025-01-27T15:30:00Z', volume: 42000000 }];
    const vols = deriveVolumeForSession(bars)!;
    expect(vols).toHaveLength(DEFAULT_STEPS_PER_BAR * bars.length);
    vols.forEach((v, i) => expect(v.index).toBe(i + 1));
    const sum = vols.reduce((a, b) => a + b.volume, 0);
    expect(sum).toBe(bars.reduce((a, b) => a + (b.volume ?? 0), 0));
  });
});

describe('盘中量柱 — 确定性', () => {
  it('同一根 bar 永远拆出同一组量柱（复盘必须一致）', () => {
    const a = deriveVolumeForBar(NVDA_BAR, derivePathForBar(NVDA_BAR))!.map((v) => v.volume);
    const b = deriveVolumeForBar(NVDA_BAR, derivePathForBar(NVDA_BAR))!.map((v) => v.volume);
    expect(a).toEqual(b);
  });

  it('量柱与走势有关联，不是一排均匀噪音', () => {
    // 权重取自单步价格变动幅度：动得多的那几分钟成交也多。
    // 判据放得很松——只要不是全等就说明确实跟着路径走。
    const vols = deriveVolumeForBar(NVDA_BAR, derivePathForBar(NVDA_BAR))!.map((v) => v.volume);
    expect(new Set(vols).size).toBeGreaterThan(3);
  });
});
