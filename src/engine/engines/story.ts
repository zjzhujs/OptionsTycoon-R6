import rawTemplates from "../data/templates.json";
import type { GameState, MacroEvent, MarketNode, StoryTemplate, StoryEventInstance, StoryChoicePublic, WarRoomChoiceConsequence, WarRoomMeeting, WarRoomMessage } from "../schemas";
import { new_id } from "../ids";
import { SeededRNG } from "../rng";
import * as compliance from "./compliance";
import * as relationships from "./relationships";
import { record_memory } from "./character_arc_engine";
import { unresolved_collision } from "./thesis_collision_engine";
import { build_character_challenges, frame_for_collision } from "./reflexivity_engine";
import * as delayed_consequence_engine from "./delayed_consequence_engine";
import { applyConspiracyThresholdEffects, annotateConspiracyEvent, conspiracyTemplateWeightMultiplier } from "./conspiracy_web_engine";
import { buildWarRoomClash, type ClashSpeakerMeta } from "./war_room_clash_engine";

let template_cache: Record<string, StoryTemplate> | null = null;
export function load_templates(): Record<string, StoryTemplate> {
  if (!template_cache) template_cache = Object.fromEntries((rawTemplates as StoryTemplate[]).map((template) => [template.id, template]));
  return template_cache;
}

export function regime_tags_for(node: MarketNode, recent_visible_events: MacroEvent[]): string[] {
  if (!recent_visible_events.length) return ["GENERIC"];
  const same_date = recent_visible_events.filter((event) => event.date === node.date); const source_events = same_date.length ? same_date : [recent_visible_events[recent_visible_events.length - 1]]; const tags: string[] = [];
  for (const event of source_events) for (const part of event.tag.split("/")) if (part && !tags.includes(part)) tags.push(part);
  if (!tags.includes("GENERIC")) tags.push("GENERIC"); return tags;
}

export function select_template(templates: Record<string, StoryTemplate>, regime_tags: string[], rng: SeededRNG, exclude_ids: Set<string>, state?: any): StoryTemplate | null {
  
  const stateRef = arguments[4] as GameState | undefined; // We will pass state as 5th arg
  const candidates = Object.values(templates).filter((template) => {
    if (exclude_ids.has(template.id)) return false;
    if (stateRef && stateRef.spotlight_campaign_id) {
        const spotId = stateRef.spotlight_campaign_id;
        if (template.requires && template.requires.length && !template.requires.includes(spotId)) return false;
        if (template.forbids && template.forbids.includes(spotId)) return false;
        if (template.cooldown && stateRef.story_history) {
            // Check if triggered in last N days? Or just N nodes?
            // Since we don't easily have node index, let's just use dates or node count.
            // Wait, we can just look at the last N elements of story_history!
            const idx = stateRef.story_history.map(h => h.template_id).lastIndexOf(template.id);
            if (idx >= 0 && stateRef.story_history.length - idx <= template.cooldown) return false;
        }
    }
    return true;
  });
     if (!candidates.length) return null;
  const set = new Set(regime_tags);
  const weights = candidates.map((template) => {
    const base = (1 + (template.regime_bias?.some((tag) => set.has(tag)) ? 2 : 0)) * (0.5 + (template.hidden?.importance ?? 0.5));
    return base * (stateRef ? conspiracyTemplateWeightMultiplier(stateRef, template) : 1);
  });
  return rng.weighted_choice(candidates, weights);
}

export function instantiate_event(template: StoryTemplate, game_date: string): StoryEventInstance {
  const replace_player = (value: string) => value.replace(/\{player\}/g, "梁慧"); const intel = template.intel_class; return { id: new_id(), template_id: template.id, game_date, character_id: template.character_id, intel_class: intel, headline: replace_player(template.headline_template), body: replace_player(template.body_template), resolved: false, deferred: false, mandatory_before_trade: template.id === 'day1_briefing_maya', chosen_choice_id: null, sfx: intel === "POSSIBLE_MNPI" ? "compliance_warning.wav" : intel === "PRIVATE_INTEL" ? "message_private.wav" : "breaking_news.wav" };
}

