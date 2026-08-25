import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import type { AccountType, AdrianFate, GameState, OptionType, ProcessScore, TradeReview } from "../schemas";
import * as character_arc_engine from "../engines/character_arc_engine";
import * as delayed_consequence_engine from "../engines/delayed_consequence_engine";
import * as ending_engine from "../engines/ending_engine";
import * as episode_engine from "../engines/episode_engine";
import * as gex from "../engines/gex";
import * as macro from "../engines/macro";
import * as microstructure from "../engines/microstructure";
import * as options from "../engines/options";
import * as scanner from "../engines/scanner";
import * as survival_engine from "../engines/survival_engine";
import * as terms from "../engines/terms";
import * as trade_review from "../engines/trade_review";
import * as trait_engine from "../engines/trait_engine";
import * as trading from "../engines/trading";

beforeEach(() => {
  localStorage.clear();
});

function create_test_state(campaign_id = "r1", account_type: AccountType = "Margin", cash = 100_000): GameState {
  return game.new_game({ campaign_id, mode: "STORY_CAMPAIGN", account_type, start_cash: cash }).state;
}

function process_score(overall_process_score: number, feedback: string): ProcessScore {
  return {
    thesis_quality: overall_process_score,
    timing_score: overall_process_score,
    instrument_selection: overall_process_score,
    risk_management: overall_process_score,
    execution_discipline: overall_process_score,
    overall_process_score,
    feedback,
  };
}

