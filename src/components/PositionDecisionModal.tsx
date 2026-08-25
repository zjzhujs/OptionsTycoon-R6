import type { PauseReason, Position } from '../types';
import { BorderGlow } from './fx/BorderGlow';
import { AnimatedNumber } from './fx/AnimatedNumber';

export interface PositionDecisionModalProps {
  isOpen: boolean;
  pauseReason: PauseReason | null;
  position: Position | null;
  /** Position.unrealized_pl is not a live-updated field; the real current mark
   * comes from GameStateView.position_marks, resolved by the caller. */
  unrealizedPl: number | null;
  contractLabel: string;
  thesisSummary: string;
  onHold: () => void;
  onReduce: () => void;
  onCloseAll: () => void;
}

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * NOTABLE pause, not MANDATORY -- the market clock does not block on this. It
 * exists because "看对方向 -> 赚钱 -> 得到表扬" is not the same as managing a
 * position. HOLD/REDUCE/CLOSE all route through the same real engines every
 * other panel uses (record_decision, place_order sell_to_close) -- this modal
 * renders a decision, it never executes one on its own.
 */
export function PositionDecisionModal({
  isOpen,
  pauseReason,
  position,
  unrealizedPl,
  contractLabel,
  thesisSummary,
  onHold,
  onReduce,
  onCloseAll,
}: PositionDecisionModalProps): JSX.Element | null {
  if (!isOpen || !pauseReason || !position || unrealizedPl === null) return null;

  const pl = unrealizedPl;
  const costBasis = Math.abs(position.entry_price) * 100 * Math.abs(position.qty);
  const returnOnPremium = costBasis > 0 ? (pl / costBasis) * 100 : null;
  const canReduce = position.qty > 1;

  const glowColor = pl >= 0 ? '142 76 50' : '350 89 60'; // Greenish gold or crimson

  return (
    <div className="modal-overlay ui-enforced" style={{ backdropFilter: 'blur(8px)' }}>
      <BorderGlow
        glowColor={glowColor}
        borderRadius={12}
        glowRadius={25}
        backgroundColor="var(--thm-panel, #0e1524)"
        style={{ maxWidth: 520, width: '90%', margin: 'auto' }}
      >
        <div className="modal-content posdec-card ui-modal ui-surface ui-l3" style={{ border: 'none', background: 'transparent', margin: 0, width: '100%' }}>
          <div className="modal-body ui-modal-body">
          <div className="posdec-kicker ui-title" data-level="1">持仓决策（POSITION DECISION）</div>
          <div className="posdec-contract font-mono">{contractLabel || '—'}</div>

          <div className="posdec-stats">
            <div className="posdec-stat ot-metric">
              <span className="posdec-stat-label ot-metric-label">未实现盈亏<br/><small style={{ opacity: 0.7 }}>UNREALIZED P&amp;L</small></span>
              <span className={`posdec-stat-value ot-metric-value ${pl >= 0 ? 'posdec-pos' : 'posdec-neg'}`}>
                <AnimatedNumber value={pl} formatFn={(n) => money(n)} />
              </span>
            </div>
            <div className="posdec-stat ot-metric">
              <span className="posdec-stat-label ot-metric-label">权利金收益率<br/><small style={{ opacity: 0.7 }}>RETURN ON PREMIUM</small></span>
              <span className={`posdec-stat-value ot-metric-value ${returnOnPremium !== null && returnOnPremium >= 0 ? 'posdec-pos' : 'posdec-neg'}`}>
                {returnOnPremium === null ? '暂无数据' : `${returnOnPremium >= 0 ? '+' : ''}${returnOnPremium.toFixed(0)}%`}
              </span>
            </div>
            <div className="posdec-stat ot-metric">
              <span className="posdec-stat-label ot-metric-label">历史峰值盈亏<br/><small style={{ opacity: 0.7 }}>PEAK P&amp;L</small></span>
              <span className="posdec-stat-value ot-metric-value">{position.peak_unrealized_pl != null ? money(position.peak_unrealized_pl) : '—'}</span>
            </div>
          </div>

          <div className="posdec-detail">{pauseReason.detail || '—'}</div>

          {thesisSummary && (
            <div className="posdec-thesis">
              <div className="posdec-thesis-label">投资逻辑（THESIS）</div>
              <div className="posdec-thesis-text">{thesisSummary}</div>
            </div>
          )}

          <div className="posdec-mentor">
            <span className="posdec-mentor-name">Leo</span>
            "你现在赚的是浮盈。没平仓以前，它一分钱都不属于你。"
          </div>

          <div className="posdec-actions">
            <button
              type="button"
              className="ot-btn ot-btn-secondary posdec-btn posdec-btn-hold ui-btn"
              data-variant="row"
              data-testid="posdec-hold"
              onClick={onHold}
            >
              <div>继续持有</div>
              <small style={{ fontSize: '0.75em', opacity: 0.85 }}>HOLD</small>
            </button>
            <button
              type="button"
              className="ot-btn posdec-btn posdec-btn-reduce ui-btn"
              data-variant="row"
              data-testid="posdec-reduce"
              onClick={onReduce}
              disabled={!canReduce}
              title={canReduce ? undefined : '仓位数量为 1，REDUCE 不可用'}
            >
              <div>减仓</div>
              <small style={{ fontSize: '0.75em', opacity: 0.85 }}>REDUCE</small>
            </button>
            <button
              type="button"
              className="ot-btn ot-btn-danger posdec-btn posdec-btn-close ui-btn ui-btn-primary"
              data-testid="posdec-close"
              onClick={onCloseAll}
            >
              <div>全部平仓</div>
              <small style={{ fontSize: '0.75em', opacity: 0.85 }}>CLOSE</small>
            </button>
          </div>
          </div>
        </div>
      </BorderGlow>
    </div>
  );
}
