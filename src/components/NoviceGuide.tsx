import React, { useMemo } from 'react';

/**
 * 新手引导 · Step3「看走势」断点修复（batch2 断点3/4/5）
 *
 * 制作人原始反馈：「点进去看 nvda 走势玩家肯定是一头雾水不知道该看什么」。
 * 这里做两件事，全部基于图表里真实存在的 bar 计算，不编造任何数字：
 *   1. Maya 批注气泡 —— 把"该看什么"直接说出来（前高/前低/现价/回撤幅度）；
 *   2. 走势结论推导器 —— 两个大白话按钮，把"看完该得出什么结论"变成一次点击，
 *      点完直接无缝进入 Thesis 构建器（断点5），方向已按玩家判断预填。
 */

export interface TrendGuideBar {
  date: string;
  close: number;
  high?: number;
  low?: number;
}

interface Props {
  visible: boolean;
  underlying: string;
  bars: TrendGuideBar[];
  onConclude: (direction: 'BULLISH' | 'BEARISH') => void;
  onDismiss: () => void;
}

export const TrendConclusionGuide: React.FC<Props> = ({ visible, underlying, bars, onConclude, onDismiss }) => {
  const facts = useMemo(() => {
    if (!bars.length) return null;
    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high ?? b.close);
    const lows = bars.map((b) => b.low ?? b.close);
    const last = closes[closes.length - 1];
    const hi = Math.max(...highs);
    const lo = Math.min(...lows);
    const offHighPct = hi > 0 ? ((hi - last) / hi) * 100 : 0;
    const recent = closes.slice(-5);
    const recentTrendUp = recent.length >= 2 && recent[recent.length - 1] >= recent[0];
    const trendText = recent.length >= 2
      ? `最近${recent.length}个已揭晓节点${recentTrendUp ? '走稳回升' : '仍在走低'}`
      : `趋势窗口暂不可用（当前仅 ${recent.length} 个已揭晓节点，至少需要 2 个）`;
    return { last, hi, lo, offHighPct, trendText, span: bars.length };
  }, [bars]);

  if (!visible || !facts) return null;

  return (
    <div className="novice-trend-guide" data-testid="novice-trend-guide">
      <input
        id="ntg-mobile-toggle"
        type="checkbox"
        className="ntg-mobile-toggle"
        aria-label="展开或收起 Maya 走势判断提示"
      />
      <label
        htmlFor="ntg-mobile-toggle"
        className="ntg-mobile-summary"
      >
        <span className="ntg-speaker">Maya Chen · 首席投研</span>
        <span className="ntg-expand-closed">展开 ▴</span>
        <span className="ntg-expand-open">收起 ▾</span>
      </label>
      <div className="ntg-bubble">
        <div className="ntg-speaker">Maya Chen · 首席投研</div>
        <div className="ntg-text">
          别被满屏参数吓住，先只看这张图：这 {facts.span} 根K线里，前期高点 <b>${facts.hi.toFixed(2)}</b>、
          低点 <b>${facts.lo.toFixed(2)}</b>，现价 <b>${facts.last.toFixed(2)}</b>
          （距高点回撤 {facts.offHighPct.toFixed(1)}%，{facts.trendText}）。
          你现在只需要判断一件事——它是回踩企稳，还是破位下行？
        </div>
      </div>
      <div className="ntg-actions">
        <button
          type="button"
          className="ntg-btn ntg-btn-bull"
          data-testid="ntg-conclude-bull"
          onClick={() => onConclude('BULLISH')}
        >
          判断：企稳反弹 → 做多 <span className="en-secondary">BULLISH</span>
        </button>
        <button
          type="button"
          className="ntg-btn ntg-btn-bear"
          data-testid="ntg-conclude-bear"
          onClick={() => onConclude('BEARISH')}
        >
          判断：承压破位 → 做空 <span className="en-secondary">BEARISH</span>
        </button>
        <button type="button" className="ntg-dismiss" data-testid="ntg-dismiss" onClick={onDismiss}>
          我自己看，先不下结论
        </button>
      </div>
      <div className="ntg-hint">选一个判断后会直接进入 {underlying} 的观点构建（方向可再改），这不是下单。</div>
    </div>
  );
};
