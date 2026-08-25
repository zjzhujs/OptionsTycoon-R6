import React from 'react';
import type { TradeReview } from '../types';
import { WaterfallPnL } from './fx/MiniViz';

/** batch2 BP10：流程分 → 操盘评级徽章。分档只是展示，不改任何评分逻辑。 */
function rankOf(score: number): { rank: string; cls: string } {
  if (score >= 90) return { rank: 'S', cls: 'rank-s' };
  if (score >= 80) return { rank: 'A', cls: 'rank-a' };
  if (score >= 65) return { rank: 'B', cls: 'rank-b' };
  if (score >= 50) return { rank: 'C', cls: 'rank-c' };
  return { rank: 'D', cls: 'rank-d' };
}

interface Props {
  review: TradeReview | null;
  isOpen: boolean;
  onClose: () => void;
}

const EXIT_REASON_LABELS: Record<string, string> = {
  MANUAL_CLOSE: '手动平仓 / Manual close',
  EXPIRED_WORTHLESS: '到期归零 / Expired worthless',
  EXPIRED_ITM: '到期实值 / Expired ITM',
  EXERCISED: '主动行权 / Exercised',
  ASSIGNED: '被指派 / Assigned',
};

export const TradeReviewModal: React.FC<Props> = ({ review, isOpen, onClose }) => {
  if (!isOpen || !review) return null;

  const isProfitable = review.realized_pl >= 0;
  const pScore = typeof review.process_score === 'object' ? review.process_score : null;
  const score = typeof review.process_score === 'number' ? review.process_score : pScore?.overall_process_score || 85;

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="modal-content review-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag">深度复盘 <span className="en-secondary">TRADE POST-MORTEM</span></div>
            <h2 className="ui-title" data-level="1">平仓交易复盘：{review.contract_or_symbol}</h2>
            <div className="text-dim text-sm">
              持仓区间：{review.entry_date} ➔ {review.exit_date} ({review.side.toUpperCase()})
            </div>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="review-body modal-body ui-modal-body">
          {/* Top Key Metrics */}
          <div className="review-stat-grid">
            <div className="review-stat-card ot-metric">
              <div className="stat-label ot-metric-label">实现盈亏 (Realized P&L)</div>
              <div className={`stat-val ot-metric-value font-mono ${isProfitable ? 'text-green' : 'text-red'}`}>
                {isProfitable ? '+' : ''}${review.realized_pl.toFixed(2)}
              </div>
              <div className="stat-sub font-mono">收益率: {review.return_pct > 0 ? '+' : ''}{review.return_pct.toFixed(1)}%</div>
              {review.exit_reason && <div className="stat-sub">退出原因 / Exit reason: {EXIT_REASON_LABELS[review.exit_reason] ?? review.exit_reason}</div>}
            </div>

            <div className="review-stat-card ot-metric">
              <div className="stat-label ot-metric-label">最大有利/不利波动 (MFE / MAE)</div>
              <div className="stat-val ot-metric-value font-mono text-cyan">
                +${(review.mfe_usd ?? 500).toFixed(0)} / <span className="text-red">-${Math.abs(review.mae_usd ?? 200).toFixed(0)}</span>
              </div>
              <div className="stat-sub">持仓期间极致浮盈/浮亏</div>
            </div>

            <div className="review-stat-card ot-metric">
              <div className="stat-label ot-metric-label">流程与纪律评分 (Process Score)</div>
              <div
                className="stat-val ot-metric-value font-mono"
                style={{ color: score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444' }}
              >
                {score.toFixed(1)} / 100
              </div>
              <div className="stat-sub">独立于盈亏金额的交易纪律评估</div>
            </div>
          </div>

          {/* Process Score Breakdown */}
          <div className="review-section">
            <h3 className="section-title">🏆 交易纪律与流程维度拆解</h3>
            <table className="ot-table font-mono" style={{ width: '100%', marginBottom: '16px' }}>
              <tbody>
                <tr>
                  <td>Thesis 假设质量 (Thesis Quality)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.thesis_quality ?? 85).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>入场时机把控 (Entry Timing)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.timing_score ?? 80).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>期权行权/到期选择 (Strike & Expiry Selection)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.instrument_selection ?? 90).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>风险预算与止损 (Risk Budgeting)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.risk_management ?? 88).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>出场纪律执行 (Exit Discipline)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.execution_discipline ?? 85).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>仓位大小纪律 (Position Sizing)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.position_size_score ?? 60).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>入场 IV 价格 (IV Entry Pricing)</td>
                  <td style={{ textAlign: 'right' }}>{(pScore?.iv_entry_score ?? 60).toFixed(0)}%</td>
                </tr>
                {pScore?.abstention_quality_score != null && (
                  <tr>
                    <td>空仓克制 (Abstention Quality)</td>
                    <td style={{ textAlign: 'right' }}>{pScore.abstention_quality_score.toFixed(0)}%</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="review-feedback-box">
              💬 <strong>投委会评语</strong>：{pScore?.feedback || '操作合格，没搞出什么篓子。'}
            </div>
            {(pScore?.process_notes ?? []).map((note) => (
              <div key={note} className="review-feedback-box v28-data-boundary-note">V28 过程补充：{note}</div>
            ))}
          </div>

          {/* Entry Thesis Retrospective */}
          {review.entry_thesis && (
            <div className="review-section">
              <h3 className="section-title">📝 开仓前 Thesis 回顾</h3>
              <div className="thesis-review-box">
                <div className="thesis-row">
                  <span className="th-label">核心方向：</span> {review.entry_thesis.direction}
                </div>
                <div className="thesis-row">
                  <span className="th-label">主要催化剂：</span> {review.entry_thesis.catalyst}
                </div>
                <div className="thesis-row">
                  <span className="th-label">预期涨跌 / 周期：</span> {review.entry_thesis.expected_move_pct}% / {review.entry_thesis.time_horizon_days} 天
                </div>
                <div className="thesis-row">
                  <span className="th-label">失效止损线 / 风险预算：</span> ${review.entry_thesis.invalidation_level} / ${review.entry_thesis.risk_budget_usd}
                </div>
              </div>
            </div>
          )}

          {/* Greeks PnL Attribution */}
          <div className="review-section">
            <h3 className="section-title">
              📊 Greeks 损益归因 (PnL Attribution)
              <span className={`review-rank-badge ${rankOf(score).cls}`} data-testid="review-rank-badge">
                RANK: {rankOf(score).rank}
              </span>
            </h3>
            {/* batch2 BP10：图形归因先于数字卡——一眼看清钱从哪来、亏在哪。 */}
            <div className="review-waterfall-wrap">
              <WaterfallPnL attribution={review.attribution ?? null} width={340} height={136} />
            </div>
            <div className="attribution-grid">
              <div className="attr-card ot-metric">
                <div className="attr-title ot-metric-label">Delta 收益 (方向变动)</div>
                <div className={`attr-val ot-metric-value font-mono ${review.attribution.delta >= 0 ? 'text-green' : 'text-red'}`}>
                  ${review.attribution.delta.toFixed(2)}
                </div>
              </div>
              <div className="attr-card ot-metric">
                <div className="attr-title ot-metric-label">Theta 损耗 (时间价值)</div>
                <div className="attr-val ot-metric-value font-mono text-red">
                  ${review.attribution.theta.toFixed(2)}
                </div>
              </div>
              <div className="attr-card ot-metric">
                <div className="attr-title ot-metric-label">Vega 变动 (IV 波动率)</div>
                <div className={`attr-val ot-metric-value font-mono ${review.attribution.vega >= 0 ? 'text-green' : 'text-red'}`}>
                  ${review.attribution.vega.toFixed(2)}
                </div>
              </div>
              <div className="attr-card ot-metric">
                <div className="attr-title ot-metric-label">残差 / 滑点 (Spread & Residual)</div>
                <div className="attr-val ot-metric-value font-mono text-dim">
                  ${review.attribution.residual.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Event Impact Transmission */}
          {review.event_impact && (
            <div className="review-section">
              <h3 className="section-title">⚡ 宏观与事件传导链 (Transmission Chain)</h3>
              <div className="transmission-box">
                <div className="tx-event">
                  <strong>对应事件</strong>：{review.event_impact.event_name} ({review.event_impact.window})
                </div>
                <div className="tx-chain">
                  <strong>传导逻辑</strong>：{review.event_impact.transmission_summary}
                </div>
              </div>
            </div>
          )}

          {/* What-If Scenarios */}
          {review.what_if && review.what_if.length > 0 && (
            <div className="review-section">
              <h3 className="section-title">🔮 What-If 假设对比分析</h3>
              <div className="whatif-list">
                {review.what_if.map((w, idx) => (
                  <div key={idx} className="whatif-item">
                    <div className="whatif-header">
                      <span className="whatif-name">{w.scenario_name}</span>
                      <span className="whatif-pnl font-mono">
                        假设盈亏: ${w.alternative_pnl.toFixed(2)} (差额: {(w.difference_vs_actual ?? 0) >= 0 ? '+' : ''}${(w.difference_vs_actual ?? 0).toFixed(2)})
                      </span>
                    </div>
                    <div className="whatif-takeaway text-dim text-sm">{w.takeaway}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer ui-modal-footer">
          <button className="btn btn-primary ui-btn ui-btn-primary" onClick={onClose}>
            完成复盘 (Close Review)
          </button>
        </div>
      </div>
    </div>
  );
};
