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
import { CentralMarketField, CENTRAL_MARKET_FIELD_COUNTS } from '../components/fx/CentralMarketField';

describe('Interactive FX Regression Suite', () => {
  it('CentralMarketField ships a dense deterministic WebGL layer with a no-WebGL-safe canvas contract', () => {
    const { container } = render(<CentralMarketField />);
    const canvas = container.querySelector('[data-testid="central-market-field"]');

    expect(CENTRAL_MARKET_FIELD_COUNTS.nodes).toBe(228);
    expect(CENTRAL_MARKET_FIELD_COUNTS.edges).toBeGreaterThan(400);
    expect(CENTRAL_MARKET_FIELD_COUNTS.spines).toBe(3);
    expect(canvas).toHaveAttribute('data-renderer', 'webgl-threshold-bloom');
    expect(canvas).not.toHaveAttribute('data-webgl-ready');
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
