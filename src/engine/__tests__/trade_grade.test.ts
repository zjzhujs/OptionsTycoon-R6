import { describe, it, expect } from 'vitest';
import { tradeGrade, type TradeGradeContext } from '../engines/trade_grade';

// 满分好单基准：亏钱与否不进入任何一维。
const good: TradeGradeContext = {
  thesis: { risk_budget_usd: 1000 },
  max_risk_usd: 500,
  strategy_matches_thesis: true,
  exit_defined_before_entry: true,
  defined_risk: true,
  protective_leg: true,
  spread_reduced_cost: true,
  exit_adherence: 'exact',
  reduced_on_new_evidence: true,
  reasonable_limit_or_spread_control: true,
};

describe('tradeGrade 交易质量评级', () => {
  it.each([
    ['无Thesis最高C', { thesis: null }, 'C'],
    ['违反风控上限最高D', { risk_limit_breached: true }, 'D'],
    [
      '裸卖无保护超预算最高D',
      { defined_risk: false, protective_leg: false, naked_unlimited_risk: true, max_risk_usd: 2000 },
      'D',
    ],
    ['连续逆势加仓最高F', { adverse_adds_without_new_evidence: 2 }, 'F'],
    ['MNPI直接F', { mnpi: true }, 'F'],
  ] as const)('硬帽：%s', (_label, patch, want) => {
    expect(tradeGrade({ ...good, ...(patch as Partial<TradeGradeContext>) }).grade).toBe(want);
  });

  it('暴赚的烂单拿低分（P&L 权重=0）', () => {
    const bad = tradeGrade({
      ...good,
      strategy_matches_thesis: false,
      exit_defined_before_entry: false,
      defined_risk: false,
      protective_leg: false,
      spread_reduced_cost: false,
      exit_adherence: 'none',
      reduced_on_new_evidence: false,
      reasonable_limit_or_spread_control: false,
      chase: 'severe',
      unnecessary_legs_or_fees: true,
    });
    expect(bad.score).toBeLessThan(55);
  });

  it('亏钱但结构正确纪律好的单拿满级', () => {
    expect(tradeGrade(good).grade).toBe('SSS');
    expect(tradeGrade(good).score).toBe(100);
  });

  it('cap 命中时给出可读原因', () => {
    const res = tradeGrade({ ...good, thesis: null });
    expect(res.cap).toBe(64);
    expect(res.cap_reasons.join()).toContain('无 Thesis');
  });
});
