import { HoldConfirmButton } from '../command/HoldConfirmButton';

export interface MobileMachineBaseProps {
  advancing: boolean;
  disabled: boolean;
  reviewing: boolean;
  regime: string;
  vix: number | null;
  pendingAlerts: number;
  nextEvent: string;
  onAdvance: () => void;
}

export function MobileMachineBase({
  advancing,
  disabled,
  reviewing,
  regime,
  vix,
  pendingAlerts,
  nextEvent,
  onAdvance,
}: MobileMachineBaseProps): JSX.Element {
  return (
    <section className="mobile-machine-base" data-testid="mobile-machine-base" data-visual-key="mobile-machine-base">
      <div className="mobile-machine-status" data-visual-key="mobile-machine-status">
        <span className="mobile-machine-readout">
          <small>REGIME</small>
          <strong>{regime || 'NO FEED'}</strong>
        </span>
        <span className="mobile-machine-readout">
          <small>VIX</small>
          <strong className="font-mono">{vix != null && Number.isFinite(vix) ? vix.toFixed(2) : 'NO FEED'}</strong>
        </span>
        <span className="mobile-machine-readout">
          <small>ALERTS</small>
          <strong className={pendingAlerts > 0 ? 'is-hot' : ''}>{pendingAlerts}</strong>
        </span>
        <span className="mobile-machine-readout mobile-machine-next">
          <small>NEXT</small>
          <strong>{nextEvent || 'NO FEED'}</strong>
        </span>
      </div>

      {reviewing ? (
        <button
          type="button"
          className="mobile-advance-market ot-btn ot-btn-primary"
          data-visual-key="mobile-advance"
          data-testid="exit-review"
          onClick={onAdvance}
          disabled={disabled}
        >
          <span className="mobile-advance-copy">
            <strong>{advancing ? '处理中…' : '退出回看'}</strong>
            <small>RETURN TO LIVE NODE</small>
          </span>
          <span className="mobile-advance-en">RETURN ▶</span>
        </button>
      ) : (
        <HoldConfirmButton
          className="mobile-advance-market ot-btn ot-btn-primary"
          label={advancing ? 'ADVANCING…' : 'ADVANCE MARKET'}
          sublabel={nextEvent || 'Hold to advance · release to cancel'}
          testId="advance-market"
          disabled={disabled || advancing}
          holdMs={1050}
          onConfirm={onAdvance}
        />
      )}
    </section>
  );
}
