import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { MainMenuModal } from '../components/MainMenuModal';
import { TutorialModal } from '../components/TutorialModal';
import { SettingsModal } from '../components/SettingsModal';
import { CreditsModal } from '../components/CreditsModal';
import { TermsModal } from '../components/TermsModal';
import { ThesisModal } from '../components/ThesisModal';
import { TradeReviewModal } from '../components/TradeReviewModal';
import { OrderTicketPanel } from '../components/OrderTicketPanel';
import { WarRoomModal } from '../components/WarRoomModal';
import { api } from '../lib/api';
import type { TradeReview, WarRoomMeeting, FinancialTerm } from '../types';

vi.mock('../lib/api', () => ({
  api: {
    getTerms: vi.fn().mockResolvedValue([
      {
        id: 'delta',
        term_cn: 'Delta / 德尔塔',
        term_en: 'Delta',
        category: 'Greeks',
        short_def: '期权价格对标的资产价格变动的敏感度。',
        detailed_explanation: '衡量标的价格每变动 1 美元，期权理论价格的变动量。',
        analyst_tip: 'ATM 期权 Delta 约在 0.5 左右。',
      },
    ]),
  },
}));

describe('MainMenuModal', () => {
  it('renders title and story campaign button', () => {
    const onStart = vi.fn();
    render(
      <MainMenuModal
        isOpen={true}
        saves={[]}
        onStartNewGame={onStart}
        onLoadGame={vi.fn()}
        onOpenTutorial={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenCredits={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('期权大亨')).toBeInTheDocument();
    expect(screen.getByText(/新基金战役/i)).toBeInTheDocument();

    // A player who has not finished onboarding is offered the guided first day
    // BEFORE the campaign starts, rather than being dropped straight in.
    fireEvent.click(screen.getByText(/新基金战役/i));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText(/FIRST TIME FUND MANAGER/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/START DIRECTLY/i));
    expect(onStart).toHaveBeenCalledWith('STORY_CAMPAIGN', false);
  });

  it('starts the guided first day when the player asks for it', () => {
    const onStart = vi.fn();
    render(
      <MainMenuModal
        isOpen={true}
        saves={[]}
        onStartNewGame={onStart}
        onLoadGame={vi.fn()}
        onOpenTutorial={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenCredits={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/新基金战役/i));
    fireEvent.click(screen.getByText(/GUIDED FIRST DAY/i));
    expect(onStart).toHaveBeenCalledWith('STORY_CAMPAIGN', true);
  });

  it('skips the first-time prompt once onboarding is complete', () => {
    const onStart = vi.fn();
    render(
      <MainMenuModal
        isOpen={true}
        saves={[]}
        tutorialCompleted
        onStartNewGame={onStart}
        onLoadGame={vi.fn()}
        onOpenTutorial={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenCredits={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/新基金战役/i));
    expect(onStart).toHaveBeenCalledWith('STORY_CAMPAIGN');
  });

  it('renders wall street replay and empire mode buttons', () => {
    const onStart = vi.fn();
    render(
      <MainMenuModal
        isOpen={true}
        saves={[]}
        onStartNewGame={onStart}
        onLoadGame={vi.fn()}
        onOpenTutorial={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenCredits={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/WALL STREET REPLAY/i)).toBeInTheDocument();
    expect(screen.getByText(/EMPIRE MODE/i)).toBeInTheDocument();
  });
});

describe('TutorialModal', () => {
  it('renders 4 masterclass lessons and next button', () => {
    render(<TutorialModal isOpen={true} onClose={vi.fn()} onJumpToReplay={vi.fn()} />);
    expect(screen.getByText(/期权大亨实战讲堂/i)).toBeInTheDocument();
    expect(screen.getByText(/第一课/i)).toBeInTheDocument();
    expect(screen.getByText(/下一课/i)).toBeInTheDocument();
  });

  it('navigates through lessons when clicking next', () => {
    render(<TutorialModal isOpen={true} onClose={vi.fn()} onJumpToReplay={vi.fn()} />);
    const nextBtn = screen.getByText(/下一课/i);
    fireEvent.click(nextBtn);
    expect(screen.getByText(/第二课/i)).toBeInTheDocument();
  });
});

describe('SettingsModal', () => {
  it('renders master volume sliders and toggle mute', () => {
    const onUpdate = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        audioLevels={{ master: 0.8, music: 0.5, sfx: 0.9, ambience: 0.6, muted: false }}
        onUpdateAudio={onUpdate}
        accountRuleText="Margin Account Rules"
      />
    );
    expect(screen.getByText(/系统设置/i)).toBeInTheDocument();
    expect(screen.getByText(/主音量/i)).toBeInTheDocument();
  });
});

describe('CreditsModal', () => {
  it('renders institutional architecture credits and licenses', () => {
    render(<CreditsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/制作群与鸣谢/i)).toBeInTheDocument();
    expect(screen.getByText(/游戏设计与系统架构/i)).toBeInTheDocument();
  });
});

describe('TermsModal', () => {
  it('renders financial dictionary search input and categories', () => {
    render(<TermsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/搜索术语/i)).toBeInTheDocument();
    expect(screen.getByText(/期权与金融量化术语词典/i)).toBeInTheDocument();
  });
});

describe('ThesisModal', () => {
  it('renders thesis direction and catalyst selection', () => {
    const onSubmit = vi.fn();
    render(
      <ThesisModal
        isOpen={true}
        contractOrSymbol="NVDA C 130"
        defaultPrice={5.0}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByText(/开仓投资逻辑/i)).toBeInTheDocument();
    expect(screen.getByText(/看涨（BULLISH）/i)).toBeInTheDocument();
  });

  it('renders bilingual core trading buttons in OrderTicketPanel', () => {
    render(
      <OrderTicketPanel
        selectedContractLabel="NVDA C 130"
        qty={1}
        onQtyChange={vi.fn()}
        orderKind="Market"
        onOrderKindChange={vi.fn()}
        limitPrice={null}
        onLimitPriceChange={vi.fn()}
        onBuyToOpen={vi.fn()}
        onSellToClose={vi.fn()}
        onBuyToClose={vi.fn()}
        onWriteCoveredCall={vi.fn()}
        onWriteCashSecuredPut={vi.fn()}
        onBuyShares={vi.fn()}
        onSellShares={vi.fn()}
        shareButtonsDisabled={false}
        writeButtonsDisabled={false}
        shareButtonLabel="NVDA"
        warningText=""
      />
    );
    expect(screen.getByText('BUY TO OPEN')).toBeInTheDocument();
    expect(screen.getByText('SELL TO CLOSE')).toBeInTheDocument();
  });
});

describe('TradeReviewModal', () => {
  const mockReview: TradeReview = {
    trade_id: 't_mock',
    contract_or_symbol: 'NVDA 2025-01-31 C 130',
    kind: 'option',
    side: 'long',
    entry_date: '2025-01-23',
    exit_date: '2025-01-28',
    entry_price: 4.0,
    exit_price: 19.0,
    qty: 10,
    realized_pl: 15000.0,
    return_pct: 150.0,
    mfe_usd: 16000.0,
    mae_usd: -500.0,
    attribution: {
      delta: 12000.0,
      theta: -500.0,
      vega: 1500.0,
      residual: 2000.0,
      net: 15000.0,
      note: 'Test attribution',
    },
    who_was_right: [],
    driver_rankings: [],
    transmission_graph: [],
    process_score: {
      thesis_quality: 90,
      timing_score: 90,
      instrument_selection: 85,
      risk_management: 87,
      execution_discipline: 90,
      overall_process_score: 88.0,
      feedback: 'Excellent execution',
      pnl_independence_note: 'Note',
    },
    what_if: [],
    review_sections: {},
    lesson: 'Test lesson',
  };

  it('renders trade review details and process score', () => {
    render(<TradeReviewModal isOpen={true} review={mockReview} onClose={vi.fn()} />);
    expect(screen.getByText(/平仓交易复盘/i)).toBeInTheDocument();
    expect(screen.getByText(/88.0 \/ 100/i)).toBeInTheDocument();
  });
});

describe('WarRoomModal', () => {
  const mockMeeting: WarRoomMeeting = {
    date: '2025-01-27',
    topic: 'DeepSeek R1 Shockwave',
    agenda: 'Assess semiconductor valuation shock',
    messages: [
      {
        character_id: 'maya_chen',
        character_name: 'Maya Chen',
        role: 'Tech & Semi Lead',
        portrait: '/art/characters/maya_chen.jpg',
        stance: 'BULLISH',
        message: 'AI Capex fundamentals remain strong despite the short term shock.',
        evidence: 'Hyperscaler capex projections remain upward revised.',
      },
    ],
    player_decision_prompt: 'Choose the fund trading posture for today:',
    choices: [
      {
        id: 'c1',
        label: 'Back Maya Chen: Buy Deep Dip Calls',
        thesis_direction: 'BULLISH',
        suggested_instrument: 'NVDA Call',
      },
    ],
  };

  it('renders war room meeting messages', () => {
    render(<WarRoomModal isOpen={true} meeting={mockMeeting} onClose={vi.fn()} onSelectChoice={vi.fn()} />);
    expect(screen.getByText(/盘前投研晨会/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Maya Chen/i).length).toBeGreaterThanOrEqual(1);
  });
});
