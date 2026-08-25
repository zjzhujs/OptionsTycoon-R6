import { describe, expect, it } from 'vitest';
import { buildWarRoomClash, deriveWarRoomClashContext } from '../engines/war_room_clash_engine';

describe('Batch4 War Room clash', () => {
  it('builds a deterministic 2-3 round Maya → Victor → Leo exchange with quoted replies and no mutation', () => {
    const state = {
      game_day_index: 2,
      cash: 100_000,
      margin_debt: 0,
      max_drawdown_pct: 2,
      nav_history: [{ d: 0, v: 100_000 }, { d: 1, v: 94_000 }],
      fund_stats: { compliance_risk: 10, counterparty_trust: 70 },
      relationships: {
        maya_chen: { trust: 40 }, victor_hale: { trust: 40 }, leo_park: { trust: 40 },
      },
      player_traits: [],
      character_memories: {},
    } as any;
    const before = JSON.stringify(state);
    const context = deriveWarRoomClashContext(state, null);
    const messages = buildWarRoomClash(state, null);
    expect(context.kind).toBe('PNL_RECKONING');
    expect(messages.length).toBeGreaterThanOrEqual(6);
    expect(messages.slice(0, 3).map((m) => [m.character_id, m.stance])).toEqual([
      ['maya_chen', 'ATTACK'], ['victor_hale', 'DEFEND'], ['leo_park', 'SNIPE'],
    ]);
    expect(messages[1].reply_to_character_id).toBe('maya_chen');
    expect(messages[1].message).toContain(messages[1].reply_to_excerpt!);
    for (const message of messages.filter((item) => item.reply_to_excerpt)) {
      expect(message.reply_to_excerpt!.length).toBeLessThanOrEqual(13);
      expect(message.reply_to_excerpt).not.toMatch(/[“”‘’"']/);
      expect((message.message.match(/[“‘]/g) ?? []).length).toBeLessThanOrEqual(1);
    }
    expect(JSON.stringify(state)).toBe(before);
  });
});
