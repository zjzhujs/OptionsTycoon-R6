import React from 'react';
import type { TimelineEvent, TradeReview } from '../types';
import { fmt } from '../lib/format';
import { audioManager } from '../lib/audio';
import {
  formatVerdictRewrite,
  formatVerdictFinding,
  formatArchetype,
  formatExitReason,
  formatProvenance,
  CONTEXT_SNAPSHOT_TERMS,
  MATRIX_HEADER_TERMS,
} from '../lib/financialLanguage';
import { renderWithGlossary } from './GlossaryTerm';
import { GradeStamp } from './GradeStamp';
import { GlareHover } from './fx/GlareHover';
import { BorderBeam } from './fx/BorderBeam';
import { AnimatedNumber } from './fx/AnimatedNumber';

export interface TradeReview360ModalProps {
  review: TradeReview;
  onClose: () => void;
}

/** Drift is a rule-based flag, never a verdict — colours mark severity of the rule hit only. */
const DRIFT_LEVEL_STYLE: Record<string, string> = {
  NONE: 'tr360-drift-NONE',
  MINOR: 'tr360-drift-MINOR',
  MATERIAL: 'tr360-drift-MATERIAL',
  SEVERE: 'tr360-drift-SEVERE',
};

const TIMELINE_ACTOR_STYLE: Record<string, string> = {
  PLAYER: 'tr360-actor-PLAYER',
  MARKET: 'tr360-actor-MARKET',
  CHARACTER: 'tr360-actor-CHARACTER',
  INSTITUTION: 'tr360-actor-INSTITUTION',
  POLITICAL: 'tr360-actor-POLITICAL',
  SYSTEM: 'tr360-actor-SYSTEM',
};

/** Never fall back to a rosier number: unknown renders as an em dash, not zero. */
const numOr = (v: unknown, digits = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? fmt(v, digits) : '—';

/** Decision-matrix objects must read like market context, never debug JSON. */
export function formatDecisionContextValue(value: unknown): string {
  if (value === 'DATA_UNAVAILABLE') return '暂无数据';
  if (value == null) return '—';
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value !== 'object') return String(value).slice(0, 40);

  const row = value as Record<string, unknown>;
  const metrics: string[] = [];
  const add = (key: string, label: string, suffix = ''): void => {
    const metric = row[key];
    if (typeof metric === 'number' && Number.isFinite(metric)) {
      metrics.push(`${label} ${metric.toFixed(2)}${suffix}`);
    }
  };
  add('ust_10y', '10年期美债', '%');
  add('ust_2y', '2年期美债', '%');
  add('fed_funds', '联邦基金利率', '%');
  add('vix', 'VIX');
  add('usdjpy', 'USD/JPY');
  return metrics.length > 0 ? metrics.join(' · ') : '见对应面板';
}

/**
 * Discrete daily campaign nodes. The engine emits -1 for a date it cannot map to a
 * campaign node, which must render as unknown rather than as node "-1".
 */
const nodeLabel = (idx: unknown): string =>
  typeof idx === 'number' && Number.isFinite(idx) && idx >= 0 ? `NODE ${idx}` : 'NODE —';

