import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import * as marketRevealEngine from './engine/engines/market_reveal';
import { SpatialNetworkCanvas } from './components/fx/SpatialNetworkCanvas';
import { Donut, MeterBar, Radar, Sparkline, Waveform } from './components/fx/MiniViz';
import { normalizeGreeksForRadar, describeDirection } from './engine/engines/portfolio_greeks';
import { money, fmt } from './lib/format';
import { audioManager, sfxForIntelClass, type AudioLevels } from './lib/audio';
import { formatProvenance } from './lib/financialLanguage';
type CanonicalContractLike = {
  underlying?: string | null;
  symbol?: string | null;
  type?: string | null;
  option_type?: string | null;
  strike?: number | string | null;
  expiration?: string | null;
};

function canonicalContractKey(input: CanonicalContractLike | null | undefined, fallbackUnderlying = ''): string | null {
  if (!input) return null;
  const underlying = String(input.underlying ?? input.symbol ?? fallbackUnderlying).trim().toUpperCase();
  const optionTypeRaw = String(input.type ?? input.option_type ?? '').trim().toLowerCase();
  const optionType = optionTypeRaw === 'call' || optionTypeRaw === 'put' ? optionTypeRaw : '';
  const strike = Number(input.strike);
  const expiration = String(input.expiration ?? '').trim();
  if (!underlying || !optionType || !Number.isFinite(strike) || !expiration) return null;
  return `${underlying}|${expiration}|${Number(strike).toString()}|${optionType}`;
}

import { buildFundamentalsSnapshot } from './engine/engines/fundamentals';
import { simulateAnalystConsensus } from './engine/engines/analyst_simulation';
import {
  getDailyHistoryPack,
  getSecProfile,
  getSecValuation,
  loadDailyHistory,
} from './engine/daily_history_loader';
import type {
  AccountType,
  AdvanceMode,
  CampaignMeta,
  Character,
  GameMode,
  GameStateView,
  MacroEvent,
  MarketNode,
  OptionQuote,
  OptionType,
  OrderKind,
  OrderRequest,
  Position,
  SaveSlotInfo,
  ThesisRequest,
  TradeReview,
} from './types';

// Existing Panels
import { CampaignSelectorPanel } from './components/CampaignSelectorPanel';
import { MacroWatchlistPanel } from './components/MacroWatchlistPanel';
import { NewsFeedPanel } from './components/NewsFeedPanel';
// Code-split: pulls in the ~190KB (pre-gzip) lightweight-charts library, only needed once the
// player actually reaches the Trading Floor -- must not block Main Menu / Fund HQ first paint.
const PriceChartPanel = lazy(() =>
  import('./components/PriceChartPanel').then((m) => ({ default: m.PriceChartPanel }))
);
import { OptionsChainPanel, type ChainSide } from './components/OptionsChainPanel';
import { OrderTicketPanel } from './components/OrderTicketPanel';
import { MobileFundPulse } from './components/MobileFundPulse';
import { AppIcon } from './components/icons/AppIcons';
import { PositionsAttributionPanel } from './components/PositionsAttributionPanel';
import { GreeksPanel } from './components/GreeksPanel';
import { AIFundsRankingPanel, type AIFundRankingEntry } from './components/AIFundsRankingPanel';
import { FundStatsPanel } from './components/FundStatsPanel';
import { RelationshipsPanel } from './components/RelationshipsPanel';
import { StoryInboxPanel } from './components/StoryInboxPanel';
import { OrderLogPanel } from './components/OrderLogPanel';

// Master Rebuild Panels & Story Modals
import { FundHQPortal } from './components/FundHQPortal';
import { WarRoomModal } from './components/WarRoomModal';
import { WarRoomRail } from './components/WarRoomRail';
import { MarketCommandShell } from './components/command/MarketCommandShell';
import { MarketHeroStage } from './components/command/MarketHeroStage';
import { FundRiskRail } from './components/command/FundRiskRail';
import { WarRoomCommandRail } from './components/command/WarRoomCommandRail';
import { CommandBottomRail } from './components/command/CommandBottomRail';
import { DecisionDeck, type DecisionKeyId, type DecisionPreviewModel } from './components/command/DecisionDeck';
import { HoldConfirmButton } from './components/command/HoldConfirmButton';
import { MobileWarRoomPresence } from './components/mobile/MobileWarRoomPresence';
import { MobileMachineBase } from './components/mobile/MobileMachineBase';
import { MobilePositionInstrument } from './components/mobile/MobilePositionInstrument';
import {
  CallStackRail,
  CharacterCallOverlay,
  type CharacterCallItem,
} from './components/CharacterCallOverlay';
import { ScannerPanel } from './components/ScannerPanel';
import { ThesisModal } from './components/ThesisModal';
import { TrendConclusionGuide } from './components/NoviceGuide';
import { buildInquiry, inquiryDue } from './engine/engines/lp_inquiry_engine';
import { GexAnalyticsPanel } from './components/GexAnalyticsPanel';
import { MacroDashboardPanel } from './components/MacroDashboardPanel';
// Code-split: every one of these is a modal only reachable after an explicit player click
// (never part of first paint), so none of them should be in the initial bundle.
const TradeReviewModal = lazy(() => import('./components/TradeReviewModal').then((m) => ({ default: m.TradeReviewModal })));
const TradeReview360Modal = lazy(() => import('./components/TradeReview360Modal').then((m) => ({ default: m.TradeReview360Modal })));
const WallStreetDeskPanel = lazy(() => import('./components/WallStreetDeskPanel').then((m) => ({ default: m.WallStreetDeskPanel })));
const PolicyDeskPanel = lazy(() => import('./components/PolicyDeskPanel').then((m) => ({ default: m.PolicyDeskPanel })));
const MarketPulsePanel = lazy(() => import('./components/MarketPulsePanel').then((m) => ({ default: m.MarketPulsePanel })));
const HumanActionFeedPanel = lazy(() => import('./components/HumanActionFeedPanel').then((m) => ({ default: m.HumanActionFeedPanel })));
const CapitalPowerPanel = lazy(() => import('./components/CapitalPowerPanel').then((m) => ({ default: m.CapitalPowerPanel })));
const FlowPositioningDeskPanel = lazy(() => import('./components/FlowPositioningDeskPanel').then((m) => ({ default: m.FlowPositioningDeskPanel })));
const OptionsDataSourcePanel = lazy(() => import('./components/OptionsDataSourcePanel').then((m) => ({ default: m.OptionsDataSourcePanel })));
const StockFundamentalsPanel = lazy(() => import('./components/StockFundamentalsPanel').then((m) => ({ default: m.StockFundamentalsPanel })));
const PowerLedgerPanel = lazy(() => import('./components/PowerLedgerPanel').then((m) => ({ default: m.PowerLedgerPanel })));
const MarketRevealModal = lazy(() => import('./components/MarketRevealModal').then((m) => ({ default: m.MarketRevealModal })));
const ThemeStudio = lazy(() => import('./components/ThemeStudio').then((m) => ({ default: m.ThemeStudio })));
const LPRelationsPanel = lazy(() => import('./components/LPRelationsPanel').then((m) => ({ default: m.LPRelationsPanel })));
const InteractiveTutorialModal = lazy(() => import('./components/InteractiveTutorialModal').then((m) => ({ default: m.InteractiveTutorialModal })));
import { MobileBottomSheet } from './components/MobileBottomSheet';
import { MarketStructureBrief } from './components/MarketStructureBrief';
import { GuidedOnboardingOverlay } from './components/GuidedOnboardingOverlay';
import { PositionDecisionModal } from './components/PositionDecisionModal';
import { ONBOARDING_STEPS, currentNodeIndex, type TutorialDirection } from './lib/onboardingSteps';
const FirstTradeReviewModal = lazy(() =>
  import('./components/FirstTradeReviewModal').then((m) => ({ default: m.FirstTradeReviewModal }))
);
const TermsModal = lazy(() => import('./components/TermsModal').then((m) => ({ default: m.TermsModal })));
const EpisodeOutcomeModal = lazy(() => import('./components/EpisodeOutcomeModal').then((m) => ({ default: m.EpisodeOutcomeModal })));
const SeasonFinaleModal = lazy(() => import('./components/SeasonFinaleModal').then((m) => ({ default: m.SeasonFinaleModal })));
const SurvivalCrisisModal = lazy(() => import('./components/SurvivalCrisisModal').then((m) => ({ default: m.SurvivalCrisisModal })));
import { MainMenuModal } from './components/MainMenuModal';
const StrategyLabModal = lazy(() => import('./components/StrategyLabModal').then((m) => ({ default: m.default })));
const TutorialModal = lazy(() => import('./components/TutorialModal').then((m) => ({ default: m.TutorialModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })));
const CreditsModal = lazy(() => import('./components/CreditsModal').then((m) => ({ default: m.CreditsModal })));

import { getCurrentObjective } from './components/CurrentObjectiveBanner';
import { MissionHeader } from './components/MissionHeader';
import { StoryDialogueModal } from './components/StoryDialogueModal';
import { DramaInterruptOverlay } from './components/DramaInterruptOverlay';
import { Tooltip, InfoIcon } from './components/Tooltip';
import { selectActiveUIEvent } from './engine/uiEventDirector';
import { selectDramaInterrupt } from './engine/engines/drama_interrupt_engine';
import { selectPositionShowdown, type ShowdownAction } from './engine/engines/position_showdown_engine';
import { useLayoutMode } from './hooks/useLayoutMode';
import {
  HQ_ROUTE, MENU_ROUTE, createNavigationState, navigateTo, openOverlay, closeOverlayById,
  type BaseRoute, type OverlayId,
} from './lib/navigationState';

// Interactive FX Components
import { FinancialParticleNetwork, PARTICLE_SCENE_PRESETS } from './components/fx/FinancialParticleNetwork';
import { ElectricBorder } from './components/fx/ElectricBorder';
const VisualPrototypeDemo = lazy(() =>
  import('./components/fx/VisualPrototypeDemo').then((m) => ({ default: m.VisualPrototypeDemo }))
);

const EXPIRATIONS: Record<string, string[]> = {
  h1: ['2026-02-20', '2026-03-20', '2026-04-17', '2026-05-15', '2026-06-19', '2026-07-17'],
  r1: ['2025-01-31', '2025-02-07', '2025-02-21'],
};

// (The former STEP_MS auto-play interval was removed: real-world elapsed time must never
// advance the historical market node. See advanceMarket() below.)

type MobileTab = 'trade' | 'portfolio' | 'scanner' | 'intel' | 'settings';
type Workspace = 'HQ' | 'MARKET' | 'PORTFOLIO' | 'INTEL' | 'REVIEW';

