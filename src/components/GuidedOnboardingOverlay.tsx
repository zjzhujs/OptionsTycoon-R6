// ---------------------------------------------------------------------------
// Guided first-day coach overlay.
//
// THIS OVERLAY ONLY COACHES AND HIGHLIGHTS. It never builds a mock chain, never
// submits an order, never renders its own order controls, and never fabricates a
// position. Every gate it waits on is real game state coming down through props.
//
// Three invariants worth stating out loud, because they are easy to break later:
//
//  * NO TIMERS. There is no setInterval/setTimeout anywhere in this file. Steps
//    unblock when props change, not when seconds pass. The listeners below
//    (resize / scroll / matchMedia / ResizeObserver) only re-measure geometry;
//    none of them touch game state.
//  * THE SCRIM IS pointer-events:none. The real panel underneath must stay
//    clickable -- the player genuinely operates the chain, the ticket and the
//    ADVANCE MARKET button. Only the card itself is interactive.
//  * ANCHORING IS BY [data-coach] ATTRIBUTE ONLY. Never by label text (the copy
//    is being rewritten), never by DOM position. A missing anchor degrades to a
//    corner-parked card with no spotlight -- it must never blank the coach.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameStateView } from '../types';
import { renderWithGlossary } from './GlossaryTerm';
import {
  NEAR_ATM_MAX_PCT,
  NEAR_ATM_WARN_PCT,
  currentNodeIndex,
  firstTradePosition,
  firstTradeUnrealized,
  strikeDistancePct,
  type OnboardingPanel,
  type OnboardingStep,
  type OnboardingUiState,
  type TutorialDirection,
} from '../lib/onboardingSteps';

export interface GuidedOnboardingOverlayProps {
  steps: OnboardingStep[];
  stepIndex: number;
  view: GameStateView | null;
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
  /** Must be the app's own advance handler. Never api.step, never a timer. */
  onAdvanceMarket: () => void;
  onRecordDirection: (direction: TutorialDirection) => void;
  /**
   * Navigates Fund HQ -> Trading Floor. Only ever rendered as a plain nav button
   * next to a step whose anchor isn't mounted yet (e.g. CHAIN_PICK reached while
   * still on Fund HQ) -- this overlay still never selects a contract or submits
   * an order for the player, it only gets them to the screen that has the chain.
   */
  onNavigateToChain?: () => void;
  /**
   * Fund HQ vs Trading Floor. Purely a remeasure trigger: switching screens
   * mounts/unmounts data-coach anchors without touching `view` or `stepIndex`,
   * so the spotlight geometry effect needs this in its dependency array or it
   * keeps pointing at wherever the anchor was (or wasn't) before the switch.
   */
  showFundHQ?: boolean;

  /** App-local Thesis；首单成交前 active_theses 里还没有它。 */
  hasDraftThesis?: boolean;

  /**
   * Node index captured by the PARENT the moment the ADVANCE_MARKET step was
   * entered. Must not be tracked as local state/ref inside this component: this
   * overlay gets remounted by its parent's own re-render churn on every
   * onAdvanceMarket-triggered state update (observed live -- a fresh component
   * instance mounts 1-2 times per click, wiping any local useRef baseline back to
   * null before it can ever see nodeIndex > baseline). A parent-owned value
   * survives that remount, so "one node has moved since this step started" can
   * actually be detected. null when not on (or not yet measured for) that step.
   */
  advanceMarketBaseline?: number | null;

  // ---- Optional. Without these the chain step falls back to a self-attest
  // checkbox instead of silently becoming a Next/Next/Next. See wiring notes.
  selectedContractKey?: string | null;
  selectedStrike?: number | null;
  selectedExpiration?: string | null;
  underlyingPrice?: number | null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MOBILE_QUERY = '(max-width: 1023px)';
const CARD_DESKTOP_WIDTH = 372;
const GAP = 14;
/** Above .mobile-sheet-overlay (1001), below .main-menu-overlay (2000). */
const COACH_Z = 1002;

function isSafeAnchor(anchor: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(anchor);
}

/**
 * First VISIBLE element carrying the anchor. Desktop and the mobile bottom sheet
 * can both render the same data-coach value; taking the first laid-out one keeps
 * the spotlight on whichever is actually on screen.
 */
function measureAnchor(anchor: string | undefined): Box | null {
  if (!anchor || !isSafeAnchor(anchor)) return null;
  if (typeof document === 'undefined') return null;
  let nodes: NodeListOf<HTMLElement>;
  try {
    nodes = document.querySelectorAll<HTMLElement>(`[data-coach="${anchor}"]`);
  } catch {
    return null;
  }
  for (const el of Array.from(nodes)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    }
  }
  return null;
}

