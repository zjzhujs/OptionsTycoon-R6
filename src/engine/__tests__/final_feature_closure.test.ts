import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as human_actions_engine from "../engines/human_actions";
import * as margin_engine from "../engines/margin";
import * as political_engine from "../engines/political";
import type { AccountType } from "../schemas";

beforeEach(() => {
  localStorage.clear();
});

function margin_session(start_cash = 50_000) {
  const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Margin", start_cash });
  const sid = view.state.session_id;
  game.place_order(sid, { side: "buy_shares", qty: 1 });
  return [sid, game.get_session(sid)] as const;
}

describe("final feature closure", () => {
  it("PB relationship terms change buying power for an identical portfolio", () => {
    const [, state] = margin_session();
    state.institutional_relationships!.jpmorgan = { trust: 40, favor: 0, financing_spread_bps: 200 };
    const weak_view = game.compute_view(state);
    state.institutional_relationships!.jpmorgan = { trust: 85, favor: 0, financing_spread_bps: 80 };
    const strong_view = game.compute_view(state);
    expect(weak_view.margin_requirement!).toBeGreaterThan(strong_view.margin_requirement!);
    expect(strong_view.margin_buying_power!).toBeGreaterThan(weak_view.margin_buying_power!);
  });

  it("keeps the default PB haircut multiplier backward compatible", () => {
    const node = {
      date: "2025-01-27",
      underlying_bar: { date: "2025-01-27", close: 100 },
      provenance: { source_type: "REAL" as const, source_name: "test" },
    };
    const requirement = margin_engine.total_margin_requirement([], node, "Margin", () => undefined as never, 100, 2_000);
    expect(requirement).toBe(margin_engine.SHARE_MAINTENANCE_MARGIN_PCT * 100 * 100);
  });

  it("accrues financing cost daily and scales it with the negotiated spread", () => {
    const [sid, state] = margin_session();
    const debt_before = state.margin_debt!;
    expect(debt_before).toBeGreaterThan(0);
    state.institutional_relationships!.jpmorgan = { trust: 60, favor: 0, financing_spread_bps: 150 };
    const view_normal = game.step(sid, state.game_day_index! + 2);
    const accrued_normal = view_normal.state.margin_debt! - debt_before;
    expect(accrued_normal).toBeGreaterThan(0);

    const [sid2, state2] = margin_session();
    const debt_before_2 = state2.margin_debt!;
    state2.institutional_relationships!.jpmorgan = { trust: 20, favor: 0, financing_spread_bps: 500 };
    const view_wide = game.step(sid2, state2.game_day_index! + 2);
    const accrued_wide = view_wide.state.margin_debt! - debt_before_2;
    expect(accrued_wide).toBeGreaterThan(accrued_normal);
  });

  it("financing cost never touches historical price data", () => {
    const [sid, state] = margin_session();
    const before = data_loader.get_campaign_nodes(state.campaign_id ?? "r1")[0].underlying_bar.close;
    game.step(sid, state.game_day_index! + 3);
    const after = data_loader.get_campaign_nodes(state.campaign_id ?? "r1")[0].underlying_bar.close;
    expect(after).toBe(before);
  });

  it("LP capital injection changes AUM, cash, and the target LP", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = view.state;
    state.game_day_index = 5;
    state.start_cash = 50_000;
    state.cash = 55_000;
    state.peak_aum = 55_000;
    state.max_drawdown_pct = 0;
    const events = human_actions_engine.generate_human_action_events(game.current_node(state), state);
    const injection_ev = events.find((event) => event.action_kind === "LP_ALLOCATION_PROPOSAL");
    expect(injection_ev).toBeTruthy();
    state.human_action_events = events;
    const accept_choice = injection_ev!.choices!.find((choice) => (choice.lp_capital_delta ?? 0) > 0)!;
    const target_lp = state.lp_profiles!.find((lp) => lp.id === accept_choice.target_lp_id)!;
    const capital_before = target_lp.capital_current!;
    const aum_before = state.fund_stats.aum;
    const cash_before = state.cash;

    const resolved = human_actions_engine.resolve_human_action(state, injection_ev!.id, accept_choice.id);
    expect(resolved).not.toBeNull();
    expect(target_lp.capital_current).toBeCloseTo(capital_before + accept_choice.lp_capital_delta!, 6);
    expect(state.fund_stats.aum).toBeCloseTo(aum_before + accept_choice.lp_capital_delta!, 6);
    expect(state.cash).toBeCloseTo(cash_before + accept_choice.lp_capital_delta!, 6);

    const cash_after_first = state.cash;
    expect(human_actions_engine.resolve_human_action(state, injection_ev!.id, accept_choice.id)).toBeNull();
    expect(state.cash).toBe(cash_after_first);
  });

  it("LP redemption warnings name the actual triggered LP", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = view.state;
    state.start_cash = 50_000;
    state.cash = 40_000;
    state.peak_aum = 50_000;
    state.max_drawdown_pct = 20;
    const events = human_actions_engine.generate_human_action_events(game.current_node(state), state);
    const lp_ev = events.find((event) => event.action_kind === "LP_REDEMPTION_WARNING");
    expect(lp_ev).toBeTruthy();
    const triggered_lp = state.lp_profiles!.find((lp) => lp.redemption_threshold_pct === 12)!;
    expect(lp_ev!.body).toContain(triggered_lp.name);
    for (const fake_real_name of ["Ontario Teachers", "CalPERS", "Blackstone", "瀹夊ぇ鐣?"]) {
      expect(lp_ev!.body).not.toContain(fake_real_name);
    }
  });

  it("political Congress and Election branches are simulated and uncertain", () => {
    const policy_state = political_engine.evaluate_political_state(data_loader.get_campaign_nodes("r1")[0]);
    const branches = new Set(policy_state.active_policies!.map((policy) => policy.branch));
    expect(branches.has("CONGRESS")).toBe(true);
    expect(branches.has("ELECTIONS")).toBe(true);
    for (const policy of policy_state.active_policies!) {
      if (policy.branch === "CONGRESS" || policy.branch === "ELECTIONS") {
        expect(policy.source_type).toBe("SIMULATED");
        expect(policy.headline).toContain("SIMULATED ANALYSIS");
        expect(policy.probability_pct!).toBeGreaterThan(0);
        expect(policy.probability_pct!).toBeLessThan(100);
      }
    }
  });

  it("trade review contains named sections, snapshots, and a lesson", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Margin", start_cash: 50_000 });
    const sid = view.state.session_id;
    game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    const [after_sell] = game.place_order(sid, { side: "sell_to_close", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    const review = after_sell.state.trade_reviews![0];
    const expected_sections = ["POLITICAL_REVIEW", "STREET_REVIEW", "INSTITUTIONAL_REVIEW", "RETAIL_SOCIAL_REVIEW", "HUMAN_ACTION_REVIEW", "MARKET_STRUCTURE_REVIEW", "EXECUTION_REVIEW", "RISK_REVIEW"];
    for (const key of expected_sections) {
      const section = review.review_sections![key] as Record<string, unknown>;
      expect(section).toHaveProperty("entry");
      expect(section).toHaveProperty("exit");
    }
    expect(review.lesson).not.toBe("");
    expect(review.entry_snapshot!.snapshot_schema_version).toBe(3);
    expect(review.exit_snapshot!.snapshot_schema_version).toBe(3);
    expect(review.entry_snapshot!.lp_fund_context!.aum as number).toBeGreaterThan(0);
  });

  it("exposes flow, positioning, and counterparty summaries on the game view", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    expect(view.flow_summary).not.toBeNull();
    expect(view.positioning_summary).not.toBeNull();
    expect(view.counterparty_profile).not.toBeNull();
    expect(view.flow_summary!.source_type).toBeTruthy();
    expect(view.positioning_summary!.source_type).toBeTruthy();
    expect(view.counterparty_profile!.source_type).toBeTruthy();
  });

  it("returns What Matters Today items with impact and provenance", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    expect(Array.isArray(view.what_matters_today)).toBe(true);
    for (const item of view.what_matters_today!) {
      expect(item).toHaveProperty("headline");
      expect(item).toHaveProperty("impact");
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(item.impact);
      expect(item).toHaveProperty("source_type");
    }
  });

  it("surfaces geopolitics events after stepping through the campaign", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const v2 = game.step(view.state.session_id, 5);
    const geo_events = v2.political_state!.active_policies!.filter((policy) => policy.branch === "GEOPOLITICS");
    expect(geo_events.length).toBeGreaterThanOrEqual(1);
    for (const event of geo_events) {
      expect(event.probability_pct!).toBeGreaterThan(0);
      expect(event.probability_pct!).toBeLessThan(100);
      expect(event.headline).toContain("SIMULATED");
    }
  });

  it("includes geopolitics in an entry snapshot", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    game.step(sid, 5);
    game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    const snap = game.compute_view(game.get_session(sid)).current_entry_snapshot;
    if (snap) {
      expect(snap.snapshot_schema_version).toBe(3);
      expect(snap.geopolitics_context).toEqual(expect.any(Object));
    }
  });

  it("includes a decision-context matrix in a review when one exists", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    game.step(sid, 3);
    game.place_order(sid, { side: "sell_to_close", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    const reviews = game.compute_view(game.get_session(sid)).state.trade_reviews!;
    if (reviews.length) {
      const review = reviews[reviews.length - 1];
      expect(Array.isArray(review.decision_context_matrix)).toBe(true);
      if (review.decision_context_matrix!.length) {
        expect(review.decision_context_matrix![0]).toHaveProperty("factor");
        expect(review.decision_context_matrix![0]).toHaveProperty("impact");
      }
    }
  });

  it("exposes institutional actions through bank interaction", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    const state = game.get_session(sid);
    for (const bank_id of ["jpmorgan", "goldman_sachs", "morgan_stanley"]) {
      if (state.institutional_relationships?.[bank_id]) {
        const rel = state.institutional_relationships[bank_id] as Record<string, number>;
        rel.trust = 80;
        rel.research_access_score = 60;
      }
    }
    const result = game.interact_bank(sid, "jpmorgan", "request_research_corporate_access");
    expect(result).toBeTruthy();
  });
});
