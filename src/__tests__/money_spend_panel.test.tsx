import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoneySpendPanel } from '../components/MoneySpendPanel';
import type { EconomyState, IntelState } from '../types';

const economy = (managementCash: number): EconomyState => ({
  management_cash: managementCash,
  gp_cash: 6_000,
  high_water_mark: 50_000,
  accrued_mgmt_fee: 0,
  accrued_perf_fee: 0,
  monthly_burn: 0,
  last_month_settled: null,
  settled_ids: [],
  transfer_ledger: [],
  settlement_ledger: [],
});

const intel: IntelState = {
  tier: 'OFF', shadow_enabled: false, info_network: 0, target: 0,
  paid_through_month: null, effective_after_node: 0, source_history: [], active_leads: [],
  misinfo_seed: 1, delinquent_nodes: 0, network_cold: false, cold_start_until_node: 0,
  status: 'OFF', generated_gray_event_ids: [],
};

describe('MoneySpendPanel', () => {
  it('shows three wallets and every five-element decision field', () => {
    render(<MoneySpendPanel fundNav={50_000} economy={economy(12_000)} intel={intel} onSubscribeIntel={vi.fn()} />);
    expect(screen.getByLabelText('Three isolated wallets').children).toHaveLength(3);
    for (const label of ['SOURCE', 'NOW', 'RECURRING', 'RISK / MNPI', 'AUDIT TRAIL']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('disables unaffordable tiers with no click side effect', () => {
    const onSubscribeIntel = vi.fn();
    render(<MoneySpendPanel fundNav={50_000} economy={economy(100)} intel={intel} onSubscribeIntel={onSubscribeIntel} />);
    const disabled = screen.getAllByRole('button', { name: 'INSUFFICIENT' });
    expect(disabled.length).toBeGreaterThan(0);
    fireEvent.click(disabled[0]);
    expect(onSubscribeIntel).not.toHaveBeenCalled();
  });
});
