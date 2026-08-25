import React from 'react';
import { resolveArtSrc, artJpgFallback, basePathFromLegacyUrl } from '../lib/assetResolver';
import { formatEmotion } from '../lib/financialLanguage';
import type { GameStateView, WarRoomHistoryEntry, WarRoomMeeting, WarRoomMessage } from '../types';
import { deriveMorningEcho } from '../engine/engines/character_echo_engine';
import { renderWithGlossary } from './GlossaryTerm';

type EmotionState = 'NEUTRAL' | 'PRESSURE' | 'CONFLICT' | 'SUCCESS' | 'LOSS';

interface Props {
  meeting: WarRoomMeeting | null;
  warRoomHistory?: WarRoomHistoryEntry[];
  isOpen: boolean;
  onClose: () => void;
  onSelectChoice?: (choiceId: string) => void;
  gameView?: GameStateView | null;
  previousGameDate?: string | null;
  /** V2 视觉：只有正在说话的人升 L2，其余保持 L1 信息行（dante P0-2）。不传=全 L1。 */
  activeSpeakerId?: string;
}

const DEFAULT_MEETING: WarRoomMeeting = {
  date: '2025-01-23',
  topic: '晨间投研晨会 / Pre-Market Briefing',
  agenda: '评估半导体估值冲击与期权波动率偏度',
  messages: [
    {
      character_id: 'maya_chen',
      character_name: 'Maya Chen',
      role: 'Tech & Semi Lead',
      portrait: '/art/characters/maya_chen.jpg',
      stance: 'BULLISH',
      message: 'DeepSeek 带来的算力效率冲击属于估值短期重构，超大规模数据中心资本支出周期并未终结。',
      evidence: '北美四大云厂商 CapEx 指引持续上调。',
    },
    {
      character_id: 'victor_hale',
      character_name: 'Victor Hale',
      role: 'Macro Risk Officer',
      portrait: '/art/characters/victor_hale.jpg',
      stance: 'CAUTIOUS',
      message: '美债 10Y 收益率高位震荡，贴现率对高估值科技股构成压制，严禁单边全仓 Long Call。',
      evidence: '2s10s 利差陡峭化进程加剧短端流动性分歧。',
    },
  ],
  player_decision_prompt: '请确立 Dante Capital 本交易日的交易方针：',
  choices: [
    {
      id: 'c_dip',
      label: '采纳 Maya Chen 观点：分批建仓深度虚值 Call 捕捉高凸性反弹',
      thesis_direction: 'BULLISH',
    },
    {
      id: 'c_hedge',
      label: '采纳 Victor Hale 建议：买入 Put 保护或构建跨式套利防范暴跌',
      thesis_direction: 'VOL_EXPANSION',
    },
  ],
};

function deriveLegacyCharacterEmotion(charId: string, view: GameStateView | null | undefined): EmotionState {
  if (!view) return 'NEUTRAL';
  const pnl = view.state.positions?.reduce((s: number, p: any) => s + (p.unrealized_pnl ?? 0), 0) ?? 0;
  const marginUsed = view.state.margin_debt ?? 0;
  const equity = view.equity ?? view.state.cash ?? 100000;
  const marginRatio = equity > 0 ? marginUsed / equity : 0;
  const lpConf = view.state.fund_stats?.lp_confidence ?? 85;
  const regHeat = view.political_state?.regulatory_heat ?? 0;

  switch (charId) {
    case 'maya_chen':
      if (pnl > 5000) return 'SUCCESS';
      if (pnl < -3000) return 'PRESSURE';
      return 'NEUTRAL';
    case 'victor_hale':
      if (marginRatio > 0.6) return 'PRESSURE';
      if (pnl < -5000) return 'LOSS';
      if (pnl > 8000) return 'SUCCESS';
      return 'NEUTRAL';
    case 'leo_park':
      if (pnl > 3000 && pnl < 8000) return 'CONFLICT';
      if (pnl > 8000) return 'SUCCESS';
      if (pnl < -2000) return 'PRESSURE';
      return 'NEUTRAL';
    case 'daniel_ross':
      if (marginRatio > 0.5) return 'PRESSURE';
      if (lpConf < 60) return 'LOSS';
      if (lpConf > 90) return 'SUCCESS';
      return 'NEUTRAL';
    case 'adrian_cross':
      if (regHeat > 70) return 'PRESSURE';
      if (regHeat > 50 && marginRatio > 0.4) return 'CONFLICT';
      if (pnl > 5000 && regHeat < 30) return 'SUCCESS';
      return 'NEUTRAL';
    default:
      return 'NEUTRAL';
  }
}

