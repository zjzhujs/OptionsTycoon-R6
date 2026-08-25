import React from 'react';
import type { ThesisDriftAssessment, ThesisDriftLevel, ThesisRevision } from '../types';

export interface ThesisHistoryPanelProps {
  revisions: ThesisRevision[];
  drift?: ThesisDriftAssessment | null;
  onRevise?: () => void;
  compact?: boolean;
}

const DIRECTION_LABELS: Record<string, string> = {
  BULLISH: '做多方向 (Bullish Delta)',
  BEARISH: '做空方向 (Bearish Delta)',
  VOL_EXPANSION: '做多波动率 (Long Vega)',
  THETA_DECAY: '时间价值卖方 (Theta Decay)',
};

interface DriftStyle {
  label: string;
  color: string;
  bg: string;
  border: string;
}

// NONE grey / MINOR amber / MATERIAL orange / SEVERE red - all tokenized
const DRIFT_STYLES: Record<ThesisDriftLevel, DriftStyle> = {
  NONE: {
    label: 'NONE / 未触发规则',
    color: 'var(--thm-dim, #8fa2c2)',
    bg: 'color-mix(in srgb, var(--thm-dim, #8fa2c2) 8%, transparent)',
    border: 'color-mix(in srgb, var(--thm-dim, #8fa2c2) 28%, transparent)',
  },
  MINOR: {
    label: 'MINOR / 轻度偏移',
    color: 'var(--thm-gold, #f7c948)',
    bg: 'color-mix(in srgb, var(--thm-gold, #f7c948) 8%, transparent)',
    border: 'color-mix(in srgb, var(--thm-gold, #f7c948) 30%, transparent)',
  },
  MATERIAL: {
    label: 'MATERIAL / 实质偏移',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.09)',
    border: 'rgba(251, 146, 60, 0.32)',
  },
  SEVERE: {
    label: 'SEVERE / 重度偏移',
    color: 'var(--thm-risk, #ff5c73)',
    bg: 'color-mix(in srgb, var(--thm-risk, #ff5c73) 9%, transparent)',
    border: 'color-mix(in srgb, var(--thm-risk, #ff5c73) 34%, transparent)',
  },
};

const FALLBACK_STYLE = DRIFT_STYLES.NONE;

function driftStyle(level?: ThesisDriftLevel | null): DriftStyle {
  if (!level) return FALLBACK_STYLE;
  return DRIFT_STYLES[level] || FALLBACK_STYLE;
}

/** Numeric fields fall back to DATA_UNAVAILABLE — never to a friendlier-looking number. */
function fmtNum(value: unknown, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : 'DATA_UNAVAILABLE';
}

