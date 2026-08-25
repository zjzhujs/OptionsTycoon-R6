import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as options_engine from "../engines/options";

const EXPIRY = "2025-02-21";

beforeEach(() => {
  localStorage.clear();
});

function session(start_cash = 50_000) {
  return game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash }).state.session_id;
}

function thesis(over: Record<string, unknown> = {}) {
  return {
    contract_or_symbol: "CALL", direction: "BULLISH", catalyst: "AI capex beat", expected_move_pct: 6,
    time_horizon_days: 6, invalidation_level: 140, why_instrument: "buy call for convexity", risk_budget_usd: 3_000, ...over,
  };
}

function order(side: "buy_to_open" | "sell_to_close", strike: number, order_thesis?: ReturnType<typeof thesis>, qty = 1, expiration = EXPIRY) {
  return { side, type: "call" as const, strike, expiration, qty, order_kind: "Market" as const, thesis: order_thesis };
}

function strike_that_drops_off_the_ladder() {
  const nodes = data_loader.get_campaign_nodes("r1");
  const early = options_engine.strikes_around(nodes[0].underlying_bar.close, "r1");
  const later = options_engine.strikes_around(nodes[2].underlying_bar.close, "r1");
  const gone = early.filter((strike) => !later.includes(strike));
  expect(gone.length, "campaign no longer moves enough to exercise this case").toBeGreaterThan(0);
  return gone[gone.length - 1];
}

describe("pre-audit discipline fixes", () => {
  it("does not grant discipline for a closing order with a thesis", () => {
    const sid = session();
    game.place_order(sid, order("buy_to_open", 140, thesis()));
    const before = game.get_session(sid).hidden_state!.discipline!;
    game.place_order(sid, order("sell_to_close", 140, thesis()));
    expect(game.get_session(sid).hidden_state!.discipline!).toBeLessThanOrEqual(before);
  });

  it("does not credit the same exposure twice", () => {
    const sid = session();
    game.place_order(sid, order("buy_to_open", 140, thesis()));
    const after_first = game.get_session(sid).hidden_state!.discipline!;
    game.place_order(sid, order("buy_to_open", 140, thesis()));
    expect(game.get_session(sid).hidden_state!.discipline!).toBe(after_first);
  });

  it("grants no discipline for a rejected order", () => {
    const sid = session(50);
    const before = game.get_session(sid).hidden_state!.discipline!;
    const [, result] = game.place_order(sid, order("buy_to_open", 140, thesis(), 50));
    expect(result.accepted).toBe(false);
    expect(game.get_session(sid).hidden_state!.discipline).toBe(before);
  });

  it("does not let repeated rejected orders farm discipline", () => {
    const sid = session(50);
    const before = game.get_session(sid).hidden_state!.discipline!;
    for (let i = 0; i < 20; i += 1) game.place_order(sid, order("buy_to_open", 140, thesis(), 50));
    expect(game.get_session(sid).hidden_state!.discipline).toBe(before);
  });

  it("still rewards opening with a thesis once", () => {
    const sid = session();
    const before = game.get_session(sid).hidden_state!.discipline!;
    const [, result] = game.place_order(sid, order("buy_to_open", 140, thesis()));
    expect(result.accepted).toBe(true);
    expect(game.get_session(sid).hidden_state!.discipline!).toBeGreaterThan(before);
  });

  it("does not penalize closing without a thesis", () => {
    const sid = session();
    game.place_order(sid, order("buy_to_open", 140, thesis()));
    const before = game.get_session(sid).hidden_state!.discipline!;
    const [, result] = game.place_order(sid, order("sell_to_close", 140));
    expect(result.accepted).toBe(true);
    expect(game.get_session(sid).hidden_state!.discipline!).toBeGreaterThanOrEqual(before);
  });

  it("still penalizes opening without a thesis", () => {
    const sid = session();
    const before = game.get_session(sid).hidden_state!.discipline!;
    const [, result] = game.place_order(sid, order("buy_to_open", 140));
    expect(result.accepted).toBe(true);
    expect(game.get_session(sid).hidden_state!.discipline!).toBeLessThan(before);
  });
});