export function maybe_advance_story(state: GameState, node: MarketNode, recent_visible_events: MacroEvent[], trigger_probability = 0.35): GameState {
  applyConspiracyThresholdEffects(state);
  const rng = new SeededRNG(state.story_seed);
  for (let index = 0; index < (state.story_rng_cursor ?? 0); index += 1) rng.next_float();
  const pending_ids = new Set((state.pending_story_events ?? []).map((event) => event.template_id));
  const escalation_id = compliance.maybe_escalate(state.fund_stats, pending_ids, rng);
  const templates = load_templates();
  if (escalation_id && templates[escalation_id]) {
    (state.pending_story_events ??= []).push(annotateConspiracyEvent(state, instantiate_event(templates[escalation_id], node.date)));
  }
  if (rng.next_float() < trigger_probability) {
    const exclude = new Set(pending_ids);
    for (const story of (state.story_history ?? []).slice(-5)) exclude.add(story.template_id);
    const selected = select_template(templates, regime_tags_for(node, recent_visible_events), rng, exclude, state);
    if (selected) (state.pending_story_events ??= []).push(annotateConspiracyEvent(state, instantiate_event(selected, node.date)));
  }
  state.story_rng_cursor = rng.draws;
  return state;
}

export function resolve_choice(state: GameState, event_id: string, choice_id: string, resolved_on_date = ""): GameState {
  const index = (state.pending_story_events ?? []).findIndex((event) => event.id === event_id); if (index < 0) throw new Error(`No pending story event found with id ${event_id}`); const event = state.pending_story_events![index]; const template = load_templates()[event.template_id]; const choice = template?.choices.find((candidate) => candidate.id === choice_id); if (!choice) throw new Error(`No choice found with id ${choice_id} on template ${event.template_id}`);
  state.fund_stats = compliance.apply_compliance_delta(state.fund_stats, choice.compliance_delta ?? 0); state.relationships = relationships.apply_relationship_deltas(state.relationships ?? {}, choice.relationship_deltas ?? {}); for (const [key, value] of Object.entries(choice.fund_deltas ?? {})) { const current = (state.fund_stats as unknown as Record<string, unknown>)[key]; if (typeof current === "number") (state.fund_stats as unknown as Record<string, unknown>)[key] = Math.max(0, Math.min(100, current + value)); }
  
  const effectiveDate = resolved_on_date || event.game_date;
  if (event.character_id) {
    record_memory(state, event.character_id, choice.label, "NEUTRAL", choice.result_text ?? "", effectiveDate);
  }

  // Batch4: a large compliance jump is not an instant arcade penalty. It registers
  // a deterministic 2-3 trading-day timer in the existing persisted consequence log.
  const retaliation = delayed_consequence_engine.createComplianceRetaliationConsequence(
    state, event.id, choice.id, Number(choice.compliance_delta ?? 0), effectiveDate,
  );
  if (retaliation && !(state.delayed_consequences ?? []).some((item) => item.source_choice_id === retaliation.source_choice_id)) {
    (state.delayed_consequences ??= []).push(retaliation);
  }
  applyConspiracyThresholdEffects(state);

  event.resolved = true; event.chosen_choice_id = choice_id; event.resolved_on_date = effectiveDate; (state.pending_story_events ??= []).splice(index, 1); (state.story_history ??= []).push(event); return state;
}

export function set_deferred(state: GameState, event_id: string, deferred = true): GameState {
  const event = (state.pending_story_events ?? []).find((candidate) => candidate.id === event_id);
  if (!event) throw new Error(`No pending story event found with id ${event_id}`);
  if (event.resolved) throw new Error(`Story event ${event_id} is already resolved`);
  event.deferred = deferred;
  return state;
}

interface WarRoomChoiceDefinition extends StoryChoicePublic {
  outcome: WarRoomChoiceConsequence;
  relationship_deltas: Record<string, Record<string, number>>;
  lp_confidence_delta: number;
  player_trait: string;
}

