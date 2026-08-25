import { describe, expect, it } from 'vitest';
import {
  executeStrategyOrder,
  exerciseLongOption,
  recalculateCashCollateral,
  settlePhysicalAssignment,
  stressMarginRequirement,
} from '../engines/v28_market_integrity';

const node = { date: '2025-01-27', underlying_bar: { close: 100 } } as any;
const quote = (type: 'call' | 'put', strike: number, expiration: string): any => ({
  contract_key: `${type}_${strike}_${expiration}`,
  underlying: 'NVDA', type, strike, expiration,
  bid: 2, ask: 2.2, mid: 2.1, iv: 0.55,
  provenance: { source_type: 'DERIVED_MODEL' },
});

function state(): any {
  return {
    cash: 10000,
    account_type: 'Cash',
    positions: [],
    shares: 0,
    margin_debt: 0,
    realized_pl: 0,
    active_theses: {},
    fund_stats: { aum: 10000 },
  };
}

describe('V28 market integrity', () => {
  it('opens a two-leg vertical spread with a strategy id and collateral ledger', () => {
    const s = state();
    const [next, result] = executeStrategyOrder(s, node, quote, {
      side: 'buy_vertical_spread', type: 'call', strike: 100, expiration: '2025-02-07', qty: 1,
      strategy_kind: 'VERTICAL_SPREAD',
      strategy_legs: [
        { type: 'call', strike: 100, expiration: '2025-02-07', side: 'LONG' },
        { type: 'call', strike: 105, expiration: '2025-02-07', side: 'SHORT' },
      ],
    } as any);
    expect(result.accepted).toBe(true);
    expect(next.positions).toHaveLength(2);
    expect(next.positions[0].strategy_id).toBe(next.positions[1].strategy_id);
    expect(next.cash).toBeLessThan(10000);
  });

  it('physically exercises an in-the-money long call into shares', () => {
    const s = state();
    s.positions.push({ id: 'long-call', kind: 'option', underlying: 'NVDA', type: 'call', strike: 90, expiration: '2025-01-31', qty: 1, entry_price: 4, short: false });
    const [next, result] = exerciseLongOption(s, node, { side: 'exercise_long_option', type: 'call', strike: 90, expiration: '2025-01-31', qty: 1 } as any);
    expect(result.accepted).toBe(true);
    expect(next.shares).toBe(100);
    expect(next.positions).toHaveLength(0);
    expect(result.execution_label).toContain('PHYSICAL');
  });

  it('records short put assignment as shares plus cash debit, never silent cash settlement', () => {
    const s = state();
    s.positions.push({ id: 'short-put', kind: 'option', underlying: 'NVDA', type: 'put', strike: 110, expiration: '2025-01-27', qty: 1, entry_price: 2, short: true, collateral_locked_usd: 10000 });
    const message = settlePhysicalAssignment(s, node, s.positions[0]);
    expect(s.shares).toBe(100);
    expect(s.cash).toBe(0);
    // 2026-08-19 文本润色把这句改成了「实物交收指�?(Physical Assignment) 触发：…」—�?
    // 中文主、英文作次要专业参照，符合本作的语言规矩，不是退化�?
    // 这条断言要守的是**消息必须点名"实物交收"**（而不是静默现金结算）�?
    // 所以改成按语义查、大小写不敏感，不再钉死那串英文原文�?
    expect(message).toMatch(/physical assignment/i);
    expect(message).toContain('实物交收');
  });

  it('exposes reserved cash and an explicitly derived stress model', () => {
    const s = state();
    s.positions.push({ id: 'csp', kind: 'option', underlying: 'NVDA', type: 'put', strike: 110, expiration: '2025-02-07', qty: 1, entry_price: 2, short: true, collateral_locked_usd: 9000 });
    expect(recalculateCashCollateral(s)).toBe(9000);
    const stress = stressMarginRequirement(s, 100);
    expect(stress.model_label).toBe('DERIVED_STRESS_MODEL');
    expect(stress.requirement).toBeGreaterThan(0);
  });
});

