import { describe, it, expect } from 'vitest';
import { settle_eod_mark, settle_corporate_actions, settle_option_expiries, settle_daily_accruals, settle_lp_flows, check_carry_data_coverage } from '../settlement';
import { createEmptyFundBalanceSheet, recomputeStateFundBalanceSheet } from '../campaign_contract';
import type { GameState, PositionLot } from '../schemas';

describe('Settlement Pipeline - EOD Mark', () => {
  it('should mark shares to market and conserve value', () => {
    const lot: PositionLot = { id: 'lot_1', kind: 'shares', underlying: 'NVDA', qty: 100, entry_price: 100, entry_date: '2024-01-01', short: false, origin_campaign: 'r1', thesis_id: null, contract_multiplier: 1 };
    const state: GameState = { created_at: '2024-01-01', fund_stats: { cash: 10000, uninvested_cash: 10000, real_pnl: 0, initial_cash: 10000 }, cash: 10000, fund_balance_sheet: { ...createEmptyFundBalanceSheet(10000, '2024-01-01'), position_lots: [lot] } } as any;
    settle_eod_mark(state, '2025-01-02');
    const bs = state.fund_balance_sheet!;
    expect(bs.valuation_at).toBe('2025-01-02');
    const impliedMark = (bs.unrealized_pnl / 100) + 100;
    const expectedNav = 10000 + impliedMark * 100;
    expect(bs.nav).toBeCloseTo(expectedNav, 4);
    expect(bs.cost_basis).toBe(10000);
  });

  it('should handle missing data gracefully', () => {
    const lot: PositionLot = { id: 'lot_2', kind: 'shares', underlying: 'UNKNOWN_TICKER', qty: 50, entry_price: 200, entry_date: '2024-01-01', short: false, origin_campaign: 'r1', thesis_id: null, contract_multiplier: 1 };
    const state: GameState = { created_at: '2024-01-01', fund_stats: { cash: 5000, uninvested_cash: 5000, real_pnl: 0, initial_cash: 5000 }, cash: 5000, fund_balance_sheet: { ...createEmptyFundBalanceSheet(5000, '2024-01-01'), position_lots: [lot] } } as any;
    settle_eod_mark(state, '2024-01-05');
    const bs = state.fund_balance_sheet!;
    expect(bs.valuation_at).toBe('2024-01-05');
    expect(bs.unrealized_pnl).toBe(0); 
    expect(bs.nav).toBe(15000); 
  });
});

describe('Settlement Pipeline - Corporate Actions', () => {
  it('should settle ATVI merger cash accurately and conserve value', () => {
    const lot: PositionLot = { id: 'atvi_shares', kind: 'shares', underlying: 'ATVI', qty: 100, entry_price: 80, entry_date: '2023-01-01', short: false, origin_campaign: 'c8', thesis_id: null, contract_multiplier: 1 };
    const state: GameState = { created_at: '2023-01-01', fund_stats: { cash: 10000, uninvested_cash: 10000, real_pnl: 0, initial_cash: 10000 }, cash: 10000, fund_balance_sheet: { ...createEmptyFundBalanceSheet(10000, '2023-10-12'), position_lots: [lot] } } as any;
    recomputeStateFundBalanceSheet(state, '2023-10-12', { 'atvi_shares': 94 });
    const bsBefore = state.fund_balance_sheet!;
    expect(bsBefore.nav).toBe(19400); 
    const logs = settle_corporate_actions(state, '2023-10-13');
    
    expect(logs.length).toBeGreaterThan(0);
    expect(state.fund_balance_sheet!.position_lots.length).toBe(0);
    expect(state.fund_balance_sheet!.cash).toBe(10000 + 95 * 100); 
    recomputeStateFundBalanceSheet(state, '2023-10-13', {});
    expect(state.fund_balance_sheet!.realized_pnl).toBe((95 - 80) * 100); 
    expect(state.fund_balance_sheet!.nav).toBe(10000 + 95 * 100); 
  });
});

describe('Settlement Pipeline - Option Expiries', () => {
  it('should cash-settle expired in-the-money long calls and assert cash conservation', () => {
    const state: GameState = { created_at: '2024-01-01', fund_stats: { cash: 10000, uninvested_cash: 10000, real_pnl: 0, initial_cash: 10000 }, cash: 10000, fund_balance_sheet: { ...createEmptyFundBalanceSheet(10000, '2024-01-05'), position_lots: [{ id: 'opt1', kind: 'option', type: 'call', underlying: 'NVDA', strike: 10, expiration: '2024-01-05', qty: 1, contract_multiplier: 100, entry_price: 5, entry_date: '2024-01-01', short: false, origin_campaign: 'r1', thesis_id: null }] } } as any;
    const cashBefore = state.fund_balance_sheet!.cash;
    const logs = settle_option_expiries(state, '2024-01-05');
    expect(logs).toBeDefined();
    expect(state.fund_balance_sheet!.position_lots.length).toBe(0);
    
    const logMatch = logs.find(l => l.includes('EXERCISED'));
    expect(logMatch).toBeDefined();
    const intrinsicMatch = logMatch!.match(/intrinsic \$([0-9.]+)/);
    const payoutMatch = logMatch!.match(/Payout: \$([0-9.]+)/);
    
    expect(intrinsicMatch).not.toBeNull();
    expect(payoutMatch).not.toBeNull();
    
    const intrinsicStr = intrinsicMatch![1];
    const payoutStr = payoutMatch![1];
    const expectedPayout = parseFloat(intrinsicStr) * 1 * 100;
    expect(parseFloat(payoutStr)).toBeCloseTo(expectedPayout, 2);
    expect(state.fund_balance_sheet!.cash - cashBefore).toBeCloseTo(expectedPayout, 2);
  });
});

describe('Settlement Pipeline - Accruals and Flows', () => {
  it('should accrue interest and management fee', () => {
    const state: GameState = { created_at: '2024-01-01', fund_stats: { cash: 10000, uninvested_cash: 10000, real_pnl: 0, initial_cash: 10000 }, cash: 10000, fund_balance_sheet: { ...createEmptyFundBalanceSheet(10000, '2024-01-01'), margin_debt: 5000, accrued_margin_interest: 0, accrued_borrow_fee: 0 } } as any;
    const bs = state.fund_balance_sheet!;
    bs.nav = 10000;
    settle_daily_accruals(state, '2024-01-02');
    expect(bs.accrued_margin_interest).toBeGreaterThan(0);
    expect(bs.cash).not.toBe(10000);
    expect(bs.cash - 10000).toBeCloseTo(bs.realized_pnl, 5);
  });

  it('should handle LP flows', () => {
    const state: GameState = { created_at: '2024-01-01', fund_stats: { cash: 10000, uninvested_cash: 10000, real_pnl: 0, initial_cash: 10000 }, cash: 10000, fund_balance_sheet: createEmptyFundBalanceSheet(10000, '2024-01-01'), pending_lp_flows: [{ date: '2024-01-02', amount: 5000 }] } as any;
    settle_lp_flows(state, '2024-01-02');
    expect(state.fund_balance_sheet!.cash).toBe(15000);
    expect((state as any).pending_lp_flows.length).toBe(0);
  });

  it('should check carry data coverage for valid and invalid dates', () => {
    // 2024-01-02 is a trading day, should be true
    expect(check_carry_data_coverage('NVDA', '2024-01-02')).toBe(true);
    // UNKNOWN is false
    expect(check_carry_data_coverage('UNKNOWN_TICKER', '2024-01-02')).toBe(false);
  });
});
