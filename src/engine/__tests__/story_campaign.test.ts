import { beforeEach, describe, expect, it } from "vitest";

import * as game from "../game";
import * as character_arc_engine from "../engines/character_arc_engine";
import * as delayed_consequence_engine from "../engines/delayed_consequence_engine";
import * as ending_engine from "../engines/ending_engine";
import * as episode_engine from "../engines/episode_engine";
import * as survival_engine from "../engines/survival_engine";
import * as trait_engine from "../engines/trait_engine";

beforeEach(() => {
  localStorage.clear();
});

describe("story campaign", () => {
  it("always starts Story Campaign with the mandatory opening briefing", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", story_seed: 321 });
    expect((view.pending_story_public ?? []).some((event) => event.template_id === "day1_briefing_maya" && !event.resolved)).toBe(true);
    expect(view.state.game_day_index).toBe(0);
  });

  it("persists deferred opening stories and does not recreate them at the opening gate", () => {
    const initial = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", story_seed: 321 });
    const opening = initial.pending_story_public!.find((event) => event.template_id === "day1_briefing_maya");
    expect(opening).toBeDefined();

    const deferred = game.set_story_deferred(initial.state.session_id, opening!.id, true);
    const deferredEvent = deferred.pending_story_public!.find((event) => event.id === opening!.id);
    expect(deferredEvent?.deferred).toBe(true);
    expect(deferred.pending_story_public).toHaveLength(1);

    const gated = game.get_view(initial.state.session_id);
    expect(gated.pending_story_public).toHaveLength(1);
    expect(gated.pending_story_public![0].id).toBe(opening!.id);
    expect(gated.pending_story_public![0].deferred).toBe(true);

    game.save_game(initial.state.session_id, "story-deferred-regression");
    const restored = game.load_game("story-deferred-regression");
    expect(restored.pending_story_public![0].id).toBe(opening!.id);
    expect(restored.pending_story_public![0].deferred).toBe(true);

    const resumed = game.set_story_deferred(initial.state.session_id, opening!.id, false);
    expect(resumed.pending_story_public![0].deferred).toBe(false);
  });

  it("has the expected eight-episode structure", () => {
    const episodes = episode_engine.get_all_season_episodes();
    expect(episodes).toHaveLength(8);
    expect(episodes[0].number).toBe(1);
    expect(episodes[0].title).toContain("暴风雨前的死寂");
    expect(episodes[7].number).toBe(8);
    expect(episodes[7].title).toContain("决战时刻与最终审判");
  });

  it("runs delayed consequences through their lifecycle", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = game.get_session(view.state.session_id);
    const dc = delayed_consequence_engine.create_delayed_consequence("test_mnpi_trade", 1, 2, "SEC 璋冩煡鍚姩", "Marcus Reed 閿佸畾浜嗘鍓嶇殑寮傚父浠撲綅", 20);
    state.delayed_consequences!.push(dc);
    expect(delayed_consequence_engine.check_and_trigger_delayed_consequences(state)).toHaveLength(0);
    expect(dc.resolved).not.toBe(true);
    state.current_episode_number = 3;
    expect(delayed_consequence_engine.check_and_trigger_delayed_consequences(state)).toHaveLength(1);
    expect(dc.resolved).toBe(true);
    expect(state.fund_stats.compliance_risk).toBeGreaterThanOrEqual(20);
  });

  it("observes a disciplined thesis order and raises ego-related traits", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = game.get_session(view.state.session_id);
    const order = {
      side: "buy_to_open" as const, type: "call" as const, strike: 140, expiration: "2025-01-31", qty: 1, order_kind: "Market" as const,
      thesis: { contract_or_symbol: "NVDA CALL 140", direction: "BULLISH", catalyst: "Earnings Runup", expected_move_pct: 5, time_horizon_days: 5, invalidation_level: 135, why_instrument: "Call Delta", risk_budget_usd: 1_000 },
    };
    trait_engine.observe_order_action(state, order, 140);
    expect(state.player_traits).toContain("GOOD_RISK_DISCIPLINE");
    expect(state.hidden_state!.discipline!).toBeGreaterThan(80);
  });

  it("stores character memory and generates dynamic dialogue", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = game.get_session(view.state.session_id);
    character_arc_engine.record_memory(state, "maya_chen", "Maya's DeepSeek efficiency thesis was adopted.", "FAVORABLE");
    expect(state.character_memories!.maya_chen).toHaveLength(1);
    expect(character_arc_engine.get_character_dialogue("maya_chen", state).length).toBeGreaterThan(10);
  });

  it("offers and executes crisis survival options", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = game.get_session(view.state.session_id);
    const options = survival_engine.get_survival_options(state, "MARGIN_CALL");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.map((option) => option.id)).toEqual(expect.arrayContaining(["cut_positions", "daniel_lifeline"]));
    const msg = survival_engine.execute_survival_choice(state, "daniel_lifeline");
    expect(msg).toContain("Daniel");
    expect(state.cash).toBeGreaterThan(50_000);
  });

  it("evaluates endings and generates a legacy card", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "STORY_CAMPAIGN", start_cash: 50_000 });
    const state = game.get_session(view.state.session_id);
    state.fund_stats.compliance_risk = 10;
    state.fund_stats.lp_confidence = 85;
    state.fund_stats.staff_morale = 80;
    state.hidden_state!.discipline = 90;
    expect(ending_engine.evaluate_season_ending(state, 75_000)).toBe("THE_NEXT_KING");
    state.fund_stats.compliance_risk = 65;
    expect(ending_engine.evaluate_season_ending(state, 80_000)).toBe("UNDER_INVESTIGATION");
    const outcome = ending_engine.generate_season_outcome(state, 75_000);
    expect(outcome.legacy_card.fund_name).toBe("Dante Capital Management");
    expect(outcome.legacy_card.total_return_pct).toBe(50);
    expect(outcome.narrative_scenes).toHaveLength(5);
  });
});
