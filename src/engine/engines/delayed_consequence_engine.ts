import type { DelayedConsequence, GameState, StoryEventInstance } from '../schemas';
import { new_id } from '../ids';
import { annotateConspiracyEvent } from './conspiracy_web_engine';

export type Batch4ConsequenceKind = 'CRISIS_FERMENTATION' | 'COMPLIANCE_RETALIATION';

export function create_delayed_consequence(
  source_choice_id: string,
  source_episode: number,
  delay_episodes: number,
  headline: string,
  narrative: string,
  compliance_escalation = 0,
  lp_confidence_delta = 0,
): DelayedConsequence {
  return {
    id: new_id(), source_choice_id, source_episode, trigger_episode_delay: delay_episodes,
    headline, narrative, compliance_escalation, lp_confidence_delta, resolved: false,
  };
}

function stableTwoOrThreeDayDelay(seed: string): 2 | 3 {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash * 31) + seed.charCodeAt(i)) >>> 0;
  return hash % 2 === 0 ? 2 : 3;
}

/** Pure builder: compliance choices only register a timer after the risky choice has happened. */
export function createComplianceRetaliationConsequence(
  state: Pick<GameState, 'game_day_index' | 'current_episode_number'>,
  eventId: string,
  choiceId: string,
  complianceDelta: number,
  gameDate: string,
): DelayedConsequence | null {
  if (!Number.isFinite(complianceDelta) || complianceDelta < 15) return null;
  const delay = stableTwoOrThreeDayDelay(`${eventId}:${choiceId}:${gameDate}`);
  const currentDay = Number(state.game_day_index ?? 0);
  return {
    id: new_id(),
    source_choice_id: `story:${eventId}:${choiceId}`,
    source_episode: Number(state.current_episode_number ?? 1),
    trigger_episode_delay: 0,
    trigger_game_day_index: currentDay + delay,
    source_game_date: gameDate,
    consequence_kind: 'COMPLIANCE_RETALIATION',
    forced_story_template_id: 'sec_subpoena',
    headline: 'SEC FOLLOW-UP · 延迟追责到期',
    narrative: `你在 ${gameDate} 的选择把合规风险一次推高 ${complianceDelta} 点。Marcus 的记录没有消失；2–3 个真实交易日后，监管问询正式找上门。`,
    resolved: false,
  };
}

/**
 * Pure builder for "a crash never gets a quiet next day". It only sees the
 * close of the day that has already become the current historical node.
 */
export function createCrisisFermentationConsequence(
  state: Pick<GameState, 'fund_stats' | 'current_episode_number'>,
  gameDate: string,
  previousClose: number,
  observedClose: number,
  observedDayIndex: number,
  thresholdPct = -8,
): DelayedConsequence | null {
  if (!Number.isFinite(previousClose) || !Number.isFinite(observedClose) || previousClose <= 0) return null;
  const movePct = ((observedClose - previousClose) / previousClose) * 100;
  if (movePct > thresholdPct) return null;

  const complianceRisk = Number(state.fund_stats?.compliance_risk ?? 0);
  const lpConfidence = Number(state.fund_stats?.lp_confidence ?? 70);
  const chooseSec = complianceRisk >= (100 - lpConfidence);
  const templateId = chooseSec ? 'sec_subpoena' : 'lp_redemption';
  return {
    id: new_id(),
    source_choice_id: `crisis_fermentation:${gameDate}`,
    source_episode: Number(state.current_episode_number ?? 1),
    trigger_episode_delay: 0,
    trigger_game_day_index: observedDayIndex + 1,
    source_game_date: gameDate,
    consequence_kind: 'CRISIS_FERMENTATION',
    forced_story_template_id: templateId,
    headline: chooseSec ? '暴跌后的第二天：监管要求解释' : '暴跌后的第二天：LP 要求解释',
    narrative: chooseSec
      ? `${gameDate} 已发生 ${movePct.toFixed(1)}% 的单日下跌。当前合规风险 ${complianceRisk.toFixed(0)}，监管端要求调取风险与下单记录。`
      : `${gameDate} 已发生 ${movePct.toFixed(1)}% 的单日下跌。LP 信心只有 ${lpConfidence.toFixed(0)}，资金方要求你在下一个真实交易日解释回撤和流动性。`,
    resolved: false,
  };
}

function dueNow(state: GameState, consequence: DelayedConsequence): boolean {
  if (consequence.resolved) return false;
  if (typeof consequence.trigger_game_day_index === 'number') {
    return Number(state.game_day_index ?? 0) >= consequence.trigger_game_day_index;
  }
  const currentEp = Number(state.current_episode_number ?? 1);
  return currentEp >= consequence.source_episode + consequence.trigger_episode_delay;
}

function forcedEventFrom(consequence: DelayedConsequence, state: GameState): StoryEventInstance {
  const templateId = consequence.forced_story_template_id ?? 'delayed_consequence_event';
  const isSec = templateId === 'sec_subpoena';
  const isLp = templateId === 'lp_redemption' || templateId === 'client_threatens_redemption';
  const event: StoryEventInstance = {
    id: new_id(),
    template_id: templateId,
    game_date: state.market_clock?.current_node_date || state.market_reveal?.session_date || consequence.source_game_date || `EP${state.current_episode_number ?? 1}`,
    character_id: isSec ? 'marcus_reed' : isLp ? 'daniel_ross' : null,
    intel_class: isSec ? 'PUBLIC_VERIFIED' : 'PRIVATE_INTEL',
    headline: consequence.headline,
    body: consequence.narrative,
    sfx: isSec ? 'compliance_warning.wav' : 'message_private.wav',
    resolved: false,
    chosen_choice_id: null,
  };
  return annotateConspiracyEvent(state, event);
}

export function check_and_trigger_delayed_consequences(state: GameState): DelayedConsequence[] {
  const triggered: DelayedConsequence[] = [];
  for (const consequence of state.delayed_consequences ?? []) {
    if (!dueNow(state, consequence)) continue;
    consequence.resolved = true;
    triggered.push(consequence);

    // Legacy episode consequences keep their original immediate numeric effects.
    if (!consequence.consequence_kind) {
      state.fund_stats.compliance_risk = Math.max(0, Math.min(100, (state.fund_stats.compliance_risk ?? 0) + (consequence.compliance_escalation ?? 0)));
      state.fund_stats.lp_confidence = Math.max(0, Math.min(100, (state.fund_stats.lp_confidence ?? 0) + (consequence.lp_confidence_delta ?? 0)));
    }

    // Batch4 consequences become existing story templates so the existing
    // DramaInterruptOverlay + resolve_choice path owns the forced decision.
    // unshift makes a due accountability event the first story item that day.
    (state.pending_story_events ??= []).unshift(forcedEventFrom(consequence, state));
  }
  return triggered;
}