describe("deep domain features", () => {
  it("dynamically computes season review fields from actual trade reviews", () => {
    const ps1 = { ...process_score(88, "Excellent"), thesis_quality: 90, timing_score: 90, instrument_selection: 85, risk_management: 87, execution_discipline: 90 };
    const ps2 = { ...process_score(45, "Poor"), thesis_quality: 40, timing_score: 45, instrument_selection: 50, risk_management: 45, execution_discipline: 40 };
    const ps3 = { ...process_score(35, "Lucky gamble"), thesis_quality: 30, timing_score: 40, instrument_selection: 35, risk_management: 35, execution_discipline: 30 };
    const reviews: TradeReview[] = [
      {
        trade_id: "t1", contract_or_symbol: "NVDA 2025-01-31 C 130", kind: "option", side: "long",
        entry_date: "2025-01-23", exit_date: "2025-01-28", entry_price: 4, exit_price: 19, qty: 10,
        realized_pl: 15_000, return_pct: 150, attribution: { delta: 12_000, theta: -500, vega: 1_500, residual: 2_000, net: 15_000 }, process_score: ps1,
      },
      {
        trade_id: "t2", contract_or_symbol: "NVDA 2025-01-31 P 110", kind: "option", side: "long",
        entry_date: "2025-01-24", exit_date: "2025-01-27", entry_price: 5, exit_price: 1, qty: 20,
        realized_pl: -8_000, return_pct: -60, attribution: { delta: -7_000, theta: -400, vega: -100, residual: -500, net: -8_000 }, process_score: ps2,
      },
      {
        trade_id: "t3", contract_or_symbol: "NVDA 2025-02-07 C 145", kind: "option", side: "long",
        entry_date: "2025-01-27", exit_date: "2025-01-29", entry_price: 2, exit_price: 11, qty: 10,
        realized_pl: 9_000, return_pct: 220, attribution: { delta: 8_000, theta: -400, vega: -100, residual: 1_500, net: 9_000 }, process_score: ps3,
      },
    ];
    const state = create_test_state();
    state.trade_reviews = reviews;
    const outcome = ending_engine.generate_season_outcome(state, 120_000);
    expect(outcome.season_review.best_trade).toMatch(/^NVDA 2025-01-31 C 130/);
    expect(outcome.season_review.worst_trade).toMatch(/^NVDA 2025-01-31 P 110/);
    expect(outcome.season_review.best_process_trade).toMatch(/^NVDA 2025-01-31 C 130/);
    expect(outcome.season_review.luckiest_trade).toContain("NVDA");
  });

  it("provides 30-plus complete bilingual financial terms", () => {
    const all_terms = terms.get_all_terms();
    expect(all_terms.length).toBeGreaterThanOrEqual(30);
    for (const id of ["delta", "gamma", "theta", "vega", "open_interest", "carry_trade", "sofr", "mnpi"]) {
      expect(all_terms.some((term) => term.id === id)).toBe(true);
    }
  });

  it("searches financial terms across categories and keywords", () => {
    expect(terms.search_terms("Gamma").length).toBeGreaterThanOrEqual(1);
    expect(terms.search_terms("Macro").length).toBeGreaterThanOrEqual(1);
  });

  it("runs delayed consequences at the target episode and only once", () => {
    const state = create_test_state();
    state.current_episode_number = 1;
    const dc = delayed_consequence_engine.create_delayed_consequence(
      "trade_on_tip", 1, 2, "SEC 璋冩煡浼犵エ閫佽揪", "SEC 璋冩煡鍚姩", 30,
    );
    state.delayed_consequences!.push(dc);
    expect(state.delayed_consequences).toHaveLength(1);
    expect(state.delayed_consequences![0].resolved).not.toBe(true);

    state.current_episode_number = 2;
    expect(delayed_consequence_engine.check_and_trigger_delayed_consequences(state)).toHaveLength(0);

    state.current_episode_number = 3;
    const triggered = delayed_consequence_engine.check_and_trigger_delayed_consequences(state);
    expect(triggered).toHaveLength(1);
    expect(triggered[0].source_choice_id).toBe("trade_on_tip");
    expect(state.fund_stats.compliance_risk).toBeGreaterThanOrEqual(30);
  });

  it("stores character memory and generates a dynamic stance", () => {
    const state = create_test_state();
    character_arc_engine.record_memory(state, "maya_chen", "Player fully backed Maya's AI Capex thesis and made 40% return.", "VERY_POSITIVE", "Player values fundamental research over short-term noise");
    expect(state.character_memories!.maya_chen).toHaveLength(1);
    expect(character_arc_engine.get_character_dialogue("maya_chen", state, "war_room")).toBeTruthy();
  });

  it("offers and executes crisis survival pathways", () => {
    const state = create_test_state();
    state.cash = -50_000;
    state.margin_debt = 60_000;
    const opts = survival_engine.get_survival_options(state, "MARGIN_CALL");
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(survival_engine.execute_survival_choice(state, "daniel_lifeline").length).toBeGreaterThan(0);
  });

  it("returns macro rates and a yield curve", () => {
    const snap = macro.get_macro_snapshot(data_loader.get_campaign_nodes("r1")[0]);
    expect(snap.fed_funds).not.toBeNull();
    expect(snap.ust_10y).not.toBeNull();
    expect(snap.ust_2y).not.toBeNull();
    expect(snap.yield_curve!.length).toBeGreaterThanOrEqual(4);
  });

  it("calculates a GEX profile and gamma wall", () => {
    const result = gex.compute_gex_profile(data_loader.get_campaign_nodes("r1")[0], []);
    expect(result.spot).toBeGreaterThan(0);
    expect(result.provenance).toBeTruthy();
  });

  it("evaluates market-maker microstructure regimes", () => {
    const state = microstructure.evaluate_microstructure(data_loader.get_campaign_nodes("r1")[0], [], "r1");
    expect(["NORMAL", "ELEVATED", "HIGH_PANIC"]).toContain(state.volatility_regime);
  });

  it("exposes all eight season episodes", () => {
    const episodes = episode_engine.get_all_season_episodes();
    expect(episodes).toHaveLength(8);
    expect(episodes[0].episode_id).toBe("s1_ep01");
    expect(episodes[7].episode_id).toBe("s1_ep08");
    expect(episodes[0].main_underlying).toBe("NVDA");
  });

  it("ties Delta, Theta, Vega, and Residual exactly to review net P&L", () => {
    const nodes = data_loader.get_campaign_nodes("r1");
    const position = { id: "pos1", underlying: "NVDA", kind: "option", type: "call" as const, strike: 135, expiration: "2025-01-31", qty: 10, entry_price: 4.5, entry_date: "2025-01-23", short: false };
    const review = trade_review.create_trade_review(position, nodes[1], 7.2, 2_700);
    const attr = review.attribution;
    expect(Math.abs(attr.delta + attr.theta + attr.vega + attr.residual - attr.net)).toBeLessThan(0.01);
  });

  it("observes order risk, chasing, and player traits", () => {
    const state = create_test_state("r1", "Margin", 50_000);
    const order = { side: "buy_to_open" as const, type: "call" as const, strike: 160, expiration: "2025-01-31", qty: 10, order_kind: "Market" as const, thesis: null };
    trait_engine.observe_order_action(state, order, 2.5);
    expect(state.player_traits).toContain("FOLLOWS_MAYA");
    expect(state.player_traits).toContain("OVERTRADES");
    expect(state.hidden_state!.discipline!).toBeLessThan(80);
  });

  it("evaluates episode outcome return and process score", () => {
    const ps = { ...process_score(85, "Good") };
    const state = create_test_state();
    state.cash = 115_000;
    state.current_episode_number = 1;
    state.trade_reviews = [{
      trade_id: "t_ep", contract_or_symbol: "NVDA C 130", kind: "option", side: "long", entry_date: "2025-01-23", exit_date: "2025-01-27", entry_price: 4, exit_price: 19, qty: 10, realized_pl: 15_000, return_pct: 15,
      attribution: { delta: 15_000, theta: 0, vega: 0, residual: 0, net: 15_000 }, process_score: ps,
    }];
    const outcome = episode_engine.evaluate_episode_outcome(state, 100_000, 115_000);
    expect(outcome.portfolio_return_pct).toBe(15);
    expect(outcome.process_score).toBe(85);
  });

  it("blocks an uncovered short call in TFSA", () => {
    const state = create_test_state("r1", "TFSA", 100_000);
    state.shares = 50;
    expect(trading.can_write_covered_call(state, 1)).toBe(false);
  });

  it("calculates positive gamma and negative theta for an ATM call", () => {
    const greeks = options.compute_greeks(130, 130, 30 / 365.25, 0.045, 0.45, "call");
    expect(greeks.gamma).toBeGreaterThan(0);
    expect(greeks.theta).toBeLessThan(0);
    expect(greeks.delta).toBeGreaterThanOrEqual(0.45);
    expect(greeks.delta).toBeLessThanOrEqual(0.65);
  });

  it("generates a multi-asset scanner feed", () => {
    const result = scanner.generate_scanner_feed(data_loader.get_campaign_nodes("r1")[0], "r1");
    expect(result.rows.length).toBeGreaterThanOrEqual(8);
    const nvda = result.rows.find((row) => row.ticker === "NVDA");
    expect(nvda).toBeTruthy();
    expect(nvda!.iv).toBeGreaterThan(0);
  });

  it("tracks Evelyn Shaw journalism memories and dialogue", () => {
    const state = create_test_state();
    character_arc_engine.record_memory(state, "evelyn_shaw", "Player gave an on-the-record quote respecting semiconductor cycle.", "POSITIVE", "Player respects media and provides verified on-the-record facts");
    expect(state.character_memories!.evelyn_shaw).toHaveLength(1);
    expect(character_arc_engine.get_character_dialogue("evelyn_shaw", state, "war_room")).toBeTruthy();
  });

  it("offers Daniel Ross liquidity support when margin debt is high", () => {
    const state = create_test_state("r1", "Margin", 10_000);
    state.margin_debt = 80_000;
    const opts = survival_engine.get_survival_options(state, "MARGIN_CALL");
    expect(opts.some((option) => option.id === "daniel_lifeline")).toBe(true);
  });

  it("evaluates Adrian Cross's destruction fate", () => {
    const state = create_test_state();
    state.relationships!.adrian_cross.rivalry = 85;
    state.relationships!.adrian_cross.trust = 10;
    expect(ending_engine.evaluate_adrian_fate(state, 45)).toBe("DESTROYED");
  });
});
