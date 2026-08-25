import { beforeEach, describe, expect, it } from 'vitest';
import * as dataLoader from '../data_loader';
import * as game from '../game';
import * as humanActions from '../engines/human_actions';
import * as marketReveal from '../engines/market_reveal';
import * as characterArc from '../engines/character_arc_engine';
import type { GameState, HumanActionEvent } from '../schemas';

function newSession(startCash = 100_000): string {
  return game.new_game({
    campaign_id: 'r1',
    mode: 'STORY_CAMPAIGN',
    account_type: 'Margin',
    start_cash: startCash,
    story_seed: 17,
  }).state.session_id;
}

function resolveEveryIncomingSignal(sessionId: string, collisionId: string): void {
  let view = game.get_view(sessionId);
  for (;;) {
    const incoming = view.state.noise_stream?.find(
      (item: any) => item.collision_id === collisionId && item.arrived && !item.classification,
    );
    if (!incoming) return;
    game.classify_thesis_collision_signal(sessionId, collisionId, incoming.signal_id, 'WATCH');
    view = game.get_view(sessionId);
  }
}

function costedEvent(wallet: 'FUND_CASH' | 'MANAGEMENT_COMPANY' | 'GP_WEALTH', id: string): HumanActionEvent {
  return {
    id,
    date: '2025-01-23',
    action_kind: 'FAVOR_REQUEST',
    character_id: 'maya_chen',
    headline: `Wallet test ${wallet}`,
    body: 'Wallet isolation regression test.',
    choices: [{ id: 'spend', label: 'Spend', cost_usd: 100, wallet, result_narrative: 'Recorded.' }],
    resolved: false,
    chosen_choice_id: null,
    source_type: 'SIMULATED',
  };
}

describe('audit Batch0 regressions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps market-reveal and thesis-collision reasoning finite in either order', () => {
    const run = (thesisFirst: boolean) => {
      const sid = newSession();
      const state = game.get_session(sid);
      state.current_episode_number = 2;
      state.market_clock!.current_node_date = '2025-01-23';
      const window = {
        visible_price_bars: [{ open: 100, close: 99 }],
      } as any;

      if (thesisFirst) {
        game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 thesis', 'Batch0');
        const collision = game.get_view(sid).state.thesis_collisions?.find((item: any) => !item.resolved)!;
        resolveEveryIncomingSignal(sid, collision.id);
        game.reveal_thesis_collision_second_order(sid, collision.id);
      }

      marketReveal.consequencesFor(window, 'HOLD', 'Batch0', state);

      if (!thesisFirst) {
        game.record_player_decision(sid, 'THESIS_CREATED', 'EP2 thesis', 'Batch0');
        const collision = game.get_view(sid).state.thesis_collisions?.find((item: any) => !item.resolved)!;
        resolveEveryIncomingSignal(sid, collision.id);
        game.reveal_thesis_collision_second_order(sid, collision.id);
      }

      const snapshot = state as any;
      expect(snapshot.market_reveal_profile).toBeTruthy();
      expect(snapshot.thesis_session_profile).toBeTruthy();
      for (const profile of [snapshot.market_reveal_profile, snapshot.thesis_session_profile]) {
        for (const value of Object.values(profile)) expect(Number.isFinite(value)).toBe(true);
      }
      expect(snapshot.reasoning_profile).toBeUndefined();
    };

    run(false);
    run(true);
  });

  it('persists a War Room choice and its visible consequence through save/load', () => {
    const sid = newSession();
    const before = JSON.parse(JSON.stringify(game.get_view(sid)));
    const [after, message] = game.resolve_war_room_choice(sid, 'opt_aggressive');

    expect(message.length).toBeGreaterThan(10);
    expect(after.state.player_decisions?.some((decision) => decision.category === 'WAR_ROOM_CHOICE')).toBe(true);
    expect(after.state.character_memories?.maya_chen?.length).toBeGreaterThan(0);
    expect(after.state.relationships?.maya_chen.trust).toBeGreaterThan(before.state.relationships!.maya_chen.trust!);
    expect(after.latest_war_room?.agenda).toContain('opt_aggressive');

    game.save_game(sid, 'audit-batch0-war-room');
    const restored = game.load_game('audit-batch0-war-room');
    expect(restored.state.player_decisions?.some((decision) => decision.category === 'WAR_ROOM_CHOICE')).toBe(true);
    expect(restored.latest_war_room?.choices?.find((choice) => choice.id === 'opt_aggressive')?.selected).toBe(true);
    expect(restored.latest_war_room?.agenda).toContain('opt_aggressive');
  });

  it('keeps all three human-action wallets isolated', () => {
    const sid = newSession();
    const state = game.get_session(sid);
    state.management_company!.cash = 1_000;
    state.gp_wealth!.cash = 1_000;
    const initialFundCash = state.cash;
    const initialManagementCash = state.management_company!.cash;
    const initialGpCash = state.gp_wealth!.cash;

    for (const [index, wallet] of (['FUND_CASH', 'MANAGEMENT_COMPANY', 'GP_WEALTH'] as const).entries()) {
      const event = costedEvent(wallet, `wallet-${index}`);
      state.human_action_events!.push(event);
      const nodeDate = dataLoader.get_campaign_nodes('r1')[0].date;
      expect(humanActions.resolve_human_action(state, event.id, 'spend', nodeDate)).toBeTruthy();
    }

    expect(state.cash).toBe(initialFundCash - 100);
    expect(state.management_company!.cash).toBe(initialManagementCash - 100);
    expect(state.gp_wealth!.cash).toBe(initialGpCash - 100);
    expect(state.capital_spend_log?.map((entry) => entry.wallet).slice(-3)).toEqual([
      'FUND_CASH',
      'MANAGEMENT_COMPANY',
      'GP_WEALTH',
    ]);
  });

  it('records character memory on the game date, not the wall clock date', () => {
    const sid = newSession();
    const state = game.get_session(sid);
    state.market_clock!.current_node_date = '2025-01-27';
    characterArc.record_memory(state, 'maya_chen', 'A dated decision.', 'REMEMBERED');
    expect(state.character_memories!.maya_chen[0].timestamp).toBe('2025-01-27');
  });
});
