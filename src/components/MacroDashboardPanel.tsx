import React from 'react';
import type { MacroSnapshot } from '../types';

interface Props {
  macro: MacroSnapshot | null;
}

export const MacroDashboardPanel: React.FC<Props> = ({ macro }) => {
  if (!macro) {
    return (
      <div className="panel macro-panel">
        <div className="panel-header">
          <h3>全球宏观与收益率曲线</h3>
        </div>
        <div className="panel-body empty-state ot-empty-state">宏观数据加载中...</div>
      </div>
    );
  }

  const isCurveInverted = (macro.curve_2s10s || 0) < 0;

  return (
    <div className="panel macro-panel">
      <div className="panel-header">
        <div className="flex-row items-center gap-sm">
          <span className="panel-icon">🌐</span>
          <h3>全球宏观与美债收益率</h3>
          <span className="badge-tag ot-badge derived">{macro.date} 点差数据</span>
        </div>
      </div>

      <div className="macro-grid">
        {/* Treasury Rates Card */}
        <div className="macro-card">
          <div className="macro-card-title">美债收益率曲线 (Treasury Curve)</div>
          <div className="rates-table ot-table-wrapper">
            <table className="ot-table">
              <tbody>
                <tr className="rate-row">
                  <td className="rate-name">2Y 利率 (政策预期)</td>
                  <td className="rate-val font-mono">{macro.ust_2y?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">5Y 利率 (中期基准)</td>
                  <td className="rate-val font-mono">{macro.ust_5y?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">10Y 利率 (贴现率锚)</td>
                  <td className="rate-val font-mono">{macro.ust_10y?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">30Y 利率 (长端久期)</td>
                  <td className="rate-val font-mono">{macro.ust_30y?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row highlight-row">
                  <td className="rate-name">2s10s 利差 (衰退预警)</td>
                  <td className={`rate-val font-mono ${isCurveInverted ? 'text-red' : 'text-green'}`}>
                    {macro.curve_2s10s && macro.curve_2s10s > 0 ? '+' : ''}
                    {macro.curve_2s10s?.toFixed(2)}%
                    {isCurveInverted ? ' (倒挂 Inverted)' : ' (走陡 Steepening)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Monetary & Real Yields */}
        <div className="macro-card">
          <div className="macro-card-title">流动性与货币市场 (Funding)</div>
          <div className="rates-table ot-table-wrapper">
            <table className="ot-table">
              <tbody>
                <tr className="rate-row">
                  <td className="rate-name">联邦基金利率 (Fed Funds)</td>
                  <td className="rate-val font-mono">{macro.fed_funds?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">SOFR 隔夜回购利率</td>
                  <td className="rate-val font-mono">{macro.sofr?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">10Y 实际收益率 (TIPS)</td>
                  <td className="rate-val font-mono">{macro.real_yield_10y?.toFixed(2)}%</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">广义美元指数 (Broad USD)</td>
                  <td className="rate-val font-mono">{macro.broad_usd?.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Global FX & Commodities */}
        <div className="macro-card">
          <div className="macro-card-title">外汇、避险与大宗 (FX & Assets)</div>
          <div className="rates-table ot-table-wrapper">
            <table className="ot-table">
              <tbody>
                <tr className="rate-row">
                  <td className="rate-name">美元 / 日元 (USD/JPY 套利)</td>
                  <td className="rate-val font-mono">{macro.usdjpy?.toFixed(2)}</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">欧元 / 美元 (EUR/USD)</td>
                  <td className="rate-val font-mono">{macro.eurusd?.toFixed(4)}</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">Cboe VIX 恐慌指数</td>
                  <td className="rate-val font-mono text-yellow">{macro.vix?.toFixed(2)}</td>
                </tr>
                <tr className="rate-row">
                  <td className="rate-name">WTI 原油 / 现货黄金</td>
                  <td className="rate-val font-mono">
                    ${macro.wti?.toFixed(1)} / ${macro.gold?.toFixed(0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Visual Yield Curve Chart */}
      {macro.yield_curve && macro.yield_curve.length > 0 && (
        <div className="yield-curve-chart">
          <div className="chart-subtitle">美债收益率期限结构 (Term Structure)</div>
          <div className="yield-bars">
            {macro.yield_curve.map((pt) => {
              const heightPct = ((pt.yield_pct - 3.0) / 3.0) * 100;
              return (
                <div key={pt.tenor} className="yield-bar-item">
                  <div className="yield-val font-mono">{pt.yield_pct.toFixed(2)}%</div>
                  <div className="yield-bar-track">
                    <div
                      className="yield-bar-fill"
                      style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                    />
                  </div>
                  <div className="yield-tenor">{pt.tenor}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