export function TradeReview360Modal({
  review,
  onClose,
}: TradeReview360ModalProps): JSX.Element {
  const isProfit = review.realized_pl >= 0;
  const attr = review.attribution;
  const processScore = typeof review.process_score === 'object' ? review.process_score : null;
  const overallScore = processScore ? processScore.overall_process_score : (typeof review.process_score === 'number' ? review.process_score : 0);
  const holdingDays = (() => {
    const a = new Date(review.entry_date).getTime();
    const b = new Date(review.exit_date).getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.max(0, Math.round((b - a) / 86400000));
  })();

  // Thesis drift is a rule-based flag reported by the engine; nothing is inferred here.
  const driftLevel = review.thesis_drift?.level ?? 'NONE';
  const driftFindings = review.thesis_drift?.findings ?? [];
  const driftAdaptiveNotes = review.thesis_drift?.adaptive_notes ?? [];
  const driftRevisionCount =
    review.thesis_drift?.revision_count ?? review.thesis_evolution?.length ?? 0;
  const glossarySeen = new Set<string>();

  // Group the (already chronologically sorted) timeline by game date — discrete daily nodes.
  const timelineGroups = React.useMemo(() => {
    const byDate = new Map<string, { date: string; nodeIndex: number | null; events: TimelineEvent[] }>();
    for (const ev of review.decision_timeline ?? []) {
      const key = ev.game_date || '';
      const bucket = byDate.get(key);
      if (bucket) {
        bucket.events.push(ev);
      } else {
        byDate.set(key, {
          date: key,
          nodeIndex: typeof ev.node_index === 'number' ? ev.node_index : null,
          events: [ev],
        });
      }
    }
    return Array.from(byDate.values());
  }, [review.decision_timeline]);

  return (
    <div className="tr360-overlay ui-enforced">
      <div className="tr360-modal ui-modal ui-surface ui-l3">
        {/* Modal Top Header */}
        <div className="tr360-header ui-modal-header">
          <div className="tr360-header-main">
            <div
              className={`tr360-dot ${isProfit ? 'tr360-dot-profit' : 'tr360-dot-loss'}`}
            />
            <div className="tr360-header-text">
              <div className="tr360-title-row">
                <h2 className="tr360-title ui-title" data-level="1">
                  360° TRADE POST-MORTEM & INSTITUTIONAL ATTRIBUTION
                </h2>
                <span className="tr360-symbol font-mono ot-badge ot-badge-derived">
                  {review.contract_or_symbol}
                </span>
              </div>
              <p className="tr360-subtitle">
                完整的入场/出场环境冻结快照、多方研判对错矩阵与希腊字母数学归因
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              audioManager.playSfx('ui_click');
              onClose();
            }}
            className="tr360-close font-mono ot-btn ot-btn-ghost ui-btn"
            data-variant="compact"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="tr360-body ui-modal-body">
          {/* FUND MANAGER VERDICT -- 10-second executive summary */}
          {review.fund_manager_verdict && (() => {
            const vRewritten = formatVerdictRewrite(review.fund_manager_verdict.headline, review.fund_manager_verdict.narrative);
            return (
            <GlareHover
              borderRadius="10px"
              glareColor="var(--thm-gold)"
              glareOpacity={0.25}
              style={{ position: 'relative', width: '100%', marginBottom: 16 }}
            >
              <BorderBeam size={120} duration={8} colorFrom="var(--thm-gold)" colorTo="var(--thm-accent)" />
              <div className="tr360-fund-verdict font-mono" style={{ margin: 0, border: 'none' }}>
                {review.trade_grade && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 10 }}>
                    <GradeStamp
                      grade={review.trade_grade.grade}
                      playSound={(k) => audioManager.playSfx(k === 'sss' ? 'sfx_notification' : 'sfx_low_hit', 0.5)}
                    />
                    <div>
                      <div className="grade-stamp-dims">
                        <span>THESIS {review.trade_grade.dimensions.thesis}/30</span>
                        <span>RISK {review.trade_grade.dimensions.risk}/25</span>
                        <span>DISCIPLINE {review.trade_grade.dimensions.discipline}/25</span>
                        <span>EFFICIENCY {review.trade_grade.dimensions.efficiency}/20</span>
                      </div>
                      {review.trade_grade.cap != null && (
                        <div className="grade-stamp-cap">评级封顶 {review.trade_grade.cap}：{review.trade_grade.cap_reasons.join('；')}</div>
                      )}
                    </div>
                  </div>
                )}
                <div className="tr360-verdict-kicker">基金经理复盘结论（FUND MANAGER VERDICT）</div>
                <div className="tr360-verdict-headline">{vRewritten.titleCn}</div>
                {vRewritten.titleEn !== vRewritten.titleCn && (
                  <div style={{ fontSize: '0.85em', opacity: 0.75, marginBottom: '6px' }}>{vRewritten.titleEn}</div>
                )}
                <div className="tr360-verdict-narrative">{renderWithGlossary(vRewritten.bodyCn ?? review.fund_manager_verdict.narrative, glossarySeen)}</div>
                <ul className="tr360-verdict-findings">
                  {review.fund_manager_verdict.findings.map((f, i) => (
                    <li
                      key={i}
                      className={`tr360-verdict-finding ${f.kind === 'GOOD' ? 'tr360-verdict-finding-good' : 'tr360-verdict-finding-warn'}`}
                    >
                      <span className="tr360-verdict-finding-mark">{f.kind === 'GOOD' ? '✓' : '!'}</span>
                      {renderWithGlossary(formatVerdictFinding(f.text), glossarySeen)}
                    </li>
                  ))}
                </ul>

                {processScore && (
                  <details className="tr360-why-not-100">
                    <summary>为什么不是100分？（WHY NOT 100?）</summary>
                    <div className="tr360-why-not-100-grid">
                      <div className="tr360-why-not-100-row">
                        <span>投资逻辑质量（Thesis Quality · 30%权重）</span>
                        <span className="font-mono">{(processScore.thesis_quality * 0.3).toFixed(1)}/30</span>
                      </div>
                      <div className="tr360-why-not-100-row">
                        <span>风险管理（Risk Management · 25%权重）</span>
                        <span className="font-mono">{(processScore.risk_management * 0.25).toFixed(1)}/25</span>
                      </div>
                      <div className="tr360-why-not-100-row">
                        <span>入场与退出时机（Timing · 15%权重）</span>
                        <span className="font-mono">{(processScore.timing_score * 0.15).toFixed(1)}/15</span>
                      </div>
                      <div className="tr360-why-not-100-row">
                        <span>交易工具选择（Instrument Selection · 15%权重）</span>
                        <span className="font-mono">{(processScore.instrument_selection * 0.15).toFixed(1)}/15</span>
                      </div>
                      <div className="tr360-why-not-100-row">
                        <span>执行纪律（Execution Discipline · 15%权重）</span>
                        <span className="font-mono">{(processScore.execution_discipline * 0.15).toFixed(1)}/15</span>
                      </div>
                    </div>
                    <div className="tr360-why-not-100-note">
                      每项 = 该维度真实得分 × 其在 Process Score 公式中的真实权重，五项相加即上方总分。
                    </div>
                    {review.fund_manager_verdict.ignored_event_count > 0 && (
                      <div className="tr360-fund-warning">
                        未处理重要事项警报（IGNORED WARNINGS）：持仓期间，你有 {review.fund_manager_verdict.ignored_event_count} 件需要基金经理回应的重要事项没有处理。
                        <div className="tr360-fund-warning-note">
                          这一项不计入 Process Score（该分数只衡量交易纪律），单独列示。
                        </div>
                      </div>
                    )}
                  </details>
                )}
              </div>
            </GlareHover>
            );
          })()}

          {/* Headline PnL & Profile Card -- Process Score strictly visually separated from Outcome PnL */}
          <div className="tr360-headline-grid">
            <div className="tr360-card font-mono ot-metric">
              <div className="tr360-card-label ot-metric-label">已实现盈亏（REALIZED P&amp;L）</div>
              <div className={`tr360-card-big ot-metric-value ${isProfit ? 'tr360-pos' : 'tr360-neg'}`}>
                {isProfit ? '+' : ''}
                <AnimatedNumber value={review.realized_pl} formatFn={(n) => fmt(n)} /> ({review.return_pct != null ? `${review.return_pct >= 0 ? '+' : ''}${review.return_pct.toFixed(1)}%` : '—'})
              </div>
              <div className="tr360-card-sub">
                持仓时间：{holdingDays ?? '—'} 天
              </div>
            </div>

            <div className="tr360-card font-mono ot-metric tr360-process-card">
              <div className="tr360-card-label ot-metric-label">交易过程评分（PROCESS SCORE）</div>
              <div className="tr360-card-big ot-metric-value tr360-process-score">
                <AnimatedNumber value={overallScore} formatFn={(n) => `${n.toFixed(0)}`} /> / 100
              </div>
              <div className="tr360-card-sub">
                投资逻辑质量：{(processScore?.thesis_quality ?? 0).toFixed(0)}
              </div>
              {processScore?.pnl_independence_note && (
                <div className="tr360-card-note">{processScore.pnl_independence_note}</div>
              )}
            </div>

            <div className="tr360-card font-mono tr360-card-wide ot-metric">
              <div className="tr360-card-label ot-metric-label">交易员风格画像（TRADER PROFILE ARCHETYPE）</div>
              <div className="tr360-card-mid">{formatArchetype(review.player_profile_tag)}</div>
              <div className="tr360-card-feedback">{processScore?.feedback || '暂无评价'}</div>
            </div>
          </div>

          {/* 1. Frozen Context Snapshots (Entry vs Exit) */}
          <div>
            <div className="tr360-shead font-mono">
              <span className="tr360-marker tr360-marker-blue" />
              1. 交易生命周期上下文冻结快照 (Entry vs Exit Snapshot)
            </div>

            <div className="tr360-two-col font-mono">
              {/* Entry Snapshot */}
              <div className="tr360-subpanel">
                <div className="tr360-subpanel-head tr360-head-blue">
                  <span>建仓时你所知道的 <span className="en-secondary">ENTRY CONTEXT</span></span>
                  <span className="ot-badge ot-badge-real">{review.entry_snapshot?.game_date || '—'}</span>
                </div>
                <div className="tr360-kv">
                  <div>{CONTEXT_SNAPSHOT_TERMS.STOCK_PRICE.display}: <strong className="tr360-v">{review.entry_snapshot?.fundamental_context?.price != null ? `$${(review.entry_snapshot.fundamental_context.price as number).toFixed(2)}` : '—'}</strong></div>
                  <div>VIX: <strong className="tr360-amber">{review.entry_snapshot?.fundamental_context?.vix != null ? (review.entry_snapshot.fundamental_context.vix as number).toFixed(1) : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.STREET_CONSENSUS.display}: <strong className="tr360-v">{review.entry_snapshot?.street_consensus_context?.consensus || '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.COUNTERPARTY.display}: <strong className="tr360-v-tight">{review.entry_snapshot?.counterparty_context?.dominant_participant || '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.FLOW_PCR.display}: <strong className="tr360-v">{review.entry_snapshot?.flow_context?.put_call_ratio != null ? (review.entry_snapshot.flow_context.put_call_ratio as number).toFixed(2) : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.CROWDEDNESS.display}: <strong className="tr360-v">{review.entry_snapshot?.positioning_context?.crowdedness_score != null ? (review.entry_snapshot.positioning_context.crowdedness_score as number).toFixed(0) : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.RETAIL_FEAR_GREED.display}: <strong className="tr360-v">{review.entry_snapshot?.retail_sentiment_context?.fear_greed_index != null ? (review.entry_snapshot.retail_sentiment_context.fear_greed_index as number).toFixed(0) : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.BANK_TIER.display}: <strong className="tr360-v">{review.entry_snapshot?.institutional_relationship_context?.relationship_tier || '—'}</strong></div>
                </div>
                {review.entry_snapshot?.player_thesis && (
                  <div className="tr360-note-box">
                    <span className="tr360-amber font-mono">Player Thesis: </span>
                    {review.entry_snapshot.player_thesis.catalyst || '—'} ({review.entry_snapshot.player_thesis.direction || '—'})
                  </div>
                )}
              </div>

              {/* Exit Snapshot */}
              <div className="tr360-subpanel">
                <div className="tr360-subpanel-head tr360-head-purple">
                  <span>平仓情境 <span className="en-secondary">EXIT CONTEXT</span></span>
                  <span className="ot-badge ot-badge-real">{review.exit_snapshot?.game_date || '—'}</span>
                </div>
                <div className="tr360-kv">
                  <div>{CONTEXT_SNAPSHOT_TERMS.EXIT_PRICE.display}: <strong className="tr360-v">{review.exit_snapshot?.exit_price != null ? `$${review.exit_snapshot.exit_price.toFixed(2)}` : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.FLOW_PCR.display}: <strong className="tr360-amber">{review.exit_snapshot?.flow_context?.put_call_ratio != null ? (review.exit_snapshot.flow_context.put_call_ratio as number).toFixed(2) : '—'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.VOLUME_SHOCK.display}: <strong className="tr360-v">{review.exit_snapshot?.flow_context?.volume_shock_detected ? 'YES' : 'NO'}</strong></div>
                  <div>{CONTEXT_SNAPSHOT_TERMS.RETAIL_FEAR_GREED.display}: <strong className="tr360-v">{review.exit_snapshot?.retail_sentiment_context?.fear_greed_index != null ? (review.exit_snapshot.retail_sentiment_context.fear_greed_index as number).toFixed(0) : '—'}</strong></div>
                </div>
                <div className="tr360-note-box">
                  <span className="tr360-purple font-mono">平仓原因（Exit Reason）: </span>
                  {formatExitReason(review.exit_snapshot?.reason_for_exit)}
                </div>
              </div>
            </div>
          </div>

          {/* 2. "Who Was Right?" Matrix */}
          <div>
            <div className="tr360-shead font-mono">
              <span className="tr360-marker tr360-marker-amber" />
              2. 谁看对了？（WHO WAS RIGHT?）
            </div>

            <div className="tr360-wwr-grid">
              {review.who_was_right.map((w) => {
                const verdictClass =
                  w.outcome_verdict === 'RIGHT'
                    ? 'ot-badge-real'
                    : w.outcome_verdict === 'WRONG'
                    ? 'ot-badge-critical'
                    : 'ot-badge-derived';

                const verdictDisplay =
                  w.outcome_verdict === 'RIGHT' ? '判断正确（RIGHT）'
                  : w.outcome_verdict === 'WRONG' ? '判断错误（WRONG）'
                  : '中性（NEUTRAL）';

                return (
                  <div
                    key={w.participant_id}
                    className="tr360-wwr-card"
                  >
                    <div className="tr360-wwr-head">
                      <span className="tr360-wwr-name">{w.participant_name}</span>
                      <span className={`ot-badge ${verdictClass} font-mono`}>
                        {verdictDisplay}
                      </span>
                    </div>
                    <div className="tr360-wwr-stance">
                      预测立场："{w.predicted_stance}"
                    </div>
                    <div className="tr360-wwr-text">{w.explanation}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Driver Rankings & Mathematical Attribution */}
          <div className="tr360-two-col">
            {/* Driver Rankings */}
            <div className="tr360-subpanel font-mono">
              <div className="tr360-sub-title">
                PnL Driver Rankings (驱动因素贡献)
              </div>
              <div className="tr360-driver-list">
                {review.driver_rankings.map((d) => (
                  <div key={d.rank} className="tr360-driver">
                    <div className="tr360-driver-head">
                      <span className="tr360-driver-name">
                        #{d.rank} {d.factor_name} <span className="tr360-dim">({d.factor_category})</span>
                      </span>
                      <span className="tr360-driver-pct font-mono">{d.pnl_impact_pct != null ? `${d.pnl_impact_pct.toFixed(0)}%` : '—'}</span>
                    </div>
                    <div className="tr360-driver-note">{d.explanation}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Greeks Mathematical Decomposition */}
            {attr && (
              <div className="tr360-subpanel font-mono">
                <div className="tr360-sub-title">
                  Greeks Attribution Decomposition (数学恒等式)
                </div>
                <div className="tr360-kv">
                  <div>Delta PnL: <strong className={attr.delta >= 0 ? 'tr360-pos' : 'tr360-neg'}>{fmt(attr.delta)}</strong></div>
                  <div>Gamma PnL: <strong className={(attr.gamma ?? 0) >= 0 ? 'tr360-pos' : 'tr360-neg'}>{fmt(attr.gamma ?? 0)}</strong></div>
                  <div>Theta PnL: <strong className={attr.theta >= 0 ? 'tr360-pos' : 'tr360-neg'}>{fmt(attr.theta)}</strong></div>
                  <div>Vega PnL: <strong className={attr.vega >= 0 ? 'tr360-pos' : 'tr360-neg'}>{fmt(attr.vega)}</strong></div>
                </div>
                <div className="tr360-net">
                  Net = Delta ({fmt(attr.delta)}) + Theta ({fmt(attr.theta)}) + Vega ({fmt(attr.vega)}) + Residual ({fmt(attr.residual)}) = <strong className="tr360-strong-white">{fmt(attr.net)}</strong>
                </div>
              </div>
            )}
          </div>

          {/* 4. What-If Scenarios */}
          <div>
            <div className="tr360-shead font-mono">
              <span className="tr360-marker tr360-marker-purple" />
              4. 模拟对比与策略平行宇宙（WHAT-IF SCENARIOS）
            </div>

            <div className="tr360-whatif-grid font-mono">
              {review.what_if.map((w) => (
                <div
                  key={w.scenario_name}
                  className="tr360-whatif-card"
                >
                  <div className="tr360-whatif-main">
                    <div className="tr360-whatif-name">{renderWithGlossary(w.scenario_name, glossarySeen)}</div>
                    <div className="tr360-whatif-take">{renderWithGlossary(w.takeaway ?? w.reasoning ?? '', glossarySeen)}</div>
                  </div>
                  <div className="tr360-whatif-right">
                    <span className={`tr360-whatif-val ${w.alternative_pnl >= 0 ? 'tr360-pos' : 'tr360-neg'}`}>
                      {w.alternative_pnl >= 0 ? '+' : ''}{fmt(w.alternative_pnl)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Named Review Sections */}
          {review.review_sections && Object.keys(review.review_sections).length > 0 && (
            <div>
              <div className="tr360-shead font-mono">
                <span className="tr360-marker tr360-marker-cyan" />
                5. 360° 复盘分区 (Named Review Sections)
              </div>
              <div className="tr360-sections-grid font-mono">
                {Object.entries(review.review_sections).map(([key, val]) => (
                  <div key={key} className="tr360-section-chip">
                    <div className="tr360-chip-head">
                      <span className="tr360-chip-key">{key.replace(/_/g, ' ')}</span>
                      {val.changed && <span className="ot-badge ot-badge-estimated">CHANGED</span>}
                    </div>
                    <div className="tr360-chip-sub">Entry recorded · Exit recorded</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Decision Context Matrix (20 Factors) */}
          {review.decision_context_matrix && review.decision_context_matrix.length > 0 && (
            <div>
              <div className="tr360-shead font-mono">
                <span className="tr360-marker tr360-marker-purple" />
                6. 决策环境因子矩阵 (Decision Context Matrix · 20 Factors)
              </div>
              <div className="ot-table-wrapper">
                <table className="ot-table tr360-matrix font-mono">
                  <thead>
                    <tr>
                      <th className="tr360-align-left">{MATRIX_HEADER_TERMS.FACTOR.display}</th>
                      <th className="tr360-align-left">{MATRIX_HEADER_TERMS.ENTRY.display}</th>
                      <th className="tr360-align-left">{MATRIX_HEADER_TERMS.EXIT.display}</th>
                      <th className="tr360-align-center">{MATRIX_HEADER_TERMS.CHANGED.display}</th>
                      <th className="tr360-align-center">{MATRIX_HEADER_TERMS.IMPACT.display}</th>
                      <th className="tr360-align-center">{MATRIX_HEADER_TERMS.SOURCE.display}</th>
                      <th className="tr360-align-center">{MATRIX_HEADER_TERMS.CONFIDENCE.display}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.decision_context_matrix.map((r, idx) => {
                      const impactClass =
                        r.impact === 'PRIMARY' ? 'tr360-impact-primary'
                        : r.impact === 'SECONDARY' ? 'tr360-impact-secondary'
                        : r.impact === 'CONTRADICTORY' ? 'tr360-impact-contradictory'
                        : r.impact === 'DATA_UNAVAILABLE' ? 'tr360-impact-dim'
                        : 'tr360-impact-dim';
                      const formatVal = (v: unknown) => {
                        if (v === 'DATA_UNAVAILABLE') return <span className="tr360-na">暂无数据</span>;
                        if (v == null) return <span className="tr360-dash">—</span>;
                        return formatDecisionContextValue(v);
                      };
                      return (
                        <tr key={idx} className={idx % 2 === 0 ? 'tr360-row-alt' : ''}>
                          <td className="tr360-td-factor">{r.factor}</td>
                          <td className="tr360-td-val">{formatVal(r.entry)}</td>
                          <td className="tr360-td-val">{formatVal(r.exit)}</td>
                          <td className="tr360-align-center">
                            {r.change ? <span className="tr360-changed-dot">●</span> : <span className="tr360-dash-faint">—</span>}
                          </td>
                          <td className={`tr360-align-center ${impactClass}`}>{r.impact}</td>
                          <td className="tr360-align-center tr360-td-dim">{formatProvenance(r.source)}</td>
                          <td className="tr360-align-center tr360-td-dim">{r.confidence === 'DATA_UNAVAILABLE' ? '暂无数据' : (r.confidence || '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. Thesis Evolution + Drift */}
          {review.thesis_evolution && review.thesis_evolution.length > 0 && (
            <div>
              <div className="tr360-shead font-mono">
                <span className="tr360-marker tr360-marker-emerald" />
                7. 投资逻辑演变轨迹（THESIS EVOLUTION）
              </div>

              {/* The engine's answer to "事实走反之后,说法有没有变?" -- rule output only. */}
              <div className="tr360-drift-box">
                <div className="tr360-drift-head">
                  <span className="font-mono tr360-drift-q">
                    事实走反之后，说法有没有变？ — 以下仅呈现引擎按规则记录的内容
                  </span>
                  <span
                    className={`tr360-chip font-mono ${
                      DRIFT_LEVEL_STYLE[driftLevel] || DRIFT_LEVEL_STYLE.NONE
                    }`}
                  >
                    DRIFT: {driftLevel}
                  </span>
                </div>
                <div className="tr360-drift-summary">
                  {driftFindings.length > 0
                    ? `引擎命中 ${driftFindings.length} 条规则，最高等级 ${driftLevel}；共记录 ${driftRevisionCount} 个 thesis 版本。规则与证据逐条列在下方，可据此核对或反驳。`
                    : `引擎未命中任何 drift 规则（等级 ${driftLevel}）；共记录 ${driftRevisionCount} 个 thesis 版本。`}
                </div>
              </div>

              {/* Version trail: entry thesis first, then each revision with its reason. */}
              <div style={{ overflowX: 'auto' }}>
                <div className="tr360-trail">
                  {review.thesis_evolution.map((rev, idx) => {
                    const isLatest = idx === (review.thesis_evolution?.length ?? 1) - 1;
                    return (
                    <div
                      key={rev.revision_id || `${rev.game_date}-${idx}`}
                      className={`tr360-rev ${
                        rev.is_entry
                          ? 'tr360-rev-entry'
                          : isLatest
                          ? 'th-revision-card-current'
                          : 'tr360-rev-revision'
                      }`}
                    >
                      <div className="tr360-rev-head font-mono">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={rev.is_entry ? 'tr360-rev-tag tr360-rev-tag-entry' : 'tr360-rev-tag tr360-rev-tag-rev'}>
                            {rev.is_entry ? 'ENTRY THESIS' : `REVISION #${rev.revision_index}`}
                          </span>
                          {isLatest && !rev.is_entry && (
                            <span className="ot-badge th-current-badge">当前生效 CURRENT</span>
                          )}
                        </div>
                        <span className="tr360-rev-date">
                          {rev.game_date || '—'} · {nodeLabel(rev.node_index)}
                        </span>
                      </div>

                      <div className="tr360-rev-fields font-mono">
                        <div>Direction: <strong className="tr360-v">{rev.direction || '—'}</strong></div>
                        <div>Expected Move: <strong className="tr360-v">{numOr(rev.expected_move_pct, 1)}%</strong></div>
                        <div>Horizon: <strong className="tr360-v">{rev.time_horizon_days ?? '—'} 天</strong></div>
                        <div>Invalidation: <strong className="tr360-v">{numOr(rev.invalidation_level)}</strong></div>
                        <div>Underlying @ Rev: <strong className="tr360-v">{numOr(rev.underlying_at_revision)}</strong></div>
                        <div className="tr360-span1">Risk Budget: <strong className="tr360-v">${numOr(rev.risk_budget_usd)}</strong></div>
                      </div>

                      <div className="tr360-rev-line">
                        <span className="tr360-label font-mono">Catalyst: </span>
                        {rev.catalyst || '—'}
                      </div>
                      {rev.why_instrument && (
                        <div className="tr360-rev-line">
                          <span className="tr360-label font-mono">Why This Instrument: </span>
                          {rev.why_instrument}
                        </div>
                      )}
                      {!rev.is_entry && (
                        <div className="tr360-rev-line tr360-rev-line-amber">
                          <span className="tr360-label font-mono">Revision Reason: </span>
                          {rev.revision_reason || '(未填写)'}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </div>

              {/* Every finding: summary AND evidence. */}
              {driftFindings.length > 0 && (
                <div className="tr360-findings">
                  {driftFindings.map((f, idx) => (
                    <div
                      key={f.rule_id || idx}
                      className="tr360-finding th-finding"
                    >
                      <div className="tr360-finding-head font-mono">
                        <span className="tr360-finding-id">{f.rule_id}</span>
                        <span
                          className={`tr360-chip ${
                            DRIFT_LEVEL_STYLE[f.level] || DRIFT_LEVEL_STYLE.NONE
                          }`}
                        >
                          {f.level}
                        </span>
                      </div>
                      <div className="tr360-finding-sum">{f.summary}</div>
                      <div className="tr360-finding-ev">
                        <span className="tr360-label font-mono">Evidence: </span>
                        {f.evidence}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Adaptive notes sit alongside findings, not below them as a footnote. */}
              {driftAdaptiveNotes.length > 0 && (
                <div className="tr360-adaptive th-adaptive-block">
                  <div className="tr360-adaptive-title font-mono">
                    Adaptive Notes (引擎同时记录到的调整行为)
                  </div>
                  {driftAdaptiveNotes.map((n, idx) => (
                    <div key={idx} className="tr360-adaptive-line">
                      · {n}
                    </div>
                  ))}
                </div>
              )}

              {review.thesis_drift?.note && (
                <div className="tr360-drift-footnote">
                  {review.thesis_drift.note}
                </div>
              )}
            </div>
          )}

          {/* 8. Decision Timeline */}
          {review.decision_timeline && review.decision_timeline.length > 0 && (
            <div>
              <div className="tr360-shead font-mono">
                <span className="tr360-marker tr360-marker-cyan" />
                8. 决策时间线（DECISION TIMELINE）
              </div>

              <div className="tr360-tl-note">
                时间轴按市场节点排列，并被裁剪在 [{review.entry_date || '—'} , {review.exit_date || '—'}] 区间内，
                因此不包含任何当时无法得知的信息。玩家选择（PLAYER）高亮行，与其上方的情报行对照阅读。
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div className="tr360-timeline th-timeline">
                  {timelineGroups.map((group) => (
                    <div key={group.date} className="tr360-tl-group">
                      <div className="tr360-tl-datebar font-mono">
                        <span className="tr360-tl-date">{group.date || '—'}</span>
                        <span className="tr360-tl-dim">{nodeLabel(group.nodeIndex)}</span>
                        <span className="tr360-tl-faint">·</span>
                        <span className="tr360-tl-dim">{group.events.length} 条</span>
                      </div>

                      {group.events.map((ev, idx) => {
                        const isPlayer = ev.actor === 'PLAYER';
                        const isUnanswered = ev.category === 'IGNORED_WARNING';
                        const actorDisplay =
                          ev.actor === 'PLAYER' ? '玩家选择 · PLAYER'
                          : ev.actor === 'MARKET' ? '市场事件 · MARKET'
                          : ev.actor === 'CHARACTER' ? '团队成员 · CHARACTER'
                          : ev.actor === 'INSTITUTION' ? '机构动态 · INSTITUTION'
                          : ev.actor === 'POLITICAL' ? '政策环境 · POLITICAL'
                          : `${ev.actor} · SYSTEM`;

                        const categoryDisplay =
                          ev.category === 'IGNORED_WARNING' ? '未处理的重要事项（IGNORED WARNING）'
                          : ev.category;

                        return (
                          <div
                            key={ev.event_id || `${group.date}-${idx}`}
                            className={`tr360-tl-event ${
                              isPlayer
                                ? 'tr360-tl-event-player'
                                : 'tr360-tl-event-other'
                            }`}
                          >
                            <div className="tr360-tl-event-head font-mono">
                              <div className="tr360-tl-actors">
                                <span
                                  className={`tr360-actor ${
                                    TIMELINE_ACTOR_STYLE[ev.actor] || TIMELINE_ACTOR_STYLE.SYSTEM
                                  }`}
                                >
                                  {actorDisplay}
                                </span>
                                <span className={isUnanswered ? 'tr360-tl-cat-warn' : 'tr360-tl-cat'}>
                                  {categoryDisplay}
                                </span>
                              </div>
                              <span
                                className="tr360-tl-src ot-badge ot-badge-derived"
                                title={`Source: ${ev.source_type || 'DATA_UNAVAILABLE'}`}
                              >
                                {formatProvenance(ev.source_type)}
                              </span>
                            </div>

                            <div className="tr360-tl-headline">
                              {ev.headline}
                            </div>
                            {ev.detail && (
                              <div className="tr360-tl-detail">
                                {ev.detail}
                              </div>
                            )}
                            {isUnanswered && (
                              <div className="tr360-tl-unanswered">
                                持仓期间，你有1件需要回应的重要事项未处理。
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 9. Lesson */}
          {review.lesson && (
            <div className="tr360-lesson">
              <div className="tr360-lesson-title font-mono">
                9. 复盘要点（LESSON）
              </div>
              <div className="tr360-lesson-body">{review.lesson}</div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="tr360-footer modal-footer ui-modal-footer">
          <button
            onClick={() => {
              audioManager.playSfx('ui_click');
              onClose();
            }}
            className="ot-btn tr360-btn-confirm ui-btn ui-btn-primary"
          >
            确认并归档复盘报告
          </button>
        </div>
      </div>
    </div>
  );
}
