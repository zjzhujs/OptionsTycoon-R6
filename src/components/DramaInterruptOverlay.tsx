import React, { useEffect } from 'react';
import breakingLines from '../engine/data/breaking_lines.json';
import { audioManager } from '../lib/audio';
import showdownLines from '../engine/data/showdown_lines.json';
import type { Character, StoryEventPublic } from '../types';
import type { DramaInterrupt } from '../engine/engines/drama_interrupt_engine';
import type { PositionShowdown, ShowdownAction, ShowdownClaim } from '../engine/engines/position_showdown_engine';
import { renderWithGlossary } from './GlossaryTerm';

export interface DramaInterruptOverlayProps {
  interrupt: DramaInterrupt | null;
  showdown?: PositionShowdown | null;
  storyEvent?: StoryEventPublic | null;
  characters: Character[];
  isOpen: boolean;
  onStoryChoice: (eventId: string, choiceId: string) => void;
  onDefer: () => void;
  onOpenTradeFloor: () => void;
  onHandleMargin: () => void;
  onShowdownChoice?: (action: ShowdownAction) => void;
}

const FALLBACK_NAMES: Record<string, { name: string; role: string }> = {
  maya_chen: { name: 'Maya Chen', role: 'Research' },
  victor_hale: { name: 'Victor Hale', role: 'Head of Risk' },
  leo_park: { name: 'Leo Park', role: 'Options / Market Structure' },
  daniel_ross: { name: 'Daniel Ross', role: 'Prime Broker / Financing' },
  marcus_reed: { name: 'Marcus Reed', role: 'Compliance / Enforcement' },
  evelyn_shaw: { name: 'Evelyn Shaw', role: 'Media / Narrative' },
  adrian_cross: { name: 'Adrian Cross', role: 'Rival Fund CIO' },
};