const PANEL_LABELS: Record<OnboardingPanel, string> = {
  CHART: 'PRICE CHART',
  THESIS: 'THESIS',
  OPTIONS_CHAIN: 'OPTION CHAIN',
  RISK_PREVIEW: 'RISK PREVIEW',
  ORDER_TICKET: 'ORDER TICKET',
  FUND_VITALS: 'FUND VITALS',
  POSITIONS_PNL: 'POSITIONS / P&L',
  ORDER_LOG: 'ORDER LOG',
  ADVANCED: 'ADVANCED',
};

function findSpotlightNode(
  anchor: string | undefined,
  panels: readonly OnboardingPanel[] | undefined,
): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  if (anchor && isSafeAnchor(anchor)) {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(`[data-coach="${anchor}"]`)
    )) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }

  for (const panel of panels ?? []) {
    const el = document.querySelector<HTMLElement>(
      `[data-onboarding-panel="${panel}"]`
    );
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function GuidedOnboardingOverlay({
  steps,
  stepIndex,
  view,
  onNext,
  onSkip,
  onComplete,
  onAdvanceMarket,
  onRecordDirection,
  onNavigateToChain,
  showFundHQ,
  hasDraftThesis = false,
  advanceMarketBaseline = null,
  selectedContractKey,
  selectedStrike,
  selectedExpiration,
  underlyingPrice,
}: GuidedOnboardingOverlayProps): JSX.Element | null {
  const step = steps && steps.length > 0 ? steps[stepIndex] : undefined;

  // ---- viewport class. The overlay owns its own matchMedia because App reads
  // window.innerWidth once at render and never re-evaluates it.
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (typeof window.matchMedia === 'function') return window.matchMedia(MOBILE_QUERY).matches;
    return window.innerWidth < 1024;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') {
      // jsdom and very old WebViews: fall back to a resize listener (no timer).
      const onResize = (): void => setIsMobile(window.innerWidth < 1024);
      onResize();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Safari < 14
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // ---- anchor geometry
  const [anchorBox, setAnchorBox] = useState<Box | null>(null);
  const anchorRef = useRef<Box | null>(null);
  const anchor = step?.anchor;
  const visiblePanels = step?.visiblePanels ?? [];

  // Observes the current anchor DOM node's own size directly (e.g. a chain
  // table growing/shrinking rows after mount) -- distinct from, and in addition
  // to, the documentElement-level ResizeObserver below and the rAF settle pass
  // in the effect further down (which covers the anchor's *position* moving
  // because something else above it grew, not the anchor's own size).
  const anchorObserverRef = useRef<ResizeObserver | null>(null);
  const observedAnchorNodeRef = useRef<Element | null>(null);

  const remeasure = useCallback(() => {
    const node = findSpotlightNode(anchor, visiblePanels);
    const r = node?.getBoundingClientRect();
    const next = r && r.width > 0 && r.height > 0
      ? { top: r.top, left: r.left, width: r.width, height: r.height }
      : null;

    if (!sameBox(anchorRef.current, next)) {
      anchorRef.current = next;
      setAnchorBox(next);
    }

    if (typeof ResizeObserver !== 'undefined') {
      if (node !== observedAnchorNodeRef.current) {
        if (anchorObserverRef.current && observedAnchorNodeRef.current)
          anchorObserverRef.current.unobserve(observedAnchorNodeRef.current);
        observedAnchorNodeRef.current = node;
        if (node) {
          anchorObserverRef.current ??=
            new ResizeObserver(() => remeasureRef.current());
          anchorObserverRef.current.observe(node);
        }
      }
    }
  }, [anchor, visiblePanels]);

  const remeasureRef = useRef(remeasure);
  remeasureRef.current = remeasure;

  const applyStageVisibility = useCallback(() => {
    if (typeof document === 'undefined') return;
    const allowed = new Set<OnboardingPanel>(visiblePanels);
    document.documentElement.dataset.guidedStage = 'active';

    document
      .querySelectorAll<HTMLElement>('[data-onboarding-panel]')
      .forEach((el) => {
        const id = el.dataset.onboardingPanel as OnboardingPanel | undefined;
        el.dataset.onboardingVisible = id && allowed.has(id) ? 'true' : 'false';
      });
  }, [visiblePanels]);

  const applyStageVisibilityRef = useRef(applyStageVisibility);
  applyStageVisibilityRef.current = applyStageVisibility;

  useLayoutEffect(() => {
    applyStageVisibility();
    remeasure();
  }, [applyStageVisibility, remeasure, stepIndex]);

  useEffect(() => () => {
    if (typeof document === 'undefined') return;
    delete document.documentElement.dataset.guidedStage;
    document.querySelectorAll<HTMLElement>('[data-onboarding-visible]')
      .forEach((el) => delete el.dataset.onboardingVisible);
  }, []);

  useEffect(() => {
    return () => {
      anchorObserverRef.current?.disconnect();
      anchorObserverRef.current = null;
      observedAnchorNodeRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    remeasure();
  }, [remeasure, stepIndex, view, isMobile, showFundHQ]);

  useEffect(() => {
    // A step/screen transition can land on a target whose true position isn't
    // settled yet -- confirmed live: after Fund HQ -> Trading Floor the chain
    // anchor kept sliding ~440px lower for a beat as panels above it (chart,
    // GEX) finished their own mount/measure pass. Neither resize/scroll, the
    // documentElement ResizeObserver, nor the anchor's own ResizeObserver catch
    // that: the anchor's own size never changes, only its position from
    // siblings above it growing, and a plain requestAnimationFrame settle loop
    // is unreliable here since it's gated on the tab actually compositing
    // frames. A MutationObserver reacts to the DOM changing directly (new
    // chart/table nodes being inserted) regardless of paint/compositing state,
    // so it's the one thing that reliably re-measures once that settling
    // actually happens.
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => {
      applyStageVisibilityRef.current();
      remeasureRef.current();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [stepIndex, showFundHQ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = (): void => remeasure();
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined') {
      ro = new ResizeObserver(onChange);
      if (document.documentElement) ro.observe(document.documentElement);
    }
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
      if (ro) ro.disconnect();
    };
  }, [remeasure]);

  // ---- per-step local UI state (never game state)
  const [direction, setDirection] = useState<TutorialDirection | null>(null);
  const [attested, setAttested] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // Entering a step resets its own local controls. Node-advance baseline is
    // NOT reset here -- it is owned entirely by the parent (advanceMarketBaseline
    // prop) because this component can get remounted mid-step by parent re-render
    // churn, and a local useRef/useState baseline would be wiped by that remount
    // before "one node moved" could ever be observed. See prop doc comment.
    setAttested(false);
    setCollapsed(false);
  }, [stepIndex]);

  const ui: OnboardingUiState = useMemo(() => {
    const known = selectedContractKey !== undefined;
    return {
      known,
      hasExpiration: Boolean(selectedExpiration),
      hasContract: Boolean(selectedContractKey),
      strikeDistancePct: strikeDistancePct(selectedStrike ?? null, underlyingPrice ?? null),
    };
  }, [selectedContractKey, selectedExpiration, selectedStrike, underlyingPrice]);

  const nodeIndex = currentNodeIndex(view);
  const hasAdvanced =
    advanceMarketBaseline !== null && nodeIndex !== null && nodeIndex > advanceMarketBaseline;

  const unrealized = firstTradeUnrealized(view);
  const firstPosition = firstTradePosition(view);

  const catalystFact = useMemo(() => {
    const templateId = step?.catalystTemplateId;
    if (!templateId) return null;

    type Fact = {
      template_id?: string;
      headline?: string;
      body?: string;
    };

    const pending = (view?.pending_story_public ?? []) as Fact[];
    const history = (view?.state?.story_history ?? []) as Fact[];

    return [...pending, ...history].find(
      (event) => event.template_id === templateId,
    ) ?? null;
  }, [
    step?.catalystTemplateId,
    view?.pending_story_public,
    view?.state?.story_history,
  ]);

  const thesisSaved =
    hasDraftThesis ||
    Object.keys(view?.state?.active_theses ?? {}).length > 0;

  if (!step) return null;
  const glossarySeen = new Set<string>();

  const interaction = step.interaction ?? 'NONE';
  const total = steps.length;

  // ---- gating ------------------------------------------------------------
  const stateOk = step.requires ? Boolean(step.requires(view)) : true;
  let uiOk = true;
  if (step.requiresUi) {
    uiOk = ui.known ? Boolean(step.requiresUi(ui)) : attested;
  }
  let interactionOk = true;
  if (interaction === 'DIRECTION_CHOICE') interactionOk = direction !== null;
  if (interaction === 'THESIS_CATALYST') {
    interactionOk = catalystFact !== null && thesisSaved;
  }
  if (interaction === 'ADVANCE_MARKET') interactionOk = hasAdvanced;
  if (interaction === 'CLOSE_FIRST_TRADE') interactionOk = stateOk;

  const gatesPass = stateOk && uiOk && interactionOk;
  const ctaEnabled = gatesPass;

  const farStrike =
    ui.known && ui.strikeDistancePct !== null && ui.strikeDistancePct > NEAR_ATM_WARN_PCT;
  const blockedStrike =
    ui.known && ui.strikeDistancePct !== null && ui.strikeDistancePct > NEAR_ATM_MAX_PCT;

  // ---- CTA behaviour -----------------------------------------------------
  const advanceStepPending = interaction === 'ADVANCE_MARKET' && !hasAdvanced;
  const ctaLabel = advanceStepPending
    ? step.ctaLabel ?? 'ADVANCE MARKET ▶'
    : interaction === 'ADVANCE_MARKET'
      ? '继续 ▶'
      : step.ctaLabel ?? '继续 ▶';

  const handleCta = (): void => {
    if (advanceStepPending) {
      onAdvanceMarket();
      return;
    }
    if (interaction === 'HANDOFF') {
      onComplete();
      return;
    }
    onNext();
  };

  // ---- layout ------------------------------------------------------------
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const cardStyle: CSSProperties = { position: 'fixed', pointerEvents: 'auto' };
  if (isMobile) {
    const topKeepout = 10;
    const bottomKeepout = 84;

    cardStyle.left = 12;
    cardStyle.right = 12;
    cardStyle.width = 'auto';

    if (anchorBox) {
      const anchorTop = Math.max(0, anchorBox.top - GAP);
      const anchorBottom = Math.min(vh, anchorBox.top + anchorBox.height + GAP);
      const aboveRoom = Math.max(0, anchorTop - topKeepout);
      const belowRoom = Math.max(0, vh - bottomKeepout - anchorBottom);
      const dockTop = aboveRoom >= belowRoom;
      const availableRoom = dockTop ? aboveRoom : belowRoom;

      cardStyle.maxHeight = collapsed
        ? undefined
        : Math.max(0, Math.min(availableRoom, vh * 0.44));

      if (dockTop) {
        cardStyle.top = topKeepout;
      } else {
        cardStyle.bottom = bottomKeepout;
      }
    } else {
      cardStyle.maxHeight = collapsed ? undefined : '44vh';
      cardStyle.bottom = 'calc(84px + var(--safe-bottom, 0px))';
    }
  } else {
    const width = CARD_DESKTOP_WIDTH;
    cardStyle.width = width;
    cardStyle.maxHeight = collapsed ? undefined : '72vh';
    if (anchorBox) {
      const rightRoom = vw - (anchorBox.left + anchorBox.width) - GAP;
      const leftRoom = anchorBox.left - GAP;
      if (rightRoom >= width) {
        cardStyle.left = anchorBox.left + anchorBox.width + GAP;
      } else if (leftRoom >= width) {
        cardStyle.left = Math.max(12, anchorBox.left - width - GAP);
      } else {
        cardStyle.left = Math.max(12, vw - width - 24);
      }
      cardStyle.top = Math.max(12, Math.min(anchorBox.top, vh - 260));
      // 卡片若在水平方向盖住锚点（两侧都放不下的兜底分支），垂直方向必须让开：
      // 否则卡片会盖住它自己高亮的按钮（实机复现：thesis-open 被盖住导致引导死锁）。
      const cardLeft = typeof cardStyle.left === 'number' ? cardStyle.left : 0;
      const horizontalOverlap = cardLeft < anchorBox.left + anchorBox.width && cardLeft + width > anchorBox.left;
      if (horizontalOverlap) {
        const below = anchorBox.top + anchorBox.height + GAP;
        cardStyle.top = below + 260 <= vh ? below : Math.max(12, anchorBox.top - GAP - 260);
      }
    } else {
      cardStyle.right = 24;
      cardStyle.bottom = 24;
    }
  }

  const spotlight: CSSProperties | null = anchorBox
    ? {
        position: 'fixed',
        top: Math.max(0, anchorBox.top - 6),
        left: Math.max(0, anchorBox.left - 6),
        width: anchorBox.width + 12,
        height: anchorBox.height + 12,
        pointerEvents: 'none',
      }
    : null;

  return (
    <div
      data-testid="guided-onboarding"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: COACH_Z,
        // The whole layer is inert; only the card re-enables pointer events, so
        // the real chain / ticket / ADVANCE MARKET stay operable underneath.
        pointerEvents: 'none',
      }}
    >
      <style>{`
html[data-guided-stage="active"]
[data-onboarding-panel][data-onboarding-visible="false"]{
  display:none!important;
}

.coach-spotlight{
  z-index:1;
  border:1px solid color-mix(in srgb,var(--thm-accent) 78%,white)!important;
  border-radius:8px!important;
  background:transparent!important;
  box-shadow:
    0 0 0 9999px rgba(1,5,12,.86),
    0 0 12px rgba(var(--thm-glow-color),.72),
    0 0 32px rgba(var(--thm-glow-color),.28)!important;
}

.coach-hit-block{position:fixed!important;pointer-events:auto!important;z-index:2!important}
.coach-card{z-index:4!important}

.coach-unlock-trace{
  z-index:3!important;
  border:2px solid var(--thm-accent)!important;
  border-radius:8px!important;
  pointer-events:none!important;
  animation:coachDeskOnline 760ms ease-out forwards;
}
.coach-unlock-label{
  position:absolute!important;left:8px!important;top:-22px!important;
  padding:3px 7px!important;font-size:9px!important;font-weight:800!important;
  letter-spacing:.12em!important;white-space:nowrap!important;
  color:var(--thm-accent)!important;background:#030914!important;
}
@keyframes coachDeskOnline{
  0%{opacity:0;filter:brightness(2);box-shadow:0 0 26px rgba(var(--thm-glow-color),.72)}
  100%{opacity:0;box-shadow:0 0 8px rgba(var(--thm-glow-color),.15)}
}
@media(prefers-reduced-motion:reduce){
 .coach-unlock-trace{animation:none!important;opacity:.72!important}
}
`}</style>
      {spotlight && <div data-testid="coach-spotlight" className="coach-spotlight" style={spotlight} />}
      {anchorBox && (() => {
        const x = Math.max(0, anchorBox.left - 6);
        const y = Math.max(0, anchorBox.top - 6);
        const w = anchorBox.width + 12;
        const h = anchorBox.height + 12;
        return <>
          <div className="coach-hit-block" style={{ left: 0, top: 0, right: 0, height: y }} />
          <div className="coach-hit-block" style={{ left: 0, top: y, width: x, height: h }} />
          <div className="coach-hit-block" style={{ left: x + w, top: y, right: 0, height: h }} />
          <div className="coach-hit-block" style={{ left: 0, top: y + h, right: 0, bottom: 0 }} />
        </>;
      })()}
      {spotlight && (step.newlyUnlocked?.length ?? 0) > 0 && (
        <div
          key={`unlock-${step.id}`}
          className="coach-unlock-trace"
          style={spotlight}
        >
          <span className="coach-unlock-label">
            NEW DESK ONLINE · {step.newlyUnlocked!.map((p) => PANEL_LABELS[p]).join(' + ')}
          </span>
        </div>
      )}


      <div
        data-testid="coach-card"
        // 设了内联 left 的分支必须挂 -anchored 释放基类的 translateX(-50%) dock，
        // 否则卡片被平移半个卡宽、正好盖住自己高亮的锚点按钮（实机复现：
        // thesis-open / buy-to-open 全被自家引导卡盖死）。
        className={`coach-card${cardStyle.left !== undefined ? ' coach-card-anchored' : ''}`}
        data-interaction={interaction}
        style={cardStyle}
      >
        {/* header ------------------------------------------------------- */}
        <div className="coach-header">
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div className="coach-step-kicker">
              GUIDED FIRST DAY · 引导 {Math.min(stepIndex + 1, total)}/{total}
            </div>
            <div className="coach-title guide-current-task">{renderWithGlossary(step.title, glossarySeen)}</div>
            <div className="coach-step-bar" aria-hidden="true">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`coach-step-seg ${i < stepIndex ? 'is-done' : i === stepIndex ? 'is-active' : 'is-upcoming'}`}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="btn-menu-small"
              style={{ minHeight: 36, minWidth: 36, padding: 0 }}
              aria-label={collapsed ? '展开引导' : '收起引导'}
            >
              {collapsed ? '▲' : '▼'}
            </button>
            <button
              type="button"
              data-testid="coach-skip"
              onClick={onSkip}
              className="btn-menu-small"
              style={{ minHeight: 36 }}
            >
              跳过 SKIP
            </button>
          </div>
        </div>

        {/* body --------------------------------------------------------- */}
        {!collapsed && (
          <div className="coach-body">
            <p style={{ margin: 0 }} className="guide-maya-line">{renderWithGlossary(step.body, glossarySeen)}</p>

            {(step.points?.length ?? 0) > 0 && (
              <ul className="coach-points-list">
                {step.points!.map((p, i) => (
                  <li key={i}>
                    {renderWithGlossary(p, glossarySeen)}
                  </li>
                ))}
              </ul>
            )}

            {step.id === 'MARKET_ENTRY' && (
              <div className="coach-status-box">
                <strong>MARKET FACT · 已揭晓市场</strong>
                <div style={{ marginTop: 5 }}>
                  节点 {nodeIndex === null ? 'DATA_UNAVAILABLE' : nodeIndex + 1}
                  {view?.market_clock?.current_node_date
                    ? ` · ${view.market_clock.current_node_date}`
                    : ''}
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--thm-dim)' }}>
                  这里先看已经发生的价格事实；没有要求你下单。
                </div>
              </div>
            )}

            {interaction === 'THESIS_CATALYST' && (
              <div className="coach-status-box">
                <strong>FACT · 已揭晓剧情事实</strong>
                {catalystFact ? (
                  <>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>
                      {renderWithGlossary(catalystFact.headline ?? '已揭晓简报', glossarySeen)}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {renderWithGlossary(catalystFact.body ?? '', glossarySeen)}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 6 }}>DATA_UNAVAILABLE · 对应剧情事实尚未进入当前状态。</div>
                )}
                <div style={{ marginTop: 7, color: thesisSaved ? 'var(--thm-good)' : 'var(--thm-gold)' }}>
                  {thesisSaved ? '✓ Thesis 已保存' : '下一步：点击高亮的 Thesis 按钮，把这条事实写进可检验观点。'}
                </div>
              </div>
            )}

            {/* --- step 1: the player's own market view ----------------- */}
            {interaction === 'DIRECTION_CHOICE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {(step.options ?? []).map((opt) => {
                  const active = direction === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`coach-direction-${opt.id}`}
                      className={`coach-option-btn ${active ? 'is-active' : ''}`}
                      onClick={() => {
                        const value = opt.id as TutorialDirection;
                        setDirection(value);
                        onRecordDirection(value);
                      }}
                    >
                      <div>{opt.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>
                        {opt.detail}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* --- step 3: real chain selection, per-field status -------- */}
            {interaction === 'CHAIN_PICK' && !anchorBox && onNavigateToChain && (
              <div
                className="coach-status-box"
                style={{
                  border: '1px solid var(--thm-accent)',
                  background: 'color-mix(in srgb, var(--thm-accent) 8%, var(--thm-panel))',
                }}
              >
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  期权链在交易大厅，这里是基金总部——先切过去。
                </div>
                <button
                  type="button"
                  data-testid="coach-navigate-to-chain"
                  className="ot-btn ot-btn-primary"
                  style={{ width: '100%', minHeight: 40 }}
                  onClick={onNavigateToChain}
                >
                  前往交易大厅 ▶
                </button>
              </div>
            )}
            {interaction === 'CHAIN_PICK' && (
              <div className="coach-status-box">
                {ui.known ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ color: 'var(--thm-muted)' }}>到期日 Expiry</span>
                      <span style={{ color: ui.hasExpiration ? 'var(--thm-good)' : 'var(--thm-muted)' }}>
                        {ui.hasExpiration ? `✓ ${selectedExpiration ?? ''}` : '未选择'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ color: 'var(--thm-muted)' }}>行权价 Strike</span>
                      <span style={{ color: ui.hasContract ? 'var(--thm-good)' : 'var(--thm-muted)' }}>
                        {ui.hasContract
                          ? `✓ ${typeof selectedStrike === 'number' ? selectedStrike : '已选'}`
                          : '未选择'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                      <span style={{ color: 'var(--thm-muted)' }}>距现价 Distance</span>
                      <span
                        style={{
                          color: blockedStrike
                            ? 'var(--thm-risk)'
                            : farStrike
                              ? 'var(--thm-gold)'
                              : 'var(--thm-good)',
                        }}
                      >
                        {ui.strikeDistancePct === null
                          ? 'DATA_UNAVAILABLE'
                          : `${ui.strikeDistancePct.toFixed(1)}%`}
                      </span>
                    </div>
                    {ui.strikeDistancePct === null && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--thm-dim)' }}>
                        当前拿不到现价或行权价，无法计算距离，这一项按 DATA_UNAVAILABLE 处理。
                      </div>
                    )}
                    {blockedStrike && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--thm-risk)' }}>
                        这个行权价距离现价超过 {NEAR_ATM_MAX_PCT}%。本次引导请换一个更靠近现价的行权价：
                        期权链每个节点都会围绕当时现价重建，这么远的行权价很可能在后续节点消失，届时你在链上点不到它平仓。
                      </div>
                    )}
                    {!blockedStrike && farStrike && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--thm-gold)' }}>
                        略偏离现价（&gt;{NEAR_ATM_WARN_PCT}%）。可以继续，但越靠近现价，后续节点越不容易被重建出链。
                      </div>
                    )}
                  </>
                ) : (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      cursor: 'pointer',
                      color: 'var(--thm-text)',
                      fontSize: 12,
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      data-testid="coach-chain-attest"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                      style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--thm-accent)' }}
                    />
                    <span>{step.selfAttestLabel ?? '我已在期权链里选好到期日与行权价'}</span>
                  </label>
                )}
              </div>
            )}

            {/* --- step 6: node counter, never a countdown -------------- */}
            {interaction === 'ADVANCE_MARKET' && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--thm-muted)' }}>
                当前节点 NODE{' '}
                <span style={{ color: 'var(--thm-text)', fontWeight: 800 }}>
                  {nodeIndex === null ? 'DATA_UNAVAILABLE' : nodeIndex + 1}
                </span>
                {typeof view?.market_clock?.total_nodes === 'number' &&
                  ` / ${view.market_clock.total_nodes}`}
                {view?.market_clock?.current_node_date ? ` · ${view.market_clock.current_node_date}` : ''}
                {hasAdvanced && (
                  <span style={{ color: 'var(--thm-good)', fontWeight: 800 }}>　✓ 已推进 1 个节点</span>
                )}
              </div>
            )}

            {interaction === 'CLOSE_FIRST_TRADE' && (
              <div style={{ marginTop: 10 }}>
                <div className="coach-status-box">
                  <div>
                    未实现 P&amp;L：
                    <strong>
                      {unrealized === null ? ' DATA_UNAVAILABLE' : ` ${money(unrealized)}`}
                    </strong>
                  </div>
                  <div style={{ marginTop: 5 }}>
                    {firstPosition
                      ? `${firstPosition.type.toUpperCase()} ${firstPosition.strike} · ${firstPosition.expiration}`
                      : stateOk
                        ? '✓ 首笔持仓已结束'
                        : 'DATA_UNAVAILABLE · 找不到首笔持仓'}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: stateOk ? 'var(--thm-good)' : 'var(--thm-dim)' }}>
                    {stateOk
                      ? '✓ SELL TO CLOSE 已成交，浮动盈亏已经变成已实现结果。'
                      : '先读这笔浮动盈亏，再点击真实订单台的 SELL TO CLOSE。'}
                  </div>
                </div>
              </div>
            )}

            {step.note && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  lineHeight: 1.55,
                  color: 'var(--thm-dim)',
                  borderLeft: '2px solid var(--thm-line)',
                  paddingLeft: 8,
                }}
              >
                {renderWithGlossary(step.note, glossarySeen)}
              </div>
            )}

            {!ctaEnabled && step.pendingHint && (
              <div
                data-testid="coach-pending"
                className="guide-pending-action"
                style={{ marginTop: 10 }}
              >
                {renderWithGlossary(step.pendingHint, glossarySeen)}
              </div>
            )}
          </div>
        )}

        {/* footer ------------------------------------------------------- */}
        <div className="coach-footer">
          <button
            type="button"
            data-testid="coach-cta"
            onClick={handleCta}
            disabled={!ctaEnabled && !advanceStepPending}
            className="coach-cta-btn guide-primary-cta"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
