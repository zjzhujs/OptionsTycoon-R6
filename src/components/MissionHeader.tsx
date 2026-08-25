import React, { useMemo } from 'react';
import type { GameStateView } from '../types';
import { getCurrentObjective } from './CurrentObjectiveBanner';
import { buildEp01Steps, type MissionStep } from './MissionTrackerPanel';

export interface MissionHeaderProps {
  view: GameStateView;
  episodeNumber: number;
  episodeTitle: string;
  visitedWarRoom: boolean;
  visitedTradingFloor: boolean;
  hasResolvedOpeningBriefing: boolean;
  hasOpenPosition: boolean;
  hasTradeReviews: boolean;
  dayIndex: number;
  showFundHQ: boolean;
  onNavigateAction: (action: string) => void;
}

/**
 * The one permanent mission surface.
 *
 * Current Objective supplies the immediate action; the quest list is available
 * behind the disclosure instead of competing with it as a second banner.
 */
export function MissionHeader({
  view,
  episodeNumber,
  episodeTitle,
  visitedWarRoom,
  visitedTradingFloor,
  hasResolvedOpeningBriefing,
  hasOpenPosition,
  hasTradeReviews,
  dayIndex,
  showFundHQ,
  onNavigateAction,
}: MissionHeaderProps): JSX.Element {
  const objective = getCurrentObjective(view, hasOpenPosition, hasTradeReviews, dayIndex, showFundHQ);
  const steps: MissionStep[] = useMemo(
    () =>
      episodeNumber === 1
        ? buildEp01Steps(view, visitedWarRoom, visitedTradingFloor, hasResolvedOpeningBriefing)
        : [],
    [episodeNumber, view, visitedWarRoom, visitedTradingFloor, hasResolvedOpeningBriefing],
  );
  const doneCount = steps.filter((step) => step.done).length;
  const firstUndone = steps.find((step) => !step.done);

  return (
    <section className="mission-header current-objective-banner mission-tracker ot-card ot-panel-tech" data-testid="mission-header" data-visual-key="mobile-objective">
      <div className="mission-header-main objective-left">
        <div className="mission-header-kicker objective-badge-row">
          <span className="objective-indicator-dot" aria-hidden="true" />
          <span className="mission-header-episode ot-badge ot-badge-simulated">EP{episodeNumber}</span>
          <span className="mission-header-day ot-badge ot-badge-derived">DAY {dayIndex + 1}</span>
          <span className="objective-hdr-label">主线任务 <span className="en-secondary">MAIN QUEST</span></span>
          {steps.length > 0 && <span className="mission-tracker-progress font-mono">{doneCount}/{steps.length}</span>}
        </div>
        <div className="mission-header-title ot-section-title">{episodeTitle}</div>
        <div className="mission-header-objective-label ot-section-sub">当前任务</div>
        <div className="objective-title" data-testid="current-mission-title">{objective.title}</div>
        <div className="objective-subtext">
          <span className="subtext-prefix">下一步：</span>
          {objective.nextStep}
        </div>
      </div>

      <div className="mission-header-action objective-right">
        {objective.ctaText && objective.ctaAction && (
          <button
            type="button"
            className="btn-objective-primary mission-tracker-cta ot-btn ot-btn-primary"
            onClick={() => onNavigateAction(objective.ctaAction!)}
            data-testid="mission-primary-cta"
          >
            {objective.ctaText}
          </button>
        )}
      </div>

      {steps.length > 0 && (
        <details className="mission-header-details">
          <summary>查看完整任务列表</summary>
          <ul className="mission-tracker-steps">
            {steps.map((step) => {
              const isDone = step.done;
              const isCurrent = firstUndone?.id === step.id;
              const stepClass = isDone ? 'done ot-step-done' : isCurrent ? 'current ot-step-current' : 'pending ot-step-pending';
              const markerBadge = isDone ? 'ot-badge-real' : isCurrent ? 'ot-badge-estimated' : 'ot-badge-unavailable';
              return (
                <li key={step.id} className={stepClass}>
                  <span className={`mission-tracker-marker ot-badge ${markerBadge}`}>
                    {isDone ? '✓' : isCurrent ? '●' : '○'}
                  </span>
                  <span className="mission-step-text">{step.label}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
