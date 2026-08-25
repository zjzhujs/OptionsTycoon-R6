import React, { useState } from 'react';
import type { PoliticalState } from '../types';
import { audioManager } from '../lib/audio';
import { formatProvenance } from '../lib/financialLanguage';

export interface PolicyDeskPanelProps {
  politicalState?: PoliticalState;
  sessionId: string;
  onSpendCapital: (contactId: string) => Promise<string>;
}

const BRANCH_LABEL_ZH: Record<string, string> = {
  WHITE_HOUSE: '白宫',
  REGULATORS: '监管机构',
  CONGRESS: '国会',
  ELECTIONS: '政局',
  GEOPOLITICS: '地缘政治',
};

function branchLabel(branch: string): string {
  return `${BRANCH_LABEL_ZH[branch] ?? branch} ${branch}`;
}

export function PolicyDeskPanel({
  politicalState,
  sessionId,
  onSpendCapital,
}: PolicyDeskPanelProps): JSX.Element {
  const [briefingOutput, setBriefingOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!politicalState) {
    return (
      <div className="pdk-loading ot-empty-state">
        正在同步华盛顿政策通道...
      </div>
    );
  }

  const geoPolicies = (politicalState.active_policies || []).filter(
    (p) => p.branch === 'GEOPOLITICS'
  );
  const domesticPolicies = (politicalState.active_policies || []).filter(
    (p) => p.branch !== 'GEOPOLITICS'
  );

  const handleConsult = async (contactId: string) => {
    setLoading(true);
    audioManager.playSfx('ui_click');
    try {
      const res = await onSpendCapital(contactId);
      setBriefingOutput(res);
    } catch (e: any) {
      setBriefingOutput(`政策通报获取失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pdk-root">
      {/* Top Banner */}
      <div className="pdk-header">
        <div className="pdk-header-main">
          <div className="pdk-title-row">
            <h2 className="pdk-h2">
              <span className="pdk-dot" />
              华盛顿政策通道 <span className="pdk-en-secondary">CAPITOL HILL POLICY DESK</span>
            </h2>
            <span className="ot-badge ot-badge-real font-mono">
              实时宏观政策 <span className="pdk-en-secondary">REAL-TIME</span>
            </span>
          </div>
          <p className="pdk-sub ot-prose">
            追踪白宫行政令、商务部 (BIS) 算力出口限制、国会听证会与反垄断监管传导链
          </p>
        </div>

        <div className="pdk-meters font-mono">
          <div className="ot-metric">
            <div className="ot-metric-label">政治资本 <span className="pdk-en-secondary">POLITICAL CAPITAL</span></div>
            <div className="ot-metric-value" style={{ color: 'var(--thm-gold, var(--gold))' }}>
              {(politicalState.political_capital ?? 0).toFixed(0)} PTS
            </div>
          </div>
          <div className="pdk-meter-split ot-metric">
            <div className="ot-metric-label">监管压力 <span className="pdk-en-secondary">REGULATORY HEAT</span></div>
            <div className="ot-metric-value" style={{ color: 'var(--thm-risk, var(--red))' }}>
              {(politicalState.regulatory_heat ?? 0).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {briefingOutput && (
        <div className="pdk-brief font-mono ot-prose">
          <strong className="pdk-brief-label">【华盛顿内部简报已解密】：</strong>
          {briefingOutput}
        </div>
      )}

      {/* Grid: Active Policies and Contacts */}
      <div className="pdk-cols">
        {/* Active Policy Events */}
        <div className="pdk-col">
          <div className="pdk-collabel font-mono">
            生效中的行政令与立法议案 <span className="pdk-en-secondary">EXECUTIVE ORDERS & BILLS</span>
          </div>

          {domesticPolicies.length > 0 ? (
            <div className="pdk-list">
              {domesticPolicies.map((p) => (
                <div
                  key={p.id}
                  className="pdk-card"
                >
                  <div className="pdk-card-head">
                    <span className="ot-badge ot-badge-derived font-mono">
                      {branchLabel(p.branch ?? '')}
                    </span>
                    <div className="pdk-meta">
                      <span className="pdk-src font-mono" title={formatProvenance(p.source_type)}>{formatProvenance(p.source_type)}</span>
                      <span className="pdk-date font-mono">{p.date || '—'}</span>
                    </div>
                  </div>

                  <div className="pdk-headline">{p.headline}</div>
                  <div className="pdk-body ot-prose">{p.body}</div>

                  <div className="pdk-kv-grid font-mono">
                    <div className="pdk-kv">
                      <span className="pdk-kv-k">发生概率 <span className="pdk-en-secondary">PROBABILITY</span>: </span>
                      <span className="pdk-kv-v">{(p.probability_pct ?? 0).toFixed(0)}%</span>
                    </div>
                    <div className="pdk-kv">
                      <span className="pdk-kv-k">影响行业 <span className="pdk-en-secondary">SECTORS</span>: </span>
                      <span className="pdk-kv-v">{p.sector_impact || '—'}</span>
                    </div>
                  </div>

                  <div className="pdk-trans font-mono ot-prose">
                    <span className="pdk-trans-k">潜在传导路径 <span className="pdk-en-secondary">TRANSMISSION</span>: </span>
                    <span className="pdk-kv-v">{p.potential_transmission || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ot-empty-state">
              当前暂无针对半导体行业的紧急白宫行政令。
            </div>
          )}
        </div>

        {/* Washington Political Contacts */}
        <div className="pdk-col">
          <div className="pdk-collabel font-mono">
            政策联系人与顾问 <span className="pdk-en-secondary">CONTACTS & ADVISERS</span>
          </div>

          <div className="pdk-list">
            {(politicalState.contacts ?? []).map((c) => (
              <div
                key={c.id}
                className="ot-role-card pdk-contact"
              >
                <div className="ot-avatar pdk-avatar">
                  {c.avatar ? (
                    <img
                      src={c.avatar}
                      alt={c.name || '联系人'}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <span>{c.name ? c.name.charAt(0) : 'P'}</span>
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="pdk-contact-head">
                    <div>
                      <div className="pdk-contact-name">{c.name || '未知顾问'}</div>
                      <div className="pdk-contact-role">{c.role || c.organization || '华盛顿政策专家'}</div>
                    </div>
                  </div>

                  <div className="pdk-contact-brief ot-prose">{c.briefing_summary}</div>

                  <div className="pdk-contact-foot font-mono">
                    <span className="pdk-favor">好感度 Favor: {(c.favor_balance ?? 0).toFixed(0)}</span>
                    <button
                      type="button"
                      disabled={loading || (politicalState.political_capital ?? 0) < (c.access_cost_capital ?? 0)}
                      onClick={() => handleConsult(c.id)}
                      className="ot-btn ot-btn-ghost pdk-consult"
                      style={{
                        padding: '6px 10px',
                        fontSize: 11,
                        color: 'var(--thm-gold, var(--gold))',
                        borderColor: 'color-mix(in srgb, var(--thm-gold, var(--gold)) 40%, transparent)',
                      }}
                    >
                      获取独家政策内幕 ({c.access_cost_capital ?? 0} pts)
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GEOPOLITICAL RISK Section */}
      {geoPolicies.length > 0 && (
        <div className="pdk-geo">
          <div className="pdk-geo-head">
            <div className="pdk-geo-title font-mono">
              地缘政治风险监测 <span className="pdk-en-secondary">GEOPOLITICAL RISK MONITOR</span>
            </div>
            <span className="ot-badge ot-badge-simulated font-mono">
              模拟分析 <span className="pdk-en-secondary">SIMULATED</span>
            </span>
          </div>

          <div className="pdk-geo-grid">
            {geoPolicies.map((g) => (
              <div
                key={g.id}
                className="pdk-card pdk-geo-card"
              >
                <div className="pdk-card-head">
                  <span className="ot-badge ot-badge-simulated font-mono">
                    地缘政治 GEOPOLITICS
                  </span>
                  <span className="pdk-src font-mono" title={formatProvenance(g.source_type)}>{formatProvenance(g.source_type)}</span>
                </div>
                <div className="pdk-headline">{g.headline}</div>
                <div className="pdk-body ot-prose">{g.body}</div>
                <div className="pdk-kv-grid font-mono">
                  <div className="pdk-kv pdk-kv-tight">
                    <span className="pdk-kv-k pdk-kv-k-geo">概率 <span className="pdk-en-secondary">PROBABILITY</span>: </span>
                    <span className="pdk-kv-v">{(g.probability_pct ?? 0).toFixed(0)}%</span>
                  </div>
                  <div className="pdk-kv pdk-kv-tight">
                    <span className="pdk-kv-k pdk-kv-k-geo">行业 <span className="pdk-en-secondary">SECTORS</span>: </span>
                    <span className="pdk-kv-v">{g.sector_impact || '—'}</span>
                  </div>
                </div>
                <div className="pdk-kv pdk-kv-tight font-mono ot-prose">
                  <span className="pdk-trans-k">传导路径 <span className="pdk-en-secondary">TRANSMISSION</span>: </span>
                  <span className="pdk-kv-v">{g.potential_transmission || '—'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pdk-geo-note font-mono ot-prose">
            地缘政治风险不会改变历史价格路径，仅供决策参考。<span className="pdk-en-secondary">Does not modify historical price path. For decision context only.</span>
          </div>
        </div>
      )}

      <div className="pdk-care">
        <div className="pdk-care-label font-mono">
          我的基金关心什么？<span className="pdk-en-secondary">WHAT DOES MY FUND CARE ABOUT?</span>
        </div>
        <div className="pdk-care-grid font-mono">
          <div className="pdk-care-cell">
            <span className="pdk-care-who">Daniel Ross</span>
            <div className="pdk-care-what">Financing / PB 敞口成本</div>
          </div>
          <div className="pdk-care-cell">
            <span className="pdk-care-who">Marcus Reed</span>
            <div className="pdk-care-what">合规红线 / 监管审查</div>
          </div>
          <div className="pdk-care-cell">
            <span className="pdk-care-who">Victor Hale</span>
            <div className="pdk-care-what">宏观利率与板块贝塔</div>
          </div>
          <div className="pdk-care-cell">
            <span className="pdk-care-who">Maya Chen</span>
            <div className="pdk-care-what">政策对基本面资本开支的影响</div>
          </div>
        </div>
      </div>
    </div>
  );
}
