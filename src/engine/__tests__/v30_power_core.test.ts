/**
 * V30 · 恩怨账本与资金链级联。
 *
 * 这套测试钉的不是"函数返回值对"，而是评测报告点名要的那两种实感确实存在：
 *
 *   「感受不到被手下背叛或被同行绞杀」→ 后果必须被记住，且必须能在后来被兑现。
 *   「缺乏资金链断裂的可逆推演」      → 螺旋必须真的能连锁，而且必须真的能被拦住。
 *
 * 如果哪天有人把「怨」也做成会随时间衰减、或者把级联做成必死无解，这里会失败。
 */
import { describe, expect, it } from 'vitest';
import {
  callInFavor,
  consumeGrudge,
  effectiveWeight,
  getLedger,
  ledgerSummary,
  record,
  standingWith,
} from '../engines/grudge_ledger';
import { applyRedemption, projectCascade } from '../engines/liquidity_cascade';

function blankState(): any {
  return {};
}

describe('V30 恩怨账本 — 后果会被记住', () => {
  it('记下的怨在很久之后仍然原值不动', () => {
    const s = blankState();
    record(s, {
      subject: 'adrian_cross',
      date: '2025-01-24',
      kind: 'GRUDGE',
      weight: 40,
      what: '用竞业禁止律师函冻结了他的挖角',
    });
    const e = getLedger(s)[0];
    // 一年之后
    expect(effectiveWeight(e, '2026-01-24')).toBe(40);
  });

  it('恩会随时间衰减，逼玩家及时兑现', () => {
    const s = blankState();
    record(s, {
      subject: 'maya_chen',
      date: '2025-01-24',
      kind: 'DEBT',
      weight: 40,
      what: '花 $25,000 保住了她的核心建模师',
    });
    const e = getLedger(s)[0];
    expect(effectiveWeight(e, '2025-01-24')).toBe(40);
    // 半衰期 30 天
    expect(effectiveWeight(e, '2025-02-23')).toBeCloseTo(20, 1);
    expect(effectiveWeight(e, '2025-03-25')).toBeCloseTo(10, 1);
  });

  it('恩怨的不对称是刻意的：仇不报不会忘，人情不用会淡', () => {
    const s = blankState();
    record(s, { subject: 'x', date: '2025-01-01', kind: 'DEBT', weight: 50, what: '帮过他' });
    record(s, { subject: 'x', date: '2025-01-01', kind: 'GRUDGE', weight: 50, what: '得罪过他' });
    const [debt, grudge] = getLedger(s);
    const later = '2025-04-01';
    expect(effectiveWeight(debt, later)).toBeLessThan(20);
    expect(effectiveWeight(grudge, later)).toBe(50);
  });

  it('把柄分方向：你握着对方，和对方握着你，是两回事', () => {
    const s = blankState();
    record(s, {
      subject: 'evelyn_shaw', date: '2025-01-27', kind: 'LEVERAGE', weight: 30,
      what: '与她做过一次不留记录的背景交流', holder: 'SUBJECT',
      origin_choice_id: 'off_record',
    });
    record(s, {
      subject: 'evelyn_shaw', date: '2025-01-28', kind: 'LEVERAGE', weight: 20,
      what: '掌握了她引用未署名信源的一次疏漏', holder: 'PLAYER',
      origin_choice_id: 'noted_lapse',
    });
    const st = standingWith(s, 'evelyn_shaw', '2025-01-29');
    expect(st.leverageAgainst).toHaveLength(1);
    expect(st.leverageOver).toHaveLength(1);
  });
});

