import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

import { LiquidEther } from '../components/fx/LiquidEther';
import { Particles } from '../components/fx/Particles';
import { Threads } from '../components/fx/Threads';
import { SpotlightCard } from '../components/fx/SpotlightCard';
import { AnimatedNumber } from '../components/fx/AnimatedNumber';
import { BorderBeam } from '../components/fx/BorderBeam';
import { BorderGlow } from '../components/fx/BorderGlow';
import { ElectricBorder } from '../components/fx/ElectricBorder';
import { GlareHover } from '../components/fx/GlareHover';
import {
  CentralMarketField,
  CENTRAL_MARKET_FIELD_COUNTS,
  buildNaturalVisibilityPairs,
  buildMarketFieldTopology,
  type MarketFieldSample,
} from '../components/fx/CentralMarketField';
import { MarketFieldStage } from '../components/fx/MarketFieldStage';
import { buildChartEventAdmission } from '../components/PriceChartPanel';

describe('Interactive FX Regression Suite', () => {
  it('CentralMarketField ships a dense deterministic WebGL layer with a no-WebGL-safe canvas contract', () => {
    const samples: MarketFieldSample[] = [
      { time: '2026-01-05', open: 100, high: 104, low: 99, close: 103, volume: 1_200_000 },
      { time: '2026-01-06', open: 103, high: 108, low: 102, close: 107, volume: 2_400_000 },
    ];
    const topology = buildMarketFieldTopology(samples);
    const { container } = render(<CentralMarketField topology={topology} />);
    const canvas = container.querySelector('[data-testid="central-market-field"]');

    expect(CENTRAL_MARKET_FIELD_COUNTS.nodes).toBe(228);
    expect(CENTRAL_MARKET_FIELD_COUNTS.edges).toBeGreaterThan(400);
    expect(CENTRAL_MARKET_FIELD_COUNTS.spines).toBe(3);
    expect(canvas).toHaveAttribute('data-renderer', 'webgl-threshold-bloom');
    expect(canvas).toHaveAttribute('data-topology-signature', topology.signature);
    expect(canvas).not.toHaveAttribute('data-webgl-ready');
  });

  it('makes zero-truth projection explicit without inventing a canonical x', () => {
    const empty = buildMarketFieldTopology([]);
    const degraded = buildMarketFieldTopology([
      { time: '2026-01-05', open: 100, high: 104, low: 99, close: 103, volume: 1_200_000, projectedX: 0.18 },
      { time: '2026-01-06', open: 103, high: 108, low: 102, close: 107, volume: 2_400_000 },
    ]);
    const { container } = render(<CentralMarketField topology={empty} />);
    const canvas = container.querySelector('[data-testid="central-market-field"]');

    expect(empty.projectionSource).toBe('static-fallback');
    expect(empty.projectionState).toBe('empty');
    expect(empty.projectedBarCount).toBe(0);
    expect(empty.gateAnchor).toBeNull();
    expect(empty.gateX).toBeNull();
    expect(canvas).toHaveAttribute('data-projection-state', 'empty');
    expect(canvas).toHaveAttribute('data-projection-empty-reason', 'no-admitted-bars');
    expect(canvas).not.toHaveAttribute('data-gate-anchor');
    expect(canvas).not.toHaveAttribute('data-gate-x');

    expect(degraded.projectionSource).toBe('market-time-fallback');
    expect(degraded.projectionState).toBe('degraded');
    expect(degraded.projectedBarCount).toBe(1);
  });

  it('admits events once and never leaks future events through markers or the event strip', () => {
    const pins = [
      { date: '2025-01-23', headline: 'revealed one', tone: 'neutral' as const },
      { date: '2025-01-24', headline: 'revealed two', tone: 'good' as const },
      { date: '2025-01-24', headline: 'same-day detail', tone: 'risk' as const },
      { date: '2025-01-25', headline: 'future leak', tone: 'risk' as const },
      { date: '', headline: 'invalid date', tone: 'neutral' as const },
    ];

    const daily = buildChartEventAdmission(pins, '2025-01-24', '2025-01-30', 'CANDLE');
    expect(daily.source).toBe('current-game-date');
    expect(daily.revealCutoff).toBe('2025-01-24');
    expect(daily.inputCount).toBe(5);
    expect(daily.admittedPins.map((pin) => pin.headline)).toEqual([
      'revealed one', 'revealed two', 'same-day detail',
    ]);
    expect(daily.markerPins.map((pin) => pin.headline)).toEqual(['revealed one', 'revealed two']);
    expect(daily.stripPins.map((pin) => pin.headline)).toEqual([
      'revealed one', 'revealed two', 'same-day detail',
    ]);
    expect(daily.futureCount).toBe(1);
    expect(daily.invalidCount).toBe(1);

    const intraday = buildChartEventAdmission(pins, '2025-01-24', '2025-01-30', 'INTRADAY');
    expect(intraday.markerPins).toEqual([]);
    expect(intraday.stripPins.map((pin) => pin.headline)).not.toContain('future leak');

    const historyFallback = buildChartEventAdmission(pins, undefined, '2025-01-24', 'CANDLE');
    expect(historyFallback.source).toBe('latest-admitted-history');
    expect(historyFallback.revealCutoff).toBe('2025-01-24');
    expect(historyFallback.futureCount).toBe(1);
  });

  it('binds the market field viewport to the real network border box without changing grid ownership', () => {
    const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    });
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getTestRect(this: HTMLElement): DOMRect {
        const testId = this.dataset.testid;
        if (testId === 'market-field-stage') return rect(100, 200, 763, 466);
        if (testId === 'market-stage-network') return rect(100, 564, 763, 112);
        if (testId === 'market-field-viewport') return rect(100, 564, 763, 112);
        return rect(0, 0, 0, 0);
      });
    try {
      const topology = buildMarketFieldTopology([
        { time: '2026-01-05', open: 100, high: 104, low: 99, close: 103, volume: 1_200_000 },
        { time: '2026-01-06', open: 103, high: 108, low: 102, close: 107, volume: 2_400_000 },
      ]);
      const networkRef = React.createRef<HTMLDivElement>();
      render(
        <MarketFieldStage
          topology={topology}
          fallback={<svg data-testid="market-field-fallback" />}
          networkRef={networkRef}
        >
          <div data-testid="market-stage-chart" />
          <div data-testid="market-stage-volume" />
          <div ref={networkRef} data-testid="market-stage-network" data-market-field-region="network" />
        </MarketFieldStage>,
      );

      const stage = screen.getByTestId('market-field-stage');
      const viewport = screen.getByTestId('market-field-viewport');
      const field = screen.getByTestId('central-market-field');
      const fallback = screen.getByTestId('market-field-fallback');
      const network = screen.getByTestId('market-stage-network');

      expect(stage).toHaveAttribute('data-coordinate-space', 'chart-volume-network');
      expect(stage).toHaveStyle({ position: 'relative' });
      expect(field).toHaveAttribute('data-size-source', 'market-field-stage');
      expect(viewport.parentElement).toBe(stage);
      expect(viewport).toHaveAttribute('data-geometry-source', 'chart-network-band-border-box');
      expect(viewport).toHaveAttribute('data-geometry-ready', 'true');
      expect(viewport).toHaveAttribute('data-network-alignment-delta', '0,0,0');
      expect(viewport).toHaveStyle({
        position: 'absolute',
        left: '0px',
        top: '364px',
        width: '763px',
        height: '112px',
      });
      expect(viewport.style.gridArea).toBe('auto');
      expect(field.parentElement).toBe(viewport);
      expect(fallback.parentElement).toBe(viewport);
      expect(screen.getByTestId('market-stage-chart').parentElement).toBe(stage);
      expect(screen.getByTestId('market-stage-volume').parentElement).toBe(stage);
      expect(network.parentElement).toBe(stage);
      expect(network).not.toContainElement(viewport);
      expect(network).not.toContainElement(field);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('derives visibly different deterministic topology from admitted price and volume', () => {
    const rally: MarketFieldSample[] = [
      { time: 't0', open: 100, high: 103, low: 99, close: 102, volume: 1_000_000 },
      { time: 't1', open: 102, high: 107, low: 101, close: 106, volume: 1_300_000 },
      { time: 't2', open: 106, high: 111, low: 105, close: 110, volume: 4_800_000 },
      { time: 't3', open: 110, high: 114, low: 109, close: 113, volume: 2_100_000 },
    ];
    const selloff: MarketFieldSample[] = [
      { time: 't0', open: 100, high: 101, low: 96, close: 97, volume: 4_600_000 },
      { time: 't1', open: 97, high: 98, low: 92, close: 93, volume: 2_100_000 },
      { time: 't2', open: 93, high: 94, low: 87, close: 88, volume: 1_300_000 },
      { time: 't3', open: 88, high: 90, low: 84, close: 85, volume: 900_000 },
    ];

    const rallyField = buildMarketFieldTopology(rally);
    const repeatedRally = buildMarketFieldTopology(rally);
    const selloffField = buildMarketFieldTopology(selloff);
    const shiftedVolumeField = buildMarketFieldTopology(
      rally.map((sample, index) => ({ ...sample, volume: rally[rally.length - 1 - index].volume })),
    );
    const incompleteVolumeField = buildMarketFieldTopology(
      rally.map((sample, index) => ({ ...sample, volume: index === 1 ? null : sample.volume })),
    );
    const unknownVolumeField = buildMarketFieldTopology(
      rally.map((sample) => ({ ...sample, volume: null })),
    );

    expect(repeatedRally).toEqual(rallyField);
    expect(rallyField.signature).not.toBe(selloffField.signature);
    expect(rallyField.spines[1][rallyField.spines[1].length - 1].y).toBeGreaterThan(0.35);
    expect(selloffField.spines[1][selloffField.spines[1].length - 1].y).toBeLessThan(-0.35);
    expect(rallyField.nodes.some((node, index) => (
      Math.abs(node.x - selloffField.nodes[index].x) > 0.04
      || Math.abs(node.y - selloffField.nodes[index].y) > 0.20
    ))).toBe(true);
    expect(rallyField.nodes.map((node) => node.x)).toEqual(
      shiftedVolumeField.nodes.map((node) => node.x),
    );
    expect(incompleteVolumeField.nodes.map((node) => node.x)).toEqual(
      unknownVolumeField.nodes.map((node) => node.x),
    );
    expect(rallyField.nodes.map(({ size, energy, tone }) => ({ size, energy, tone }))).not.toEqual(
      selloffField.nodes.map(({ size, energy, tone }) => ({ size, energy, tone })),
    );
    expect(rallyField.edges.map(({ from, to }) => `${from}:${to}`)).not.toEqual(
      selloffField.edges.map(({ from, to }) => `${from}:${to}`),
    );
  });

  it('anchors the field gate to the final canonical chart projection', () => {
    const projected: MarketFieldSample[] = [
      { time: '2026-01-05T14:30:00Z', open: 100, high: 103, low: 99, close: 102, volume: 1_000_000, projectedX: 0.08 },
      { time: '2026-01-05T15:30:00Z', open: 102, high: 107, low: 101, close: 106, volume: 1_300_000, projectedX: 0.21 },
      { time: '2026-01-05T18:30:00Z', open: 106, high: 111, low: 105, close: 110, volume: 4_800_000, projectedX: 0.74 },
      { time: '2026-01-05T20:30:00Z', open: 110, high: 114, low: 109, close: 113, volume: 2_100_000, projectedX: 0.92 },
    ];
    const topology = buildMarketFieldTopology(projected);
    const gate = topology.nodes[topology.nodes.length - 1];

    expect(topology.projectionSource).toBe('lightweight-charts-timeToCoordinate');
    expect(topology.projectedBarCount).toBe(projected.length);
    expect(topology.gateAnchor).toBe(projected.length - 1);
    expect(topology.gateX).toBeCloseTo(0.84, 8);
    expect(gate.anchor).toBe(projected.length - 1);
    expect(gate.x).toBeCloseTo(topology.gateX as number, 8);
  });

  it('uses price height and real spacing to determine visibility adjacency', () => {
    expect(buildNaturalVisibilityPairs([3, 1, 2], [0, 1, 2])).toEqual([
      [0, 1], [0, 2], [1, 2],
    ]);
    expect(buildNaturalVisibilityPairs([1, 3, 2], [0, 1, 2])).toEqual([
      [0, 1], [1, 2],
    ]);
    expect(buildNaturalVisibilityPairs([1, 2, 4], [0, 1, 2])).toContainEqual([0, 2]);
    expect(buildNaturalVisibilityPairs([1, 2, 4], [0, 1, 10])).not.toContainEqual([0, 2]);
  });

  it('SpotlightCard updates --mouse-x and --mouse-y on mousemove', () => {
    const { container } = render(
      <SpotlightCard spotlightColor="rgba(0, 240, 255, 0.25)">
        <span data-testid="kpi-value">$1,000,000</span>
      </SpotlightCard>
    );

    const card = container.querySelector('.card-spotlight') as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('kpi-value')).toBeInTheDocument();

    // Mock getBoundingClientRect
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      right: 300,
      bottom: 200,
      x: 100,
      y: 100,
      toJSON: () => {}
    });

    // Fire mousemove to center (x: 200, y: 150 -> relative x: 100px, y: 50px)
    fireEvent.mouseMove(card, {
      clientX: 200,
      clientY: 150
    });

    expect(card.style.getPropertyValue('--mouse-x')).toBe('100px');
    expect(card.style.getPropertyValue('--mouse-y')).toBe('50px');
    expect(card.style.getPropertyValue('--spotlight-color')).toBe('rgba(0, 240, 255, 0.25)');
  });

  it('AnimatedNumber renders and updates numeric values with formatting', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <AnimatedNumber value={1000} formatFn={(n) => `$${n.toFixed(0)}`} duration={100} />
    );

    expect(screen.getByText('$1000')).toBeInTheDocument();

    rerender(<AnimatedNumber value={2500} formatFn={(n) => `$${n.toFixed(0)}`} duration={100} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('$2500')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('LiquidEther mounts without crashing under JSDOM', () => {
    const { container } = render(
      <LiquidEther
        colors={['#030712', '#0a192f', '#00f0ff', '#d4af37', '#ffd700']}
        mouseForce={18}
        cursorSize={80}
        autoDemo={true}
      />
    );
    expect(container.querySelector('.liquid-ether-container')).toBeInTheDocument();
  });

  it('Particles mounts safely in test environment', () => {
    const { container } = render(
      <Particles
        particleCount={50}
        particleColors={['#00f0ff', '#ffd700']}
        speed={0.1}
      />
    );
    expect(container.querySelector('.particles-container')).toBeInTheDocument();
  });

  it('Threads mounts without crashing in test environment', () => {
    const { container } = render(
      <Threads
        color={[0.0, 0.85, 0.95]}
        amplitude={1.2}
        distance={0.15}
      />
    );
    expect(container.querySelector('.threads-container')).toBeInTheDocument();
  });

  it('BorderGlow, BorderBeam, ElectricBorder, and GlareHover render child contents', () => {
    render(
      <div>
        <BorderGlow glowColor="142 76 50">
          <div data-testid="glow-child">Glow Content</div>
        </BorderGlow>
        <div style={{ position: 'relative' }}>
          <BorderBeam colorFrom="#00f0ff" colorTo="#ffd700" />
          <div data-testid="beam-child">Beam Content</div>
        </div>
        <ElectricBorder color="#ff3344">
          <div data-testid="electric-child">Electric Content</div>
        </ElectricBorder>
        <GlareHover glareColor="rgba(0, 240, 255, 0.2)">
          <div data-testid="glare-child">Glare Content</div>
        </GlareHover>
      </div>
    );

    expect(screen.getByTestId('glow-child')).toBeInTheDocument();
    expect(screen.getByTestId('beam-child')).toBeInTheDocument();
    expect(screen.getByTestId('electric-child')).toBeInTheDocument();
    expect(screen.getByTestId('glare-child')).toBeInTheDocument();
  });
});
