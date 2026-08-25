import type { CSSProperties } from 'react';
import type { FundStats } from '../types';
import { money } from '../lib/format';

export interface FundStatsPanelProps {
  stats: FundStats;
}

interface MetricRow {
  key: keyof Pick<
    FundStats,
    | 'reputation'
    | 'lp_confidence'
    | 'information_network'
    | 'compliance_risk'
    | 'political_capital'
    | 'counterparty_trust'
    | 'staff_morale'
  >;
  label: string;
}

const METRIC_ROWS: MetricRow[] = [
  { key: 'reputation', label: '声誉' },
  { key: 'lp_confidence', label: 'LP信心' },
  { key: 'information_network', label: '信息网络' },
  { key: 'compliance_risk', label: '合规风险' },
  { key: 'political_capital', label: '政治资本' },
  { key: 'counterparty_trust', label: '对手方信任' },
  { key: 'staff_morale', label: '员工士气' },
];

// Right-column panel: fund balance-sheet KPIs plus the 0-100 soft-stat bars
// that drive story-event gating elsewhere in the game.
export function FundStatsPanel({ stats }: FundStatsPanelProps): JSX.Element {
  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        基金状态 <span className="en-secondary">FUND STATS</span>
      </div>
      <div className="kpirow ot-kpi-grid">
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">AUM</div>
          <div className="v ot-metric-value font-mono">{money(stats.aum)}</div>
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">NAV</div>
          <div className="v ot-metric-value font-mono">{money(stats.nav)}</div>
        </div>
        <div className="kpi ot-metric">
          <div className="k ot-metric-label">现金</div>
          <div className="v ot-metric-value font-mono">{money(stats.cash ?? 50000)}</div>
        </div>
      </div>
      {METRIC_ROWS.map((row) => {
        const value = stats[row.key] ?? 50;
        const barStyle: CSSProperties = { width: `${Math.max(0, Math.min(100, value))}%` };
        // Unlike the other soft stats, a high compliance_risk is bad news —
        // tint the fill so it reads as a warning instead of "line went up".
        if (row.key === 'compliance_risk') {
          if (value > 75) {
            barStyle.background = 'var(--thm-risk)';
          } else if (value > 50) {
            barStyle.background = 'var(--thm-gold)';
          }
        }
        return (
          <div key={row.key} style={{ marginTop: 7 }}>
            <div className="small font-mono ot-stat-row">
              <span className="ot-stat-label">{row.label}</span>
              <span className="ot-stat-val font-mono">{value}</span>
            </div>
            <div className="metricbar">
              <i style={barStyle} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
