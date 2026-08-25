import type { ContinuityPolicy, GameState, TransitionSpec } from './schemas';
import { CAMPAIGN_MANIFESTS } from './campaign_manifests';
import { applyTransitionSpec } from './campaign_contract';

const TRANSITION_CONTINUITY: ContinuityPolicy = {
  preserve: ['RELATIONSHIPS', 'MEMORIES', 'TRAITS', 'LP', 'PB', 'COMPLIANCE_META'],
  position_rule: 'MANIFEST_GATED',
  keep_fund_balance_sheet: true,
};

export function advanceCareerClock(state: GameState, date: string): TransitionSpec[] {
  if (!state.career_clock) return [];
  if (state.career_clock.current_at >= date) return [];

  const transitions: TransitionSpec[] = [];
  const currentAt = state.career_clock.current_at;
  
  const events: { date: string; kind: 'START' | 'END'; campaignId: string }[] = [];
  
  for (const manifest of Object.values(CAMPAIGN_MANIFESTS)) {
    if (manifest.start_at > currentAt && manifest.start_at <= date) {
      events.push({ date: manifest.start_at, kind: 'START', campaignId: manifest.id });
    }
    if (manifest.end_at > currentAt && manifest.end_at <= date) {
      events.push({ date: manifest.end_at, kind: 'END', campaignId: manifest.id });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind === 'END' && b.kind === 'START') return -1;
    if (a.kind === 'START' && b.kind === 'END') return 1;
    return 0;
  });

  for (const ev of events) {
    if (ev.kind === 'START') {
      const spec: TransitionSpec = {
        id: ev.campaignId + '_ENTER_' + ev.date,
        campaign_id: ev.campaignId,
        kind: 'ENTER',
        trigger: { kind: 'DATE', at: ev.date },
        continuity: TRANSITION_CONTINUITY,
      };
      applyTransitionSpec(state, spec, ev.date);
      transitions.push(spec);
    } else if (ev.kind === 'END') {
      const spec: TransitionSpec = {
        id: ev.campaignId + '_COMPLETE_' + ev.date,
        campaign_id: ev.campaignId,
        kind: 'COMPLETE',
        trigger: { kind: 'DATE', at: ev.date },
        continuity: TRANSITION_CONTINUITY,
      };
      applyTransitionSpec(state, spec, ev.date);
      transitions.push(spec);

      const active = state.active_campaign_ids || [];
      let bestDormant: string | null = null;
      let earliestDate = '9999-99-99';
      for (const cid of active) {
        if (state.campaign_progress?.[cid]?.status === 'ACTIVE_DORMANT') {
          const m = CAMPAIGN_MANIFESTS[cid];
          if (m && m.end_at < earliestDate) {
            earliestDate = m.end_at;
            bestDormant = cid;
          }
        }
      }

      if (bestDormant) {
        const resumeSpec: TransitionSpec = {
          id: bestDormant + '_RESUME_' + ev.date,
          campaign_id: bestDormant,
          kind: 'RESUME',
          trigger: { kind: 'DATE', at: ev.date },
          continuity: TRANSITION_CONTINUITY,
        };
        applyTransitionSpec(state, resumeSpec, ev.date);
        transitions.push(resumeSpec);
      }
    }
  }

  state.career_clock.current_at = date;
  
  return transitions;
}


import rawCampaignBeats from './data/campaigns_new.json';
import { instantiate_event } from './engines/story';
import type { StoryTemplate } from './schemas';

export function orchestrateCampaignBeats(state: GameState, date: string): void {
  const spotId = state.spotlight_campaign_id;
  if (!spotId) return;
  const manifest = CAMPAIGN_MANIFESTS[spotId];
  const progress = state.campaign_progress?.[spotId];
  if (!manifest || !progress) return;

  // Next beat index must equal resolved beat length to spawn the next one (one at a time)
  if (progress.next_beat_index === progress.resolved_beat_ids.length && progress.next_beat_index < manifest.activation_beats.length) {
    const nextId = manifest.activation_beats[progress.next_beat_index];
    
    // Ensure it's not already pending
    const isPending = (state.pending_story_events || []).some(e => e.template_id === nextId);
    if (!isPending) {
      let beat = (rawCampaignBeats as StoryTemplate[]).find((b: StoryTemplate) => b.id === nextId);
      if (beat) {
        // C8 delayed consequence based on C8_1
        if (nextId === 'c8_7_postmortem') {
          const history = (state.story_history || []).find(e => e.template_id === 'c8_1_mnpi_rumor');
          if (history) {
            const choseFrontRun = history.chosen_choice_id === 'c8_1_front_run';
            const clone = JSON.parse(JSON.stringify(beat));
            if (choseFrontRun) {
                clone.body_template = "收购正式完成了。你当时选择了抢跑，哪怕这近两年的拉锯里你表现得再完美，Marcus 也会带着 SEC 的协查函冷冷地看着你：'你以为时间能洗白早期的违规建仓？SEC 的大数据筛查终于比对出了你那几笔可疑的前置交易。延迟的报应到了。'";
                clone.choices[0].result_text = "SEC 罚单已下达。";
                clone.choices[0].fund_deltas = { reputation: -30 };
                clone.choices[0].relationship_deltas = { marcus_reed: { trust: -30, respect: -20 } };
            } else {
                clone.body_template = "收购正式完成了。因为你在最初忍住了内幕消息的诱惑，严格依法进行套利，Marcus 递给你一份干净无瑕的审计通过报告：'我们合规地赚到了这笔钱，没有人能找我们的麻烦。'";
            }
            beat = clone;
          }
        }
        
        state.pending_story_events ??= [];
        state.pending_story_events.push(instantiate_event(beat, date));
        progress.next_beat_index++;
      }
    }
  }
}
