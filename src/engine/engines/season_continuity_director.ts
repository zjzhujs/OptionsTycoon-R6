import type {
  GameState,
  MarketDecisionWindow,
  SeasonContinuityBeat,
} from '../schemas';
import { renderSeasonContinuityVoice } from './character_voice_engine';

const CHARACTER_NAMES: Record<string, string> = {
  maya_chen: 'Maya Chen',
  victor_hale: 'Victor Hale',
  leo_park: 'Leo Park',
  daniel_ross: 'Daniel Ross',
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function quote(value: string | null | undefined, max = 145): string {
  const text = clean(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function salience(window: MarketDecisionWindow): number {
  let score = 0;
  if (window.decision_consequences?.some((item) => item.kind === 'REASONING_INTEGRITY')) score += 80;
  if (window.player_action === 'STOP') score += 68;
  if (window.dramatic_beat === 'OVERNIGHT_GATE' || window.dramatic_beat === 'WEEKEND_GATE') score += 58;
  if (window.player_action === 'REVISE') score += 50;
  if (window.player_action === 'HOLD' || window.player_action === 'DO_NOTHING') score += 34;
  if (window.player_action === 'MANAGE_RISK') score += 28;
  if (window.decision_consequences?.length) score += 14;
  score += Math.min(10, Math.max(0, window.sequence ?? 0));
  return score;
}

function usedSourceIdsToday(state: GameState, currentDate: string): Set<string> {
  return new Set(
    (state.market_window_history ?? [])
      .filter((item) => item.session_date === currentDate && item.season_continuity_beat?.source_window_id)
      .map((item) => String(item.season_continuity_beat!.source_window_id)),
  );
}

function resurfacingCountToday(state: GameState, currentDate: string): number {
  return (state.market_window_history ?? [])
    .filter((item) => item.session_date === currentDate && Boolean(item.season_continuity_beat))
    .length;
}

function selectPriorCommitment(state: GameState, window: MarketDecisionWindow): MarketDecisionWindow | null {
  const used = usedSourceIdsToday(state, window.session_date);
  const candidates = (state.market_window_history ?? [])
    .filter((item) => item.resolved)
    .filter((item) => item.session_date < window.session_date)
    .filter((item) => Boolean(clean(item.player_reason)))
    .filter((item) => !used.has(item.window_id));

  return candidates.sort((a, b) => {
    const byScore = salience(b) - salience(a);
    if (byScore) return byScore;
    const byDate = b.session_date.localeCompare(a.session_date);
    if (byDate) return byDate;
    return (b.sequence ?? 0) - (a.sequence ?? 0);
  })[0] ?? null;
}

function currentSpeaker(window: MarketDecisionWindow, source: MarketDecisionWindow): { id: string | null; name: string | null } {
  const id = window.character_beat?.character_id ?? source.character_beat?.character_id ?? null;
  return { id, name: id ? CHARACTER_NAMES[id] ?? id : null };
}

function challengeFor(state: GameState, speakerId: string | null, source: MarketDecisionWindow, current: MarketDecisionWindow): string {
  return renderSeasonContinuityVoice(state, speakerId, source, current);
}


/**
 * V25: surface at most two older commitments per trading day. The director is
 * intentionally blind to future prices and never selects a source based on
 * eventual P/L. It only reads already-resolved historical player commitments.
 */
export function attachSeasonContinuity(state: GameState, window: MarketDecisionWindow): SeasonContinuityBeat | null {
  if (window.season_continuity_beat) return window.season_continuity_beat;
  if (window.truth_mode !== 'REAL_INTRADAY') return null;
  // Preserve the V22/V24 pacing rule: the first real price reveal gets to breathe.
  if ((window.reveal_time_label ?? '') === '10:30 ET') return null;
  // Jan31 deliberately keeps the midday reversal beat focused on current evidence;
  // old commitments return at 11:30 and the weekend gate, not every window.
  if (window.session_date === '2025-01-31' && !['11:30 ET', '15:30 ET'].includes(window.reveal_time_label ?? '')) return null;
  if (resurfacingCountToday(state, window.session_date) >= 2) return null;

  const source = selectPriorCommitment(state, window);
  if (!source) return null;
  const speaker = currentSpeaker(window, source);
  const strongest = source.decision_consequences?.slice().sort((a, b) => {
    const rank = (kind: string) => kind === 'REASONING_INTEGRITY' ? 4 : kind === 'RISK_DISCIPLINE' ? 3 : kind === 'FUND_PRESSURE' ? 2 : 1;
    return rank(b.kind) - rank(a.kind);
  })[0] ?? null;

  const beat: SeasonContinuityBeat = {
    source_window_id: source.window_id,
    source_decision_id: source.decision_id ?? null,
    source_date: source.session_date,
    source_time_label: source.reveal_time_label ?? null,
    source_action: source.player_action ?? 'DO_NOTHING',
    source_reason: quote(source.player_reason, 180),
    source_consequence_headline: strongest?.headline ?? null,
    speaker_id: speaker.id,
    speaker_name: speaker.name,
    challenge: challengeFor(state, speaker.id, source, window),
    salience: salience(source) >= 70 ? 'HIGH' : 'MEDIUM',
    truth_label: 'SIMULATED',
  };
  window.season_continuity_beat = beat;

  // Keep one main voice. If the current scene already selected a lead character,
  // let that person use the old commitment as the actual challenge instead of
  // stacking a second speech below it.
  if (window.character_beat && speaker.id === window.character_beat.character_id) {
    window.character_beat = { ...window.character_beat, line: beat.challenge };
  }
  return beat;
}