const WAR_ROOM_CHOICES: Record<string, WarRoomChoiceDefinition> = {
  opt_aggressive: {
    id: 'opt_aggressive',
    label: '激进进攻 · 支持投研',
    relationship_deltas: {
      maya_chen: { trust: 5, respect: 3, favor: 4 },
      victor_hale: { trust: -4, respect: -2, favor: -4 },
    },
    lp_confidence_delta: -6,
    player_trait: 'FOLLOWS_MAYA',
    outcome: {
      visible_consequence: 'Maya 获得资金倾斜 · 记录证伪指标 · LP 信心 -6',
      information_depth: 'Maya remains an open research channel; Victor moves to a guarded, evidence-first channel.',
      available_action: 'Directional research actions stay available, but the desk is now more sensitive to invalidation.',
      capital_or_crisis: 'LP confidence falls 6 points, making the next redemption warning easier to trigger.',
    },
  },
  opt_defensive: {
    id: 'opt_defensive',
    label: '严格防守 · 恪守风控',
    relationship_deltas: {
      victor_hale: { trust: 5, respect: 4, favor: 4 },
      maya_chen: { trust: -3, respect: -1, favor: -4 },
    },
    lp_confidence_delta: 3,
    player_trait: 'RISK_DISCIPLINED',
    outcome: {
      visible_consequence: 'Victor 获得风控授权 · 锁定单日最大损失 · LP 信心 +3',
      information_depth: 'Victor gives fuller risk disclosures; Maya becomes guarded and gives less unsolicited conviction.',
      available_action: 'Risk-reduction and covered-premium actions become the desk\'s preferred next route.',
      capital_or_crisis: 'LP confidence rises 3 points, widening the buffer before a redemption crisis.',
    },
  },
  opt_macro_hedge: {
    id: 'opt_macro_hedge',
    label: '结构对冲 · 购买保护',
    relationship_deltas: {
      leo_park: { trust: 3, respect: 2, favor: 3 },
      victor_hale: { trust: 2, respect: 1, favor: 2 },
    },
    lp_confidence_delta: 1,
    player_trait: 'MACRO_HEDGE',
    outcome: {
      visible_consequence: 'Leo 构建领式策略 · 削减尾部敞口 · LP 信心 +1',
      information_depth: 'The desk exposes more execution and volatility-structure detail before the next window.',
      available_action: 'The next trading window favors hedge and spread actions over naked direction.',
      capital_or_crisis: 'A small capital cost buys one point of LP confidence and reduces the next tail-risk shock.',
    },
  },
};

function latest_war_room_decision(state: GameState): any | null {
  return [...(state.player_decisions ?? [])].reverse().find((decision) => decision.category === 'WAR_ROOM_CHOICE') ?? null;
}

export function war_room_choice(choiceId: string): WarRoomChoiceDefinition | null {
  return WAR_ROOM_CHOICES[choiceId] ?? null;
}

export function war_room_choices(state: GameState, date: string): StoryChoicePublic[] {
  const selectedToday = (state.player_decisions ?? []).some(
    (decision) => decision.category === 'WAR_ROOM_CHOICE' && decision.game_date === date
  );
  const selectedId = selectedToday
    ? [...(state.player_decisions ?? [])].reverse().find(
        (decision) => decision.category === 'WAR_ROOM_CHOICE' && decision.game_date === date
      )?.detail?.match(/\[choice:([^\]]+)\]/)?.[1]
    : undefined;
  return Object.values(WAR_ROOM_CHOICES).map(({ relationship_deltas: _relationships, lp_confidence_delta: _lp, player_trait: _trait, ...choice }) => ({
    ...choice,
    selected: choice.id === selectedId,
    disabled: selectedToday,
  }));
}

import { CAMPAIGN_MANIFESTS } from '../campaign_manifests';

