import rawRules from '../data/conspiracy_web.json';
import type { GameState, StoryEventInstance, StoryTemplate } from '../schemas';

interface Threshold {
  trust_lte?: number;
  favor_lte?: number;
  rivalry_gte?: number;
}
interface Rule {
  id: string;
  character_id: string;
  threshold: Threshold;
  effects: Record<string, number>;
}
interface ConspiracyTable { rules: Rule[] }
const TABLE = rawRules as ConspiracyTable;
const MARKER_PREFIX = 'batch4_conspiracy:';

function thresholdMet(state: GameState, rule: Rule): boolean {
  const rel = state.relationships?.[rule.character_id];
  if (!rel) return false;
  const t = rule.threshold;
  const checks: boolean[] = [];
  if (typeof t.trust_lte === 'number') checks.push(Number(rel.trust ?? 100) <= t.trust_lte);
  if (typeof t.favor_lte === 'number') checks.push(Number(rel.favor ?? 100) <= t.favor_lte);
  if (typeof t.rivalry_gte === 'number') checks.push(Number(rel.rivalry ?? 0) >= t.rivalry_gte);
  // A rule intentionally acts as an OR-net: one seriously broken relationship
  // dimension is enough to create hidden institutional friction.
  return checks.some(Boolean);
}

export function activeConspiracyRules(state: GameState): Rule[] {
  return TABLE.rules.filter((rule) => thresholdMet(state, rule));
}

export function conspiracyTemplateWeightMultiplier(state: GameState, template: StoryTemplate): number {
  const active = activeConspiracyRules(state);
  if (template.id === 'short_seller_report' && active.some((rule) => rule.id === 'adrian_retaliation_web')) return 1.75;
  return 1;
}

/** Idempotent, small, real effects using existing fields only. */
export function applyConspiracyThresholdEffects(state: GameState): string[] {
  const logs: string[] = [];
  const flags = (state.compliance_state ??= {}) as Record<string, unknown>;
  for (const rule of activeConspiracyRules(state)) {
    const marker = `${MARKER_PREFIX}${rule.id}`;
    if (flags[marker]) continue;
    flags[marker] = true;
    if (rule.id === 'adrian_retaliation_web') {
      state.fund_stats.compliance_risk = Math.min(100, Math.max(0, Number(state.fund_stats.compliance_risk ?? 0) + Number(rule.effects.compliance_risk_delta_once ?? 0)));
      logs.push('External scrutiny increased after the Adrian relationship fracture.');
    }
    if (rule.id === 'daniel_credit_committee_web') {
      const jpm = ((state.institutional_relationships ??= {}).jpmorgan ??= {}) as Record<string, number>;
      jpm.trust = Math.max(0, Number(jpm.trust ?? 60) + Number(rule.effects.jpm_trust_delta_once ?? 0));
      jpm.financing_spread_bps = Math.max(0, Number(jpm.financing_spread_bps ?? 150) + Number(rule.effects.jpm_financing_spread_bps_delta_once ?? 0));
      state.fund_stats.counterparty_trust = Math.max(0, Math.min(100, Number(state.fund_stats.counterparty_trust ?? 70) + Number(rule.effects.counterparty_trust_delta_once ?? 0)));
      logs.push('PB credit committee terms tightened after the Daniel relationship fracture.');
    }
  }
  return logs;
}

export function conspiracyEventAnnotation(state: GameState, templateId: string): string | null {
  const active = activeConspiracyRules(state);
  if (active.some((rule) => rule.id === 'adrian_retaliation_web')) {
    if (templateId === 'short_seller_report') return 'Adrian 冷笑：“你真以为上次把我踩进泥里，这笔账就会自己消失？”';
    if (templateId === 'sec_subpoena') return 'Marcus 压低声音：“Adrian 不能指挥 SEC，但你们公开撕破脸以后，外面的眼睛确实更多了。别把因果和风险暴露混为一谈。”';
  }
  if (active.some((rule) => rule.id === 'daniel_credit_committee_web') && templateId === 'prime_broker_margin_call') {
    return 'Daniel 语气冰冷：“上次你把我当传声筒羞辱。现在 risk committee 不会再替你留善意 haircut。”';
  }
  return null;
}

export function annotateConspiracyEvent(state: GameState, event: StoryEventInstance): StoryEventInstance {
  const line = conspiracyEventAnnotation(state, event.template_id);
  if (line && !event.body.includes(line)) event.body = `${event.body}\n\n${line}`;
  return event;
}
