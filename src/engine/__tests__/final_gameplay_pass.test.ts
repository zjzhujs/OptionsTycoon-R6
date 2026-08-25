import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as thesis_history_engine from "../engines/thesis_history";
import type { ThesisRevision, TradeReview } from "../schemas";

const CALL_140 = { type: "call" as const, strike: 140, expiration: "2025-01-31" };

beforeEach(() => {
  localStorage.clear();
});

function new_session(start_cash = 50_000) {
  const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash });
  return [view.state.session_id, view] as const;
}

function thesis(over: Record<string, unknown> = {}) {
  return {
    contract_or_symbol: "CALL 140 (2025-01-31)",
    direction: "BULLISH",
    catalyst: "AI capex beat",
    expected_move_pct: 6,
    time_horizon_days: 6,
    invalidation_level: 140,
    why_instrument: "buy call for convexity",
    risk_budget_usd: 5_000,
    ...over,
  };
}

function buy_call(sid: string, order_thesis?: ReturnType<typeof thesis>) {
  return game.place_order(sid, { side: "buy_to_open", qty: 1, order_kind: "Market", thesis: order_thesis, ...CALL_140 });
}

describe("final integrated gameplay pass", () => {
  it("does not advance the market without explicit advance", () => {
    const [sid, view] = new_session();
    expect(view.market_clock!.paused).toBe(true);
    const start = view.market_clock!.current_node_index;
    for (let i = 0; i < 5; i += 1) game.get_view(sid);
    game.get_scanner(sid);
    expect(game.get_view(sid).market_clock!.current_node_index).toBe(start);
  });

  it("real-time waiting does not affect the historical node or price", async () => {
    const [sid, view] = new_session();
    const start_idx = view.market_clock!.current_node_index;
    const start_date = view.market_clock!.current_node_date;
    const start_price = game.current_node(game.get_session(sid)).underlying_bar.close;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const after = game.get_view(sid);
    expect(after.market_clock!.current_node_index).toBe(start_idx);
    expect(after.market_clock!.current_node_date).toBe(start_date);
    expect(game.current_node(game.get_session(sid)).underlying_bar.close).toBe(start_price);
  }, 5_000);

  it("advances exactly one valid historical node", () => {
    const [sid] = new_session();
    const nodes = data_loader.get_campaign_nodes("r1");
    const view = game.advance_market(sid, "NEXT_NODE");
    expect(view.market_clock!.current_node_index).toBe(1);
    expect(view.market_clock!.nodes_advanced_last_call).toBe(1);
    expect(view.market_clock!.current_node_date).toBe(nodes[1].date);
    expect(view.market_clock!.node_granularity).toBe("DAILY");
    expect(view.market_clock!.paused).toBe(true);
  });

  it("stops at the final node and never runs past data", () => {
    const [sid] = new_session();
    const nodes = data_loader.get_campaign_nodes("r1");
    for (let i = 0; i < nodes.length + 5; i += 1) game.advance_market(sid, "NEXT_NODE");
    const view = game.get_view(sid);
    expect(view.market_clock!.current_node_index).toBe(nodes.length - 1);
    expect(view.market_clock!.is_final_node).toBe(true);
  });

  it("creates pause reasons for important events", () => {
    const [sid] = new_session();
    const view = game.advance_market(sid, "NEXT_NODE");
    expect(view.market_clock!.pause_reasons!.length).toBeGreaterThanOrEqual(1);
    for (const reason of view.market_clock!.pause_reasons!) {
      expect(reason.headline).toBeTruthy();
      expect(["MANDATORY", "NOTABLE", "ROUTINE"]).toContain(reason.severity);
    }
  });

  it("NEXT_MAJOR_EVENT cannot skip a mandatory event", () => {
    const [sid] = new_session();
    const nodes = data_loader.get_campaign_nodes("r1");
    const view = game.advance_market(sid, "NEXT_MAJOR_EVENT", 50);
    expect(view.market_clock!.current_node_index).toBeLessThan(nodes.length - 1);
    expect(view.market_clock!.pause_reasons!.length).toBeGreaterThanOrEqual(1);
    expect(view.market_clock!.pause_reasons!.some((reason) => reason.severity === "MANDATORY")).toBe(true);
  });

  it("freezes entry thesis through three revisions", () => {
    const [sid] = new_session();
    const [sv, result] = buy_call(sid, thesis());
    expect(result.accepted).toBe(true);
    const pos_id = sv.state.positions![sv.state.positions!.length - 1].id;
    const entry = sv.state.thesis_history![pos_id][0];
    expect(entry.is_entry).toBe(true);
    const entry_catalyst = entry.catalyst;
    const entry_horizon = entry.time_horizon_days;
    const entry_inval = entry.invalidation_level;

    for (let i = 0; i < 3; i += 1) {
      game.revise_thesis(sid, {
        position_id: pos_id, direction: "BULLISH", catalyst: `revised catalyst ${i}`, expected_move_pct: 9,
        time_horizon_days: 45 + i, invalidation_level: 110 - i, why_instrument: "long-term company story",
        risk_budget_usd: 5_000, revision_reason: `reason ${i}`,
      });
    }
    const history = game.get_session(sid).thesis_history![pos_id];
    expect(history).toHaveLength(4);
    expect(history[0].is_entry).toBe(true);
    expect(history[0].catalyst).toBe(entry_catalyst);
    expect(history[0].time_horizon_days).toBe(entry_horizon);
    expect(history[0].invalidation_level).toBe(entry_inval);
  });

  it("requires a reason for thesis revision", () => {
    const [sid] = new_session();
    const [sv] = buy_call(sid, thesis());
    const pos_id = sv.state.positions![0].id;
    expect(() => game.revise_thesis(sid, {
      position_id: pos_id, direction: "BULLISH", catalyst: "x", expected_move_pct: 1,
      time_horizon_days: 5, invalidation_level: 130, why_instrument: "y", risk_budget_usd: 100,
      revision_reason: "   ",
    })).toThrow();
  });

  function rev(idx: number, over: Partial<ThesisRevision> = {}): ThesisRevision {
    return {
      revision_index: idx, revision_id: `r${idx}`, game_date: `2025-01-2${idx}`, node_index: idx,
      direction: "BULLISH", catalyst: "AI capex beat", expected_move_pct: 6, time_horizon_days: 6,
      invalidation_level: 140, why_instrument: "buy call for convexity", risk_budget_usd: 5_000,
      revision_reason: "", underlying_at_revision: 147, is_entry: idx === 0, ...over,
    };
  }

  it("marks invalidation plus a rationale swap as severe drift", () => {
    const assessment = thesis_history_engine.assess_drift([
      rev(0),
      rev(1, { catalyst: "long-term AI story remains intact", why_instrument: "long-term company story", revision_reason: "still believe", underlying_at_revision: 135 }),
    ]);
    expect(assessment.level).toBe("SEVERE");
    expect(assessment.findings!.some((finding) => finding.rule_id === "catalyst_replaced_after_invalidation")).toBe(true);
    expect(assessment.findings!.every((finding) => Boolean(finding.evidence))).toBe(true);
  });

  it("does not call an adaptive revision severe drift", () => {
    const assessment = thesis_history_engine.assess_drift([
      rev(0),
      rev(1, { catalyst: "new hyperscaler capex guidance", revision_reason: "fresh guidance published after entry", underlying_at_revision: 150 }),
    ]);
    expect(["NONE", "MINOR"]).toContain(assessment.level);
    expect(assessment.adaptive_notes!.length).toBeGreaterThan(0);
  });

  it("does not fabricate an invalidation breach for non-directional theses", () => {
    const assessment = thesis_history_engine.assess_drift([
      rev(0, { direction: "VOL_EXPANSION" }),
      rev(1, { direction: "VOL_EXPANSION", catalyst: "different catalyst", revision_reason: "vol regime changed", underlying_at_revision: 100 }),
    ]);
    expect(assessment.level).not.toBe("SEVERE");
    expect(assessment.findings!.some((finding) => finding.rule_id.includes("after_invalidation"))).toBe(false);
  });

  function round_trip_trade(sid: string): TradeReview {
    const [sv] = buy_call(sid, thesis());
    const pos_id = sv.state.positions![0].id;
    game.advance_market(sid, "NEXT_NODE");
    game.record_player_decision(sid, "HOLD", "閫夋嫨缁х画鎸佹湁", "鏈钩浠?", pos_id);
    game.advance_market(sid, "NEXT_NODE");
    const [svc] = game.place_order(sid, { side: "sell_to_close", qty: 1, order_kind: "Market", ...CALL_140 });
    return svc.state.trade_reviews![svc.state.trade_reviews!.length - 1];
  }

  it("keeps the decision timeline chronological", () => {
    const [sid] = new_session();
    const review = round_trip_trade(sid);
    const dates = review.decision_timeline!.map((event) => event.game_date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.length).toBeGreaterThan(0);
  });

  it("does not leak future information through the decision timeline", () => {
    const [sid] = new_session();
    const review = round_trip_trade(sid);
    for (const event of review.decision_timeline!) {
      expect(event.game_date >= review.entry_date).toBe(true);
      expect(event.game_date <= review.exit_date).toBe(true);
    }
  });

  it("carries thesis evolution and drift into the review", () => {
    const [sid] = new_session();
    const review = round_trip_trade(sid);
    expect(review.thesis_evolution!.length).toBeGreaterThanOrEqual(1);
    expect(review.thesis_evolution![0].is_entry).toBe(true);
  });

  it("persists tutorial and clock through save/load", () => {
    const [sid] = new_session();
    const [sv] = buy_call(sid, thesis());
    const pos_id = sv.state.positions![0].id;
    game.advance_market(sid, "NEXT_NODE");
    game.record_player_decision(sid, "HOLD", "缁х画鎸佹湁", "", pos_id);
    game.set_tutorial_progress(sid, { completed: true, tutorial_direction: "BULLISH", completed_step: "step_1_market_view", first_trade_position_id: pos_id });

    const before = game.get_view(sid);
    game.save_game(sid, "final_gameplay_pass_ts_slot");
    const state = game.load_game("final_gameplay_pass_ts_slot").state;
    expect(state.tutorial!.tutorial_completed).toBe(true);
    expect(state.tutorial!.tutorial_direction).toBe("BULLISH");
    expect(state.tutorial!.completed_steps).toContain("step_1_market_view");
    expect(state.tutorial!.first_trade_position_id).toBe(pos_id);
    expect(state.market_clock!.current_node_index).toBe(before.state.market_clock!.current_node_index);
    expect(state.market_clock!.paused).toBe(true);
    expect(state.thesis_history![pos_id].length).toBeGreaterThanOrEqual(1);
    expect(state.player_decisions!.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects a tutorial position ID that does not exist", () => {
    const [sid] = new_session();
    const view = game.set_tutorial_progress(sid, { first_trade_position_id: "not-a-real-position" });
    expect(view.state.tutorial!.first_trade_position_id).not.toBe("not-a-real-position");
  });

  it("clears stale campaign-end pause reasons on episode switch", () => {
    const [sid] = new_session();
    const nodes = data_loader.get_campaign_nodes("r1");
    for (let i = 0; i < nodes.length + 2; i += 1) game.advance_market(sid, "NEXT_NODE");
    expect(game.get_view(sid).market_clock!.pause_reasons!.length).toBeGreaterThan(0);
    const state = game.get_session(sid);
    state.current_episode_number = 4;
    game.advance_episode(sid);
    const clock = game.get_view(sid).state.market_clock!;
    expect(clock.pause_reasons!.some((reason) => reason.trigger_id === "campaign_end")).toBe(false);
  });

  it("carries honest per-field market-structure provenance", () => {
    const [, view] = new_session();
    const flow = view.flow_summary!;
    const positioning = view.positioning_summary!;
    const counterparty = view.counterparty_profile!;
    expect(flow.large_sweep_count_source_type).toBe("SIMULATED");
    expect(flow.volume_shock_source_type).toBe("SIMULATED");
    expect(positioning.crowdedness_source_type).toBe("SIMULATED");
    expect(positioning.trapped_risk_source_type).toBe("SIMULATED");
    expect(flow.source_type).not.toBe("DERIVED_REAL_INPUTS");
    expect(counterparty.dealer_inventory_bias_source_type).toBe("DERIVED_HEURISTIC");
    expect(counterparty.dealer_inventory_signed_source_type).toBe("DATA_UNAVAILABLE");
    expect(counterparty.dealer_inventory_note).toBeTruthy();
  });

  it("keeps real historical prices unchanged across new systems", () => {
    const before = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    const before_vix = data_loader.get_campaign_nodes("r1").map((node) => node.vix?.close ?? null);
    const [sid] = new_session();
    const [sv] = buy_call(sid, thesis());
    const pos_id = sv.state.positions![0].id;
    const nodes = data_loader.get_campaign_nodes("r1");
    for (let i = 0; i < nodes.length; i += 1) {
      game.advance_market(sid, "NEXT_NODE");
      game.record_player_decision(sid, "HOLD", "hold", "", pos_id);
    }
    for (const event of [...(game.get_session(sid).human_action_events ?? [])]) {
      if (!event.resolved && event.choices?.length) game.resolve_human_action(sid, event.id, event.choices[0].id);
    }
    expect(data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close)).toEqual(before);
    expect(data_loader.get_campaign_nodes("r1").map((node) => node.vix?.close ?? null)).toEqual(before_vix);
  });
});
