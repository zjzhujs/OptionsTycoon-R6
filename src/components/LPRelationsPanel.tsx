import React from 'react';
import type { LPProfile } from '../types';
import { fmt } from '../lib/format';
import { formatProvenance } from '../lib/financialLanguage';

export interface LPRelationsPanelProps {
  lps: LPProfile[];
}

function riskBadge(risk: string): string {
  if (risk === 'CRITICAL' || risk === 'REDEEMING') return 'ot-badge-risk';
  if (risk === 'ELEVATED') return 'ot-badge-estimated';
  return 'ot-badge-real';
}

const LP_TYPE_LABELS: Record<string, string> = {
  PENSION_FUND: '养老基金 Pension Fund',
  ENDOWMENT: '大学捐赠基金 Endowment',
  FAMILY_OFFICE: '家族办公室 Family Office',
  FUND_OF_FUNDS: '基金中基金 FoF',
  FOUNDER: '创始种子资本 Founder Capital',
};

export function LPRelationsPanel({ lps }: LPRelationsPanelProps): JSX.Element {
  if (!lps || lps.length === 0) {
    return (
      <div className="lpr-panel ot-panel ot-empty-state">
        <div className="ot-empty-text">正在同步 LP 出资人关系数据...</div>
      </div>
    );
  }

  const totalCommitted = lps.reduce((s, lp) => s + lp.capital_current, 0);

  return (
    <div className="lpr-panel ot-panel">
      <div className="lpr-head ot-section-header">
        <div>
          <h2 className="lpr-h2 ot-section-title">
            <span className="lpr-dot" aria-hidden="true" />
            LP 出资人关系 <span className="en-secondary">LP RELATIONS</span>
          </h2>
          <p className="lpr-sub ot-section-sub">
            {lps.length} 位出资人 · 当前在管资本合计 {fmt(totalCommitted)}
          </p>
        </div>
        <div className="lpr-disclaimer ot-badge ot-badge-simulated" title={formatProvenance('SIMULATED')}>
          {formatProvenance('SIMULATED')} · LP RELATIONSHIP
        </div>
      </div>

      <div className="lpr-grid">
        {lps.map((lp) => (
          <div key={lp.id} className="lpr-card ot-role-card font-mono">
            <div className="lpr-card-head ot-role-header">
              <div className="lpr-head-left">
                <div className="ot-avatar lpr-avatar" aria-hidden="true">
                  {lp.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="lpr-name ot-role-name">{lp.name}</div>
                  <div className="lpr-type ot-role-title">{LP_TYPE_LABELS[lp.lp_type] ?? lp.lp_type}</div>
                </div>
              </div>
              <span className={`ot-badge ${riskBadge(lp.redemption_risk)}`}>
                {lp.redemption_risk}
              </span>
            </div>

            <div className="lpr-fields">
              <div>当前资金（CAPITAL）: <span className="lpr-val font-mono">{fmt(lp.capital_current)}</span></div>
              <div>信任度（CONFIDENCE）: <span className="lpr-val font-mono">{lp.confidence_score.toFixed(0)}</span></div>
              <div>目标收益率: <span className="lpr-val font-mono">{lp.target_return_pct.toFixed(0)}%</span></div>
              <div>最大回撤承受力: <span className="lpr-val font-mono">{lp.max_tolerated_drawdown_pct.toFixed(0)}%</span></div>
              <div>赎回触发阈值: <span className="lpr-val font-mono">{lp.redemption_threshold_pct.toFixed(0)}%</span></div>
              <div>流动性条款: <span className="lpr-val lpr-val-sm">{lp.liquidity_terms}</span></div>
              <div>风险偏好: <span className="lpr-val">{lp.risk_appetite}</span></div>
              <div>策略偏好: <span className="lpr-val">{lp.strategy_preference}</span></div>
              <div>道德敏感度: <span className="lpr-val font-mono">{lp.ethical_sensitivity}</span></div>
              <div>合规敏感度: <span className="lpr-val font-mono">{lp.compliance_sensitivity}</span></div>
            </div>

            <div className="lpr-foot ot-role-footer">
              <div className="lpr-contact">{lp.key_contact}</div>
              <div className="lpr-notes ot-role-quote">{lp.relationship_notes}</div>
              <div className="lpr-review">下次复盘: <span className="lpr-review-val font-mono">{lp.next_review_date || 'TBD'}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
