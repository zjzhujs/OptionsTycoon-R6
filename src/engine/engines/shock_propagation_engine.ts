import type { GameState, ShockEventAnchor, ShockPropagationFrame } from '../schemas';
import * as dataLoader from '../data_loader';

const MIN_TEXT = 8;
function clean(v: string | null | undefined): string { return (v ?? '').trim(); }
function currentDate(state: GameState): string { return state.market_clock?.current_node_date || state.updated_at?.slice(0,10) || '1900-01-01'; }

export function latest_visible_anchor(state: GameState): ShockEventAnchor | null {
  const date = currentDate(state);
  const key = dataLoader.get_campaign_events_key(state.campaign_id ?? 'r1');
  const events = (dataLoader.load_events()[key] ?? []).filter((event) => event.date <= date);
  const event = events.sort((a,b) => b.date.localeCompare(a.date))[0];
  if (!event) return null;
  return {
    event_id: event.id,
    date: event.date,
    tag: event.tag,
    headline: event.headline,
    source: event.source,
    source_type: event.provenance.source_type,
  };
}

export function build_frame(
  anchor: ShockEventAnchor,
  directImpact: string,
  substitutionResponse: string,
  capitalPolicyFeedback: string,
  secondOrderDistribution: string,
  observableNextLink: string,
): ShockPropagationFrame {
  const values = [directImpact, substitutionResponse, capitalPolicyFeedback, secondOrderDistribution, observableNextLink].map(clean);
  if (values.some((v) => v.length < MIN_TEXT)) throw new Error('冲击传导链五步都要写清楚：直接冲击、替代反应、资本/政策反馈、二阶分布、下一条可观察验证信号。');
  return {
    anchor: { ...anchor },
    direct_impact: values[0],
    substitution_response: values[1],
    capital_policy_feedback: values[2],
    second_order_distribution: values[3],
    observable_next_link: values[4],
    updated_at: new Date().toISOString(),
  };
}

export function latest_resolved_frame(state: GameState): ShockPropagationFrame | null {
  const episode = state.current_episode_number ?? 1;
  const collisions = (state.thesis_collisions ?? [])
    .filter((c) => c.resolved && c.episode === episode && c.hypothesis_frame?.shock_propagation_frame)
    .sort((a,b) => b.date.localeCompare(a.date));
  return collisions[0]?.hypothesis_frame?.shock_propagation_frame ?? null;
}
