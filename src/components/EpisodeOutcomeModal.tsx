import React from 'react';
import type { EpisodeOutcome } from '../types';
import { money } from '../lib/format';

interface Props {
  outcome: EpisodeOutcome | null;
  isOpen: boolean;
  onClose: () => void;
  onNextEpisode: () => void;
}

export const EpisodeOutcomeModal: React.FC<Props> = ({
  outcome,
  isOpen,
  onClose,
  onNextEpisode,
}) => {
  if (!isOpen || !outcome) return null;

  const returnPct = outcome.return_pct ?? (outcome as any).portfolio_return_pct ?? 0;
  const processScore = outcome.process_score ?? outcome.process_score_avg ?? 85;
  const realizedPnl = outcome.realized_pnl ?? 0;
  const clues = outcome.unlocked_clues ?? [];

  return (
    <div className="modal-overlay ui-enforced">
      <div className="modal-content outcome-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag ot-badge ot-badge-derived">
              章节结算 <span className="en-secondary">EPISODE SETTLEMENT</span>
            </div>
            <h2 className="outcome-title ui-title" data-level="1">{outcome.title || '章节结算报告'}</h2>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="outcome-body modal-body ui-modal-body">
          {/* Top Performance KPI Grid */}
          <div className="outcome-kpi-grid">
            <div className="outcome-kpi-card ot-metric">
              <span className="kpi-lbl ot-metric-label">本集收益率 Return</span>
              <span className={`kpi-val ot-metric-value font-mono ${returnPct >= 0 ? 'green' : 'red'}`}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </span>
            </div>

            <div className="outcome-kpi-card ot-metric">
              <span className="kpi-lbl ot-metric-label">流程纪律分 Process Score</span>
              <span className={`kpi-val ot-metric-value font-mono ${processScore >= 70 ? 'text-green' : 'text-yellow'}`}>
                {processScore.toFixed(0)} <span className="score-denom" style={{ fontSize: 12, color: 'var(--thm-dim, var(--muted))' }}>/ 100</span>
              </span>
            </div>

            <div className="outcome-kpi-card ot-metric">
              <span className="kpi-lbl ot-metric-label">已实现盈亏 Realized P&L</span>
              <span className={`kpi-val ot-metric-value font-mono ${realizedPnl >= 0 ? 'green' : 'red'}`}>
                {money(realizedPnl)}
              </span>
            </div>
          </div>

          {/* Narrative Summary */}
          <div className="outcome-narrative-box">
            <h4 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 800, color: 'var(--thm-accent, var(--cyan))' }}>
              📖 投委会当期评估结论
            </h4>
            <p className="ot-prose">{outcome.summary_narrative || '本集操作合规完成。'}</p>
          </div>

          {/* Fund Metric Shifts */}
          <div className="outcome-shifts-section">
            <h4 className="section-title">📊 基金核心指标变动</h4>
            <div className="shifts-grid">
              <div className="shift-item">
                <span className="shift-name">LP 投资人信心</span>
                <span className={`shift-val font-mono ${(outcome.lp_confidence_delta ?? 0) >= 0 ? 'green' : 'red'}`}>
                  {(outcome.lp_confidence_delta ?? 0) >= 0 ? '+' : ''}{(outcome.lp_confidence_delta ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="shift-item">
                <span className="shift-name">华尔街声誉</span>
                <span className={`shift-val font-mono ${(outcome.reputation_delta ?? 0) >= 0 ? 'green' : 'red'}`}>
                  {(outcome.reputation_delta ?? 0) >= 0 ? '+' : ''}{(outcome.reputation_delta ?? 0).toFixed(1)}
                </span>
              </div>
              <div className="shift-item">
                <span className="shift-name">合规与调查风险</span>
                <span className={`shift-val font-mono ${(outcome.compliance_risk_delta ?? 0) > 0 ? 'red' : 'green'}`}>
                  {(outcome.compliance_risk_delta ?? 0).toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Unlocked Clues */}
          {clues.length > 0 && (
            <div className="outcome-clues-box">
              <h4 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 800, color: 'var(--thm-gold, var(--yellow))' }}>
                🔍 已掌握的关键线索与模型认知
              </h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {clues.map((clue, i) => (
                  <li key={i} className="ot-prose" style={{ fontSize: 12, lineHeight: 1.6 }}>{clue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer ui-modal-footer">
          <button type="button" className="ot-btn ot-btn-ghost ui-btn" data-variant="row" onClick={onClose}>
            留在当前页面复盘
          </button>
          <button type="button" className="ot-btn btn-next-ep ui-btn ui-btn-primary" onClick={onNextEpisode}>
            进入下一集 (NEXT EPISODE) ➔
          </button>
        </div>
      </div>
    </div>
  );
};
