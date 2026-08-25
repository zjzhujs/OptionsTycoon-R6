import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TradeReview360Modal, formatDecisionContextValue } from '../components/TradeReview360Modal';
import {
  CONTEXT_SNAPSHOT_TERMS,
  MATRIX_HEADER_TERMS,
  formatContextSnapshotField,
  formatMatrixHeader,
} from '../lib/financialLanguage';
import type { TradeReview } from '../types';

describe('TradeReview360Modal Bilingual Regression Tests', () => {
  const mockReview: TradeReview = {
    trade_id: 'tr_bilingual_test',
    contract_or_symbol: 'NVDA CALL 140',
    kind: 'BUY_CALL',
    side: 'BUY_TO_OPEN',
    entry_date: '2025-01-23',
    exit_date: '2025-01-28',
    entry_price: 3.5,
    exit_price: 6.8,
    qty: 2,
    realized_pl: 660,
    return_pct: 94.3,
    attribution: {
      delta: 450,
      gamma: 120,
      theta: -90,
      vega: 180,
      residual: 0,
      net: 660,
    },
    entry_snapshot: {
      snapshot_id: 'snap_entry_1',
      timestamp: '2025-01-23',
      game_date: '2025-01-23',
      ticker: 'NVDA',
      fundamental_context: {
        price: 138.5,
        vix: 18.2,
      },
      street_consensus_context: {
        consensus: 'STRONG_BUY',
      },
      counterparty_context: {
        dominant_participant: 'RETAIL_FRENZY',
      },
      flow_context: {
        put_call_ratio: 0.65,
        volume_shock_detected: false,
      },
      positioning_context: {
        crowdedness_score: 82,
      },
      retail_sentiment_context: {
        fear_greed_index: 74,
      },
      institutional_relationship_context: {
        relationship_tier: 'TIER_1_BULGE_BRACKET',
      },
      player_thesis: {
        direction: 'BULLISH',
        catalyst: 'Earnings beat expectation',
      },
    } as any,
    exit_snapshot: {
      snapshot_id: 'snap_exit_1',
      timestamp: '2025-01-28',
      game_date: '2025-01-28',
      ticker: 'NVDA',
      exit_price: 145.2,
      pnl_realized: 660.0,
      reason_for_exit: 'TARGET_REACHED_OR_STOP_LOSS',
      flow_context: {
        put_call_ratio: 1.15,
        volume_shock_detected: true,
      },
      retail_sentiment_context: {
        fear_greed_index: 45,
      },
    } as any,
    who_was_right: [],
    driver_rankings: [],
    what_if: [],
    review_sections: {},
    decision_context_matrix: [
      {
        factor: 'Implied Volatility',
        entry: 42.5,
        exit: 36.1,
        change: true,
        impact: 'PRIMARY',
        source: 'REAL',
        confidence: 'HIGH',
      },
      {
        factor: 'Street Consensus',
        entry: 'BULLISH',
        exit: 'NEUTRAL',
        change: true,
        impact: 'SECONDARY',
        source: 'DERIVED_MODEL',
        confidence: 'MEDIUM',
      },
    ],
    thesis_evolution: [],
    decision_timeline: [],
    transmission_graph: [],
    process_score: {
      thesis_quality: 90,
      timing_score: 85,
      instrument_selection: 90,
      risk_management: 85,
      execution_discipline: 90,
      overall_process_score: 88,
      feedback: '良好',
      pnl_independence_note: '完全独立',
    },
    lesson: 'Test lesson for 360 bilingual regression.',
  };

  it('renders bilingual table headers in Decision Context Matrix', () => {
    const { container } = render(
      <TradeReview360Modal review={mockReview} onClose={vi.fn()} />
    );

    // Verify all 7 matrix table headers are rendered with canonical bilingual text
    expect(screen.getByText('因子（FACTOR）')).toBeInTheDocument();
    expect(screen.getByText('入场时（ENTRY）')).toBeInTheDocument();
    expect(screen.getByText('离场时（EXIT）')).toBeInTheDocument();
    expect(screen.getByText('是否变化（CHANGED）')).toBeInTheDocument();
    expect(screen.getByText('影响（IMPACT）')).toBeInTheDocument();
    expect(screen.getByText('数据来源（SOURCE）')).toBeInTheDocument();
    expect(screen.getByText('置信度（CONFIDENCE）')).toBeInTheDocument();

    // Verify table structure
    const ths = container.querySelectorAll('.tr360-matrix th');
    expect(ths.length).toBe(7);
    expect(ths[0].textContent).toBe('因子（FACTOR）');
    expect(ths[1].textContent).toBe('入场时（ENTRY）');
    expect(ths[2].textContent).toBe('离场时（EXIT）');
    expect(ths[3].textContent).toBe('是否变化（CHANGED）');
    expect(ths[4].textContent).toBe('影响（IMPACT）');
    expect(ths[5].textContent).toBe('数据来源（SOURCE）');
    expect(ths[6].textContent).toBe('置信度（CONFIDENCE）');
  });

  it('renders bilingual labels for Entry & Exit Context Snapshots', () => {
    const { container } = render(
      <TradeReview360Modal review={mockReview} onClose={vi.fn()} />
    );

    // Entry Context Snapshot fields
    expect(container.textContent).toContain('标的价格（STOCK PRICE）:');
    expect(container.textContent).toContain('市场一致预期（STREET CONSENSUS）:');
    expect(container.textContent).toContain('对手方类型（COUNTERPARTY）:');
    expect(container.textContent).toContain('期权流 Put/Call 比（FLOW PCR）:');
    expect(container.textContent).toContain('拥挤度（CROWDEDNESS）:');
    expect(container.textContent).toContain('散户情绪（RETAIL FEAR/GREED）:');
    expect(container.textContent).toContain('做市商层级（BANK TIER）:');

    // Exit Context Snapshot fields
    expect(container.textContent).toContain('离场价格（EXIT PRICE）:');
    expect(container.textContent).toContain('成交量异动（VOLUME SHOCK）:');
  });

  it('canonical financialLanguage dictionary mappings are complete and correct', () => {
    expect(CONTEXT_SNAPSHOT_TERMS.STOCK_PRICE.display).toBe('标的价格（STOCK PRICE）');
    expect(CONTEXT_SNAPSHOT_TERMS.STREET_CONSENSUS.display).toBe('市场一致预期（STREET CONSENSUS）');
    expect(CONTEXT_SNAPSHOT_TERMS.COUNTERPARTY.display).toBe('对手方类型（COUNTERPARTY）');
    expect(CONTEXT_SNAPSHOT_TERMS.FLOW_PCR.display).toBe('期权流 Put/Call 比（FLOW PCR）');
    expect(CONTEXT_SNAPSHOT_TERMS.CROWDEDNESS.display).toBe('拥挤度（CROWDEDNESS）');
    expect(CONTEXT_SNAPSHOT_TERMS.RETAIL_FEAR_GREED.display).toBe('散户情绪（RETAIL FEAR/GREED）');
    expect(CONTEXT_SNAPSHOT_TERMS.BANK_TIER.display).toBe('做市商层级（BANK TIER）');
    expect(CONTEXT_SNAPSHOT_TERMS.VOLUME_SHOCK.display).toBe('成交量异动（VOLUME SHOCK）');
    expect(CONTEXT_SNAPSHOT_TERMS.EXIT_PRICE.display).toBe('离场价格（EXIT PRICE）');

    expect(MATRIX_HEADER_TERMS.FACTOR.display).toBe('因子（FACTOR）');
    expect(MATRIX_HEADER_TERMS.ENTRY.display).toBe('入场时（ENTRY）');
    expect(MATRIX_HEADER_TERMS.EXIT.display).toBe('离场时（EXIT）');
    expect(MATRIX_HEADER_TERMS.CHANGED.display).toBe('是否变化（CHANGED）');
    expect(MATRIX_HEADER_TERMS.IMPACT.display).toBe('影响（IMPACT）');
    expect(MATRIX_HEADER_TERMS.SOURCE.display).toBe('数据来源（SOURCE）');
    expect(MATRIX_HEADER_TERMS.CONFIDENCE.display).toBe('置信度（CONFIDENCE）');

    // Helper functions test
    expect(formatContextSnapshotField('stock_price')).toBe('标的价格（STOCK PRICE）');
    expect(formatContextSnapshotField('Flow PCR')).toBe('期权流 Put/Call 比（FLOW PCR）');
    expect(formatMatrixHeader('factor')).toBe('因子（FACTOR）');
    expect(formatMatrixHeader('Confidence')).toBe('置信度（CONFIDENCE）');
  });

  it('summarises context objects without leaking JSON', () => {
    const macro = formatDecisionContextValue({ ust_10y: 4.55, vix: 18.5, ignored: 'debug' });
    expect(macro).toContain('10年期美债 4.55%');
    expect(macro).toContain('VIX 18.50');
    expect(macro).not.toContain('{');
    expect(formatDecisionContextValue({ nested: { raw: true } })).toBe('见对应面板');
  });
});