function portraitFor(characterId: string, characters: Character[]): { src: string; name: string; role: string } {
  const found = characters.find((c) => c.id === characterId);
  const fallback = FALLBACK_NAMES[characterId] ?? { name: characterId, role: 'Desk' };
  return {
    src: found?.portrait || found?.avatar || `/art/characters/${characterId}.jpg`,
    name: found?.name || fallback.name,
    role: found?.role || fallback.role,
  };
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

const KICKER_BY_KIND: Record<DramaInterrupt['kind'], string> = {
  MARGIN_BREACH: 'CAPITAL EMERGENCY',
  SEC_SUBPOENA: 'REGULATORY BREAKING NEWS',
  MARKET_CRASH: 'MARKET BREAKING NEWS',
  LP_REDEMPTION: 'CAPITAL FLIGHT ALERT',
  SHORT_ATTACK: 'HOSTILE MARKET ACTION',
};

function showdownLine(showdown: PositionShowdown, characterId: string, claim: ShowdownClaim): string {
  const exact = (showdownLines as Array<{ situation: string; character_id: string; claim: string; line: string }>).find(
    (entry) => entry.situation === showdown.situation && entry.character_id === characterId && entry.claim === claim,
  );
  if (exact) return exact.line;
  return '现在不是争论观点的时候。把你愿意承担的风险写成一个能执行的动作。';
}

export const DramaInterruptOverlay: React.FC<DramaInterruptOverlayProps> = ({
  interrupt,
  showdown,
  storyEvent,
  characters,
  isOpen,
  onStoryChoice,
  onDefer,
  onOpenTradeFloor,
  onHandleMargin,
  onShowdownChoice,
}) => {
  // batch5 声场：破门/对决瞬间三层音(低频重击/电话震动/新闻线+交易台喧闹),事件范围触发。
  useEffect(() => {
    if (!isOpen || (!interrupt && !showdown)) return;
    audioManager.duckMusic();
    audioManager.playSfx('sfx_low_hit', 0.7);
    audioManager.playSfx('sfx_phone_vibration', 0.6);
    const kind = interrupt?.kind;
    const t1 = window.setTimeout(() => {
      if (kind === 'MARKET_CRASH' || kind === 'SHORT_ATTACK' || showdown) {
        audioManager.playSfx('sfx_printer', 0.5);
      }
      audioManager.playSfx('amb_desk_activity', 0.35);
    }, 450);
    return () => window.clearTimeout(t1);
  }, [isOpen, interrupt, showdown]);

  useEffect(() => {
    if (!isOpen || !interrupt || interrupt.mandatory || showdown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDefer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [interrupt, isOpen, onDefer, showdown]);

  if (!isOpen || (!interrupt && !showdown)) return null;

  if (showdown) {
    return (
      <div
        className="drama-interrupt-overlay drama-kind-position-showdown ui-enforced"
        data-testid="position-showdown-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="盘中持仓桌面对决"
      >
        <div className="drama-black-beat" aria-hidden />
        <div className="drama-breaking-strip showdown-strip" aria-hidden>
          <span>DESK SHOWDOWN</span><span>RISK DECISION</span><span>DESK SHOWDOWN</span>
        </div>

        <div className="drama-stage drama-showdown-stage ui-modal ui-surface ui-l3">
          <section className="showdown-tape-panel">
            <div className="drama-kicker">INTRADAY POSITION SHOWDOWN</div>
            <h2 className="ui-title" data-level="1">{showdown.ticker} · 高点回撤 {showdown.drawdownPct.toFixed(1)}%</h2>
            <p>
              已揭示盘中高点 <strong>{showdown.sessionHigh.toFixed(2)}</strong> → 当前已揭示价{' '}
              <strong>{showdown.currentPrice.toFixed(2)}</strong>。阈值 {-showdown.thresholdPct}% 已触发。
            </p>
            <div className="showdown-position-chip">
              {showdown.short ? 'SHORT' : 'LONG'} {showdown.positionType.toUpperCase()} {showdown.strike} · {showdown.expiration} · {showdown.qty}x
            </div>
            <div className="showdown-truth-note">
              DATA GATE · 只读取 visible_price_bars；未揭示价格与当日收盘不参与判定。
            </div>
          </section>

          <section className="drama-copy-panel showdown-copy-panel">
            <div className="drama-kicker">THREE DESKS · ONE POSITION</div>
            <h2 className="ui-title" data-level="1">现在，谁来接管这笔风险？</h2>
            <div className="showdown-claims">
              {showdown.proposals.map((proposal) => {
                const speaker = portraitFor(proposal.characterId, characters);
                return (
                  <article className={`showdown-claim showdown-claim-${proposal.claim.toLowerCase()}`} key={proposal.claim}>
                    <span className="portrait-initial-fallback showdown-claim-fallback" aria-hidden="true">{initials(speaker.name)}</span>
                    <img
                      src={speaker.src}
                      alt=""
                      className="showdown-claim-portrait"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                    <div className="showdown-claim-copy">
                      <div className="showdown-claim-meta">
                        <strong>{speaker.name}</strong>
                        <span>{proposal.claim}</span>
                      </div>
                      <p>“{showdownLine(showdown, proposal.characterId, proposal.claim)}”</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="drama-actions showdown-actions">
              {showdown.proposals.map((proposal) => (
                <button
                  key={proposal.action}
                  type="button"
                  className="ot-btn drama-choice showdown-two-line-btn ui-btn"
                  data-variant="row"
                  onClick={() => onShowdownChoice?.(proposal.action)}
                >
                  <span className="showdown-btn-main">{proposal.label}</span>
                  {proposal.sublabel && <small className="showdown-btn-sub">{proposal.sublabel}</small>}
                </button>
              ))}
              <button
                type="button"
                className="ot-btn drama-choice showdown-hold showdown-two-line-btn ui-btn"
                data-variant="row"
                onClick={() => onShowdownChoice?.('HOLD')}
              >
                <span className="showdown-btn-main">维持不动 · 观察盘面</span>
                <small className="showdown-btn-sub">承受波动 · 坚持既定策略</small>
              </button>
            </div>
            <div className="drama-mandatory-note">MANDATORY DECISION · 本次对决必须选择一个动作</div>
          </section>
        </div>
      </div>
    );
  }

  if (!interrupt) return null;
  const character = portraitFor(interrupt.characterId, characters);
  const choices = storyEvent?.choices ?? [];

  return (
    <div
      className={`drama-interrupt-overlay drama-kind-${interrupt.kind.toLowerCase()} ui-enforced`}
      data-testid="drama-interrupt-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={interrupt.headline}
    >
      <div className="drama-black-beat" aria-hidden />
      <div className="drama-breaking-strip" aria-hidden>
        <span>BREAKING NEWS</span><span>BREAKING NEWS</span><span>BREAKING NEWS</span>
      </div>

      <div className="drama-stage ui-modal ui-surface ui-l3">
        <div className="drama-portrait-stage">
          <span className="portrait-initial-fallback drama-portrait-fallback" aria-hidden="true">{initials(character.name)}</span>
          <img
            className="drama-portrait"
            src={character.src}
            alt={character.name}
            decoding="async"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
          <div className="drama-character-scrim" />
          <div className="drama-character-id">
            <strong>{character.name}</strong>
            <span>{character.role}</span>
          </div>
        </div>

        <section className="drama-copy-panel">
          <div className="drama-kicker">{KICKER_BY_KIND[interrupt.kind]}</div>
          <h2 className="ui-title" data-level="1">{interrupt.headline}</h2>
          <p className="drama-body">{renderWithGlossary(interrupt.body)}</p>
          <blockquote className="drama-hit-line">
            {(() => {
              /* batch3 接线：AVG 破门台词库(15条)按 kind 选池，headline 哈希做确定性取行 */
              const kindToType: Record<string, string> = {
                MARGIN_BREACH: 'MARGIN_CALL_BREACH',
                MARKET_CRASH: 'MARKET_FLASH_CRASH_8PCT',
                SEC_SUBPOENA: 'SEC_SUBPOENA',
                LP_REDEMPTION: 'LP_REDEMPTION_WARNING',
                SHORT_ATTACK: 'RIVAL_SHORT_ATTACK',
              };
              const pool = (breakingLines as Array<{ event_type: string; line: string }>).filter(
                (l) => l.event_type === kindToType[interrupt.kind],
              );
              if (!pool.length) return '“这件事已经进到你的桌面。现在你必须决定怎么回应。”';
              let hash = 0;
              const seed = interrupt.headline ?? interrupt.kind;
              for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
              return `“${pool[hash % pool.length].line}”`;
            })()}
          </blockquote>

          <div className="drama-actions">
            {choices.length > 0 ? choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="ot-btn drama-choice ui-btn"
                data-variant="row"
                onClick={() => interrupt.eventId && onStoryChoice(interrupt.eventId, choice.id)}
              >
                {choice.label}
              </button>
            )) : interrupt.kind === 'MARGIN_BREACH' ? (
              <button type="button" className="ot-btn drama-choice ui-btn ui-btn-primary" data-variant="row" onClick={onHandleMargin}>
                立即处理保证金 · OPEN SURVIVAL DESK
              </button>
            ) : (
              <button type="button" className="ot-btn drama-choice ui-btn ui-btn-primary" data-variant="row" onClick={onOpenTradeFloor}>
                立即进入交易席位 / 对冲
              </button>
            )}

            {!interrupt.mandatory && (
              <button type="button" className="ot-btn ot-btn-ghost drama-defer ui-btn" data-variant="row" onClick={onDefer}>
                ESC · 稍后处理
              </button>
            )}
          </div>
          {interrupt.mandatory && <div className="drama-mandatory-note">MANDATORY · 保证金事件不可跳过</div>}
        </section>
      </div>
    </div>
  );
};