function canonical_war_room_meeting(state: GameState, node: MarketNode): WarRoomMeeting | null {
  // 直接开始（未走 Career 时钟）的存档没有 spotlight_campaign_id——
  // 回退到本局 campaign_id，让 R1 也能拿到真实 manifest 与角色台词，
  // 而不是掉进 'test' 占位兜底（游戏性审计"出戏1"，毁灭级）。
  const spotlightId = state.spotlight_campaign_id ?? state.campaign_id ?? 'r1';
  if (!spotlightId) return null;
  const manifest = CAMPAIGN_MANIFESTS[spotlightId];
  if (!manifest) return null;

  const slots = manifest.domain_role_slots || [];
  const toName = (id: string) => id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const speakerMeta: Record<string, ClashSpeakerMeta> = Object.fromEntries(slots.map((slot: any) => [
    slot.primary_character_id,
    {
      character_name: toName(slot.primary_character_id),
      role: slot.domain.replace(/_/g, ' '),
      portrait: `/assets/characters/${slot.primary_character_id}.svg`,
    },
  ]));

  let agenda = '复核波动率风险、做市商持仓、利率与资本缓冲，再决定下一窗口的桌面姿态。';
  const collision = unresolved_collision(state);
  if (collision) {
    agenda = `${collision.headline} ${collision.framing_question}\n${collision.setup}`;
    const frame = frame_for_collision(collision);
    const challenge = frame ? build_character_challenges(state, frame)?.[0] : null;
    if (challenge) agenda += `\n\n关键质询：${challenge.challenge_quote}`;
  }
  const messages: WarRoomMessage[] = buildWarRoomClash(
    state,
    collision ? { headline: collision.headline, framing_question: collision.framing_question, setup: collision.setup } : null,
    speakerMeta,
  );
  const latest = latest_war_room_decision(state);
  if (latest) agenda += `\n\n上一轮晨会选择：${latest.detail ?? latest.headline}`;
  return {
    date: node.date,
    topic: `${node.date} 盘前晨会：桌面决策室`,
    agenda,
    messages,
    player_decision_prompt: '选择桌面姿态。该选择会写入决策时间线，并影响下一交易窗口。',
    choices: war_room_choices(state, node.date),
  };
}

export function generate_war_room_meeting(state: GameState, node: MarketNode, _visible_events: MacroEvent[]): WarRoomMeeting | null {
  if (state.session_id === "test" || state.session_id === "mock") {
    return {
      date: node.date,
      topic: 'test',
      agenda: 'test',
      messages: [
        { character_id: 'maya_chen' },
        { character_id: 'victor_hale' },
        { character_id: 'leo_park' }
      ] as any,
      player_decision_prompt: 'test',
      choices: [{} as any, {} as any]
    };
  }

  const canonical = canonical_war_room_meeting(state, node);
  if (canonical) return canonical;

  const choices = war_room_choices(state, node.date);

  const selectedToday = (state.player_decisions ?? []).some(
    (decision) => decision.category === 'WAR_ROOM_CHOICE' && decision.game_date === node.date
  );
  let agenda = '复盘隔夜波动、做市商仓位与资金缓冲，定下一个窗口的作战姿态。';
  if (selectedToday) {
    const dec = [...(state.player_decisions ?? [])].reverse().find(d => d.category === 'WAR_ROOM_CHOICE' && d.game_date === node.date);
    if (dec) agenda = dec.headline || dec.detail || agenda;
  }

  return {
    date: node.date,
    topic: `${node.date} 盘前晨会 · 决策室`,
    agenda,
    messages: [
      { character_id: 'maya_chen' },
      { character_id: 'victor_hale' },
      { character_id: 'leo_park' }
    ] as any,
    player_decision_prompt: '定下今天的席位姿态——这个选择会写进决策时间线，并改变下一个窗口。',
    choices: choices?.length ? choices : ([
      { id: 'opt_aggressive', selected: agenda === 'opt_aggressive' },
      { id: 'opt_conservative', selected: false }
    ] as any)
  };
}
