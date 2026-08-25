import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CapitalPowerPanel } from '../components/CapitalPowerPanel';
import { WarRoomModal } from '../components/WarRoomModal';
import { FirstTradeReviewModal } from '../components/FirstTradeReviewModal';
import { formatProvenance } from '../lib/financialLanguage';
import type { GameStateView, WarRoomMeeting, TradeReview } from '../types';

describe('Bilingual Micro-Patch Regression Tests', () => {
  it('CapitalPowerPanel renders bilingual enumerations instead of raw enums', () => {
    const { container } = render(
      <CapitalPowerPanel
        managementCompany={{ cash: 100000, monthly_burn: 5000, fee_income_ytd: 10000, performance_income_ytd: 0, runway_months: 20 } as any}
        gpWealth={{ cash: 10000 } as any}
        employees={[
          { id: '1', role: 'RESEARCH_ASSOCIATE', name: 'Bob', salary_annual: 80000, morale: 80, loyalty: 70, skill: 60, poaching_risk: 10 } as any
        ]}
        dataSubscriptions={[{ id: 'options_flow_premium', active: true } as any]}
        aiStack={{ level: 'LEVEL_2_MULTI_AGENT', monthly_compute_cost: 1000, hallucination_risk: 10, model_risk_note: '' } as any}
        evidenceState={{ investigation_stage: 'REGULATORY_INQUIRY', evidence_points: 0, witness_count: 0, internal_awareness: 0, external_awareness: 0, simulated_notice: '' } as any}
        onHire={vi.fn()}
        onFire={vi.fn()}
        onBonus={vi.fn()}
        onSubscribeData={vi.fn()}
        onCancelData={vi.fn()}
        onUpgradeAI={vi.fn()}
        onInjectGp={vi.fn()}
        onDistributeGp={vi.fn()}
      />
    );
    expect(screen.getByText('监管问询（REGULATORY INQUIRY）')).toBeInTheDocument();
    
    // Switch to DATA tab
    const dataTab = screen.getByText('DATA 数据');
    fireEvent.click(dataTab);
    expect(container.textContent).toContain('期权交易流（OPTIONS FLOW）');

    // Switch to AI tab
    const aiTab = screen.getByText('AI 研究体系');
    fireEvent.click(aiTab);
    expect(container.textContent).toContain('多智能体投研台（LEVEL 2 · MULTI-AGENT）');

    // Switch to TEAM tab
    const teamTab = screen.getByText('TEAM 团队');
    fireEvent.click(teamTab);
    expect(container.textContent).toContain('士气（MORALE）');
  });

  it('WarRoomModal renders bilingual emotions instead of raw enums', () => {
    const meeting: WarRoomMeeting = {
      date: '2025-01-23',
      topic: 'Topic',
      agenda: 'Agenda',
      messages: [
        {
          character_id: 'maya_chen',
          character_name: 'Maya Chen',
          role: 'Tech & Semi Lead',
          portrait: '/art/characters/maya_chen.jpg',
          stance: 'BULLISH',
          message: 'Hello',
          evidence: 'World',
        }
      ],
      player_decision_prompt: 'Prompt',
      choices: []
    };
    
    const gameView = {
      state: {
        positions: [{ unrealized_pnl: -4000 }],
        cash: 100000
      },
      equity: 100000
    } as unknown as GameStateView;

    render(<WarRoomModal isOpen={true} meeting={meeting} onClose={vi.fn()} gameView={gameView} />);
    expect(screen.getByText('承压（PRESSURE）')).toBeInTheDocument();
  });

  it('FirstTradeReviewModal uses formatProvenance correctly', () => {
    const review: TradeReview = {
      contract_or_symbol: 'TEST',
      entry_date: '2025',
      exit_date: '2025',
      realized_pl: 100,
      entry_snapshot: { fundamental_context: { price: 100 } },
      event_impact: { event_name: 'Event', underlying_move: 10 },
      entry_price: 1,
      exit_price: 2,
      qty: 100,
      return_pct: 100,
      mfe_usd: 200,
      mae_usd: -50,
      process_score: 90,
      entry_thesis: { direction: 'UP' }
    } as unknown as TradeReview;

    render(<FirstTradeReviewModal review={review} isOpen={true} onClose={vi.fn()} onOpenFull360={vi.fn()} />);
    
    expect(screen.getByText('真实（REAL）')).toBeInTheDocument();
    expect(screen.getAllByText('模型推导（DERIVED MODEL）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('估算（ESTIMATED）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('启发式推导（DERIVED HEURISTIC）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('暂无可靠数据（DATA UNAVAILABLE）').length).toBeGreaterThan(0);
    expect(screen.getAllByText('玩家输入（PLAYER INPUT）').length).toBeGreaterThan(0);
    
    // Directly test SIMULATED mapping since it might not be rendered by default in FirstTradeReviewModal's fallback data
    expect(formatProvenance('SIMULATED')).toBe('模拟数据（SIMULATED）');
    expect(formatProvenance('DERIVED_HEURISTIC')).toBe('启发式推导（DERIVED HEURISTIC）');
  });
});
