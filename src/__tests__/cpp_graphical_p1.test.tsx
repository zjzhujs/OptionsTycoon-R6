import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CppGaugeCard,
  EnergyGauge,
  HexFactorCard,
  InfoRing,
  NetConstellation,
  PulseWave,
  RiskFan,
  TankGauge,
  TrustBars,
  VizMetricCard,
  normalizeGaugeAmount,
} from '../components/CppGauges';

describe('CPP graphical P1/P2 primitives', () => {
  it('normalizes gauge geometry without replacing the raw financial value', () => {
    expect(normalizeGaugeAmount(12_000, 24_000)).toBe(50);
    expect(normalizeGaugeAmount(48_000, 24_000)).toBe(100);

    render(
      <CppGaugeCard
        label="MANAGEMENT CO. CASH"
        value={50}
        displayValue="$12,000"
        source="CASH RESERVE"
      />,
    );

    const gauge = screen.getByLabelText('MANAGEMENT CO. CASH: $12,000');
    expect(gauge).toHaveAttribute('data-gauge-value', '50');
    expect(gauge).toHaveTextContent('$12,000');
    expect(gauge.querySelector('.g-fill')).toHaveAttribute('stroke-dasharray', '50 100');
  });

  it('marks missing ring input honestly instead of inventing a score', () => {
    render(<InfoRing label="COMPLIANCE RISK" value={null} available={false} />);
    const ring = screen.getByLabelText('COMPLIANCE RISK: DATA_UNAVAILABLE');
    expect(ring).toHaveClass('is-na');
    expect(ring).toHaveTextContent('DATA_UNAVAILABLE');
    expect(ring).toHaveAttribute('data-available', 'false');
  });

  it('uses slugified ids and keeps the raw amount beside the energy score', () => {
    render(<EnergyGauge label="管理公司现金（MANAGEMENT CO. CASH）" value={50} />);
    const gauge = screen.getByLabelText('管理公司现金（MANAGEMENT CO. CASH）: 50%');
    const gradient = gauge.querySelector('linearGradient');
    const filter = gauge.querySelector('filter');
    expect(gauge).toHaveClass('viz-gauge');
    expect(gradient?.id).toMatch(/^g-management-co-cash-[a-zA-Z0-9_-]+$/);
    expect(filter?.id).toMatch(/^glow-management-co-cash-[a-zA-Z0-9_-]+$/);
    expect(gauge.querySelector('.g-spark')).toBeTruthy();
    expect(gauge.querySelector('.g-scan')).toBeTruthy();
  });

  it('renders each semantic network primitive and keeps unavailable state honest', () => {
    const { container } = render(
      <div>
        <VizMetricCard label="INFO NETWORK" value={80}><NetConstellation value={80} /></VizMetricCard>
        <VizMetricCard label="COMPLIANCE RISK" value={40}><RiskFan value={40} /></VizMetricCard>
        <VizMetricCard label="POLITICAL CAPITAL" value={60}><TankGauge value={60} /></VizMetricCard>
        <VizMetricCard label="COUNTERPARTY TRUST" value={70}><TrustBars value={70} /></VizMetricCard>
        <VizMetricCard label="STAFF MORALE" value={50}><PulseWave value={50} /></VizMetricCard>
        <VizMetricCard label="MISSING" value={null}><RiskFan value={null} /></VizMetricCard>
      </div>,
    );
    expect(container.querySelectorAll('.viz-card')).toHaveLength(6);
    expect(container.querySelector('.net-constellation')).toBeTruthy();
    expect(container.querySelector('.risk-fan .fan-fill')).toBeTruthy();
    expect(container.querySelector('.tank-gauge .tank-fill')).toBeTruthy();
    expect(container.querySelector('.trust-bars .bar-on')).toBeTruthy();
    expect(container.querySelector('.pulse-wave .pulse-line')).toBeTruthy();
    const missing = screen.getByLabelText('MISSING: DATA_UNAVAILABLE');
    expect(missing).toHaveClass('is-na');
    expect(missing).toHaveTextContent('DATA_UNAVAILABLE');
    expect(missing.querySelector('.fan-fill')).toBeNull();
  });

  it('renders the five-element hex state with a compact risk line', () => {
    render(
      <HexFactorCard
        label="ELITE"
        score={70}
        status="ACTIVE"
        monthly="$2,200 / MO"
        risk="COMPLIANT / REVIEW"
      />,
    );
    const card = screen.getByLabelText('ELITE: 70');
    expect(card).toHaveAttribute('data-hex-score', '70');
    expect(card.querySelector('.hx-fill')).toHaveAttribute('stroke-dasharray', '70 100');
    expect(card).toHaveTextContent('COMPLIANT / REVIEW');
  });
});
