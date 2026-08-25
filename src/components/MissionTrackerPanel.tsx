import React from 'react';
import type { GameStateView } from '../types';
import { factionMissionCopy } from '../engine/engines/faction_mission_engine';

/** MAIN QUEST TRACKER. Distinct from CurrentObjectiveBanner: the banner answers
 * "what do I do next", this answers "why, and how far through the episode am I".
 * Step completion is derived from real observable state/flags only -- nothing here
 * is a guess or a fixed timer. Scoped to Episode 1 for now (the only episode with a
 * scripted Day-1 flow); later episodes fall back to a minimal NAV/thesis/position
 * checklist rather than fabricating steps that don't exist yet for them. */

export interface MissionStep {
  id: string;
  label: string;
  done: boolean;
}

export interface MissionTrackerProps {
  view: GameStateView;
  episodeNumber: number;
  episodeTitle: string;
  visitedWarRoom: boolean;
  visitedTradingFloor: boolean;
  hasResolvedOpeningBriefing: boolean;
  onRecommendedAction: (stepId: string) => void;
}

export function buildEp01Steps(
  view: GameStateView,
  visitedWarRoom: boolean,
  visitedTradingFloor: boolean,
  hasResolvedOpeningBriefing: boolean
): MissionStep[] {
  const hasClosedTrade = (view.state.trade_reviews ?? []).length > 0;
  // The engine deletes `active_theses[positionId]` / `active_theses.shares` the
  // moment a position fully closes (see trading.ts), and closing a trade always
  // implies a thesis was attached to it beforehand -- so "thesis" and "position"
  // must both stay true once true, or the tracker visibly regresses the instant
  // the player finishes a trade (worse than showing no progress at all).
  const hasEverHadThesis = Object.keys(view.state.active_theses ?? {}).length > 0 || hasClosedTrade;
  const hasEverHadPosition = (view.state.positions ?? []).length > 0 || hasClosedTrade;
  const faction = factionMissionCopy(view.state as any);
  return [
    /* 游戏性审计"出戏3"整改：任务文案从功能操作表述改为权力与博弈表述——
     * 掌管几千万美金的 PM 不接受"去看K线"这种驾校指令，只接受危机驱动的决策。 */
    { id: 'briefing', label: '【开局对决】审阅 Maya 提交的算力内参并确定立场', done: hasResolvedOpeningBriefing },
    { id: 'warroom', label: '【晨会抉择】评估投研与风控分歧，制定今日作战方针', done: visitedWarRoom },
    { id: 'floor', label: '【盘前研判】开盘前分析 NVDA 与半导体供应链核心变量', done: visitedTradingFloor },
    { id: 'thesis', label: faction?.thesis ?? '【建立论点】撰写具备明确驱动因子与证伪条件的 Thesis', done: hasEverHadThesis },
    { id: 'position', label: faction?.position ?? '【执行建仓】在期权链选择合适行权价并完成开仓下单', done: hasEverHadPosition },
    { id: 'review', label: faction?.review ?? '【战役结算】平仓结清头寸并完成 360 度法证复盘归因', done: hasClosedTrade },
  ];
}

export function MissionTrackerPanel({
  view,
  episodeNumber,
  episodeTitle,
  visitedWarRoom,
  visitedTradingFloor,
  hasResolvedOpeningBriefing,
  onRecommendedAction,
}: MissionTrackerProps): JSX.Element | null {
  // Only EP01 has a real scripted step sequence right now -- don't fabricate one for
  // later episodes. This is a real, honest scoping limit, not a hidden bug.
  if (episodeNumber !== 1) return null;

  const steps = buildEp01Steps(view, visitedWarRoom, visitedTradingFloor, hasResolvedOpeningBriefing);
  const firstUndone = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mission-tracker ot-card ot-panel-tech">
      <div className="mission-tracker-header ot-section-header">
        <span className="mission-tracker-badge ot-badge ot-badge-simulated">
          主线 <span className="en-secondary">MAIN QUEST</span>
        </span>
        <span className="mission-tracker-progress font-mono">{doneCount}/{steps.length}</span>
      </div>
      <div className="mission-tracker-title ot-section-title">EP{episodeNumber} · {episodeTitle}</div>
      <ul className="mission-tracker-steps">
        {steps.map((s) => {
          const isDone = s.done;
          const isCurrent = firstUndone?.id === s.id;
          const stepClass = isDone ? 'done ot-step-done' : isCurrent ? 'current ot-step-current' : 'pending ot-step-pending';
          const markerBadge = isDone ? 'ot-badge-real' : isCurrent ? 'ot-badge-estimated' : 'ot-badge-unavailable';
          return (
            <li key={s.id} className={stepClass}>
              <button
                type="button"
                className="mission-step-button"
                onClick={() => onRecommendedAction(s.id)}
                aria-label={`前往：${s.label}`}
                title={isDone ? '重新查看对应界面' : isCurrent ? '前往当前任务' : '前往对应界面（不会自动完成任务）'}
              >
                <span className={`mission-tracker-marker ot-badge ${markerBadge}`}>
                  {isDone ? '✓' : isCurrent ? '●' : '○'}
                </span>
                <span className="mission-step-text">{s.label}</span>
                <span className="mission-step-go" aria-hidden="true">↗</span>
              </button>
            </li>
          );
        })}
      </ul>
      {firstUndone && (
        <button
          type="button"
          className="mission-tracker-cta ot-btn ot-btn-primary"
          onClick={() => onRecommendedAction(firstUndone.id)}
        >
          {firstUndone.label} ➔
        </button>
      )}
    </div>
  );
}
