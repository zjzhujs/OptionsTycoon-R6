import React, { useEffect, useRef, useState } from 'react';

export interface CharacterCallChoice {
  id: string;
  label: string;
}

export interface CharacterCallItem {
  id: string;
  characterId: string;
  name: string;
  role: string;
  portrait: string;
  eyebrow?: string;
  headline: string;
  body: string;
  choices: CharacterCallChoice[];
}

interface CallStackRailProps {
  calls: CharacterCallItem[];
  activeId: string | null;
  onOpen: (id: string) => void;
}

interface CharacterCallOverlayProps {
  call: CharacterCallItem | null;
  isOpen: boolean;
  onChoice: (callId: string, choiceId: string) => void;
  onClose: (callId: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const CallStackRail: React.FC<CallStackRailProps> = ({ calls, activeId, onOpen }) => {
  if (!calls.length) return null;

  return (
    <aside className="call-stack-rail" data-testid="call-stack-rail" aria-label="待接人物来电">
      {calls.map((call) => {
        const active = call.id === activeId;
        return (
          <button
            key={call.id}
            type="button"
            className={`call-stack-avatar${active ? ' is-active' : ' is-incoming'}`}
            data-testid={`call-stack-${call.characterId}`}
            aria-label={`${active ? '正在通话' : '接听'}：${call.name} · ${call.role}`}
            aria-pressed={active}
            onClick={() => onOpen(call.id)}
          >
            <span className="call-stack-avatar-media" aria-hidden="true">
              <img
                src={call.portrait}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
              <span className="call-stack-fallback">{initials(call.name)}</span>
            </span>
            <span className="call-stack-dot" aria-hidden="true" />
          </button>
        );
      })}
    </aside>
  );
};

export const CharacterCallOverlay: React.FC<CharacterCallOverlayProps> = ({
  call,
  isOpen,
  onChoice,
  onClose,
}) => {
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    setClosing(false);
  }, [call?.id, isOpen]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  if (!call || !isOpen) return null;

  const leave = (after: () => void): void => {
    if (closing) return;
    setClosing(true);
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    exitTimer.current = window.setTimeout(after, reduced ? 150 : 200);
  };

  const dialogueLines =
    call.body.match(/[^。！？!?]+[。！？!?]?/g)?.map((line) => line.trim()).filter(Boolean) ?? [call.body];

  return (
    <section
      className={`character-call-overlay ui-surface ui-l3${closing ? ' is-closing' : ''}`}
      data-testid="character-call-overlay"
      aria-label={`${call.name} 人物来电`}
    >
      <header className="character-call-header">
        <span className="character-call-portrait" aria-hidden="true">
          <img
            src={call.portrait}
            alt=""
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
          <span>{initials(call.name)}</span>
        </span>
        <div className="character-call-identity">
          <div className="character-call-eyebrow">{call.eyebrow ?? 'LIVE · SECURE LINE'}</div>
          <strong>{call.name}</strong>
          <small>{call.role}</small>
        </div>
        <button
          type="button"
          className="character-call-close ui-btn"
          aria-label="收起人物来电"
          onClick={() => leave(() => onClose(call.id))}
        >
          ×
        </button>
      </header>

      <div className="character-call-body">
        <h3>{call.headline}</h3>
        <div className="character-call-dialogue">
          {dialogueLines.slice(0, 4).map((line, index) => (
            <p key={`${call.id}-line-${index}`}>{line}</p>
          ))}
        </div>
      </div>

      <footer className="character-call-actions">
        {call.choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className="ui-btn character-call-choice"
            data-testid={`character-call-choice-${choice.id}`}
            onClick={() => leave(() => onChoice(call.id, choice.id))}
          >
            {choice.label}
          </button>
        ))}
      </footer>
    </section>
  );
};
