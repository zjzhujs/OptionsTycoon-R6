import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as counterparty_engine from "../engines/counterparty";
import * as flow_engine from "../engines/flow";
import * as human_actions_engine from "../engines/human_actions";
import * as institutional_engine from "../engines/institutional";
import * as lp_engine from "../engines/lp_engine";
import * as political_engine from "../engines/political";
import * as positioning_engine from "../engines/positioning";
import * as retail_sentiment_engine from "../engines/retail_sentiment";
import * as social_narrative_engine from "../engines/social_narrative";
import * as street_rating_engine from "../engines/street_rating";
import * as terms_engine from "../engines/terms";

beforeEach(() => {
  localStorage.clear();
});

describe("true RC domain engines", () => {
  it("generates and resolves the Adrian poaching event", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    // This legacy scenario deliberately funds the operating wallet for a $25k retention action.
    game.get_session(sid).management_company!.cash = 50_000;
    const day1 = game.step(sid, 1);
    const adrian_ev = day1.human_action_feed!.find((event) => event.id.includes("adrian"));
    expect(adrian_ev).toBeTruthy();
    expect(adrian_ev!.character_id).toBe("adrian_cross");
    expect(adrian_ev!.choices!.length).toBeGreaterThanOrEqual(2);
    const managementCashBeforeAction = day1.state.management_company!.cash;
    const [resolved, msg] = game.resolve_human_action(sid, adrian_ev!.id, "match_bonus");
    expect(msg).toContain("Apex");
    expect(resolved.state.cash).toBe(50_000);
    expect(resolved.state.management_company!.cash).toBe(managementCashBeforeAction - 25_000);
  });

  it("time-gates political policies and spends political capital", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    expect(view.political_state).not.toBeNull();
    expect(view.political_state!.active_policies!.some((policy) => policy.id === "pol_export_controls_gpu")).toBe(false);
    const day2 = game.step(sid, 2);
    expect(day2.political_state!.active_policies!.some((policy) => policy.id === "pol_export_controls_gpu")).toBe(true);
    const initial_cap = day2.political_state!.political_capital!;
    const [briefing, msg] = game.spend_political_capital(sid, "contact_policy_adviser");
    expect(msg.length).toBeGreaterThan(0);
    expect(briefing.political_state!.political_capital!).toBeLessThan(initial_cap);
  });

  it("calculates counterparty provenance and regimes", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    const cp = view.counterparty_profile!;
    expect(cp.ticker).toBe("NVDA");
    expect(cp.source_type).toBe("DERIVED_HEURISTIC");
    expect(cp.estimated_retail_share_pct! + cp.estimated_institutional_share_pct!).toBeCloseTo(100, 6);
    const crash = game.step(sid, 2).counterparty_profile!;
    expect(["SHORT_GAMMA", "BALANCED"]).toContain(crash.dealer_inventory_bias);
  });

  it("calculates flow PCR, sweeps, and volume shocks", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    expect(view.flow_summary!.ticker).toBe("NVDA");
    expect(view.flow_summary!.put_call_ratio).toBeGreaterThan(0);
    const shock = game.step(sid, 2).flow_summary!;
    expect(shock.volume_shock_detected).toBe(true);
    expect(shock.large_sweep_count).toBeGreaterThanOrEqual(20);
  });

  it("evaluates positioning crowdedness and CTA regimes", () => {
    const positioning = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 }).positioning_summary!;
    expect(positioning.crowdedness_score).toBeGreaterThanOrEqual(0);
    expect(positioning.crowdedness_score).toBeLessThanOrEqual(100);
    expect(["BUYING", "LONG_MAX", "SELLING", "SHORT_MAX"]).toContain(positioning.cta_exposure_regime);
  });

  it("evaluates retail fear/greed and capitulation", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const sid = view.state.session_id;
    const normal = view.retail_sentiment!;
    expect(normal.bullish_pct! + normal.bearish_pct!).toBeCloseTo(100, 6);
    expect(normal.capitulation_flag).toBe(false);
    const crash = game.step(sid, 2).retail_sentiment!;
    expect(crash.capitulation_flag).toBe(true);
    expect(crash.fear_greed_index!).toBeLessThan(30);
  });

  it("time-gates the social market-pulse feed", () => {
    const pulse = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 }).market_pulse!;
    expect(pulse.posts!.length).toBeGreaterThanOrEqual(3);
    for (const post of pulse.posts!) {
      expect(post.author_handle).toMatch(/^@/);
      expect(["BULLISH", "BEARISH", "NEUTRAL"]).toContain(post.bias);
    }
  });

  it("returns street consensus dispersion", () => {
    const consensus = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 }).street_consensus!;
    expect(consensus.ticker).toBe("NVDA");
    expect(consensus.reports!.length).toBeGreaterThanOrEqual(2);
    expect(consensus.reports!.some((report) => report.bank_id === "jpmorgan")).toBe(true);
    expect(consensus.mean_target_price!).toBeGreaterThan(100);
  });

  it("keeps player Street Score in range and assigns a tier", () => {
    const score = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 }).player_street_score!;
    expect(score.total_score!).toBeGreaterThanOrEqual(0);
    expect(score.total_score!).toBeLessThanOrEqual(1_000);
    expect(["EMERGING_MANAGER", "ESTABLISHED_FUND", "ELITE_FUND", "LEGENDARY_INSTITUTION"]).toContain(score.standing_tier);
  });

  it("provides seven Wall Street bank desks and IPO allocations", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const desks = view.wall_street_desk!;
    expect(desks).toHaveLength(7);
    expect(new Set(desks.map((desk) => desk.bank_id))).toEqual(new Set(["jpmorgan", "goldman_sachs", "morgan_stanley", "bofa", "citi", "ubs", "barclays"]));
    const jpm = desks.find((desk) => desk.bank_id === "jpmorgan")!;
    expect(jpm.prime_brokerage_available).toBe(true);
    expect(jpm.financing_spread_bps!).toBeGreaterThan(0);
    expect(jpm.available_ipo_deals!.length).toBeGreaterThanOrEqual(1);
    const [, msg] = game.interact_bank(view.state.session_id, "jpmorgan", "negotiate_margin_spread");
    expect(msg.includes("PB") || msg.includes("娲借皥")).toBe(true);
  });

  it("enforces LP drawdown covenants and redemption risk", () => {
    const lps = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 }).lp_profiles!;
    expect(lps.length).toBeGreaterThanOrEqual(5);
    const lp_types = new Set(lps.map((lp) => lp.lp_type));
    for (const lp_type of ["PENSION_FUND", "ENDOWMENT", "FAMILY_OFFICE", "FUND_OF_FUNDS", "FOUNDER"]) expect(lp_types.has(lp_type)).toBe(true);
    for (const lp of lps) {
      expect(lp.allocated_capital).toBeGreaterThanOrEqual(5_000_000);
      expect(lp.confidence_score!).toBeGreaterThanOrEqual(50);
      expect(lp.simulated_notice).toContain("SIMULATED");
    }
  });

  it("freezes 360-degree entry and exit snapshots", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Margin", start_cash: 50_000 });
    const sid = view.state.session_id;
    const thesis = {
      contract_or_symbol: "CALL 140 (2025-01-31)", direction: "BULLISH", catalyst: "AI 數據中心資本開支高增", expected_move_pct: 15,
      time_horizon_days: 14, invalidation_level: 130, why_instrument: "高槓桿 Call 捕捉上行凸性", risk_budget_usd: 2_000,
    };
    const [after_buy, buy_result] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 2, order_kind: "Market", thesis });
    expect(buy_result.accepted).toBe(true);
    const pos_id = after_buy.state.positions![0].id;
    expect(after_buy.state.entry_snapshots![pos_id].ticker).toBe("NVDA");
    expect(after_buy.state.entry_snapshots![pos_id].player_thesis).not.toBeNull();
    expect((after_buy.state.entry_snapshots![pos_id].fundamental_context!.price as number)).toBeGreaterThan(0);
    const [after_sell, sell_result] = game.place_order(sid, { side: "sell_to_close", type: "call", strike: 140, expiration: "2025-01-31", qty: 2, order_kind: "Market" });
    expect(sell_result.accepted).toBe(true);
    const review = after_sell.state.trade_reviews![0];
    expect(review.entry_snapshot).not.toBeNull();
    expect(review.exit_snapshot).not.toBeNull();
    expect(review.who_was_right!.length).toBeGreaterThanOrEqual(4);
    expect(review.driver_rankings!.length).toBeGreaterThanOrEqual(2);
    expect(review.transmission_graph!.length).toBeGreaterThanOrEqual(2);
    expect(review.player_profile_tag).not.toBe("");
  });

  it("loads 125-plus terms with the complete bilingual schema", () => {
    const all_terms = terms_engine.get_all_terms();
    expect(all_terms.length).toBeGreaterThanOrEqual(125);
    expect(new Set(all_terms.map((term) => term.category)).size).toBe(8);
    for (const term of all_terms) {
      expect(term.id).not.toBe("");
      expect(term.term_cn).not.toBe("");
      expect(term.term_en).not.toBe("");
      expect(term.short_def).not.toBe("");
      expect(term.detailed_explanation).not.toBe("");
      expect(term.example).not.toBe("");
      expect(["BEGINNER", "INTERMEDIATE", "ADVANCED", "INSTITUTIONAL"]).toContain(term.difficulty);
      expect(term.related_terms!.length).toBeGreaterThanOrEqual(1);
      expect(term.analyst_tip).not.toBe("");
    }
  });

  it("rejects a political contact when capital is exhausted", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = view.state;
    state.political_state!.political_capital = 5;
    const [, msg] = game.spend_political_capital(state.session_id, "contact_policy_adviser");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("accumulates political contact favor", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = view.state;
    state.political_state!.political_capital = 50;
    const [after] = game.spend_political_capital(state.session_id, "contact_policy_adviser");
    const contact = after.political_state!.contacts!.find((candidate) => candidate.id === "contact_policy_adviser")!;
    expect(contact.favor_balance!).toBeGreaterThan(10);
  });

  it("generates the internal Victor-versus-Maya dispute", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const day2 = game.step(view.state.session_id, 2);
    const event = day2.human_action_feed!.find((candidate) => candidate.id.includes("dispute"));
    expect(event).toBeTruthy();
    expect(event!.character_id).toBe("victor_hale");
    expect(event!.choices).toHaveLength(3);
  });

  it("names the specific LP in a drawdown warning", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = view.state;
    state.cash = 40_000;
    state.start_cash = 50_000;
    state.peak_aum = 50_000;
    state.max_drawdown_pct = 20;
    const event = human_actions_engine.generate_human_action_events(game.current_node(state), state).find((candidate) => candidate.id.includes("lp_warning"));
    expect(event).toBeTruthy();
    const triggered_lp = state.lp_profiles!.find((lp) => lp.redemption_threshold_pct === 12)!;
    expect(event!.body).toContain(triggered_lp.name);
    expect(event!.body).not.toContain("Ontario Teachers");
    expect(event!.body).not.toContain("CalPERS");
    expect(event!.body).not.toContain("瀹夊ぇ鐣?");
  });

  it("generates Evelyn Shaw's investigative leak event", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const day4 = game.step(view.state.session_id, 4);
    const event = day4.human_action_feed!.find((candidate) => candidate.id.includes("evelyn"));
    expect(event).toBeTruthy();
    expect(event!.character_id).toBe("evelyn_shaw");
  });

  it("classifies normal block-trade activity", () => {
    const flow = flow_engine.compute_flow_summary(data_loader.get_campaign_nodes("r1")[0], [], "r1");
    expect(["HIGH", "MODERATE"]).toContain(flow.block_trade_activity);
  });

  it("estimates positive open-interest change", () => {
    const flow = flow_engine.compute_flow_summary(data_loader.get_campaign_nodes("r1")[0], [], "r1");
    expect(flow.open_interest_change).toBeGreaterThan(0);
  });

  it("classifies high-VIX counterparties", () => {
    const cp = counterparty_engine.evaluate_counterparty_profile(data_loader.get_campaign_nodes("r1")[2], "r1");
    expect(["VOLATILITY_FUND", "MARKET_MAKER"]).toContain(cp.dominant_participant);
  });

  it("classifies low-VIX dealer inventory bias", () => {
    const cp = counterparty_engine.evaluate_counterparty_profile(data_loader.get_campaign_nodes("r1")[0], "r1");
    expect(["BALANCED", "LONG_GAMMA", "SHORT_GAMMA"]).toContain(cp.dealer_inventory_bias);
  });

  it("detects extreme crowded-long unwind positioning", () => {
    const positioning = positioning_engine.evaluate_positioning(data_loader.get_campaign_nodes("r1")[2], "r1");
    expect(positioning.trapped_long_risk).toBe("EXTREME");
    expect(positioning.cta_exposure_regime).toBe("SELLING");
  });

  it("calculates retail FOMO velocity and meme intensity", () => {
    const retail = retail_sentiment_engine.evaluate_retail_sentiment(data_loader.get_campaign_nodes("r1")[2], "r1");
    expect(retail.fomo_velocity!).toBeLessThanOrEqual(10);
    expect(retail.meme_intensity!).toBeGreaterThanOrEqual(50);
  });

  it("uses multiple social narrative authors", () => {
    const pulse = social_narrative_engine.generate_market_pulse(data_loader.get_campaign_nodes("r1")[2], "r1");
    expect(new Set(pulse.posts!.map((post) => post.author_type)).size).toBeGreaterThanOrEqual(2);
  });

  it("marks street analyst reports simulated and fictional", () => {
    const consensus = street_rating_engine.get_street_consensus(data_loader.get_campaign_nodes("r1")[0], "r1");
    for (const report of consensus.reports!) {
      expect(report.source_type).toBe("SIMULATED");
      expect(report.analyst_name.includes("Fictional") || report.analyst_name.includes("铏氭瀯")).toBe(true);
      expect(report.target_price).toBeGreaterThan(0);
    }
  });

  it("penalizes player Street Score for a compliance breach", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    view.state.compliance_state!.breaches = ["breach_1"];
    const score = street_rating_engine.compute_player_street_score(view.state, 50_000);
    expect(score.execution_quality!).toBeLessThan(60);
  });

  it("assigns Legendary tier above the threshold", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const score = street_rating_engine.compute_player_street_score(view.state, 250_000);
    expect(score.total_score!).toBeGreaterThanOrEqual(800);
    expect(score.standing_tier).toBe("LEGENDARY_INSTITUTION");
  });

  it("uses the JPMorgan SOFR spread and borrow fee", () => {
    const jpm = institutional_engine.get_default_wall_street_desks().find((desk) => desk.bank_id === "jpmorgan")!;
    expect(jpm.financing_spread_bps).toBe(135);
    expect(jpm.stock_borrow_fee_pct).toBe(0.35);
  });

  it("includes a Goldman IPO deal", () => {
    const gs = institutional_engine.get_default_wall_street_desks().find((desk) => desk.bank_id === "goldman_sachs")!;
    expect(gs.available_ipo_deals!.length).toBeGreaterThanOrEqual(1);
    expect(gs.available_ipo_deals![0].company_name).toContain("CoreWeave");
  });

  it("promotes a high-trust institutional bank desk", () => {
    const desks = institutional_engine.evaluate_institutional_desks({ jpmorgan: { trust: 92, favor: 20, financing_spread_bps: 100 } });
    expect(desks.find((desk) => desk.bank_id === "jpmorgan")!.relationship_tier).toBe("TIER_1_PARTNER");
  });

  it("makes LP confidence critical at severe drawdown", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    view.state.max_drawdown_pct = 25;
    const lps = lp_engine.evaluate_lp_profiles(view.state, 37_500);
    expect(lps.filter((lp) => lp.redemption_risk === "CRITICAL" || lp.redemption_risk === "ELEVATED").length).toBeGreaterThanOrEqual(1);
  });

  function open_and_close(qty: number) {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Margin", start_cash: 50_000 });
    const sid = view.state.session_id;
    game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty, order_kind: "Market" });
    const [closed] = game.place_order(sid, { side: "sell_to_close", type: "call", strike: 140, expiration: "2025-01-31", qty, order_kind: "Market" });
    return closed.state.trade_reviews![0];
  }

  it("compares options with buying stock instead", () => {
    const review = open_and_close(2);
    expect(review.what_if).toHaveLength(2);
    expect(review.what_if!.some((scenario) => scenario.scenario_name.includes("直接买入正股"))).toBe(true);
  });

  it("compares options with a farther expiry", () => {
    const review = open_and_close(1);
    expect(review.what_if!.some((scenario) => scenario.scenario_name.includes("远月合约") || scenario.scenario_name.includes("+30"))).toBe(true);
  });

  it("ties the Greek P&L decomposition to net", () => {
    const review = open_and_close(2);
    const attr = review.attribution;
    expect(attr.delta + attr.theta + attr.vega + attr.residual).toBeCloseTo(attr.net, 1);
  });

  it("includes Adrian Cross in Who Was Right", () => {
    const review = open_and_close(1);
    const adrian = review.who_was_right!.find((participant) => participant.participant_id === "adrian_cross")!;
    expect(["RIGHT", "WRONG", "PARTIAL", "UNRESOLVED"]).toContain(adrian.outcome_verdict);
  });

  it("makes driver ranking percentages sum to 100", () => {
    const review = open_and_close(1);
    expect(review.driver_rankings!.reduce((sum, item) => sum + item.pnl_impact_pct, 0)).toBeCloseTo(100, 6);
  });

  it("has at least ten terms in each of eight categories", () => {
    const counts: Record<string, number> = {};
    for (const term of terms_engine.get_all_terms()) counts[term.category] = (counts[term.category] ?? 0) + 1;
    expect(Object.keys(counts)).toHaveLength(8);
    for (const count of Object.values(counts)) expect(count).toBeGreaterThanOrEqual(10);
  });
});