function changeFor(
  node: MarketNode,
  prev: MarketNode | null,
  useSecondary: boolean,
): { text: string; cls: 'green' | 'red' | '' } {
  if (node.point_only) {
    const summary = node.move_summary ?? '真实收盘节点';
    return { text: summary, cls: summary.includes('+') ? 'green' : summary.includes('-') ? 'red' : '' };
  }
  if (!prev) return { text: '战役起点', cls: '' };
  const cur = useSecondary ? node.secondary_close ?? 0 : node.underlying_bar.close;
  const old = useSecondary ? prev.secondary_close ?? 0 : prev.underlying_bar.close;
  if (!old) return { text: '战役起点', cls: '' };
  const chg = (cur / old - 1) * 100;
  return { text: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs 前一交易日`, cls: chg > 0 ? 'green' : chg < 0 ? 'red' : '' };
}

function regimeFor(node: MarketNode): { label: string; cls: 'green' | 'yellow' | 'red' } {
  if (node.vix) {
    const v = node.vix.close;
    if (v > 20) return { label: '高恐慌', cls: 'red' };
    if (v > 17) return { label: '风险升温', cls: 'yellow' };
    if (v < 15) return { label: '平静', cls: 'green' };
    return { label: '中性', cls: 'green' };
  }
  const severity = node.severity ?? 0;
  if (severity >= 0.4) return { label: '高恐慌', cls: 'red' };
  if (severity >= 0.2) return { label: '风险升温', cls: 'yellow' };
  return { label: '平静', cls: 'green' };
}

function vixRangeText(node: MarketNode): string {
  if (!node.vix) return '该日起点未捆绑';
  if (node.vix.open != null && node.vix.high != null && node.vix.low != null) {
    return `O ${fmt(node.vix.open)} · H ${fmt(node.vix.high)} · L ${fmt(node.vix.low)}`;
  }
  return `收盘 ${fmt(node.vix.close)}（仅收盘节点）`;
}

export default function App(): JSX.Element {
  const layoutMode = useLayoutMode();
  const [campaigns, setCampaigns] = useState<CampaignMeta[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('r1');
  const [gameMode, setGameMode] = useState<GameMode>('STORY_CAMPAIGN');
  const [accountType, setAccountType] = useState<AccountType>('Margin');
  const [startCash, setStartCash] = useState(10_000_000);

  const [view, setView] = useState<GameStateView | null>(null);
  const [nodes, setNodes] = useState<MarketNode[]>([]);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [funds, setFunds] = useState<{ ranking: AIFundRankingEntry[] }>({ ranking: [] });
  const [saveList, setSaveList] = useState<SaveSlotInfo[]>([]);
  const [saveSlot, setSaveSlot] = useState('slot1');

  const [chain, setChain] = useState<OptionQuote[]>([]);
  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [side, setSide] = useState<ChainSide>('both');
  const [selectedQuote, setSelectedQuote] = useState<OptionQuote | null>(null);
  // Five-Key is an intent selector. No money/position state changes until the
  // independent ACTION PREVIEW confirmation actuator is completed.
  const [pendingDecision, setPendingDecision] = useState<DecisionKeyId | null>(null);
  // Desktop execution is a foldable equipment bay like the reference console.
  // Mobile keeps it open in the single command scroll. Selecting a Five-Key intent
  // opens the bay automatically, so the safety preview never strands the player.
  const [executionBayOpen, setExecutionBayOpen] = useState(false);

  const [qty, setQty] = useState(1);
  const [orderKind, setOrderKind] = useState<OrderKind>('Market');
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [lastOrderMessage, setLastOrderMessage] = useState('');
  const [lastTradeConfirmation, setLastTradeConfirmation] = useState<{
    fillPrice: number; totalCost: number; cashBefore: number; cashAfter: number;
    navBefore: number; navAfter: number; side: string;
  } | null>(null);
  const [tradeFlashActive, setTradeFlashActive] = useState(false);
  const tradeFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerTradeFlash(): void {
    setTradeFlashActive(true);
    if (tradeFlashTimer.current) clearTimeout(tradeFlashTimer.current);
    tradeFlashTimer.current = setTimeout(() => setTradeFlashActive(false), 800);
  }

  const [advancing, setAdvancing] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  // A review is a detached historical view. Keep the live campaign node here
  // so the player can return to it without rewinding the real session.
  const [reviewOriginIndex, setReviewOriginIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [startupError, setStartupError] = useState('');

  // View state & modals
  const [showFundHQ, setShowFundHQ] = useState(true);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>('HQ');
  const [mobileTab, setMobileTab] = useState<MobileTab>('trade');
  const [warRoomOpen, setWarRoomOpen] = useState(false);
  const [thesisModalOpen, setThesisModalOpen] = useState(false);
  const [strategyLabOpen, setStrategyLabOpen] = useState(false);
  const [attachedThesis, setAttachedThesis] = useState<ThesisRequest | null>(null);
  // batch2 断点3/4/5：Step3 走势引导。玩家点结论推导器后带方向预填直入 Thesis。
  const [trendGuideDismissed, setTrendGuideDismissed] = useState(false);
  const [thesisSeedDirection, setThesisSeedDirection] = useState<'BULLISH' | 'BEARISH' | null>(null);
  // When set, ThesisModal is opened in REVISE mode for this open position: the entry
  // thesis stays frozen and the submission is appended as a new revision.
  const [revisingPositionId, setRevisingPositionId] = useState<string | null>(null);
  // Guided first day. The overlay only coaches -- every action it points at is the REAL
  // panel underneath, and tutorial progress is persisted server-side via /tutorial.
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [chartReady, setChartReady] = useState(false);
  // Baseline node index for the ADVANCE_MARKET onboarding step, owned here (not
  // inside GuidedOnboardingOverlay) because that overlay gets remounted by
  // render churn whenever advanceMarket() resolves -- a local ref/state baseline
  // inside it gets wiped back to null on every such remount, so "one node moved
  // since this step started" could never be observed there (P0 bug: repeated
  // clicks silently re-advanced the market past the guided single-node budget).
  // advanceRequested guards the handler itself so the coach's CTA can physically
  // trigger advanceMarket at most once per step visit, independent of the above.
  const [guidedAdvanceBaseline, setGuidedAdvanceBaseline] = useState<number | null>(null);
  const guidedAdvanceRequestedRef = useRef(false);

  useEffect(() => {
    if (!onboardingActive) return;
    if (ONBOARDING_STEPS[onboardingStep]?.interaction !== 'ADVANCE_MARKET') return;
    // Runs once per arrival at the ADVANCE_MARKET step (onboardingStep only
    // changes on a real step transition, so this can't re-baseline mid-step the
    // way an effect inside the remount-prone child component could).
    setGuidedAdvanceBaseline(currentNodeIndex(view));
    guidedAdvanceRequestedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingActive, onboardingStep]);
  useEffect(() => {
    if (!onboardingActive) return;
    const stepId = ONBOARDING_STEPS[onboardingStep]?.id;
    const hasThesis = Boolean(attachedThesis) || Object.keys(view?.state?.active_theses ?? {}).length > 0;
    const hasPosition = (view?.state?.positions?.length ?? 0) > 0;
    if (stepId === 'THESIS' && hasThesis) {
      setOnboardingStep((index) => Math.min(ONBOARDING_STEPS.length - 1, index + 1));
    } else if (stepId === 'BUY_TO_OPEN' && hasPosition) {
      setOnboardingStep((index) => Math.min(ONBOARDING_STEPS.length - 1, index + 1));
    }
  }, [attachedThesis, onboardingActive, onboardingStep, view?.state?.active_theses, view?.state?.positions?.length]);
  const [firstTradeReviewOpen, setFirstTradeReviewOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<TradeReview | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  // Phase-I Character Call：普通人物消息进入 CallStack；不新建第二套事件调度器。
  const [activeCharacterCallId, setActiveCharacterCallId] = useState<string | null>(null);
  const [lpInquiryDismissed, setLpInquiryDismissed] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [crisisModalOpen, setCrisisModalOpen] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(true);
  const [, setNavigation] = useState(() => createNavigationState(MENU_ROUTE));
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [interactiveTutorialOpen, setInteractiveTutorialOpen] = useState(false);
  const [wallStreetOpen, setWallStreetOpen] = useState(false);
  const [capitalPowerOpen, setCapitalPowerOpen] = useState(false);
  const [policyDeskOpen, setPolicyDeskOpen] = useState(false);
  const [marketPulseOpen, setMarketPulseOpen] = useState(false);
  const [humanActionOpen, setHumanActionOpen] = useState(false);
  const [flowDeskOpen, setFlowDeskOpen] = useState(false);
  const [dataTruthOpen, setDataTruthOpen] = useState(false);
  const [powerLedgerOpen, setPowerLedgerOpen] = useState(false);
  const [lpPanelOpen, setLpPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Left rail (desktop nav): which zone's sub-panel dropdown is open, if any.
  // INTEL and REVIEW bundle several existing modals that have no single home screen;
  // FUND_HQ/MARKET/PORTFOLIO map directly onto existing showFundHQ/mobileTab toggles.
  const [activeRailPanel, setActiveRailPanel] = useState<'FUND_HQ' | 'INTEL' | 'REVIEW' | null>(null);
  // Mission Tracker step flags: real "has the player actually done this" ratchets,
  // not guesses. Once true they stay true for the session (a completed step doesn't
  // un-complete just because the player navigated elsewhere).
  const [visitedWarRoom, setVisitedWarRoom] = useState(false);
  const [visitedTradingFloor, setVisitedTradingFloor] = useState(false);
  const [hasResolvedOpeningBriefing, setHasResolvedOpeningBriefing] = useState(false);
  useEffect(() => {
    if (warRoomOpen) setVisitedWarRoom(true);
  }, [warRoomOpen]);
  useEffect(() => {
    if (!showFundHQ) setVisitedTradingFloor(true);
  }, [showFundHQ]);
  useEffect(() => {
    // story.resolve_choice() splices a resolved event OUT of pending_story_events
    // (and thus out of pending_story_public) the same tick it resolves, moving it
    // into state.story_history instead -- so pending_story_public alone can never
    // show "resolved", and its length dropping back to 0 says nothing about
    // whether the opening beat was ever cleared (a later SIDE_EVENT just refills
    // it). story_history only ever grows, so its first entry is the real signal.
    if (hasResolvedOpeningBriefing) return;
    if ((view?.state.story_history?.length ?? 0) > 0) {
      setHasResolvedOpeningBriefing(true);
    }
    // story_history.push() mutates the array in place (see story.resolve_choice),
    // so the array keeps the same reference across renders -- depending on the
    // array itself would make this effect never re-fire when an entry is added.
    // Depend on .length (a primitive) instead so the real content change is seen.
  }, [view?.state.story_history?.length, hasResolvedOpeningBriefing]);
  // 主题工作室：接管了原来 FX Lab 的菜单入口
  const [themeStudioOpen, setThemeStudioOpen] = useState(false);
  const [fxLabOpen, setFxLabOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const path = window.location.pathname || '';
      return (
        search.includes('fx-lab') ||
        search.includes('visual-prototype') ||
        hash.includes('fx-lab') ||
        hash.includes('visual-prototype') ||
        path === '/fx-lab' ||
        path === '/visual-prototype'
      );
    }
    return false;
  });
  // Position Decision (HOLD/REDUCE/CLOSE). pause_reasons is rebuilt fresh on every
  // advance_market call and otherwise persists as-is (same lifecycle every other
  // NOTABLE pause already uses), so a locally-dismissed key just needs to survive
  // until the next real advance naturally replaces the list's contents.
  const [dismissedPositionDecisions, setDismissedPositionDecisions] = useState<Set<string>>(new Set());
  const [positionDecisionBusy, setPositionDecisionBusy] = useState(false);
  const [deferredStoryIds, setDeferredStoryIds] = useState<Set<string>>(new Set());
  // Intrusive Drama fatigue cap is presentation-only: one non-mandatory break-in per game day.
  // Key includes session id so replaying the same historical date in another fund is independent.
  const [dramaHandledDayKeys, setDramaHandledDayKeys] = useState<Set<string>>(new Set());
  const [marginDramaAcknowledged, setMarginDramaAcknowledged] = useState(false);
  const [showdownPrefill, setShowdownPrefill] = useState<{ action: 'HEDGE' | 'ADD'; positionId: string } | null>(null);
  const [riskClosePrefill, setRiskClosePrefill] = useState<{
    positionId: string;
    side: 'sell_to_close' | 'buy_to_close';
  } | null>(null);

  const startGameSeq = useRef(0);
  const [audioLevels, setAudioLevels] = useState<AudioLevels>(audioManager.getLevels());
  const seenStoryEventIds = useRef<Set<string>>(new Set());
  const storyReturnFocusRef = useRef<HTMLElement | null>(null);
  const marginCallFiredRef = useRef(false);
  const marginCallSequenceActiveRef = useRef(false);
  const warRoomEnteredRef = useRef(false);
  const reviewOpenedRef = useRef(false);
  const showdownActionBusyRef = useRef(false);

  function updateAudio(next: Partial<AudioLevels>): void {
    audioManager.setLevels(next);
    setAudioLevels(audioManager.getLevels());
  }

  const sessionId = view?.state.session_id ?? null;
  const campaignMeta = campaigns.find((c) => c.id === view?.state.campaign_id);
  const totalDays = campaignMeta?.node_count ?? nodes.length;

  const investigationStage = view?.state?.evidence_state?.investigation_stage ?? 'CLEAN';
  const hasVortex =
    investigationStage === 'REGULATORY_INQUIRY' ||
    investigationStage === 'FORMAL_INVESTIGATION' ||
    investigationStage === 'CRIMINAL_INVESTIGATION' ||
    investigationStage === 'CIVIL_ENFORCEMENT' ||
    investigationStage === 'CHARGED';
  const vortexHue =
    investigationStage === 'CRIMINAL_INVESTIGATION' || investigationStage === 'CHARGED' ? 350 : 210;
  const vortexSpeed =
    investigationStage === 'CRIMINAL_INVESTIGATION' || investigationStage === 'CHARGED'
      ? 2.5
      : investigationStage === 'FORMAL_INVESTIGATION'
      ? 1.8
      : 1.2;
  const isIndexCampaign = view?.state.campaign_id === 'h1';
  const dayIndex = view?.state.game_day_index ?? 0;
  const isReviewing = reviewOriginIndex !== null;
  const liveDayIndex = reviewOriginIndex ?? dayIndex;
  const node = nodes[dayIndex] ?? null;
  const prevNode = dayIndex > 0 ? nodes[dayIndex - 1] ?? null : null;

  /**
   * NAV 曲线：**从存档里的 nav_history 取，不再记内存**（2026-08-19 claude）
   *
   * 第一版记在这里的 useState 里——刷新或读档就没了，
   * harv 把它列为"现在必须还"的债。现在引擎在 compute_view 里按天记进
   * `state.nav_history`，跟着存档走。
   *
   * 为什么净值必须**存**、而席位轨迹可以**算**：
   * 净值取决于那一天的持仓与现金，推进过去之后倒推不出来；
   * 恩怨账本每条自带日期，所以席位轨迹能从账本重算（见 standingHistory）。
   * 能算的就别存——存两份就一定有对不上的那天。
   */
  const navHistory = useMemo(
    () => (view?.state.nav_history ?? []).map((p) => p.v).filter((v) => Number.isFinite(v)),
    [view?.state.nav_history],
  );
  const drawdownHistory = useMemo(() => {
    let peak = Number.NEGATIVE_INFINITY;
    return navHistory.map((value) => {
      peak = Math.max(peak, value);
      return peak > 0 ? ((value / peak) - 1) * 100 : 0;
    });
  }, [navHistory]);
  // The status strip and Fund Vitals both use the engine's current unrealized
  // P&L. Reuse that canonical value on mobile; Day 1 is a real $0.00, not a
  // missing-data state merely because there is only one NAV history point.
  const mobileDayPnl = view && Number.isFinite(view.unrealized_pnl) ? view.unrealized_pnl : null;
  const mobilePositionPnl = view ? (view.position_marks ?? []).reduce((sum, mark) => sum + (Number(mark.pl) || 0), 0) : null;

  /** 保证金占用率。净资产 <=0 时给 null——那时候画 0% 是彻头彻尾的谎话 */
  const marginUtil =
    view && view.equity > 0 && Number.isFinite(view.margin_requirement ?? NaN)
      ? (view.margin_requirement as number) / view.equity
      : null;
  const mobileRiskClass: 'good' | 'warn' | 'bad' = view?.margin_call_active ? 'bad' : (marginUtil ?? 0) >= 0.8 ? 'warn' : 'good';
  const mobileRiskLabel = view?.margin_call_active ? 'MARGIN CALL' : mobileRiskClass === 'warn' ? 'HIGH RISK' : 'STABLE';

  const cashRatio =
    view && view.equity > 0 && Number.isFinite(view.state.cash)
      ? view.state.cash / view.equity
      : null;

  // P&L mini-axis fixed visual scale +-5% NAV; exact dollar value stays as text.
  // Beyond 5% the bar clamps -- the number is never altered.
  const pnlVizWidth = (value: number): number | null =>
    view && view.equity > 0 && Number.isFinite(value)
      ? Math.min(50, Math.abs(value / view.equity) * 1000)
      : null;

  /** LP 信任度。以前这里写的是 `?? 85`——数据缺失时凭空显示 85%，改掉 */
  const lpConfidence = Number.isFinite(view?.state.fund_stats?.lp_confidence as number)
    ? (view!.state.fund_stats!.lp_confidence as number)
    : null;

  /** 雷达五轴。归一化口径写在引擎里（engines/portfolio_greeks.ts），此处只取值 */
  const greeksRadarAxes = useMemo(
    () => normalizeGreeksForRadar(view?.portfolio_greeks, view?.equity ?? 0, node?.underlying_bar.close ?? 0, marginUtil),
    [view?.portfolio_greeks, view?.equity, node?.underlying_bar.close, marginUtil],
  );

  /** 真正有非零敞口的轴数。<3 时雷达只剩一根刺，改用条形（见右栏那段注释） */
  const greeksLiveDims = greeksRadarAxes.filter((a) => typeof a.value === 'number' && Math.abs(a.value) > 1e-9).length;

  /**
   * Command Dock 的三样真实数据（2026-08-19 claude）
   *
   * 一律取现有状态，**没有新增编出来的字段**。
   * 论点取最近一笔仓位的 thesis；没有就返回空串，由 UI 明说"尚未建立论点"，
   * 不填一句占位文案冒充。
   */
  const dockThesis = useMemo(() => {
    const theses = view?.state.active_theses ?? {};
    const positions = view?.state.positions ?? [];
    for (let i = positions.length - 1; i >= 0; i -= 1) {
      const t: any = theses[positions[i].id];
      const text = t?.core_claim ?? t?.claim ?? t?.summary ?? t?.thesis ?? '';
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
    return '';
  }, [view?.state.active_theses, view?.state.positions]);

  const dockPending = (view?.human_action_feed ?? []).filter((e) => !e.resolved).length;

  const handleDecisionKey = (key: DecisionKeyId): void => {
    // Five-Key is selection only. Never call submitOrder/advanceMarket here.
    setPendingDecision(key);
    setLastTradeConfirmation(null);
    if (key !== 'DO_NOTHING') setExecutionBayOpen(true);
    if (key === 'BUY_CALLS') {
      setSide('call'); // BUY CALLS
      if (selectedQuote && selectedQuote.type.toLowerCase() !== 'call') setSelectedQuote(null);
    } else if (key === 'SELL_PUTS') {
      setSide('put'); // SELL PUTS
      if (selectedQuote && selectedQuote.type.toLowerCase() !== 'put') setSelectedQuote(null);
    } else if (key === 'HEDGE') {
      setSide('put'); // HEDGE starts from protective puts
      if (selectedQuote && selectedQuote.type.toLowerCase() !== 'put') setSelectedQuote(null);
    }
    else if (key === 'SPREAD') setSide('both');    // SPREAD can be built from either side
    if (key === 'DO_NOTHING') {
      setLastOrderMessage('DO NOTHING 已选择。未产生交易；真正推进仍需使用 ADVANCE MARKET。');
    } else {
      setLastOrderMessage('');
    }
  };

  const hasOpeningThesis = Boolean(attachedThesis) || Object.keys(view?.state.active_theses ?? {}).length > 0;
  const mandatoryOpeningBriefingPending = Boolean(
    view?.state.pending_story_events?.some(
      (event) => !event.resolved && !event.deferred && event.mandatory_before_trade === true,
    ),
  );
  const openingBlocked = view?.state.mode === 'STORY_CAMPAIGN' && (!hasOpeningThesis || mandatoryOpeningBriefingPending);

  /**
   * 玩家已经走过的交易日（含当天）。
   *
   * 给 WAR ROOM 席位轨迹当时间轴用——轨迹从恩怨账本按这串日期重算，
   * 所以刷新/读档后自动还原，不需要持久化，也不会和账本对不上。
   *
   * 切到 dayIndex 为止，不含未来：多给一天，席位曲线上就会出现
   * 还没发生的事。（2026-08-19 claude）
   */
  const dateHistory = useMemo(
    () => nodes.slice(0, dayIndex + 1).map((n) => n.date).filter(Boolean),
    [nodes, dayIndex],
  );

  /**
   * 主图事件针脚（2026-08-19 claude）
   *
   * 两位评审（dante R6-P1、AVG R7-#1）独立给了同一条最高优先级：
   * 主图现在是"一大块画布上一根裸线"，参考图的硬核感来自
   * **行情与剧情节点落在同一条时间轴上、能看出因果**。
   *
   * 数据源是 `decision_timeline`——玩家**真实经历过**的事件，自带 game_date。
   * 不新造事件、不给不存在的日子编针脚。
   *
   * 防前视：只取 `game_date <= 当前日`。图表层还会再滤一次；
   * 这种事多一道无害，少一道就漏——一根画在未来的针脚，
   * 等于直接告诉玩家"那天有事发生"。
   */
  const chartEventPins = useMemo(() => {
    const today = node?.date ?? '';
    const rows = view?.decision_timeline ?? [];
    return rows
      .filter((e) => e?.game_date && (!today || e.game_date <= today))
      .map((e) => {
        const c = `${e.category ?? ''}`.toUpperCase();
        const tone: 'risk' | 'good' | 'neutral' =
          /RISK|CRISIS|MARGIN|LOSS|INVESTIGAT|GRUDGE/.test(c) ? 'risk'
          : /PROFIT|WIN|OPPORTUNIT|GAIN/.test(c) ? 'good'
          : 'neutral';
        return { date: e.game_date, headline: e.headline ?? '事件', tone };
      });
  }, [view?.decision_timeline, node?.date]);

  /**
   * MACRO WATCHLIST 的三条迷你趋势线（2026-08-19 claude）
   *
   * **切片必须在这一层做**：`nodes.slice(0, dayIndex + 1)` ——
   * 只取到玩家当前所在的那一天（含当天，因为当天的日线在收盘节点已经揭晓）。
   * MacroWatchlistPanel 拿不到 dayIndex，把裁剪交给它就等于没有防线。
   *
   * 越界一天，玩家就能在小图上看见明天的行情。
   */
  const macroSeries = useMemo(() => {
    const seen = nodes.slice(0, dayIndex + 1);
    const pick = (f: (n: (typeof nodes)[number]) => number | null | undefined) =>
      seen.map(f).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return {
      main: pick((n) => n.underlying_bar?.close),
      secondary: pick((n) => n.secondary_close),
      vix: pick((n) => n.vix?.close),
    };
  }, [nodes, dayIndex]);

  /**
   * 主图「盘中走势」用的真实小时 bar（2026-08-19 claude）
   *
   * 取数规矩只有两条，都是防前视的：
   *
   *   1. **当天正在逐时点揭示** → 只能用 `market_reveal.windows` 里的
   *      `visible_price_bars`。那是逐窗增长的（1 → 2 → 5 → …），
   *      未揭晓的部分本来就不在里面。
   *   2. **严格早于当前游戏日的日子** → 整天已经走完，
   *      从数据包取全量小时 bar 不构成前视。
   *
   * 为什么需要第 2 条：`market_reveal` 只保存当天的会话，推进过去就被置 null
   * （game.ts:828）。只靠第 1 条的话，玩家走完 Golden Day 之后
   * 盘中走势会凭空消失——而那些数据他明明已经全部看过了。
   *
   * **绝对不能做的**：拿 `sessionFor(当前日期)` 的全量 bar。那一天还没走完。
   */
  const intradayBarsForChart = useMemo(() => {
    const st: any = view?.state;
    if (!st) return [];
    const revealed = (st.market_reveal?.windows ?? [])
      .flatMap((w: any) => w?.visible_price_bars ?? [])
      .filter((b: any) => b && Number.isFinite(b.close));
    if (revealed.length > 0) return revealed;

    const today = node?.date;
    if (!today) return [];
    // 从最近的一天往前找，取第一个有盘中会话的**已过去**的日子
    for (let i = dayIndex - 1; i >= 0; i -= 1) {
      const d = nodes[i]?.date;
      if (!d || d >= today) continue;
      const ticker = (nodes[i] as any)?.underlying ?? 'NVDA';
      // **必须走归一化**：揭示路径（buildPriceWindow）用的是归一化后的价，
      // 这里原来直接取 s.bars（数据源原始 CFD 中间价），于是同一张图在
      // Golden Day 与其它日子用了两个不同的价基，差 0.02%~0.2% 且毫无提示。
      const bars = marketRevealEngine
        .normalizedBarsFor(st.campaign_id, d, ticker)
        .filter((b: any) => b && Number.isFinite(b.close));
      if (bars.length > 0) return bars;
    }
    return [];
  }, [view?.state, node?.date, dayIndex, nodes]);


  /**
   * Day-1 visual fallback: only when there is NO partial intraday reveal in progress.
   * The node's daily O/H/L/C is already admitted player-visible history at this point;
   * PriceChartPanel expands it into a truth-labelled SIMULATED tape for visual density.
   * During a live reveal even one visible minute disables this fallback so daily H/L/C
   * can never leak the rest of the session.
   */
  const dailyVisualAnchorForChart = useMemo(() => {
    const st: any = view?.state;
    const today = node?.date;
    const daily = node?.underlying_bar;
    if (!st || !today || !daily) return null;
    const revealed = (st.market_reveal?.windows ?? [])
      .flatMap((window: any) => window?.visible_price_bars ?? [])
      .filter((bar: any) => bar && Number.isFinite(bar.close));
    if (revealed.length > 0) return null;
    const open = Number(daily.open);
    const high = Number(daily.high);
    const low = Number(daily.low);
    const close = Number(daily.close);
    if (![open, high, low, close].every(Number.isFinite)) return null;
    return {
      ts: `${today}T09:30:00`,
      label: `${today} RTH · DAILY OHLC ANCHOR`,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(Number(daily.volume)) ? Number(daily.volume) : null,
    };
  }, [view?.state, node?.date, node?.underlying_bar]);

  const positionDecisionKey = (r: { headline: string; position_id: string }): string =>
    `${r.headline}::${r.position_id}`;
  const activePositionDecisionReason =
    view?.state.market_clock?.pause_reasons.find(
      (r) => r.trigger_id === 'position_decision' && !dismissedPositionDecisions.has(positionDecisionKey(r))
    ) ?? null;
  const activePositionDecisionPosition = activePositionDecisionReason
    ? view?.state.positions.find((p) => p.id === activePositionDecisionReason.position_id) ?? null
    : null;
  const activePositionDecisionThesis = activePositionDecisionPosition
    ? view?.state.active_theses[activePositionDecisionPosition.id] ?? null
    : null;
  // Position.unrealized_pl is not a live-updated backend field -- the real current
  // mark is only in position_marks (same source firstTradeUnrealized() in
  // onboardingSteps.ts reads for the same reason).
  const activePositionDecisionUnrealizedPl = activePositionDecisionPosition
    ? view?.position_marks.find((m) => m.position_id === activePositionDecisionPosition.id)?.pl ?? null
    : null;
  const activePositionDecisionLabel = activePositionDecisionPosition
    ? `${activePositionDecisionPosition.type.toUpperCase()} ${activePositionDecisionPosition.strike} · ${activePositionDecisionPosition.expiration}`
    : '';
  const activePositionDecisionThesisSummary = activePositionDecisionThesis
    ? `${activePositionDecisionThesis.direction} — ${activePositionDecisionThesis.catalyst}`
    : '';

  // Guided First Day owns the opening sequence.
  // Keep Maya's day-1 briefing in the REAL story queue so Step ③ can consume
  // it as a factual catalyst, but do not let that same event compete for
  // blocking UI while the guided flow is active.
  //
  // We deliberately do NOT resolve/defer/mutate the engine event here:
  // - Guided mode: hidden only from the blocking-story lens.
  // - Skip/complete: onboardingActive becomes false, so an unread briefing
  //   automatically returns to the normal story queue.
  // - Non-guided campaign: behavior is byte-for-byte equivalent to before.
  const pendingStoryEvents = useMemo(
    () =>
      (view?.pending_story_public || []).filter(
        (e) =>
          !e.resolved &&
          !e.deferred &&
          !deferredStoryIds.has(e.id) &&
          !(onboardingActive && e.template_id === 'day1_briefing_maya'),
      ),
    [view?.pending_story_public, deferredStoryIds, onboardingActive],
  );
  const activeStoryEvent = pendingStoryEvents[0] ?? null;

  // 普通 Maya 消息走 CallStack；POSSIBLE_MNPI 仍保留危机级 cinematic/interrupt。
  const mayaCallEvent =
    activeStoryEvent?.character_id === 'maya_chen' && activeStoryEvent.intel_class !== 'POSSIBLE_MNPI'
      ? activeStoryEvent
      : null;
  const mayaCharacter = characters.find((c) => c.id === 'maya_chen');

  const lpInquiry = view ? buildInquiry(view.state as never, view.equity, node?.date ?? '') : null;
  const lpCallDue = Boolean(
    view &&
    !lpInquiryDismissed &&
    inquiryDue(view.state as never, dayIndex, totalDays) &&
    !reviewModalOpen &&
    !warRoomOpen,
  );
  const lpRepresentative = lpInquiry?.inquirers.find((person) => person.characterId === 'daniel_ross')
    ?? lpInquiry?.inquirers[0]
    ?? null;

  const characterCalls = useMemo<CharacterCallItem[]>(() => {
    const items: CharacterCallItem[] = [];

    if (mayaCallEvent) {
      items.push({
        id: `story:${mayaCallEvent.id}`,
        characterId: 'maya_chen',
        name: mayaCharacter?.name ?? 'Maya Chen',
        role: mayaCharacter?.role ?? '首席投研',
        portrait: mayaCharacter?.portrait || mayaCharacter?.avatar || '/art/characters/maya_chen.jpg',
        eyebrow: 'RESEARCH · MAYA CHEN',
        headline: mayaCallEvent.headline,
        body: mayaCallEvent.body,
        choices: mayaCallEvent.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      });
    }

    if (lpCallDue && lpInquiry && lpRepresentative) {
      items.push({
        id: `lp:${lpInquiry.tier}`,
        characterId: lpRepresentative.characterId,
        name: lpRepresentative.name,
        role: lpRepresentative.role,
        portrait: `/art/characters/${lpRepresentative.characterId}.jpg`,
        eyebrow: 'LP COMMITTEE · SECURE LINE',
        headline: `季末质询 · ${lpInquiry.tierLabel}`,
        body: lpRepresentative.opening,
        choices: lpInquiry.choices.map((choice) => ({ id: choice.id, label: choice.label })),
      });
    }

    return items;
  }, [mayaCallEvent, mayaCharacter, lpCallDue, lpInquiry, lpRepresentative]);

  const activeCharacterCall =
    characterCalls.find((call) => call.id === activeCharacterCallId) ?? null;

  const deferredStoryEvent = useMemo(
    () => (view?.pending_story_public || []).find((e) => !e.resolved && (e.deferred || deferredStoryIds.has(e.id))) ?? null,
    [view?.pending_story_public, deferredStoryIds],
  );

  // Batch3 Drama: only prices already present in market_reveal.visible_price_bars may
  // trigger the -8% intrusion. Reading node.underlying_bar.close here would reveal the
  // historical close before the player has actually reached it.
  const latestRevealedPrice = useMemo(() => {
    const reveal = (view?.state as any)?.market_reveal;
    const bars = (reveal?.windows ?? [])
      .flatMap((window: any) => window?.visible_price_bars ?? [])
      .filter((bar: any) => Number.isFinite(bar?.close));
    return bars.length ? Number(bars[bars.length - 1].close) : null;
  }, [(view?.state as any)?.market_reveal]);
  const dramaDayKey = sessionId && node?.date ? `${sessionId}:${node.date}` : '';
  const dramaDailyUsed = Boolean(dramaDayKey && dramaHandledDayKeys.has(dramaDayKey));
  const positionShowdown = useMemo(() => {
    const reveal = (view?.state as any)?.market_reveal ?? null;
    const revealDate = reveal?.session_date ?? node?.date ?? '';
    return selectPositionShowdown({
      gameDate: revealDate,
      marketReveal: reveal,
      positions: (view?.state.positions ?? []) as any,
      playerDecisions: view?.state.player_decisions ?? [],
      thresholdPct: 4,
    });
  }, [
    (view?.state as any)?.market_reveal,
    view?.state.positions,
    view?.state.player_decisions,
    node?.date,
  ]);

  const dramaInterrupt = useMemo(
    () => selectDramaInterrupt({
      gameDate: node?.date ?? '',
      storyEvent: mayaCallEvent ? null : activeStoryEvent,
      previousClose: prevNode?.underlying_bar?.close ?? null,
      revealedPrice: latestRevealedPrice,
      marginCallActive: Boolean(view?.margin_call_active) && !marginDramaAcknowledged,
      dailyInterruptUsed: dramaDailyUsed,
    }),
    [
      node?.date,
      activeStoryEvent,
      mayaCallEvent,
      prevNode?.underlying_bar?.close,
      latestRevealedPrice,
      view?.margin_call_active,
      marginDramaAcknowledged,
      dramaDailyUsed,
    ],
  );

  // UIEventDirector: every blocking surface competes through one deterministic
  // priority selector. Rendering order and z-index no longer decide which event
  // interrupts the player.
  const activeUIEvent = useMemo(
    () =>
      selectActiveUIEvent([
        { id: 'intrusive-drama', tier: 'INTRUSIVE_DRAMA', active: Boolean(dramaInterrupt), order: 0 },
        { id: 'position-showdown', tier: 'INTRUSIVE_DRAMA', active: Boolean(positionShowdown), order: 1 },
        { id: 'mandatory-story', tier: 'MANDATORY_STORY', active: Boolean(activeStoryEvent && !mayaCallEvent) },
        { id: 'critical-compliance', tier: 'CRITICAL_COMPLIANCE', active: crisisModalOpen },
        {
          id: 'position-decision',
          tier: 'POSITION_DECISION',
          active: Boolean(activePositionDecisionReason) && !positionDecisionBusy,
        },
        // 引导 4/9 要求玩家写 Thesis，但 Thesis 弹窗是 REVIEW_OUTCOME 级、
        // 永远赢不过 MANDATORY_TUTORIAL——引导期间弹窗被压死，新手在此死锁
        // （实机复现：2026-08-21）。Thesis 弹窗打开时引导卡主动让位，关掉即回。
        { id: 'mandatory-tutorial', tier: 'MANDATORY_TUTORIAL', active: onboardingActive && chartReady && !thesisModalOpen },
        { id: 'war-room', tier: 'SIDE_EVENT', active: warRoomOpen },
        { id: 'thesis', tier: 'REVIEW_OUTCOME', active: thesisModalOpen },
        { id: 'first-trade-review', tier: 'REVIEW_OUTCOME', active: firstTradeReviewOpen },
        { id: 'trade-review', tier: 'REVIEW_OUTCOME', active: reviewModalOpen },
        { id: 'episode-outcome', tier: 'REVIEW_OUTCOME', active: outcomeModalOpen },
        { id: 'season-finale', tier: 'REVIEW_OUTCOME', active: Boolean(view?.season_outcome) },
      ]),
    [
      dramaInterrupt,
      positionShowdown,
      activeStoryEvent,
      mayaCallEvent,
      crisisModalOpen,
      activePositionDecisionReason,
      positionDecisionBusy,
      onboardingActive,
      chartReady,
      warRoomOpen,
      thesisModalOpen,
      firstTradeReviewOpen,
      reviewModalOpen,
      outcomeModalOpen,
      view?.season_outcome,
    ],
  );
  const routeForWorkspace = (workspace: Workspace, tab: MobileTab = 'trade'): BaseRoute => ({
    workspace,
    ...(workspace === 'MARKET' ? { tab } : {}),
  });

  const navigateWorkspace = (workspace: Workspace, tab: MobileTab = 'trade'): void => {
    setNavigation((prev) => navigateTo(prev, routeForWorkspace(workspace, tab)));
    setActiveWorkspace(workspace);
    if (workspace === 'HQ') {
      setShowFundHQ(true);
    } else {
      setShowFundHQ(false);
      setMobileTab(tab);
    }
    setActiveRailPanel(null);
    setTabletDrawerOpen(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.mobile-command-scroll')?.scrollTo({ top: 0, behavior: 'auto' });
    });
  };

  const openAppOverlay = (id: OverlayId, setOpen: (open: boolean) => void, returnTo?: BaseRoute, mode: 'INSPECT' | 'DECISION' = 'INSPECT'): void => {
    setNavigation((prev) => openOverlay(prev, id, { mode, returnTo: returnTo ?? prev.baseRoute }));
    setOpen(true);
  };

  const closeAppOverlay = (id: OverlayId, setOpen: (open: boolean) => void): void => {
    setOpen(false);
    setNavigation((prev) => {
      const next = closeOverlayById(prev, id);
      if (next.baseRoute.workspace === 'MENU') setMainMenuOpen(true);
      if (next.baseRoute.workspace === 'HQ') {
        setActiveWorkspace('HQ');
        setShowFundHQ(true);
      }
      if (next.baseRoute.workspace === 'MARKET') {
        setActiveWorkspace('MARKET');
        setShowFundHQ(false);
        if (next.baseRoute.tab) setMobileTab(next.baseRoute.tab);
      }
      return next;
    });
  };

  const openMenuOverlay = (id: OverlayId, setOpen: (open: boolean) => void): void => {
    setNavigation((prev) => navigateTo(prev, MENU_ROUTE));
    setMainMenuOpen(false);
    openAppOverlay(id, setOpen, MENU_ROUTE);
  };

  useEffect(() => {
    if (layoutMode !== 'tablet') setTabletDrawerOpen(false);
  }, [layoutMode]);

  const closeThemeStudioToMenu = (): void => closeAppOverlay('THEME_STUDIO', setThemeStudioOpen);

  const shellClassName = `app ot-app-shell responsive-shell app-shell-${layoutMode}${tabletDrawerOpen ? ' tablet-drawer-open' : ''}`;

  const handleObjectiveNavigate = (action: string) => {
    // MissionTracker passes stable step ids; banners pass semantic action ids.
    // Both resolve through this one contract so every one of the six quest rows is actionable.
    const resolved = ({
      briefing: 'INTEL',
      warroom: 'WAR_ROOM',
      floor: 'TRADE_FLOOR',
      thesis: 'ORDER_TICKET',
      position: 'OPTIONS_CHAIN',
      review: 'REVIEW',
    } as Record<string, string>)[action] ?? action;

    if (resolved === 'TRADE_FLOOR' || resolved === 'OPTIONS_CHAIN' || resolved === 'ORDER_TICKET') {
      navigateWorkspace('MARKET', 'trade');
    } else if (resolved === 'ADVANCE_MARKET') {
      void advanceMarket('NEXT_NODE');
    } else if (resolved === 'SCANNER') {
      navigateWorkspace('MARKET', 'scanner');
    } else if (resolved === 'WAR_ROOM') {
      navigateWorkspace('HQ');
      openAppOverlay('WAR_ROOM', setWarRoomOpen, HQ_ROUTE, 'DECISION');
    } else if (resolved === 'DECISION') {
      navigateWorkspace('PORTFOLIO', 'portfolio');
    } else if (resolved === 'INTEL') {
      navigateWorkspace('INTEL', 'intel');
    } else if (resolved === 'REVIEW') {
      navigateWorkspace('REVIEW', 'portfolio');
    } else if (resolved === 'SURVIVAL') {
      setCrisisModalOpen(true);
    }
  };

  useEffect(() => {
    api.listCampaigns().then((items) => {
      setCampaigns(items);
      const storyDefaults = items.find((item) => item.id === 'r1');
      if (storyDefaults) {
        setAccountType(storyDefaults.default_account_type ?? (storyDefaults.account_default as AccountType) ?? 'Margin');
        setStartCash(storyDefaults.default_start_cash ?? 10_000_000);
      }
    }).catch(() => setCampaigns([]));
    api.listSaves().then(setSaveList).catch(() => setSaveList([]));
  }, []);

  // V28: keep a separate offline recovery slot. Explicit saves remain user-named;
  // autosave is only a safety net for refresh/background termination.
  useEffect(() => {
    if (!view?.state?.session_id) return;
    const timer = window.setTimeout(() => {
      void api.saveGame(view.state.session_id, 'V28_AUTOSAVE').catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [view?.state?.session_id, view?.state?.updated_at, view?.state?.game_day_index, view?.state?.cash, view?.state?.positions?.length]);

  useEffect(() => {
    const flush = () => {
      if (view?.state?.session_id) void api.saveGame(view.state.session_id, 'V28_AUTOSAVE').catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [view?.state?.session_id]);

  async function refreshSaveList(): Promise<void> {
    try {
      setSaveList(await api.listSaves());
    } catch {
      /* non-fatal */
    }
  }

  async function startGame(campaignId: string, acct: AccountType, cash: number, mode: GameMode = 'STORY_CAMPAIGN'): Promise<void> {
    const selectedCampaign = campaigns.find((campaign) => campaign.id === campaignId);
    if (selectedCampaign && !selectedCampaign.playable) {
      setLastOrderMessage(`该战役没有完整本地历史数据包，当前不能开始：${selectedCampaign.note}`);
      return;
    }
    const mySeq = ++startGameSeq.current;
    setBusy(true);
    setStartupError('');
    try {
      const v = await api.newGame({ campaign_id: campaignId, mode, account_type: acct, start_cash: cash });
      const sid = v.state.session_id;
      const [marketData, chars, fundsData] = await Promise.all([
        api.getMarket(sid),
        api.getCharacters(sid),
        api.getFunds(sid),
      ]);
      if (mySeq !== startGameSeq.current) return;
      setView(v);
      setReviewOriginIndex(null);
      setNodes(marketData.nodes);
      setEvents(marketData.events);
      setCharacters(chars);
      setFunds({ ranking: fundsData.ranking as unknown as AIFundRankingEntry[] });
      setSelectedQuote(null);
      setPendingDecision(null);
      setShowdownPrefill(null);
      setSelectedExpiration(EXPIRATIONS[campaignId]?.[0] ?? '');
      setSide('both');
      setAdvancing(false);
      setLastOrderMessage('');
      setAttachedThesis(null);
      setActiveWorkspace(mode === 'STORY_CAMPAIGN' ? 'HQ' : 'MARKET');
      setShowFundHQ(mode === 'STORY_CAMPAIGN');
    } catch (e) {
      if (mySeq === startGameSeq.current) {
        const message = e instanceof Error ? e.message : String(e);
        setLastOrderMessage(message);
        setStartupError(message);
        setMainMenuOpen(true);
      }
    } finally {
      if (mySeq === startGameSeq.current) setBusy(false);
    }
  }

  // startGame is invoked explicitly by handleStartNewGame and handleLoad.

  async function refreshMarketAndFunds(sid: string): Promise<void> {
    const [marketData, fundsData] = await Promise.all([api.getMarket(sid), api.getFunds(sid)]);
    setNodes(marketData.nodes);
    setEvents(marketData.events);
    setFunds({ ranking: fundsData.ranking as unknown as AIFundRankingEntry[] });
  }

  // MARKET CLOCK -- the market is PAUSED by default and wall-clock time never moves it.
  // There is deliberately NO interval/timer anywhere in this file: a player can sit and
  // read for an hour and the historical node, prices and valuation date will not change.
  // Forward movement happens ONLY here, through /advance, which walks real historical
  // nodes one at a time and evaluates pause triggers between them.
  async function advanceMarket(mode: AdvanceMode = 'NEXT_NODE'): Promise<void> {
    if (!sessionId || advancing || reviewOriginIndex !== null) return;
    setAdvancing(true);
    const mySeq = ++startGameSeq.current;
    try {
      // V21：改走盘中揭示推进。有盘中数据的日子会在当天内部逐个时点停下来，
      // 没有的日子行为与 advanceMarket 完全一致，所以可以无条件替换。
      const v = await api.advanceMarketReveal(sessionId, mode);
      if (mySeq !== startGameSeq.current) return;
      setView(v);
      await refreshMarketAndFunds(sessionId);
      if (v.market_clock?.is_final_node) {
        setOutcomeModalOpen(true);
      }
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancing(false);
    }
  }

  /** 对盘中时点作出决定。决定落定后立刻刷新，让后果与账本同步显示。 */
  async function handleMarketWindowDecision(
    windowId: string,
    action: string,
    reason: string
  ): Promise<void> {
    if (!sessionId || advancing || reviewOriginIndex !== null) return;
    setAdvancing(true);
    try {
      const r = await api.resolveMarketWindowDecision(sessionId, windowId, action, reason);
      setView(r.state);
      setLastOrderMessage(r.message);
      if (action === 'MANAGE_RISK') {
        const position = r.state.state.positions[0];
        const quote = position
          ? chain.find((candidate) =>
              canonicalContractKey(candidate) === canonicalContractKey(position, candidate.underlying))
          : null;
        if (position && quote) {
          const closeSide = position.is_short || position.short ? 'buy_to_close' : 'sell_to_close';
          setSelectedQuote(quote);
          setQty(Math.max(1, position.qty));
          setOrderKind('Market');
          setLimitPrice(null);
          setRiskClosePrefill({ positionId: position.id, side: closeSide });
          navigateWorkspace('MARKET', 'trade');
          if (window.innerWidth < 1024) setMobileSheetOpen(true);
          setLastOrderMessage(`已预选 ${quote.type.toUpperCase()} ${quote.strike}，请确认${closeSide === 'sell_to_close' ? '卖出平仓' : '买入平仓'}。`);
        } else {
          setLastOrderMessage(`${r.message} 当前期权链没有可匹配的持仓合约，请到仓位页手动管理。`);
        }
      }
      await refreshMarketAndFunds(sessionId);
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancing(false);
    }
  }

  // MainMenuModal is rendered from TWO places (the cold-start early return when there is
  // no session yet, and the in-game menu). They were byte-identical copies, which is how
  // the guided-onboarding flag ended up wired to only one of them. One handler now.
  function handleStartNewGame(mode: GameMode, guided?: boolean): void {
    setMainMenuOpen(false);
    setGameMode(mode);
    setActiveWorkspace(mode === 'STORY_CAMPAIGN' ? 'HQ' : 'MARKET');
    setShowFundHQ(mode === 'STORY_CAMPAIGN');
    setOnboardingActive(Boolean(guided));
    setOnboardingStep(0);
    // EP01 is the NVDA / Maya opening. Do not silently switch the story gate to
    // the sparse SPX event campaign, otherwise the mission text and the chart
    // disagree before the player has made a decision.
    const targetCampaign = mode === 'STORY_CAMPAIGN' ? 'r1' : selectedCampaignId;
    setSelectedCampaignId(targetCampaign);
    void startGame(targetCampaign, accountType, startCash, mode);
  }

  // Backward-only history scrubbing. Review is read-only: it never moves the
  // live session, and the forward button becomes the explicit exit path.
  async function reviewNode(index: number): Promise<void> {
    if (!sessionId || !view || advancing) return;
    const marketRevealActive =
      view.market_clock?.node_granularity === 'EVENT_WINDOW';
    const liveIndex = reviewOriginIndex ?? view.state.game_day_index;
    if (marketRevealActive || liveIndex <= 0) return;
    const target = Math.max(0, Math.min(liveIndex, index));
    if (target >= liveIndex || target === view.state.game_day_index) return;
    const origin = reviewOriginIndex ?? liveIndex;
    const mySeq = ++startGameSeq.current;
    const enteringReview = reviewOriginIndex === null;
    if (enteringReview) setReviewOriginIndex(origin);
    setAdvancing(true);
    try {
      const v = await api.reviewNode(sessionId, target);
      if (mySeq !== startGameSeq.current) return;
      setView(v);
    } catch (e) {
      if (enteringReview) setReviewOriginIndex(null);
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (mySeq === startGameSeq.current) setAdvancing(false);
    }
  }

  async function exitReview(): Promise<void> {
    if (!sessionId || reviewOriginIndex === null || advancing) return;
    const mySeq = ++startGameSeq.current;
    setAdvancing(true);
    try {
      // The live session was never rewound; re-reading it restores the live
      // clock, pause reasons, positions and the campaign-only chart boundary.
      const v = await api.getGame(sessionId);
      if (mySeq !== startGameSeq.current) return;
      setView(v);
      setReviewOriginIndex(null);
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      if (mySeq === startGameSeq.current) setAdvancing(false);
    }
  }

  function reviewBlocksAction(): boolean {
    if (!isReviewing) return false;
    setLastOrderMessage('当前是历史回看，只读；先退出回看再操作。');
    return true;
  }

  function formatExecutionMessage(message: string, executionLabel?: string): string {
    const labels: Record<string, string> = {
      'SIMULATED EXECUTION': '模拟成交 / SIMULATED EXECUTION',
      'SIMULATED EXECUTION (MARGIN)': '模拟成交（保证金） / SIMULATED EXECUTION (MARGIN)',
      'REAL QUOTE FILL': '真实报价成交 / REAL QUOTE FILL',
      'ESTIMATED MODEL FILL': '估算模型成交 / ESTIMATED MODEL FILL',
      'DERIVED MODEL COMBINATION FILL': '推导模型组合成交 / DERIVED MODEL COMBINATION FILL',
      'PHYSICAL EXERCISE · DERIVED SETTLEMENT': '实物行权 · 推导结算 / PHYSICAL EXERCISE · DERIVED SETTLEMENT',
      'STRATEGY CLOSE · DERIVED MODEL': '组合平仓 · 推导模型 / STRATEGY CLOSE · DERIVED MODEL',
      PRICE_UNAVAILABLE: '无可执行价格 / PRICE UNAVAILABLE',
      'PRICE UNAVAILABLE': '无可执行价格 / PRICE UNAVAILABLE',
      DESK_STOPPED: '交易台已冻结 / DESK STOPPED',
      BRIEFING_REQUIRED: '需先完成简报 / BRIEFING REQUIRED',
      THESIS_REQUIRED: '需先提交论点 / THESIS REQUIRED',
    };
    const label = executionLabel ? labels[executionLabel] : undefined;
    return label ? `${label} · ${message}` : message;
  }

  // Margin Call: section 41's explicit 5-step sequence -- duck the current music, phone
  // vibration, a very quiet low hit, the Margin UI (already conditional on margin_call_active
  // elsewhere), then bgm_pressure fading in slowly. Deliberately no siren/alarm/casino cue.
  // Fires once per margin-call episode, not on every re-render while it stays active.
  useEffect(() => {
    if (view?.margin_call_active) {
      if (marginCallFiredRef.current) return;
      marginCallFiredRef.current = true;
      marginCallSequenceActiveRef.current = true;
      audioManager.duckMusic();
      audioManager.playSfx('sfx_phone_vibration');
      window.setTimeout(() => audioManager.playSfx('sfx_low_hit', 0.4), 500);
      window.setTimeout(() => {
        audioManager.playBgm('bgm_pressure', 1600);
        marginCallSequenceActiveRef.current = false;
      }, 1400);
    } else {
      marginCallFiredRef.current = false;
    }
  }, [view?.margin_call_active]);

  useEffect(() => {
    if (!view?.margin_call_active) setMarginDramaAcknowledged(false);
  }, [view?.margin_call_active]);

  useEffect(() => {
    if (marginCallSequenceActiveRef.current) return; // the sequence above owns BGM right now
    if (mainMenuOpen) {
      audioManager.playBgm('bgm_minimal_drumless');
    } else if (view?.margin_call_active) {
      audioManager.playBgm('bgm_pressure');
    } else if (
      view?.state.evidence_state &&
      !['CLEAN', 'SUSPICIOUS', 'INTERNAL_CONCERN'].includes(view.state.evidence_state.investigation_stage)
    ) {
      // Section 40: real REGULATORY_INQUIRY+ escalation only -- never the ordinary illegal
      // source proposal stage, which stays on office ambience per section 40.
      audioManager.playBgm('bgm_investigation');
    } else if (
      crisisModalOpen ||
      view?.season_outcome ||
      reviewModalOpen ||
      humanActionOpen ||
      warRoomOpen ||
      (showFundHQ && gameMode === 'STORY_CAMPAIGN') ||
      wallStreetOpen ||
      policyDeskOpen ||
      marketPulseOpen
    ) {
      // Section 34 NO MUSIC STATES: Fund HQ / War Room / LP-style panels / Human Action /
      // 360 Review / season endings run on ambience alone. No locked track exists for a
      // victory or defeat cue, and section 31 explicitly bans a victory jingle -- silence
      // (with a fade, not a cut) is the honest choice here, not a guessed substitute.
      audioManager.fadeOutBgm();
    } else if (mobileTab === 'scanner') {
      // Section 33 MUSIC 02: "很低音量" -- explicitly quieter than the other four tracks.
      audioManager.playBgm('bgm_research_idm', 900, 0.4);
    } else {
      // Trading Floor: bgm_position_minimal only once there's a real open position or the
      // player is actively building an order; flat/empty book stays on ambience alone.
      const hasRealPosition = (view?.state.positions.length ?? 0) > 0;
      const buildingOrder = !!selectedExpiration;
      if (hasRealPosition || buildingOrder) {
        audioManager.playBgm('bgm_position_minimal');
      } else {
        audioManager.fadeOutBgm();
      }
    }
  }, [
    mainMenuOpen,
    crisisModalOpen,
    view?.margin_call_active,
    view?.season_outcome,
    view?.state.evidence_state?.investigation_stage,
    view?.state.positions.length,
    warRoomOpen,
    wallStreetOpen,
    policyDeskOpen,
    marketPulseOpen,
    humanActionOpen,
    reviewModalOpen,
    showFundHQ,
    gameMode,
    mobileTab,
    selectedExpiration,
  ]);

  async function handleSpendPoliticalCapital(contactId: string): Promise<string> {
    if (reviewBlocksAction()) return '';
    if (!sessionId) return '';
    const res = await api.spendPoliticalCapital(sessionId, contactId);
    setView(res.state);
    return res.briefing_message;
  }

  async function handleResolveHumanAction(eventId: string, choiceId: string): Promise<string> {
    if (reviewBlocksAction()) return '';
    if (!sessionId) return '';
    const res = await api.resolveHumanAction(sessionId, eventId, choiceId);
    setView(res.state);
    return res.message;
  }

  async function handleResolveWarRoomChoice(choiceId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    try {
      const res = await api.resolveWarRoomChoice(sessionId, choiceId);
      setView(res.state);
      setLastOrderMessage(res.message);
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleBankInteract(bankId: string, actionId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    const res = await api.bankInteract(sessionId, bankId, actionId);
    setView(res.state);
    setLastOrderMessage(res.message);
  }

  useEffect(() => {
    if (!sessionId || !selectedExpiration) return;
    api
      .getChain(sessionId, selectedExpiration, side.toLowerCase() as any)
      .then((res) => setChain(res.quotes))
      .catch(() => setChain([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, selectedExpiration, side, dayIndex, view?.state.real_options_loaded]);

  useEffect(() => {
    if (!view) return;
    for (const event of view.pending_story_public) {
      if (!seenStoryEventIds.current.has(event.id)) {
        seenStoryEventIds.current.add(event.id);
        audioManager.playSfx(sfxForIntelClass(event.intel_class));
        audioManager.duckAmbience();
      }
    }
  }, [view]);

  useEffect(() => {
    if (!sessionId || !node) {
      audioManager.stopAmbience();
      return;
    }
    // Only 2 ambience tracks are locked: amb_main_office (the main environment bed for Fund HQ
    // and Trading Floor) and amb_private_room (War Room / Private Terminal / LP Meeting / Trade
    // Review). No panic-tier ambience asset was given, so this no longer switches on VIX/panic.
    // amb_main_office's own locked usage line names Fund HQ explicitly ("Fund HQ, Trading
    // Floor base ambience -- 这是主环境底"); amb_private_room is reserved for the narrower
    // War Room / Trade Review contexts, not the whole Fund HQ screen.
    const inPrivateContext = reviewModalOpen || warRoomOpen;
    audioManager.playAmbience(inPrivateContext ? 'amb_private_room' : 'amb_main_office');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, node?.date, reviewModalOpen, warRoomOpen]);

  // Section 36 usage lines name these as scene-transition cues ("War Room / private meeting
  // transition", "review transition") -- fire once on entry, not on every render while open.
  useEffect(() => {
    if (warRoomOpen) {
      if (!warRoomEnteredRef.current) {
        warRoomEnteredRef.current = true;
        audioManager.playSfx('sfx_glass_door');
      }
    } else {
      warRoomEnteredRef.current = false;
    }
  }, [warRoomOpen]);

  useEffect(() => {
    if (reviewModalOpen) {
      if (!reviewOpenedRef.current) {
        reviewOpenedRef.current = true;
        audioManager.playSfx('sfx_paper_handling');
      }
    } else {
      reviewOpenedRef.current = false;
    }
  }, [reviewModalOpen]);

  async function handleRestart(): Promise<void> {
    await startGame(selectedCampaignId, accountType, startCash, gameMode);
  }

  function buildOrder(side_: OrderRequest['side']): OrderRequest | null {
    if (!liveSelectedQuote && side_ !== 'buy_shares' && side_ !== 'sell_shares') {
      setLastOrderMessage('先从期权链选择一张合约。');
      return null;
    }
    return {
      side: side_,
      type: (liveSelectedQuote?.type || 'call') as OptionType,
      strike: liveSelectedQuote?.strike || 0,
      expiration: liveSelectedQuote?.expiration || selectedExpiration,
      qty,
      order_kind: orderKind,
      limit_price: orderKind === 'Limit' ? limitPrice : null,
      thesis: attachedThesis,
    };
  }

  async function submitOrder(side_: OrderRequest['side'], orderOverride?: OrderRequest): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    if (orderSubmitting) return;
    const order = orderOverride ?? buildOrder(side_);
    if (!order) return;
    const client_order_id = order.client_order_id ?? (
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const request = { ...order, client_order_id };
    setOrderSubmitting(true);
    try {
    setLastTradeConfirmation(null);
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    const { state, result } = await api.placeOrder(sessionId, request);
    setView(state);
    setLastOrderMessage(formatExecutionMessage(result.message, result.execution_label));
    if (result.accepted) {
      setShowdownPrefill(null);
      setRiskClosePrefill(null);
      setLastTradeConfirmation({
        fillPrice: result.fill_price, totalCost: result.total_cost,
        cashBefore, cashAfter: state.state.cash, navBefore, navAfter: state.equity,
        side: side_,
      });
      triggerTradeFlash();
      audioManager.playSfx('sfx_notification', 0.5);
      if (Math.random() < 0.15) audioManager.playSfx('amb_desk_activity', 0.4);
      setAttachedThesis(null);
      if (result.trade_review_id && state.state.trade_reviews.length > 0) {
        const found = state.state.trade_reviews.find((r) => r.trade_id === result.trade_review_id);
        if (found) {
          setSelectedReview(found);
          setReviewModalOpen(true);
        }
      }
    } else {
      setLastTradeConfirmation(null);
      audioManager.playSfx('sfx_rejected');
    }
    if (sessionId) void refreshMarketAndFunds(sessionId);
    } finally {
      setOrderSubmitting(false);
    }
  }

  async function handleClosePosition(position: Position): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    const isShort = Boolean(position.is_short || position.short);
    const side = isShort ? 'buy_to_close' : 'sell_to_close';
    const { state, result } = await api.placeOrder(sessionId, {
      side,
      type: position.type as OptionType,
      strike: position.strike,
      expiration: position.expiration,
      qty: position.qty,
      order_kind: 'Market',
    });
    setView(state);
    setLastOrderMessage(formatExecutionMessage(result.message, result.execution_label));
    if (result.accepted) {
      setLastTradeConfirmation({
        fillPrice: result.fill_price, totalCost: result.total_cost,
        cashBefore, cashAfter: state.state.cash, navBefore, navAfter: state.equity, side,
      });
      triggerTradeFlash();
      audioManager.playSfx('sfx_notification', 0.5);
    } else {
      setLastTradeConfirmation(null);
      audioManager.playSfx('sfx_rejected');
    }
    void refreshMarketAndFunds(sessionId);
  }

  async function handleExercisePosition(position: Position): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || position.is_short || position.short) return;
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    const { state, result } = await api.placeOrder(sessionId, {
      side: 'exercise_long_option',
      type: position.type as OptionType,
      strike: position.strike,
      expiration: position.expiration,
      qty: position.qty,
      order_kind: 'Market',
    });
    setView(state);
    setLastOrderMessage(formatExecutionMessage(result.message, result.execution_label));
    if (result.accepted) {
      setLastTradeConfirmation({
        fillPrice: result.fill_price, totalCost: result.total_cost,
        cashBefore, cashAfter: state.state.cash, navBefore, navAfter: state.equity,
        side: 'exercise_long_option',
      });
      triggerTradeFlash();
      audioManager.playSfx('sfx_notification', 0.5);
    } else {
      setLastTradeConfirmation(null);
      audioManager.playSfx('sfx_rejected');
    }
    void refreshMarketAndFunds(sessionId);
  }

  async function handleCloseStrategy(_strategyId: string, legs: Position[]): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || legs.length === 0) return;
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    const messages: string[] = [];
    // `view` is a closure capture and does NOT update across the awaits below, so the
    // post-trade figures must come from the last engine response, not from `view`.
    let latest: GameStateView | null = null;
    for (const leg of legs) {
      const isShort = Boolean(leg.is_short || leg.short);
      const { state, result } = await api.placeOrder(sessionId, {
        side: isShort ? 'buy_to_close' : 'sell_to_close',
        type: leg.type as OptionType,
        strike: leg.strike,
        expiration: leg.expiration,
        qty: leg.qty,
        order_kind: 'Market',
      });
      setView(state);
      latest = state;
      if (!result.accepted) {
        setLastOrderMessage(`组合平仓中断：${result.message}`);
        setLastTradeConfirmation(null);
        audioManager.playSfx('sfx_rejected');
        return;
      }
      messages.push(`${leg.type?.toUpperCase()} ${leg.strike} @ ${result.fill_price?.toFixed(2) ?? '?'}`);
    }
    triggerTradeFlash();
    setLastOrderMessage(`组合平仓完成：${messages.join(' + ')}。`);
    setLastTradeConfirmation({
      fillPrice: 0, totalCost: 0,
      cashBefore, cashAfter: latest?.state.cash ?? cashBefore,
      navBefore, navAfter: latest?.equity ?? navBefore,
      side: 'close_strategy',
    });
    audioManager.playSfx('sfx_notification', 0.5);
    void refreshMarketAndFunds(sessionId);
  }

  async function submitStrategy(strategyKind: 'VERTICAL_SPREAD' | 'STRADDLE', legs: OrderRequest['strategy_legs']): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !liveSelectedQuote || !legs?.length) {
      setLastOrderMessage('先选择一张期权，组合策略需要可验证的第二腿。');
      return;
    }
    const side = strategyKind === 'STRADDLE' ? 'buy_straddle' : 'buy_vertical_spread';
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    const { state, result } = await api.placeOrder(sessionId, {
      side,
      type: liveSelectedQuote.type,
      strike: liveSelectedQuote.strike,
      expiration: liveSelectedQuote.expiration,
      qty,
      order_kind: orderKind,
      limit_price: null,
      strategy_kind: strategyKind,
      strategy_legs: legs,
      thesis: attachedThesis,
    });
    setView(state);
    setLastOrderMessage(formatExecutionMessage(result.message, result.execution_label));
    if (result.accepted) {
      setLastTradeConfirmation({
        fillPrice: result.fill_price, totalCost: result.total_cost,
        cashBefore, cashAfter: state.state.cash, navBefore, navAfter: state.equity, side,
      });
      triggerTradeFlash();
      setAttachedThesis(null);
      audioManager.playSfx('sfx_notification', 0.5);
    } else {
      setLastTradeConfirmation(null);
      audioManager.playSfx('sfx_rejected');
    }
    if (sessionId) void refreshMarketAndFunds(sessionId);
  }

  function handleVerticalSpread(): void {
    if (!liveSelectedQuote) return;
    const sameType = chain
      .filter((quote) => quote.type === liveSelectedQuote.type && quote.expiration === liveSelectedQuote.expiration)
      .sort((a, b) => a.strike - b.strike);
    const index = sameType.findIndex((quote) => quote.strike === liveSelectedQuote.strike);
    const other = sameType[liveSelectedQuote.type === 'call' ? index + 1 : index - 1] ?? sameType[index + (index > 0 ? -1 : 1)];
    if (!other) {
      setLastOrderMessage('当前期权链没有相邻 Strike，不能伪造 Vertical Spread。');
      return;
    }
    void submitStrategy('VERTICAL_SPREAD', [
      { type: liveSelectedQuote.type, strike: liveSelectedQuote.strike, expiration: liveSelectedQuote.expiration, side: 'LONG' },
      { type: other.type, strike: other.strike, expiration: other.expiration, side: 'SHORT' },
    ]);
  }

  function handleStraddle(): void {
    if (!liveSelectedQuote) return;
    const other = chain.find((quote) => quote.expiration === liveSelectedQuote.expiration && quote.strike === liveSelectedQuote.strike && quote.type !== liveSelectedQuote.type);
    if (!other) {
      setLastOrderMessage('当前期权链没有同 Strike 的另一种期权，不能伪造 Straddle。');
      return;
    }
    void submitStrategy('STRADDLE', [
      { type: liveSelectedQuote.type, strike: liveSelectedQuote.strike, expiration: liveSelectedQuote.expiration, side: 'LONG' },
      { type: other.type, strike: other.strike, expiration: other.expiration, side: 'LONG' },
    ]);
  }

  function dismissActivePositionDecision(): void {
    if (!activePositionDecisionReason) return;
    const key = positionDecisionKey(activePositionDecisionReason);
    setDismissedPositionDecisions((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  async function handlePositionDecisionHold(): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !activePositionDecisionReason || !activePositionDecisionPosition) return;
    setPositionDecisionBusy(true);
    try {
      const pos = activePositionDecisionPosition;
      const detail =
        `unrealized_pl=${(activePositionDecisionUnrealizedPl ?? 0).toFixed(2)}, ` +
        `mfe_at_decision=${pos.peak_unrealized_pl.toFixed(2)}, ` +
        `thesis_state=${activePositionDecisionThesisSummary || 'NONE'}, ` +
        `market_node=${view?.state.market_clock?.current_node_index ?? 'unknown'}`;
      const v = await api.recordDecision(sessionId, {
        category: 'POSITION_DECISION_HOLD',
        headline: activePositionDecisionReason.headline,
        detail,
        position_id: pos.id,
      });
      setView(v);
      dismissActivePositionDecision();
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setPositionDecisionBusy(false);
    }
  }

  async function handlePositionDecisionOrder(full: boolean): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !activePositionDecisionPosition) return;
    const pos = activePositionDecisionPosition;
    const qty = full ? pos.qty : Math.floor(pos.qty / 2);
    if (qty <= 0) return;
    setPositionDecisionBusy(true);
    const cashBefore = view?.state.cash ?? 0;
    const navBefore = view?.equity ?? 0;
    try {
      const { state, result } = await api.placeOrder(sessionId, {
        side: 'sell_to_close',
        type: pos.type,
        strike: pos.strike,
        expiration: pos.expiration,
        qty,
        order_kind: 'Market',
      });
      setView(state);
      setLastOrderMessage(formatExecutionMessage(result.message, result.execution_label));
      if (result.accepted) {
        setLastTradeConfirmation({
          fillPrice: result.fill_price, totalCost: result.total_cost,
          cashBefore, cashAfter: state.state.cash, navBefore, navAfter: state.equity,
          side: 'sell_to_close',
        });
        triggerTradeFlash();
        audioManager.playSfx('sfx_notification', 0.5);
        if (Math.random() < 0.15) audioManager.playSfx('amb_desk_activity', 0.4);
        if (result.trade_review_id && state.state.trade_reviews.length > 0) {
          const found = state.state.trade_reviews.find((r) => r.trade_id === result.trade_review_id);
          if (found) {
            setSelectedReview(found);
            setReviewModalOpen(true);
          }
        }
      } else {
        audioManager.playSfx('sfx_rejected');
      }
      dismissActivePositionDecision();
      if (sessionId) void refreshMarketAndFunds(sessionId);
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setPositionDecisionBusy(false);
    }
  }

  async function handleStoryChoice(eventId: string, choiceId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    const v = await api.resolveStory(sessionId, eventId, choiceId);
    setView(v);
    setDeferredStoryIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }

  async function handleDeferStory(eventId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    setDeferredStoryIds((prev) => new Set(prev).add(eventId));
    if (!sessionId) return;
    const v = await api.deferStory(sessionId, eventId);
    setView(v);
  }

  async function handleResumeStory(eventId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    setDeferredStoryIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    const v = await api.resumeStory(sessionId, eventId);
    setView(v);
  }

  function markDramaDayHandled(): void {
    if (!dramaDayKey) return;
    setDramaHandledDayKeys((prev) => new Set(prev).add(dramaDayKey));
  }

  function handleDramaDefer(): void {
    if (!dramaInterrupt || dramaInterrupt.mandatory) return;
    markDramaDayHandled();
    if (dramaInterrupt.eventId) void handleDeferStory(dramaInterrupt.eventId);
  }

  function handleDramaTradeEntry(): void {
    if (!dramaInterrupt) return;
    markDramaDayHandled();
    navigateWorkspace('MARKET', 'trade');
  }

  function handleDramaMarginEntry(): void {
    if (!dramaInterrupt || dramaInterrupt.kind !== 'MARGIN_BREACH') return;
    setMarginDramaAcknowledged(true);
    setCrisisModalOpen(true);
  }

  function handleDramaStoryChoice(eventId: string, choiceId: string): void {
    markDramaDayHandled();
    void handleStoryChoice(eventId, choiceId);
  }

  async function recordShowdownChoice(action: ShowdownAction): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !positionShowdown) return;
    const detail = [
      `action=${action}`,
      `ticker=${positionShowdown.ticker}`,
      `direction=${positionShowdown.direction}`,
      `revealed_high=${positionShowdown.sessionHigh.toFixed(4)}`,
      `revealed_price=${positionShowdown.currentPrice.toFixed(4)}`,
      `drawdown_pct=${positionShowdown.drawdownPct.toFixed(4)}`,
      `threshold_pct=${positionShowdown.thresholdPct.toFixed(2)}`,
      'source=VISIBLE_PRICE_BARS_ONLY',
    ].join(', ');
    const next = await api.recordDecision(sessionId, {
      category: 'INTRADAY_SHOWDOWN',
      headline: `${positionShowdown.ticker} 盘中持仓对决 · ${action}`,
      detail,
      position_id: positionShowdown.positionId,
      game_date: positionShowdown.gameDate,
    });
    setView(next);
  }

  async function loadShowdownChain(expiration: string): Promise<OptionQuote[]> {
    if (!sessionId) return [];
    const res = await api.getChain(sessionId, expiration, 'both');
    setSelectedExpiration(expiration);
    setSide('both');
    setChain(res.quotes);
    return res.quotes;
  }

  function nearestShowdownQuote(quotes: OptionQuote[], type: 'call' | 'put', targetStrike: number): OptionQuote | null {
    const sameType = quotes.filter((quote) => String(quote.type).toLowerCase() === type);
    if (!sameType.length) return null;
    return sameType.reduce((best, quote) =>
      Math.abs(quote.strike - targetStrike) < Math.abs(best.strike - targetStrike) ? quote : best,
    sameType[0]);
  }

  async function prefillShowdownOrder(action: 'HEDGE' | 'ADD'): Promise<void> {
    if (!sessionId || !positionShowdown) return;
    const expiration = positionShowdown.expiration || selectedExpiration;
    const quotes = await loadShowdownChain(expiration);
    if (!quotes.length) {
      setLastOrderMessage('桌面对决已记录，但当前期权链不可用，无法伪造预填订单。');
      return;
    }

    const directionalType: 'call' | 'put' = positionShowdown.direction === 'BULLISH' ? 'call' : 'put';
    const targetType: 'call' | 'put' = action === 'HEDGE'
      ? (directionalType === 'call' ? 'put' : 'call')
      : directionalType;

    let target: OptionQuote | null = null;
    if (action === 'ADD' && !positionShowdown.short && positionShowdown.positionType === targetType) {
      target = quotes.find((quote) =>
        String(quote.type).toLowerCase() === targetType &&
        quote.strike === positionShowdown.strike &&
        quote.expiration === expiration,
      ) ?? null;
    }
    target ??= nearestShowdownQuote(quotes, targetType, positionShowdown.currentPrice);

    if (!target) {
      setLastOrderMessage(`桌面对决已记录，但 ${expiration} 没有可用 ${targetType.toUpperCase()} 合约，未伪造报价。`);
      return;
    }

    setSelectedQuote(target);
    setQty(action === 'HEDGE' ? Math.max(1, positionShowdown.qty) : Math.max(1, Math.ceil(positionShowdown.qty / 2)));
    setOrderKind('Market');
    setLimitPrice(null);
    setShowdownPrefill({ action, positionId: positionShowdown.positionId });
    navigateWorkspace('MARKET', 'trade');
    setLastOrderMessage(
      action === 'HEDGE'
        ? `桌面对决：已预填 ${target.type.toUpperCase()} ${target.strike} 对冲单。确认后点击「买入开仓」。`
        : `桌面对决：已预填 ${target.type.toUpperCase()} ${target.strike} 加仓单。确认后点击「买入开仓」。`,
    );
  }

  async function resolveShowdownRevealGate(action: ShowdownAction): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !positionShowdown) return;
    const reveal = (view?.state as any)?.market_reveal;
    if (!reveal || reveal.current_window_index < 0) return;
    const window = reveal.windows?.[reveal.current_window_index];
    if (!window || window.resolved) return;
    const revealAction = action === 'STOP_OUT' ? 'STOP'
      : action === 'HEDGE' ? 'MANAGE_RISK'
      : action === 'ADD' ? 'REVISE'
      : 'HOLD';
    const reason = `桌面对决 ${action}：${positionShowdown.ticker} 自已揭示盘中高点回撤 ${positionShowdown.drawdownPct.toFixed(2)}%，仅依据 visible_price_bars。`;
    const resolved = await api.resolveMarketWindowDecision(sessionId, window.window_id, revealAction, reason);
    setView(resolved.state);
  }

  async function handleShowdownChoice(action: ShowdownAction): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId || !positionShowdown || showdownActionBusyRef.current) return;
    showdownActionBusyRef.current = true;
    const position = view?.state.positions.find((candidate) => candidate.id === positionShowdown.positionId) ?? null;
    try {
      await resolveShowdownRevealGate(action);
      await recordShowdownChoice(action);

      if (action === 'HOLD') {
        setShowdownPrefill(null);
        setLastOrderMessage(`桌面对决：维持 ${positionShowdown.positionId} 不动。选择已写入决策时间线。`);
        return;
      }

      if (action === 'STOP_OUT') {
        if (!position) {
          setLastOrderMessage('桌面对决止损失败：对应持仓已经不存在。');
          return;
        }
        const side: OrderRequest['side'] = Boolean(position.short ?? position.is_short) ? 'buy_to_close' : 'sell_to_close';
        const cashBefore = view?.state.cash ?? 0;
        const navBefore = view?.equity ?? 0;
        const { state, result } = await api.placeOrder(sessionId, {
          side,
          type: String(position.type).toLowerCase() as OptionType,
          strike: position.strike,
          expiration: position.expiration,
          qty: position.qty,
          order_kind: 'Market',
        });
        setView(state);
        setLastOrderMessage(`桌面对决止损：${result.message}`);
        if (result.accepted) {
          setShowdownPrefill(null);
          setLastTradeConfirmation({
            fillPrice: result.fill_price,
            totalCost: result.total_cost,
            cashBefore,
            cashAfter: state.state.cash,
            navBefore,
            navAfter: state.equity,
            side,
          });
          triggerTradeFlash();
          audioManager.playSfx('sfx_notification', 0.5);
        } else {
          audioManager.playSfx('sfx_rejected');
        }
        return;
      }

      setShowdownPrefill({ action, positionId: positionShowdown.positionId });
      await prefillShowdownOrder(action);
    } catch (e) {
      setLastOrderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      showdownActionBusyRef.current = false;
    }
  }

  async function handleAdvanceEpisode(): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    const v = await api.advanceEpisode(sessionId);
    setView(v);
    setOutcomeModalOpen(false);
    setActiveWorkspace('HQ');
    setShowFundHQ(true);
    await refreshMarketAndFunds(sessionId);
  }

  async function handleExecuteSurvival(choiceId: string): Promise<void> {
    if (reviewBlocksAction()) return;
    if (!sessionId) return;
    const res = await api.executeSurvival(sessionId, choiceId);
    setView(res.state);
    setCrisisModalOpen(false);
    setLastOrderMessage(res.message);
  }

  async function handleSave(): Promise<void> {
    if (!sessionId) return;
    await api.saveGame(sessionId, saveSlot);
    audioManager.playSfx('save');
    await refreshSaveList();
  }

  async function handleLoad(slot: string): Promise<void> {
    const mySeq = ++startGameSeq.current;
    const v = await api.loadGame(slot);
    if (mySeq !== startGameSeq.current) return;
    setView(v);
    setReviewOriginIndex(null);
    audioManager.playSfx('load');
    await refreshMarketAndFunds(v.state.session_id);
    setActiveWorkspace(v.state.mode === 'STORY_CAMPAIGN' ? 'HQ' : 'MARKET');
    setShowFundHQ(v.state.mode === 'STORY_CAMPAIGN');
    setMobileTab('trade');
    setSelectedQuote(null);
    setPendingDecision(null);
    setShowdownPrefill(null);
    setRiskClosePrefill(null);
    setSelectedExpiration(EXPIRATIONS[v.state.campaign_id]?.[0] ?? '');
  }

  const liveSelectedQuote = useMemo(() => {
    if (!selectedQuote) return null;
    return chain.find((q) => q.contract_key === selectedQuote.contract_key) ?? null;
  }, [selectedQuote, chain]);

  // Close actions are only meaningful for the exact selected contract. Keep the
  // guard in the UI as well as the engine: a disabled close cannot create a
  // rejected order-log row when a player is browsing an empty contract.
  const selectedCloseAvailability = useMemo(() => {
    if (!liveSelectedQuote) return { canSellToClose: false, canBuyToClose: false };
    const selectedKey = canonicalContractKey(liveSelectedQuote);
    const matching = (view?.state.positions ?? []).filter((position) =>
      position.qty > 0 &&
      canonicalContractKey(position, liveSelectedQuote.underlying) === selectedKey
    );
    return {
      canSellToClose: matching.some((position) => !position.is_short && !position.short),
      canBuyToClose: matching.some((position) => Boolean(position.is_short || position.short)),
    };
  }, [liveSelectedQuote, view?.state.positions]);

  const mainChange = useMemo(() => (node ? changeFor(node, prevNode, false) : { text: '', cls: '' as const }), [node, prevNode]);
  const secondaryChange = useMemo(
    () => (node ? changeFor(node, prevNode, true) : { text: '', cls: '' as const }),
    [node, prevNode],
  );
  const regime = useMemo(() => (node ? regimeFor(node) : { label: '—', cls: 'green' as const }), [node]);

  const positionMarksById = useMemo(() => {
    const map: Record<string, { position_id: string; mark: number; pl: number }> = {};
    for (const m of view?.position_marks ?? []) map[m.position_id] = m;
    return map;
  }, [view]);

  const sharesRow =
    view && view.state.shares > 0 && node
      ? {
          qty: view.state.shares,
          costBasis: view.state.share_cost_basis,
          mark: node.underlying_bar.close,
          pl: (node.underlying_bar.close - view.state.share_cost_basis) * view.state.shares,
        }
      : null;

  const selectedContractLabel = liveSelectedQuote
    ? `${liveSelectedQuote.type.toUpperCase()} ${liveSelectedQuote.strike} · ${liveSelectedQuote.expiration} · ${formatProvenance(liveSelectedQuote.provenance.source_type)}`
    : '点击期权链选择';

  const decisionPreview = useMemo<DecisionPreviewModel | null>(() => {
    if (!pendingDecision) return null;
    const q = liveSelectedQuote;
    const quoteType = q?.type?.toLowerCase();
    const contract = q
      ? `${q.underlying} ${q.type.toUpperCase()} ${q.strike} · ${q.expiration} · ×${qty}`
      : 'NO CONTRACT SELECTED / 尚未选择合约';
    const marketRef = q
      ? (orderKind === 'Limit' && limitPrice != null ? limitPrice : (quoteType === 'put' && pendingDecision === 'SELL_PUTS' ? q.bid : q.ask))
      : null;
    const notional = q && marketRef != null ? Math.abs(marketRef * qty * 100) : null;

    if (pendingDecision === 'BUY_CALLS') {
      const ready = Boolean(q && quoteType === 'call' && !openingBlocked);
      return {
        eyebrow: 'ACTION PREVIEW · BUY CALLS',
        title: ready ? 'BUY TO OPEN · LONG CALL' : 'SELECT A CALL CONTRACT',
        contract,
        detail: ready && notional != null
          ? `订单 ${orderKind} · 参考支出约 ${money(notional)}（${qty} 张；最终以撮合回报为准）`
          : '期权链已切到 CALL。先选一张合约；选择本身不会下单。',
        risk: openingBlocked
          ? '当前开仓门槛未满足：先完成必修简报并建立 Thesis。'
          : '最大损失通常为已付权利金；确认前可任意改选五键或合约。',
        confirmLabel: ready ? 'CONFIRM BUY CALLS' : 'SELECT CALL CONTRACT',
        confirmSublabel: ready ? 'Touch: hold to confirm · Desktop: click to confirm' : 'No trade will be placed',
        ready,
        irreversible: ready,
      };
    }

    if (pendingDecision === 'SELL_PUTS') {
      const ready = Boolean(q && quoteType === 'put' && !openingBlocked && !isIndexCampaign);
      const collateral = q ? Math.max(0, q.strike * qty * 100) : null;
      return {
        eyebrow: 'ACTION PREVIEW · SELL PUTS',
        title: ready ? 'SELL CASH-SECURED PUT' : 'SELECT A PUT CONTRACT',
        contract,
        detail: ready && notional != null
          ? `参考收取权利金约 ${money(notional)} · 现金担保名义额约 ${collateral != null ? money(collateral) : '—'}`
          : '期权链已切到 PUT。先选一张合约；选择本身不会建立空头。',
        risk: isIndexCampaign
          ? '当前指数战役禁止该写入动作。'
          : openingBlocked
          ? '当前开仓门槛未满足：先完成必修简报并建立 Thesis。'
          : '卖 Put 可能被指派；确认前可取消，确认后才进入真实撮合。',
        confirmLabel: ready ? 'CONFIRM SELL PUT' : 'SELECT PUT CONTRACT',
        confirmSublabel: ready ? 'Touch: hold to confirm · Cash-secured only' : 'No trade will be placed',
        ready,
        irreversible: ready,
      };
    }

    if (pendingDecision === 'SPREAD') {
      const ready = Boolean(q && !openingBlocked);
      return {
        eyebrow: 'ACTION PREVIEW · SPREAD',
        title: ready ? 'VERTICAL SPREAD · ADJACENT STRIKE' : 'SELECT A BASE CONTRACT',
        contract,
        detail: ready
          ? '系统只会使用同到期、同类型的相邻 Strike 作为第二腿；找不到就拒绝，不伪造合约。'
          : '先从期权链选择一张基础合约，再预览相邻 Strike。',
        risk: openingBlocked
          ? '当前开仓门槛未满足：先完成必修简报并建立 Thesis。'
          : '两腿会作为一个组合意图提交；确认前不会产生任何仓位变化。',
        confirmLabel: ready ? 'CONFIRM VERTICAL SPREAD' : 'SELECT BASE CONTRACT',
        confirmSublabel: ready ? 'Touch: hold to confirm' : 'No trade will be placed',
        ready,
        irreversible: ready,
      };
    }

    if (pendingDecision === 'HEDGE') {
      const ready = Boolean(q && quoteType === 'put' && !openingBlocked);
      return {
        eyebrow: 'ACTION PREVIEW · HEDGE',
        title: ready ? 'BUY PROTECTIVE PUT' : 'SELECT A PUT FOR HEDGE',
        contract,
        detail: ready && notional != null
          ? `参考支出约 ${money(notional)} · ${orderKind} · ×${qty}`
          : '先选择用于保护的 PUT；当前按钮只表达对冲意图。',
        risk: openingBlocked
          ? '当前开仓门槛未满足。'
          : '这是新增保护性 Put 敞口，不会自动卖出现有仓位。',
        confirmLabel: ready ? 'CONFIRM HEDGE PUT' : 'SELECT HEDGE CONTRACT',
        confirmSublabel: ready ? 'Touch: hold to confirm' : 'No trade will be placed',
        ready,
        irreversible: ready,
      };
    }

    return {
      eyebrow: 'ACTION PREVIEW · DO NOTHING',
      title: 'NO TRADE / KEEP CURRENT EXPOSURE',
      contract: 'No order · No position change',
      detail: '确认“按兵不动”只记录当前意图；它不会自动推进市场。',
      risk: '下一时间节点仍必须通过底部唯一的 ADVANCE MARKET 明确推进。',
      confirmLabel: 'ARM DO NOTHING',
      confirmSublabel: 'Safe action · no trade',
      ready: true,
      irreversible: false,
    };
  }, [pendingDecision, liveSelectedQuote, qty, orderKind, limitPrice, openingBlocked, isIndexCampaign]);

  const confirmPendingDecision = async (): Promise<void> => {
    if (!pendingDecision) return;
    const q = liveSelectedQuote;
    const quoteType = q?.type?.toLowerCase();

    if (pendingDecision === 'DO_NOTHING') {
      setLastOrderMessage('DO NOTHING 已确认。未产生交易；使用 ADVANCE MARKET 才会进入下一节点。');
      setPendingDecision(null);
      return;
    }
    if (!q) {
      setLastOrderMessage('先从期权链选择与当前决策匹配的合约。');
      return;
    }
    if (pendingDecision === 'BUY_CALLS' && quoteType === 'call') {
      await submitOrder('buy_to_open');
      setPendingDecision(null);
      return;
    }
    if (pendingDecision === 'SELL_PUTS' && quoteType === 'put') {
      await submitOrder('sell_cash_secured_put');
      setPendingDecision(null);
      return;
    }
    if (pendingDecision === 'SPREAD') {
      handleVerticalSpread();
      setPendingDecision(null);
      return;
    }
    if (pendingDecision === 'HEDGE' && quoteType === 'put') {
      await submitOrder('buy_to_open');
      setPendingDecision(null);
      return;
    }
    setLastOrderMessage('当前合约与所选 Five-Key 意图不匹配，请重新选择合约。');
  };

  const handleSelectQuoteForMobile = (quote: OptionQuote) => {
    setSelectedQuote(quote);
    // If a Five-Key intent is armed, remain in the decision flow so the player
    // sees Action Preview + the explicit confirmation actuator. Manual chain
    // browsing still opens the mobile order sheet (which has its own hold gate).
    if (window.innerWidth < 1024 && !pendingDecision) {
      setMobileSheetOpen(true);
    }
  };

  if (fxLabOpen) {
    return (
      <Suspense
        fallback={
          <div
            style={{
              color: '#00f2fe',
              background: '#020610',
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
            }}
          >
            INITIALIZING 3D PARTICLE NETWORK...
          </div>
        }
      >
        <VisualPrototypeDemo
          onExit={() => {
            setFxLabOpen(false);
            try {
              if (
                window.location.hash.includes('fx-lab') ||
                window.location.hash.includes('visual-prototype')
              ) {
                window.location.hash = '';
              }
              if (
                window.location.search.includes('fx-lab') ||
                window.location.search.includes('visual-prototype')
              ) {
                window.history.replaceState({}, document.title, window.location.pathname);
              }
            } catch (e) {
              // Ignore in test/iframe environments
            }
          }}
        />
      </Suspense>
    );
  }

  if (!view || !node) {
    return (
      <div className={shellClassName} data-layout-mode={layoutMode} style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          <FinancialParticleNetwork
            {...PARTICLE_SCENE_PRESETS.MAIN_MENU}
            isMobileMode={layoutMode === 'mobile'}
            enableClickBurst={false}
          />
        </div>
        <div className="panel" style={{ position: 'relative', zIndex: 1 }}>
          <div className="title">期权大亨 Options Tycoon</div>
          <div className={startupError ? 'small startup-status startup-status-error' : 'small startup-status'}>
            {busy
              ? '正在加载本地离线引擎…'
              : startupError
                ? `启动失败：${startupError}`
                : '本地离线引擎已就绪'}
          </div>
        </div>
        {mainMenuOpen && (
          <Suspense fallback={null}>
            <MainMenuModal
              isOpen={mainMenuOpen}
              saves={saveList}
              onStartNewGame={handleStartNewGame}
              tutorialCompleted={false}
              onLoadGame={(slot) => void handleLoad(slot)}
              onOpenTutorial={() => openMenuOverlay('TUTORIAL', setTutorialOpen)}
              onOpenSettings={() => openMenuOverlay('SETTINGS', setSettingsOpen)}
              onOpenCredits={() => openMenuOverlay('CREDITS', setCreditsOpen)}
              onOpenFxLab={() => openMenuOverlay('THEME_STUDIO', setThemeStudioOpen)}
              onClose={() => { setMainMenuOpen(false); setNavigation((prev) => navigateTo(prev, HQ_ROUTE)); }}
            />
          </Suspense>
        )}

        {/* 冷启动这条路径是**提前返回**的，和游戏内那棵树各挂各的。
            只在游戏内挂主题工作室的话，从主菜单点「外观」会毫无反应——
            实测踩到过：入口在、状态也翻了，就是没有东西渲染出来。 */}
        {themeStudioOpen && (
          <Suspense fallback={null}>
            <ThemeStudio onClose={closeThemeStudioToMenu} />
          </Suspense>
        )}
        {tutorialOpen && (
          <Suspense fallback={null}>
            <TutorialModal
              isOpen={tutorialOpen}
              onClose={() => closeAppOverlay('TUTORIAL', setTutorialOpen)}
              onJumpToReplay={() => handleStartNewGame('WALL_STREET_REPLAY')}
            />
          </Suspense>
        )}
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              isOpen={settingsOpen}
              onClose={() => closeAppOverlay('SETTINGS', setSettingsOpen)}
              audioLevels={audioLevels}
              onUpdateAudio={updateAudio}
              accountRuleText="离线历史模拟 · 账户规则将在进入战役后按所选账户类型显示。"
            />
          </Suspense>
        )}
        {creditsOpen && (
          <Suspense fallback={null}>
            <CreditsModal isOpen={creditsOpen} onClose={() => closeAppOverlay('CREDITS', setCreditsOpen)} />
          </Suspense>
        )}
      </div>
    );
  }

  return (
    <div className={shellClassName} data-layout-mode={layoutMode} style={{ position: 'relative' }}>
      {deferredStoryEvent && (
        <button
          type="button"
          className="v28-deferred-story-chip"
          data-testid="deferred-story-chip"
          onClick={(event) => {
            storyReturnFocusRef.current = event.currentTarget;
            void handleResumeStory(deferredStoryEvent.id);
          }}
        >
          剧情待处理 · 点击返回（不影响市场查看）
        </button>
      )}
      {/* 空间层节点网络（2026-08-19 claude，第 2 版：Canvas）
          第 1 版用的是 dante 交付的静态 WebP，实测**完全看不见**——
          他把最终合成 alpha（.05–.24）烘进了图，在近黑底上等于不存在，
          `filter: brightness(16)` 也救不回来（只乘 RGB 不动 alpha）。
          Canvas 版的 alpha 是绘制时决定的，画多亮就是多亮。
          验收判据是**像素**不是节点数，见 tools/probe_particle_visibility.mjs。 */}
      <SpatialNetworkCanvas />
      {/* P4 backplane：一层全屏环境光，替代"每张卡各自发光"。
          harv 的判据是「独立卡外发光面积较 R7 减 ≥40%」——
          光来自环境，卡片只负责接住它。（2026-08-19 claude） */}
      <div className="ot-backplane" aria-hidden />
      {/**
        * WebGL 粒子层已删除（2026-08-19 claude）
        *
        * dante 与 harv 复审后**独立给出同一裁定：删，不要调强**。
        * 实测它的画面贡献是 neon 2.84% / amber 1.95% / **calm 0.90%**，
        * 而同屏的空间层节点网络是 23% / 21% / 10%——
        * 两层做的是同一件事（背景空间感），弱的那层只增加噪声与开销。
        *
        * harv 的原话：「calm 0.90% 等于只添复杂度」。
        * dante：「把交互视差和脉冲集中到现有空间网络；若未来要真 3D 交互再单独重建。」
        *
        * 组件本身保留在 components/fx/ 下（主菜单那处还在用），只是不再铺在主界面背景上。
        */}

      {/* Desktop left rail: 5 primary zones replace the old 15-button top wall.
          No feature was deleted -- everything that used to live in the top-actions
          wall is still reachable, just re-housed one level under its zone (see
          NEW_INFORMATION_ARCHITECTURE.md for the full mapping). Hidden on mobile
          (CSS breakpoint) -- mobile keeps its own bottom 5-tab bar. */}
      <nav className="app-rail" aria-label="主导航" style={{ zIndex: 11 }}>
        <div className="app-rail-brand">期权<br />大亨</div>

        <button
          className={`app-rail-btn ${activeWorkspace === 'HQ' ? 'active' : ''}`}
          data-workspace="HQ"
          onClick={() => {
            setGameMode('STORY_CAMPAIGN');
            navigateWorkspace('HQ');
          }}
        >
          <span className="app-rail-icon"><AppIcon name="hq" /></span>
          <span className="app-rail-label">基金总部</span>
        </button>

        <button
          className={`app-rail-btn ${activeWorkspace === 'MARKET' ? 'active' : ''}`}
          data-workspace="MARKET"
          onClick={() => {
            navigateWorkspace('MARKET', 'trade');
          }}
        >
          <span className="app-rail-icon"><AppIcon name="market" /></span>
          <span className="app-rail-label">市场与交易</span>
        </button>

        <button
          className={`app-rail-btn ${activeWorkspace === 'PORTFOLIO' ? 'active' : ''}`}
          data-workspace="PORTFOLIO"
          onClick={() => {
            navigateWorkspace('PORTFOLIO', 'portfolio');
          }}
        >
          <span className="app-rail-icon"><AppIcon name="portfolio" /></span>
          <span className="app-rail-label">持仓</span>
        </button>

        <div className="app-rail-btn-wrap">
          <button
            className={`app-rail-btn ${activeWorkspace === 'INTEL' ? 'active' : ''}`}
            data-workspace="INTEL"
            onClick={() => {
              navigateWorkspace('INTEL', 'intel');
            }}
          >
            <span className="app-rail-icon"><AppIcon name="intel" /></span>
            <span className="app-rail-label">情报与关系</span>
            {(view?.human_action_feed?.filter((e) => !e.resolved).length ?? 0) > 0 && (
              <span className="app-rail-badge">{view?.human_action_feed?.filter((e) => !e.resolved).length}</span>
            )}
          </button>
          {activeRailPanel === 'INTEL' && (
            <div className="app-rail-panel">
              <button onClick={() => { setWarRoomOpen(true); setActiveRailPanel(null); }}>🎙️ 盘前会议 (War Room)</button>
              <button onClick={() => { setPolicyDeskOpen(true); setActiveRailPanel(null); }}>⚖️ 政策通道 (Policy)</button>
              <button onClick={() => { setWallStreetOpen(true); setActiveRailPanel(null); }}>🏛️ 投行专柜 (Wall St)</button>
              <button onClick={() => { setFlowDeskOpen(true); setActiveRailPanel(null); }}>🌊 资金流向 (Flow)</button>
              <button onClick={() => { setMarketPulseOpen(true); setActiveRailPanel(null); }}>📡 社交舆情 (Pulse)</button>
              {/* V29-UI-A defect #5: OptionsDataSourcePanel existed but was never mounted
                  outside its unit test, so its truth labels and the "which local pack is
                  missing" list were invisible to players. It now has a real entry point. */}
              <button onClick={() => { setDataTruthOpen(true); setActiveRailPanel(null); }}>🔎 数据真实性 (Data Truth)</button>
              {/* V30: 恩怨账本与合规调查。上一次 OptionsDataSourcePanel 就是写了没挂入口，
                  玩家永远看不到；这里直接给它一个真实的进入路径。 */}
              <button onClick={() => { setPowerLedgerOpen(true); setActiveRailPanel(null); }}>⚖️ 人情与积怨 (Standing)</button>
              <button onClick={() => { setHumanActionOpen(true); setActiveRailPanel(null); }}>
                ⚔️ 权力博弈事件 (Events)
                {(view?.human_action_feed?.filter((e) => !e.resolved).length ?? 0) > 0 && (
                  <span className="app-rail-badge">{view?.human_action_feed?.filter((e) => !e.resolved).length}</span>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="app-rail-btn-wrap">
          <button
            className={`app-rail-btn ${activeWorkspace === 'REVIEW' ? 'active' : ''}`}
            data-workspace="REVIEW"
            onClick={() => {
              navigateWorkspace('REVIEW', 'settings');
            }}
          >
            <span className="app-rail-icon"><AppIcon name="review" /></span>
            <span className="app-rail-label">复盘与档案</span>
          </button>
          {activeRailPanel === 'REVIEW' && (
            <div className="app-rail-panel">
              <button
                disabled={(view.state.trade_reviews || []).length === 0}
                onClick={() => {
                  const reviews = view.state.trade_reviews || [];
                  if (reviews.length === 0) return;
                  setSelectedReview(reviews[reviews.length - 1]);
                  setReviewModalOpen(true);
                  setActiveRailPanel(null);
                }}
              >
                📊 交易复盘 ({(view.state.trade_reviews || []).length})
              </button>
              <button onClick={() => { setCapitalPowerOpen(true); setActiveRailPanel(null); }}>💼 资本与权力 (Capital)</button>
              <button onClick={() => { setTermsModalOpen(true); setActiveRailPanel(null); }}>📚 术语词典 (Glossary)</button>
              <button onClick={() => { setInteractiveTutorialOpen(true); setActiveRailPanel(null); }}>🎓 机构大师课 (Masterclass)</button>
            </div>
          )}
        </div>

        <div className="app-rail-spacer" />

        {view.margin_call_active && (
          <button
            className="app-rail-btn app-rail-btn-danger"
            onClick={() => setCrisisModalOpen(true)}
          >
            <span className="app-rail-icon"><AppIcon name="risk" /></span>
            <span className="app-rail-label">危机求生</span>
          </button>
        )}

        <button className="app-rail-btn" onClick={() => setMainMenuOpen(true)}>
          <span className="app-rail-icon"><AppIcon name="menu" /></span>
          <span className="app-rail-label">主菜单</span>
        </button>

        <button className="app-rail-btn" onClick={() => setSettingsOpen(true)}>
          <span className="app-rail-icon"><AppIcon name="settings" /></span>
          <span className="app-rail-label">设置</span>
        </button>
      </nav>

      {/* Top status bar. Not navigation -- just EP/day/date and fund vitals, per spec. */}
      {/* V2 视觉：顶部条=L0 仪表带（dante P0-4），去 inline z-index 与卡片化 */}
      <div className="app-status-bar ot-instrument-strip" data-layer="L0" data-visual-key="command-topbar">
        <div className="app-status-left">
          <span className="app-status-title">
            期权大亨 <span className="app-status-title-en">Options Tycoon</span>
          </span>
          <span className="app-status-workspace">{activeWorkspace === 'HQ' ? '基金总部' : activeWorkspace === 'MARKET' ? '市场与交易' : activeWorkspace === 'PORTFOLIO' ? '持仓' : activeWorkspace === 'INTEL' ? '情报' : '复盘'}</span>
        </div>
        <div className="app-status-mid">
          {view.current_episode && <span>EP{view.current_episode.number ?? 1}</span>}
          <span>DAY {dayIndex + 1}</span>
          <span>{node?.date ?? ''}</span>
        </div>
        <div className="app-status-right">
          {activeWorkspace === 'MARKET' ? (
            <>
              <span className="app-status-stat command-market-readout">VIX <strong>{node?.vix?.close != null ? node.vix.close.toFixed(2) : 'NO FEED'}</strong></span>
              <span className="app-status-stat command-market-readout">NODE <strong>{dayIndex + 1}/{totalDays}</strong></span>
              <span className="app-status-stat command-market-readout">DATA <strong>LOCAL</strong></span>
              <span className="app-status-stat app-status-market-state">MARKET <strong>PAUSED</strong></span>
            </>
          ) : (
            <>
              <span className="app-status-stat">NAV <strong>${(view.equity ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
              <span className="app-status-stat">Cash <strong>${(view.state.cash ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong></span>
              <span className="app-status-stat">当日 P&amp;L <strong className={view.unrealized_pnl >= 0 ? 'green' : 'red'}>{money(view.unrealized_pnl)}</strong></span>
            </>
          )}
          <button type="button" className="command-topbar-action" onClick={() => setMainMenuOpen(true)} aria-label="打开主菜单">
            <AppIcon name="menu" /> <span>MENU</span>
          </button>
          <button type="button" className="command-topbar-action" onClick={() => setSettingsOpen(true)} aria-label="打开设置">
            <AppIcon name="settings" />
          </button>
        </div>
        <div className="app-status-mission guide-current-objective" title="当前主线任务">
          当前任务：{getCurrentObjective(view, (view.state.positions.length ?? 0) > 0, (view.state.trade_reviews.length ?? 0) > 0, dayIndex, showFundHQ).title}
        </div>
      </div>

      <main
        className={layoutMode === 'mobile' ? 'mobile-command-scroll' : 'app-workspace-flow'}
        data-testid="workspace-scroll-region"
        data-active-workspace={activeWorkspace}
      >
      {layoutMode === 'tablet' && (
        <>
          <button
            type="button"
            className="tablet-drawer-toggle"
            data-testid="tablet-detail-toggle"
            aria-expanded={tabletDrawerOpen}
            onClick={() => setTabletDrawerOpen((open) => !open)}
          >
            {tabletDrawerOpen ? '关闭详情 ✕' : '团队与详情 ☰'}
          </button>
          {tabletDrawerOpen && (
            <button
              type="button"
              className="tablet-drawer-backdrop"
              aria-label="关闭团队与详情抽屉"
              onClick={() => setTabletDrawerOpen(false)}
            />
          )}
        </>
      )}

      {view.current_episode && (
        <MissionHeader
          view={view}
          episodeNumber={view.current_episode.number}
          episodeTitle={view.current_episode.title}
          visitedWarRoom={visitedWarRoom}
          visitedTradingFloor={visitedTradingFloor}
          hasResolvedOpeningBriefing={hasResolvedOpeningBriefing}
          hasOpenPosition={(view?.state.positions.length ?? 0) > 0}
          hasTradeReviews={(view?.state.trade_reviews.length ?? 0) > 0}
          dayIndex={dayIndex}
          showFundHQ={showFundHQ}
          onNavigateAction={handleObjectiveNavigate}
        />
      )}

      {layoutMode === 'mobile' && (
        <MobileFundPulse
          nav={view.equity}
          dayPnl={mobileDayPnl}
          positionPnl={mobilePositionPnl}
          riskLabel={mobileRiskLabel}
          riskClass={mobileRiskClass}
          onSelect={(metric) => navigateWorkspace(metric === 'RISK' || metric === 'POSITION_PNL' ? 'PORTFOLIO' : 'HQ')}
        />
      )}

      {gameMode === 'STORY_CAMPAIGN' && !showFundHQ && (
        <button
          type="button"
          className="workspace-return-hq ot-btn ot-btn-secondary"
          onClick={() => navigateWorkspace('HQ')}
          data-testid="return-to-hq"
        >
          ← 返回基金总部 <span className="en-secondary">RETURN TO HQ</span>
        </button>
      )}

      {/* Main View: FUND HQ Portal vs Dedicated Workspaces (Portfolio / Intel / Review / Market) */}
      {showFundHQ && gameMode === 'STORY_CAMPAIGN' ? (
        <FundHQPortal
          view={view}
          episode={view.current_episode ?? null}
          visitedWarRoom={visitedWarRoom}
          visitedTradingFloor={visitedTradingFloor}
          hasResolvedOpeningBriefing={hasResolvedOpeningBriefing}
          onRecommendedAction={handleObjectiveNavigate}
          onEnterWarRoom={() => { navigateWorkspace('HQ'); openAppOverlay('WAR_ROOM', setWarRoomOpen, HQ_ROUTE, 'DECISION'); }}
          onOpenScanner={() => navigateWorkspace('MARKET', 'scanner')}
          onOpenTradeFloor={() => navigateWorkspace('MARKET', 'trade')}
          onOpenPortfolio={() => navigateWorkspace('PORTFOLIO', 'portfolio')}
          onOpenIntel={() => navigateWorkspace('INTEL', 'intel')}
          onOpenGlossary={() => setTermsModalOpen(true)}
          onOpenStrategyLab={() => setStrategyLabOpen(true)}
          onOpenLpRelations={() => openAppOverlay('LP_RELATIONS', setLpPanelOpen, HQ_ROUTE)}
          onNavigatePanel={(panel: string) => {
            if (panel === 'POLICY') setPolicyDeskOpen(true);
            else if (panel === 'FLOW') setFlowDeskOpen(true);
            else if (panel === 'WALL_STREET') setWallStreetOpen(true);
            else if (panel === 'MARKET_PULSE') setMarketPulseOpen(true);
            else if (panel === 'LP_RELATIONS') setLpPanelOpen(true);
            else if (panel === 'MACRO') navigateWorkspace('MARKET', 'trade');
            else navigateWorkspace('INTEL', 'intel');
          }}
          onOpenWallStreet={() => setWallStreetOpen(true)}
          onOpenPolicyDesk={() => setPolicyDeskOpen(true)}
          onOpenMarketPulse={() => setMarketPulseOpen(true)}
          onOpenFlowDesk={() => setFlowDeskOpen(true)}
          onOpenHumanAction={() => openAppOverlay('HUMAN_ACTION', setHumanActionOpen, HQ_ROUTE, 'DECISION')}
          onOpenPowerLedger={() => setPowerLedgerOpen(true)}
          onOpenCapitalPower={() => setCapitalPowerOpen(true)}
          onOpenMasterclass={() => setInteractiveTutorialOpen(true)}
          onOpenSettings={() => openAppOverlay('SETTINGS', setSettingsOpen, HQ_ROUTE)}
          onOpenMainMenu={() => { setNavigation((prev) => navigateTo(prev, MENU_ROUTE)); setMainMenuOpen(true); }}
        />
      ) : activeWorkspace === 'PORTFOLIO' ? (
        <div className="grid portfolio-workspace-layout" data-testid="portfolio-workspace">
          {/* Left Column: Risk and NAV summary & Fund Stats */}
          <div className="portfolio-workspace-left">
            <div className="panel portfolio-hud-panel ot-panel">
              <div className="statusline">
                <div>
                  <span className="badge real">PORTFOLIO &amp; RISK</span>
                  <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 6 }}>
                    风控监控台
                  </span>
                </div>
              </div>

              <div className="portfolio-risk-summary-bar-vert">
                <div className="ot-metric">
                  <span className="ot-metric-value-lg">{money(view.equity)}</span>
                  <span className="ot-metric-label">净资产 NAV</span>
                </div>
                <div className="ot-metric">
                  <span className="ot-metric-value">{money(view.state.cash)}</span>
                  <span className="ot-metric-label">现金 Cash</span>
                </div>
                <div className="ot-metric">
                  <span className={`ot-metric-value ${view.unrealized_pnl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
                    {money(view.unrealized_pnl)}
                  </span>
                  <span className="ot-metric-label">未实现 P&amp;L</span>
                </div>
                <div className="ot-metric">
                  <span className={`ot-metric-value ${view.state.realized_pl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
                    {money(view.state.realized_pl)}
                  </span>
                  <span className="ot-metric-label">已实现 P&amp;L</span>
                </div>
                {(view.state.account_type === 'MARGIN' || (view.state.account_type as string) === 'Margin') && (
                  <div className="ot-metric">
                    <span className="ot-metric-value">{money(view.margin_buying_power)}</span>
                    <span className="ot-metric-label">买力 Buying Power</span>
                  </div>
                )}
              </div>

              {(view.state.account_type === 'MARGIN' || (view.state.account_type as string) === 'Margin') && (
                <div className={view.margin_call_active ? 'warn' : 'src'} style={{ marginTop: 6, fontSize: 11 }}>
                  <strong>Margin 保证金：</strong>负债 {money(view.state.margin_debt)} · 维持担保金 {money(view.margin_requirement)}
                  {view.margin_call_active ? '　⚠ 已触发 Margin Call' : ''}
                </div>
              )}

              <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={() => navigateWorkspace('MARKET', 'trade')}>
                去交易台下单 TRADE FLOOR ▶
              </button>
            </div>

            <div className="panel ot-panel" style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <div className="title">基金统计概况</div>
              <FundStatsPanel stats={view.state.fund_stats} />
            </div>
          </div>

          {/* Center Column: Positions, Attributions, Order Log */}
          <div className="portfolio-workspace-main">
            <div data-coach="positions-panel">
              <PositionsAttributionPanel
                positions={view.state.positions}
                marks={positionMarksById}
                sharesRow={sharesRow}
                underlyingLabel={campaignMeta?.underlying ?? ''}
                attribution={view.state.last_attribution ?? null}
                thesisHistory={view.state.thesis_history}
                openThesisDrift={view.open_thesis_drift}
                onReviseThesis={(positionId) => {
                  setRevisingPositionId(positionId);
                  setThesisModalOpen(true);
                }}
                onClosePosition={(position) => void handleClosePosition(position)}
                onExercisePosition={(position) => void handleExercisePosition(position)}
                onCloseStrategy={(sid, legs) => void handleCloseStrategy(sid, legs)}
              />
            </div>

            <div className="panel ot-panel" style={{ marginTop: 12 }}>
              <div className="title">历史委托与成交明细 (Order Log)</div>
              <OrderLogPanel entries={view.state.order_log} />
            </div>
          </div>

          {/* Right Column: War Room Rail + Greeks + AI Funds */}
          <div className="portfolio-workspace-side">
            <WarRoomRail
              state={view.state as never}
              asOfDate={node?.date ?? ''}
              dateHistory={dateHistory}
              pendingEvents={(view.human_action_feed || []).filter((e) => !e.resolved).length}
              onOpenEvents={() => setHumanActionOpen(true)}
              onOpenLedger={() => setPowerLedgerOpen(true)}
              onOpenRoom={() => setWarRoomOpen(true)}
            />

            {liveSelectedQuote ? (
              <GreeksPanel
                quote={liveSelectedQuote}
                ivLabel="教学模型估算：叠加行权价偏斜 (IV Skew) 与做市商库存宽化模型。"
              />
            ) : (
              <div className="panel greeks-empty-hint ot-panel" style={{ marginTop: 10 }}>
                <div className="title" style={{ marginBottom: 6 }}>期权 Greeks 监控</div>
                {view.state.positions.length > 0
                  ? `当前持有 ${view.state.positions.length} 笔持仓。在下方持仓或市场期权链中选择合约可查看深度 Greeks 与 IV 偏斜。`
                  : '当前无持仓。进入「市场与交易」选择期权合约后可查看实时 Greeks。'}
              </div>
            )}

            <details className="panel collapsible-section ot-panel" open style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <summary className="title" style={{ cursor: 'pointer' }}>AI 对手基金排行 (AI Fund Ranking)</summary>
              <AIFundsRankingPanel ranking={funds.ranking} />
            </details>
          </div>
        </div>
      ) : activeWorkspace === 'INTEL' ? (
        <div className="grid intel-workspace-layout" data-testid="intel-workspace">
          {/* Left Column: PB Trust, Financing & Quick Desks */}
          <div className="intel-workspace-left">
            <div className="panel intel-hud-panel ot-panel">
              <div className="statusline">
                <div>
                  <span className="badge real">INTELLIGENCE</span>
                  <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 6 }}>
                    华尔街情报专柜
                  </span>
                </div>
              </div>

              <div className="intel-quick-desks">
                <button className="intel-desk-chip" onClick={() => setPolicyDeskOpen(true)}>⚖️ 政策通道 (Policy)</button>
                <button className="intel-desk-chip" onClick={() => setWallStreetOpen(true)}>🏛️ 投行专柜 (Wall St)</button>
                <button className="intel-desk-chip" onClick={() => setFlowDeskOpen(true)}>🌊 资金流向 (Flow)</button>
                <button className="intel-desk-chip" onClick={() => setMarketPulseOpen(true)}>📡 社交舆情 (Pulse)</button>
                <button className="intel-desk-chip" onClick={() => setPowerLedgerOpen(true)}>⚖️ 恩怨账本 (Standing)</button>
                <button className="intel-desk-chip" onClick={() => setDataTruthOpen(true)}>🔎 数据真实性 (Truth)</button>
                <button className="intel-desk-chip" onClick={() => setLpPanelOpen(true)}>🤝 LP 出资人 (LPs)</button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }}>
                <div><strong>JPMorgan PB 信任分：</strong><span className="font-mono text-cyan">{(view.state.institutional_relationships?.jpmorgan?.trust ?? 60).toFixed(0)} / 100</span></div>
                <div><strong>融资点差：</strong><span className="font-mono">SOFR + {(view.state.institutional_relationships?.jpmorgan?.financing_spread_bps ?? 150).toFixed(0)} bps</span></div>
                <div style={{ marginTop: 4, fontSize: 10.5, opacity: 0.8 }}>信任分决定维持担保金与 Haircut 比率。</div>
              </div>
            </div>

            <div className="panel ot-panel" style={{ marginTop: 10 }}>
              <div className="title">权力与声誉概况 (Standing)</div>
              <FundStatsPanel stats={view.state.fund_stats} />
            </div>
          </div>

          {/* Center Column: Relationships, Story Inbox & News */}
          <div className="intel-workspace-main">
            <div data-onboarding-panel="ADVANCED">
              <RelationshipsPanel relationships={view.state.relationships} characters={characters} />
            </div>

            <div className="panel ot-panel" style={{ marginTop: 12 }} data-onboarding-panel="ADVANCED">
              <div className="title">
                待处理剧情与人物对话 (Story Inbox)
                <span className="badge real" style={{ marginLeft: 8 }}>
                  {(view.pending_story_public || []).filter((e) => !e.resolved && !e.deferred).length} 待决
                </span>
              </div>
              <StoryInboxPanel
                events={view.pending_story_public}
                history={(view.state.story_history ?? []) as never}
                characters={characters}
                onChoice={handleStoryChoice}
                onResume={(eventId) => void handleResumeStory(eventId)}
              />
            </div>

            <details className="panel collapsible-section ot-panel" open style={{ marginTop: 12 }}>
              <summary className="title" style={{ cursor: 'pointer' }}>公开新闻与宏观快讯</summary>
              <NewsFeedPanel events={events} />
            </details>
          </div>

          {/* Right Column: War Room Rail */}
          <div className="intel-workspace-side">
            <WarRoomRail
              state={view.state as never}
              asOfDate={node?.date ?? ''}
              dateHistory={dateHistory}
              pendingEvents={(view.human_action_feed || []).filter((e) => !e.resolved).length}
              onOpenEvents={() => setHumanActionOpen(true)}
              onOpenLedger={() => setPowerLedgerOpen(true)}
              onOpenRoom={() => setWarRoomOpen(true)}
            />
          </div>
        </div>
      ) : activeWorkspace === 'REVIEW' ? (
        <div className="grid review-workspace-layout" data-testid="review-workspace">
          {/* Left Column: Summary Strip & Archive tools */}
          <div className="review-workspace-left">
            <div className="panel review-hud-panel ot-panel">
              <div className="statusline">
                <div>
                  <span className="badge real">AUDIT ARCHIVE</span>
                  <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 6 }}>
                    复盘与评分
                  </span>
                </div>
              </div>

              <div className="review-summary-strip-vert">
                <div className="ot-metric">
                  <span className="ot-metric-value">{(view.state.trade_reviews || []).length} 笔</span>
                  <span className="ot-metric-label">已平仓复盘</span>
                </div>
                <div className="ot-metric">
                  <span className={`ot-metric-value ${view.state.realized_pl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
                    {money(view.state.realized_pl)}
                  </span>
                  <span className="ot-metric-label">已实现 P&amp;L</span>
                </div>
                <div className="ot-metric">
                  <span className="ot-metric-value">
                    {(view.state.trade_reviews || []).length > 0
                      ? ((view.state.trade_reviews.reduce((acc, r) => acc + (typeof r.process_score === 'number' ? r.process_score : r.process_score?.overall_process_score || 80), 0) / view.state.trade_reviews.length).toFixed(1))
                      : '85.0'} / 100
                  </span>
                  <span className="ot-metric-label">流程评分均值</span>
                </div>
                <div className="ot-metric">
                  <span className="ot-metric-value">
                    {(view.state.trade_reviews || []).length > 0
                      ? `${(((view.state.trade_reviews.filter((r) => r.realized_pl > 0).length) / view.state.trade_reviews.length) * 100).toFixed(0)}%`
                      : '—'}
                  </span>
                  <span className="ot-metric-label">胜率 Win Rate</span>
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="ghost" style={{ textAlign: 'left', fontSize: 11 }} onClick={() => setInteractiveTutorialOpen(true)}>🎓 机构大师课</button>
                <button className="ghost" style={{ textAlign: 'left', fontSize: 11 }} onClick={() => setTermsModalOpen(true)}>📚 术语词典</button>
                <button className="ghost" style={{ textAlign: 'left', fontSize: 11 }} onClick={() => setCapitalPowerOpen(true)}>💼 资本与权力档案</button>
              </div>
            </div>

            <div className="panel ot-panel" style={{ marginTop: 10 }}>
              <div className="title">基金声誉与指标</div>
              <FundStatsPanel stats={view.state.fund_stats} />
            </div>
          </div>

          {/* Center Column: Trade Post-Mortems Timeline + Order Log */}
          <div className="review-workspace-main">
            <div className="panel ot-panel">
              <div className="title">平仓交易复盘时间线 (Trade Post-Mortems)</div>
              {(view.state.trade_reviews || []).length === 0 ? (
                <div className="ot-empty-state ot-ghost-timeline">
                  <div className="ot-ghost-status-content" style={{ marginBottom: 12 }}>
                    <span className="ot-badge ot-badge-derived">NO CLOSED TRADES · 暂无平仓复盘</span>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      在「市场与交易」建立 Thesis 并开仓后，平仓或到期行权将自动在此生成全维度交易复盘、Greeks 归因与纪律评分。
                    </div>
                  </div>
                  <div className="ot-ghost-timeline-card">
                    <div className="ot-ghost-timeline-head">
                      <span className="font-mono text-muted">RECORD #00 · [ 待生成复盘插槽 ]</span>
                      <span className="font-mono text-muted">ENTRY ➔ EXIT (—)</span>
                    </div>
                    <div className="ot-ghost-timeline-body font-mono text-muted">
                      <span>流程评分: — / 100</span>
                      <span>已实现 P&L: $—</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="review-timeline-list">
                  {(view.state.trade_reviews || []).slice().reverse().map((r, idx) => (
                    <div key={r.trade_id || `review-${idx}`} className="review-timeline-card ot-card">
                      <div className="review-card-head">
                        <div>
                          <span className="font-mono review-contract-name">{r.contract_or_symbol}</span>
                          <span className="review-dates font-mono">{r.entry_date} ➔ {r.exit_date} ({r.side})</span>
                        </div>
                        <div className="review-card-pl font-mono">
                          <span className={r.realized_pl >= 0 ? 'text-green' : 'text-red'}>
                            {r.realized_pl >= 0 ? '+' : ''}{money(r.realized_pl)} ({r.return_pct >= 0 ? '+' : ''}{r.return_pct.toFixed(1)}%)
                          </span>
                        </div>
                      </div>

                      {r.entry_thesis && (
                        <div className="review-card-thesis">
                          <strong>开仓 Thesis：</strong>{r.entry_thesis.direction} · {r.entry_thesis.catalyst} · 预期 {r.entry_thesis.expected_move_pct}%
                        </div>
                      )}

                      <div className="review-card-footer">
                        <span className="font-mono review-score-badge">
                          流程评分: {typeof r.process_score === 'number' ? r.process_score.toFixed(1) : r.process_score?.overall_process_score?.toFixed(1) ?? '85.0'} / 100
                        </span>
                        <button
                          type="button"
                          className="btn-small"
                          onClick={() => {
                            setSelectedReview(r);
                            setReviewModalOpen(true);
                          }}
                        >
                          查看 360° 深度复盘 ➔
             </button>
           </div>
         </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel ot-panel" style={{ marginTop: 12 }}>
              <div className="title">委托与撮合日志 (Audit Log)</div>
              <OrderLogPanel entries={view.state.order_log} />
            </div>
          </div>

          {/* Right Column: War Room Rail + AI Fund Ranking */}
          <div className="review-workspace-side">
            <WarRoomRail
              state={view.state as never}
              asOfDate={node?.date ?? ''}
              dateHistory={dateHistory}
              pendingEvents={(view.human_action_feed || []).filter((e) => !e.resolved).length}
              onOpenEvents={() => setHumanActionOpen(true)}
              onOpenLedger={() => setPowerLedgerOpen(true)}
              onOpenRoom={() => setWarRoomOpen(true)}
            />

            <details className="panel collapsible-section ot-panel" open style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <summary className="title" style={{ cursor: 'pointer' }}>AI 竞争对手排行 (AI Fund Ranking)</summary>
              <AIFundsRankingPanel ranking={funds.ranking} />
            </details>
          </div>
        </div>
      ) : (
        <MarketCommandShell>
        <div className="grid trading-floor-workspace">
          {/* LEFT COLUMN: Fund Vitals, Macro Watchlist & Market Settings */}
          {layoutMode !== 'mobile' && <FundRiskRail>
            {/* 资金 / 风险 / 关键指标 (.ot-metric) */}
            <div className="panel ot-panel ui-enforced" data-onboarding-panel="FUND_VITALS">
              <div className="ot-section-header">
                <div className="ot-section-titles">
                  <span className="ot-section-zh">资金与风控</span>
                  <span className="ot-section-en">FUND VITALS</span>
                </div>
              </div>
              <div className="hq-status-grid-vert">
                {/* NAV 走势（2026-08-19 claude）
                    数据是玩家自己走过的每一天的真实净资产，由 navHistory 逐日记录，
                    不是补出来的曲线。开局第一天只有一个点，画不出线——那时就该显示空态。 */}
                <div className="fund-vitals-nav-compact">
                  <div>
                    <span className="ui-label">NAV 趋势</span>
                    <span className="fund-vitals-nav-context font-mono">
                      {navHistory.length >= 2 ? `${navHistory.length} 个已走节点` : '首日 — 推进后显示'}
                    </span>
                  </div>
                  {navHistory.length >= 2 ? (
                    <Sparkline
                      source="navHistory"
                      points={navHistory}
                      width={150}
                      height={42}
                      color={view.unrealized_pnl >= 0 ? 'var(--thm-good)' : 'var(--thm-risk)'}
                    />
                  ) : <span className="market-viz-na" style={{ fontSize: 11, opacity: 0.5 }}>推进市场后显示趋势</span>}
                </div>

                <div className="ot-metric fund-ratio-metric">
                  <span className="ot-metric-value">{money(view.state.cash)}</span>
                  <span className="ot-metric-label">现金占净值 Cash Ratio</span>
                  {cashRatio == null ? <span className="market-viz-na">DATA_UNAVAILABLE</span> : (
                    <div className="fund-ratio-track">
                      <i style={{ width: `${Math.min(100, Math.max(0, cashRatio * 100))}%` }} />
                      <small>{(cashRatio * 100).toFixed(0)}%</small>
                    </div>
                  )}
                </div>
                <div className="ot-metric">
                  <span className={`ot-metric-value ${view.unrealized_pnl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
                    {money(view.unrealized_pnl)}
                  </span>
                  <span className="ot-metric-label">当日 P&amp;L</span>
                </div>

                {/* 保证金占用率：requirement / equity。净资产 <=0 时传 null 走空态，
                    绝不画成 0%——那时候恰恰是最危险的时刻。 */}
                <div className="ot-metric">
                  <span className={`ot-metric-value ${view.margin_call_active ? 'ot-metric-delta-down' : ''}`}>
                    {view.margin_call_active
                      ? '紧急追缴 (Call)'
                      : view.margin_requirement > 0
                      ? money(view.margin_requirement)
                      : '风险正常'}
                  </span>
                  <span className="ot-metric-label">维持保证金</span>
                  {marginUtil == null ? <span className="market-viz-na">DATA_UNAVAILABLE</span> : (
                    <div className={`margin-threshold ${view.margin_call_active ? 'is-breach' : ''}`}>
                      <div className="margin-threshold-track">
                        <b title="Margin Call threshold = 100%" />
                        <i style={{ left: `${Math.min(100, Math.max(0, marginUtil * 100))}%` }} />
                      </div>
                      <small>{(marginUtil * 100).toFixed(0)}% / 100%</small>
                    </div>
                  )}
                </div>

                <div className="ot-metric ot-metric-donut">
                  <Donut
                    source="lpConfidence"
                    value={lpConfidence == null ? null : lpConfidence / 100}
                    size={92}
                    thickness={9}
                    color={lpConfidence != null && lpConfidence < 50 ? 'var(--thm-risk)' : 'var(--thm-accent)'}
                    centerLabel={lpConfidence == null ? undefined : `${lpConfidence.toFixed(0)}%`}
                  />
                  <span className="ot-metric-label">LP 信任度</span>
                </div>
              </div>
            </div>

            <div className="reference-rail-stack" data-visual-key="left-instrument-wall">
              <section className="reference-rail-instrument reference-fund-instrument" data-visual-key="fund-overview-instrument">
                <div className="reference-rail-head"><span>FUND OVERVIEW</span><small>REAL STATE</small></div>
                <div className="reference-fund-primary font-mono">
                  <strong>{money(view.equity)}</strong>
                  <span className={view.unrealized_pnl >= 0 ? 'is-positive' : 'is-negative'}>
                    {view.unrealized_pnl >= 0 ? '+' : ''}{money(view.unrealized_pnl)}
                  </span>
                </div>
                <div className="reference-fund-meta">
                  <span>NAV</span><span>DAY P&amp;L</span>
                  <b>{cashRatio == null ? '—' : `${Math.round(cashRatio * 100)}% CASH`}</b>
                </div>
                <div className="reference-rail-track reference-fund-track"><i style={{ width: `${Math.min(100, Math.max(0, (cashRatio ?? 0) * 100))}%` }} /></div>
              </section>

              <section className="reference-rail-instrument reference-risk-instrument" data-visual-key="risk-exposure-instrument">
                <div className="reference-rail-head"><span>RISK EXPOSURE</span><small>LIVE</small></div>
                <div className="reference-risk-primary font-mono">
                  <strong>{(view.state.max_drawdown_pct ?? 0).toFixed(1)}%</strong>
                  <span>MAX DRAWDOWN</span>
                </div>
                <div className="reference-risk-grid font-mono">
                  <span>MARGIN <b>{marginUtil == null ? '—' : `${Math.round(marginUtil * 100)}%`}</b></span>
                  <span>LP TRUST <b>{lpConfidence == null ? '—' : `${Math.round(lpConfidence)}%`}</b></span>
                </div>
                <div className="reference-risk-history" data-source="REAL_NAV_HISTORY">
                  {drawdownHistory.length >= 2 ? (
                    <Sparkline points={drawdownHistory} width={252} height={28} color="var(--ot-negative)" fill={false} source="navHistory" />
                  ) : (
                    <span className="font-mono reference-risk-history-empty">RISK HISTORY AFTER ADVANCE</span>
                  )}
                </div>
              </section>

              <section className="reference-rail-instrument reference-thesis-instrument">
                <div className="reference-rail-head"><span>THESIS</span><small>观点</small></div>
                <strong className={dockThesis ? '' : 'is-empty'}>{dockThesis || '尚未建立 · DEFINE THESIS'}</strong>
                <span className="font-mono reference-rail-micro">{dockThesis ? 'THESIS LOCKED · CONFIDENCE NOT SCORED' : 'EMPTY · WAITING FOR PLAYER THESIS'}</span>
                <div className="reference-rail-track"><i style={{ width: dockThesis ? '100%' : '0%' }} /></div>
              </section>

              <section className="reference-rail-instrument reference-event-instrument">
                <div className="reference-rail-head"><span>NEXT EVENT</span><small>下一节点</small></div>
                <strong>{view.market_clock?.next_node_label || node.label || '等待市场推进'}</strong>
                <span className="font-mono reference-rail-micro">{node.date} · {view.market_clock?.paused ? 'PAUSED' : 'LIVE'}</span>
              </section>

              <section className="reference-rail-instrument reference-greeks-instrument">
                <div className="reference-rail-head"><span>PORTFOLIO GREEKS</span><small>{view.portfolio_greeks?.partial ? 'PARTIAL' : 'LIVE'}</small></div>
                <div className="reference-greeks-grid font-mono">
                  <span>Δ <b>{view.portfolio_greeks ? view.portfolio_greeks.delta.toFixed(2) : '—'}</b></span>
                  <span>Γ <b>{view.portfolio_greeks ? view.portfolio_greeks.gamma.toFixed(3) : '—'}</b></span>
                  <span>Θ <b>{view.portfolio_greeks ? view.portfolio_greeks.theta.toFixed(2) : '—'}</b></span>
                  <span>V <b>{view.portfolio_greeks ? view.portfolio_greeks.vega.toFixed(2) : '—'}</b></span>
                </div>
              </section>

              <section className={`reference-rail-instrument reference-margin-instrument${view.margin_call_active ? ' is-critical' : ''}`}>
                <div className="reference-rail-head"><span>MARGIN</span><small>UTILIZATION</small></div>
                <div className="reference-margin-row font-mono">
                  <strong>{marginUtil == null ? 'DATA_UNAVAILABLE' : `${Math.round(marginUtil * 100)}%`}</strong>
                  <span>{view.margin_call_active ? 'MARGIN CALL' : 'WITHIN LIMIT'}</span>
                </div>
                <div className="reference-margin-track"><i style={{ width: `${Math.min(100, Math.max(0, (marginUtil ?? 0) * 100))}%` }} /></div>
              </section>
            </div>

            <details className="panel collapsible-section ot-panel legacy-command-utility" data-onboarding-panel="ADVANCED">
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>标的与宏观 (Macro Watchlist)</summary>
              <MacroWatchlistPanel
                mainLabel={campaignMeta?.underlying ?? ''}
                mainValue={node.underlying_bar.close}
                mainChangeText={mainChange.text}
                mainChangeClass={mainChange.cls}
                secondaryLabel={campaignMeta?.secondary ?? ''}
                secondaryValue={node.secondary_close ?? 0}
                secondaryChangeText={secondaryChange.text}
                secondaryChangeClass={secondaryChange.cls}
                vix={node.vix ? node.vix.close : null}
                vixRange={vixRangeText(node)}
                regimeLabel={regime.label}
                regimeClass={regime.cls}
                mainSeries={macroSeries.main}
                secondarySeries={macroSeries.secondary}
                vixSeries={macroSeries.vix}
              />
            </details>

            {/* Spec Section 31: Campaign/Account/Save-Load */}
            <details className="panel collapsible-section ot-panel" data-onboarding-panel="ADVANCED">
              <summary className="title ia-summary">
                <span>战役设置与存档 <span className="en-secondary">CAMPAIGN &amp; SAVE</span></span>
                <span className="ia-summary-meta font-mono">
                  {(view.state.campaign_id ?? selectedCampaignId).toUpperCase()} · {view.state.mode ?? gameMode} · {view.state.account_type ?? accountType} · {saveSlot}
                </span>
              </summary>
              <CampaignSelectorPanel
                campaigns={campaigns}
                selectedCampaignId={selectedCampaignId}
                onSelectCampaign={setSelectedCampaignId}
                accountType={accountType}
                onAccountTypeChange={setAccountType}
                startCash={startCash}
                onStartCashChange={setStartCash}
                onRestart={handleRestart}
                accountRuleText={view.account_rule_text}
              />

              <div className="split" style={{ marginTop: 10 }}>
                <div>
                  <label>存档槽位</label>
                  <input type="text" value={saveSlot} onChange={(e) => setSaveSlot(e.target.value)} />
                </div>
                <div>
                  <label>读取已有存档</label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) void handleLoad(e.target.value);
                    }}
                  >
                    <option value="">选择存档…</option>
                    {saveList.map((s) => (
                      <option key={s.slot} value={s.slot}>
                        {s.slot} · {s.game_date} · {money(s.equity)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button className="good" onClick={handleSave}>
                  保存存档
                </button>
                <button className="ghost" onClick={refreshSaveList}>
                  刷新
                </button>
              </div>
            </details>

            {/* Spec Section 30/56: secondary-tier reference data */}
            <details className="panel collapsible-section ot-panel" data-onboarding-panel="ADVANCED">
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>全球宏观数据 (Macro Snapshot)</summary>
              <MacroDashboardPanel macro={view.macro_snapshot ?? null} />
            </details>

            <details className="panel collapsible-section ot-panel" data-onboarding-panel="ADVANCED">
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>公开新闻快讯 (News Feed)</summary>
              <NewsFeedPanel events={events} />
            </details>

            <details className="panel collapsible-section ot-panel">
              <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>音效与音频设置 (Audio Settings)</summary>
              <div className="split" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
                <div>
                  <label>主音量</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioLevels.master}
                    onChange={(e) => updateAudio({ master: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>音效 SFX</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioLevels.sfx}
                    onChange={(e) => updateAudio({ sfx: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>环境音</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={audioLevels.ambience}
                    onChange={(e) => updateAudio({ ambience: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <button className="ghost" onClick={() => updateAudio({ muted: !audioLevels.muted })}>
                  {audioLevels.muted ? '取消静音' : '静音'}
                </button>
              </div>
            </details>
           </FundRiskRail>}

           {/* CENTER COLUMN: Trading Terminal, Chart, Options Chain, Scanner */}
          <div className="col-center market-command-main">
            {mobileTab === 'scanner' ? (
              <ScannerPanel
                scannerResult={view.scanner_result ?? null}
                onSelectTicker={(ticker) => {
                  navigateWorkspace('MARKET', 'trade');
                  setLastOrderMessage(`已切换至 ${ticker} 标的视野。`);
                }}
              />
            ) : (
              <>
                <div className="panel">
                  <div className="statusline">
                    <div>
                      <span className="badge real">{node.point_only ? 'REAL EVENT CLOSES' : 'REAL DAILY OHLC'}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 6 }}>
                        {node.date}
                        {node.label ? ` · ${node.label}` : ''}
                      </span>
                    </div>
                    <div className="btnrow">
                      <button
                        type="button"
                        data-testid="review-previous-node"
                        onClick={() => void reviewNode(dayIndex - 1)}
                        disabled={advancing || dayIndex <= 0 || liveDayIndex <= 0 || view.market_clock?.node_granularity === 'EVENT_WINDOW'}
                      >
                        ◀ 回看上一节点
                      </button>
                      {/* ADVANCE button removed — single instance lives in CommandBottomRail dock */}
                    </div>
                  </div>

                  {/* 同一屏上 NAV/Cash/未实现P&L 出现了三次：顶部状态条、这里、左栏资金与风控。
                      左栏那份现在带 NAV 曲线和环形图，是信息最全的；顶部那份是常驻速览。
                      这一份最冗余，而且正好卡在主图上方偷高度。
                      但「已实现 P&L」只在这里有，所以不能删——改成单行密排。
                      （2026-08-19 claude，dante R6-P0） */}
                  <div className="ui-enforced market-capital-scope">
                  <div className="kpirow kpirow-compact market-capital-strip">
                    <div className="kpi market-capital-primary">
                      <div className="k">净资产 NAV</div>
                      <div className="v font-mono">{money(view.equity)}</div>
                    </div>
                    <div className="kpi market-capital-secondary">
                      <div className="k">现金 CASH</div>
                      <div className="v font-mono">{money(view.state.cash)}</div>
                      {cashRatio == null ? (
                        <span className="market-viz-na">DATA_UNAVAILABLE</span>
                      ) : (
                        <div className="market-ratio-line">
                          <div className="market-ratio-track">
                            <i style={{ width: `${Math.min(100, Math.max(0, cashRatio * 100))}%` }} />
                          </div>
                          <small>{(cashRatio * 100).toFixed(0)}%</small>
                        </div>
                      )}
                    </div>
                    <div className="kpi market-capital-secondary">
                      <div className="k">未实现 P&L</div>
                      <div className={`v font-mono ${view.unrealized_pnl >= 0 ? 'green' : 'red'}`}>{money(view.unrealized_pnl)}</div>
                      {(() => {
                        const w = pnlVizWidth(view.unrealized_pnl);
                        return w == null ? <span className="market-viz-na">DATA_UNAVAILABLE</span> : (
                          <div className="market-pnl-axis" title="视觉刻度 ±5% NAV；上方数字为精确P&L">
                            <b />
                            <i
                              className={view.unrealized_pnl >= 0 ? 'is-positive' : 'is-negative'}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                    <div className="kpi market-capital-secondary">
                      <div className="k">已实现 P&L</div>
                      <div className={`v font-mono ${view.state.realized_pl >= 0 ? 'green' : 'red'}`}>{money(view.state.realized_pl)}</div>
                      {(() => {
                        const w = pnlVizWidth(view.state.realized_pl);
                        return w == null ? <span className="market-viz-na">DATA_UNAVAILABLE</span> : (
                          <div className="market-pnl-axis" title="视觉刻度 ±5% NAV；上方数字为精确P&L">
                            <b />
                            <i
                              className={view.state.realized_pl >= 0 ? 'is-positive' : 'is-negative'}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  </div>

                  {(view.state.account_type === 'MARGIN' || (view.state.account_type as string) === 'Margin') && (
                    <div className={view.margin_call_active ? 'warn' : 'src'} style={{ marginBottom: 8 }}>
                      <strong>Margin 状态：</strong>保证金负债 {money(view.state.margin_debt)} · 维持担保金{' '}
                      {money(view.margin_requirement)} · 剩余买力 {money(view.margin_buying_power)}
                      {(view.state.cumulative_margin_interest_paid ?? 0) > 0 && (
                        <> · 累计利息 <span className="text-red font-mono">{money(view.state.cumulative_margin_interest_paid)}</span></>
                      )}
                      {view.margin_call_active ? '　⚠ 已触发 Margin Call' : ''}
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                        JPM 主经纪商信任分 {(view.state.institutional_relationships?.jpmorgan?.trust ?? 60).toFixed(0)} 正在实际影响上述维持担保金与买力（关系越好，Haircut 越低）；
                        融资点差 SOFR+{(view.state.institutional_relationships?.jpmorgan?.financing_spread_bps ?? 150).toFixed(0)}bps 正在按日计息计入保证金负债——去投行专柜谈判可真实降低成本。
                      </div>
                    </div>
                  )}

                  {/* MARKET CLOCK. The slider only scrubs BACKWARD through nodes already
                      reached; forward movement must go through ADVANCE MARKET so the pause
                      evaluation cannot be skipped. Labels say "node", never an hour offset,
                      because the campaign data is discrete daily bars with no intraday source. */}
                  <div className="timeline" data-testid="market-clock">
                    <span className="clock-state" data-testid="clock-paused">
                      {view.market_clock?.paused === false ? 'MARKET OPEN' : '⏸ MARKET PAUSED'}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, liveDayIndex)}
                      step={1}
                      value={dayIndex}
                      disabled={advancing || liveDayIndex <= 0 || view.market_clock?.node_granularity === 'EVENT_WINDOW'}
                      onChange={(e) => void reviewNode(Number(e.target.value))}
                      title="回看已经历过的历史节点（不会推进市场）"
                    />
                    <div className="clock">
                      节点 <span className="en-secondary">NODE</span> {dayIndex + 1}/{totalDays} · {node.date}
                      {node.point_only ? '' : <> · 收盘节点 <span className="en-secondary">DAILY CLOSE</span></>}
                      {isReviewing && <> · 回看态 <span className="en-secondary">REVIEW</span></>}
                    </div>
                  </div>

                  {(view.market_clock?.pause_reasons?.length ?? 0) > 0 && (
                    <div className="pause-reasons" data-testid="pause-reasons">
                      <div className="pause-reasons-title">市场为何暂停 <span className="en-secondary">WHY THE MARKET STOPPED</span></div>
                      <div className="pause-reasons-list">
                        {view.market_clock!.pause_reasons.map((r, i) => (
                          <details key={`${r.trigger_id}-${i}`} className={`pause-reason sev-${r.severity}`}>
                            <summary className="pause-reason-summary">
                              <span className="pause-sev">{r.severity}</span>
                              <span className="pause-headline">{r.headline}</span>
                              <span className="pause-provenance ot-badge ot-badge-simulated">{formatProvenance(r.source_type)}</span>
                              <span className="pause-expand-toggle" aria-hidden="true">详情 ▾</span>
                            </summary>
                            {r.detail && (
                              <div className="pause-detail-body">
                                <span className="pause-detail">{r.detail}</span>
                                <span className="pause-src font-mono">来源：{formatProvenance(r.source_type)} · 面板：{r.source_panel}</span>
                              </div>
                            )}
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div data-onboarding-panel="CHART">
                <MarketHeroStage>
                <Suspense fallback={<div className="chart-loading-placeholder">加载 K 线图表引擎...</div>}>
                  <PriceChartPanel
                    nodes={nodes}
                    visibleCount={dayIndex + 1}
                    totalNodeCount={totalDays}
                    campaignId={view.state.campaign_id}
                    currentGameDate={node.date}
                    onChartReady={setChartReady}
                    /* 盘中走势用的真实小时 bar。**取哪些是有严格规矩的**：
                     *
                     *   · 当天正在逐时点揭示 → 只能取 `visible_price_bars`
                     *     （逐窗增长 1 → 2 → 5 → …）。把整天的 bar 传下去就是
                     *     前视泄漏：玩家会在时点走完之前看到当天后面的走势。
                     *   · **严格早于当前游戏日的日子** → 那一天整天都已经走完了，
                     *     从数据包取全量小时 bar 不构成前视。
                     *
                     * `market_reveal` 只保存当天的会话，推进过去就被置 null，
                     * 所以第二条是必要的——否则玩家走完 Golden Day 之后
                     * 盘中走势会凭空消失。
                     */
                    intradayBars={intradayBarsForChart}
                    dailyVisualAnchor={dailyVisualAnchorForChart}
                    eventPins={chartEventPins}
                  />
                </Suspense>
                </MarketHeroStage>
                </div>

                {/* batch2 断点3/4/5：无 Thesis 时的走势引导——Maya 批注 + 结论推导器。 */}
                <TrendConclusionGuide
                  visible={
                    !trendGuideDismissed &&
                    Object.keys(view.state.active_theses ?? {}).length === 0 &&
                    (view.state.positions?.length ?? 0) === 0
                  }
                  underlying={campaignMeta?.underlying ?? view.state.campaign_id.toUpperCase()}
                  // The coaching copy describes the same admitted campaign
                  // nodes as the player-facing chart. Indicator lookback bars
                  // remain available to the fundamentals/indicator panels, but
                  // must not inflate this narrative to a fictitious 61 bars.
                  bars={nodes
                    .filter((n) => n.date <= node.date)
                    .map((n) => ({
                      date: n.date,
                      close: n.underlying_bar.close,
                      high: n.underlying_bar.high,
                      low: n.underlying_bar.low,
                    }))}
                  onConclude={(dir) => {
                    setThesisSeedDirection(dir);
                    setTrendGuideDismissed(true);
                    setThesisModalOpen(true);
                  }}
                  onDismiss={() => setTrendGuideDismissed(true)}
                />

                <DecisionDeck
                  thesis={dockThesis}
                  selectedKey={pendingDecision}
                  preview={decisionPreview}
                  onSelect={handleDecisionKey}
                  onConfirm={confirmPendingDecision}
                  onClear={() => setPendingDecision(null)}
                />

                {layoutMode === 'mobile' && (
                  <>
                    <MobileWarRoomPresence
                      state={view.state as never}
                      asOfDate={node?.date ?? ''}
                      dateHistory={dateHistory}
                      pendingEvents={(view.human_action_feed || []).filter((event) => !event.resolved).length}
                      onOpenEvents={() => setHumanActionOpen(true)}
                      onOpenLedger={() => setPowerLedgerOpen(true)}
                      onOpenRoom={() => setWarRoomOpen(true)}
                    />
                    <MobilePositionInstrument
                      count={view.state.positions.length}
                      pnl={mobilePositionPnl}
                      underlying={campaignMeta?.underlying ?? view.state.campaign_id.toUpperCase()}
                    />
                  </>
                )}
                {layoutMode !== 'mobile' && onboardingActive && ONBOARDING_STEPS[onboardingStep]?.id === 'THESIS' && (
                  <div data-onboarding-panel="THESIS" className="guided-thesis-entry">
                    <button
                      type="button"
                      className="ot-btn ui-btn ui-btn-primary"
                      data-coach="thesis-open"
                      onClick={() => setThesisModalOpen(true)}
                    >
                      建立当前 Thesis ▶
                    </button>
                  </div>
                )}



                {/* V29-UI-B: finance-site style summary under the chart. Every field carries
                    its own truth label; missing packs render DATA_UNAVAILABLE with the
                    specific reason rather than a blank or an estimate. */}
                {layoutMode !== 'mobile' && <Suspense fallback={<div className="panel">标的概况加载中…</div>}>
                  <StockFundamentalsPanel
                    snapshot={buildFundamentalsSnapshot(
                      campaignMeta?.underlying ?? view.state.campaign_id.toUpperCase(),
                      nodes,
                      node.date,
                      (() => {
                        const ticker = campaignMeta?.underlying ?? '';
                        // Name/sector come from the bundled universe table via the scanner
                        // rows -- real identifiers, not market observations.
                        const row = view.scanner_result?.rows?.find((r) => r.ticker === ticker);
                        // An admitted daily-history pack, when one exists for this ticker,
                        // supplies the long series the 52-week/MA windows need. The campaign
                        // node list is only 7-10 days and stays the fallback.
                        const pack = getDailyHistoryPack(ticker);
                        return {
                          name: row?.name,
                          sector: row?.sector,
                          historyBars: loadDailyHistory(ticker, node.date),
                          historySourceName: pack
                            ? `${pack.source_name ?? '本地日线包'}${pack.batch_id ? ` · ${pack.batch_id}` : ''}`
                            : undefined,
                          secProfile: getSecProfile(ticker),
                          // Keyed by the CURRENT game date, so a January scene can only ever
                          // receive the P/E that was public in January.
                          secValuation: getSecValuation(ticker, node.date),
                          // SIMULATED sell-side consensus. Fed only bars up to the current
                          // date — the modelled analysts must be as blind as the player.
                          analystConsensus: simulateAnalystConsensus(
                            ticker,
                            node.date,
                            loadDailyHistory(ticker, node.date)
                          ),
                        };
                      })()
                    )}
                  />
                </Suspense>}

                {/* Spec Section 30: GEX/Market Structure/News are secondary-tier, not
                    primary-row content -- collapsed by default under the chart.
                    GexAnalyticsPanel renders its own <h3> title, so the summary here is
                    a plain toggle affordance, not a duplicate label. */}
                {layoutMode !== 'mobile' && <details className="panel collapsible-section" data-onboarding-panel="ADVANCED">
                  <summary className="ia-summary gex-collapse-summary">
                    <span>Gamma / GEX 分析</span>
                    <span className="ia-summary-meta font-mono">
                      Wall {view.gex_summary?.gamma_concentration_wall != null
                        ? `$${view.gex_summary.gamma_concentration_wall.toFixed(1)}`
                        : 'DATA_UNAVAILABLE'}
                    </span>
                  </summary>
                  <GexAnalyticsPanel gexSummary={view.gex_summary ?? null} />
                </details>}

                <details
                  className="trading-options-order execution-bay"
                  data-testid="options-order-area"
                  data-visual-key="execution-bay"
                  open={layoutMode === 'mobile' || executionBayOpen}
                  onToggle={(event) => {
                    if (layoutMode !== 'mobile') setExecutionBayOpen(event.currentTarget.open);
                  }}
                >
                  <summary className="execution-bay-summary">
                    <span className="execution-bay-title">TRADE PANEL <small>执行交易台</small></span>
                    <span className="execution-bay-contract font-mono">{liveSelectedQuote ? selectedContractLabel : 'NO CONTRACT SELECTED'}</span>
                    <span className="execution-bay-mode font-mono">{side.toUpperCase()} · {orderKind.toUpperCase()} · ×{qty}</span>
                    <span className="execution-bay-toggle">{executionBayOpen ? 'COLLAPSE' : 'OPEN EXECUTION BAY'} ▾</span>
                  </summary>
                  <div className="execution-bay-grid">
                  {/* data-coach anchors the guided-onboarding spotlight. It is an attribute,
                      never a label or DOM position, so relabelling the UI cannot break it. */}
                  <div data-coach="options-chain" data-onboarding-panel="OPTIONS_CHAIN" className="trading-chain-slot">
                    <OptionsChainPanel
                      quotes={chain}
                      selectedKey={selectedQuote?.contract_key ?? null}
                      onSelect={handleSelectQuoteForMobile}
                      realOptionsLoaded={view.state.real_options_loaded}
                      side={side}
                      onSideChange={setSide}
                      expirations={EXPIRATIONS[view.state.campaign_id] ?? []}
                      selectedExpiration={selectedExpiration}
                      onExpirationChange={setSelectedExpiration}
                      thesisDirection={
                        attachedThesis?.direction === 'BULLISH' || attachedThesis?.direction === 'BEARISH'
                          ? attachedThesis.direction
                          : null
                      }
                      underlyingPrice={node.underlying_bar.close}
                      intradaySettlementActive={Boolean(
                        (view.state as any).market_reveal
                        && (view.state as any).market_reveal.current_window_index >= 0
                      )}
                    />
                  </div>

                  <div className="trading-order-slot" data-onboarding-panel="ORDER_TICKET">
                    <OrderTicketPanel
                      selectedContractLabel={selectedContractLabel}
                      qty={qty}
                      onQtyChange={setQty}
                      orderKind={orderKind}
                      onOrderKindChange={setOrderKind}
                      limitPrice={limitPrice}
                      onLimitPriceChange={setLimitPrice}
                      onBuyToOpen={() => void submitOrder('buy_to_open')}
                      onSellToClose={() => void submitOrder('sell_to_close')}
                      onBuyToClose={() => void submitOrder('buy_to_close')}
                      onWriteCoveredCall={() => void submitOrder('sell_covered_call')}
                      onWriteCashSecuredPut={() => void submitOrder('sell_cash_secured_put')}
                      onBuyShares={() => void submitOrder('buy_shares')}
                      onSellShares={() => void submitOrder('sell_shares')}
                      onVerticalSpread={handleVerticalSpread}
                      onStraddle={handleStraddle}
                      shareButtonsDisabled={isIndexCampaign}
                      writeButtonsDisabled={isIndexCampaign}
                      shareButtonLabel={campaignMeta?.underlying ?? ''}
                      warningText={lastOrderMessage}
                      tradeFlashActive={tradeFlashActive}
                       onOpenThesis={() => setThesisModalOpen(true)}
                       hasThesis={hasOpeningThesis}
                       submitting={orderSubmitting}
                       openingBlocked={openingBlocked}
                       openPositions={(view.state.positions ?? []).filter((position) => position.qty > 0)}
                       sellToCloseDisabled={!selectedCloseAvailability.canSellToClose}
                       buyToCloseDisabled={!selectedCloseAvailability.canBuyToClose}
                    />
                    {lastTradeConfirmation && (
                      <div className="v28-trade-confirmation" style={{ marginTop: 6, padding: '8px 10px', borderLeft: '3px solid var(--cyan, #22d3ee)', background: 'rgba(34,211,238,0.06)', fontSize: 13, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>成交确认 (Trade Confirmation)</div>
                        <div className="font-mono" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span>现金 {money(lastTradeConfirmation.cashBefore)} → {money(lastTradeConfirmation.cashAfter)}{' '}
                            <span className={lastTradeConfirmation.cashAfter - lastTradeConfirmation.cashBefore >= 0 ? 'text-green' : 'text-red'}>
                              ({lastTradeConfirmation.cashAfter - lastTradeConfirmation.cashBefore >= 0 ? '+' : ''}{money(lastTradeConfirmation.cashAfter - lastTradeConfirmation.cashBefore)})
                            </span>
                          </span>
                          <span>净值 {money(lastTradeConfirmation.navBefore)} → {money(lastTradeConfirmation.navAfter)}{' '}
                            <span className={lastTradeConfirmation.navAfter - lastTradeConfirmation.navBefore >= 0 ? 'text-green' : 'text-red'}>
                              ({lastTradeConfirmation.navAfter - lastTradeConfirmation.navBefore >= 0 ? '+' : ''}{money(lastTradeConfirmation.navAfter - lastTradeConfirmation.navBefore)})
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </details>

                {layoutMode !== 'mobile' && <div data-onboarding-panel="ADVANCED">
                <MarketStructureBrief
                  flow={view.flow_summary}
                  positioning={view.positioning_summary}
                  counterparty={view.counterparty_profile}
                  onOpenFullDesk={() => setFlowDeskOpen(true)}
                />
                </div>}

                {layoutMode !== 'mobile' && <div data-coach="positions-panel" data-onboarding-panel="POSITIONS_PNL">
                <PositionsAttributionPanel
                  positions={view.state.positions}
                  marks={positionMarksById}
                  sharesRow={sharesRow}
                  underlyingLabel={campaignMeta?.underlying ?? ''}
                  attribution={view.state.last_attribution ?? null}
                  thesisHistory={view.state.thesis_history}
                  openThesisDrift={view.open_thesis_drift}
                  onReviseThesis={(positionId) => {
                    setRevisingPositionId(positionId);
                    setThesisModalOpen(true);
                  }}
                  onClosePosition={(position) => void handleClosePosition(position)}
                  onExercisePosition={(position) => void handleExercisePosition(position)}
                  onCloseStrategy={(sid, legs) => void handleCloseStrategy(sid, legs)}
                />
                </div>}

                {layoutMode === 'mobile' && (
                  <>
                    <section className="mobile-command-alerts" data-testid="mobile-command-alerts" data-visual-key="mobile-alerts">
                      <span className="command-kicker">ALERTS</span>
                      <strong>{dockPending > 0 ? `${dockPending} 件待表态事件` : '暂无待表态事件'}</strong>
                    </section>
                    <MobileMachineBase
                      advancing={advancing}
                      reviewing={isReviewing}
                      disabled={advancing || (!isReviewing && dayIndex >= totalDays - 1)}
                      regime={regime.label}
                      vix={node.vix?.close ?? null}
                      pendingAlerts={dockPending}
                      nextEvent={view.market_clock?.next_node_label || node.label || 'NEXT NODE'}
                      onAdvance={() => void (isReviewing ? exitReview() : advanceMarket('NEXT_NODE'))}
                    />
                  </>
                )}
              </>
            )}
          </div>

          {/* RIGHT COLUMN: Greeks, War Room Rail, AI Funds & Context */}
           {layoutMode !== 'mobile' && <WarRoomCommandRail><div className="command-right-content">
            {/* 组合层希腊字母（2026-08-19 claude）
                下面那个 GreeksPanel 看的是"选中的那一张合约"；这个看的是
                "我整个账本"。玩家做对冲决策看的是后者，而这一格以前是空的。

                为什么排在 War Room 之前：第一版放在后面，实机截图上
                整块被四张席位卡挤到折叠线以下，只露出半个标题——
                等于没做。这是本轮自查抓到的三个缺陷之一。 */}
            <div className="panel ot-panel ot-greeks-radar">
              <div className="ot-section-header">
                <div className="ot-section-titles">
                  <span className="ot-section-zh">组合风险剖面</span>
                  <span className="ot-section-en">PORTFOLIO GREEKS</span>
                </div>
                <span className="ot-greeks-direction">{describeDirection(view.portfolio_greeks, view.equity, node?.underlying_bar.close ?? 0)}</span>
              </div>
              {/**
                * 维度不够就不画雷达（2026-08-19 claude）
                *
                * 只持正股时，Γ/Θ/V **本来就是 0**——正股没有这些敞口，
                * 数字完全正确。但画成五边形雷达就只剩一根细刺，
                * 评审的原话是「数学正确但视觉上非常像组件坏了/没加载」。
                *
                * 解法不是把 0 改成好看的假数（那是造假），
                * 而是**换一种如实的画法**：有效维度 <3 时改用横向敞口条，
                * 并写清"这是正股仓位，本来就只有 Δ"。
                */}
              {greeksLiveDims >= 3 ? (
                <div className="ot-greeks-radar-body">
                  <Radar source="portfolioGreeks" axes={greeksRadarAxes} size={148} />
                  <div className="ot-greeks-nums">
                    <div><span>Δ</span><b>{fmt(view.portfolio_greeks?.delta ?? 0, 0)}</b></div>
                    <div><span>Γ</span><b>{fmt(view.portfolio_greeks?.gamma ?? 0, 2)}</b></div>
                    <div><span>Θ</span><b>{fmt(view.portfolio_greeks?.theta ?? 0, 0)}</b></div>
                    <div><span>V</span><b>{fmt(view.portfolio_greeks?.vega ?? 0, 0)}</b></div>
           </div>
         </div>
              ) : (
                <div className="ot-greeks-flat">
                  {greeksRadarAxes.map((a) => (
                    <div key={a.label} className={`ot-greeks-flat-row ${a.value ? '' : 'is-zero'}`}>
                      <span className="ot-greeks-flat-label">{a.label}</span>
                      <MeterBar source="portfolioGreeks" value={a.value ?? 0} width={132} height={7} warn={0.6} danger={0.85} />
                      <b className="ot-greeks-flat-val">
                        {a.label.startsWith('Δ') ? fmt(view.portfolio_greeks?.delta ?? 0, 0)
                          : a.label.startsWith('Γ') ? fmt(view.portfolio_greeks?.gamma ?? 0, 2)
                          : a.label.startsWith('Θ') ? fmt(view.portfolio_greeks?.theta ?? 0, 0)
                          : a.label.startsWith('V') ? fmt(view.portfolio_greeks?.vega ?? 0, 0)
                          : marginUtil == null ? '—' : `${(marginUtil * 100).toFixed(0)}%`}
                      </b>
                    </div>
                  ))}
                  <div className="ot-greeks-flat-note">
                    {(view.portfolio_greeks?.shares_counted ?? 0) !== 0 && (view.portfolio_greeks?.contracts_counted ?? 0) === 0
                      ? `当前只有正股 ${view.portfolio_greeks?.shares_counted} 股：正股没有 Γ/Θ/V 敞口，这几项为 0 是对的。`
                      : '有效敞口维度不足 3 项，改用条形显示；补上期权仓位后会切回雷达图。'}
                  </div>
                </div>
              )}
              {view.portfolio_greeks?.partial && (
                <div className="ot-greeks-partial">
                  ⚠ 合计不完整：{view.portfolio_greeks.contracts_missing} 张合约取不到希腊字母，未计入
                </div>
              )}
            </div>

            <WarRoomRail
              state={view.state as never}
              asOfDate={node?.date ?? ''}
              dateHistory={dateHistory}
              forceExpanded
              pendingEvents={(view.human_action_feed || []).filter((e) => !e.resolved).length}
              onOpenEvents={() => setHumanActionOpen(true)}
              onOpenLedger={() => setPowerLedgerOpen(true)}
              onOpenRoom={() => setWarRoomOpen(true)}
            />

            <section className="reference-system-alerts" data-visual-key="system-alerts">
              <div className="reference-alerts-head">
                <span>SYSTEM ALERTS</span>
                <b className={dockPending > 0 ? 'is-hot' : ''}>{dockPending}</b>
              </div>
              {(view.human_action_feed ?? []).filter((event) => !event.resolved).slice(0, 3).map((event, index) => (
                <button key={`${event.id ?? index}`} type="button" className="reference-alert-row" onClick={() => setHumanActionOpen(true)}>
                  <span className="reference-alert-severity">{index === 0 ? '!' : '·'}</span>
                  <span>{event.headline || 'Pending desk action'}</span>
                </button>
              ))}
              {dockPending === 0 && <div className="reference-alert-empty">DESK CLEAR · NO PENDING ACTIONS</div>}
            </section>

            <div data-onboarding-panel="RISK_PREVIEW">
            {liveSelectedQuote ? (
              <GreeksPanel
                quote={liveSelectedQuote}
                ivLabel="教学模型估算：叠加行权价偏斜 (IV Skew) 与做市商库存宽化模型。"
              />
            ) : (
              <div className="panel greeks-empty-hint ot-panel" style={{ marginTop: 10 }}>选择期权合约后查看单张合约 Greeks</div>
            )}
            </div>
            {/* Spec Section 32: AI opponent ranking shouldn't occupy the Trading Floor
                first screen -- collapsed by default here (same lower-risk approach as
                Section 31's Save/Load panel, rather than a full move into FundHQPortal). */}
            <details className="panel collapsible-section ot-panel" open style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <summary className="title" style={{ cursor: 'pointer' }}>AI 对手基金排行 (AI Fund Ranking)</summary>
              <AIFundsRankingPanel ranking={funds.ranking} />
            </details>
            <div className="panel ot-panel" style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <div className="title">基金统计概况</div>
              <FundStatsPanel stats={view.state.fund_stats} />
            </div>
            <details className="panel collapsible-section ot-panel" style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <summary className="title ia-summary">
                <span>人脉与机构关系 <span className="en-secondary">RELATIONSHIPS</span></span>
                <span className="ia-summary-meta">{Object.keys(view.state.relationships ?? {}).length} 联系人</span>
              </summary>
              <RelationshipsPanel relationships={view.state.relationships} characters={characters} />
            </details>
            <details className="panel collapsible-section ot-panel" style={{ marginTop: 10 }} data-onboarding-panel="ADVANCED">
              <summary className="title ia-summary">
                <span>待处理剧情简报 <span className="en-secondary">STORY INBOX</span></span>
                <span className="ia-summary-meta">
                  {(view.pending_story_public ?? []).filter((e) => !e.resolved).length} 待处理
                </span>
              </summary>
              <StoryInboxPanel
                events={view.pending_story_public}
                history={(view.state.story_history ?? []) as never}
                characters={characters}
                onChoice={handleStoryChoice}
                onResume={(eventId) => void handleResumeStory(eventId)}
              />
            </details>
            <details className="panel collapsible-section ot-panel" style={{ marginTop: 10 }} data-onboarding-panel="ORDER_LOG">
              <summary className="title ia-summary">
                <span>历史委托明细 <span className="en-secondary">ORDER LOG</span></span>
                <span className="ia-summary-meta">{view.state.order_log?.length ?? 0} 笔记录</span>
              </summary>
              <OrderLogPanel entries={view.state.order_log} />
             </details>
           </div></WarRoomCommandRail>}

           {/**
            * Command Dock（2026-08-19 claude，dante A3）
            *
            * 评审原话：「ADVANCE 在上方是个普通按钮，真正『当前论点 → 行动 →
            * 节点 → 推进市场』的命令链没形成底部 dock；参考图 CTA 是压轴」。
            *
            * 这条不是加装饰，是把**一次决策需要的四样东西收到同一处**：
            * 你现在赌的是什么、有没有事等你表态、走到哪一天了、下一步按哪里。
            * 之前这四样分散在四个角落。
            *
            * 数据全部来自已有真实状态，**没有新增任何编出来的字段**：
            *   论点   state.active_theses（玩家自己写的）
            *   待表态 human_action_feed 里未解决的条数
            *   节点   game_day_index / totalDays
            * 没有论点就明说「尚未建立论点」，不编一句占位文案。
            */}
          {layoutMode !== 'mobile' && <CommandBottomRail>
            <div className="command-bottom-status-grid" data-testid="command-bottom-status-grid">
              <div className="command-bottom-readout"><small>DATABASE</small><strong>LOCAL · READY</strong></div>
              <div className="command-bottom-readout"><small>MARKET REGIME</small><strong>{regime.label}</strong></div>
              <div className="command-bottom-readout"><small>VIX</small><strong>{node.vix?.close != null ? node.vix.close.toFixed(2) : 'NO FEED'}</strong></div>
              <div className="command-bottom-readout"><small>ALERTS</small><strong className={dockPending > 0 ? 'is-hot' : ''}>{dockPending > 0 ? `${dockPending} PENDING` : 'CLEAR'}</strong></div>
              <div className="command-bottom-readout"><small>NODE</small><strong>{dayIndex + 1}/{totalDays} · {node.date}</strong></div>
            </div>

            <button
              type="button"
              className="ot-dock-cta"
              data-coach={isReviewing ? undefined : 'advance-market'}
              data-testid={isReviewing ? 'exit-review' : 'advance-market'}
              onClick={() => void (isReviewing ? exitReview() : advanceMarket('NEXT_NODE'))}
              disabled={advancing || (!isReviewing && dayIndex >= totalDays - 1)}
            >
              <span className="ot-dock-cta-copy">
                <strong>{advancing ? '处理中…' : isReviewing ? '返回当前节点' : dayIndex >= totalDays - 1 ? '战役已到最后节点' : 'ADVANCE MARKET'}</strong>
                <small>{isReviewing ? 'EXIT REVIEW' : view.market_clock?.next_node_label || node.label || 'NEXT NODE'}</small>
              </span>
              <span className="ot-dock-cta-chevron" aria-hidden="true">»»</span>
            </button>
           </CommandBottomRail>}
         </div>
        </MarketCommandShell>
       )}

      </main>

       {/* 5-Tab Mobile Navigation Bar */}
      <div className="mobile-nav-bar" data-visual-key="mobile-command-dock" aria-label="Mobile command dock">
        <button
          className={`nav-tab-btn ${activeWorkspace === 'MARKET' && mobileTab === 'trade' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('MARKET', 'trade')}
        >
          <span className="nav-tab-icon"><AppIcon name="market" /></span>
          <span>交易</span>
        </button>
        <button
          className={`nav-tab-btn ${activeWorkspace === 'PORTFOLIO' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('PORTFOLIO', 'portfolio')}
        >
          <span className="nav-tab-icon"><AppIcon name="portfolio" /></span>
          <span>仓位</span>
        </button>
        <button
          className={`nav-tab-btn ${activeWorkspace === 'MARKET' && mobileTab === 'scanner' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('MARKET', 'scanner')}
        >
          <span className="nav-tab-icon"><AppIcon name="scanner" /></span>
          <span>选股</span>
        </button>
        <button
          className={`nav-tab-btn ${activeWorkspace === 'INTEL' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('INTEL', 'intel')}
        >
          <span className="nav-tab-icon"><AppIcon name="intel" /></span>
          <span>剧情</span>
        </button>
        <button
          className={`nav-tab-btn ${activeWorkspace === 'HQ' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('HQ', 'settings')}
        >
          <span className="nav-tab-icon"><AppIcon name="hq" /></span>
          <span>总部</span>
        </button>
      </div>

      {/* Story & Campaign Modals */}
      <WarRoomModal
        meeting={view.latest_war_room ?? null}
        warRoomHistory={view.state.war_room_history ?? []}
        isOpen={activeUIEvent?.id === 'war-room'}
        previousGameDate={prevNode?.date ?? null}
        onClose={() => closeAppOverlay('WAR_ROOM', setWarRoomOpen)}
        gameView={view}
        onSelectChoice={(choiceId) => { void handleResolveWarRoomChoice(choiceId); }}
      />

      <Suspense fallback={null}>
        <StrategyLabModal open={strategyLabOpen} onClose={() => setStrategyLabOpen(false)} />
      </Suspense>

      <div data-onboarding-panel="THESIS">
      <ThesisModal
        contractOrSymbol={selectedContractLabel}
        // 失效位永远在"标的价格"量纲上：invalidation_breached 拿它和标的现价比。
        // 之前误传期权权利金 mid（2.87×0.93=2.67 那种），BEARISH 一开仓即被判"涨破失效位"。
        defaultPrice={node.underlying_bar.close}
        isOpen={activeUIEvent?.id === 'thesis'}
        mode={revisingPositionId ? 'revise' : 'create'}
        initial={!revisingPositionId && thesisSeedDirection ? { direction: thesisSeedDirection } : null}
        onClose={() => {
          setThesisModalOpen(false);
          setRevisingPositionId(null);
          setThesisSeedDirection(null);
        }}
        onSubmit={(thesis) => {
          if (reviewBlocksAction()) return;
          if (revisingPositionId) {
            // REVISE: append to history server-side. The frozen entry thesis and the
            // entry snapshot are deliberately left untouched.
            const posId = revisingPositionId;
            setRevisingPositionId(null);
            void (async () => {
              try {
                const res = await api.reviseThesis(view.state.session_id, {
                  position_id: posId,
                  direction: thesis.direction,
                  catalyst: thesis.catalyst,
                  expected_move_pct: thesis.expected_move_pct,
                  time_horizon_days: thesis.time_horizon_days,
                  invalidation_level: thesis.invalidation_level,
                  why_instrument: thesis.why_instrument,
                  risk_budget_usd: thesis.risk_budget_usd,
                  revision_reason: thesis.revision_reason ?? '',
                });
                setView(res.state);
                setLastOrderMessage(res.message);
              } catch (e) {
                setLastOrderMessage(e instanceof Error ? e.message : String(e));
              }
            })();
            return;
          }
          setAttachedThesis(thesis);
          setLastOrderMessage(`已成功建立开仓 Thesis (${thesis.direction})，下单时将自动绑定并进入复盘追踪。`);
        }}
      />
      </div>

      {showdownPrefill && (
        <div className="showdown-prefill-banner" data-testid="showdown-prefill-banner">
          <div>
            <strong>桌面对决订单已预填</strong>
            <span>{showdownPrefill.action === 'HEDGE' ? '先执行/调整对冲单，再回到盘中决策窗口。' : '先执行/调整加仓单，再回到盘中决策窗口。'}</span>
          </div>
          <button type="button" className="ot-btn ot-btn-ghost" onClick={() => setShowdownPrefill(null)}>
            取消预填 · 返回盘中决策
          </button>
        </div>
      )}

      {riskClosePrefill && !mobileSheetOpen && (
        <div className="showdown-prefill-banner" data-testid="risk-close-prefill-banner">
          <div>
            <strong>风险管理订单已预填</strong>
            <span>当前仓位与平仓方向已选好，请确认后执行。</span>
          </div>
          <HoldConfirmButton
            label={riskClosePrefill.side === 'sell_to_close' ? 'CONFIRM SELL TO CLOSE' : 'CONFIRM BUY TO CLOSE'}
            sublabel="Touch: hold to confirm · Desktop: click to confirm"
            className="risk-close-confirm is-irreversible"
            testId="risk-close-confirm"
            onConfirm={async () => {
              await submitOrder(riskClosePrefill.side);
              setRiskClosePrefill(null);
            }}
          />
          <button type="button" className="ot-btn ot-btn-ghost" onClick={() => setRiskClosePrefill(null)}>
            取消预填
          </button>
        </div>
      )}

      <CallStackRail
        calls={characterCalls}
        activeId={activeCharacterCallId}
        onOpen={setActiveCharacterCallId}
      />
      <CharacterCallOverlay
        call={activeCharacterCall}
        isOpen={Boolean(activeCharacterCall)}
        onChoice={(callId, choiceId) => {
          setActiveCharacterCallId(null);
          if (callId.startsWith('story:') && mayaCallEvent) {
            void handleStoryChoice(mayaCallEvent.id, choiceId);
            return;
          }
          if (callId.startsWith('lp:') && view) {
            void api.resolveLpInquiry(view.state.session_id, choiceId)
              .then((next) => setView(next))
              .catch(() => undefined);
          }
        }}
        onClose={(callId) => {
          setActiveCharacterCallId(null);
          if (callId.startsWith('story:') && mayaCallEvent) {
            void handleDeferStory(mayaCallEvent.id);
          } else if (callId.startsWith('lp:')) {
            setLpInquiryDismissed(true);
          }
        }}
      />

      {/* Batch3: important real-node crises break through the passive rail using the
          SAME UIEventDirector. No parallel scheduler/state machine is introduced. */}
      <DramaInterruptOverlay
        interrupt={dramaInterrupt}
        showdown={activeUIEvent?.id === 'position-showdown' ? positionShowdown : null}
        storyEvent={dramaInterrupt?.eventId ? activeStoryEvent : null}
        characters={characters}
        isOpen={activeUIEvent?.id === 'intrusive-drama' || activeUIEvent?.id === 'position-showdown'}
        onStoryChoice={handleDramaStoryChoice}
        onDefer={handleDramaDefer}
        onOpenTradeFloor={handleDramaTradeEntry}
        onHandleMargin={handleDramaMarginEntry}
        onShowdownChoice={(action) => void handleShowdownChoice(action)}
      />

      {/* CINEMATIC PRIORITY UI (P0): Narrative Story & NPC Dialogue Modal */}
      <StoryDialogueModal
        event={mayaCallEvent ? null : activeStoryEvent}
        characters={characters}
        queueLength={pendingStoryEvents.length}
        queueIndex={1}
        isOpen={activeUIEvent?.id === 'mandatory-story'}
        onChoice={(eventId, choiceId) => void handleStoryChoice(eventId, choiceId)}
        onDefer={(eventId) => void handleDeferStory(eventId)}
        onClose={() => {
          if (activeStoryEvent) void handleDeferStory(activeStoryEvent.id);
        }}
        returnFocusRef={storyReturnFocusRef}
      />

      <PositionDecisionModal
        isOpen={activeUIEvent?.id === 'position-decision'}
        pauseReason={activePositionDecisionReason}
        position={activePositionDecisionPosition}
        unrealizedPl={activePositionDecisionUnrealizedPl}
        contractLabel={activePositionDecisionLabel}
        thesisSummary={activePositionDecisionThesisSummary}
        onHold={() => void handlePositionDecisionHold()}
        onReduce={() => void handlePositionDecisionOrder(false)}
        onCloseAll={() => void handlePositionDecisionOrder(true)}
      />

      {/* GUIDED FIRST DAY. Coaches the REAL panels; never renders its own order controls
          and never advances the market on a timer -- its CTA calls the app's own handler. */}
      {activeUIEvent?.id === 'mandatory-tutorial' && (
        <GuidedOnboardingOverlay
          steps={ONBOARDING_STEPS}
          stepIndex={onboardingStep}
          view={view}
          hasDraftThesis={Boolean(attachedThesis)}
          selectedContractKey={selectedQuote?.contract_key ?? null}
          selectedStrike={selectedQuote?.strike ?? null}
          selectedExpiration={selectedExpiration}
          underlyingPrice={node.underlying_bar.close}
          onRecordDirection={(direction: TutorialDirection) => {
            if (direction === 'BULLISH' || direction === 'BEARISH') setThesisSeedDirection(direction);
            void api
              .setTutorial(view.state.session_id, {
                guided_active: true,
                tutorial_direction: direction,
                current_step: ONBOARDING_STEPS[onboardingStep]?.id ?? '',
              })
              .then(setView)
              .catch(() => undefined);
          }}
          advanceMarketBaseline={guidedAdvanceBaseline}
          onNavigateToChain={() => navigateWorkspace('MARKET', 'trade')}
          showFundHQ={showFundHQ}
          onAdvanceMarket={() => {
            // Idempotency guard lives in this ref (stable across the child
            // overlay's remounts), not in the child: the coach CTA must be able
            // to trigger the real advance at most once per step-6 visit.
            if (guidedAdvanceRequestedRef.current) return;
            guidedAdvanceRequestedRef.current = true;
            void advanceMarket('NEXT_NODE');
          }}
          onNext={() => {
            const done = ONBOARDING_STEPS[onboardingStep]?.id ?? '';
            setOnboardingStep((i) => Math.min(ONBOARDING_STEPS.length - 1, i + 1));
            void api
              .setTutorial(view.state.session_id, { completed_step: done })
              .then(setView)
              .catch(() => undefined);
          }}
          onSkip={() => {
            setOnboardingActive(false);
            void api
              .setTutorial(view.state.session_id, { guided_active: false, completed: true })
              .then(setView)
              .catch(() => undefined);
          }}
          onComplete={() => {
            setOnboardingActive(false);
            setFirstTradeReviewOpen(true);
            void api
              .setTutorial(view.state.session_id, {
                guided_active: false,
                completed: true,
                first_trade_review_shown: true,
              })
              .then(setView)
              .catch(() => undefined);
          }}
        />
      )}

      {/* Every modal below is code-split (React.lazy) since none of them are needed for first
          paint -- fallback={null} is safe here because they're all overlay/floating UI that
          simply appears a beat later on first use, with no layout to shift underneath them. */}
      <Suspense fallback={null}>
        {activeUIEvent?.id === 'first-trade-review' && (
          <FirstTradeReviewModal
            review={view.state.trade_reviews[view.state.trade_reviews.length - 1] ?? null}
            isOpen={activeUIEvent?.id === 'first-trade-review'}
            onClose={() => setFirstTradeReviewOpen(false)}
            onOpenFull360={() => {
              const last = view.state.trade_reviews[view.state.trade_reviews.length - 1];
              setFirstTradeReviewOpen(false);
              if (last) {
                setSelectedReview(last);
                setReviewModalOpen(true);
              }
            }}
          />
        )}
      {selectedReview && activeUIEvent?.id === 'trade-review' ? (
        <TradeReview360Modal
          review={selectedReview}
          onClose={() => setReviewModalOpen(false)}
        />
      ) : (
        <TradeReviewModal
          review={selectedReview}
          isOpen={activeUIEvent?.id === 'trade-review'}
          onClose={() => setReviewModalOpen(false)}
        />
      )}


      {wallStreetOpen && (
        <div className="modal-overlay" onClick={() => setWallStreetOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 1100, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setWallStreetOpen(false)}
              className="btn-close"
            >
              ✕
            </button>
            <WallStreetDeskPanel
              desks={view.wall_street_desk || []}
              playerScore={view.player_street_score}
              relationships={view.state.institutional_relationships || {}}
              sessionId={view.state.session_id}
              onInteract={handleBankInteract}
            />
          </div>
        </div>
      )}

      {capitalPowerOpen && (
        <div className="modal-overlay" onClick={() => setCapitalPowerOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 1100, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setCapitalPowerOpen(false)}
              className="btn-close"
            >
              ✕
            </button>
            <CapitalPowerPanel
              managementCompany={view.state.management_company}
              gpWealth={view.state.gp_wealth}
              fundNav={view.equity}
              economy={view.state.economy}
              intel={view.state.intel}
              fundStats={view.state.fund_stats}
              employees={view.state.employees}
              dataSubscriptions={view.state.data_subscriptions}
              aiStack={view.state.ai_stack}
              evidenceState={view.state.evidence_state}
              onHire={async (role, name) => {
                if (reviewBlocksAction()) return '';
                const res = await api.hireEmployee(view.state.session_id, role, name);
                setView(res.state);
                return res.message;
              }}
              onFire={async (employeeId) => {
                if (reviewBlocksAction()) return '';
                const res = await api.fireEmployee(view.state.session_id, employeeId);
                setView(res.state);
                return res.message;
              }}
              onBonus={async (employeeId, bonusPct) => {
                if (reviewBlocksAction()) return '';
                const res = await api.adjustBonus(view.state.session_id, employeeId, bonusPct);
                setView(res.state);
                return res.message;
              }}
              onSubscribeData={async (key) => {
                if (reviewBlocksAction()) return '';
                const res = await api.subscribeData(view.state.session_id, key);
                setView(res.state);
                return res.message;
              }}
              onSubscribeIntel={async (tier, shadowEnabled) => {
                if (reviewBlocksAction()) return '';
                const res = await api.subscribeIntel(view.state.session_id, tier, shadowEnabled);
                setView(res.state);
                return res.message;
              }}
              onCancelData={async (subscriptionId) => {
                if (reviewBlocksAction()) return '';
                const res = await api.cancelDataSubscription(view.state.session_id, subscriptionId);
                setView(res.state);
                return res.message;
              }}
              onUpgradeAI={async (level) => {
                if (reviewBlocksAction()) return '';
                const res = await api.upgradeAIStack(view.state.session_id, level);
                setView(res.state);
                return res.message;
              }}
              onInjectGp={async (amount) => {
                if (reviewBlocksAction()) return '';
                const res = await api.injectGpCapital(view.state.session_id, amount);
                setView(res.state);
                return res.message;
              }}
              onDistributeGp={async (amount) => {
                if (reviewBlocksAction()) return '';
                const res = await api.distributeToGp(view.state.session_id, amount);
                setView(res.state);
                return res.message;
              }}
            />
          </div>
        </div>
      )}

      {policyDeskOpen && (
        <div className="modal-overlay" onClick={() => setPolicyDeskOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 1100, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPolicyDeskOpen(false)}
              className="btn-close"
            >
              ✕
            </button>
            <PolicyDeskPanel
              politicalState={view.political_state}
              sessionId={view.state.session_id}
              onSpendCapital={handleSpendPoliticalCapital}
            />
          </div>
        </div>
      )}

      {marketPulseOpen && (
        <div className="modal-overlay" onClick={() => setMarketPulseOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 950, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setMarketPulseOpen(false)}
              className="btn-close"
            >
              ✕
            </button>
            <MarketPulsePanel
              retailSentiment={view.retail_sentiment}
              marketPulse={view.market_pulse}
            />
          </div>
        </div>
      )}

      {humanActionOpen && (
        <div className="modal-overlay" onClick={() => closeAppOverlay('HUMAN_ACTION', setHumanActionOpen)}>
          <div className="modal-content" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => closeAppOverlay('HUMAN_ACTION', setHumanActionOpen)}
              className="btn-close"
            >
              ✕
            </button>
            <HumanActionFeedPanel
              events={view.human_action_feed ?? []}
              onResolve={handleResolveHumanAction}
            />
          </div>
        </div>
      )}

      {flowDeskOpen && (
        <div className="modal-overlay" onClick={() => setFlowDeskOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 950, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFlowDeskOpen(false)}
              className="btn-close"
            >
              ✕
            </button>
            <FlowPositioningDeskPanel
              flow={view.flow_summary}
              positioning={view.positioning_summary}
              counterparty={view.counterparty_profile}
            />
          </div>
        </div>
      )}

      {powerLedgerOpen && (
        <div className="modal-overlay" onClick={() => setPowerLedgerOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 760, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setPowerLedgerOpen(false)} className="btn-close">✕</button>
            <Suspense fallback={<div className="panel">加载中…</div>}>
              <PowerLedgerPanel state={view.state} asOfDate={node.date} />
            </Suspense>
          </div>
        </div>
      )}

      {themeStudioOpen && (
        <Suspense fallback={null}>
          <ThemeStudio onClose={closeThemeStudioToMenu} />
        </Suspense>
      )}

      {/* V21 盘中时点：没有关闭按钮，也不能点遮罩关掉——这一屏是必须回答的。
          跳过它就等于直接看当日结果，那是本作明确不提供的能力。 */}
      {(view.state as any).market_reveal &&
        (view.state as any).market_reveal.current_window_index >= 0 &&
        activeUIEvent?.id !== 'intrusive-drama' &&
        activeUIEvent?.id !== 'position-showdown' &&
        !showdownPrefill &&
        !riskClosePrefill && (
          <Suspense fallback={null}>
            <MarketRevealModal
              reveal={(view.state as any).market_reveal}
              busy={advancing}
              onDecide={(wid, action, reason) => void handleMarketWindowDecision(wid, action, reason)}
            />
          </Suspense>
        )}

      {dataTruthOpen && (
        <div className="modal-overlay" onClick={() => setDataTruthOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setDataTruthOpen(false)} className="btn-close">
              ✕
            </button>
            <OptionsDataSourcePanel realOptionsLoaded={view.state.real_options_loaded} />
          </div>
        </div>
      )}

      {lpPanelOpen && (
        <div className="modal-overlay" onClick={() => closeAppOverlay('LP_RELATIONS', setLpPanelOpen)}>
          <div className="modal-content" style={{ maxWidth: 950, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => closeAppOverlay('LP_RELATIONS', setLpPanelOpen)}
              className="btn-close"
            >
              ✕
            </button>
            <LPRelationsPanel lps={view.lp_profiles ?? []} />
          </div>
        </div>
      )}

      {interactiveTutorialOpen && (
        <InteractiveTutorialModal
          onClose={() => setInteractiveTutorialOpen(false)}
        />
      )}

      {termsModalOpen && (
        <TermsModal
          isOpen={termsModalOpen}
          onClose={() => setTermsModalOpen(false)}
        />
      )}

      {outcomeModalOpen && (
        <EpisodeOutcomeModal
          outcome={view.last_episode_outcome ?? null}
          isOpen={activeUIEvent?.id === 'episode-outcome'}
          onClose={() => setOutcomeModalOpen(false)}
          onNextEpisode={handleAdvanceEpisode}
        />
      )}

      {view.season_outcome && (
        <SeasonFinaleModal
          outcome={view.season_outcome ?? null}
          isOpen={activeUIEvent?.id === 'season-finale'}
          onClose={() => {}}
          onRestartNewSeason={() => startGame('r1', accountType, startCash, 'STORY_CAMPAIGN')}
        />
      )}

      {crisisModalOpen && (
        <SurvivalCrisisModal
          view={view}
          isOpen={activeUIEvent?.id === 'critical-compliance'}
          onClose={() => { setCrisisModalOpen(false); setMarginDramaAcknowledged(false); }}
          onSelectSurvival={handleExecuteSurvival}
        />
      )}

      {mobileSheetOpen && (
        <MobileBottomSheet
          quote={liveSelectedQuote}
          isOpen={mobileSheetOpen}
          onClose={() => {
            setMobileSheetOpen(false);
            setRiskClosePrefill(null);
          }}
          onPlaceOrder={(order) => submitOrder(order.side, order)}
          onOpenThesis={(contract, price) => {
            setThesisModalOpen(true);
          }}
          attachedThesis={attachedThesis}
          confirmation={lastTradeConfirmation}
          orderMessage={lastOrderMessage}
          preferredCloseSide={riskClosePrefill?.side ?? null}
        />
      )}

      {mainMenuOpen && !activeUIEvent && (
        <MainMenuModal
          isOpen={mainMenuOpen}
          saves={saveList}
          onStartNewGame={handleStartNewGame}
          tutorialCompleted={view.state.tutorial?.tutorial_completed ?? false}
          onLoadGame={(slot) => void handleLoad(slot)}
          onOpenTutorial={() => openMenuOverlay('TUTORIAL', setTutorialOpen)}
          onOpenSettings={() => openMenuOverlay('SETTINGS', setSettingsOpen)}
          onOpenCredits={() => openMenuOverlay('CREDITS', setCreditsOpen)}
          onOpenFxLab={() => openMenuOverlay('THEME_STUDIO', setThemeStudioOpen)}
          onClose={() => { setMainMenuOpen(false); setNavigation((prev) => navigateTo(prev, HQ_ROUTE)); }}
        />
      )}

      {tutorialOpen && (
        <TutorialModal
          isOpen={tutorialOpen}
          onClose={() => closeAppOverlay('TUTORIAL', setTutorialOpen)}
          onJumpToReplay={() => {
            setGameMode('WALL_STREET_REPLAY');
            setActiveWorkspace('MARKET');
            setShowFundHQ(false);
            setMobileTab('trade');
            void startGame('r1', accountType, startCash, 'WALL_STREET_REPLAY');
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => closeAppOverlay('SETTINGS', setSettingsOpen)}
          audioLevels={audioLevels}
          onUpdateAudio={updateAudio}
          accountRuleText={view.account_rule_text}
        />
      )}

      {creditsOpen && (
        <CreditsModal
          isOpen={creditsOpen}
          onClose={() => closeAppOverlay('CREDITS', setCreditsOpen)}
        />
      )}
      </Suspense>

      <div className="footer">
        期权大亨 Options Tycoon · 教育与模拟工具，不构成投资建议。严格区分 REAL / DERIVED / ESTIMATED / SIMULATED 数据。
      </div>
    </div>
  );
}
