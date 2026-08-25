import { money } from '../../lib/format';

export interface MobilePositionInstrumentProps {
  count: number;
  pnl: number | null;
  underlying: string;
}

export function MobilePositionInstrument({ count, pnl, underlying }: MobilePositionInstrumentProps): JSX.Element {
  return (
    <section className="mobile-position-instrument" data-testid="mobile-position-instrument" data-visual-key="mobile-position">
      <span className="command-kicker">POSITION</span>
      <strong>{count > 0 ? `${count} 个持仓 · ${underlying}` : '当前无持仓'}</strong>
      <span className={pnl != null && pnl < 0 ? 'is-negative command-numeric' : 'is-positive command-numeric'}>
        {pnl == null ? 'DATA_UNAVAILABLE' : money(pnl)}
      </span>
    </section>
  );
}

