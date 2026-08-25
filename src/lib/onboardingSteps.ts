// ---------------------------------------------------------------------------
// Guided first-day onboarding -- DATA ONLY.
//
// This module contains no React, no DOM access, no api calls and no timers.
// It is the script the coach reads; every panel it points at is the REAL panel
// (real Scanner, real chain, real ThesisModal, real OrderTicket, real engine).
// The overlay never submits an order and never advances the market by itself.
//
// Two hard product constraints are encoded here rather than in prose:
//
//  1. The campaign is DISCRETE DAILY NODES. Nothing in this file may say
//     "hour", "countdown" or imply an intraday clock. Time moves only when the
//     player presses ADVANCE MARKET.
//
//  2. THE STRIKE-VANISHES TRAP. get_chain() rebuilds 11 strikes centred on the
//     CURRENT spot at every node (step 5 for r1/NVDA, 50 for h1/SPX). In r1 the
//     underlying goes 147.22 -> 142.62 -> 118.42 across the first three nodes,
//     so a far-OTM strike picked at node 0 is no longer in the chain by node 2
//     and the player cannot click it to Sell to Close. Hence: step 3 steers to
//     near-ATM (and blocks anything absurdly far), and the guided flow advances
//     exactly ONE node before closing.
// ---------------------------------------------------------------------------
import type { GameStateView, Position } from '../types';

/** The player's own first market view, captured before any Greek is explained. */
export type TutorialDirection = 'BULLISH' | 'BEARISH' | 'UNSURE';

/**
 * How the coach card behaves for a step. The overlay decides layout; the step
 * decides which controls exist. Nothing here submits an order.
 */
export type CoachInteraction =
  | 'NONE'
  | 'DIRECTION_CHOICE'
  | 'THESIS_CATALYST'
  | 'CHAIN_PICK'
  | 'ADVANCE_MARKET'
  | 'CLOSE_FIRST_TRADE'
  | 'HANDOFF';

export type OnboardingPanel =
  | 'CHART'
  | 'THESIS'
  | 'OPTIONS_CHAIN'
  | 'RISK_PREVIEW'
  | 'ORDER_TICKET'
  | 'FUND_VITALS'
  | 'POSITIONS_PNL'
  | 'ORDER_LOG'
  | 'ADVANCED';

export interface CoachOption {
  id: string;
  label: string;
  detail: string;
}

/**
 * What the overlay can observe about the trading UI. Populated from optional
 * props; when the host does not pass them, `known` is false and the overlay
 * falls back to an explicit self-attest checkbox instead of silently letting
 * the player click Next through the chain step.
 */
export interface OnboardingUiState {
  known: boolean;
  hasExpiration: boolean;
  hasContract: boolean;
  /** |strike / spot - 1| * 100, or null when spot/strike are unknown. */
  strikeDistancePct: number | null;
}

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  /** Optional supporting bullets. Kept short on purpose. */
  points?: string[];
  /** data-coach attribute value to spotlight. Never a label string, never a DOM index. */
  anchor?: string;
  /** Gate derived from real game state. */
  requires?: (view: GameStateView | null) => boolean;
  /** Gate derived from the trading UI (chain selection). */
  requiresUi?: (ui: OnboardingUiState) => boolean;
  /** Shown while a gate is unmet, so the player knows what is still missing. */
  pendingHint?: string;
  /**
   * 'click' -- the CTA is always enabled and simply moves on.
   * 'state' -- the CTA stays disabled until requires/requiresUi pass. No timer
   *            is involved: the gate is re-evaluated when props change.
   */
  advanceOn: 'click' | 'state';
  ctaLabel?: string;
  interaction?: CoachInteraction;
  options?: CoachOption[];
  /** Dim footnote: model limits, mechanics, or an honest caveat. */
  note?: string;
  /** Used only when requiresUi cannot be evaluated (host did not pass UI props). */
  selfAttestLabel?: string;
  /** 引导舞台本步允许出现的正式面板；App 后续按此做 fail-closed。 */
  visiblePanels?: readonly OnboardingPanel[];
  /** 本步首次解锁的面板；Overlay 后续据此播放一次 edge trace。 */
  newlyUnlocked?: readonly OnboardingPanel[];
  /** Thesis 步只允许引用已准入的真实剧情事实，不允许教练编造 catalyst。 */
  catalystTemplateId?: string;
}

