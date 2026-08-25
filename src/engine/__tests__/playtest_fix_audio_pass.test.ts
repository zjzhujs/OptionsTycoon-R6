import { beforeEach, describe, expect, it } from "vitest";

import * as game from "../game";
import { position_decision_triggers } from "../engines/market_clock";
import { build_fund_manager_verdict } from "../engines/trade_review";
import type { GameState, GameStateView, Position, PositionMark, ProcessScore, TradeThesis } from "../schemas";

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

describe("position decision triggers fire once", () => {
  it("fires significant profit once, then stays silent", () => {
    const position = make_position();
    const state = fake_state([position]);
    const view = fake_view([{ position_id: position.id, mark: 2.9, pl: 90 }]);
    const first = position_decision_triggers(state, view, 150);
    expect(first).toHaveLength(1);
    expect(first[0].headline).toMatch(/^SIGNIFICANT PROFIT/);
    expect(position.significant_profit_decision_fired).toBe(true);
    expect(position_decision_triggers(state, view, 150)).toEqual([]);
  });

  it("fires profit giveback once, then stays silent", () => {
    const position = make_position({ entry_price: 20, peak_unrealized_pl: 200 });
    const state = fake_state([position]);
    const view = fake_view([{ position_id: position.id, mark: 21, pl: 100 }]);
    const first = position_decision_triggers(state, view, 150);
    expect(first).toHaveLength(1);
    expect(first[0].headline).toMatch(/^PROFIT GIVEBACK/);
    expect(position.profit_giveback_decision_fired).toBe(true);
    expect(position_decision_triggers(state, view, 150)).toEqual([]);
  });

  it("fires thesis invalidation once, then stays silent", () => {
    const position = make_position({ id: "pos-2" });
    const thesis: TradeThesis = {
      id: "th-1", contract_or_symbol: "CALL 150.0 2025-01-31", direction: "BEARISH", catalyst: "test",
      expected_move_pct: 5, time_horizon_days: 10, invalidation_level: 150, why_instrument: "test", risk_budget_usd: 200, created_at_date: "2025-01-01",
    };
    const state = fake_state([position], { [position.id]: thesis });
    const view = fake_view([{ position_id: position.id, mark: 2, pl: 0 }]);
    const first = position_decision_triggers(state, view, 155);
    expect(first).toHaveLength(1);
    expect(first[0].headline).toMatch(/^THESIS INVALIDATION/);
    expect(position.invalidation_decision_fired).toBe(true);
    expect(position_decision_triggers(state, view, 160)).toEqual([]);
  });

  it("marks independent simultaneous triggers consumed but returns only giveback", () => {
    const position = make_position({ peak_unrealized_pl: 300 });
    const reasons = position_decision_triggers(fake_state([position]), fake_view([{ position_id: position.id, mark: 2.9, pl: 90 }]), 150);
    expect(reasons.map((reason) => reason.headline.split(" — ")[0])).toEqual(["PROFIT GIVEBACK"]);
    expect(position.significant_profit_decision_fired).toBe(true);
    expect(position.profit_giveback_decision_fired).toBe(true);
  });
});

describe("position decisions use the real engines", () => {
  function open_position() {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash: 200_000 });
    const sid = view.state.session_id;
    const thesis = {
      contract_or_symbol: "CALL 150.0 2025-01-31", direction: "BULLISH", catalyst: "test", expected_move_pct: 5,
      time_horizon_days: 20, invalidation_level: 100, why_instrument: "test", risk_budget_usd: 1_000,
    };
    const [state, result] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 150, expiration: "2025-01-31", qty: 2, thesis });
    expect(result.accepted, result.message).toBe(true);
    return [sid, state.state.positions![0]] as const;
  }

  it("HOLD writes a real decision record and leaves the position untouched", () => {
    const [sid, position] = open_position();
    const count_before = game.get_view(sid).state.player_decisions!.length;
    const view_after = game.record_player_decision(sid, "POSITION_DECISION_HOLD", "SIGNIFICANT PROFIT 鈥?NVDA CALL 150", "unrealized_pl=100.00, mfe_at_decision=100.00, thesis_state=test", position.id);
    expect(view_after.state.player_decisions).toHaveLength(count_before + 1);
    const decisions = view_after.state.player_decisions!;
    const recorded = decisions[decisions.length - 1];
    expect(recorded.category).toBe("POSITION_DECISION_HOLD");
    expect(recorded.position_id).toBe(position.id);
    expect(view_after.state.positions![0].qty).toBe(position.qty);
  });

  it("REDUCE routes through the real sell-to-close engine", () => {
    const [sid, position] = open_position();
    const original_qty = position.qty;
    expect(original_qty).toBe(2);
    const reduce_qty = Math.floor(original_qty / 2);
    const [state, result] = game.place_order(sid, { side: "sell_to_close", type: position.type, strike: position.strike, expiration: position.expiration, qty: reduce_qty });
    expect(result.accepted, result.message).toBe(true);
    const remaining = state.state.positions!.filter((candidate) => candidate.strike === position.strike && candidate.type === position.type);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining[0].qty).toBe(original_qty - reduce_qty);
  });

  it("CLOSE routes through the real engine and creates a review", () => {
    const [sid, position] = open_position();
    const [state, result] = game.place_order(sid, { side: "sell_to_close", type: position.type, strike: position.strike, expiration: position.expiration, qty: position.qty });
    expect(result.accepted, result.message).toBe(true);
    expect(state.state.positions!.every((candidate) => candidate.strike !== position.strike || candidate.type !== position.type)).toBe(true);
    expect(result.trade_review_id).toBeTruthy();
    expect(state.state.trade_reviews!.some((review) => review.trade_id === result.trade_review_id)).toBe(true);
  });
});