describe('V30 恩怨账本 — 后果能被兑现', () => {
  it('一笔怨只会被清算一次，不会变成刷屏循环', () => {
    const s = blankState();
    record(s, {
      subject: 'adrian_cross', date: '2025-01-24', kind: 'GRUDGE', weight: 40,
      what: '律师函羞辱', origin_choice_id: 'legal_injunction',
    });
    const first = consumeGrudge(s, 'adrian_cross', '2025-01-27');
    expect(first).not.toBeNull();
    expect(first!.what).toContain('律师函');
    // 第二次取不到了
    expect(consumeGrudge(s, 'adrian_cross', '2025-01-28')).toBeNull();
  });

  it('被兑现过的怨仍留在账上供回顾，但不再有力量', () => {
    const s = blankState();
    record(s, { subject: 'a', date: '2025-01-01', kind: 'GRUDGE', weight: 30, what: 'x' });
    consumeGrudge(s, 'a', '2025-01-05');
    expect(getLedger(s)).toHaveLength(1);
    expect(effectiveWeight(getLedger(s)[0], '2025-01-06')).toBe(0);
  });

  it('净值为负时对方拒绝出手，并且说得出是因为哪件事', () => {
    const s = blankState();
    record(s, { subject: 'victor_hale', date: '2025-01-20', kind: 'DEBT', weight: 10, what: '小忙' });
    record(s, {
      subject: 'victor_hale', date: '2025-01-22', kind: 'GRUDGE', weight: 45,
      what: '当众否决了他的限仓要求',
    });
    const r = callInFavor(s, 'victor_hale', '2025-01-24', 5);
    expect(r.ok).toBe(false);
    // 不是一句泛泛的"失败"，要能指出具体那件事
    expect(r.reason).toContain('当众否决了他的限仓要求');
  });

  it('人情够就能兑现，且优先花掉最旧的那笔', () => {
    const s = blankState();
    record(s, { subject: 'leo_park', date: '2025-01-02', kind: 'DEBT', weight: 30, what: '旧人情', origin_choice_id: 'old' });
    record(s, { subject: 'leo_park', date: '2025-01-20', kind: 'DEBT', weight: 30, what: '新人情', origin_choice_id: 'new' });
    const r = callInFavor(s, 'leo_park', '2025-01-21', 10);
    expect(r.ok).toBe(true);
    const old = getLedger(s).find((e) => e.origin_choice_id === 'old')!;
    const fresh = getLedger(s).find((e) => e.origin_choice_id === 'new')!;
    expect(old.weight).toBeLessThan(30);
    expect(fresh.weight).toBe(30);
  });

  it('人情不够时如实说差多少，不是含糊拒绝', () => {
    const s = blankState();
    record(s, { subject: 'jpmorgan_pb', date: '2025-01-20', kind: 'DEBT', weight: 8, what: '小忙' });
    const r = callInFavor(s, 'jpmorgan_pb', '2025-01-21', 40);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/需要 40/);
  });

  it('账本汇总按分量排序，最该管的排最前面', () => {
    const s = blankState();
    record(s, { subject: 'small', date: '2025-01-01', kind: 'DEBT', weight: 5, what: 'a' });
    record(s, { subject: 'big', date: '2025-01-01', kind: 'GRUDGE', weight: 60, what: 'b' });
    const sum = ledgerSummary(s, '2025-01-02');
    expect(sum[0].subject).toBe('big');
  });
});

/** 六个 LP 的最小可用形态，阈值刻意排开以便观察级联 */
function lpState(equityDrawdownPeak: number) {
  return {
    peak_aum: equityDrawdownPeak,
    lp_profiles: [
      { id: 'lp_a', name: 'Vanderbilt-Park Family Office', allocated_capital: 10_000_000, capital_current: 10_000_000, redemption_threshold_pct: 12, confidence_score: 45 },
      { id: 'lp_b', name: 'Northlake Pension', allocated_capital: 25_000_000, capital_current: 25_000_000, redemption_threshold_pct: 15, confidence_score: 80 },
      { id: 'lp_c', name: 'Stonebridge FOF', allocated_capital: 30_000_000, capital_current: 30_000_000, redemption_threshold_pct: 17, confidence_score: 78 },
    ],
  } as any;
}

