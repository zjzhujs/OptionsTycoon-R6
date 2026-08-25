import React from 'react';
import type { FundamentalField, FundamentalsSnapshot } from '../engine/engines/fundamentals';
import { RATING_TEXT } from '../engine/engines/analyst_simulation';
import { formatProvenance } from '../lib/financialLanguage';

export interface StockFundamentalsPanelProps {
  snapshot: FundamentalsSnapshot;
}

/**
 * V29-UI-B — the finance-site-style summary that sits under the K-line chart.
 *
 * The layout is deliberately built to hold the FULL set of fields a finance site shows, even
 * though most of them have no local source yet. An empty cell renders `DATA_UNAVAILABLE`
 * together with the specific reason from the engine, so the player learns which pack is
 * missing instead of assuming the game failed to load. Nothing here estimates or back-fills.
 */

function fmtNum(v: number | null, digits = 2, prefix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return prefix + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Cell({
  label,
  field,
  format,
  hint,
  unit,
}: {
  label: string;
  field: FundamentalField<number | string>;
  format?: (v: number) => string;
  hint?: string;
  /** What sample_size counts for THIS field. Bars for technicals, quarters for valuation. */
  unit?: string;
}): JSX.Element {
  const v = field.value;
  const available = v != null;
  const shown =
    v == null
      ? 'DATA_UNAVAILABLE'
      : typeof v === 'string'
        ? v
        : format
          ? format(v)
          : fmtNum(v);

  return (
    <div className="sfp-cell ot-metric">
      <div className="sfp-cell-label ot-metric-label">
        {label}
        {hint && <span className="sfp-cell-hint"> {hint}</span>}
      </div>
      <div className={`sfp-cell-val font-mono ot-metric-value ${available ? '' : 'sfp-cell-val-na'}`}>{shown}</div>
      {/* The source tag is redundant when the value cell already reads DATA_UNAVAILABLE. */}
      {available && (
        <div className="sfp-cell-src">
          <span
            className={`sfp-src-tag ot-badge ${String(field.source_type).toLowerCase()}`}
            title={formatProvenance(field.source_type)}
          >
            {formatProvenance(field.source_type)}
          </span>
          {field.sample_size != null && unit && (
            <span className="sfp-cell-sample">· {field.sample_size} {unit}</span>
          )}
        </div>
      )}
      {!available && field.unavailable_reason && (
        <div className="sfp-cell-reason">{field.unavailable_reason}</div>
      )}
    </div>
  );
}

export function StockFundamentalsPanel({ snapshot }: StockFundamentalsPanelProps): JSX.Element {
  const { technical: t, profile, valuation } = snapshot;

  // Position marker only renders when the band actually exists; a bar with no band would be
  // a fake precision cue.
  const pos = t.week52_position_pct.value;

  return (
    <div className="panel sfp-panel" data-testid="stock-fundamentals-panel">
      <div className="title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          {snapshot.ticker} 标的概况 <span className="en-secondary">FUNDAMENTALS &amp; TECHNICALS</span>
        </span>
        <span className="badge-tag ot-badge derived">截至 {t.as_of_date}</span>
      </div>

      {/* Technical block — the only block with real local inputs today. */}
      <div className="sfp-section-label font-mono">技术面 · TECHNICALS</div>
      <div className="sfp-grid">
        <Cell label="最新收盘" unit="根日线" field={t.last_close} format={(v) => fmtNum(v, 2, '$')} />
        <Cell
          label="日涨跌幅"
          unit="根日线"
          field={t.change_pct}
          format={(v) => `${v >= 0 ? '+' : ''}${fmtNum(v, 2)}%`}
        />
        <Cell label="52 周最高" unit="根日线" field={t.week52_high} format={(v) => fmtNum(v, 2, '$')} />
        <Cell label="52 周最低" unit="根日线" field={t.week52_low} format={(v) => fmtNum(v, 2, '$')} />
        <Cell label="20 日均线" unit="根日线" field={t.ma20} format={(v) => fmtNum(v, 2, '$')} />
        <Cell label="50 日均线" unit="根日线" field={t.ma50} format={(v) => fmtNum(v, 2, '$')} />
        <Cell label="200 日均线" unit="根日线" field={t.ma200} format={(v) => fmtNum(v, 2, '$')} />
        <Cell label="52 周区间位置" unit="根日线" field={t.week52_position_pct} format={(v) => `${fmtNum(v, 1)}%`} />
      </div>

      {pos != null && t.week52_low.value != null && t.week52_high.value != null && (
        <div className="sfp-range">
          <span className="sfp-range-end font-mono">{fmtNum(t.week52_low.value, 2, '$')}</span>
          <div className="sfp-range-track">
            <div className="sfp-range-marker" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} />
          </div>
          <span className="sfp-range-end font-mono">{fmtNum(t.week52_high.value, 2, '$')}</span>
        </div>
      )}

      {/* Valuation — no local pack yet; laid out in full so the gap is legible. */}
      <div className="sfp-section-label font-mono">估值 · VALUATION</div>
      <div className="sfp-grid">
        <Cell label="市盈率 P/E" unit="个季度" field={valuation.pe_ratio} hint="(TTM)" />
        <Cell label="每股收益 EPS (TTM)" unit="个季度" field={valuation.eps_ttm} />
        <Cell label="分析师评级" field={valuation.analyst_rating} />
      </div>

      {/* 模拟卖方共识。视觉上刻意与真实数据区分：琥珀色边框 + 显式说明，
          玩家不该把它和上面的 REAL / REAL_PRIMARY 字段混为一谈。 */}
      {snapshot.analyst && (
        <div className="sfp-analyst" data-testid="sfp-analyst">
          <div className="sfp-analyst-head">
            <span className="sfp-src-tag ot-badge simulated" title={formatProvenance('SIMULATED')}>{formatProvenance('SIMULATED')}</span>
            <strong>卖方共识（游戏模拟，非真实评级）</strong>
          </div>
          <div className="sfp-analyst-grid font-mono">
            <span>
              共识 <b>{RATING_TEXT[snapshot.analyst.consensus_label]}</b>{' '}
              {snapshot.analyst.consensus_score.toFixed(2)}
            </span>
            <span>覆盖 {snapshot.analyst.analyst_count} 家</span>
            <span>
              目标价 {fmtNum(snapshot.analyst.target_mean, 2, '$')}{' '}
              <span className="sfp-analyst-dim">
                ({fmtNum(snapshot.analyst.target_low, 2, '$')}–{fmtNum(snapshot.analyst.target_high, 2, '$')})
              </span>
            </span>
            <span className={snapshot.analyst.implied_upside_pct >= 0 ? 'text-green' : 'text-red'}>
              隐含 {snapshot.analyst.implied_upside_pct >= 0 ? '+' : ''}
              {snapshot.analyst.implied_upside_pct.toFixed(1)}%
            </span>
            <span>拥挤度 {snapshot.analyst.crowding}</span>
          </div>
          <div className="sfp-analyst-dist font-mono">
            {(['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'] as const).map((k) => (
              <span key={k} className={`sfp-dist sfp-dist-${k.toLowerCase()}`}>
                {RATING_TEXT[k]} {snapshot.analyst!.distribution[k]}
              </span>
            ))}
          </div>
          {snapshot.analyst.contrarian_warning && (
            <div className="sfp-analyst-warn">⚠ {snapshot.analyst.contrarian_warning}</div>
          )}
          <div className="sfp-analyst-note">
            没有可靠的历史时点分析师评级来源，所以这一栏是<strong>游戏内模拟的卖方研究</strong>，
            并且刻意复刻了真实卖方的毛病：跟随涨幅调评级、目标价锚定近期高点、极少喊卖出。
            后果是它<strong>在顶部最乐观、在底部最悲观</strong>——照着它做，会在拐点上吃亏。
            它不是给你的答案，是给你的一个需要判断的对手信息。
          </div>
        </div>
      )}

      {/* Profile */}
      <div className="sfp-section-label font-mono">公司概况 · PROFILE</div>
      <div className="sfp-grid">
        <Cell label="名称" field={profile.name} />
        <Cell label="板块" field={profile.sector} />
      </div>
      {profile.description.value != null ? (
        <div className="sfp-desc">
          <span className="sfp-src-tag ot-badge real_primary" title={formatProvenance(profile.description.source_type)}>{formatProvenance(profile.description.source_type)}</span>
          <span>{profile.description.value}</span>
        </div>
      ) : (
        <div className="sfp-cell-reason" style={{ marginTop: 4 }}>
          业务描述：<span className="font-mono">DATA_UNAVAILABLE</span> — {profile.description.unavailable_reason}
        </div>
      )}

      <div className="v28-data-boundary-note" data-testid="sfp-provenance">
        <strong>这一屏的数字是怎么来的。</strong>
        标 <span className="font-mono">REAL</span> 的是本地已准入的真实历史行情；
        标 <span className="font-mono">REAL_PRIMARY</span> 的取自 SEC EDGAR 官方申报（主体名称、
        SIC 行业分类、每股收益）；
        标 <span className="font-mono">DERIVED_REAL_INPUTS</span> 的是由上面这些真实输入在
        <em>当前游戏日期及之前</em>算出来的（52 周高低、均线、区间位置、市盈率），
        因此天然不含未来信息。
        <div style={{ marginTop: 4 }}>
          市盈率的口径：<span className="font-mono">TTM EPS</span> 只累加截至当前游戏日期
          <em>已经公开申报</em>的四个季度；市盈率 = 当日收盘价 ÷ 该 EPS。
          换句话说，一月的场景只会看到一月时公众能看到的数字，不会提前用到后来才披露的财报。
        </div>
        <div style={{ marginTop: 4 }}>
          本游戏全离线运行，不发出任何网络请求；
          标 <span className="font-mono">DATA_UNAVAILABLE</span> 的字段是本地数据包里就没有采集过，
          不是加载失败，也不会因为购买订阅而出现——每个空格子下面写了具体缺什么。
        </div>
        {t.available_bars > 0 && (
          <div style={{ marginTop: 4 }}>
            当前可用日线：<span className="font-mono">{t.available_bars}</span> 根，
            来自{snapshot.history_source.name}。
            52 周高低需要约 252 根、200 日均线需要 200 根；不够时不显示估算值。
          </div>
        )}
      </div>
    </div>
  );
}