/** Beyond this distance from spot the coach warns (roughly 2 NVDA strikes). */
export const NEAR_ATM_WARN_PCT = 6;
/** Beyond this the coach blocks: such a strike is likely to be rebuilt out of the chain. */
export const NEAR_ATM_MAX_PCT = 12;

export function strikeDistancePct(
  strike: number | null | undefined,
  spot: number | null | undefined,
): number | null {
  if (typeof strike !== 'number' || !Number.isFinite(strike)) return null;
  if (typeof spot !== 'number' || !Number.isFinite(spot) || spot <= 0) return null;
  return Math.abs(strike / spot - 1) * 100;
}

/**
 * The position this guided run is teaching on. Prefers the id the backend
 * resolved server-side; falls back to the newest position. Returns null rather
 * than inventing one.
 */
export function firstTradePosition(view: GameStateView | null): Position | null {
  const positions = view?.state?.positions ?? [];
  if (positions.length === 0) return null;
  const taughtId = view?.state?.tutorial?.first_trade_position_id ?? '';
  if (taughtId) {
    const found = positions.find((p) => p.id === taughtId);
    if (found) return found;
  }
  return positions[positions.length - 1] ?? null;
}

/** Unrealized P&L of the taught position, or null when it cannot be read. */
export function firstTradeUnrealized(view: GameStateView | null): number | null {
  const pos = firstTradePosition(view);
  if (!pos) return null;
  const mark = (view?.position_marks ?? []).find((m) => m.position_id === pos.id);
  if (mark && typeof mark.pl === 'number' && Number.isFinite(mark.pl)) return mark.pl;
  if (typeof pos.unrealized_pl === 'number' && Number.isFinite(pos.unrealized_pl)) {
    return pos.unrealized_pl;
  }
  return null;
}