function deriveCharacterEmotion(charId: string, view: GameStateView | null | undefined): EmotionState {
  const snapshot = view?.state.character_emotions?.[charId];
  if (!snapshot) return deriveLegacyCharacterEmotion(charId, view);
  const raw = String(snapshot.emotion ?? 'CALM').toUpperCase();
  if (raw === 'CONFIDENT' || raw === 'EUPHORIC') return 'SUCCESS';
  if (raw === 'PRESSURED' || raw === 'PANIC' || raw === 'FEAR') return 'PRESSURE';
  if (raw === 'HURT') return 'LOSS';
  if (raw === 'ANGRY' || raw === 'FRUSTRATED' || raw === 'SUSPICIOUS' || raw === 'UNEASY') return 'CONFLICT';
  return 'NEUTRAL';
}

export const WarRoomModal: React.FC<Props> = ({ meeting, warRoomHistory = [], isOpen, onClose, onSelectChoice, gameView, previousGameDate, activeSpeakerId }) => {
  if (!isOpen) return null;
  const activeMeeting = meeting ?? DEFAULT_MEETING;
  const morningEcho = deriveMorningEcho((gameView?.state ?? {}) as any, activeMeeting.date, previousGameDate);

  const stanceLabels: Record<string, string> = {
    BULLISH: '多头倾向 (Bullish)',
    BEARISH: '空头防御 (Bearish)',
    CAUTIOUS: '谨慎观察 (Cautious)',
    ARBITRAGE: '做市套利/中性 (Arbitrage)',
    NEUTRAL: '宏观中性 (Neutral)',
    ATTACK: '进攻 · ATTACK',
    DEFEND: '防守 · DEFEND',
    SNIPE: '补刀 · SNIPE',
  };

  const [expandedRounds, setExpandedRounds] = React.useState(false);
  // 术语词典：整个晨会共用一个 seen，同一术语全 modal 只标注首现
  const glossarySeen = new Set<string>();
  const allMessages = activeMeeting.messages ?? [];
  const hasHiddenRounds = allMessages.some((m, idx) => (m.clash_round ?? 1) > 1 || idx >= 3);
  const visibleMessages = expandedRounds ? allMessages : allMessages.filter((m, idx) => (m.clash_round ?? 1) <= 1 && idx < 3);
  const archivedMeetings = [...warRoomHistory].reverse();

  const renderMessageCards = (messages: WarRoomMessage[], keyPrefix: string, interactiveGlossary: boolean): React.ReactNode => (
    <div className="war-room-messages">
      {messages.map((m, idx) => {
        const emotion = deriveCharacterEmotion(m.character_id, gameView);
        const emotionLower = (emotion ?? 'NEUTRAL').toLowerCase();
        const stanceLower = (m.stance ?? 'NEUTRAL').toLowerCase();
        const portrait = resolveArtSrc(basePathFromLegacyUrl(m.portrait));
        const fallbackPortrait = artJpgFallback(basePathFromLegacyUrl(m.portrait));
        return (
          <div key={`${keyPrefix}-${idx}`} className={`war-room-card ot-role-card${activeSpeakerId === m.character_id ? ' is-speaking' : ''}`}>
            <div className="war-room-card-header">
              <div className="war-room-avatar-wrap">
                <span className="portrait-initial-fallback" aria-hidden="true">
                  {m.character_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                {interactiveGlossary ? (
                  <img
                    src={portrait}
                    alt={m.character_name}
                    decoding="async"
                    className={`war-room-avatar ot-avatar wrm-avatar-${emotionLower}`}
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.src.endsWith(fallbackPortrait)) {
                        img.style.display = 'none';
                        return;
                      }
                      img.src = fallbackPortrait;
                    }}
                  />
                ) : (
                  <img
                    src={portrait}
                    alt={m.character_name}
                    decoding="async"
                    className={`war-room-avatar ot-avatar wrm-avatar-${emotionLower}`}
                    loading="lazy"
                  />
                )}
                {emotion !== 'NEUTRAL' && (
                  <span className={`wrm-emotion-badge wrm-emotion-${emotionLower}`}>
                    {formatEmotion(emotion)}
                  </span>
                )}
              </div>
              <div className="war-room-speaker-meta">
                <div className="speaker-name ot-role-name">{m.character_name}</div>
                <div className="speaker-role ot-role-title">{m.role}</div>
              </div>
              {m.stance && !['ATTACK', 'DEFEND', 'SNIPE'].includes(m.stance) && (
                <div className={`ot-badge stance-badge wrm-stance-${stanceLower}`}>
                  {stanceLabels[m.stance] || m.stance}
                </div>
              )}
            </div>

            <div className="war-room-card-text ot-role-quote">
              "{interactiveGlossary ? renderWithGlossary(m.message, glossarySeen) : m.message}"
            </div>
            {!m.clash_round && (
              <div className="war-room-evidence">
                <span className="evidence-label">📊 支撑论据：</span>{' '}
                {interactiveGlossary ? renderWithGlossary(m.evidence ?? '', glossarySeen) : (m.evidence ?? '')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="modal-overlay ui-enforced war-room-area" onClick={onClose}>
      <div className="modal-content war-room-modal ui-enforced ot-card ot-panel-tech ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header war-room-header ot-section-header ui-modal-header">
          <div>
            <div className="ot-badge ot-badge-simulated">
              盘前投研晨会 <span className="en-secondary">FUND WAR ROOM</span>
            </div>
            <h2 className="war-room-title ot-section-title ui-title" data-level="1">{renderWithGlossary(activeMeeting.topic, glossarySeen)}</h2>
            <div className="war-room-agenda">议程：{renderWithGlossary(activeMeeting.agenda, glossarySeen)}</div>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="war-room-body modal-body ui-modal-body">
          {morningEcho && (
            <div className={`war-room-morning-echo echo-${morningEcho.slot.toLowerCase()}`} data-testid="war-room-morning-echo">
              <div className="morning-echo-kicker">YESTERDAY REMEMBERS · 昨日回响</div>
              <div className="morning-echo-meta">
                <strong>{morningEcho.characterName}</strong>
                <span>{morningEcho.previousDate}</span>
                <span className={morningEcho.pnlUsd >= 0 ? 'echo-pnl-positive' : 'echo-pnl-negative'}>
                  昨日 NAV {morningEcho.pnlUsd >= 0 ? '+' : ''}{morningEcho.pnlUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {' '}({morningEcho.pnlPct >= 0 ? '+' : ''}{morningEcho.pnlPct.toFixed(2)}%)
                </span>
              </div>
              <blockquote>“{morningEcho.line}”</blockquote>
              <div className="morning-echo-footnote">
                来源：昨日 War Room 站队 + 已结算 NAV；人物热度读取 trust / grudge / memories，仅影响呈现，不改数值。
              </div>
            </div>
          )}
          {renderMessageCards(visibleMessages, 'current', true)}

          {!expandedRounds && hasHiddenRounds && (
            <div className="war-room-expand-action">
              <button
                type="button"
                className="btn-expand-rounds ot-btn ot-btn-secondary ui-btn"
                data-variant="row"
                onClick={() => setExpandedRounds(true)}
                data-testid="expand-war-room-rounds"
              >
                展开第二轮交锋 ▾ ({allMessages.length - visibleMessages.length} 条后续深度对白)
              </button>
            </div>
          )}

          {archivedMeetings.length > 0 && (
            <details className="war-room-history-archive ui-surface ui-l1" data-testid="war-room-history">
              <summary className="war-room-history-summary">
                跨日会议档案 · {archivedMeetings.length} 次 <span className="en-secondary">READ-ONLY ARCHIVE</span>
              </summary>
              <div className="war-room-history-list">
                {archivedMeetings.map((entry, index) => (
                  <article key={`${entry.date}-${index}`} className="war-room-history-entry">
                    <div className="war-room-history-entry-head">
                      <time dateTime={entry.date}>{entry.date}</time>
                      <strong>{entry.topic}</strong>
                    </div>
                    <div className="war-room-history-agenda">议程：{entry.agenda}</div>
                    <div className="war-room-history-choice">
                      玩家选择：{entry.choice_label ?? entry.choice_id ?? '未作出选择'}
                    </div>
                    {renderMessageCards(entry.messages ?? [], `history-${entry.date}-${index}`, false)}
                  </article>
                ))}
              </div>
            </details>
          )}

          <div className="war-room-decision-box ot-panel">
            <div className="decision-prompt">
              🎯 <strong>PM 决策方针</strong>: {activeMeeting.player_decision_prompt}
            </div>
            <div className="war-room-choices">
              {activeMeeting.choices.map((c) => (
                <button
                  key={c.id}
                  className="btn-choice-warroom ot-btn ot-btn-secondary ui-btn"
                  data-variant="row"
                  disabled={c.disabled}
                  onClick={() => {
                    if (c.disabled) return;
                    if (onSelectChoice) onSelectChoice(c.id);
                    onClose();
                  }}
                >
                  <span className="war-room-choice-main">{c.label}{c.selected ? ' ✓ recorded' : ''}</span>
                  {c.outcome && <small className="war-room-choice-consequence">{c.outcome.visible_consequence}</small>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer ui-modal-footer">
          <button className="ot-btn ui-btn ui-btn-primary" onClick={onClose}>
            返回总部 · 稍后决定 (Return to HQ)
          </button>
        </div>
      </div>
    </div>
  );
};
