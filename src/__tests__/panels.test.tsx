import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { GreeksPanel } from '../components/GreeksPanel';
import { FundStatsPanel } from '../components/FundStatsPanel';
import { MacroDashboardPanel } from '../components/MacroDashboardPanel';
import { GexAnalyticsPanel } from '../components/GexAnalyticsPanel';
import { PositionsAttributionPanel } from '../components/PositionsAttributionPanel';
import { RelationshipsPanel } from '../components/RelationshipsPanel';
import { ScannerPanel } from '../components/ScannerPanel';
import { MacroWatchlistPanel } from '../components/MacroWatchlistPanel';
import { OptionsDataSourcePanel } from '../components/OptionsDataSourcePanel';
import { WallStreetDeskPanel } from '../components/WallStreetDeskPanel';
import { PolicyDeskPanel } from '../components/PolicyDeskPanel';
import { MarketPulsePanel } from '../components/MarketPulsePanel';
import { TradeReview360Modal } from '../components/TradeReview360Modal';
import { WhatMattersTodayPanel } from '../components/WhatMattersTodayPanel';
import { InteractiveTutorialModal } from '../components/InteractiveTutorialModal';
import type {
  OptionQuote,
  FundStats,
  MacroSnapshot,
  GexSummary,
  ScannerResult,
  WallStreetDesk,
  PolicyEvent,
  PoliticalContact,
  PoliticalState,
  RetailSentiment,
  MarketPulse,
  TradeReview,
} from '../types';

describe('GreeksPanel', () => {
  const mockQuote: OptionQuote = {
    contract_key: 'NVDA-20250131-C-130',
    underlying: 'NVDA',
    type: 'call',
    strike: 130,
    expiration: '2025-01-31',
    bid: 4.5,
    ask: 4.8,
    mid: 4.65,
    iv: 0.42,
    greeks: {
      delta: 0.45,
      gamma: 0.032,
      theta: -12.5,
      vega: 24.8,
    },
    provenance: {
      source_type: 'ESTIMATED',
      source_name: 'Model quote',
    },
  };

  it('renders greeks metrics correctly', () => {
    render(<GreeksPanel quote={mockQuote} ivLabel="42.0% 教学平值代理" />);
    expect(screen.getByText(/当前合约 Greeks/i)).toBeInTheDocument();
    expect(screen.getAllByText(/0.450/i).length).toBeGreaterThanOrEqual(1); // BipolarArcGauge 合法复示该值
  });

  it('renders dashes when quote is null', () => {
    render(<GreeksPanel quote={null} ivLabel="" />);
    expect(screen.getByText(/当前合约 Greeks/i)).toBeInTheDocument();
  });
});

describe('FundStatsPanel', () => {
  const mockStats: FundStats = {
    aum: 125000,
    nav: 1.25,
    high_water_mark: 130000,
    sharpe_ratio: 1.85,
    win_rate: 0.65,
    cash: 50000,
    reputation: 80,
    compliance_risk: 30,
  };

  it('renders fund overview metrics and soft stats', () => {
    render(<FundStatsPanel stats={mockStats} />);
    expect(screen.getByText(/基金状态/i)).toBeInTheDocument();
    expect(screen.getByText(/声誉/i)).toBeInTheDocument();
    expect(screen.getByText(/合规风险/i)).toBeInTheDocument();
  });
});

describe('MacroDashboardPanel', () => {
  const mockMacro: MacroSnapshot = {
    date: '2025-01-23',
    fed_funds: 4.5,
    sofr: 4.55,
    ust_2y: 4.25,
    ust_10y: 4.55,
    curve_2s10s: 0.3,
    usdjpy: 154.5,
    vix: 18.5,
    yield_curve: [
      { tenor: '2Y', yield_pct: 4.25 },
      { tenor: '10Y', yield_pct: 4.55 },
    ],
    provenance: {
      source_type: 'REAL_PRIMARY',
      source_name: 'FRED',
    },
  };

  it('renders yields and macro gauges', () => {
    render(<MacroDashboardPanel macro={mockMacro} />);
    expect(screen.getByText(/全球宏观与美债收益率/i)).toBeInTheDocument();
    expect(screen.getByText(/154.50/i)).toBeInTheDocument();
  });

  it('renders empty macro state when null', () => {
    render(<MacroDashboardPanel macro={null} />);
    expect(screen.getByText(/宏观数据加载中/i)).toBeInTheDocument();
  });
});

