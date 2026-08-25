/**
 * 存档 schema 迁移
 *
 * 这套测试盯的是**玩家的时间**：存档是他自己玩出来的，
 * 迁移出错宁可留着用不上的旧字段，也不能丢东西。
 *
 * 加版本号之前的所有存档都读不出 schema_version，
 * 那不是损坏，是 v1——必须能正常读起来。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { save_game, load_game, list_saves, delete_save, SAVE_SCHEMA_VERSION } from '../persistence';
import type { GameState } from '../schemas';

const mkState = (over: Partial<GameState> = {}): GameState =>
  ({
    session_id: 's1',
    cash: 50000,
    start_cash: 50000,
    story_seed: 1,
    game_day_index: 3,
    campaign_id: 'r1',
    updated_at: '2026-08-19T00:00:00Z',
    fund_stats: {} as never,
    ...over,
  } as GameState);

/** 直接往 localStorage 里塞一条 v1 存档（没有 schema_version） */
function writeV1(slot: string, state: GameState, equity: number) {
  localStorage.setItem(
    `optionstycoon_save_${slot}`,
    JSON.stringify({
      slot,
      campaign_id: state.campaign_id,
      game_date: '2025-01-29',
      equity,
      updated_at: state.updated_at,
      payload: state,
    }),
  );
}

describe('存档迁移', () => {
  beforeEach(() => localStorage.clear());

  it('新存的档带当前版本号', () => {
    save_game(mkState(), 'a', '2025-01-29', 51000);
    const raw = JSON.parse(localStorage.getItem('optionstycoon_save_a')!);
    expect(raw.schema_version).toBe(SAVE_SCHEMA_VERSION);
  });

  it('v1 老存档（没有版本号）能读起来，不当损坏处理', () => {
    writeV1('old', mkState(), 47743);
    const loaded = load_game('old');
    expect(loaded).not.toBeNull();
    expect(loaded!.session_id).toBe('s1');
    expect(loaded!.cash).toBe(50000);
  });

  it('v1→v2 给 nav_history 补一个"此刻"的单点，不伪造历史曲线', () => {
    // 老存档倒推不出历史净值（那天的持仓已经不在了）。
    // 补一条看起来玩过很久的假曲线，比只有一个点更糟。
    writeV1('old', mkState({ game_day_index: 3 }), 47743);
    const loaded = load_game('old')!;
    expect(loaded.nav_history).toEqual([{ d: 3, v: 47743 }]);
  });

  it('v2→v3 补 canonical ledger、Career Clock 和 lot 归因', () => {
    const state = mkState({
      positions: [{
        id: 'legacy-position',
        kind: 'option',
        underlying: 'NVDA',
        type: 'call',
        strike: 140,
        expiration: '2025-01-31',
        qty: 1,
        entry_price: 5,
        entry_date: '2025-01-23',
        short: false,
        thesis: { id: 'thesis-1' } as never,
      }],
    });
    localStorage.setItem(
      'optionstycoon_save_v2',
      JSON.stringify({
        schema_version: 2,
        slot: 'v2',
        campaign_id: 'r1',
        game_date: '2025-01-29',
        equity: 51_000,
        updated_at: state.updated_at,
        payload: state,
      }),
    );

    const loaded = load_game('v2')!;
    expect(loaded.fund_balance_sheet?.valuation_at).toBe('2025-01-29');
    expect(loaded.fund_balance_sheet?.nav).toBe(51_000);
    expect(loaded.fund_balance_sheet?.valuation_cache_valid).toBe(false);
    expect(loaded.fund_balance_sheet?.position_lots[0].origin_campaign).toBe('r1');
    expect(loaded.fund_balance_sheet?.position_lots[0].thesis_id).toBe('thesis-1');
    expect(loaded.career_clock?.current_at).toBe('2025-01-29');
    expect(loaded.campaign_progress?.r1.status).toBe('ACTIVE_FOCUS');
  });

  it('迁移只加不减：老存档里的字段一个都不能少', () => {
    const st = mkState({ realized_pl: 1234, player_traits: ['aggressive'] });
    writeV1('old', st, 9000);
    const loaded = load_game('old')!;
    expect(loaded.realized_pl).toBe(1234);
    expect(loaded.player_traits).toEqual(['aggressive']);
  });

  it('已经是当前版本的档不再被改写', () => {
    const st = mkState({ nav_history: [{ d: 0, v: 50000 }, { d: 1, v: 51000 }] });
    save_game(st, 'b', '2025-01-29', 51000);
    const loaded = load_game('b')!;
    expect(loaded.nav_history).toHaveLength(2);
  });

  it('槽位列表与删除不受版本影响', () => {
    writeV1('old', mkState(), 100);
    save_game(mkState(), 'newer', '2025-01-30', 200);
    expect(list_saves().map((s) => s.slot).sort()).toEqual(['newer', 'old']);
    expect(delete_save('old')).toBe(true);
    expect(load_game('old')).toBeNull();
  });
});
