import React from 'react';
import type { CounterpartyProfile, FlowSummary, PositioningSummary, SourceType } from '../types';
import { formatProvenance } from '../lib/financialLanguage';

export interface FlowPositioningDeskPanelProps {
  flow?: FlowSummary;
  positioning?: PositioningSummary;
  counterparty?: CounterpartyProfile;
}

const PARTICIPANT_LABELS: Record<string, string> = {
  MARKET_MAKER: '做市商 Market Maker',
  LONG_ONLY: '长线机构 Long-Only',
  HEDGE_FUND: '对冲基金 Hedge Fund',
  MACRO_FUND: '宏观基金 Macro Fund',
  VOLATILITY_FUND: '波动率基金 Vol Fund',
  CTA_MOMENTUM: 'CTA 趋势跟踪',
  RISK_PARITY: '风险平价 Risk Parity',
  VOL_CONTROL: '波动率控制 Vol-Control',
  INDEX_ETF: '指数 ETF',
  SHORT_SELLER: '做空机构 Short Seller',
  RETAIL_0DTE: '散户 0DTE',
};

/**
 * Per-field provenance tag. Uses OT semantic badges.
 * A missing source falls back to DATA_UNAVAILABLE, never to a rosier value, and the
 * tooltip states how THIS field was produced.
 */
function SourceTag({ source, note }: { source?: SourceType | string; note: string }): JSX.Element {
  const s = (source as string) || 'DATA_UNAVAILABLE';
  const badgeClass =
    s.startsWith('REAL') ? 'ot-badge-real'
    : s.startsWith('DERIVED_REAL') ? 'ot-badge-derived'
    : s.startsWith('DERIVED') ? 'ot-badge-derived'
    : s === 'ESTIMATED' ? 'ot-badge-estimated'
    : s === 'SIMULATED' ? 'ot-badge-simulated'
    : 'ot-badge-unavailable';

  return (
    <span
      className={`ot-badge ${badgeClass} msb-src font-mono`}
      title={`${formatProvenance(s)} · ${note}`}
    >
      {formatProvenance(s)}
    </span>
  );
}

const NA = '—';

function n0(v?: number | null): string {
  return v == null || Number.isNaN(v) ? NA : v.toLocaleString();
}

function nf(v: number | null | undefined, digits: number): string {
  return v == null || Number.isNaN(v) ? NA : v.toFixed(digits);
}

function txt(v?: string | null): string {
  return v && v.length > 0 ? v : NA;
}

function signed0(v?: number | null): string {
  if (v == null || Number.isNaN(v)) return NA;
  return `${v >= 0 ? '+' : ''}${Math.round(v).toLocaleString()}`;
}

// Severity tint for the trapped-risk tiles.
function riskColor(risk: string): string {
  if (risk === 'EXTREME') return 'fpd-risk-extreme';
  if (risk === 'HIGH') return 'fpd-risk-high';
  if (risk === 'MODERATE') return 'fpd-risk-moderate';
  return 'fpd-risk-base';
}

