import rawFactionMissions from '../data/faction_missions.json';
import type { GameState } from '../schemas';

export type MissionFaction = 'MAYA' | 'VICTOR';
export interface FactionMissionCopy { thesis: string; position: string; review: string }

interface FactionTable {
  choice_to_faction: Record<string, MissionFaction>;
  missions: Record<MissionFaction, FactionMissionCopy>;
}
const TABLE = rawFactionMissions as FactionTable;

function choiceIdFromDecision(detail?: string | null, headline?: string | null): string | null {
  const match = detail?.match(/\[choice:([^\]]+)\]/);
  return match?.[1] ?? headline ?? null;
}

export function deriveMissionFaction(state: Pick<GameState, 'player_decisions'>): MissionFaction | null {
  const latest = [...(state.player_decisions ?? [])].reverse().find((decision) => decision.category === 'WAR_ROOM_CHOICE');
  const choiceId = latest ? choiceIdFromDecision(latest.detail, latest.headline) : null;
  return choiceId ? TABLE.choice_to_faction[choiceId] ?? null : null;
}

export function factionMissionCopy(state: Pick<GameState, 'player_decisions'>): FactionMissionCopy | null {
  const faction = deriveMissionFaction(state);
  return faction ? TABLE.missions[faction] : null;
}
