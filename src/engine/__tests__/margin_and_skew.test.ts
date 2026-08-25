import { beforeEach, describe, expect, it } from "vitest";

import * as game from "../game";
import * as data_loader from "../data_loader";
import * as margin_engine from "../engines/margin";
import * as options_engine from "../engines/options";

beforeEach(() => {
  localStorage.clear();
});

function real_node(date: string, close: number) {
  return {
    date,
    underlying_bar: { date, close },
    point_only: false,
    provenance: { source_type: "REAL" as const, source_name: "test-fixture" },
  };
}

describe("margin leverage and IV skew", () => {
  it("gives Margin real share buying power", () => {
    const tfsa_view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "TFSA", start_cash: 20_000, story_seed: 901 });
    const margin_view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Margin", start_cash: 20_000, story_seed: 901 });
    const [, tfsa_result] = game.place_order(tfsa_view.state.session_id, { side: "buy_shares", qty: 1 });
    const [, margin_result] = game.place_order(margin_view.state.session_id, { side: "buy_shares", qty: 1 });
    expect(tfsa_result.accepted && margin_result.accepted).toBe(true);
    const tfsa_state = game.get_session(tfsa_view.state.session_id);
    const margin_state = game.get_session(margin_view.state.session_id);
    expect(margin_state.margin_debt!).toBeGreaterThan(0);
    expect(tfsa_state.margin_debt).toBe(0);
    expect(margin_state.cash).toBeGreaterThan(tfsa_state.cash);
    expect(margin_state.shares).toBe(tfsa_state.shares);
    expect(margin_state.shares).toBe(100);
    expect(margin_state.share_cost_basis).toBe(tfsa_state.share_cost_basis);
  });

  it("reduces and risk-scales Margin cash-secured put collateral", () => {
    const view = game.new_game({ campaign_id: "r1", account_type: "Margin", start_cash: 50_000, story_seed: 902 });
    const state = game.get_session(view.state.session_id);
    const node = game.current_node(state);
    const spot = node.underlying_bar.close;
    const otm_strike = Math.round((spot - 25) / 5) * 5;
    const itm_strike = Math.round((spot + 25) / 5) * 5;
    const otm_quote = game.resolve_quote(state, node, "put", otm_strike, "2025-01-31");
    const itm_quote = game.resolve_quote(state, node, "put", itm_strike, "2025-01-31");
    const otm_margin = margin_engine.cash_secured_put_requirement(spot, otm_strike, 1, "Margin", otm_quote.greeks);
    const itm_margin = margin_engine.cash_secured_put_requirement(spot, itm_strike, 1, "Margin", itm_quote.greeks);
    const otm_tfsa = margin_engine.cash_secured_put_requirement(spot, otm_strike, 1, "TFSA", otm_quote.greeks);
    expect(otm_tfsa).toBe(otm_strike * 100);
    expect(otm_margin).toBeLessThan(otm_tfsa);
    expect(itm_margin).toBeGreaterThan(otm_margin);
  });

  it("flags a Margin call on thin equity", () => {
    const node = real_node("2025-01-27", 100);
    const safe = margin_engine.total_margin_requirement([], node, "Margin", () => undefined as never, 100, 2_000);
    expect(safe).toBe(margin_engine.SHARE_MAINTENANCE_MARGIN_PCT * 100 * 100);
    const equity_safe = 9_000 + 100 * 100 - 2_000;
    const equity_thin = 500 + 100 * 100 - 9_000;
    const requirement = margin_engine.total_margin_requirement([], node, "Margin", () => undefined as never, 100, 9_000);
    expect(equity_safe).toBeGreaterThan(requirement);
    expect(equity_thin).toBeLessThan(requirement);

    const view = game.new_game({ campaign_id: "r1", account_type: "Margin", start_cash: 50_000, story_seed: 903 });
    const state = game.get_session(view.state.session_id);
    const spot_day0 = game.current_node(state).underlying_bar.close;
    state.shares = 100;
    state.cash = 500;
    state.margin_debt = spot_day0 * 100 - 2_000;
    const forced_view = game.compute_view(state);
    expect(forced_view.margin_requirement!).toBeGreaterThan(0);
    expect(forced_view.margin_call_active).toBe(true);
  });

  it("varies IV and gamma by strike", () => {
    const view = game.new_game({ campaign_id: "r1", story_seed: 904 });
    const quotes = game.get_chain(view.state.session_id, "2025-01-31", "call");
    const ivs = new Map(quotes.map((quote) => [quote.strike, quote.iv!]));
    const gammas = new Map(quotes.map((quote) => [quote.strike, quote.greeks!.gamma]));
    expect(new Set(ivs.values()).size).toBeGreaterThan(1);
    expect(new Set([...gammas.values()].map((gamma) => Math.round(gamma * 1_000_000) / 1_000_000)).size).toBeGreaterThan(1);
    const low_strike = Math.min(...ivs.keys());
    const high_strike = Math.max(...ivs.keys());
    expect(ivs.get(low_strike)!).toBeGreaterThan(ivs.get(high_strike)!);
    const strikes_sorted = [...gammas.keys()].sort((a, b) => a - b);
    const mid_strike = strikes_sorted[Math.floor(strikes_sorted.length / 2)];
    expect(gammas.get(mid_strike)!).toBeGreaterThan(gammas.get(strikes_sorted[0])!);
    expect(gammas.get(mid_strike)!).toBeGreaterThan(gammas.get(strikes_sorted[strikes_sorted.length - 1])!);
  });
});
