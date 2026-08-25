import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { MarketStructureBrief } from '../components/MarketStructureBrief';
import type { FlowSummary, PositioningSummary, CounterpartyProfile } from '../types';

const flow: FlowSummary = {
  ticker: 'NVDA',
  date: '2025-01-23',
  call_volume: 1_300_000,
  put_volume: 800_000,
  put_call_ratio: 0.62,
  open_interest_change: 315_000,
  large_sweep_count: 12,
  relative_options_vol: 1.4,
  volume_shock_detected: false,
  block_trade_activity: 'MODERATE',
  etf_flow_estimate_usd: 0,
  etf_flow_source_type: 'DERIVED_HEURISTIC',
  put_call_ratio_source_type: 'DERIVED_HEURISTIC',
  relative_options_vol_source_type: 'DERIVED_HEURISTIC',
  large_sweep_count_source_type: 'SIMULATED',
  volume_shock_source_type: 'SIMULATED',
  source_type: 'DERIVED_HEURISTIC',
};

const positioning: PositioningSummary = {
  ticker: 'NVDA',
  crowdedness_score: 65,
  trapped_long_risk: 'LOW',
  trapped_short_risk: 'MODERATE',
  short_interest_pct: 3.2,
  cta_exposure_regime: 'BUYING',
  pain_trade_direction: 'UPWARD_TREND',
  regime_label: 'NORMAL_EXPANSION',
  crowdedness_source_type: 'SIMULATED',
  trapped_risk_source_type: 'SIMULATED',
  source_type: 'SIMULATED',
};

const counterparty: CounterpartyProfile = {
  ticker: 'NVDA',
  dominant_participant: 'MARKET_MAKER',
  potential_participants: ['HEDGE_FUND'],
  dealer_inventory_bias: 'BALANCED',
  estimated_retail_share_pct: 18,
  estimated_institutional_share_pct: 82,
  flow_predominance: 'BID_BUYING',
  dealer_inventory_bias_source_type: 'DERIVED_HEURISTIC',
  dealer_inventory_signed_source_type: 'DATA_UNAVAILABLE',
  dealer_inventory_note: '由波动率区间推导的代理指标，不是做市商实际库存。',
  participant_share_source_type: 'SIMULATED',
  source_type: 'DERIVED_HEURISTIC',
};

describe('MarketStructureBrief provenance honesty', () => {
  it('labels each field with its own source rather than one blanket footer', () => {
    const { container } = render(
      <MarketStructureBrief flow={flow} positioning={positioning} counterparty={counterparty} />
    );
    const tags = container.querySelectorAll('.msb-src');
    // Five metrics + the explicit DATA_UNAVAILABLE row.
    expect(tags.length).toBeGreaterThanOrEqual(5);

    const texts = Array.from(tags).map((t) => t.textContent);
    expect(texts).toContain('模拟数据（SIMULATED）');
    expect(texts).toContain('启发式推导（DERIVED HEURISTIC）');
    expect(texts).toContain('暂无可靠数据（DATA UNAVAILABLE）');
  });

  it('does not claim retail attribution for a chain-wide put/call ratio', () => {
    render(
      <MarketStructureBrief flow={flow} positioning={positioning} counterparty={counterparty} />
    );
    expect(screen.queryByText(/Retail Call Demand/i)).toBeNull();
    expect(screen.getByText(/Put \/ Call Ratio/i)).toBeTruthy();
  });

  it('does not present the VIX-derived proxy as an observed dealer position', () => {
    render(
      <MarketStructureBrief flow={flow} positioning={positioning} counterparty={counterparty} />
    );
    // The proxy must be named as a proxy...
    expect(screen.getByText(/Dealer Gamma Proxy/i)).toBeTruthy();
    // ...and the real quantity must be shown as explicitly absent.
    expect(screen.getByText(/Signed Dealer Inventory/i)).toBeTruthy();
  });

  it('falls back to DATA_UNAVAILABLE, never to a rosier tag, when a field source is missing', () => {
    const bareFlow = { ...flow } as any;
    delete bareFlow.put_call_ratio_source_type;
    delete bareFlow.relative_options_vol_source_type;
    const barePos = { ...positioning } as any;
    delete barePos.crowdedness_source_type;
    delete barePos.trapped_risk_source_type;

    const { container } = render(
      <MarketStructureBrief flow={bareFlow} positioning={barePos} counterparty={counterparty} />
    );
    const texts = Array.from(container.querySelectorAll('.msb-src')).map((t) => t.textContent);
    // The four stripped fields must degrade to the bilingual DATA_UNAVAILABLE tag.
    expect(texts.filter((t) => t === '暂无可靠数据（DATA UNAVAILABLE）').length).toBeGreaterThanOrEqual(4);
  });

  it('uses no intraday or countdown language', () => {
    const { container } = render(
      <MarketStructureBrief flow={flow} positioning={positioning} counterparty={counterparty} />
    );
    const text = container.textContent || '';
    expect(text).not.toMatch(/\+1\s*(Hour|小时)/i);
    expect(text).not.toMatch(/距.*开盘/);
    expect(text).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('uses neutral language and never asserts who traded', () => {
    const { container } = render(
      <MarketStructureBrief flow={flow} positioning={positioning} counterparty={counterparty} />
    );
    const text = container.textContent || '';
    for (const banned of ['大资金', '主力', '必然', '无风险', '稳赚', '散户做不到']) {
      expect(text).not.toContain(banned);
    }
  });

  it('renders safely with no data at all', () => {
    const { container } = render(<MarketStructureBrief />);
    expect(container.querySelector('.msb-container')).toBeTruthy();
  });
});
