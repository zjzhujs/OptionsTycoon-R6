import React from 'react';
import type { GexSummary } from '../types';
import { formatProvenance } from '../lib/financialLanguage';
import { GexZeroAxis } from './fx/MiniViz';

interface Props {
  gexSummary: GexSummary | null;
}

export const GexAnalyticsPanel: React.FC<Props> = ({ gexSummary }) => {
  if (!gexSummary || !gexSummary.points || gexSummary.points.length === 0) {
    return (
      <div className="panel gex-panel">
        <div className="panel-header">
          <h3>Gamma Wall & GEX 分析</h3>
        </div>
        <div className="panel-body empty-state ot-empty-state">暂无 GEX 数据或当前标的无需期权持仓分布</div>
      </div>
    );
  }

  const maxRawGamma = Math.max(...gexSummary.points.map((p) => p.raw_gamma_1pct_usd), 1.0);

  return (
    <div className="panel gex-panel">
      <div className="panel-header">
        <div className="flex-row items-center gap-sm">
          <span className="panel-icon">⚡</span>
          <h3>Gamma Wall & GEX 分析</h3>
          <span className="badge-tag ot-badge derived" title={formatProvenance(gexSummary.provenance.source_type)}>
            {gexSummary.provenance.source_type === 'DERIVED_REAL_INPUTS'
              ? '真实 OI 输入（DERIVED REAL INPUTS）'
              : formatProvenance(gexSummary.provenance.source_type)}
          </span>
        </div>
      </div>

      <div className="gex-summary-cards">
        <div className="gex-stat-card ot-metric">
          <div className="stat-label ot-metric-label">Gamma 集中墙 (Concentration Wall)</div>
          <div className="stat-value font-mono text-cyan ot-metric-value">
            ${gexSummary.gamma_concentration_wall?.toFixed(1) || 'N/A'}
          </div>
          <div className="stat-sub">全市场 Gamma 最密集行权价</div>
        </div>

        <div className="gex-stat-card ot-metric">
          <div className="stat-label ot-metric-label">Call Wall (看涨阻力)</div>
          <div className="stat-value font-mono text-green ot-metric-value">
            ${gexSummary.call_wall_raw_gamma?.toFixed(1) || 'N/A'}
          </div>
          <div className="stat-sub">多头 Gamma 集中带</div>
        </div>

        <div className="gex-stat-card ot-metric">
          <div className="stat-label ot-metric-label">Put Wall (看跌支撑)</div>
          <div className="stat-value font-mono text-red ot-metric-value">
            ${gexSummary.put_wall_raw_gamma?.toFixed(1) || 'N/A'}
          </div>
          <div className="stat-sub">空头对冲盘防御带</div>
        </div>
      </div>

      <div className="gex-warning-box">
        ⚠️ <strong>数据真实性说明</strong>：{gexSummary.warning}
      </div>

      <div className="gex-zero-axis-wrap" data-testid="gex-zero-axis">
        <GexZeroAxis
          source="gexPoints"
          points={gexSummary.points.map((pt) => ({ label: `$${pt.strike.toFixed(0)}`, value: (pt.call_raw_gamma ?? 0) - (pt.put_raw_gamma ?? 0) }))}
          width={300}
        />
        <div className="small ot-dim-text">零轴左/右仅表示由当前真实/准入 OI 输入推导的 Call−Put raw gamma 方向，不冒充 signed dealer inventory。</div>
      </div>

      <div className="gex-bars-container">
        <div className="gex-bars-header">
          <span>行权价 (Strike)</span>
          <span>Call / Put Gamma 1% ($/1% Move)</span>
          <span>总持仓量 (OI)</span>
        </div>
        <div className="gex-bars-list">
          {gexSummary.points.map((pt) => {
            const isSpotNear = Math.abs(pt.strike - gexSummary.spot) < 2.0;
            const isConcWall = pt.strike === gexSummary.gamma_concentration_wall;
            const callWidth = ((pt.call_raw_gamma ?? 0) / maxRawGamma) * 100;
            const putWidth = ((pt.put_raw_gamma ?? 0) / maxRawGamma) * 100;

            return (
              <div
                key={pt.strike}
                className={`gex-bar-row ${isSpotNear ? 'spot-near' : ''} ${isConcWall ? 'wall-highlight' : ''}`}
              >
                <div className="gex-strike-label font-mono">
                  ${pt.strike.toFixed(1)}
                  {isSpotNear && <span className="spot-marker">现价</span>}
                  {isConcWall && <span className="wall-marker">WALL</span>}
                </div>

                <div className="gex-visual-bar">
                  <div className="gex-bar-track">
                    <div
                      className="gex-bar-fill call-fill"
                      style={{ width: `${Math.min(100, callWidth)}%` }}
                      title={`Call Raw Gamma: $${Math.round(pt.call_raw_gamma ?? 0).toLocaleString()}`}
                    />
                  </div>
                  <div className="gex-bar-track">
                    <div
                      className="gex-bar-fill put-fill"
                      style={{ width: `${Math.min(100, putWidth)}%` }}
                      title={`Put Raw Gamma: $${Math.round(pt.put_raw_gamma ?? 0).toLocaleString()}`}
                    />
                  </div>
                </div>

                <div className="gex-oi-label font-mono text-dim text-sm">
                  {pt.total_oi.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
