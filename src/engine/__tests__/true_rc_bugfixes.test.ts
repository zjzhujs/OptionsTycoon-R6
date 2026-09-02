import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import * as data_loader from "../data_loader";
import * as game from "../game";
import * as trade_review_engine from "../engines/trade_review";
import type { GameState, MarketNode, Position, TradeThesis } from "../schemas";

beforeEach(() => {
  localStorage.clear();
});

function new_r1_session(account_type: "Margin" | "Cash" | "TFSA" = "Margin", start_cash = 50_000) {
  const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type, start_cash });
  // Legacy human-action scenarios include a $25k retention choice.
  view.state.management_company!.cash = 50_000;
  return [view.state.session_id, view] as const;
}

describe("true RC bugfixes", () => {
  it("does not resolve a human action twice", () => {
    const [sid] = new_r1_session();
    const view = game.step(sid, 1);
    const ev = view.human_action_feed!.find((event) => !event.resolved);
    expect(ev).toBeTruthy();
    const choice = ev!.choices![0];
    const [view1] = game.resolve_human_action(sid, ev!.id, choice.id);
    const cash_after_first = view1.state.cash;
    expect(view1.human_action_feed!.find((event) => event.id === ev!.id)!.resolved).toBe(true);
    const [view2] = game.resolve_human_action(sid, ev!.id, choice.id);
    expect(view2.state.cash).toBe(cash_after_first);
    const view3 = game.step(sid, 1);
    expect(view3.human_action_feed!.find((event) => event.id === ev!.id)!.resolved).toBe(true);
  });

  it("persists human-action reputation in the visible street score", () => {
    const [sid] = new_r1_session();
    const view = game.step(sid, 1);
    const ev = view.human_action_feed!.find((event) => !event.resolved)!;
    const positive_choice = [...ev.choices!].sort((a, b) => (b.reputation_delta ?? 0) - (a.reputation_delta ?? 0))[0];
    const [view_after] = game.resolve_human_action(sid, ev.id, positive_choice.id);
    expect(view_after.state.player_street_score!.total_score).toBeCloseTo(view_after.player_street_score!.total_score!, 6);
    if ((positive_choice.reputation_delta ?? 0) > 0) {
      const refreshed = game.step(sid, 1);
      expect(refreshed.state.player_street_score!.human_action_reputation_bonus!).toBeGreaterThanOrEqual((positive_choice.reputation_delta ?? 0) - 1e-6);
    }
  });

  function build_review_with_move(direction: string, entry_price: number, exit_price: number, realized_pl: number) {
    const [, view] = new_r1_session();
    const state = view.state;
    const thesis: TradeThesis = {
      id: "t1", contract_or_symbol: "CALL 140", direction, catalyst: "regression test", expected_move_pct: 10,
      time_horizon_days: 5, invalidation_level: 100, why_instrument: "test", risk_budget_usd: 1_000, created_at_date: "2025-01-22",
    };
    const entry_node: MarketNode = {
      date: "2025-01-22", underlying_bar: { date: "2025-01-22", close: entry_price, volume: 50_000_000 }, vix: { date: "2025-01-22", close: 18 },
      provenance: { source_type: "REAL", source_name: "test" },
    };
    const position: Position = {
      id: "pos1", kind: "option", underlying: "NVDA", type: "call", strike: 140, expiration: "2025-01-31", qty: 1,
      entry_price: 5, entry_date: "2025-01-22", short: false, thesis, peak_unrealized_pl: 0, trough_unrealized_pl: 0,
    };
    const entry_snap = trade_review_engine.create_entry_snapshot(position, entry_node, state, thesis);
    const exit_node: MarketNode = {
      date: "2025-01-27", underlying_bar: { date: "2025-01-27", close: exit_price, volume: 90_000_000 }, vix: { date: "2025-01-27", close: 30 },
      provenance: { source_type: "REAL", source_name: "test" },
    };
    const exit_snap = trade_review_engine.create_exit_snapshot(position, exit_node, exit_price, realized_pl, state);
    return trade_review_engine.create_trade_review(position, exit_node, exit_price, realized_pl, { active_thesis: thesis, entry_snapshot: entry_snap, exit_snapshot: exit_snap, state });
  }

  it("judges a directionally right losing trade as RIGHT", () => {
    const review = build_review_with_move("BULLISH", 140, 155, -500);
    const player = review.who_was_right!.find((participant) => participant.participant_id === "player")!;
    expect(player.outcome_verdict).toBe("RIGHT");
    expect(player.explanation).toContain("判断对了公司，做错了交易");
  });

  it("judges a directionally wrong winning trade as WRONG or PARTIAL", () => {
    const review = build_review_with_move("BULLISH", 140, 120, 300);
    const player = review.who_was_right!.find((participant) => participant.participant_id === "player")!;
    expect(["WRONG", "PARTIAL"]).toContain(player.outcome_verdict);
    expect(player.explanation).toContain("看错了，但赚到了钱");
  });

  it("matches P&L when direction and P&L agree", () => {
    const review = build_review_with_move("BULLISH", 140, 160, 400);
    const player = review.who_was_right!.find((participant) => participant.participant_id === "player")!;
    expect(player.outcome_verdict).toBe("RIGHT");
    expect(player.explanation).not.toContain("GOT PAID");
    expect(player.explanation).not.toContain("WRONG ABOUT THE TRADE");
  });

  it("keeps process timing independent of P&L sign", () => {
    const losing = build_review_with_move("BULLISH", 140, 145, -50);
    const winning = build_review_with_move("BULLISH", 140, 200, 50);
    expect(losing.process_score.timing_score).toBeCloseTo(winning.process_score.timing_score, 2);
  });

  it("ranks drivers from the real underlying move", () => {
    const calm = build_review_with_move("BULLISH", 140, 141, 10);
    const crash = build_review_with_move("BULLISH", 140, 112, -300);
    const calm_top = calm.driver_rankings![0];
    const crash_top = crash.driver_rankings![0];
    expect(crash_top.pnl_impact_pct >= calm_top.pnl_impact_pct || crash_top.factor_name !== calm_top.factor_name).toBe(true);
    for (const review of [calm, crash]) {
      expect(review.driver_rankings!.reduce((sum, item) => sum + item.pnl_impact_pct, 0)).toBeCloseTo(100, 6);
    }
  });

  it("creates a position and changes cash", () => {
    const [sid, view] = new_r1_session();
    const cash_before = view.state.cash;
    const [after, result] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    expect(result.accepted).toBe(true);
    expect(after.state.positions).toHaveLength(1);
    expect(after.state.cash).toBeLessThan(cash_before);
  });

  it("closes a position and generates a review", () => {
    const [sid] = new_r1_session();
    const [view] = game.place_order(sid, { side: "buy_to_open", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    const pos_id = view.state.positions![0].id;
    const [after, result] = game.place_order(sid, { side: "sell_to_close", type: "call", strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" });
    expect(result.accepted).toBe(true);
    expect(after.state.positions!.every((position) => position.id !== pos_id || position.qty === 0)).toBe(true);
    expect(after.state.trade_reviews).toHaveLength(1);
    expect(after.state.trade_reviews![0].entry_snapshot).not.toBeNull();
    expect(after.state.trade_reviews![0].entry_snapshot!.flow_context!.source_type).toBeTruthy();
  });

  it("round-trips new engine state fields through save/load", () => {
    const [sid] = new_r1_session();
    let view = game.step(sid, 1);
    const ev = view.human_action_feed!.find((event) => !event.resolved);
    if (ev) [view] = game.resolve_human_action(sid, ev.id, ev.choices![0].id);
    if (view.state.political_state?.contacts?.length) game.spend_political_capital(sid, view.state.political_state.contacts[0].id);
    [view] = game.interact_bank(sid, "jpmorgan", "negotiate_margin_spread");
    game.save_game(sid, "pytest_roundtrip_ts_slot");
    const reloaded = game.load_game("pytest_roundtrip_ts_slot");
    expect(reloaded.state.political_state!.political_capital).toBe(view.state.political_state!.political_capital);
    expect(reloaded.state.institutional_relationships).toEqual(view.state.institutional_relationships);
    expect(reloaded.state.player_street_score!.total_score).toBeCloseTo(view.state.player_street_score!.total_score!, 6);
    expect(reloaded.state.player_street_score!.human_action_reputation_bonus).toBeCloseTo(view.state.player_street_score!.human_action_reputation_bonus!, 6);
    const before_ids = new Set(view.state.human_action_events!.filter((event) => event.resolved).map((event) => event.id));
    const after_ids = new Set(reloaded.state.human_action_events!.filter((event) => event.resolved).map((event) => event.id));
    expect(after_ids).toEqual(before_ids);
  });

  it("keeps historical bars unchanged after later events fire", () => {
    const [sid, view] = new_r1_session();
    const close_day0_before = game.current_node(view.state).underlying_bar.close;
    let current = game.step(sid, 1);
    const ev = current.human_action_feed!.find((event) => !event.resolved);
    if (ev) game.resolve_human_action(sid, ev.id, ev.choices![0].id);
    current = game.step(sid, 2);
    expect(data_loader.get_campaign_nodes(current.state.campaign_id ?? "r1")[0].underlying_bar.close).toBe(close_day0_before);
  });

  it("contains no banned absolutist financial-term language", () => {
    // Keep the guard self-contained so it works from any independent checkout.
    const path = resolve(process.cwd(), "src", "engine", "data", "financial_terms.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as { terms?: Record<string, unknown>[] } | Record<string, unknown>[];
    const terms = Array.isArray(raw) ? raw : raw.terms ?? [];
    const banned = [
      "赚取无风险", "通常由Citadel 在另一端卖给你", "具有高度确定性或急迫内幕",
      "常构成做市商对冲的Gamma Wall", "获利了结多头胜率极高", "将发生清算性对冲抛售",
      "最可靠的右侧做多弹性支撑", "强力减震器", "千点大跌的助燃剂",
      "清晰预判未来", "主力借机完成反向大宗建仓", "必然形成后续", "预示机构主力资金的战略性建仓",
    ];
    const offenders: [unknown, string][] = [];
    for (const term of terms) {
      const blob = ["detailed_explanation", "example", "analyst_tip", "short_def"].map((field) => String(term[field] ?? "")).join(" ");
      for (const phrase of banned) if (blob.includes(phrase)) offenders.push([term.id, phrase]);
    }
    expect(offenders).toEqual([]);
  });
});

const scenes_dir = resolve(process.cwd(), "public", "art", "scenes");
const duplicate_scene_test = existsSync(scenes_dir) ? it : it.skip;

duplicate_scene_test("has no duplicate scene background images", () => {
  const hashes = new Map<string, string[]>();
  for (const file of readdirSync(scenes_dir).filter((name) => name.toLowerCase().endsWith(".jpg"))) {
    const digest = createHash("md5").update(readFileSync(resolve(scenes_dir, file))).digest("hex");
    hashes.set(digest, [...(hashes.get(digest) ?? []), file]);
  }
  const duplicates = [...hashes.entries()].filter(([, names]) => names.length > 1);
  expect(duplicates).toEqual([]);
});
