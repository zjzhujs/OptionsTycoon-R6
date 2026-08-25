import type {
  CharacterIncentiveSnapshot,
  GameState,
  GameStateView,
  MarketDecisionBeatKind,
  MarketDecisionWindow,
  MarketWindowCharacterBeat,
  MarketWindowConsequenceSnapshot,
} from '../schemas';
import * as reflexivity from './reflexivity_engine';
import * as relationshipStages from './relationship_stage_engine';
import { renderMarketWindowVoice } from './character_voice_engine';

const CHARACTER_META: Record<string, { name: string; role: string }> = {
  maya_chen: { name: 'Maya Chen', role: 'AI / 半导体研究' },
  victor_hale: { name: 'Victor Hale', role: '组合风险' },
  leo_park: { name: 'Leo Park', role: '期权 / 市场结构' },
  daniel_ross: { name: 'Daniel Ross', role: 'Prime Broker / 融资' },
};

const PRESSURE_SCORE: Record<CharacterIncentiveSnapshot['pressure_level'], number> = {
  LOW: 0,
  ELEVATED: 18,
  HIGH: 38,
  CRITICAL: 62,
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function shortQuote(value: string | null | undefined, max = 110): string | null {
  const text = clean(value).replace(/\s+/g, ' ');
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function previousDecision(state: GameState, window: MarketDecisionWindow): MarketDecisionWindow | null {
  return [...(state.market_window_history ?? [])]
    .filter((item) => item.session_date === window.session_date && item.sequence < window.sequence)
    .sort((a, b) => b.sequence - a.sequence)[0] ?? null;
}

function beatFor(window: MarketDecisionWindow): { kind: MarketDecisionBeatKind; question: string; prompt: string } {
  if (window.session_date === '2025-01-27') {
    switch (window.reveal_time_label) {
      case '08:00':
      case '08:00 ET':
        return {
          kind: 'THESIS_HIT',
          question: 'DeepSeek 这条新闻，到底是粉碎了你的逻辑底座，还是仅仅搞垮了市场情绪？',
          prompt: '别被标题带着跑。剥离价格恐慌，看清你的因果链哪一节断了。',
        };
      case '10:30 ET':
        return {
          kind: 'PRICE_DISCOVERY',
          question: '这是纯粹的价格重估，还是你的逻辑已经被全盘否定？',
          prompt: '这是开盘后的第一轮厮杀。别急着找借口，盯着真实的成交价看它在说什么。',
        };
      case '11:30 ET':
        return {
          kind: 'RATIONALIZATION_TEST',
          question: '你是在冷静等待反转，还是在亏损面前悄悄修改了你的底线？',
          prompt: '看看你一个小时前写下的判定标准。你现在是在执行它，还是在背叛它？',
        };
      case '14:30 ET':
        return {
          kind: 'POSITION_VS_THESIS',
          question: '就算你的故事还没死透，你这把期权还能活到那一天吗？',
          prompt: '观点是对的，不代表你那堆高 IV、短到期的废纸不会归零。现在审视的是仓位生死。',
        };
      case '15:30 ET':
        return {
          kind: 'OVERNIGHT_GATE',
          question: '最后 30 分钟的盲盒。你敢扛着这堆敞口过夜吗？',
          prompt: '没人知道明天开盘是什么鬼样子。决定你能承受多大回撤，而不是赌最后半小时的奇迹。',
        };
      default:
        break;
    }
  }
  if (window.session_date === '2025-01-31') {
    switch (window.reveal_time_label) {
      case '10:30 ET':
        return {
          kind: 'RELIEF_RALLY',
          question: '这根阳线是在修复核心逻辑，还是仅仅给了你一个逃命的价格？',
          prompt: '别看见涨了就把脑子扔了。去看看是增量信息在驱动，还是纯粹的跌深反弹。',
        };
      case '11:30 ET':
        return {
          kind: 'FOLLOW_THROUGH_TEST',
          question: '第二波拉升出现了。你是因为拿到了铁证而加码，还是因为踏空的恐惧在追高？',
          prompt: '多头也能让人丧失理智。把“害怕错过”的 FOMO 情绪和真实的催化剂分开。',
        };
      case '13:30 ET':
        return {
          kind: 'REVERSAL_SIGNAL',
          question: '早上的涨幅正在被吞噬。你要等到净值爆仓才肯承认风向变了吗？',
          prompt: '市场已经在用真金白银撤退。抛弃你的幻想，面对正在变软的盘面。',
        };
      case '15:30 ET':
        return {
          kind: 'WEEKEND_GATE',
          question: '接下来是 48 小时的黑洞。你手里这些筹码，值得你拿周末去赌吗？',
          prompt: '早上的狂欢已经散场。你现在只剩最后半小时来决定你要带什么进周末的休市期。',
        };
      default:
        break;
    }
  }
  return {
    kind: 'GENERIC',
    question: '这根 K 线砸下来，你的护城河还在吗？',
    prompt: '按事实说话，别靠幻觉扛单。确认底线还在不在，然后动或者不动。',
  };
}

function rolePrior(window: MarketDecisionWindow, characterId: string): number {
  const time = window.reveal_time_label ?? '';
  if (window.session_date === '2025-01-31') {
    if (time === '10:30 ET') return characterId === 'leo_park' ? 14 : characterId === 'victor_hale' ? 8 : 0;
    if (time === '11:30 ET') return characterId === 'maya_chen' ? 40 : characterId === 'leo_park' ? 36 : characterId === 'victor_hale' ? 20 : 0;
    if (time === '13:30 ET') return characterId === 'victor_hale' ? 42 : characterId === 'maya_chen' ? 34 : characterId === 'leo_park' ? 26 : 0;
    if (time === '15:30 ET') return characterId === 'victor_hale' ? 44 : characterId === 'leo_park' ? 38 : characterId === 'daniel_ross' ? 30 : 0;
  }
  if (window.stage === 'PREMARKET') {
    return characterId === 'maya_chen' ? 46 : characterId === 'victor_hale' ? 30 : 0;
  }
  if (time === '11:30 ET') {
    return characterId === 'victor_hale' ? 40 : characterId === 'maya_chen' ? 34 : 0;
  }
  if (time === '14:30 ET') {
    return characterId === 'leo_park' ? 42 : characterId === 'victor_hale' ? 34 : characterId === 'daniel_ross' ? 24 : 0;
  }
  if (time === '15:30 ET') {
    return characterId === 'victor_hale' ? 40 : characterId === 'leo_park' ? 34 : characterId === 'daniel_ross' ? 30 : 0;
  }
  if (time === '10:30 ET') {
    return characterId === 'victor_hale' ? 8 : characterId === 'daniel_ross' ? 5 : 0;
  }
  return 0;
}

function relationshipScore(state: GameState, characterId: string): number {
  const disclosure = relationshipStages.disclosure_level(state, characterId);
  if (disclosure === 'FULL') return 8;
  if (disclosure === 'MINIMUM') return -8;
  if (disclosure === 'FORMAL_ONLY') return -14;
  return 0;
}

function candidatesFor(window: MarketDecisionWindow): string[] {
  const time = window.reveal_time_label ?? '';
  if (window.session_date === '2025-01-31') {
    if (time === '10:30 ET') return ['leo_park', 'victor_hale'];
    if (time === '11:30 ET') return ['maya_chen', 'leo_park', 'victor_hale'];
    if (time === '13:30 ET') return ['victor_hale', 'maya_chen', 'leo_park'];
    if (time === '15:30 ET') return ['victor_hale', 'leo_park', 'daniel_ross'];
    return [];
  }
  if (window.stage === 'PREMARKET') return ['maya_chen', 'victor_hale'];
  if (time === '10:30 ET') return ['victor_hale', 'daniel_ross'];
  if (time === '11:30 ET') return ['victor_hale', 'maya_chen'];
  if (time === '14:30 ET') return ['leo_park', 'victor_hale', 'daniel_ross'];
  if (time === '15:30 ET') return ['victor_hale', 'leo_park', 'daniel_ross'];
  return [];
}

function characterLine(state: GameState, characterId: string, window: MarketDecisionWindow, previous: MarketDecisionWindow | null, pressure?: string | null): string {
  return renderMarketWindowVoice(state, characterId, window, previous, pressure);
}

function selectCharacterBeat(state: GameState, window: MarketDecisionWindow): MarketWindowCharacterBeat | null {
  const candidates = candidatesFor(window);
  if (!candidates.length) return null;

  const ranked = candidates.map((characterId) => {
    const incentive = reflexivity.incentive_snapshot_for(state, characterId);
    return {
      characterId,
      incentive,
      score: rolePrior(window, characterId) + PRESSURE_SCORE[incentive.pressure_level] + relationshipScore(state, characterId),
    };
  }).sort((a, b) => b.score - a.score || a.characterId.localeCompare(b.characterId));

  const top = ranked[0];
  // The first real price reveal on Golden Days is intentionally allowed to breathe. Only a
  // truly critical institutional constraint earns the right to interrupt it.
  if ((window.reveal_time_label ?? '') === '10:30 ET' && top.incentive.pressure_level !== 'CRITICAL') return null;

  const meta = CHARACTER_META[top.characterId];
  if (!meta) return null;
  const stage = relationshipStages.stage_for(state, top.characterId)?.stage ?? null;
  return {
    character_id: top.characterId,
    character_name: meta.name,
    role: meta.role,
    pressure_level: top.incentive.pressure_level,
    why_now: top.incentive.agenda,
    line: characterLine(state, top.characterId, window, previousDecision(state, window), top.incentive.pressure_level),
    relationship_stage: stage,
  };
}

function consequenceSnapshot(state: GameState, view: GameStateView, window: MarketDecisionWindow): MarketWindowConsequenceSnapshot {
  const openPositions = (state.positions ?? []).filter((position) => Number(position.qty ?? 0) !== 0);
  const ticker = window.price_ticker ?? state.active_ticker ?? null;
  const tickerPositions = ticker ? openPositions.filter((position) => position.underlying === ticker) : [];
  const tickerIds = new Set(tickerPositions.map((position) => position.id));
  const optionPnl = (view.position_marks ?? [])
    .filter((mark) => tickerIds.has(mark.position_id))
    .reduce((sum, mark) => sum + Number(mark.pl ?? 0), 0);
  // Shares live on GameState rather than inside positions[]. In the R1 Golden
  // Day they are NVDA shares, so include them in the same compact consequence
  // readout without inventing a second portfolio model.
  const shareQty = Number(state.shares ?? 0);
  const sharePnl = ticker && shareQty !== 0 && window.price_snapshot
    ? (Number(window.price_snapshot.latest_price) - Number(state.share_cost_basis ?? 0)) * shareQty
    : 0;
  const sharePositionCount = ticker && shareQty !== 0 ? 1 : 0;
  return {
    portfolio_unrealized_pnl: Number(view.unrealized_pnl ?? 0),
    ticker_unrealized_pnl: optionPnl + sharePnl,
    open_positions: openPositions.length + sharePositionCount,
    ticker_positions: tickerPositions.length + sharePositionCount,
    cash: Number(state.cash ?? 0),
    margin_debt: Number(state.margin_debt ?? 0),
    lp_confidence: Number(state.fund_stats?.lp_confidence ?? 0),
  };
}

/**
 * Attach the V22 scene-direction layer only when a window is actually reached.
 * This must never be called while future windows are merely preloaded: it reads
 * current state and prior recorded decisions only, so no future result can leak.
 */
export function directReachedWindow(state: GameState, view: GameStateView, window: MarketDecisionWindow): MarketDecisionWindow {
  const beat = beatFor(window);
  const previous = previousDecision(state, window);
  window.dramatic_beat = beat.kind;
  window.dramatic_question = beat.question;
  window.decision_prompt = beat.prompt;
  window.previous_decision_quote = previous?.player_reason ? shortQuote(previous.player_reason) : null;
  window.character_beat = selectCharacterBeat(state, window);
  window.consequence_snapshot = consequenceSnapshot(state, view, window);
  window.future_lock_note = (window.reveal_time_label ?? '') === '15:30 ET'
    ? window.session_date === '2025-01-31'
      ? '15:30–16:00 ET 最后 30 分钟仍是 FUTURE LOCKED；周末 Gate 不能读取或暗示最终收盘。'
      : '15:30–16:00 ET 最后 30 分钟仍是 FUTURE LOCKED；本窗口不能读取或暗示最终收盘。'
    : window.truth_mode === 'REAL_INTRADAY'
      ? '后续真实 bars 保持 FUTURE LOCKED，直到玩家主动让市场继续。'
      : '当前只揭晓已核验事件；价格路径保持未知。';
  return window;
}
