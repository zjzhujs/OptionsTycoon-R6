import type { Relationship } from "../schemas";

export const CHARACTER_IDS = [
  "maya_chen",
  "victor_hale",
  "evelyn_shaw",
  "daniel_ross",
  "marcus_reed",
  "adrian_cross",
  "leo_park",
] as const;

export function default_relationships(): Record<string, Relationship> {
  return Object.fromEntries(
    CHARACTER_IDS.map((character_id) => [character_id, { character_id, trust: 40, respect: 40, fear: 10, favor: 10, rivalry: 0 }])
  );
}

export function apply_relationship_deltas(
  relationships: Record<string, Relationship>,
  deltas: Record<string, Record<string, number>>,
): Record<string, Relationship> {
  for (const [character_id, stat_deltas] of Object.entries(deltas)) {
    const relationship = relationships[character_id];
    if (!relationship) continue;
    for (const [stat, delta] of Object.entries(stat_deltas)) {
      if (!(stat in relationship)) continue;
      const current = (relationship as unknown as Record<string, unknown>)[stat];
      if (typeof current !== "number") continue;
      (relationship as unknown as Record<string, unknown>)[stat] = Math.max(0, Math.min(100, current + delta));
    }
  }
  return relationships;
}