/** Current discrete market node index, or null. Never a wall-clock value. */
export function currentNodeIndex(view: GameStateView | null): number | null {
  const clockIdx = view?.market_clock?.current_node_index;
  if (typeof clockIdx === 'number' && Number.isFinite(clockIdx)) return clockIdx;
  const dayIdx = view?.state?.game_day_index;
  if (typeof dayIdx === 'number' && Number.isFinite(dayIdx)) return dayIdx;
  return null;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'MARKET_ENTRY', title: '① 先把画面看清',
    body: 'Maya：别碰按钮。先告诉我你看见什么。这里是已经揭晓的市场，不是让我替你下判断。',
    visiblePanels: ['CHART'], advanceOn: 'click', ctaLabel: '开始观察 ▶',
  },
  {
    id: 'MARKET_VIEW', title: '② 先形成你自己的观察',
    body: 'Maya：涨、跌，还是你根本看不出来？说不准也是判断。',
    visiblePanels: ['CHART'], interaction: 'DIRECTION_CHOICE', advanceOn: 'click', ctaLabel: '记录观察 ▶',
    options: [
      { id: 'BULLISH', label: '偏多观察', detail: '我看到的价格行为更偏向上涨。' },
      { id: 'BEARISH', label: '偏空观察', detail: '我看到的价格行为更偏向下跌。' },
      { id: 'UNSURE', label: '目前说不准', detail: '现在的信息还不足以让我押方向。' },
    ],
    note: '这里只记录观察；不下单、不扣现金、不推进市场。',
  },
  {
    id: 'THESIS', title: '③ 把观察变成可被证明错的观点',
    body: 'Maya：好。价格是现象。这条已经揭晓的简报才可能是原因。先读事实，再写 Thesis；没有事实就别自己编理由。',
    anchor: 'thesis-open', interaction: 'THESIS_CATALYST',
    catalystTemplateId: 'day1_briefing_maya',
    visiblePanels: ['CHART', 'THESIS'], newlyUnlocked: ['THESIS'],
    advanceOn: 'state', pendingHint: '先读 Maya FACT，再保存方向、催化剂和失效条件。',
  },
  {
    id: 'READ_THE_CHAIN', title: '④ 用什么工具表达这个观点',
    body: 'Maya：观点有了。接下来不是赌大还是赌小——是选什么工具表达它。股票是直接持有；Call / Put 是有到期日和行权价的合约。',
    anchor: 'options-chain', interaction: 'CHAIN_PICK',
    visiblePanels: ['CHART', 'THESIS', 'OPTIONS_CHAIN', 'RISK_PREVIEW'],
    newlyUnlocked: ['OPTIONS_CHAIN', 'RISK_PREVIEW'],
    advanceOn: 'state', ctaLabel: '合约选好了 ▶',
    pendingHint: '选到期日，再选一张靠近现价的合约。',
    requiresUi: (ui) => ui.known && ui.hasExpiration && ui.hasContract && (ui.strikeDistancePct === null || ui.strikeDistancePct <= NEAR_ATM_MAX_PCT),
    selfAttestLabel: '我已选好到期日与近 ATM 合约',
    points: ['Bid：别人愿意出多少钱买。Ask：卖家最低愿意多少钱卖。两者之间就是交易摩擦。'],
  },
  {
    id: 'BUY_TO_OPEN', title: '⑤ 把观点变成第一笔仓位',
    body: 'Maya：这张合约就是你的仓位。先看你最多会付出什么，再按下去。',
    anchor: 'buy-to-open',
    visiblePanels: ['CHART', 'THESIS', 'OPTIONS_CHAIN', 'RISK_PREVIEW', 'ORDER_TICKET', 'FUND_VITALS'],
    newlyUnlocked: ['ORDER_TICKET', 'FUND_VITALS'],
    advanceOn: 'state', requires: (v) => (v?.state?.positions?.length ?? 0) > 0,
    pendingHint: '保持 1 张，真实提交一次 BUY TO OPEN。',
  },
  {
    id: 'MARKET_PAUSED', title: '⑥ 让市场回答你',
    body: 'Maya：现在别动别的。市场是暂停的。你按 ADVANCE MARKET，它才会回答你。',
    anchor: 'advance-market', interaction: 'ADVANCE_MARKET',
    visiblePanels: ['CHART', 'THESIS'],
    advanceOn: 'state', ctaLabel: 'ADVANCE MARKET ▶',
    pendingHint: '只推进一个真实市场节点。',
  },
  {
    id: 'POSITION_RESULT', title: '⑦ 看结果，然后亲手结束第一笔交易',
    body: 'Maya：这就是浮盈浮亏。屏幕上的绿字还不是你口袋里的钱。第一天我要求你把完整流程走一遍——现在用 SELL TO CLOSE 把这笔交易关掉。',
    anchor: 'sell-to-close', interaction: 'CLOSE_FIRST_TRADE',
    visiblePanels: ['CHART', 'THESIS', 'ORDER_TICKET', 'POSITIONS_PNL'],
    newlyUnlocked: ['POSITIONS_PNL'],
    advanceOn: 'state',
    requires: (v) => (v?.state?.trade_reviews?.length ?? 0) > 0,
    pendingHint: '先看持仓与未实现 P&L，再真实执行一次 SELL TO CLOSE。',
  },
  {
    id: 'FIRST_REVIEW', title: '⑧ 第一次复盘',
    body: 'Maya：现在回头看。你赚亏是一回事，你当时为什么下注是另一回事。好的交易员复盘后者。',
    interaction: 'HANDOFF',
    visiblePanels: ['THESIS', 'POSITIONS_PNL', 'ORDER_LOG'],
    newlyUnlocked: ['ORDER_LOG'],
    advanceOn: 'click', ctaLabel: '打开第一笔复盘 ▶',
  },
];

export const ONBOARDING_STEP_IDS: string[] = ONBOARDING_STEPS.map((s) => s.id);