describe('GexAnalyticsPanel', () => {
  const mockGex: GexSummary = {
    as_of_date: '2025-01-23',
    spot: 130.0,
    gamma_concentration_wall: 140.0,
    call_wall_raw_gamma: 140.0,
    put_wall_raw_gamma: 110.0,
    points: [
      { strike: 110, raw_gamma_1pct_usd: 500, call_raw_gamma: 100, put_raw_gamma: 400, heuristic_gex_1pct_usd: -500, total_oi: 5000 },
      { strike: 140, raw_gamma_1pct_usd: 800, call_raw_gamma: 600, put_raw_gamma: 200, heuristic_gex_1pct_usd: 800, total_oi: 8000 },
    ],
    warning: '做市商负 Gamma 区域',
    provenance: {
      source_type: 'DERIVED_REAL_INPUTS',
      source_name: 'Derived GEX profile',
    },
  };

  it('renders gamma wall strikes and summary card', () => {
    render(<GexAnalyticsPanel gexSummary={mockGex} />);
    expect(screen.getByText(/Gamma Wall & GEX 分析/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$140/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when gexSummary is null', () => {
    render(<GexAnalyticsPanel gexSummary={null} />);
    expect(screen.getByText(/暂无 GEX 数据/i)).toBeInTheDocument();
  });
});

describe('ScannerPanel', () => {
  const mockScanner: ScannerResult = {
    date: '2025-01-23',
    rows: [
      {
        ticker: 'NVDA',
        name: 'NVIDIA Corp',
        asset_type: 'EQUITY',
        game_role: 'PRIMARY_BATTLEGROUND',
        price: 130.0,
        daily_change_pct: 2.4,
        volume: 45000000,
        relative_volume: 1.4,
        iv: 45.0,
        iv_rank: 62.0,
        options_volume: 2500000,
        open_interest: 4500000,
        spread_quality: 'TIGHT',
        sector: 'Semiconductors',
        momentum: 'STRONG_BULLISH',
        news_heat: 92.0,
        analyst_conviction: 'OVERWEIGHT',
        macro_sensitivity: 'HIGH',
      },
    ],
    highlighted_tickers: ['NVDA'],
  };

  it('renders scanner rows and ticker cells', () => {
    render(<ScannerPanel scannerResult={mockScanner} onSelectTicker={() => {}} />);
    expect(screen.getByText(/晨间选股/i)).toBeInTheDocument();
    expect(screen.getAllByText(/NVDA/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe('PositionsAttributionPanel', () => {
  it('renders position table and attribution', () => {
    render(
      <PositionsAttributionPanel
        positions={[]}
        marks={{}}
        sharesRow={null}
        underlyingLabel="NVDA"
        attribution={{
          delta: 800,
          theta: -200,
          vega: 400,
          residual: 0,
          net: 1000,
        }}
      />
    );
    expect(screen.getByText(/仓位与损益归因/i)).toBeInTheDocument();
    expect(screen.getByText(/Delta 方向贡献/i)).toBeInTheDocument();
  });
});

describe('RelationshipsPanel', () => {
  it('renders NPC character relationships', () => {
    const mockRels = {
      maya_chen: { trust: 65, rivalry: 10, favor: 50 },
    };
    const mockChars = [
      { id: 'maya_chen', name: 'Maya Chen', role: 'Quant Risk VP', avatar: '/art/characters/maya_chen.jpg', organization: 'Dante Capital', trust: 65, favor: 50, bio: 'Quant VP' },
    ];
    render(<RelationshipsPanel relationships={mockRels as any} characters={mockChars as any} />);
    expect(screen.getByText(/人物关系/i)).toBeInTheDocument();
    expect(screen.getByText(/Maya Chen/i)).toBeInTheDocument();
  });
});

describe('MacroWatchlistPanel', () => {
  it('renders main and secondary prices', () => {
    render(
      <MacroWatchlistPanel
        mainLabel="NVDA"
        mainValue={130.5}
        mainChangeText="+2.4% vs 前一交易日"
        mainChangeClass="green"
        secondaryLabel="USD/JPY"
        secondaryValue={154.2}
        secondaryChangeText="-0.3%"
        secondaryChangeClass="red"
        vix={18.5}
        vixRange="O 18.0 · H 19.2 · L 17.8"
        regimeLabel="中性"
        regimeClass="green"
      />
    );
    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.getByText('$130.50')).toBeInTheDocument();
  });
});

describe('OptionsDataSourcePanel', () => {
  it('renders data truth disclaimer badge and offline ready note', () => {
    render(
      <OptionsDataSourcePanel
        realOptionsLoaded={false}
        loading={false}
        message=""
        disabled={false}
        onLoadReal={() => {}}
      />
    );
    expect(screen.getByText(/数据真实性分层/i)).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE READY/i)).toBeInTheDocument();
    expect(screen.getByText(/无需配置任何外部金融 API/i)).toBeInTheDocument();
  });
});

describe('WallStreetDeskPanel', () => {
  const mockDesks: WallStreetDesk[] = [
    {
      bank_id: 'jpmorgan',
      bank_name: 'JPMorgan Chase & Co.',
      logo: '/art/brands/jpmorgan.png',
      relationship_tier: 'TIER_1_PARTNER',
      trust_score: 80,
      favor_points: 10,
      prime_brokerage_available: true,
      financing_spread_bps: 135.0,
      stock_borrow_fee_pct: 0.35,
      corporate_access_available: true,
      recent_research: [],
      rep_contact_name: 'Daniel Ross',
      rep_contact_title: 'Managing Director, Prime Brokerage',
      simulated_notice: 'SIMULATED INSTITUTIONAL RELATIONSHIP -- NOT AFFILIATED WITH THE REAL INSTITUTION',
      available_ipo_deals: [
        {
          deal_id: 'ipo_cloud',
          company_name: 'CloudScale AI',
          ticker: 'CSAI',
          expected_price_range: [24, 28],
          listing_date: '2025-02-10',
          max_allocation_usd: 50000,
          lockup_days: 90,
          sector: 'Cloud Infrastructure',
        },
      ],
    },
  ];

  it('renders 7 bank desk dossier', () => {
    render(
      <WallStreetDeskPanel
        desks={mockDesks}
        relationships={{ jpmorgan: { trust: 80, favor: 10, financing_spread_bps: 135 } }}
        sessionId="test-session"
        onInteract={async () => {}}
      />
    );
    expect(screen.getByText(/WALL STREET INSTITUTIONAL DESK/i)).toBeInTheDocument();
    expect(screen.getAllByText(/JPMorgan Chase/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/CSAI/i)).toBeInTheDocument();
  });
});

describe('PolicyDeskPanel', () => {
  const mockPol: PoliticalState = {
    political_capital: 60,
    regulatory_heat: 25,
    washington_sentiment: 'NEUTRAL',
    active_policies: [
      {
        id: 'pol_eo_1',
        date: '2025-01-20',
        branch: 'WHITE_HOUSE',
        headline: '白宫供应链行政令',
        body: '审查半导体供应链关税。',
        sector_impact: 'Semis',
        potential_transmission: '关税上升 → IV上涨',
        probability_pct: 100,
        source_type: 'REAL_PRIMARY',
      },
    ],
    contacts: [
      {
        id: 'contact_1',
        name: 'Robert Vance',
        role: 'Senior Adviser',
        organization: 'Brookings',
        avatar: '/art/characters/daniel_ross.jpg',
        access_cost_capital: 10,
        briefing_summary: '白宫经济委员会简报',
        favor_balance: 10,
      },
    ],
  };

  it('renders policies and contact consultation', () => {
    render(<PolicyDeskPanel politicalState={mockPol} sessionId="test" onSpendCapital={async () => 'OK'} />);
    expect(screen.getByText(/华盛顿政策通道/i)).toBeInTheDocument();
    expect(screen.getByText(/白宫供应链行政令/i)).toBeInTheDocument();
  });
});

describe('MarketPulsePanel', () => {
  const mockSent: RetailSentiment = {
    ticker: 'NVDA',
    date: '2025-01-23',
    bullish_pct: 68,
    bearish_pct: 32,
    fear_greed_index: 74,
    euphoria_score: 60,
    capitulation_flag: false,
    attention_heat: 70,
    fomo_velocity: 1.8,
    meme_intensity: 85,
    sentiment_regime: 'EUPHORIA',
    source_type: 'DERIVED_HEURISTIC',
  };

  const mockPulse: MarketPulse = {
    date: '2025-01-23',
    sentiment_regime: 'EUPHORIA',
    posts: [
      {
        id: 'p1',
        timestamp: '10:15 AM',
        author_handle: '@0dte_god_leo',
        author_type: 'FINFLUENCER',
        content: 'NVDA 140 Calls to the moon!',
        engagement_likes: 1240,
        engagement_reposts: 380,
        bias: 'BULLISH',
        credibility: 40,
        bot_probability: 10,
        is_pump: false,
        source_type: 'SIMULATED',
      },
    ],
  };

  it('renders retail sentiment and social feed', () => {
    render(<MarketPulsePanel retailSentiment={mockSent} marketPulse={mockPulse} />);
    expect(screen.getByText(/MARKET PULSE & RETAIL SENTIMENT/i)).toBeInTheDocument();
    expect(screen.getByText(/@0dte_god_leo/i)).toBeInTheDocument();
  });
});

describe('TradeReview360Modal', () => {
  const mockReview: TradeReview = {
    trade_id: 'tr_1',
    contract_or_symbol: 'CALL 140 (2025-01-31)',
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
    who_was_right: [
      {
        participant_id: 'maya_chen',
        participant_name: 'Maya Chen',
        role_or_type: 'Quant VP',
        predicted_stance: '看多 Gamma 爆发',
        predicted_thesis: 'AI Capex 周期扩张',
        outcome_verdict: 'RIGHT',
        explanation: '成功捕捉波动率拉升。',
      },
    ],
    driver_rankings: [
      { rank: 1, factor_name: 'Delta Underlying Move', factor_category: 'FUNDAMENTAL', pnl_impact_pct: 68, explanation: '现货方向性波动主导 Delta 损益。' },
    ],
    transmission_graph: [
      { step_index: 1, trigger: 'AI Capex 上修', intermediary: '云厂商资本开支指引上调', market_reaction: '半导体板块普涨', portfolio_impact: 'Delta PnL 走高' },
    ],
    player_profile_tag: '凸性收割者 (Convexity Hunter)',
    what_if: [
      { scenario_name: 'Buy Stock Instead', alternative_pnl: 280, difference_vs_actual: -380, takeaway: '期权杠杆大幅超越正股' },
    ],
    process_score: {
      thesis_quality: 90,
      timing_score: 85,
      instrument_selection: 92,
      risk_management: 88,
      execution_discipline: 90,
      overall_process_score: 89,
      feedback: '执行力优异',
      pnl_independence_note: '完全基于事前逻辑',
    },
    review_sections: {},
    lesson: 'Test lesson',
  };

  it('renders 360 review modal and greeks attribution', () => {
    render(<TradeReview360Modal review={mockReview} onClose={() => {}} />);
    expect(screen.getByText(/360° TRADE POST-MORTEM/i)).toBeInTheDocument();
    expect(screen.getByText(/凸性收割者/i)).toBeInTheDocument();
  });

  it('renders fund manager verdict and findings in bilingual format', () => {
    const reviewWithVerdict: TradeReview = {
      ...mockReview,
      player_profile_tag: 'CONTRARIAN_VOLATILITY_SPECIALIST',
      fund_manager_verdict: {
        headline: 'WRONG THESIS. WEAK PROCESS.',
        narrative: 'Direction did not hold up and the process score (68/100) reflects real gaps, not just an unlucky outcome.',
        findings: [
          { kind: 'WARNING', text: 'Thesis direction wrong' },
          { kind: 'GOOD', text: 'Instrument selection added value' },
          { kind: 'WARNING', text: 'Entry/exit timing drifted from your own thesis horizon' },
        ],
        ignored_event_count: 0,
      },
      exit_snapshot: {
        snapshot_id: 'snap_exit_1',
        timestamp: '2025-01-28',
        game_date: '2025-01-28',
        ticker: 'NVDA',
        exit_price: 135.0,
        pnl_realized: -250.0,
        reason_for_exit: 'TARGET_REACHED_OR_STOP_LOSS',
      } as any,
    };

    render(<TradeReview360Modal review={reviewWithVerdict} onClose={() => {}} />);
    expect(screen.getByText(/逻辑判断失误，交易过程存在硬伤。/i)).toBeInTheDocument();
    expect(screen.getByText(/WRONG THESIS. WEAK PROCESS./i)).toBeInTheDocument();
    expect(screen.getByText(/68\/100/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === 'LI'
      && element.textContent?.includes('投资逻辑方向错误（Thesis direction wrong）') === true
    ))).toBeInTheDocument();
    expect(screen.getByText(/交易工具选择创造了价值（Instrument selection added value）/i)).toBeInTheDocument();
    expect(screen.getByText(/逆向波动率专家（CONTRARIAN VOLATILITY SPECIALIST）/i)).toBeInTheDocument();
    expect(screen.getByText(/达到目标价或触发止损（TARGET REACHED OR STOP LOSS）/i)).toBeInTheDocument();
  });
});

describe('WhatMattersTodayPanel', () => {
  it('renders items with proper bilingual provenance tags and no text gluing', () => {
    const mockItems = [
      {
        id: 'wmt_1',
        headline: 'AI 算力资本开支指引上调',
        impact: 'HIGH' as const,
        affected: 'Semiconductors, Hardware, Auto Tech',
        why_it_matters: '各大云厂商资本开支提升，提振产业链情绪。',
        source_panel: 'MACRO',
        source_type: 'REAL_PRIMARY' as any,
        confidence: 'HIGH',
      },
      {
        id: 'wmt_2',
        headline: 'NVDA 期权盘口巨量异动',
        impact: 'MEDIUM' as const,
        affected: 'NVDA',
        why_it_matters: '大单深度做多 140 Call。',
        source_panel: 'FLOW',
        source_type: 'SIMULATED' as any,
        confidence: 'MEDIUM',
      },
    ];

    const { container } = render(<WhatMattersTodayPanel items={mockItems} />);
    // 标题原来是「今日最值得关注（WHAT MATTERS TODAY）」一个文本节点。
    // 2026-08-19 的视觉重构把英文拆进 `.en-secondary`（顺带去掉括号），
    // 这是全项目既有写法（ThemeStudio 的「外观 APPEARANCE」同款），不是退化。
    // 这条测试要保护的东西没变——**中英文都在、且分成两段不粘连**——
    // 所以断言改成按结构查，而不是按那一串带括号的字面量查。
    const title = container.querySelector('.wmt-title');
    expect(title?.textContent).toMatch(/今日最值得关注/);
    expect(title?.querySelector('.en-secondary')?.textContent).toMatch(/WHAT MATTERS TODAY/i);
    expect(screen.getByText(/真实原始数据（REAL PRIMARY）/i)).toBeInTheDocument();
    expect(screen.getByText(/模拟数据（SIMULATED）/i)).toBeInTheDocument();
    expect(screen.getByText(/影响标的: Semiconductors, Hardware, Auto Tech/i)).toBeInTheDocument();
    expect(screen.getByText(/影响标的: NVDA/i)).toBeInTheDocument();
  });
});

describe('InteractiveTutorialModal', () => {
  it('renders tutorial masterclass and steps', () => {
    render(<InteractiveTutorialModal onClose={() => {}} />);
    expect(screen.getByText(/OPTIONS TYCOON INSTITUTIONAL MASTERCLASS/i)).toBeInTheDocument();
    expect(screen.getByText(/期权衍生品底层结构/i)).toBeInTheDocument();
  });
});

import { CurrentObjectiveBanner } from '../components/CurrentObjectiveBanner';
import { StoryDialogueModal } from '../components/StoryDialogueModal';
import { Tooltip } from '../components/Tooltip';
import type { GameStateView, StoryEventPublic, Character } from '../types';

describe('CurrentObjectiveBanner', () => {
  const mockView: GameStateView = {
    equity: 1000000,
    unrealized_pnl: 0,
    position_marks: [],
    pending_story_public: [],
    account_rule_text: '',
    margin_requirement: 0,
    margin_buying_power: 1000000,
    margin_call_active: false,
    market_clock: {
      paused: true,
      node_granularity: 'DAILY_NODE',
      current_node_index: 0,
      current_node_date: '2025-01-20',
      total_nodes: 5,
      is_final_node: false,
      nodes_advanced_last_call: 0,
      pause_reasons: [],
      advance_label: 'ADVANCE MARKET',
      next_node_label: '2025-01-21',
    },
    state: {
      session_id: 'test-session',
      campaign_id: 'c1',
      mode: 'STORY_CAMPAIGN',
      game_day_index: 0,
      cash: 1000000,
      start_cash: 1000000,
      story_seed: 42,
      positions: [],
      orders: [],
      pending_story_events: [],
      trade_reviews: [],
      human_action_feed: [],
      management_company: {
        company_id: 'mc1',
        name: 'Dante Capital',
        gp_cash: 100000,
        firm_reputation: 80,
        management_fee_rate: 0.02,
        performance_fee_rate: 0.2,
        high_water_mark: 1000000,
        total_mgmt_fees_collected: 0,
        total_perf_fees_collected: 0,
        unlocked_perks: [],
        inventory_items: [],
      },
    } as any,
  };

  it('renders Day 1 opening objective when no positions are open', () => {
    render(
      <CurrentObjectiveBanner
        view={mockView}
        onNavigateAction={() => {}}
        showFundHQ={true}
        onboardingActive={false}
        onboardingStep={0}
        hasOpenPosition={false}
        hasTradeReviews={false}
        dayIndex={0}
      />
    );
    expect(screen.getByText(/研判标的走势/i)).toBeInTheDocument();
    expect(screen.getByText(/进入交易大厅/i)).toBeInTheDocument();
  });

  it('renders position management objective when position is open', () => {
    render(
      <CurrentObjectiveBanner
        view={mockView}
        onNavigateAction={() => {}}
        showFundHQ={false}
        onboardingActive={false}
        onboardingStep={0}
        hasOpenPosition={true}
        hasTradeReviews={false}
        dayIndex={0}
      />
    );
    expect(screen.getByText(/开仓订单已执行/i)).toBeInTheDocument();
    expect(screen.getAllByText(/推进市场/i).length).toBeGreaterThanOrEqual(1);
  });
});

describe('StoryDialogueModal', () => {
  const mockEvent: StoryEventPublic = {
    id: 'test_event_1',
    template_id: 'day1_briefing_maya',
    game_date: '2025-01-20',
    character_id: 'maya_chen',
    intel_class: 'PRIVATE_INTEL',
    headline: 'Maya Chen: 英伟达财报前的买方拥挤度',
    body: '早晨，梁慧。我们追踪的北美云厂商资本开支调研显示算力需求坚挺。',
    resolved: false,
    sfx: 'intel_received',
    choices: [
      { id: 'c1', label: '以看涨 Call 为主，捕捉上行凸性' },
      { id: 'c2', label: '以看跌 Put 或价差对冲下行风险' },
    ],
  };

  const mockCharacters: Character[] = [
    {
      id: 'maya_chen',
      name: 'Maya Chen',
      role: '高级科技与半导体分析师',
      organization: 'Dante Capital',
      specialty: '半导体硬件供应链与买方持仓',
      avatar: '/art/characters/maya_chen.jpg',
      bio: '前高盛半导体研究员。',
      trust: 50,
      favor: 50,
    },
  ];

  it('renders character dialogue, portrait and choices', () => {
    const handleChoice = vi.fn();
    render(
      <StoryDialogueModal
        event={mockEvent}
        characters={mockCharacters}
        queueLength={1}
        queueIndex={1}
        isOpen={true}
        onChoice={handleChoice}
      />
    );

    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
    expect(screen.getByText(/高级科技与半导体分析师/i)).toBeInTheDocument();
    expect(screen.getByText(/英伟达财报前的买方拥挤度/i)).toBeInTheDocument();
    expect(screen.getByText(/以看涨 Call 为主/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/以看涨 Call 为主/i));
    expect(handleChoice).toHaveBeenCalledWith('test_event_1', 'c1');
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <StoryDialogueModal
        event={mockEvent}
        characters={mockCharacters}
        queueLength={1}
        queueIndex={1}
        isOpen={false}
        onChoice={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('lets non-critical stories close from the button, Escape, and backdrop', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StoryDialogueModal
        event={mockEvent}
        characters={mockCharacters}
        isOpen={true}
        onChoice={() => {}}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId('story-close'));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('story-dialogue-modal').firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(
      <StoryDialogueModal
        event={{ ...mockEvent, intel_class: 'POSSIBLE_MNPI' }}
        characters={mockCharacters}
        isOpen={true}
        onChoice={() => {}}
        onClose={onClose}
      />
    );
    expect(screen.queryByTestId('story-close')).not.toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('renders children and displays tooltip bubble on hover', () => {
    render(
      <Tooltip title="测试提示" content="这是提示详情内容">
        <button>悬停测试按钮</button>
      </Tooltip>
    );

    expect(screen.getByText('悬停测试按钮')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText('悬停测试按钮'));
    expect(screen.getByText('测试提示')).toBeInTheDocument();
    expect(screen.getByText('这是提示详情内容')).toBeInTheDocument();
  });
});
