import React, { useEffect, useMemo, useRef } from 'react';
import type { Character, IntelClass, StoryEventPublic } from '../types';
import { renderWithGlossary } from './GlossaryTerm';
import { onArtImgError, resolveArtSrc } from '../lib/assetResolver';
import { useTypewriterSequence } from '../hooks/useTypewriterSequence';

export interface StoryDialogueModalProps {
  event: StoryEventPublic | null;
  characters: Character[];
  queueLength?: number;
  queueIndex?: number;
  isOpen: boolean;
  onChoice: (eventId: string, choiceId: string) => void;
  onDefer?: (eventId: string) => void;
  onClose?: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

const INTEL_BADGES: Record<IntelClass, { label: string; cls: string }> = {
  PUBLIC_VERIFIED: { label: '公开核实 · VERIFIED', cls: 'badge-verified' },
  PUBLIC_RUMOR: { label: '市场传闻 · RUMOR', cls: 'badge-rumor' },
  PRIVATE_INTEL: { label: '私人内参 · INTEL', cls: 'badge-private' },
  POSSIBLE_MNPI: { label: '⚠️ POSSIBLE MNPI · 合规警报', cls: 'badge-mnpi' },
};

const KNOWN_CHARACTERS: Record<string, Partial<Character>> = {
  maya_chen: {
    id: 'maya_chen',
    name: 'Maya Chen',
    role: 'AI / 半导体行业资深分析师',
    specialty: '供应链调研 · 算力估值建模 · 催化剂跟踪',
    avatar: '/art/characters/maya_chen.jpg',
  },
  victor_hale: {
    id: 'victor_hale',
    name: 'Victor Hale',
    role: '宏观对冲基金经理',
    specialty: '利率曲线 · 美联储路径 · 尾部风险',
    avatar: '/art/characters/victor_hale.jpg',
  },
  leo_park: {
    id: 'leo_park',
    name: 'Leo Park',
    role: '高级期权做市商 (Senior Market Maker)',
    specialty: 'GEX Gamma 墙 · 做市商对冲 · 盘口价差',
    avatar: '/art/characters/leo_park.jpg',
  },
  daniel_ross: {
    id: 'daniel_ross',
    name: 'Daniel Ross',
    role: '摩根大通主经纪商 (PB Director)',
    specialty: '杠杆融资 · 证券借贷 · 爆仓强平',
    avatar: '/art/characters/daniel_ross.jpg',
  },
  evelyn_shaw: {
    id: 'evelyn_shaw',
    name: 'Evelyn Shaw',
    role: '《华尔街日报》资深财经调查记者',
    specialty: '媒体舆论 · 调查报道 · 公众声誉',
    avatar: '/art/characters/evelyn_shaw.jpg',
  },
  marcus_reed: {
    id: 'marcus_reed',
    name: 'Marcus Reed',
    role: 'SEC 证券交易委员会执法部官员',
    specialty: '合规监管 · MNPI 内幕交易调查 · 传票追责',
    avatar: '/art/characters/marcus_reed.jpg',
  },
  adrian_cross: {
    id: 'adrian_cross',
    name: 'Adrian Cross',
    role: '对家激进对冲基金 CIO',
    specialty: '做空狙击 · 恶意挖角 · 流动性围剿',
    avatar: '/art/characters/adrian_cross.jpg',
  },
};

function resolveCharacter(characters: Character[], characterId: string | null | undefined): Partial<Character> | null {
  if (!characterId) return null;
  const found = characters.find((c) => c.id === characterId);
  if (found) return found;
  return KNOWN_CHARACTERS[characterId] ?? { id: characterId, name: '知情人士', role: '市场消息来源' };
}

export const StoryDialogueModal: React.FC<StoryDialogueModalProps> = ({
  event,
  characters,
  queueLength = 1,
  queueIndex = 1,
  isOpen,
  onChoice,
  onDefer,
  onClose,
  returnFocusRef,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isCriticalCrisis = Boolean(event && (event.intel_class === 'POSSIBLE_MNPI' || event.character_id === 'marcus_reed'));

  const dialogueSegments = useMemo(() => {
    if (!event) return [];
    const bodyParts = (event.body || '')
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return [event.headline || '无标题事件', ...bodyParts];
  }, [event?.id, event?.headline, event?.body]);

  const typewriter = useTypewriterSequence(
    dialogueSegments,
    event?.id ?? '',
  );

  const handleDialogueAdvance = (target: EventTarget | null): void => {
    if (target instanceof Element && target.closest(
      'button,a,input,select,textarea,[role="button"],[role="link"],[data-glossary-term],.glossary-term'
    )) return;
    typewriter.advance();
  };

  useEffect(() => {
    if (!isOpen || !event || isCriticalCrisis || !onClose) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        keyboardEvent.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      const target = returnFocusRef?.current ?? previousFocusRef.current;
      if (target?.isConnected) target.focus();
    };
  }, [event, isCriticalCrisis, isOpen, onClose, returnFocusRef]);

  if (!isOpen || !event) return null;

  const character = resolveCharacter(characters, event.character_id);
  const intelBadge = INTEL_BADGES[event.intel_class] || { label: '情报对白', cls: 'badge-default' };
  const portraitBase = (character?.portrait || character?.avatar || '/art/characters/maya_chen.jpg').replace(/\.(jpg|webp|png)$/, '');
  const portraitSrc = resolveArtSrc(portraitBase);
  const glossarySeen = new Set<string>();
  const portraitInitials = (character?.name || 'INTEL').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const overlayClass = isCriticalCrisis ? 'story-cinematic-overlay' : 'story-drawer-overlay';
  const containerClass = isCriticalCrisis ? 'story-cinematic-container' : 'story-drawer-container';

  return (
    <div className={`${overlayClass} ui-enforced`} data-testid="story-dialogue-modal" role="dialog" aria-modal="true">
      <div
        className="story-cinematic-scrim"
        onClick={() => {
          if (!isCriticalCrisis) onClose?.();
        }}
      />
      <div ref={dialogRef} className={containerClass} onClick={(clickEvent) => clickEvent.stopPropagation()}>
        {/* Character Portrait Stage (Left on Desktop, Top on Mobile) */}
        <div className="story-portrait-stage">
          <div className="portrait-frame">
            <span className="portrait-initial-fallback" aria-hidden="true">{portraitInitials}</span>
            <img
              src={portraitSrc}
              alt={character?.name || '情报来源'}
              loading="lazy"
              decoding="async"
              className="character-portrait-img"
              onError={onArtImgError(portraitBase)}
            />
            <div className="portrait-glow-ring" />
          </div>

          <div className="character-identity-card ot-role-card" style={{ flexDirection: 'column', gap: 4 }}>
            <div className="character-name" style={{ fontWeight: 800 }}>{character?.name || '内线联系人'}</div>
            <div className="character-role" style={{ color: 'var(--thm-dim, var(--muted))', fontSize: 12 }}>
              {character?.role || '市场知情人士'}
            </div>
            {character?.specialty && (
              <div className="character-specialty font-mono ot-prose" style={{ fontSize: 11, color: 'var(--thm-muted, var(--muted))' }}>
              {renderWithGlossary(character.specialty, glossarySeen)}
              </div>
            )}
          </div>
        </div>

        {/* Dialogue Card (Center / Right on Desktop, Bottom on Mobile) */}
        <div className="story-dialogue-card ui-modal ui-surface ui-l3">
          <div className="story-card-header ui-modal-header">
            <div className="story-badge-cluster">
              <span className={`intel-tag ot-badge ${intelBadge.cls}`}>{intelBadge.label}</span>
              <span className="story-date-tag ot-badge ot-badge-derived font-mono">
                {isCriticalCrisis ? '重大合规危机' : '剧情事件'} <span className="en-secondary">{isCriticalCrisis ? 'CRISIS' : 'EVENT'}</span>
              </span>
            </div>
            {queueLength > 1 && (
              <span className="story-queue-counter font-mono ot-badge" style={{ color: 'var(--thm-gold, var(--gold))' }}>
                待处理对白 {queueIndex}/{queueLength}
              </span>
            )}
            {!isCriticalCrisis && onClose && (
              <button
                ref={closeButtonRef}
                type="button"
                className="btn-close story-close-button"
                aria-label="关闭剧情"
                data-testid="story-close"
                onClick={onClose}
              >
                ×
              </button>
            )}
          </div>

          <div className="modal-body ui-modal-body" onClick={(e) => handleDialogueAdvance(e.target)}>
          <div>
            <h2 className="story-headline ui-title" data-level="1">
              {renderWithGlossary(typewriter.visible[0] ?? '', glossarySeen)}
            </h2>

            <div className="story-body-prose ot-prose guide-story-body">
              {typewriter.visible.slice(1).map((text, index) =>
                text ? <p key={index}>{renderWithGlossary(text, glossarySeen)}</p> : null
              )}
            </div>
          </div>

          {/* Player Response Choices */}
          {typewriter.complete && (
          <div className="story-choices-container">
            <div className="story-choices-label guide-response-label">你的回应 (RESPONSE)：</div>
            <div className="story-choices-grid">
              {(event.choices ?? []).map((choice, idx) => {
                let mainLabel = choice.label;
                let subLabel = '';
                if (choice.label.includes(' · ')) {
                  const parts = choice.label.split(' · ');
                  mainLabel = parts[0];
                  subLabel = parts.slice(1).join(' · ');
                } else if (choice.label.includes('：')) {
                  const parts = choice.label.split('：');
                  mainLabel = parts[0];
                  subLabel = parts.slice(1).join('：');
                } else if (choice.label.includes('，') && choice.label.length > 12) {
                  const parts = choice.label.split('，');
                  mainLabel = parts[0];
                  subLabel = parts.slice(1).join('，');
                }
                return (
                  <button
                    key={choice.id}
                    type="button"
                    className="btn-story-choice ot-btn story-choice-two-line ui-btn guide-story-choice"
                    data-variant="row"
                    onClick={() => onChoice(event.id, choice.id)}
                    data-testid={`story-choice-${choice.id}`}
                  >
                    <span className="choice-number font-mono">{idx + 1}</span>
                    <div className="choice-text-wrap" style={{ textAlign: 'left' }}>
                      <span className="choice-main-label" style={{ fontWeight: 700, display: 'block' }}>{renderWithGlossary(mainLabel, glossarySeen)}</span>
                      {subLabel && <small className="choice-sub-label" style={{ color: 'var(--thm-dim, var(--muted))', fontSize: 11, display: 'block' }}>{renderWithGlossary(subLabel, glossarySeen)}</small>}
                    </div>
                  </button>
                );
              })}
            </div>
            {onDefer && !isCriticalCrisis && (
              <button
                type="button"
                className="btn-small story-defer-button ot-btn ot-btn-ghost ui-btn"
                data-variant="row"
                data-testid="story-defer"
                onClick={() => onDefer(event.id)}
              >
                稍后处理 (挂起，不推进市场)
              </button>
            )}
          </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};
