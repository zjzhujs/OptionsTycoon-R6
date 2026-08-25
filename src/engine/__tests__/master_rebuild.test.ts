import { beforeEach, describe, expect, it } from "vitest";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as gex from "../engines/gex";
import * as macro from "../engines/macro";
import * as microstructure from "../engines/microstructure";
import * as scanner from "../engines/scanner";
import * as story from "../engines/story";
import * as terms from "../engines/terms";

beforeEach(() => {
  localStorage.clear();
});

describe("master rebuild subsystems", () => {
  it("classifies GEX as heuristic and warns about dealer inventory", () => {
    const view = game.new_game({ campaign_id: "r1", account_type: "TFSA", start_cash: 50_000, story_seed: 1 });
    const node = data_loader.get_campaign_nodes("r1")[0];
    const quotes = [130, 140, 145, 150, 160].flatMap((strike) => ["call", "put"] as const).map((type, index) => {
      const strikes = [130, 140, 145, 150, 160];
      return game.resolve_quote(view.state, node, type, strikes[Math.floor(index / 2)], "2025-01-31");
    });
    const profile = gex.compute_gex_profile(node, quotes, 100, false);
    expect(["DERIVED_HEURISTIC", "DERIVED_MODEL", "DERIVED_REAL_INPUTS"]).toContain(profile.provenance.source_type);
    expect(profile.warning).toContain("NOT actual dealer inventory");
    expect(profile.gamma_concentration_wall).not.toBeNull();
    for (const point of profile.points!) expect(point.dealer_gex_1pct_usd).toBeNull();
  });

  it("gates macro snapshots by date and calculates the 2s10s curve", () => {
    const nodes = data_loader.get_campaign_nodes("r1");
    const macro_24 = macro.get_macro_snapshot(nodes[1]);
    const macro_27 = macro.get_macro_snapshot(nodes[2]);
    expect(macro_24.date).toBe("2025-01-24");
    expect(macro_27.date).toBe("2025-01-27");
    expect(macro_24.curve_2s10s).toBe(Math.round((macro_24.ust_10y! - macro_24.ust_2y!) * 1_000) / 1_000);
    expect(macro_27.vix!).toBeGreaterThan(macro_24.vix!);
  });

  it("covers the required scanner universe", () => {
    const result = scanner.generate_scanner_feed(data_loader.get_campaign_nodes("r1")[2], "r1");
    expect(result.date).toBe("2025-01-27");
    const tickers = new Set(result.rows.map((row) => row.ticker));
    for (const ticker of ["NVDA", "QQQ", "SPY", "TSLA", "SMH"]) expect(tickers.has(ticker)).toBe(true);
    expect(result.rows.length).toBeGreaterThanOrEqual(8);
    expect(result.highlighted_tickers!.length).toBeGreaterThan(0);
  });

  it("does not let microstructure modify the real price", () => {
    const node = data_loader.get_campaign_nodes("r1")[2];
    const original_price = node.underlying_bar.close;
    const micro_state = microstructure.evaluate_microstructure(node, [], "r1");
    expect(["HIGH_PANIC", "ELEVATED", "NORMAL"]).toContain(micro_state.volatility_regime);
    expect(node.underlying_bar.close).toBe(original_price);
  });

  it("links trade review thesis data and scores process independently", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "TFSA", start_cash: 50_000, story_seed: 42 });
    const sid = view.state.session_id;
    const thesis = {
      contract_or_symbol: "CALL 150.0 (2025-01-31)", direction: "BULLISH", catalyst: "AI Inference demand surge expectation",
      expected_move_pct: 5, time_horizon_days: 3, invalidation_level: 140, why_instrument: "High delta long call for asymmetric upside", risk_budget_usd: 1_000,
    };
    const [view_after_buy, buy_result] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 150, expiration: "2025-01-31", qty: 1, order_kind: "Market", thesis });
    expect(buy_result.accepted).toBe(true);
    expect(view_after_buy.state.positions).toHaveLength(1);
    expect(view_after_buy.state.positions![0].thesis).not.toBeNull();
    expect(view_after_buy.state.positions![0].thesis!.direction).toBe("BULLISH");
    const [view_after_sell, sell_result] = game.place_order(sid, { side: "sell_to_close", type: "call", strike: 150, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    expect(sell_result.accepted).toBe(true);
    expect(sell_result.trade_review_id).toBeTruthy();
    expect(view_after_sell.state.trade_reviews).toHaveLength(1);
    const review = view_after_sell.state.trade_reviews![0];
    expect(review.trade_id).toBe(sell_result.trade_review_id);
    expect(review.process_score).toBeTruthy();
    expect(review.process_score.overall_process_score).toBeGreaterThanOrEqual(80);
    expect(review.process_score.pnl_independence_note).toContain("Process Score");
    expect(review.what_if!.length).toBeGreaterThanOrEqual(2);
  });

  it("loads the bilingual financial terms dictionary", () => {
    const all_terms = terms.get_all_terms();
    expect(all_terms.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(all_terms.map((term) => term.id));
    for (const id of ["delta", "gamma", "theta", "vega", "gamma_wall", "market_maker", "mnpi", "open_interest", "implied_volatility", "carry_trade", "margin", "drawdown", "aum"]) {
      expect(ids.has(id)).toBe(true);
    }
    expect(terms.search_terms("Greek").length).toBeGreaterThanOrEqual(4);
  });

  it("generates the War Room morning meeting", () => {
    const nodes = data_loader.get_campaign_nodes("r1");
    const node = nodes[2];
    const events = data_loader.load_events()[data_loader.get_campaign_events_key("r1")];
    const state: any = { session_id: "war-room-copy-test", campaign_id: "r1", spotlight_campaign_id: "r1", game_day_index: 0, relationships: {} };
    state.spotlight_campaign_id = 'r1';
    const war_room = story.generate_war_room_meeting(state, node, events);
    expect(war_room.date).toBe(node.date);
    console.log('WARROOM:', JSON.stringify(war_room.messages)); const speakers = new Set(war_room.messages!.map((message) => message.character_id));
    for (const speaker of ["maya_chen", "victor_hale", "leo_park"]) expect(speakers.has(speaker)).toBe(true);
    expect(war_room.choices!.length).toBeGreaterThanOrEqual(2);
    expect(war_room.topic).toContain('盘前晨会');
    expect(war_room.agenda).not.toMatch(/Review volatility risk|Key challenge|Previous War Room choice/);
    expect(war_room.player_decision_prompt).toContain('选择桌面姿态');
  });
});
