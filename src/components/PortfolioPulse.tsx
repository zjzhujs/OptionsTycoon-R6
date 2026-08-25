import React from 'react';
import type { GameStateView } from '../types';
import { money } from '../lib/format';

interface Props {
  view: GameStateView;
  onOpenPortfolio: () => void;
  onOpenTradeFloor: () => void;
}

export const PortfolioPulse: React.FC<Props> = ({ view, onOpenPortfolio, onOpenTradeFloor }) => {
  const positions = view.state.positions || [];
  const nav = view.equity;
  const hasPositions = positions.length > 0;

  if (!hasPositions) {
    // Zero-position state: Show Next Catalyst instead of an empty box
    const mainUnderlying = (view.state.campaign_id || 'r1').toUpperCase() === 'R1' ? 'NVDA' : (view.state.campaign_id || 'NVDA').toUpperCase();
    return (
      <div
        className="portfolio-pulse-card ot-panel next-catalyst-box"
        onClick={onOpenTradeFloor}
        title="点击前往交易大厅建立头寸"
        data-testid="next-catalyst"
      >
        <div className="ot-section-header pulse-header">
          <div className="ot-section-titles">
            <span className="ot-section-zh">市场催化剂</span>
            <span className="ot-section-en">NEXT CATALYST</span>
          </div>
          <span className="ot-badge ot-badge-simulated font-mono">待建仓</span>
        </div>
        <div className="next-catalyst-content">
          <div className="next-catalyst-title">
            🎯 <strong>{mainUnderlying}</strong> 核心波动率窗口正在展开
          </div>
          <div className="next-catalyst-desc font-mono">
            暂无持仓 · 点击进入期权链研判 Thesis ➔
          </div>
        </div>
      </div>
    );
  }

  // Calculate glanceable signals
  const marginReq = view.margin_requirement;
  const marginBufferPct = nav > 0 && typeof marginReq === 'number'
    ? Math.max(0, (1 - marginReq / nav) * 100)
    : 100;

  // Approximate net delta: sum of (qty * (type === 'call' ? 0.5 : -0.5) * (short ? -1 : 1))
  const netDelta = positions.reduce((acc, pos) => {
    const isCall = String(pos.type).toLowerCase() === 'call';
    const sign = pos.short ? -1 : 1;
    const posDelta = (isCall ? 0.5 : -0.5) * sign * (pos.qty || 1);
    return acc + posDelta;
  }, 0);

  // Top risk position
  const topRiskPos = positions[0];
  const topRiskLabel = topRiskPos
    ? `${topRiskPos.short ? 'SHORT' : 'LONG'} ${String(topRiskPos.type).toUpperCase()} ${topRiskPos.strike}`
    : '—';

  return (
    <div
      className="portfolio-pulse-card ot-panel"
      onClick={onOpenPortfolio}
      title="点击查看持仓明细与风控"
      data-testid="portfolio-pulse"
    >
      <div className="ot-section-header pulse-header">
        <div className="ot-section-titles">
          <span className="ot-section-zh">持仓风险脉搏</span>
          <span className="ot-section-en">PORTFOLIO PULSE</span>
        </div>
        <span className="ot-badge ot-badge-real font-mono">{positions.length} 笔持仓</span>
      </div>

      <div className="pulse-signal-grid">
        <div className="pulse-signal-item">
          <span className="pulse-signal-label">净 Delta 敞口</span>
          <span className={`pulse-signal-val font-mono ${netDelta >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
            {netDelta > 0 ? `+${netDelta.toFixed(2)}` : netDelta.toFixed(2)} Δ
          </span>
        </div>

        <div className="pulse-signal-item">
          <span className="pulse-signal-label">当日 P&amp;L</span>
          <span className={`pulse-signal-val font-mono ${view.unrealized_pnl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
            {money(view.unrealized_pnl)}
          </span>
        </div>

        <div className="pulse-signal-item">
          <span className="pulse-signal-label">保证金缓冲</span>
          <span className={`pulse-signal-val font-mono ${marginBufferPct < 25 ? 'ot-metric-delta-down' : 'ot-metric-delta-up'}`}>
            {marginBufferPct.toFixed(0)}%
          </span>
        </div>

        <div className="pulse-signal-item">
          <span className="pulse-signal-label">最大风险头寸</span>
          <span className="pulse-signal-val font-mono pulse-top-pos" title={topRiskLabel}>
            {topRiskLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
