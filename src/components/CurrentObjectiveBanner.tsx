import React from 'react';
import type { GameStateView } from '../types';

export interface CurrentObjectiveBannerProps {
  view: GameStateView | null;
  onNavigateAction?: (target: string) => void;
  showFundHQ: boolean;
  onboardingActive: boolean;
  onboardingStep: number;
  hasOpenPosition: boolean;
  hasTradeReviews: boolean;
  dayIndex: number;
}

export function getCurrentObjective(
  view: GameStateView | null,
  hasOpenPosition: boolean,
  hasTradeReviews: boolean,
  dayIndex: number,
  showFundHQ: boolean
): {
  stageBadge: string;
  title: string;
  nextStep: string;
  ctaText?: string;
  ctaAction?: string;
} {
  const positionsCount = view?.state.positions.length ?? 0;
  const reviewsCount = view?.state.trade_reviews.length ?? 0;
  const pendingStoryCount = (view?.pending_story_public || []).filter((e) => !e.resolved).length;
  const marginCall = view?.margin_call_active ?? false;
  const pauseReasons = view?.market_clock?.pause_reasons ?? [];

  if (marginCall) {
    return {
      stageBadge: '⚠️ 紧急风控 · MARGIN CALL',
      title: '维持保证金不足。主经纪商已发出催缴通知，请立即处理负债与仓位。',
      nextStep: '前往仓位面板减仓，或去 PB 专柜补充流动性。',
      ctaText: '处理危机 ➔',
      ctaAction: 'SURVIVAL',
    };
  }

  if (pauseReasons.some((r) => r.trigger_id === 'position_decision')) {
    return {
      stageBadge: '持仓决策 · POSITION DECISION',
      title: '行情出现异动，持仓浮动盈亏已发生变化。请评估是否调整头寸。',
      nextStep: '评估浮盈与原始 Thesis。选择【继续持有】、【部分减仓】或【全部平仓】。',
      ctaText: '查看决策 ➔',
      ctaAction: 'DECISION',
    };
  }

  if (pendingStoryCount > 0) {
    return {
      stageBadge: '剧情与情报 · INTEL PENDING',
      title: '收到待处理的情报与团队建议，请在做出交易决策前确认立场。',
      nextStep: '查阅并选择。你的决定将影响声誉、团队及合规风险。',
      ctaText: '查看剧情 ➔',
      ctaAction: 'INTEL',
    };
  }

  // Day 1 / Node 0 Guided Loop
  if (dayIndex === 0 && !hasTradeReviews) {
    if (!hasOpenPosition) {
      if (showFundHQ) {
        return {
          stageBadge: '新手引导 · STEP 1/5 建立观点',
          title: '开盘前研判标的走势，建立包含驱动因子与证伪条件的 Thesis。',
          nextStep: '浏览【今日重点】，前往【交易大厅】挑选标的与期权。',
          ctaText: '进入交易大厅 ➔',
          ctaAction: 'TRADE_FLOOR',
        };
      }
      return {
        stageBadge: '新手引导 · STEP 2/5 选择合约',
        title: '前往期权链选择合约：在平值附近挑选流动性充足的行权价。',
        nextStep: '点击平值附近的行权价，在订单台执行【买入开仓 (Buy to Open)】。',
        ctaText: '查看期权链 ➔',
        ctaAction: 'OPTIONS_CHAIN',
      };
    } else {
      // Position is open
      return {
        stageBadge: '新手引导 · STEP 3/5 推进时间',
        title: '开仓订单已执行，推进时间观察盘面与持仓浮动盈亏变化。',
        nextStep: '点击【ADVANCE MARKET】，推进时间并观察账面浮动盈亏。',
        ctaText: '推进市场 ▶',
        ctaAction: 'ADVANCE_MARKET',
      };
    }
  }

  // Day 1 After first trade opened and market advanced
  if (hasOpenPosition && dayIndex > 0) {
    return {
      stageBadge: '持仓管理 · PORTFOLIO ACTIVE',
      title: '监控持仓 Greeks 与隐含波动率变化，核验是否触发止盈或止损条件。',
      nextStep: '对比 Thesis。若触发目标或失效条件，执行【卖出平仓 (Sell to Close)】。',
      ctaText: showFundHQ ? '进入交易大厅 ➔' : '查看订单台 ➔',
      ctaAction: showFundHQ ? 'TRADE_FLOOR' : 'ORDER_TICKET',
    };
  }

  if (reviewsCount > 0 && !hasOpenPosition) {
    return {
      stageBadge: '战役推进 · NEXT TRADE',
      title: '交易已平仓结清。查看 360 度法证复盘归因，寻找下一轮交易机会。',
      nextStep: '查看复盘评分，或用扫描仪寻找高 IV 标的。',
      ctaText: '打开扫描仪 ➔',
      ctaAction: 'SCANNER',
    };
  }

  // General state
  return {
    stageBadge: `NODE ${dayIndex + 1} · 策略运作`,
    title: '结合宏观环境、做市商持仓与期权链微观结构，寻找非对称交易机会。',
    nextStep: '建立 Thesis，寻找非对称收益的入场点。',
    ctaText: showFundHQ ? '前往交易大厅 ➔' : '查看机会 ➔',
    ctaAction: showFundHQ ? 'TRADE_FLOOR' : 'SCANNER',
  };
}

export const CurrentObjectiveBanner: React.FC<CurrentObjectiveBannerProps> = ({
  view,
  onNavigateAction,
  showFundHQ,
  onboardingActive,
  onboardingStep,
  hasOpenPosition,
  hasTradeReviews,
  dayIndex,
}) => {
  const objective = getCurrentObjective(view, hasOpenPosition, hasTradeReviews, dayIndex, showFundHQ);

  return (
    <div className="current-objective-banner ot-card ot-panel-tech" data-testid="current-objective-banner">
      <div className="objective-left">
        <div className="objective-badge-row">
          <span className="objective-indicator-dot" aria-hidden="true" />
          <span className="objective-stage-tag ot-badge ot-badge-simulated">{objective.stageBadge}</span>
          <span className="objective-hdr-label">当前目标 <span className="en-secondary">CURRENT OBJECTIVE</span></span>
        </div>
        <div className="objective-title">{objective.title}</div>
        <details className="objective-details-toggle">
          <summary className="objective-details-summary">下一步行动 ▾</summary>
          <div className="objective-subtext">
            <span className="subtext-prefix">下一步行动：</span>
            {objective.nextStep}
          </div>
        </details>
      </div>

      {objective.ctaText && onNavigateAction && (
        <div className="objective-right">
          <button
            type="button"
            className="btn-objective-primary ot-btn ot-btn-primary"
            onClick={() => onNavigateAction(objective.ctaAction || '')}
          >
            {objective.ctaText}
          </button>
        </div>
      )}
    </div>
  );
};
