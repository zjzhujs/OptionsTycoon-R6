import { describe, expect, it } from 'vitest';
import { deriveMissionFaction, factionMissionCopy } from '../engines/faction_mission_engine';

describe('Batch4 faction mission variants', () => {
  it('maps the latest War Room side to table-driven step 4-6 copy', () => {
    const maya = { player_decisions: [{ category: 'WAR_ROOM_CHOICE', game_date: '2025-01-23', headline: 'opt_aggressive', detail: '[choice:opt_aggressive]' }] } as any;
    const victor = { player_decisions: [{ category: 'WAR_ROOM_CHOICE', game_date: '2025-01-23', headline: 'opt_defensive', detail: '[choice:opt_defensive]' }] } as any;
    expect(deriveMissionFaction(maya)).toBe('MAYA');
    expect(factionMissionCopy(maya)?.thesis).toContain('Maya线');
    expect(deriveMissionFaction(victor)).toBe('VICTOR');
    expect(factionMissionCopy(victor)?.position).toContain('Victor线');
  });
});
