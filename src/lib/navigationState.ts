/**
 * Canonical UI navigation state for OptionsTycoon.
 *
 * Rules:
 * 1) Exactly one baseRoute is active at a time.
 * 2) Overlays never mutate the base route; they remember where they came from.
 * 3) Closing the top overlay returns to its recorded origin. Nested overlays are LIFO.
 * 4) A real route navigation clears transient overlays unless explicitly preserved.
 *
 * This module is deliberately framework-free so App.tsx can own React state while
 * tests can exercise the transition contract as pure functions.
 */

export type NavigationWorkspace = 'MENU' | 'HQ' | 'MARKET' | 'PORTFOLIO' | 'INTEL' | 'REVIEW';
export type NavigationTab = 'trade' | 'portfolio' | 'scanner' | 'intel' | 'settings';

export interface BaseRoute {
  workspace: NavigationWorkspace;
  tab?: NavigationTab;
}

export type OverlayId =
  | 'SETTINGS'
  | 'CREDITS'
  | 'THEME_STUDIO'
  | 'TUTORIAL'
  | 'WAR_ROOM'
  | 'HUMAN_ACTION'
  | 'LP_RELATIONS'
  | 'TERMS'
  | 'POLICY_DESK'
  | 'MARKET_PULSE'
  | 'FLOW_DESK'
  | 'POWER_LEDGER'
  | 'CAPITAL_POWER'
  | 'INTERACTIVE_TUTORIAL'
  | 'DATA_TRUTH'
  | 'CUSTOM';

export type OverlayMode = 'INSPECT' | 'DECISION';

export interface OverlayFrame {
  id: OverlayId;
  mode: OverlayMode;
  /** Route that must be visible again when this overlay stack unwinds. */
  returnTo: BaseRoute;
  /** Optional stable key for a specific event/modal instance. */
  key?: string;
}

export interface NavigationState {
  baseRoute: BaseRoute;
  overlays: OverlayFrame[];
}

export const MENU_ROUTE: BaseRoute = Object.freeze({ workspace: 'MENU' });
export const HQ_ROUTE: BaseRoute = Object.freeze({ workspace: 'HQ' });
export const MARKET_ROUTE: BaseRoute = Object.freeze({ workspace: 'MARKET', tab: 'trade' });

export function createNavigationState(baseRoute: BaseRoute = MENU_ROUTE): NavigationState {
  return { baseRoute: { ...baseRoute }, overlays: [] };
}

export function activeOverlay(state: NavigationState): OverlayFrame | null {
  return state.overlays[state.overlays.length - 1] ?? null;
}

export interface OpenOverlayOptions {
  mode?: OverlayMode;
  /** Override only when an overlay intentionally returns somewhere other than the current base route. */
  returnTo?: BaseRoute;
  key?: string;
}

export function openOverlay(
  state: NavigationState,
  id: OverlayId,
  options: OpenOverlayOptions = {},
): NavigationState {
  const current = activeOverlay(state);
  if (current?.id === id && current.key === options.key) return state;

  const frame: OverlayFrame = {
    id,
    mode: options.mode ?? 'INSPECT',
    returnTo: { ...(options.returnTo ?? state.baseRoute) },
    ...(options.key ? { key: options.key } : {}),
  };
  return { ...state, overlays: [...state.overlays, frame] };
}

/** Close exactly one overlay. If it was the last overlay, restore its return route. */
export function closeOverlay(state: NavigationState): NavigationState {
  if (state.overlays.length === 0) return state;
  const closing = state.overlays[state.overlays.length - 1];
  const remaining = state.overlays.slice(0, -1);
  return {
    baseRoute: remaining.length === 0 ? { ...closing.returnTo } : state.baseRoute,
    overlays: remaining,
  };
}

/** Close a named overlay and everything above it; useful for ESC/explicit modal close. */
export function closeOverlayById(state: NavigationState, id: OverlayId): NavigationState {
  const index = state.overlays.map((frame) => frame.id).lastIndexOf(id);
  if (index < 0) return state;
  const closing = state.overlays[index];
  const remaining = state.overlays.slice(0, index);
  return {
    baseRoute: remaining.length === 0 ? { ...closing.returnTo } : state.baseRoute,
    overlays: remaining,
  };
}

export interface NavigateOptions {
  preserveOverlays?: boolean;
}

export function navigateTo(
  state: NavigationState,
  baseRoute: BaseRoute,
  options: NavigateOptions = {},
): NavigationState {
  return {
    baseRoute: { ...baseRoute },
    overlays: options.preserveOverlays ? state.overlays : [],
  };
}

export function resetNavigation(baseRoute: BaseRoute = MENU_ROUTE): NavigationState {
  return createNavigationState(baseRoute);
}

export function routeEquals(a: BaseRoute, b: BaseRoute): boolean {
  return a.workspace === b.workspace && a.tab === b.tab;
}

export function overlayIsOpen(state: NavigationState, id: OverlayId): boolean {
  return state.overlays.some((frame) => frame.id === id);
}

/** Action cards use this classification so inspection is reversible and decisions are explicit. */
export type ActionNavigationKind = 'NAVIGATE' | 'INSPECT' | 'DECISION';

export interface ActionNavigationContract {
  kind: ActionNavigationKind;
  targetRoute?: BaseRoute;
  overlay?: OverlayId;
  key?: string;
}

export function applyActionNavigation(
  state: NavigationState,
  action: ActionNavigationContract,
): NavigationState {
  if (action.kind === 'NAVIGATE') {
    if (!action.targetRoute) return state;
    return navigateTo(state, action.targetRoute);
  }
  if (!action.overlay) return state;
  return openOverlay(state, action.overlay, {
    mode: action.kind === 'DECISION' ? 'DECISION' : 'INSPECT',
    returnTo: state.baseRoute,
    key: action.key,
  });
}
