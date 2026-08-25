import { describe, expect, it } from 'vitest';
import * as game from '../game';
import { assertCampaignMacroEventTag, assertCampaignProgressInvariant, createCampaignArcState } from '../campaign_contract';
import { advanceCareerClock } from '../career_orchestrator';
import { CAMPAIGN_MANIFESTS } from '../campaign_manifests';
import { get_campaign_events_key, get_campaign_nodes, load_events } from '../data_loader';
import { getOfflineContentPackManifest, getOfflineIntradaySession } from '../engines/offline_content_pack';

describe('P5 C4 → GME → C8/C5/C6 vertical slice', () => {
  it('replays one real node through every overlapping campaign engine path', () => {
    const campaigns = ['c4', 'gme', 'c8', 'c5', 'c6'] as const;
    for (const [index, campaignId] of campaigns.entries()) {
      const nodes = get_campaign_nodes(campaignId);
      expect(nodes.length, `${campaignId} must have real market nodes`).toBeGreaterThan(1);
      const first = nodes[0];
      const pack = getOfflineContentPackManifest(campaignId)!;
      expect(pack.runtime_network_required).toBe(false);
      expect(pack.included_sessions.some((session) => session.date === first.date)).toBe(true);
      expect(getOfflineIntradaySession(campaignId, first.date, pack.included_sessions.find((s) => s.date === first.date)!.ticker)).toBeTruthy();

      const initial = game.new_game({
        campaign_id: campaignId,
        mode: 'HISTORICAL_REPLAY',
        account_type: 'Cash',
        start_cash: 50_000,
        story_seed: 7000 + index,
      });
      expect(initial.state.market_clock.total_nodes).toBe(nodes.length);
      const advanced = game.advance_market(initial.state.session_id, 'NEXT_NODE');
      expect(advanced.state.game_day_index).toBe(1);
      expect(advanced.state.market_clock.current_node_date).toBe(nodes[1].date);
    }
  });

  it('moves the global clock C4 → GME → C8 while C5 and C6 take focus, then resumes C8', () => {
    const state = {
      campaign_id: 'c4',
      career_clock: { current_at: '2020-03-09', transition_cursor: null, last_advance_at: '2020-03-09' },
      campaign_progress: { c4: createCampaignArcState('ACTIVE_FOCUS') },
      spotlight_campaign_id: 'c4',
      active_campaign_ids: ['c4'],
    } as any;

    for (const date of ['2020-03-23', '2021-01-11', '2022-01-18', '2022-04-18', '2022-06-09']) {
      advanceCareerClock(state, date);
      assertCampaignProgressInvariant(state.campaign_progress);
    }

    expect(state.campaign_progress.c4.status).toBe('COMPLETED');
    expect(state.campaign_progress.gme.status).toBe('COMPLETED');
    expect(state.campaign_progress.c8.status).toBe('ACTIVE_DORMANT');
    expect(state.campaign_progress.c5.status).toBe('COMPLETED');
    expect(state.campaign_progress.c6.status).toBe('ACTIVE_FOCUS');
    expect(state.active_campaign_ids).toEqual(['c6', 'c8']);
    expect(state.spotlight_campaign_id).toBe('c6');

    advanceCareerClock(state, '2022-06-17');
    assertCampaignProgressInvariant(state.campaign_progress);
    expect(state.campaign_progress.c6.status).toBe('COMPLETED');
    expect(state.campaign_progress.c8.status).toBe('ACTIVE_FOCUS');
    expect(state.spotlight_campaign_id).toBe('c8');
  });

  it('keeps the shared event and overlap contracts honest', () => {
    expect(CAMPAIGN_MANIFESTS.c8.can_overlap).toBe(true);
    expect(CAMPAIGN_MANIFESTS.c8.background_update_policy.mark_to_market).toBe(true);
    expect(CAMPAIGN_MANIFESTS.c5.can_overlap).toBe(false);
    expect(CAMPAIGN_MANIFESTS.c6.can_overlap).toBe(false);

    for (const campaignId of ['c4', 'gme', 'c8', 'c5', 'c6'] as const) {
      const events = load_events()[get_campaign_events_key(campaignId)];
      expect(events.length, campaignId).toBeGreaterThan(0);
      for (const event of events) expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });
});
