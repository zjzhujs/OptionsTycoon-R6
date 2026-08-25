import { BipolarArcGauge } from './fx/MiniViz';
import type { OptionQuote } from '../types';
import { fmt, money } from '../lib/format';

export interface GreeksPanelProps {
  quote: OptionQuote | null;
  ivLabel: string;
}

// Right-column panel: shows the Greeks for whatever contract is currently
// selected in the option chain, plus a teaching IV proxy readout.
export function GreeksPanel({ quote, ivLabel }: GreeksPanelProps): JSX.Element {
  const greeks = quote?.greeks ?? null;
  const iv = quote?.iv;
  const ivPct = iv != null ? `${fmt(iv * 100, 1)}%` : '—';

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        当前合约 Greeks <span className="en-secondary">CONTRACT GREEKS</span>
      </div>
      {greeks && (
        <div className="greeks-bipolar-viz" data-testid="greeks-bipolar-gauge">
          <BipolarArcGauge source="selectedContractGreeks" left={greeks.delta} right={greeks.theta} leftLabel="Δ Delta" rightLabel="Θ Theta" />
        </div>
      )}
      <div className="kpirow ot-kpi-grid">
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">Delta</div>
          <div className="v ot-metric-value font-mono">{greeks ? fmt(greeks.delta, 3) : '—'}</div>
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">Gamma</div>
          <div className="v ot-metric-value font-mono">{greeks ? fmt(greeks.gamma, 4) : '—'}</div>
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">Theta / 天</div>
          <div className="v ot-metric-value font-mono">{greeks ? money(greeks.theta) : '—'}</div>
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">Vega / 1 vol</div>
          <div className="v ot-metric-value font-mono">{greeks ? money(greeks.vega) : '—'}</div>
        </div>
      </div>
      <div className="kpi ot-metric" style={{ marginTop: 8 }}>
        <div className="k ot-metric-label">教学 IV 代理</div>
        <div className="v ot-metric-value font-mono">{ivPct}</div>
        <div className="small ot-dim-text">{ivLabel}</div>
      </div>
    </div>
  );
}
