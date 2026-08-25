import rawInterjectLines from '../data/interject_lines.json';
import type { GameState, WarRoomMessage } from '../schemas';
import { get_character_dialogue } from './character_arc_engine';

export type ClashStance = 'ATTACK' | 'DEFEND' | 'SNIPE';
export type ClashKind = 'THESIS_COLLISION' | 'RISK_BUDGET' | 'PNL_RECKONING';

export interface ClashContext {
  kind: ClashKind;
  topic: string;
  rounds: 2 | 3;
  yesterdayPnlPct: number | null;
}

export interface ClashSpeakerMeta {
  character_name: string;
  role: string;
  portrait: string;
}

interface InterjectTable {
  slots?: Record<string, Record<string, Partial<Record<ClashStance, string[]>>>>;
}

const INTERJECTS = rawInterjectLines as InterjectTable;

const DEFAULT_META: Record<string, ClashSpeakerMeta> = {
  maya_chen: { character_name: 'Maya Chen', role: 'Research / Fundamental', portrait: '/assets/characters/maya_chen.svg' },
  victor_hale: { character_name: 'Victor Hale', role: 'Risk / Macro', portrait: '/assets/characters/victor_hale.svg' },
  leo_park: { character_name: 'Leo Park', role: 'Options / Execution', portrait: '/assets/characters/leo_park.svg' },
};

function recentRealizedPnlPct(state: GameState): number | null {
  const currentDay = Number(state.game_day_index ?? 0);
  // Hard no-lookahead gate: a War Room on day N may only use NAV points from
  // strictly earlier historical nodes. compute_view can append today's NAV, so
  // filtering by d < currentDay is safer than reasoning from array position.
  const rows = [...(state.nav_history ?? [])]
    .filter((row) => Number.isFinite(row?.d) && Number.isFinite(row?.v) && row.d < currentDay)
    .sort((a, b) => a.d - b.d);
  if (rows.length < 2) return null;
  const end = rows[rows.length - 1];
  const start = rows[rows.length - 2];
  if (!start || start.v <= 0) return null;
  return ((end.v - start.v) / start.v) * 100;
}

