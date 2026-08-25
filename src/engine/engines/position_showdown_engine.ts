import type { MarketRevealState, Position, TimelineEvent } from '../schemas';

export type ShowdownDirection = 'BULLISH' | 'BEARISH';
export type ShowdownSituation = 'BULLISH_UNDER_PRESSURE' | 'BEARISH_IN_PROFIT';
export type ShowdownAction = 'STOP_OUT' | 'HEDGE' | 'ADD' | 'HOLD';
export type ShowdownClaim = 'STOP' | 'HEDGE' | 'ADD';

export interface ShowdownProposal {
  action: Exclude<ShowdownAction, 'HOLD'>;
  claim: ShowdownClaim;
  characterId: 'victor_hale' | 'leo_park' | 'maya_chen';
  label: string;
  sublabel?: string;
  execution: 'IMMEDIATE_CLOSE' | 'PREFILL_ORDER';
}

export interface PositionShowdown {
  id: string;
  gameDate: string;
  ticker: string;
  positionId: string;
  positionType: 'call' | 'put';
  strike: number;
  expiration: string;
  qty: number;
  short: boolean;
  direction: ShowdownDirection;
  situation: ShowdownSituation;
  sessionHigh: number;
  currentPrice: number;
  drawdownPct: number;
  thresholdPct: number;
  proposals: ShowdownProposal[];
}

export interface PositionShowdownInput {
  gameDate: string;
  marketReveal?: Pick<MarketRevealState, 'ticker' | 'current_window_index' | 'windows'> | null;
  positions?: Array<Pick<Position, 'id' | 'kind' | 'underlying' | 'type' | 'strike' | 'expiration' | 'qty' | 'short'>>;
  playerDecisions?: Array<Pick<TimelineEvent, 'category' | 'game_date' | 'position_id'>>;
  /** Positive percentage magnitude. `4` means trigger at -4% from revealed session high. */
  thresholdPct?: number;
}

function normaliseOptionType(type: Position['type']): 'call' | 'put' | null {
  const value = String(type ?? '').toLowerCase();
  return value === 'call' || value === 'put' ? value : null;
}

export function directionalExposure(position: Pick<Position, 'type' | 'short'>): ShowdownDirection | null {
  const type = normaliseOptionType(position.type);
  if (!type) return null;
  const short = Boolean(position.short);
  if (type === 'call') return short ? 'BEARISH' : 'BULLISH';
  return short ? 'BULLISH' : 'BEARISH';
}

export function revealedSessionDrawdown(
  reveal: Pick<MarketRevealState, 'current_window_index' | 'windows'> | null | undefined,
): { sessionHigh: number; currentPrice: number; drawdownPct: number } | null {
  if (!reveal || reveal.current_window_index < 0) return null;

  // Each reveal window may carry the cumulative visible tape. Flattening is safe:
  // bars that have not been revealed do not exist in this state at all.
  const bars = reveal.windows
    .flatMap((window) => window.visible_price_bars ?? [])
    .filter((bar) => Number.isFinite(bar.close) && Number.isFinite(bar.high));
  if (bars.length < 2) return null;

  const sessionHigh = Math.max(...bars.map((bar) => Math.max(Number(bar.high), Number(bar.close))));
  const currentPrice = Number(bars[bars.length - 1].close);
  if (!(sessionHigh > 0) || !Number.isFinite(currentPrice)) return null;
  const drawdownPct = ((currentPrice - sessionHigh) / sessionHigh) * 100;
  return { sessionHigh, currentPrice, drawdownPct };
}

function alreadyHandled(
  decisions: PositionShowdownInput['playerDecisions'],
  gameDate: string,
  positionId: string,
): boolean {
  return (decisions ?? []).some(
    (decision) =>
      decision.category === 'INTRADAY_SHOWDOWN' &&
      decision.game_date === gameDate &&
      decision.position_id === positionId,
  );
}

function proposalsFor(direction: ShowdownDirection): ShowdownProposal[] {
  return [
    {
      action: 'STOP_OUT',
      claim: 'STOP',
      characterId: 'victor_hale',
      label: '市价清仓 · 严格止损',
      sublabel: '消除敞口 · 释放维持保证金',
      execution: 'IMMEDIATE_CLOSE',
    },
    {
      action: 'HEDGE',
      claim: 'HEDGE',
      characterId: 'leo_park',
      label: direction === 'BULLISH' ? '买入 Put · 锁住下行' : '买入 Call · 封顶反弹',
      sublabel: '建立领式对冲 · 限制最大亏损',
      execution: 'PREFILL_ORDER',
    },
    {
      action: 'ADD',
      claim: 'ADD',
      characterId: direction === 'BULLISH' ? 'maya_chen' : 'leo_park',
      label: direction === 'BULLISH' ? '逢低加仓 · 摊薄成本' : '顺势加空 · 扩大战果',
      sublabel: '维持进攻敞口 · 追求超额 Alpha',
      execution: 'PREFILL_ORDER',
    },
  ];
}

/**
 * Pure selector for the intraday position showdown.
 *
 * No daily close, future node, or unrevealed bar is accepted by this function.
 * The only market input is the tape already materialised in `visible_price_bars`.
 * Persistence for the once-per-position/day gate reuses `player_decisions`.
 */
export function selectPositionShowdown(input: PositionShowdownInput): PositionShowdown | null {
  const gameDate = input.gameDate
    || (input.marketReveal?.windows.length
      ? input.marketReveal.windows[input.marketReveal.windows.length - 1]?.session_date
      : undefined)
    || '';
  if (!gameDate || !input.marketReveal) return null;

  const drawdown = revealedSessionDrawdown(input.marketReveal);
  if (!drawdown) return null;

  const thresholdPct = Math.max(0.1, Math.abs(input.thresholdPct ?? 4));
  if (drawdown.drawdownPct > -thresholdPct) return null;

  const ticker = String(input.marketReveal.ticker ?? '').toUpperCase();
  const positions = (input.positions ?? []).filter((position) => {
    if (!(Number(position.qty) > 0)) return false;
    if (!normaliseOptionType(position.type) || position.strike == null || !position.expiration) return false;
    const underlying = String(position.underlying ?? ticker).toUpperCase();
    return !ticker || underlying === ticker;
  });

  for (const position of positions) {
    if (alreadyHandled(input.playerDecisions, gameDate, position.id)) continue;
    const direction = directionalExposure(position);
    const positionType = normaliseOptionType(position.type);
    if (!direction || !positionType || position.strike == null || !position.expiration) continue;
    const short = Boolean(position.short);
    return {
      id: `showdown:${gameDate}:${position.id}`,
      gameDate,
      ticker: ticker || String(position.underlying ?? '').toUpperCase(),
      positionId: position.id,
      positionType,
      strike: Number(position.strike),
      expiration: position.expiration,
      qty: Number(position.qty),
      short,
      direction,
      situation: direction === 'BULLISH' ? 'BULLISH_UNDER_PRESSURE' : 'BEARISH_IN_PROFIT',
      sessionHigh: drawdown.sessionHigh,
      currentPrice: drawdown.currentPrice,
      drawdownPct: drawdown.drawdownPct,
      thresholdPct,
      proposals: proposalsFor(direction),
    };
  }

  return null;
}
