import rawLines from '../data/character_echo_lines.json';
import type { GrudgeLedgerEntry } from '../schemas';

export type CharacterEchoSlot = 'BACKED_WIN' | 'BACKED_LOSS' | 'OVERRULED_WIN' | 'OVERRULED_LOSS';

export interface EchoTimelineEvent {
  category?: string;
  headline?: string;
  detail?: string;
  game_date?: string;
}

export interface EchoRelationship {
  trust?: number;
  respect?: number;
  favor?: number;
}

export interface EchoMemory {
  timestamp?: string;
  summary?: string;
  sentiment?: string;
  key_fact?: string;
}

export interface CharacterEchoHost {
  game_day_index?: number;
  start_cash?: number;
  nav_history?: Array<{ d: number; v: number }>;
  player_decisions?: EchoTimelineEvent[];
  relationships?: Record<string, EchoRelationship>;
  grudge_ledger?: GrudgeLedgerEntry[];
  character_memories?: Record<string, EchoMemory[]>;
}

export interface MorningEcho {
  characterId: string;
  characterName: string;
  slot: CharacterEchoSlot;
  line: string;
  choiceId: string;
  previousDate: string;
  pnlUsd: number;
  pnlPct: number;
  trust: number | null;
  grudgeWeight: number;
  memoryCount: number;
}

interface ChoiceSides {
  backed: string[];
  overruled: string[];
}

const CHOICE_SIDES: Record<string, ChoiceSides> = {
  opt_aggressive: { backed: ['maya_chen'], overruled: ['victor_hale'] },
  opt_defensive: { backed: ['victor_hale'], overruled: ['maya_chen'] },
  opt_macro_hedge: { backed: ['leo_park', 'victor_hale'], overruled: ['maya_chen'] },
};

const CHARACTER_NAMES: Record<string, string> = {
  maya_chen: 'Maya Chen',
  victor_hale: 'Victor Hale',
  leo_park: 'Leo Park',
  daniel_ross: 'Daniel Ross',
  marcus_reed: 'Marcus Reed',
  evelyn_shaw: 'Evelyn Shaw',
  adrian_cross: 'Adrian Cross',
};

const ECHO_LINES = rawLines as Record<string, Partial<Record<CharacterEchoSlot, string>>>;

function choiceIdFromDecision(decision: EchoTimelineEvent): string | null {
  const detailMatch = decision.detail?.match(/\[choice:([^\]]+)\]/)?.[1];
  if (detailMatch) return detailMatch;
  const headline = decision.headline ?? '';
  return CHOICE_SIDES[headline] ? headline : null;
}

function previousDayPnl(state: CharacterEchoHost): { pnlUsd: number; pnlPct: number } | null {
  const currentDay = state.game_day_index ?? 0;
  const previousDay = currentDay - 1;
  if (previousDay < 0) return null;

  const history = state.nav_history ?? [];
  const end = history.find((point) => point.d === previousDay)?.v;
  if (!Number.isFinite(end)) return null;

  const before = previousDay === 0
    ? state.start_cash
    : history.find((point) => point.d === previousDay - 1)?.v;
  if (!Number.isFinite(before) || Number(before) === 0) return null;

  const pnlUsd = Number(end) - Number(before);
  return { pnlUsd, pnlPct: (pnlUsd / Number(before)) * 100 };
}

function activeGrudgeWeight(state: CharacterEchoHost, characterId: string): number {
  return (state.grudge_ledger ?? [])
    .filter((row) => row.subject === characterId && row.kind === 'GRUDGE' && !row.spent)
    .reduce((sum, row) => sum + Math.max(0, Number(row.weight) || 0), 0);
}

function candidateHeat(state: CharacterEchoHost, characterId: string, backed: boolean, won: boolean): number {
  const trust = state.relationships?.[characterId]?.trust;
  const trustHeat = Number.isFinite(trust) ? Math.abs(Number(trust) - 50) * 0.08 : 0;
  const grudge = activeGrudgeWeight(state, characterId) * 0.6;
  const memoryCount = state.character_memories?.[characterId]?.length ?? 0;
  const memoryHeat = Math.min(3, memoryCount * 0.25);
  const dramaticFit = (won && backed) || (!won && !backed) ? 4 : 0;
  return trustHeat + grudge + memoryHeat + dramaticFit;
}

export function lineForEcho(characterId: string, slot: CharacterEchoSlot): string {
  return ECHO_LINES[characterId]?.[slot]
    ?? (slot.includes('WIN')
      ? '昨天的选择已经有结果。别急着庆祝，先把你真正看对的东西写下来。'
      : '昨天的选择已经有结果。先别找借口，把哪条假设断了说清楚。');
}

/**
 * Pure next-morning selector. It reads existing decisions, NAV, relationships,
 * memories and grudge ledger; it never mutates any gameplay number.
 */
export function deriveMorningEcho(
  state: CharacterEchoHost,
  currentDate: string,
  previousDate?: string | null,
): MorningEcho | null {
  const result = previousDayPnl(state);
  if (!result || !previousDate || !currentDate || previousDate >= currentDate) return null;

  const decision = [...(state.player_decisions ?? [])]
    .reverse()
    .find((row) => row.category === 'WAR_ROOM_CHOICE' && row.game_date === previousDate);
  if (!decision) return null;

  const choiceId = choiceIdFromDecision(decision);
  const sides = choiceId ? CHOICE_SIDES[choiceId] : null;
  if (!choiceId || !sides) return null;

  const won = result.pnlUsd >= 0;
  const candidates = [
    ...sides.backed.map((characterId) => ({ characterId, backed: true })),
    ...sides.overruled.map((characterId) => ({ characterId, backed: false })),
  ];
  if (!candidates.length) return null;

  candidates.sort((a, b) => candidateHeat(state, b.characterId, b.backed, won) - candidateHeat(state, a.characterId, a.backed, won));
  const selected = candidates[0];
  const slot: CharacterEchoSlot = selected.backed
    ? (won ? 'BACKED_WIN' : 'BACKED_LOSS')
    : (won ? 'OVERRULED_WIN' : 'OVERRULED_LOSS');
  const trustRaw = state.relationships?.[selected.characterId]?.trust;

  return {
    characterId: selected.characterId,
    characterName: CHARACTER_NAMES[selected.characterId] ?? selected.characterId,
    slot,
    line: lineForEcho(selected.characterId, slot),
    choiceId,
    previousDate,
    pnlUsd: result.pnlUsd,
    pnlPct: result.pnlPct,
    trust: Number.isFinite(trustRaw) ? Number(trustRaw) : null,
    grudgeWeight: activeGrudgeWeight(state, selected.characterId),
    memoryCount: state.character_memories?.[selected.characterId]?.length ?? 0,
  };
}