function process_score(): ProcessScore {
  const thesis_quality = 85;
  const timing = 90;
  const instrument = 90;
  const risk = 90;
  const execution = 95;
  const overall = thesis_quality * 0.3 + risk * 0.25 + timing * 0.15 + instrument * 0.15 + execution * 0.15;
  return { thesis_quality, timing_score: timing, instrument_selection: instrument, risk_management: risk, execution_discipline: execution, overall_process_score: overall, feedback: "test" };
}

describe("fund manager verdict", () => {
  it("flags ignored events without fabricating a score penalty", () => {
    const ps = process_score();
    const original_overall = ps.overall_process_score;
    const verdict = build_fund_manager_verdict(ps, "RIGHT", 1_780, 2_000, 6);
    expect(verdict.ignored_event_count).toBe(6);
    expect(verdict.headline).not.toContain("RIGHT");
    expect(verdict.headline).toBeTruthy();
    expect(verdict.narrative).toBeTruthy();
    const warning_texts = verdict.findings!.filter((finding) => finding.kind === "WARNING").map((finding) => finding.text);
    expect(warning_texts.some((text) => text.includes("6") || text.includes("ignore") || text.includes("Ignored"))).toBe(true);
    expect(ps.overall_process_score).toBe(original_overall);
    const all_finding_text = verdict.findings!.map((finding) => finding.text).join(" ");
    expect(all_finding_text).not.toContain("Process Score");
  });

  it("does not add an ignored-event warning when the count is zero", () => {
    const verdict = build_fund_manager_verdict(process_score(), "RIGHT", 500, 500, 0);
    expect(verdict.ignored_event_count).toBe(0);
    expect(verdict.findings!.filter((finding) => finding.kind === "WARNING" && finding.text.includes("Ignored"))).toEqual([]);
  });
});

describe("fund manager verdict end to end", () => {
  it("matches ignored-event count to real decision-timeline rows", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash: 200_000 });
    const sid = view.state.session_id;
    const thesis = {
      contract_or_symbol: "CALL 150.0 2025-01-31", direction: "BULLISH", catalyst: "test", expected_move_pct: 5,
      time_horizon_days: 20, invalidation_level: 100, why_instrument: "test", risk_budget_usd: 1_000,
    };
    const [state, result] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 150, expiration: "2025-01-31", qty: 1, thesis });
    expect(result.accepted, result.message).toBe(true);
    const position = state.state.positions![0];
    for (let i = 0; i < 3; i += 1) {
      const next = game.advance_market(sid, "NEXT_NODE");
      if (!next.state.positions!.length) break;
    }
    const final = game.get_view(sid);
    if (!final.state.positions!.length) return;
    const [state5, result5] = game.place_order(sid, { side: "sell_to_close", type: position.type, strike: position.strike, expiration: position.expiration, qty: position.qty });
    if (!result5.accepted || !result5.trade_review_id) return;
    const review = state5.state.trade_reviews!.find((candidate) => candidate.trade_id === result5.trade_review_id)!;
    expect(review.fund_manager_verdict).not.toBeNull();
    const real_ignored_rows = review.decision_timeline!.filter((event) => event.category === "IGNORED_WARNING");
    expect(review.fund_manager_verdict!.ignored_event_count).toBe(real_ignored_rows.length);
  });
});
