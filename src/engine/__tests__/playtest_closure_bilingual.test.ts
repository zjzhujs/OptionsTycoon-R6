import { beforeEach, describe, expect, it } from "vitest";

import * as game from "../game";
import { position_decision_triggers } from "../engines/market_clock";
import type { GameState, GameStateView, Position, PositionMark, TradeThesis } from "../schemas";

beforeEach(() => {
  localStorage.clear();
});

function make_position(overrides: Partial<Position> = {}): Position {
  return {
    id: "pos-1", kind: "option", underlying: "NVDA", type: "call", strike: 150, expiration: "2025-01-31", qty: 1,
    entry_price: 2, entry_date: "2025-01-01", ...overrides,
  };
}

function fake_state(positions: Position[], active_theses: Record<string, TradeThesis> = {}) {
  return { positions, active_theses } as unknown as GameState;
}

function fake_view(position_marks: PositionMark[]) {
  return { position_marks } as unknown as GameStateView;
}

describe("playtest closure bilingual pass", () => {
  it("makes guided Step 6 market advance idempotent", () => {
    const view = game.new_game({ campaign_id: "r1" });
    const sid = view.state.session_id;
    const guided = game.set_tutorial_progress(sid, { guided_active: true, current_step: "MARKET_PAUSED" });
    expect(guided.state.tutorial!.step6_advance_consumed).toBe(false);
    const initial_node = guided.state.game_day_index!;
    const after_first = game.advance_market(sid, "NEXT_NODE");
    expect(after_first.state.tutorial!.step6_advance_consumed).toBe(true);
    expect(after_first.state.game_day_index).toBe(initial_node + 1);
    const after_second = game.advance_market(sid, "NEXT_NODE");
    expect(after_second.state.game_day_index).toBe(initial_node + 1);
  });

  it("persists Step 6 consumption through save/load", () => {
    const view = game.new_game({ campaign_id: "r1" });
    const sid = view.state.session_id;
    game.set_tutorial_progress(sid, { guided_active: true, current_step: "MARKET_PAUSED" });
    game.advance_market(sid, "NEXT_NODE");
    game.save_game(sid, "slot_test_step6_ts");
    const loaded = game.load_game("slot_test_step6_ts");
    expect(loaded.state.tutorial!.step6_advance_consumed).toBe(true);
    const node_before = loaded.state.game_day_index;
    const retry = game.advance_market(sid, "NEXT_NODE");
    expect(retry.state.game_day_index).toBe(node_before);
  });

  it("prioritizes thesis invalidation over giveback and significant profit", () => {
    const position = make_position({ peak_unrealized_pl: 300 });
    const state = fake_state([position], {
      [position.id]: {
        id: "t1", contract_or_symbol: "NVDA", direction: "BULLISH", catalyst: "test", expected_move_pct: 5,
        time_horizon_days: 5, invalidation_level: 160, why_instrument: "option", risk_budget_usd: 1_000, created_at_date: "2024-01-01",
      },
    });
    const view = fake_view([{ position_id: position.id, mark: 2.9, pl: 90 }]);
    const reasons = position_decision_triggers(state, view, 150);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].headline).toMatch(/^THESIS INVALIDATION/);
    expect(position.invalidation_decision_fired).toBe(true);
    expect(position.profit_giveback_decision_fired).toBe(true);
    expect(position.significant_profit_decision_fired).toBe(true);
  });

  it("prioritizes giveback over significant profit", () => {
    const position = make_position({ peak_unrealized_pl: 300 });
    const reasons = position_decision_triggers(fake_state([position]), fake_view([{ position_id: position.id, mark: 2.9, pl: 90 }]), 150);
    expect(reasons).toHaveLength(1);
    expect(reasons[0].headline).toMatch(/^PROFIT GIVEBACK/);
    expect(position.profit_giveback_decision_fired).toBe(true);
    expect(position.significant_profit_decision_fired).toBe(true);
  });
});
