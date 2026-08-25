import type { FundStats } from "../schemas";

export function init_fund_stats(start_cash: number): FundStats {
  return {
    cash: start_cash,
    nav: start_cash,
    aum: start_cash,
    reputation: 50.0,
    lp_confidence: 50.0,
    information_network: 30.0,
    compliance_risk: 0.0,
    political_capital: 20.0,
    counterparty_trust: 60.0,
    staff_morale: 70.0,
  };
}

export function sync_nav(fund_stats: FundStats, equity: number): FundStats {
  fund_stats.nav = equity;
  return fund_stats;
}

export function clamp_stat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

