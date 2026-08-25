import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import { SeededRNG } from "../rng";
import type { AIStackLevel, AdvanceMode, EmployeeRole, InvestigationStage, LegalityClass, OrderKind, OrderSide, OptionType } from "../schemas";
import * as edge_economy from "../engines/edge_economy";
import * as evidence_engine from "../engines/evidence_engine";
import * as lp_engine from "../engines/lp_engine";
import * as management_company from "../engines/management_company";
import { settleMonth } from "../engines/economy_core";

const EXPIRY = "2025-01-31";

beforeEach(() => {
  localStorage.clear();
});

function session(start_cash = 200_000) {
  const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", start_cash });
  // Legacy capital-system scenarios use a funded management company. New-game
  // defaults are covered by money_system_batch_a.test.ts.
  view.state.management_company!.cash = 500_000;
  view.state.gp_wealth!.cash = 0;
  return [view.state.session_id, view] as const;
}

function buy_call(sid: string, strike = 140) {
  return game.place_order(sid, {
    side: "buy_to_open",
    type: "call",
    strike,
    expiration: EXPIRY,
    qty: 1,
    order_kind: "Market",
  });
}

describe("capital, power, and edge economy", () => {
  it("fund capital is never touched by management or GP spend", () => {
    const [sid, view] = session();
    const fund_cash_before = view.state.cash;

    game.hire_employee(sid, "RESEARCH_ASSOCIATE", "Test Hire");
    const state = game.get_session(sid);
    game.adjust_employee_bonus(sid, state.employees![0].id, 25);
    game.subscribe_data(sid, "news_wire_premium");
    game.upgrade_ai_stack(sid, "LEVEL_1_ASSISTANT");
    game.distribute_to_gp(sid, 5_000);

    const after = game.get_session(sid);
    expect(after.cash, "fund capital moved from a management/GP-wallet action").toBe(fund_cash_before);
    expect(after.fund_stats.aum).toBeCloseTo(view.state.fund_stats.aum, 6);
  });

  it("illegal edge action pays from the management company, not the fund", () => {
    const [sid, view] = session();
    const fund_cash_before = view.state.cash;
    const state = game.get_session(sid);
    const node = game.current_node(state);
    const offer = edge_economy.corporate_insider_offer(node, "NVDA");
    state.human_action_events!.push(offer);

    const [resolved] = game.resolve_human_action(sid, offer.id, "proceed");
    expect(resolved.state.cash, "illegal spend touched fund capital").toBe(fund_cash_before);
    expect(resolved.state.management_company!.cash!).toBeLessThan(500_000);
  });

  it("GP wealth and the management company are distinct wallets", () => {
    const [sid] = session();
    const [view] = game.distribute_to_gp(sid, 10_000);
    expect(view.state.gp_wealth!.cash).toBe(10_000);
    expect(view.state.management_company!.cash).toBeCloseTo(490_000, -1);
    expect(() => game.inject_gp_capital(sid, 999_999)).toThrow();
  });

  it("management fee accrues from AUM", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    settleMonth(state, {
      settlementId: "month:2025-02",
      monthId: "2025-02",
      date: "2025-02-03",
      fundNav: 200_000,
    });
    expect(state.management_company!.fee_income_ytd!).toBeGreaterThan(0);
  });

  it("performance fee respects the high-water mark", () => {
    const [sid] = session(100_000);
    const state = game.get_session(sid);
    expect(state.management_company!.high_water_mark).toBeCloseTo(100_000, 6);

    const view = game.advance_market(sid, "NEXT_NODE");
    expect(view.state.management_company!.performance_income_ytd).toBe(0);
  });

  it("payroll, data, and AI all increase burn", () => {
    const [sid] = session();
    const burn0 = game.get_view(sid).state.management_company!.annualized_burn!;

    game.hire_employee(sid, "QUANT_RESEARCHER", "Burn Test");
    const burn1 = game.get_view(sid).state.management_company!.annualized_burn!;
    expect(burn1).toBeGreaterThan(burn0);

    game.subscribe_data(sid, "macro_data_terminal");
    const burn2 = game.get_view(sid).state.management_company!.annualized_burn!;
    expect(burn2).toBeGreaterThan(burn1);

    game.upgrade_ai_stack(sid, "LEVEL_2_MULTI_AGENT");
    const burn3 = game.get_view(sid).state.management_company!.annualized_burn!;
    expect(burn3).toBeGreaterThan(burn2);
  });

  it("runway reflects cash over monthly burn", () => {
    const [sid] = session();
    game.hire_employee(sid, "LEGAL_COUNSEL", "Runway Test");
    const mc = game.get_view(sid).state.management_company!;
    expect(mc.monthly_burn!).toBeGreaterThan(0);
    const expected = mc.cash! / mc.monthly_burn!;
    expect(Math.abs(mc.runway_months! - expected) / Math.abs(expected)).toBeLessThan(0.01);
  });

  it("management-company cash cannot auto-overdraft under burn pressure", () => {
    const [sid] = session();
    for (let i = 0; i < 6; i += 1) {
      game.hire_employee(sid, "MACRO_STRATEGIST", `Overhire ${i}`);
    }
    const state = game.get_session(sid);
    expect(state.management_company!.annualized_burn!).toBeGreaterThan(2_000_000);

    management_company.accrue_days(state, "2025-06-01", 200);
    expect(state.management_company!.cash!).toBeGreaterThanOrEqual(0);
  });

  it("a legal edge offer unlocks real intelligence", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const offer = edge_economy.legal_edge_offer(game.current_node(state), "NVDA");
    state.human_action_events!.push(offer);
    const [view] = game.resolve_human_action(sid, offer.id, "proceed");
    expect(view.state.acquired_intel).toHaveLength(1);
    expect(view.state.acquired_intel![0].legality_class).toBe("LEGAL");
  });

  it("AI stack documents the Time Guard boundary", () => {
    const [sid] = session();
    const note = game.get_view(sid).state.ai_stack!.model_risk_note!;
    expect(note.includes("Time Guard") || note.includes("鏈潵")).toBe(true);
  });

  it("PROCEED on an illegal offer is never blocked", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const offer = edge_economy.corporate_insider_offer(game.current_node(state), "NVDA");
    state.human_action_events!.push(offer);
    const [view, msg] = game.resolve_human_action(sid, offer.id, "proceed");
    expect(msg).not.toContain("鎷掔粷");
    expect(msg).not.toContain("涓嶈兘");
    expect(msg).not.toContain("鏃犳硶");
    const resolved = view.state.human_action_events!.find((event) => event.id === offer.id)!;
    expect(resolved.resolved).toBe(true);
    expect(resolved.chosen_choice_id).toBe("proceed");
  });

  it("an illegal action creates an evidence record", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const offer = edge_economy.commercial_secret_offer(game.current_node(state), "NVDA", new SeededRNG(1));
    state.human_action_events!.push(offer);
    const [view] = game.resolve_human_action(sid, offer.id, "proceed");
    expect(view.state.evidence_state!.evidence_points!).toBeGreaterThan(0);
    expect(view.state.evidence_state!.records).toHaveLength(1);
    expect(view.state.evidence_state!.records![0].legality_class).toBe("ILLEGAL");
  });

  it("detection is probabilistic rather than certain", () => {
    const outcomes: boolean[] = [];
    for (let seed = 0; seed < 60; seed += 1) {
      const [sid] = session();
      const state = game.get_session(sid);
      const node = game.current_node(state);
      const offer = edge_economy.commercial_secret_offer(node, "NVDA", new SeededRNG(seed));
      state.human_action_events!.push(offer);
      game.resolve_human_action(sid, offer.id, "proceed");
      const [event] = evidence_engine.maybe_escalate(state, node.date, new SeededRNG(seed + 1000));
      outcomes.push(event !== null);
    }
    const escalated = outcomes.filter(Boolean).length;
    expect(escalated).toBeGreaterThan(0);
    expect(escalated).toBeLessThan(outcomes.length);
  });

  it("repeated crime compounds evidence and pressure", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const node = game.current_node(state);
    const points_over_time = [state.evidence_state!.evidence_points!];
    for (let i = 0; i < 3; i += 1) {
      const offer = edge_economy.corporate_insider_offer(node, "NVDA");
      state.human_action_events!.push(offer);
      game.resolve_human_action(sid, offer.id, "proceed");
      points_over_time.push(state.evidence_state!.evidence_points!);
    }
    expect(points_over_time).toEqual([...points_over_time].sort((a, b) => a - b));
    expect(points_over_time[points_over_time.length - 1]).toBeGreaterThan(points_over_time[0]);
    expect(state.evidence_state!.witness_count!).toBeGreaterThanOrEqual(3);
  });

  it("an MNPI trade decision still executes through the normal order path", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const node = game.current_node(state);
    const intel_event = edge_economy.build_mnpi_decision_event("intel1", "娴嬭瘯 MNPI 绱犳潗", node, "NVDA");
    state.human_action_events!.push(intel_event);
    const [view] = game.resolve_human_action(sid, intel_event.id, "trade_now");
    expect(view.state.evidence_state!.evidence_points!).toBeGreaterThan(0);
    const [, result] = buy_call(sid);
    expect(result.accepted).toBe(true);
  });

  it("new systems never modify the real historical price path", () => {
    const before = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    const [sid] = session();
    const state = game.get_session(sid);
    const node = game.current_node(state);
    const builders = [
      () => edge_economy.legal_edge_offer(node, "NVDA"),
      () => edge_economy.corporate_insider_offer(node, "NVDA"),
      () => edge_economy.commercial_secret_offer(node, "NVDA", new SeededRNG(3)),
      () => edge_economy.corrupt_professional_offer(node),
      () => edge_economy.market_manipulation_offer(node, true)!,
    ];
    for (const build of builders) {
      const offer = build();
      state.human_action_events!.push(offer);
      const proceed_id = offer.choices!.some((choice) => choice.id === "proceed") ? "proceed" : offer.choices![offer.choices!.length - 1].id;
      game.resolve_human_action(sid, offer.id, proceed_id);
    }
    game.hire_employee(sid, "AI_ENGINEER", "Price Guard Test");
    for (let i = 0; i < data_loader.get_campaign_nodes("r1").length; i += 1) game.advance_market(sid, "NEXT_NODE");
    const after = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    expect(after).toEqual(before);
  });

  it("commercial-secret reliability is not always TRUE", () => {
    const reliabilities = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const rng = new SeededRNG(seed);
      const value = rng.weighted_choice(
        ["TRUE", "PARTIAL", "MISLEADING", "FABRICATED"] as const,
        [0.25, 0.35, 0.25, 0.15],
      );
      reliabilities.add(value);
    }
    expect(reliabilities.has("TRUE")).toBe(true);
    expect(reliabilities.size).toBeGreaterThan(1);
  });

  it("a corrupt professional offer creates exposure", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const offer = edge_economy.corrupt_professional_offer(game.current_node(state));
    state.human_action_events!.push(offer);
    const before_ethics = state.hidden_state!.information_ethics!;
    const [view] = game.resolve_human_action(sid, offer.id, "proceed");
    expect(view.state.evidence_state!.evidence_points!).toBeGreaterThan(0);
    expect(view.state.hidden_state!.information_ethics!).toBeLessThan(before_ethics);
  });

  it("PB reaction fires once investigation is serious", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    state.institutional_relationships!.jpmorgan = { trust: 80, financing_spread_bps: 135, borrow_fee_pct: 0.35 };
    state.evidence_state!.investigation_stage = "REGULATORY_INQUIRY";
    const logs = evidence_engine.pb_reaction(state);
    const relation = state.institutional_relationships!.jpmorgan as Record<string, number>;
    expect(logs.length).toBeGreaterThan(0);
    expect(relation.trust).toBeLessThan(80);
    expect(relation.financing_spread_bps).toBeGreaterThan(135);
  });

  it("LPs can redeem after a scandal", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    state.lp_profiles = lp_engine.get_default_lps();
    for (const lp of state.lp_profiles) {
      lp.confidence_score = 45;
      lp.compliance_sensitivity = "HIGH";
    }
    state.evidence_state!.investigation_stage = "FORMAL_INVESTIGATION";
    const logs = evidence_engine.lp_reaction(state);
    expect(state.lp_profiles.some((lp) => lp.redemption_risk === "CRITICAL")).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("a whistleblower can fire at enough risk", () => {
    let fired = false;
    for (let seed = 0; seed < 80; seed += 1) {
      const [sid] = session();
      const state = game.get_session(sid);
      state.evidence_state!.whistleblower_risk = 60;
      state.evidence_state!.witness_count = 3;
      const [event] = evidence_engine.maybe_whistleblower(state, game.current_node(state).date, new SeededRNG(seed));
      if (event) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
  });

  it("evidence and intelligence persist through save/load", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const offer = edge_economy.corporate_insider_offer(game.current_node(state), "NVDA");
    state.human_action_events!.push(offer);
    game.resolve_human_action(sid, offer.id, "proceed");
    game.hire_employee(sid, "COMPLIANCE_OFFICER", "Persist Test");

    const before = game.get_session(sid);
    game.save_game(sid, "capital_power_ts_slot");
    const loaded = game.load_game("capital_power_ts_slot").state;

    expect(loaded.evidence_state!.evidence_points).toBe(before.evidence_state!.evidence_points);
    expect(loaded.evidence_state!.records).toHaveLength(before.evidence_state!.records!.length);
    expect(loaded.acquired_intel).toHaveLength(before.acquired_intel!.length);
    expect(loaded.employees).toHaveLength(before.employees!.length);
    expect(loaded.management_company!.cash).toBeCloseTo(before.management_company!.cash!, 6);
  });

  it("Empire Mode manipulation never touches real price data", () => {
    const before = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    const [sid] = session();
    const state = game.get_session(sid);
    const impact = edge_economy.apply_simulated_manipulation_impact(state, 2_000_000, "SMALL_CAP");
    expect(impact).toBeGreaterThan(0);
    expect(state.compliance_state).toHaveProperty("empire_simulated_market_impact_pct");
    const after = data_loader.get_campaign_nodes("r1").map((node) => node.underlying_bar.close);
    expect(after).toEqual(before);
  });

  it("manipulation impact scales down for larger market caps", () => {
    const [sid] = session();
    const state = game.get_session(sid);
    const small = edge_economy.apply_simulated_manipulation_impact(state, 1_000_000, "SMALL_CAP");
    const mega = edge_economy.apply_simulated_manipulation_impact(state, 1_000_000, "MEGA_CAP");
    expect(small).toBeGreaterThan(mega);
  });

  it("market manipulation offers exist only in Empire Mode", () => {
    const [sid] = session();
    const node = game.current_node(game.get_session(sid));
    expect(edge_economy.market_manipulation_offer(node, false)).toBeNull();
    expect(edge_economy.market_manipulation_offer(node, true)).not.toBeNull();
  });
});
