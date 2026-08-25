import { money } from '../lib/format';
import { formatProvenance } from '../lib/financialLanguage';

export interface MobileFundPulseProps {
  nav: number | null;
  dayPnl: number | null;
  positionPnl: number | null;
  riskLabel: string;
  riskClass: 'good' | 'warn' | 'bad';
  onSelect?: (metric: 'NAV' | 'DAY_PNL' | 'POSITION_PNL' | 'RISK') => void;
}

function value(value: number | null): string {
  return value != null && Number.isFinite(value) ? money(value) : formatProvenance('DATA_UNAVAILABLE');
}

export function MobileFundPulse({ nav, dayPnl, positionPnl, riskLabel, riskClass, onSelect }: MobileFundPulseProps): JSX.Element {
  return (
    <section className="mobile-fund-pulse" data-testid="mobile-fund-pulse" data-visual-key="mobile-fund-pulse" aria-label="Fund pulse">
      <button type="button" className="mobile-fund-pulse-item mobile-fund-pulse-nav" onClick={() => onSelect?.('NAV')}>
        <span className="mobile-fund-pulse-label">净资产 <em>NAV</em></span>
        <strong>{value(nav)}</strong>
      </button>
      <button type="button" className="mobile-fund-pulse-item" onClick={() => onSelect?.('DAY_PNL')}>
        <span className="mobile-fund-pulse-label">当日损益 <em>DAY P&amp;L</em></span>
        <strong className={dayPnl != null && dayPnl < 0 ? 'is-negative' : 'is-positive'}>{value(dayPnl)}</strong>
      </button>
      <button type="button" className="mobile-fund-pulse-item" onClick={() => onSelect?.('POSITION_PNL')}>
        <span className="mobile-fund-pulse-label">持仓损益 <em>POSITION P&amp;L</em></span>
        <strong className={positionPnl != null && positionPnl < 0 ? 'is-negative' : 'is-positive'}>{value(positionPnl)}</strong>
      </button>
      <button type="button" className={`mobile-fund-pulse-risk is-${riskClass}`} onClick={() => onSelect?.('RISK')}>
        <span className="mobile-fund-pulse-label">风险 <em>RISK</em></span>
        <strong>{riskLabel}</strong>
      </button>
    </section>
  );
}
