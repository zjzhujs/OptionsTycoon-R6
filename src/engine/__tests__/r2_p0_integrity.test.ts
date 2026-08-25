import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as game from '../game';
import * as trading from '../engines/trading';

describe('R2 P0 integrity', () => {
  it('applies the canonical War Room consequence without placeholder state', () => {
    const before = game.new_game({ campaign_id: 'r1', mode: 'STORY_CAMPAIGN', account_type: 'Margin', start_cash: 100_000, story_seed: 3 });
    const [after, message] = game.resolve_war_room_choice(before.state.session_id, 'opt_defensive');
    expect(message).toContain('LP');
    expect(after.state.player_traits).toContain('RISK_DISCIPLINED');
    expect(after.state.character_memories?.victor_hale?.[0]).toMatchObject({ key_fact: 'war_room_choice:opt_defensive' });
    expect(after.state.player_decisions?.[0]?.detail).toContain('[choice:opt_defensive]');
  });

  it('fills a client order once even when the same id is submitted twice', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Margin', start_cash: 100_000, story_seed: 4 });
    const request = { client_order_id: 'r2-concurrent-order-1', side: 'buy_to_open' as const, type: 'call' as const, strike: 100, expiration: '2025-02-07', qty: 1 };
    const [, first] = game.place_order(view.state.session_id, request);
    const [after, second] = game.place_order(view.state.session_id, request);
    expect(first.accepted).toBe(true);
    expect(first.filled_qty).toBe(1);
    expect(second.accepted).toBe(false);
    expect(second.execution_label).toBe('DUPLICATE_ORDER');
    expect(after.state.positions.filter((position) => position.type === 'call')).toHaveLength(1);
  });

  it('reconciles long worthless expiry realized P&L and reason into Trade Review', () => {
    const state = {
      campaign_id: 'r1',
      account_type: 'Cash',
      cash: 10_000,
      realized_pl: 0,
      margin_debt: 0,
      positions: [{ id: 'expiry-long', kind: 'option', underlying: 'NVDA', type: 'call', strike: 110, expiration: '2025-01-27', qty: 2, entry_price: 5, entry_date: '2025-01-23', short: false }],
      trade_reviews: [],
      active_theses: {},
      fund_stats: { cash: 10_000, nav: 10_000, aum: 10_000 },
    } as any;
    trading.settle_expiries(state, { date: '2025-01-27', underlying_bar: { close: 100 } } as any);
    expect(state.realized_pl).toBe(-1_000);
    expect(state.trade_reviews[0].realized_pl).toBe(-1_000);
    expect(state.trade_reviews[0].exit_reason).toBe('EXPIRED_WORTHLESS');
  });

  it('keeps placeholder consequence markers out of engine source', () => {
    const engineRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const forbidden = new RegExp(`${'dummy'}_${'memory'}|${'dummy'} consequence`, 'i');
    const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__') return [];
      const path = join(directory, entry.name);
      return entry.isDirectory() ? visit(path) : path.endsWith('.ts') ? [path] : [];
    });
    for (const file of visit(engineRoot)) expect(readFileSync(file, 'utf8')).not.toMatch(forbidden);
  });
});
