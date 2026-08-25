import type { GameState, WarRoomHistoryEntry, WarRoomMeeting } from "../schemas";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function ensure_history(state: GameState): WarRoomHistoryEntry[] {
  state.war_room_history ??= [];
  return state.war_room_history;
}

/**
 * Append one immutable meeting snapshot. A node is archived once: resolving
 * the meeting records the choice immediately; leaving that node later only
 * fills the archive if no choice was made, so duplicate dates never appear.
 */
export function append_snapshot(
  state: GameState,
  meeting: WarRoomMeeting | null | undefined,
  choice_id: string | null = null,
): boolean {
  if (!meeting?.date) return false;
  const history = ensure_history(state);
  if (history.some((entry) => entry.date === meeting.date)) return false;

  const choice = meeting.choices?.find((candidate) => candidate.id === choice_id);
  history.push({
    date: meeting.date,
    topic: meeting.topic,
    agenda: meeting.agenda,
    messages: clone(meeting.messages ?? []),
    choice_id,
    choice_label: choice?.label ?? null,
  });
  return true;
}
