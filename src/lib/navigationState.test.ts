import { describe, expect, it } from 'vitest';
import {
  HQ_ROUTE,
  MENU_ROUTE,
  closeOverlay,
  createNavigationState,
  navigateTo,
  openOverlay,
  applyActionNavigation,
} from './navigationState';

describe('navigationState contract', () => {
  it('returns Settings opened from menu back to menu', () => {
    const opened = openOverlay(createNavigationState(MENU_ROUTE), 'SETTINGS', { returnTo: MENU_ROUTE });
    expect(opened.overlays[opened.overlays.length - 1]?.id).toBe('SETTINGS');
    expect(closeOverlay(opened)).toEqual(createNavigationState(MENU_ROUTE));
  });

  it('returns an inspected HQ overlay to HQ', () => {
    const hq = navigateTo(createNavigationState(), HQ_ROUTE);
    const opened = openOverlay(hq, 'LP_RELATIONS');
    expect(closeOverlay(opened).baseRoute.workspace).toBe('HQ');
  });

  it('supports nested overlays as a LIFO return stack', () => {
    const hq = createNavigationState(HQ_ROUTE);
    const first = openOverlay(hq, 'HUMAN_ACTION', { mode: 'DECISION' });
    const second = openOverlay(first, 'SETTINGS');
    const afterSettings = closeOverlay(second);
    expect(afterSettings.overlays[afterSettings.overlays.length - 1]?.id).toBe('HUMAN_ACTION');
    expect(closeOverlay(afterSettings).baseRoute.workspace).toBe('HQ');
  });

  it('classifies NAVIGATE separately from reversible INSPECT/DECISION actions', () => {
    const hq = createNavigationState(HQ_ROUTE);
    const market = applyActionNavigation(hq, { kind: 'NAVIGATE', targetRoute: { workspace: 'MARKET', tab: 'trade' } });
    expect(market.baseRoute.workspace).toBe('MARKET');
    expect(market.overlays).toHaveLength(0);

    const decision = applyActionNavigation(hq, { kind: 'DECISION', overlay: 'WAR_ROOM' });
    expect(decision.baseRoute.workspace).toBe('HQ');
    expect(decision.overlays[decision.overlays.length - 1]?.mode).toBe('DECISION');
  });
});