describe('V30 资金链 — 螺旋真的会连锁', () => {
  it('回撤未触线时不触发，不无中生有制造危机', () => {
    const s = lpState(100_000_000);
    const p = projectCascade(s, { equity: 95_000_000, marginRequirement: 0, buyingPower: 50_000_000 });
    expect(p.triggered).toBe(false);
  });

  it('触线后由阈值最低的 LP 先动 —— 最沉不住气的那个', () => {
    const s = lpState(100_000_000);
    const p = projectCascade(s, { equity: 84_000_000, marginRequirement: 0, buyingPower: 50_000_000 });
    expect(p.triggered).toBe(true);
    expect(p.origin_lp!.name).toContain('Vanderbilt-Park');
  });

  it('信心越低赎回越狠 —— 不是固定比例', () => {
    const low = lpState(100_000_000);
    const high = lpState(100_000_000);
    high.lp_profiles[0].confidence_score = 75;
    const opts = { equity: 84_000_000, marginRequirement: 0, buyingPower: 50_000_000 };
    const pLow = projectCascade(low, opts);
    const pHigh = projectCascade(high, opts);
    expect(pLow.steps[0].figures.redeem_amount).toBeGreaterThan(pHigh.steps[0].figures.redeem_amount);
  });

  it('买力缺口存在时，推演一路走到被迫平仓与下一个触线', () => {
    const s = lpState(100_000_000);
    // 紧绷的杠杆：维持担保金贴着买力，赎回抽走现金后立刻穿仓
    const p = projectCascade(s, {
      equity: 84_000_000,
      marginRequirement: 41_500_000,
      buyingPower: 42_000_000,
    });
    const stages = p.steps.map((x) => x.stage);
    expect(stages).toContain('FORCED_LIQUIDATION');
    expect(stages).toContain('PERFORMANCE');
    expect(stages).toContain('NEXT_TRIGGER');
  });

  it('强平锁定的亏损会真的把回撤推大 —— 玩家没做错新决策却更惨', () => {
    const s = lpState(100_000_000);
    const p = projectCascade(s, { equity: 84_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    const perf = p.steps.find((x) => x.stage === 'PERFORMANCE')!;
    expect(perf.figures.drawdown_after).toBeGreaterThan(perf.figures.drawdown_before);
  });

  it('能识别出这是一个自我强化的螺旋', () => {
    const s = lpState(100_000_000);
    // 回撤已达 20%，强平亏损把它继续推高，越过第三个 LP 的 17% 阈值
    const p = projectCascade(s, { equity: 80_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    expect(p.self_reinforcing).toBe(true);
  });
});

describe('V30 资金链 — 但它必须是可逆的', () => {
  it('每一个可拦截的环都给出至少一条出手方式', () => {
    const s = lpState(100_000_000);
    const p = projectCascade(s, { equity: 84_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    for (const step of p.steps) {
      // PERFORMANCE 是已经发生的后果，没有出手位；其余每环都必须有
      if (step.stage === 'PERFORMANCE') continue;
      if (step.stage === 'NEXT_TRIGGER' && !p.self_reinforcing) continue;
      expect(step.interventions.length).toBeGreaterThan(0);
    }
  });

  it('每条出手都写明代价，没有免费的出路', () => {
    const s = lpState(100_000_000);
    const p = projectCascade(s, { equity: 84_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    const all = p.steps.flatMap((x) => x.interventions);
    expect(all.length).toBeGreaterThan(0);
    for (const iv of all) {
      expect(iv.cost_summary.length).toBeGreaterThan(4);
      expect(iv.halts_at).toBeTruthy();
    }
  });

  it('买力缺口被补上后，螺旋在第二环自然停住', () => {
    const s = lpState(100_000_000);
    // 买力充裕：赎回后依然覆盖得住维持担保金
    const p = projectCascade(s, { equity: 84_000_000, marginRequirement: 5_000_000, buyingPower: 50_000_000 });
    expect(p.triggered).toBe(true);
    expect(p.self_reinforcing).toBe(false);
    expect(p.steps.map((x) => x.stage)).not.toContain('FORCED_LIQUIDATION');
  });

  it('推演是纯函数：反复预览不改变任何状态', () => {
    const s = lpState(100_000_000);
    const before = JSON.stringify(s);
    projectCascade(s, { equity: 84_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    projectCascade(s, { equity: 84_000_000, marginRequirement: 41_500_000, buyingPower: 42_000_000 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('真正落地赎回才改状态，并留下可追溯的日志', () => {
    const s = lpState(100_000_000);
    const r = applyRedemption(s, 'lp_a', 1_500_000, '2025-01-27');
    expect(r.ok).toBe(true);
    expect(s.lp_profiles[0].capital_current).toBe(8_500_000);
    expect(s.cascade_log[0]).toContain('2025-01-27');
    // 赎回后信心进一步下调，避免同一个 LP 立刻"恢复"
    expect(s.lp_profiles[0].confidence_score).toBeLessThan(45);
  });

  it('赎回金额不会超过该 LP 的剩余出资', () => {
    const s = lpState(100_000_000);
    applyRedemption(s, 'lp_a', 99_000_000, '2025-01-27');
    expect(s.lp_profiles[0].capital_current).toBe(0);
  });
});
