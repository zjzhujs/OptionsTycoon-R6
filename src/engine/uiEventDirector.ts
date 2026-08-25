/**
 * Deterministic arbitration for player-facing blocking UI.
 *
 * A modal must not win because it was rendered later in App.tsx or because it
 * happens to have a larger z-index. Every blocking candidate is registered here
 * with a tier, and the highest-priority active candidate is the only one the
 * host is allowed to render.
 */

export type UIEventTier =
  | 'INTRUSIVE_DRAMA'
  | 'MANDATORY_STORY'
  | 'CRITICAL_COMPLIANCE'
  | 'POSITION_DECISION'
  | 'MANDATORY_TUTORIAL'
  | 'SIDE_EVENT'
  | 'REVIEW_OUTCOME'
  | 'NON_BLOCKING_NOTIFICATION';

export interface UIEventCandidate {
  id: string;
  tier: UIEventTier;
  active: boolean;
  /** Candidates in the same tier are resolved in declaration order unless a
   * caller supplies an explicit tie breaker. */
  order?: number;
}

export const UI_EVENT_PRIORITY: readonly UIEventTier[] = [
  'INTRUSIVE_DRAMA',
  'MANDATORY_STORY',
  'CRITICAL_COMPLIANCE',
  'POSITION_DECISION',
  'MANDATORY_TUTORIAL',
  'SIDE_EVENT',
  'REVIEW_OUTCOME',
  'NON_BLOCKING_NOTIFICATION',
];

export interface ActiveUIEvent extends UIEventCandidate {
  priority: number;
}

export function selectActiveUIEvent(candidates: UIEventCandidate[]): ActiveUIEvent | null {
  let winner: ActiveUIEvent | null = null;

  candidates.forEach((candidate, index) => {
    if (!candidate.active) return;
    const priority = UI_EVENT_PRIORITY.indexOf(candidate.tier);
    if (priority < 0) return;
    const current: ActiveUIEvent = { ...candidate, priority };
    if (
      winner === null ||
      current.priority < winner.priority ||
      (current.priority === winner.priority && (current.order ?? index) < (winner.order ?? index))
    ) {
      winner = current;
    }
  });

  return winner;
}

export function isBlockingTier(tier: UIEventTier | null | undefined): boolean {
  return Boolean(tier && tier !== 'NON_BLOCKING_NOTIFICATION');
}
