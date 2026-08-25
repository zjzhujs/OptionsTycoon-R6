import type { StoryEventPublic } from '../schemas';

export type DramaInterruptKind =
  | 'MARGIN_BREACH'
  | 'SEC_SUBPOENA'
  | 'MARKET_CRASH'
  | 'LP_REDEMPTION'
  | 'SHORT_ATTACK';

export interface DramaInterrupt {
  id: string;
  kind: DramaInterruptKind;
  gameDate: string;
  mandatory: boolean;
  characterId: string;
  headline: string;
  body: string;
  eventId?: string;
  source: 'STORY_EVENT' | 'MARKET_STATE' | 'MARGIN_STATE';
  movePct?: number;
}

export interface DramaInterruptInput {
  gameDate: string;
  storyEvent?: Pick<StoryEventPublic, 'id' | 'template_id' | 'headline' | 'body'> | null;
  previousClose?: number | null;
  revealedPrice?: number | null;
  marginCallActive?: boolean;
  /** True after a non-mandatory intrusion has already been shown for this game date. */
  dailyInterruptUsed?: boolean;
}

const STORY_KIND_BY_TEMPLATE: Record<string, Exclude<DramaInterruptKind, 'MARKET_CRASH' | 'MARGIN_BREACH'>> = {
  sec_subpoena: 'SEC_SUBPOENA',
  lp_redemption: 'LP_REDEMPTION',
  client_threatens_redemption: 'LP_REDEMPTION',
  short_seller_report: 'SHORT_ATTACK',
};

const CHARACTER_BY_KIND: Record<DramaInterruptKind, string> = {
  MARGIN_BREACH: 'daniel_ross',
  SEC_SUBPOENA: 'marcus_reed',
  MARKET_CRASH: 'victor_hale',
  LP_REDEMPTION: 'daniel_ross',
  SHORT_ATTACK: 'adrian_cross',
};

/**
 * Story events are classified by stable template id first. The text fallback is
 * deliberately conservative and exists only for old saves/templates whose ids
 * predate the current catalog.
 */
export function classifyStoryDrama(
  event: Pick<StoryEventPublic, 'id' | 'template_id' | 'headline' | 'body'> | null | undefined,
): Exclude<DramaInterruptKind, 'MARKET_CRASH' | 'MARGIN_BREACH'> | null {
  if (!event) return null;
  const direct = STORY_KIND_BY_TEMPLATE[event.template_id];
  if (direct) return direct;

  const text = `${event.headline ?? ''} ${event.body ?? ''}`.toLowerCase();
  if (/sec|subpoena|传票|监管调查/.test(text)) return 'SEC_SUBPOENA';
  if (/赎回|redemption|撤资/.test(text)) return 'LP_REDEMPTION';
  if (/做空|short seller|short attack|狙击报告/.test(text)) return 'SHORT_ATTACK';
  return null;
}

export function revealedMovePct(previousClose: number | null | undefined, revealedPrice: number | null | undefined): number | null {
  if (!Number.isFinite(previousClose) || !Number.isFinite(revealedPrice) || Number(previousClose) <= 0) return null;
  return ((Number(revealedPrice) - Number(previousClose)) / Number(previousClose)) * 100;
}

/**
 * Pure selector for the cinematic intrusion layer.
 *
 * Priority is intentional: an actual margin breach is mandatory and cannot be
 * suppressed by the once-per-day fatigue cap; verified SEC process outranks a
 * price shock; the price shock outranks relationship/story pressure.
 */
export function selectDramaInterrupt(input: DramaInterruptInput): DramaInterrupt | null {
  const gameDate = input.gameDate || 'UNKNOWN_DATE';

  if (input.marginCallActive) {
    return {
      id: `drama:margin:${gameDate}`,
      kind: 'MARGIN_BREACH',
      gameDate,
      mandatory: true,
      characterId: CHARACTER_BY_KIND.MARGIN_BREACH,
      headline: 'MARGIN BREACH · 保证金击穿',
      body: '保证金要求已经高于当前净资产。交易席位进入生存优先级；必须先处理融资、减仓或救援方案。',
      source: 'MARGIN_STATE',
    };
  }

  if (input.dailyInterruptUsed) return null;

  const storyKind = classifyStoryDrama(input.storyEvent);
  if (storyKind === 'SEC_SUBPOENA' && input.storyEvent) {
    return {
      id: `drama:story:${input.storyEvent.id}`,
      kind: storyKind,
      gameDate,
      mandatory: false,
      characterId: CHARACTER_BY_KIND[storyKind],
      headline: input.storyEvent.headline,
      body: input.storyEvent.body,
      eventId: input.storyEvent.id,
      source: 'STORY_EVENT',
    };
  }

  const movePct = revealedMovePct(input.previousClose, input.revealedPrice);
  if (movePct !== null && movePct <= -8) {
    return {
      id: `drama:crash:${gameDate}`,
      kind: 'MARKET_CRASH',
      gameDate,
      mandatory: false,
      characterId: CHARACTER_BY_KIND.MARKET_CRASH,
      headline: `MARKET BREAK · 已揭示跌幅 ${movePct.toFixed(1)}%`,
      body: '这不是收盘后的复盘数字：当前已揭示价格已经跨过单日 -8% 危机阈值。先处理风险暴露，再讨论观点。',
      source: 'MARKET_STATE',
      movePct,
    };
  }

  if (storyKind && input.storyEvent) {
    return {
      id: `drama:story:${input.storyEvent.id}`,
      kind: storyKind,
      gameDate,
      mandatory: false,
      characterId: CHARACTER_BY_KIND[storyKind],
      headline: input.storyEvent.headline,
      body: input.storyEvent.body,
      eventId: input.storyEvent.id,
      source: 'STORY_EVENT',
    };
  }

  return null;
}

export function isDramaStoryEvent(event: DramaInterruptInput['storyEvent']): boolean {
  return classifyStoryDrama(event) !== null;
}