function fmtDays(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)} 天`
    : 'DATA_UNAVAILABLE';
}

function fmtText(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : '(未填写)';
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

type DiffKey =
  | 'direction'
  | 'catalyst'
  | 'time_horizon_days'
  | 'invalidation_level'
  | 'why_instrument';

interface DiffField {
  key: DiffKey;
  label: string;
  format: (rev: ThesisRevision) => string;
  same: (a: ThesisRevision, b: ThesisRevision) => boolean;
}

const DIFF_FIELDS: DiffField[] = [
  {
    key: 'direction',
    label: '交易方向 Direction',
    format: (r) => (r.direction ? DIRECTION_LABELS[r.direction] || fmtText(r.direction) : '(未填写)'),
    same: (a, b) => normalizeText(a.direction) === normalizeText(b.direction),
  },
  {
    key: 'catalyst',
    label: '核心催化剂 Catalyst',
    format: (r) => fmtText(r.catalyst),
    same: (a, b) => normalizeText(a.catalyst) === normalizeText(b.catalyst),
  },
  {
    key: 'time_horizon_days',
    label: '持仓周期 Horizon',
    format: (r) => fmtDays(r.time_horizon_days),
    same: (a, b) => Number(a.time_horizon_days) === Number(b.time_horizon_days),
  },
  {
    key: 'invalidation_level',
    label: '失效/止损位 Invalidation',
    format: (r) => `$${fmtNum(r.invalidation_level)}`,
    same: (a, b) => Number(a.invalidation_level) === Number(b.invalidation_level),
  },
  {
    key: 'why_instrument',
    label: '工具选择理由 Why Instrument',
    format: (r) => fmtText(r.why_instrument),
    same: (a, b) => normalizeText(a.why_instrument) === normalizeText(b.why_instrument),
  },
];

export const ThesisHistoryPanel: React.FC<ThesisHistoryPanelProps> = ({
  revisions,
  drift,
  onRevise,
  compact = false,
}) => {
  const history = Array.isArray(revisions)
    ? [...revisions]
        .filter((r) => r && typeof r === 'object')
        .sort((a, b) => (a.revision_index ?? 0) - (b.revision_index ?? 0))
    : [];

  if (history.length === 0) {
    return (
      <div className="ot-empty-state ot-ghost-card">
        <div className="ot-ghost-card-head">
          <span className="ot-badge ot-badge-derived">THESIS 演化档案 · WAITING FOR ENTRY</span>
        </div>
        <div className="ot-ghost-card-body">
          <div className="ot-ghost-field">
            <span className="ot-ghost-label">开仓论据 Entry Thesis:</span>
            <span className="ot-ghost-val">[ 开仓时自动冻结并建立版本 0 ]</span>
          </div>
          <div className="ot-ghost-field">
            <span className="ot-ghost-label">漂移检测 Drift Monitor:</span>
            <span className="ot-ghost-val">[ 持仓期间实时比对催化剂与时间衰减 ]</span>
          </div>
        </div>
        <div className="ot-ghost-footnote">
          在下单时填写 Thesis（方向 / 催化剂 / 失效位），系统将进行全生命周期因果链追踪。
        </div>
      </div>
    );
  }

  const entry = history[0];
  const laterRevisions = history.slice(1);
  const style = driftStyle(drift?.level);
  const findings = Array.isArray(drift?.findings) ? drift!.findings : [];
  const adaptiveNotes = Array.isArray(drift?.adaptive_notes) ? drift!.adaptive_notes : [];
  const bodyFont = compact ? 11 : 12;

  const renderFieldRow = (label: string, value: string, key: string) => (
    <div
      key={key}
      className="th-field-row"
      style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}
    >
      <span style={{ fontSize: 10, color: 'var(--thm-dim, var(--muted))', minWidth: 132 }}>{label}</span>
      <span style={{ fontSize: bodyFont, color: 'var(--thm-text, var(--text))', flex: 1, minWidth: 0 }}>{value}</span>
    </div>
  );

  return (
    <div className="thesis-history-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        className="th-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}
      >
        <div>
          <div className="badge-tag ot-badge ot-badge-derived">
            论据演化记录 <span className="en-secondary">THESIS HISTORY</span>
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: compact ? 13 : 14, fontWeight: 800, color: 'var(--thm-accent, var(--cyan))' }}>
            入场 Thesis 与其后的全部修订
          </h3>
          <div style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))', marginTop: 2 }}>
            共 {history.length} 条记录 · 修订 {laterRevisions.length} 次
          </div>
        </div>
        {onRevise && (
          <button
            type="button"
            className="ot-btn ot-btn-ghost th-revise-btn"
            onClick={onRevise}
            style={{
              border: '1px dashed var(--thm-accent, var(--cyan))',
              color: 'var(--thm-accent, var(--cyan))',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            UPDATE THESIS / 更新论据
          </button>
        )}
      </div>

      <div className="th-timeline">
        {/* ---- Frozen entry thesis ------------------------------------------ */}
        <div className="th-entry-card">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="ot-badge ot-badge-derived" style={{ fontWeight: 800, letterSpacing: 0.4 }}>
              🔒 ENTRY THESIS · FROZEN / 已冻结
            </span>
            <span style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))' }}>
              {fmtText(entry.game_date)} · NODE {Number.isFinite(entry.node_index) ? entry.node_index : '—'}
            </span>
          </div>

          <div className="ot-prose" style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))' }}>
            这条入场记录不可编辑、不会被后续修改覆盖。之后每一次观点变化都以新记录追加在下方。
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
            {DIFF_FIELDS.map((f) => renderFieldRow(f.label, f.format(entry), f.key))}
            {!compact && (
              <>
                {renderFieldRow('预期涨跌幅 Move', `${fmtNum(entry.expected_move_pct, 1)}%`, 'move')}
                {renderFieldRow('风险预算 Risk Budget', `$${fmtNum(entry.risk_budget_usd, 0)}`, 'risk')}
                {renderFieldRow('修订时标的价 Underlying', `$${fmtNum(entry.underlying_at_revision)}`, 'underlying')}
              </>
            )}
          </div>
        </div>

        {/* ---- Later revisions, diffed against the frozen entry -------------- */}
        {laterRevisions.map((rev, i) => {
          const changed = DIFF_FIELDS.filter((f) => !f.same(entry, rev));
          // 修订多了以后，时间线上分不出哪一条是**当前生效**的论点——
          // 这不是装饰问题，是信息问题：玩家要知道自己现在按的是哪一版判断。
          // 最后一条即当前版本（列表已按 revision_index 升序排过）。
          const isCurrent = i === laterRevisions.length - 1;
          return (
            <div
              key={rev.revision_id || `rev-${rev.revision_index ?? 0}`}
              className={`th-revision-card${isCurrent ? ' th-revision-card-current' : ''}`}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--thm-text, var(--text))' }}>
                  REVISION #{Number.isFinite(rev.revision_index) ? rev.revision_index : '—'}
                </span>
                {isCurrent && <span className="ot-badge th-current-badge">当前生效 CURRENT</span>}
                <span style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))' }}>
                  {fmtText(rev.game_date)} · NODE {Number.isFinite(rev.node_index) ? rev.node_index : '—'} · 标的 $
                  {fmtNum(rev.underlying_at_revision)}
                </span>
              </div>

              <div
                style={{
                  background: 'color-mix(in srgb, var(--thm-accent, var(--blue)) 7%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--thm-accent, var(--blue)) 22%, transparent)',
                  borderRadius: 6,
                  padding: '6px 8px',
                }}
              >
                <div style={{ fontSize: 9, color: 'var(--thm-dim, var(--muted))', fontWeight: 700, letterSpacing: 0.3 }}>
                  变更原因 / WHY DID YOUR THESIS CHANGE?
                </div>
                <div className="ot-prose" style={{ fontSize: bodyFont, color: 'var(--thm-text, var(--text))', marginTop: 2 }}>
                  {fmtText(rev.revision_reason)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 9, color: 'var(--thm-dim, var(--muted))', fontWeight: 700, letterSpacing: 0.3 }}>
                  与入场 Thesis 的差异 / DIFF VS ENTRY
                </div>
                {changed.length === 0 ? (
                  <div style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))' }}>
                    方向 / 催化剂 / 周期 / 失效位 / 工具理由 五项均与入场记录一致。
                  </div>
                ) : (
                  changed.map((f) => (
                    <div
                      key={f.key}
                      className="th-diff-row"
                      style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}
                    >
                      <span style={{ fontSize: 10, color: 'var(--thm-gold, var(--yellow))', minWidth: 132, fontWeight: 700 }}>
                        {f.label}
                      </span>
                      <span style={{ fontSize: bodyFont, color: 'var(--thm-dim, var(--muted))', textDecoration: 'line-through' }}>
                        {f.format(entry)}
                      </span>
                      <span style={{ fontSize: bodyFont, color: 'var(--thm-dim, var(--muted))' }}>→</span>
                      <span style={{ fontSize: bodyFont, color: 'var(--thm-text, var(--text))', fontWeight: 700 }}>
                        {f.format(rev)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Drift assessment ------------------------------------------------ */}
      {drift && (
        <div
          className="th-drift-block"
          style={{
            background: style.bg,
            border: `1px solid ${style.border}`,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--thm-dim, var(--muted))', fontWeight: 700, letterSpacing: 0.4 }}>
              THESIS DRIFT CHECK
            </span>
            <span
              className="ot-badge"
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: style.color,
                borderColor: style.border,
              }}
            >
              {style.label}
            </span>
            <span style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))' }}>
              触发规则 {findings.length} 条 · 修订 {Number.isFinite(drift.revision_count) ? drift.revision_count : laterRevisions.length} 次
            </span>
          </div>

          {findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {findings.map((finding, idx) => {
                const fStyle = driftStyle(finding?.level);
                return (
                  <div
                    key={`${finding?.rule_id || 'rule'}-${idx}`}
                    className="th-finding"
                    style={{
                      border: `1px solid ${fStyle.border}`,
                      borderLeft: `3px solid ${fStyle.color}`,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: fStyle.color }}>
                        {finding?.level ?? 'NONE'}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--thm-dim, var(--muted))', fontFamily: 'monospace' }}>
                        {fmtText(finding?.rule_id)}
                      </span>
                    </div>
                    <div style={{ fontSize: bodyFont, color: 'var(--thm-text, var(--text))', fontWeight: 700, marginTop: 2 }}>
                      {fmtText(finding?.summary)}
                    </div>
                    <div className="ot-prose" style={{ fontSize: 11, color: 'var(--thm-muted, var(--muted))', marginTop: 3 }}>
                      <span style={{ color: fStyle.color, fontWeight: 700 }}>依据 EVIDENCE: </span>
                      {fmtText(finding?.evidence)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {findings.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--thm-muted, var(--muted))' }}>
              当前没有规则被触发。
            </div>
          )}

          {adaptiveNotes.length > 0 && (
            <div className="th-adaptive-block">
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--thm-good, var(--green))', letterSpacing: 0.3 }}>
                ADAPTIVE REVISIONS / 合理的观点更新
              </div>
              <div className="ot-prose" style={{ fontSize: 10, color: 'var(--thm-muted, var(--muted))', marginTop: 2 }}>
                以下修订发生在原失效条件尚未触发时，并写明了原因。根据新信息更新看法本身是正常的交易行为。
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {adaptiveNotes.map((note, idx) => (
                  <li key={`adaptive-${idx}`} className="ot-prose" style={{ fontSize: 11, color: 'var(--thm-good, #a7f3d0)' }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {drift.note && (
            <div
              className="th-drift-note ot-prose"
              style={{
                fontSize: 10,
                color: 'var(--thm-dim, var(--muted))',
                borderTop: '1px solid var(--thm-line, var(--line))',
                paddingTop: 6,
              }}
            >
              {drift.note}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