describe("held contracts remain closeable off the displayed ladder", () => {
  it("confirms the campaign actually moves strikes off the ladder", () => {
    expect(strike_that_drops_off_the_ladder()).toBeGreaterThan(0);
  });

  it("keeps an off-ladder held contract valuable", () => {
    const sid = session();
    const target = strike_that_drops_off_the_ladder();
    const [sv, result] = game.place_order(sid, order("buy_to_open", target, thesis()));
    expect(result.accepted).toBe(true);
    const pos_id = sv.state.positions![sv.state.positions!.length - 1].id;
    for (let i = 0; i < 3; i += 1) game.advance_market(sid, "NEXT_NODE");
    const state = game.get_session(sid);
    const node = game.current_node(state);
    expect(options_engine.strikes_around(node.underlying_bar.close, "r1")).not.toContain(target);
    const view = game.compute_view(state);
    expect(state.positions!.some((position) => position.id === pos_id)).toBe(true);
    const marks = new Map(view.position_marks!.map((mark) => [mark.position_id, mark]));
    expect(marks.has(pos_id)).toBe(true);
    expect(marks.get(pos_id)!.mark).toBeDefined();
  });

  it("still offers the held contract in the chain response", () => {
    const sid = session();
    const target = strike_that_drops_off_the_ladder();
    game.place_order(sid, order("buy_to_open", target, thesis()));
    for (let i = 0; i < 3; i += 1) game.advance_market(sid, "NEXT_NODE");
    const key = options_engine.contract_key("NVDA", "call", target, EXPIRY);
    for (const side of ["both", "call"] as const) {
      expect(game.get_chain(sid, EXPIRY, side).map((quote) => quote.contract_key)).toContain(key);
    }
  });

  it("can close an off-ladder held contract", () => {
    const sid = session();
    const target = strike_that_drops_off_the_ladder();
    const [sv] = game.place_order(sid, order("buy_to_open", target, thesis()));
    const pos_id = sv.state.positions![0].id;
    for (let i = 0; i < 3; i += 1) game.advance_market(sid, "NEXT_NODE");
    const [closed, result] = game.place_order(sid, order("sell_to_close", target));
    expect(result.accepted, result.message).toBe(true);
    expect(closed.state.positions!.some((position) => position.id === pos_id)).toBe(false);
    expect(closed.state.trade_reviews!.length).toBeGreaterThan(0);
  });

  it("keeps the normal ladder unchanged when nothing is held", () => {
    const sid = session();
    const state = game.get_session(sid);
    const ladder = new Set(options_engine.strikes_around(game.current_node(state).underlying_bar.close, "r1"));
    const strikes = new Set(game.get_chain(sid, EXPIRY, "both").map((quote) => quote.strike));
    expect(strikes).toEqual(ladder);
  });
});

describe("DATA_UNAVAILABLE provenance", () => {
  it("never tags numeric flow fields DATA_UNAVAILABLE", () => {
    const sid = session();
    const flow = game.compute_view(game.get_session(sid)).flow_summary!;
    const numeric_fields: Record<string, string | undefined> = {
      open_interest_change: flow.open_interest_change_source_type,
      put_call_ratio: flow.put_call_ratio_source_type,
      relative_options_vol: flow.relative_options_vol_source_type,
      large_sweep_count: flow.large_sweep_count_source_type,
    };
    for (const [name, source] of Object.entries(numeric_fields)) {
      expect(source, `${name} prints a number but is tagged DATA_UNAVAILABLE`).not.toBe("DATA_UNAVAILABLE");
    }
  });

  it("keeps signed dealer inventory unavailable and without a value", () => {
    const sid = session();
    const counterparty = game.compute_view(game.get_session(sid)).counterparty_profile!;
    expect(counterparty.dealer_inventory_signed_source_type).toBe("DATA_UNAVAILABLE");
    expect("dealer_inventory_signed" in counterparty).toBe(false);
    expect(counterparty.dealer_inventory_note).toBeTruthy();
  });
});
