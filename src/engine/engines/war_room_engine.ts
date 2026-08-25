import type { GameState, WarRoomMeeting } from '../schemas';
import * as relationships from './relationships';
import { record_memory } from './character_arc_engine';
import * as story from './story';

export interface WarRoomChoiceApplication {
  choice_id: string;
  message: string;
}

/**
 * Apply the canonical War Room choice table to the live engine state.
 *
 * The choice definitions intentionally remain in story.ts, alongside the
 * public meeting projection. This module is the consequence boundary: UI
 * choice ids enter here, and relationship, LP, trait, hidden-state, and memory
 * effects are committed together.
 */
export function applyWarRoomChoice(
  state: GameState,
  meeting: WarRoomMeeting,
  choiceId: string,
): WarRoomChoiceApplication {
  const choice = story.war_room_choice(choiceId);
  if (!choice) throw new Error(`Unknown War Room choice: ${choiceId}`);

  const alreadySelected = (state.player_decisions ?? []).some(
    (decision) => decision.category === 'WAR_ROOM_CHOICE' && decision.game_date === meeting.date,
  );
  if (alreadySelected) throw new Error(`War Room choice already resolved for ${meeting.date}`);

  state.relationships = relationships.apply_relationship_deltas(
    state.relationships ?? {},
    choice.relationship_deltas,
  );

  const lp = state.fund_stats?.lp_confidence;
  if (typeof lp === 'number') {
    state.fund_stats.lp_confidence = Math.max(0, Math.min(100, lp + choice.lp_confidence_delta));
  }

  const hidden = (state.hidden_state ??= {});
  if (choiceId === 'opt_aggressive') {
    hidden.ego = Math.min(100, (hidden.ego ?? 0) + 4);
    hidden.discipline = Math.max(0, (hidden.discipline ?? 0) - 5);
    hidden.risk_identity = 'AGGRESSIVE';
  } else if (choiceId === 'opt_defensive') {
    hidden.ego = Math.max(0, (hidden.ego ?? 0) - 2);
    hidden.discipline = Math.min(100, (hidden.discipline ?? 0) + 5);
    hidden.risk_identity = 'DEFENSIVE';
  } else {
    hidden.discipline = Math.min(100, (hidden.discipline ?? 0) + 2);
    hidden.risk_identity = 'BALANCED';
  }

  const traits = (state.player_traits ??= []);
  if (!traits.includes(choice.player_trait)) traits.push(choice.player_trait);

  const memorySummary = `War Room ${meeting.date}: ${choice.outcome.visible_consequence}`;
  for (const characterId of Object.keys(choice.relationship_deltas)) {
    const deltas = choice.relationship_deltas[characterId];
    const sentiment = Object.values(deltas).reduce((sum, delta) => sum + delta, 0) >= 0 ? 'FAVORABLE' : 'FRICTION';
    record_memory(state, characterId, memorySummary, sentiment, `war_room_choice:${choiceId}`, meeting.date);
  }

  const lpDelta = choice.lp_confidence_delta >= 0 ? `+${choice.lp_confidence_delta}` : `${choice.lp_confidence_delta}`;
  return {
    choice_id: choiceId,
    message: `${choice.outcome.visible_consequence} LP confidence ${lpDelta}. ${choice.outcome.information_depth}`,
  };
}
