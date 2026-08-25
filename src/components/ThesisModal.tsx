import React, { useState } from 'react';
import type { ThesisRequest } from '../types';

/**
 * Submitted payload. `revision_reason` is only populated in mode="revise";
 * a handler typed `(t: ThesisRequest) => void` stays assignable, so existing
 * call sites need no change.
 */
export interface ThesisSubmitPayload extends ThesisRequest {
  revision_reason?: string;
}

interface Props {
  contractOrSymbol: string;
  defaultPrice: number;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (thesis: ThesisSubmitPayload) => void;
  /** 'create' (default) = original behaviour. 'revise' requires a change reason. */
  mode?: 'create' | 'revise';
  /** Beginner mode: only direction / catalyst / invalidation, with preset templates. */
  simplified?: boolean;
  /** Seed values (used by 'revise' to pre-fill the live thesis). Optional. */
  initial?: Partial<ThesisRequest> | null;
}

const DEFAULT_CATALYST = '财报/事件预期差驱动';
const DEFAULT_WHY_INSTRUMENT = '利用高凸性与非对称盈亏比博取催化剂爆发';
const DEFAULT_EXPECTED_MOVE_PCT = 5.0;
const DEFAULT_HORIZON_DAYS = 5;
const DEFAULT_RISK_BUDGET_USD = 1500;

const CATALYST_PRESETS: string[] = [
  '财报公布：业绩或指引可能与市场预期存在差异',
  '宏观数据：CPI / 就业 / FOMC 前后的预期重定价',
  '行业事件：新品发布、产能或供应链数据更新',
  '波动率事件：事件前后隐含波动率可能扩张或收缩',
];

// 失效位在"标的价格"量纲上，且必须分方向：做多=跌破失效（价位在下方），
// 做空=涨破失效（价位在上方）。之前统一给下方价位，BEARISH 的默认失效位
// 反而是它的止盈目标，开仓即触发 THESIS INVALIDATION（实机复现 2026-08-21）。
function invalidationPresets(direction: string): { label: string; ratio: number }[] {
  if (direction === 'BEARISH') {
    return [
      { label: '+5% 触发失效', ratio: 1.05 },
      { label: '+8% 触发失效', ratio: 1.08 },
      { label: '+12% 触发失效', ratio: 1.12 },
    ];
  }
  return [
    { label: '−5% 触发失效', ratio: 0.95 },
    { label: '−8% 触发失效', ratio: 0.92 },
    { label: '−12% 触发失效', ratio: 0.88 },
  ];
}