export function deriveWarRoomClashContext(
  state: GameState,
  collision?: { headline?: string; framing_question?: string; setup?: string } | null,
): ClashContext {
  const pnlPct = recentRealizedPnlPct(state);
  const marginDebt = Number(state.margin_debt ?? 0);
  const cash = Math.max(1, Number(state.cash ?? 0));
  const complianceRisk = Number(state.fund_stats?.compliance_risk ?? 0);
  const counterpartyTrust = Number(state.fund_stats?.counterparty_trust ?? 100);
  const drawdown = Number(state.max_drawdown_pct ?? 0);

  if (collision) {
    return {
      kind: 'THESIS_COLLISION',
      topic: [collision.headline, collision.framing_question, collision.setup].filter(Boolean).join(' · '),
      rounds: 3,
      yesterdayPnlPct: pnlPct,
    };
  }

  if (marginDebt > cash * 0.25 || complianceRisk >= 45 || counterpartyTrust <= 45 || drawdown >= 10) {
    return {
      kind: 'RISK_BUDGET',
      topic: `当前风险预算：margin debt ${marginDebt.toFixed(0)}，合规风险 ${complianceRisk.toFixed(0)}，最大回撤 ${drawdown.toFixed(1)}%`,
      rounds: drawdown >= 15 || complianceRisk >= 65 ? 3 : 2,
      yesterdayPnlPct: pnlPct,
    };
  }

  return {
    kind: 'PNL_RECKONING',
    topic: pnlPct === null ? '昨日结果尚不足以证明任何一方正确' : `昨日已实现 NAV 变化 ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
    rounds: pnlPct !== null && Math.abs(pnlPct) >= 5 ? 3 : 2,
    yesterdayPnlPct: pnlPct,
  };
}

function pickSlot(kind: ClashKind, characterId: string, stance: ClashStance): string | null {
  const lines = INTERJECTS.slots?.[kind]?.[characterId]?.[stance];
  return Array.isArray(lines) && lines.length ? lines[0] : null;
}

/** 引用截断：只咬对方的第一口话（到首个句读或28字），防止引用里套引用越滚越长。 */
function clipQuote(quote: string): string {
  if (!quote) return quote;
  const clean = quote.replace(/\s+/g, ' ').trim();
  // Replies often begin by quoting the previous speaker. Remove that leading
  // quote before extracting our excerpt, otherwise round 2 nests round 1.
  const withoutNestedLead = clean.replace(/^.{0,14}?[“‘"'][^”’"']{0,40}[”’"'][，,。.!！?？]?\s*/, '');
  const unquoted = (withoutNestedLead || clean).replace(/[“”‘’"']/g, '');
  const stop = unquoted.search(/[。？！；\n]/);
  const head = (stop >= 0 ? unquoted.slice(0, stop) : unquoted).trim();
  return head.length > 12 ? `${head.slice(0, 12)}…` : head;
}

function renderSlot(template: string, topic: string, quote: string, fallback: string): string {
  return template
    .replace(/\{topic\}/g, topic)
    .replace(/\{quote\}/g, clipQuote(quote) || fallback)
    .replace(/\{fallback\}/g, fallback);
}

function buildMessage(
  state: GameState,
  context: ClashContext,
  characterId: 'maya_chen' | 'victor_hale' | 'leo_park',
  stance: ClashStance,
  round: number,
  replyTo: WarRoomMessage | null,
  speakerMeta?: Record<string, ClashSpeakerMeta>,
): WarRoomMessage {
  const fallback = get_character_dialogue(characterId, state, 'WAR_ROOM');
  const quoted = replyTo ? clipQuote(replyTo.message) : '';
  const slot = pickSlot(context.kind, characterId, stance);
  const base = slot ? renderSlot(slot, context.topic, quoted, fallback) : fallback;
  const slotQuotesOpponent = Boolean(slot?.includes('{quote}'));
  const message = replyTo && !slotQuotesOpponent
    ? `你刚才说“${quoted}”。${base}`
    : base;
  const meta = speakerMeta?.[characterId] ?? DEFAULT_META[characterId];
  return {
    character_id: characterId,
    character_name: meta.character_name,
    role: meta.role,
    portrait: meta.portrait,
    message,
    stance,
    evidence: context.topic,
    clash_round: round,
    reply_to_character_id: replyTo?.character_id ?? null,
    reply_to_excerpt: quoted || null,
  };
}

/**
 * Produces a deterministic 2-3 round argument from canonical state only.
 * No market value is invented and no state is mutated. `interject_lines.json`
 * is deliberately a replaceable content table; missing slots fall back to the
 * existing character voice renderer.
 */
export function buildWarRoomClash(
  state: GameState,
  collision?: { headline?: string; framing_question?: string; setup?: string } | null,
  speakerMeta?: Record<string, ClashSpeakerMeta>,
): WarRoomMessage[] {
  const context = deriveWarRoomClashContext(state, collision);
  const messages: WarRoomMessage[] = [];
  for (let round = 1; round <= context.rounds; round += 1) {
    const mayaStance: ClashStance = round === 1 ? 'ATTACK' : 'DEFEND';
    const victorStance: ClashStance = round === 1 ? 'DEFEND' : 'ATTACK';
    const mayaReply = round === 1 ? null : messages[messages.length - 2] ?? null;
    const maya = buildMessage(state, context, 'maya_chen', mayaStance, round, mayaReply, speakerMeta);
    messages.push(maya);
    const victor = buildMessage(state, context, 'victor_hale', victorStance, round, maya, speakerMeta);
    messages.push(victor);
    const leo = buildMessage(state, context, 'leo_park', 'SNIPE', round, victor, speakerMeta);
    messages.push(leo);
  }
  return messages;
}
