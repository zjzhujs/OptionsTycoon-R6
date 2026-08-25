import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { GuidedOnboardingOverlay, type GuidedOnboardingOverlayProps } from '../components/GuidedOnboardingOverlay';
import { ONBOARDING_STEPS } from '../lib/onboardingSteps';
import type { GameStateView } from '../types';

const noop = vi.fn();

function mount(stepIndex = 0, extra: Partial<GuidedOnboardingOverlayProps> = {}) {
  return render(
    <GuidedOnboardingOverlay
      steps={ONBOARDING_STEPS}
      stepIndex={stepIndex}
      view={null}
      onNext={noop}
      onSkip={noop}
      onComplete={noop}
      onAdvanceMarket={noop}
      onRecordDirection={noop}
      {...extra}
    />
  );
}

function viewAtNode(nodeIndex: number): GameStateView {
  return { market_clock: { current_node_index: nodeIndex } } as unknown as GameStateView;
}

const ADVANCE_MARKET_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.interaction === 'ADVANCE_MARKET');
const CHAIN_PICK_STEP_INDEX = ONBOARDING_STEPS.findIndex((s) => s.interaction === 'CHAIN_PICK');

describe('GuidedOnboardingOverlay', () => {
  it('has steps to run', () => {
    expect(ONBOARDING_STEPS.length).toBeGreaterThan(0);
  });

  it('renders the first coach step', () => {
    const { container } = mount(0);
    expect(container.innerHTML.length).toBeGreaterThan(0);
    expect(screen.getByText(/先把画面看清/)).toBeTruthy();
  });

  it('always offers a skip', () => {
    mount(0);
    expect(screen.getByText(/跳过|SKIP/i)).toBeTruthy();
  });

  it('renders no order-submitting control (it coaches the real panels)', () => {
    const { container } = mount(0);
    const text = container.textContent || '';
    expect(text).not.toMatch(/Buy to Open|Sell to Close/i);
  });

  it('uses no intraday or countdown language', () => {
    const { container } = mount(0);
    const text = container.textContent || '';
    expect(text).not.toMatch(/\+1\s*(Hour|小时)/i);
    expect(text).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

// Regression coverage for the 2026-08-15 PLAYTEST FIX pass. Part A found: Step 6's ADVANCE
// MARKET CTA stayed stuck on "one more step" after a real advance because the overlay's own
// baseline was local useRef state that a parent-render remount wiped back to null; Step 3's
// CHAIN_PICK had no way for the player to discover the chain lives on Trading Floor while they
// were still parked at Fund HQ. Both fixes are exercised at the real predicate the component
// evaluates (hasAdvanced / anchorBox), not just "the text changed".
describe('GuidedOnboardingOverlay -- Step 6 ADVANCE MARKET idempotency baseline', () => {
  it('keeps the ADVANCE MARKET CTA pending while node index has not moved past the baseline', () => {
    mount(ADVANCE_MARKET_STEP_INDEX, { view: viewAtNode(3), advanceMarketBaseline: 3 });
    expect(screen.getByTestId('coach-cta').textContent).toMatch(/ADVANCE MARKET ▶/);
    expect(screen.getByTestId('coach-pending')).toBeTruthy();
  });

  it('recognizes completion once node index moves exactly one past the baseline', () => {
    mount(ADVANCE_MARKET_STEP_INDEX, { view: viewAtNode(4), advanceMarketBaseline: 3 });
    // interactionOk flips true -> ctaLabel switches away from the pending "ADVANCE MARKET ▶"
    // label to the generic continue label. This is the real regression check: before the fix
    // this stayed on the pending label forever after one real advance.
    expect(screen.getByTestId('coach-cta').textContent).not.toMatch(/ADVANCE MARKET ▶/);
    expect(screen.getByTestId('coach-cta').textContent).toMatch(/继续 ▶/);
  });

  it('does not regress to "pending" on a re-render with the same baseline+nodeIndex props (simulates a parent remount)', () => {
    const props: Partial<GuidedOnboardingOverlayProps> = { view: viewAtNode(4), advanceMarketBaseline: 3 };
    const { rerender } = mount(ADVANCE_MARKET_STEP_INDEX, props);
    expect(screen.getByTestId('coach-cta').textContent).not.toMatch(/ADVANCE MARKET ▶/);
    // A fresh render pass with identical props is exactly what a parent-driven remount looks
    // like from this component's perspective. Because the baseline is a prop (not local
    // useRef/useState), it cannot be wiped by that remount -- this is the actual fix.
    rerender(
      <GuidedOnboardingOverlay
        steps={ONBOARDING_STEPS}
        stepIndex={ADVANCE_MARKET_STEP_INDEX}
        view={viewAtNode(4)}
        onNext={noop}
        onSkip={noop}
        onComplete={noop}
        onAdvanceMarket={noop}
        onRecordDirection={noop}
        advanceMarketBaseline={3}
      />
    );
    expect(screen.getByTestId('coach-cta').textContent).not.toMatch(/ADVANCE MARKET ▶/);
  });
});

describe('GuidedOnboardingOverlay -- Step 3 chain-not-visible navigation prompt', () => {
  it('offers a navigate-to-chain button when the chain anchor is not mounted and a handler is given', () => {
    const onNavigateToChain = vi.fn();
    mount(CHAIN_PICK_STEP_INDEX, { onNavigateToChain });
    const btn = screen.getByTestId('coach-navigate-to-chain');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onNavigateToChain).toHaveBeenCalledTimes(1);
  });

  it('does not render a navigate button when no handler is supplied (never silently no-ops on click)', () => {
    mount(CHAIN_PICK_STEP_INDEX);
    expect(screen.queryByTestId('coach-navigate-to-chain')).toBeNull();
  });
});