export function FlowPositioningDeskPanel({ flow, positioning, counterparty }: FlowPositioningDeskPanelProps): JSX.Element {
  if (!flow || !positioning || !counterparty) {
    return (
      <div className="fpd-loading ot-empty-state">
        正在采集期权流与持仓拥挤度数据...
      </div>
    );
  }

  // flow.py has exactly two branches; the real-quote branch is unreachable in this build
  // (OptionQuote.volume is never assigned), so call/put volume, the ratio and rel-vol all
  // come out of the same synthesized branch. Tag them with that branch's own field tag
  // rather than one blanket header line.
  const synthVolSrc = flow.put_call_ratio_source_type;
  // sweep count / volume shock are authored literals picked by matching the date string;
  // block activity is a threshold on that literal, so it inherits the literal's tag.
  const literalFlowSrc = flow.large_sweep_count_source_type;
  // positioning.py returns one date-selected literal block: every field below shares that
  // single origin, so the summary tag is the accurate per-field tag here.
  const posSrc = positioning.source_type;
  // counterparty.py maps a VIX bucket to participant labels; same single origin.
  const cpSrc = counterparty.source_type;
  const participants = counterparty.potential_participants ?? [];

  return (
    <div className="fpd-desk">
      <div className="fpd-head">
        <h2 className="fpd-heading">
          {/* Static dot: a pulsing one would read as a live/running clock. */}
          <span className="fpd-dot" />
          FLOW & POSITIONING DESK
        </h2>
        <p className="fpd-sub">
          WHO MAY BE ON THE OTHER SIDE? · WHAT DOES THE MODEL READ IN FLOW? · WHO MAY BE CROWDED OR TRAPPED?
        </p>
        <p className="fpd-fineprint">
          指标单独立项标注。悬停查看生成路径。均为模型读数与情景常量，不作方向指示，不可归因于特定机构。
        </p>
        {/* V29-UI-A defect #5: permanent honesty boundary statement */}
        <div className="v28-data-boundary-note" data-testid="flow-desk-honesty">
          <strong>本屏幕无真实期权成交数据。</strong>
          未采集历史期权链报价、合约级成交回报 (time & sales) 及未平仓量序列。底层全为 <span className="font-mono">DATA_UNAVAILABLE</span>。上面的 Call/Put 成交量、
          P/C 比值、OI 变化与 Sweep 计数均为基于现货成交量推导的模型读数或固定情景常量，
          已逐字段标为 DERIVED / SIMULATED。
          <div style={{ marginTop: 4 }}>
            全局离线，无网络请求。游戏内订阅仅扩充本地可用字段的展示维度，
            <strong>绝不会</strong>凭空捏造未采集的原始成交记录。
          </div>
        </div>
      </div>

      {/* Options Flow */}
      <div>
        <div className="fpd-section-label font-mono">Options Flow</div>
        <div className="fpd-grid font-mono">
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Call / Put Volume</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-up">{n0(flow.call_volume)}</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-down">{n0(flow.put_volume)}</div>
            <SourceTag
              source={synthVolSrc}
              note="本构建的期权报价不含成交量字段，两个数值由标的成交量×情景系数合成，非真实成交统计。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            {/* Chain-wide ratio: it carries no retail-vs-institutional attribution. */}
            <div className="fpd-cell-label ot-metric-label">Put/Call Ratio (chain-wide)</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-lg">{nf(flow.put_call_ratio, 2)}</div>
            <SourceTag
              source={flow.put_call_ratio_source_type}
              note="全链比值，不区分散户/机构；分子分母都是上面那组合成成交量。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Relative Options Vol</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-lg">
              {flow.relative_options_vol == null ? NA : `${nf(flow.relative_options_vol, 2)}x`}
            </div>
            <SourceTag
              source={flow.relative_options_vol_source_type}
              note="合成成交量与标的成交量基线之比，是模型活跃度读数，不是真实成交比值。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">OI Change</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-lg">{signed0(flow.open_interest_change)}</div>
            {/* No开仓量 feed exists. This is a fabricated figure (fixed fraction of the
                synthesized volume above), so it is tagged SIMULATED -- never
                DATA_UNAVAILABLE, which would claim we show nothing. */}
            <SourceTag
              source={flow.open_interest_change_source_type}
              note="本构建没有未平仓量数据源；数值是合成成交量的固定比例，属情景构造值，不是观测到的 OI 变化。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Block / Sweep Activity</div>
            <div className="fpd-cell-val ot-metric-value">{txt(flow.block_trade_activity)}</div>
            <div className="fpd-cell-label ot-metric-label">Sweep count (情景常量): {n0(flow.large_sweep_count)}</div>
            <SourceTag
              source={literalFlowSrc}
              note="该 sweep 数字是按日期选取的写定常量，不统计任何成交回报；活跃度档位只是它的阈值映射。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Volume Shock (情景开关)</div>
            <div className={flow.volume_shock_detected ? 'fpd-cell-val ot-metric-value fpd-cell-val-down' : 'fpd-cell-val ot-metric-value fpd-cell-val-off'}>
              {flow.volume_shock_detected ? 'FLAGGED' : 'None'}
            </div>
            <SourceTag
              source={flow.volume_shock_source_type}
              note="写定的布尔情景开关，没有任何成交量异常检测过程，不代表当日出现过成交量异常。"
            />
          </div>
          <div className="fpd-cell fpd-span2 ot-metric">
            <div className="fpd-cell-label ot-metric-label">ETF Flow Estimate</div>
            <div className={(flow.etf_flow_estimate_usd ?? 0) >= 0 ? 'fpd-cell-val ot-metric-value fpd-cell-val-up' : 'fpd-cell-val ot-metric-value fpd-cell-val-down'}>
              {flow.etf_flow_estimate_usd == null
                ? NA
                : `${flow.etf_flow_estimate_usd >= 0 ? '+' : ''}$${Math.round(flow.etf_flow_estimate_usd).toLocaleString()}`}
            </div>
            <SourceTag
              source={flow.etf_flow_source_type}
              note="由标的成交量相对固定基线的差额推出的代理值；本构建没有 ETF 申赎数据源，不代表实际资金进出。"
            />
          </div>
        </div>
      </div>

      {/* Positioning */}
      <div>
        <div className="fpd-section-label font-mono">Positioning</div>
        <div className="fpd-grid font-mono">
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Crowding Score</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-lg">{nf(positioning.crowdedness_score, 0)} / 100</div>
            <SourceTag
              source={positioning.crowdedness_source_type}
              note="情景常量，按历史窗口日期选取；本构建无真实持仓拥挤度数据源。"
            />
          </div>
          <div className={`fpd-risk ot-metric ${riskColor(positioning.trapped_long_risk || '')}`}>
            <div className="fpd-risk-label ot-metric-label">Potential Trapped Long</div>
            <div className="fpd-risk-val ot-metric-value">{txt(positioning.trapped_long_risk)}</div>
            <SourceTag
              source={positioning.trapped_risk_source_type}
              note="情景常量推导的可能性描述，不是已确认的被套仓位。"
            />
          </div>
          <div className={`fpd-risk ot-metric ${riskColor(positioning.trapped_short_risk || '')}`}>
            <div className="fpd-risk-label ot-metric-label">Potential Trapped Short</div>
            <div className="fpd-risk-val ot-metric-value">{txt(positioning.trapped_short_risk)}</div>
            <SourceTag
              source={positioning.trapped_risk_source_type}
              note="情景常量推导的可能性描述，不是已确认的被套仓位。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Short Interest (est.)</div>
            <div className="fpd-cell-val ot-metric-value fpd-cell-val-lg">
              {positioning.short_interest_pct == null ? NA : `${nf(positioning.short_interest_pct, 1)}%`}
            </div>
            <SourceTag
              source={posSrc}
              note="按日期选取的情景常量，不是交易所或券商披露的空头持仓数据。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Possible CTA / Vol-Control Flow</div>
            <div className="fpd-cell-val ot-metric-value">{txt(positioning.cta_exposure_regime)}</div>
            <SourceTag
              source={posSrc}
              note="情景常量标签；本构建没有系统性策略持仓数据源，不代表这些策略的实际仓位或动作。"
            />
          </div>
          <div className="fpd-cell ot-metric">
            <div className="fpd-cell-label ot-metric-label">Pain Trade Direction</div>
            <div className="fpd-cell-val ot-metric-value">{txt(positioning.pain_trade_direction)}</div>
            <SourceTag
              source={posSrc}
              note="情景常量给出的假设方向，用于讨论，不是预测，也不构成交易建议。"
            />
          </div>
          <div className="fpd-cell fpd-span2 ot-metric">
            <div className="fpd-cell-label ot-metric-label">Regime</div>
            <div className="fpd-cell-val ot-metric-value">{txt(positioning.regime_label)}</div>
            <SourceTag
              source={posSrc}
              note="按日期选取的情景标签，用于叙事分段，不是统计分类结果。"
            />
          </div>
        </div>
      </div>

      {/* Counterparty */}
      <div>
        <div className="fpd-section-label font-mono">Counterparty</div>
        <div className="fpd-cp-card font-mono">
          <div>
            <span className="fpd-cp-key">Dominant — POTENTIAL PARTICIPANT TYPE</span>
            <div className="fpd-cp-name">
              {PARTICIPANT_LABELS[counterparty.dominant_participant] ?? txt(counterparty.dominant_participant)}
            </div>
            <SourceTag
              source={cpSrc}
              note="由波动率区间映射出的参与者类型假设，不是已知的成交对手方身份，也无法排除其他类型。"
            />
          </div>
          {participants.length > 0 && (
            <div>
              <span className="fpd-cp-key">Other Potential Participants</span>
              <div className="fpd-chips">
                {participants.map((p) => (
                  <span key={p} className="fpd-chip ot-badge ot-badge-derived">
                    {PARTICIPANT_LABELS[p] ?? p}
                  </span>
                ))}
              </div>
              <SourceTag
                source={cpSrc}
                note="同一波动率区间映射出的候选类型清单，是可能性列举，不代表这些机构当日有过成交。"
              />
            </div>
          )}
          <div className="fpd-cp-grid">
            <div className="ot-metric">
              {/* Renamed: the value is a volatility-regime proxy and must not read as an
                  observed dealer position. */}
              <div className="fpd-cell-label ot-metric-label">Dealer Gamma Proxy</div>
              <div className="fpd-cp-val ot-metric-value">{txt(counterparty.dealer_inventory_bias)}</div>
              <SourceTag
                source={counterparty.dealer_inventory_bias_source_type}
                note={
                  counterparty.dealer_inventory_note ||
                  '由波动率区间推导的代理指标，不是做市商实际库存。'
                }
              />
            </div>
            <div className="ot-metric">
              <div className="fpd-cell-label ot-metric-label">Signed Dealer Inventory</div>
              <div className="fpd-cp-val ot-metric-value fpd-na">N/A</div>
              <SourceTag
                source={counterparty.dealer_inventory_signed_source_type}
                note="没有 signed dealer inventory 数据源，因此不给出该数值，也不用左侧代理指标冒充。"
              />
            </div>
            <div className="ot-metric">
              <div className="fpd-cell-label ot-metric-label">Est. Retail / Institutional Share</div>
              <div className="fpd-cp-val ot-metric-value">
                {positionShare(counterparty.estimated_retail_share_pct, counterparty.estimated_institutional_share_pct)}
              </div>
              <SourceTag
                source={counterparty.participant_share_source_type}
                note="情景常量；本构建没有参与者归属数据源，这两个比例不代表实际成交归属。"
              />
            </div>
            <div className="ot-metric">
              <div className="fpd-cell-label ot-metric-label">Flow Predominance</div>
              <div className="fpd-cp-val ot-metric-value">{txt(counterparty.flow_predominance)}</div>
              <SourceTag
                source={cpSrc}
                note="由波动率区间映射出的流向标签，不是已观测到的成交行为统计。"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function positionShare(retail?: number | null, institutional?: number | null): string {
  if (retail == null && institutional == null) return NA;
  return `${nf(retail, 0)}% / ${nf(institutional, 0)}%`;
}
