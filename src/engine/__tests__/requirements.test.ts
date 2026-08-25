import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as options_engine from "../engines/options";
import * as trading from "../engines/trading";
import { visible_events } from "../engines/time_guard";

beforeEach(() => {
  localStorage.clear();
});

describe("implementation requirements", () => {
  it("never modifies real market data through story replay", () => {
    const before = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    const view = game.new_game({ campaign_id: "r1", story_seed: 1 });
    for (let index = 1; index < data_loader.get_campaign_nodes("r1").length; index += 1) game.step(view.state.session_id, index);
    expect(data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close)).toEqual(before);
  });

  it("does not leak future information", () => {
    const events = data_loader.load_events()["r1_2025"];
    const game_date = "2025-01-27";
    const visible = visible_events(events, game_date);
    const future = events.filter((event) => event.date > game_date);
    expect(future.length).toBeGreaterThan(0);
    expect(visible.every((event) => event.date <= game_date)).toBe(true);
    const visible_ids = new Set(visible.map((event) => event.id));
    expect(future.some((event) => visible_ids.has(event.id))).toBe(false);
    const view = game.new_game({ campaign_id: "r1", story_seed: 2 });
    const [, market_events] = game.get_market(view.state.session_id);
    expect(market_events.length).toBeGreaterThan(0);
    expect(market_events.every((event) => event.date <= "2025-01-23")).toBe(true);
  });

  it("has no naked-call order side and rejects uncovered calls in every account", () => {
    const order_sides = ["buy_to_open", "sell_to_close", "buy_to_close", "sell_covered_call", "sell_cash_secured_put", "buy_shares", "sell_shares"];
    expect(order_sides.some((side) => side.toLowerCase().includes("naked"))).toBe(false);
    for (const account_type of ["TFSA", "Cash", "Margin"] as const) {
      const view = game.new_game({ campaign_id: "r1", account_type, story_seed: 3 });
      const [, result] = game.place_order(view.state.session_id, { side: "sell_covered_call", type: "call", strike: 150, expiration: "2025-01-31", qty: 1 });
      expect(result.accepted, `covered call without shares must be rejected under ${account_type}`).toBe(false);
    }
  });

  it("requires 100 shares for a covered call", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", story_seed: 4 });
    const sid = view.state.session_id;
    expect(trading.can_write_covered_call(game.get_session(sid), 1)).toBe(false);
    const [, buy_result] = game.place_order(sid, { side: "buy_shares", qty: 1 });
    expect(buy_result.accepted).toBe(true);
    expect(trading.can_write_covered_call(game.get_session(sid), 1)).toBe(true);
    const [, write_result] = game.place_order(sid, { side: "sell_covered_call", type: "call", strike: 150, expiration: "2025-01-31", qty: 1 });
    expect(write_result.accepted).toBe(true);
  });

  it("requires collateral for a cash-secured put", () => {
    const order = { side: "sell_cash_secured_put" as const, type: "put" as const, strike: 150, expiration: "2025-01-31", qty: 1 };
    const poor = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash: 1_000, story_seed: 5 });
    const [, poor_result] = game.place_order(poor.state.session_id, order);
    expect(poor_result.accepted).toBe(false);
    const funded = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash: 50_000, story_seed: 5 });
    const [, funded_result] = game.place_order(funded.state.session_id, order);
    expect(funded_result.accepted).toBe(true);
  });

  it("labels estimated quotes as estimated", () => {
    const view = game.new_game({ campaign_id: "r1", story_seed: 6 });
    const quotes = game.get_chain(view.state.session_id, "2025-01-31", "both");
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((quote) => quote.provenance.source_type === "ESTIMATED")).toBe(true);
  });

  it("does not overwrite a real quote", () => {
    const view = game.new_game({ campaign_id: "r1", story_seed: 7 });
    const state = game.get_session(view.state.session_id);
    const node = game.current_node(state);
    const key = options_engine.contract_key("NVDA", "call", 150, "2025-01-31");
    state.real_quotes![key] = {
      contract_key: key, underlying: "NVDA", type: "call", strike: 150, expiration: "2025-01-31", bid: 10, ask: 10.5, mid: 10.25,
      provenance: { source_type: "REAL", source_name: "test-fixture" },
    };
    const resolved = game.resolve_quote(state, node, "call", 150, "2025-01-31");
    expect(resolved.provenance.source_type).toBe("REAL");
    expect(resolved.mid).toBe(10.25);
    const match = game.get_chain(view.state.session_id, "2025-01-31", "both").find((quote) => quote.contract_key === key)!;
    expect(match.provenance.source_type).toBe("REAL");
    expect(match.mid).toBe(10.25);
  });

  it("keeps the replay market path deterministic", () => {
    const nodes_a = data_loader.load_r1_2025();
    const nodes_b = data_loader.load_r1_2025();
    expect(nodes_a.map((node) => node.date)).toEqual(nodes_b.map((node) => node.date));
    expect(nodes_a.map((node) => node.underlying_bar.close)).toEqual(nodes_b.map((node) => node.underlying_bar.close));
    const v1 = game.new_game({ campaign_id: "r1", story_seed: 100 });
    const v2 = game.new_game({ campaign_id: "r1", story_seed: 200 });
    for (let index = 1; index < nodes_a.length; index += 1) {
      game.step(v1.state.session_id, index);
      game.step(v2.state.session_id, index);
    }
    const [nodes1] = game.get_market(v1.state.session_id);
    const [nodes2] = game.get_market(v2.state.session_id);
    expect(nodes1.map((node) => node.underlying_bar.close)).toEqual(nodes2.map((node) => node.underlying_bar.close));
  });

  it("makes story seeds reproducible", () => {
    const run = (seed: number) => {
      const view = game.new_game({ campaign_id: "r1", story_seed: seed });
      for (let index = 1; index < data_loader.get_campaign_nodes("r1").length; index += 1) game.step(view.state.session_id, index);
      const state = game.get_session(view.state.session_id);
      return [state.story_history!.map((event) => event.template_id), state.pending_story_events!.map((event) => event.template_id), state.fund_stats.compliance_risk] as const;
    };
    expect(run(42_424_242)).toEqual(run(42_424_242));
  });

  it("round-trips a saved state", () => {
    const view = game.new_game({ campaign_id: "r1", story_seed: 9 });
    const sid = view.state.session_id;
    game.step(sid, 2);
    game.place_order(sid, { side: "buy_shares", qty: 1 });
    const before = game.get_session(sid);
    game.save_game(sid, "roundtrip_ts");
    const loaded = game.load_game("roundtrip_ts").state;
    expect(loaded.session_id).toBe(before.session_id);
    expect(loaded.cash).toBe(before.cash);
    expect(loaded.shares).toBe(before.shares);
    expect(loaded.share_cost_basis).toBe(before.share_cost_basis);
    expect(loaded.game_day_index).toBe(before.game_day_index);
    expect(loaded.story_seed).toBe(before.story_seed);
    expect(loaded.campaign_id).toBe(before.campaign_id);
  });
});