function defaultInvalidation(direction: string, basePrice: number): number {
  return roundTo2(basePrice * (direction === 'BEARISH' ? 1.07 : 0.93));
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const ThesisModal: React.FC<Props> = ({
  contractOrSymbol,
  defaultPrice,
  isOpen,
  onClose,
  onSubmit,
  mode = 'create',
  simplified = false,
  initial = null,
}) => {
  const isRevise = mode === 'revise';
  const seedDirection = initial?.direction ?? 'BULLISH';
  const seedInvalidation =
    typeof initial?.invalidation_level === 'number' && Number.isFinite(initial.invalidation_level)
      ? initial.invalidation_level
      : defaultInvalidation(seedDirection, Number.isFinite(defaultPrice) ? defaultPrice : 0);

  // NOTE: every hook must stay ABOVE the `if (!isOpen) return null` below.
  // The previous version returned early before these useState calls, which changes
  // the hook count between renders as soon as isOpen flips.
  const [direction, setDirection] = useState(initial?.direction ?? 'BULLISH');
  const [catalyst, setCatalyst] = useState(initial?.catalyst ?? DEFAULT_CATALYST);
  const [expectedMovePct, setExpectedMovePct] = useState(
    initial?.expected_move_pct ?? DEFAULT_EXPECTED_MOVE_PCT
  );
  const [timeHorizonDays, setTimeHorizonDays] = useState(
    initial?.time_horizon_days ?? DEFAULT_HORIZON_DAYS
  );
  const [invalidationLevel, setInvalidationLevel] = useState(seedInvalidation);
  const [whyInstrument, setWhyInstrument] = useState(
    initial?.why_instrument ?? DEFAULT_WHY_INSTRUMENT
  );
  const [riskBudgetUsd, setRiskBudgetUsd] = useState(
    initial?.risk_budget_usd ?? DEFAULT_RISK_BUDGET_USD
  );
  const [revisionReason, setRevisionReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);

  // Re-seed the form each time the modal transitions closed -> open. This is a
  // render-phase state adjustment (the React-documented pattern), not an effect,
  // so there is no flash of stale values and no timer of any kind involved.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setDirection(initial?.direction ?? 'BULLISH');
      setCatalyst(initial?.catalyst ?? DEFAULT_CATALYST);
      setExpectedMovePct(initial?.expected_move_pct ?? DEFAULT_EXPECTED_MOVE_PCT);
      setTimeHorizonDays(initial?.time_horizon_days ?? DEFAULT_HORIZON_DAYS);
      setInvalidationLevel(seedInvalidation);
      setWhyInstrument(initial?.why_instrument ?? DEFAULT_WHY_INSTRUMENT);
      setRiskBudgetUsd(initial?.risk_budget_usd ?? DEFAULT_RISK_BUDGET_USD);
      setRevisionReason('');
      setReasonError(false);
    }
  }

  if (!isOpen) return null;

  const basePrice = Number.isFinite(defaultPrice) ? defaultPrice : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRevise && !revisionReason.trim()) {
      setReasonError(true);
      return;
    }
    const payload: ThesisSubmitPayload = {
      contract_or_symbol: contractOrSymbol,
      direction,
      catalyst,
      expected_move_pct: Number(expectedMovePct),
      time_horizon_days: Number(timeHorizonDays),
      invalidation_level: Number(invalidationLevel),
      why_instrument: whyInstrument,
      risk_budget_usd: Number(riskBudgetUsd),
    };
    if (isRevise) {
      payload.revision_reason = revisionReason.trim();
    }
    onSubmit(payload);
    onClose();
  };

  const presetChipStyle: React.CSSProperties = {
    background: 'var(--thm-role-card-bg, rgba(16, 27, 46, 0.9))',
    border: '1px solid var(--thm-line, var(--line))',
    color: 'var(--thm-muted, var(--muted))',
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'left',
    minHeight: 30,
  };

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="modal-content thesis-modal ui-modal ui-surface ui-l3" data-testid="thesis-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag ot-badge ot-badge-derived">
              {isRevise ? '交易纪律 / 投资逻辑修订（THESIS REVISION）' : '交易纪律 / 入场投资逻辑（ENTRY THESIS）'}
            </div>
            <h2 className="ui-title" data-level="1">{isRevise ? '修订投资逻辑 (Thesis Revision)' : '开仓投资逻辑 (Entry Thesis)'}</h2>
            <div className="text-dim text-sm" style={{ color: 'var(--thm-muted, var(--muted))' }}>
              标的/合约：{contractOrSymbol || '—'}
            </div>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <form id="thesis-form" onSubmit={handleSubmit} className="thesis-form modal-body ui-modal-body">
          {isRevise && (
            <div
              className="thesis-revise-banner ot-prose"
              style={{
                background: 'color-mix(in srgb, var(--thm-accent, var(--cyan)) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--thm-accent, var(--cyan)) 28%, transparent)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                lineHeight: 1.55,
                color: 'var(--thm-text, #bae6fd)',
              }}
            >
              🔒 <strong>入场 Thesis 已冻结</strong>，此次修改不会覆盖它。新内容将作为修订追加至 Thesis 历史，并触发 Thesis Drift 检查。Drift 只是一个可反驳的标记，并非定论。
            </div>
          )}

          {simplified && (
            <div
              className="thesis-simplified-banner ot-prose"
              style={{
                background: 'color-mix(in srgb, var(--thm-accent, var(--blue)) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--thm-accent, var(--blue)) 25%, transparent)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 11,
                lineHeight: 1.55,
                color: 'var(--thm-text, #bfdbfe)',
              }}
            >
              <strong>新手模式 (BEGINNER)</strong>：只填三项：方向、催化剂、失效条件。其余填入保守默认值，可随时在完整表单修改。好流程不保证单笔盈利，但保证每笔交易皆可复盘。
            </div>
          )}

          <div className="form-group">
            <label>1. 核心交易方向（DIRECTION）</label>
            <select
              value={direction}
              onChange={(e) => {
                const next = e.target.value;
                // 用户没手改过失效位（仍等于旧方向的默认值）时，跟着方向翻到正确一侧。
                if (invalidationLevel === defaultInvalidation(direction, basePrice)) {
                  setInvalidationLevel(defaultInvalidation(next, basePrice));
                }
                setDirection(next);
              }}
              className="select-input"
            >
              <option value="BULLISH">看涨（BULLISH）</option>
              <option value="BEARISH">看跌（BEARISH）</option>
              <option value="VOL_EXPANSION">波动率扩张（VOLATILITY EXPANSION）</option>
              <option value="THETA_DECAY">时间价值损耗（THETA DECAY）</option>
            </select>
          </div>

          <div className="form-group">
            <label>2. 核心催化剂 (Primary Catalyst)</label>
            {simplified && (
              <div
                className="thesis-preset-row"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}
              >
                {CATALYST_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="thesis-preset-chip ui-btn"
                    data-variant="compact"
                    style={{
                      ...presetChipStyle,
                      color: catalyst === preset ? 'var(--thm-accent, var(--cyan))' : 'var(--thm-muted, var(--muted))',
                      borderColor: catalyst === preset ? 'var(--thm-accent, var(--cyan))' : 'var(--thm-line, var(--line))',
                    }}
                    onClick={() => setCatalyst(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              value={catalyst}
              onChange={(e) => setCatalyst(e.target.value)}
              className="text-input"
              placeholder="例如：财报业绩超预期、FOMC降息预期发酵、算力效率突破"
              required
            />
          </div>

          {!simplified && (
            <div className="form-row">
              <div className="form-group flex-1">
                <label>3. 预期标的涨跌幅 (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={expectedMovePct}
                  onChange={(e) => setExpectedMovePct(Number(e.target.value))}
                  className="text-input"
                  required
                />
              </div>
              <div className="form-group flex-1">
                <label>4. 预期持仓周期 (天)</label>
                <input
                  type="number"
                  value={timeHorizonDays}
                  onChange={(e) => setTimeHorizonDays(Number(e.target.value))}
                  className="text-input"
                  required
                />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label>{simplified ? '3. 假设失效/止损价位（标的价 $）' : '5. 假设失效/止损价位（标的价 $）'}</label>
              {simplified && (
                <div
                  className="thesis-preset-row"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}
                >
                  {invalidationPresets(direction).map((preset) => {
                    const level = roundTo2(basePrice * preset.ratio);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className="thesis-preset-chip ui-btn"
                        data-variant="compact"
                        style={{
                          ...presetChipStyle,
                          color: invalidationLevel === level ? 'var(--thm-accent, var(--cyan))' : 'var(--thm-muted, var(--muted))',
                          borderColor: invalidationLevel === level ? 'var(--thm-accent, var(--cyan))' : 'var(--thm-line, var(--line))',
                        }}
                        onClick={() => setInvalidationLevel(level)}
                      >
                        {preset.label} · ${level.toFixed(2)}
                      </button>
                    );
                  })}
                </div>
              )}
              <input
                type="number"
                step="0.1"
                value={invalidationLevel}
                onChange={(e) => setInvalidationLevel(Number(e.target.value))}
                className="text-input"
                required
              />
            </div>
            {!simplified && (
              <div className="form-group flex-1">
                <label>6. 单笔最大风险预算 ($)</label>
                <input
                  type="number"
                  value={riskBudgetUsd}
                  onChange={(e) => setRiskBudgetUsd(Number(e.target.value))}
                  className="text-input"
                  required
                />
              </div>
            )}
          </div>

          {!simplified && (
            <div className="form-group">
              <label>7. 工具选择理由 (Why This Instrument)</label>
              <textarea
                value={whyInstrument}
                onChange={(e) => setWhyInstrument(e.target.value)}
                className="text-area"
                rows={2}
                required
              />
            </div>
          )}

          {simplified && (
            <div
              className="thesis-defaults-note ot-prose"
              style={{
                fontSize: 10,
                color: 'var(--thm-muted, var(--muted))',
                lineHeight: 1.55,
                border: '1px solid var(--thm-line, var(--line))',
                borderRadius: 8,
                padding: '6px 8px',
              }}
            >
              已代填的默认值（可在完整表单修改）：预期涨跌幅 {Number(expectedMovePct)}% · 持仓周期{' '}
              {Number(timeHorizonDays)} 天 · 风险预算 ${Number(riskBudgetUsd)} · 工具理由「{whyInstrument}」。
            </div>
          )}

          {isRevise && (
            <div className="form-group">
              <label>变更原因 (必填) <span className="en-secondary">WHY DID YOUR THESIS CHANGE?</span></label>
              <textarea
                value={revisionReason}
                onChange={(e) => {
                  setRevisionReason(e.target.value);
                  if (reasonError) setReasonError(false);
                }}
                className="text-area"
                rows={3}
                placeholder="出现了什么新信息？为何改变原有判断？(将连同入场记录并入复盘)"
                required
                style={reasonError ? { borderColor: 'var(--thm-risk, var(--red))' } : undefined}
              />
              {reasonError && (
                <div style={{ fontSize: 11, color: 'var(--thm-risk, var(--red))', marginTop: 2 }}>
                  必须填写变更原因后才能记录本次修订。
                </div>
              )}
            </div>
          )}

          <div className="discipline-note ot-prose">
            💡 <strong>职业交易员准则</strong>：
            {isRevise
              ? '入场 Thesis 与每次修订都会被记录。平仓时按流程评分 (Process Score)，独立于最终盈亏。'
              : '绑定 Thesis 的交易，平仓时会自动进行多维度复盘与流程评分 (Process Score)。评分独立于盈亏金额。'}
          </div>

        </form>

        <div className="modal-footer ui-modal-footer">
            <button type="button" className="ot-btn ot-btn-ghost ui-btn" data-variant="row" onClick={onClose}>
              取消
            </button>
            <button type="submit" form="thesis-form" className="ot-btn ui-btn ui-btn-primary" data-testid="submit-thesis-btn">
              {isRevise ? '记录本次修订 (Record Revision)' : '确认并绑定开仓 (Confirm & Attach)'}
            </button>
          </div>
      </div>
    </div>
  );
};
