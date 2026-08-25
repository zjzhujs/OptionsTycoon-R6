import type { Character, IntelClass, StoryEventPublic } from '../types';
import { renderWithGlossary } from './GlossaryTerm';

type StoryArchiveEntry = {
  template_id: string;
  game_date: string;
  headline: string;
  body?: string | null;
  chosen_choice_id?: string | null;
};

export interface StoryInboxPanelProps {
  events: StoryEventPublic[];
  history?: StoryArchiveEntry[];
  characters: Character[];
  onChoice: (eventId: string, choiceId: string) => void;
  onResume?: (eventId: string) => void;
}

const INTEL_LABELS: Record<IntelClass, string> = {
  PUBLIC_VERIFIED: '公开核实',
  PUBLIC_RUMOR: '公开传闻',
  PRIVATE_INTEL: '私人情报',
  POSSIBLE_MNPI: 'POSSIBLE MNPI',
};

function findCharacter(characters: Character[], characterId: string | null | undefined): Character | undefined {
  if (!characterId) return undefined;
  return characters.find((c) => c.id === characterId);
}

function getIntelBadgeClass(intelClass: IntelClass): string {
  switch (intelClass) {
    case 'POSSIBLE_MNPI':
      return 'ot-badge-risk';
    case 'PUBLIC_VERIFIED':
      return 'ot-badge-real';
    case 'PRIVATE_INTEL':
      return 'ot-badge-derived';
    case 'PUBLIC_RUMOR':
    default:
      return 'ot-badge-estimated';
  }
}

// Right-column panel: the private-messenger-style story inbox. Each pending
// event renders as a storycard with the sender, an intel-class badge, the
// headline/body, and one button per server-resolved choice.
export function StoryInboxPanel({ events, history = [], characters, onChoice, onResume }: StoryInboxPanelProps): JSX.Element {
  const glossarySeen = new Set<string>();
  return (
    <div className="panel ot-panel ui-enforced story-inbox-enforced">
      <div className="title ot-section-title">
        情报信箱 <span className="en-secondary">INTEL INBOX</span>
      </div>
      {events.length === 0 ? (
        <div className="ot-empty-state">
          <span className="ot-empty-text">暂无待处理消息</span>
        </div>
      ) : (
        events.map((event) => {
          const character = findCharacter(characters, event.character_id);
          const badgeClass = getIntelBadgeClass(event.intel_class);
          return (
            <div className="storycard ot-role-card" key={event.id}>
              <div className="head ot-role-header">
                <div className="story-sender-info">
                  {character ? (
                    <div className="ot-avatar story-avatar">
                      <img className="portrait" src={character.portrait || character.avatar} alt={character.name} loading="lazy" />
                    </div>
                  ) : (
                    <div className="ot-avatar story-avatar" aria-hidden="true">📬</div>
                  )}
                  <span className="ot-role-name">{character ? character.name : '内部消息'}</span>
                </div>
                <span className={`ot-badge ${badgeClass}`}>{INTEL_LABELS[event.intel_class]}</span>
                {event.deferred && <span className="ot-badge ot-badge-derived">已挂起</span>}
              </div>
              <div className="story-headline">{renderWithGlossary(event.headline, glossarySeen)}</div>
              <div className="small ot-role-quote">{renderWithGlossary(event.body ?? '', glossarySeen)}</div>
              {event.deferred ? (
                <div className="btnrow" style={{ marginTop: 8 }}>
                  <span className="small ot-role-quote">已挂起，不会在开场门禁中重复弹出。</span>
                  {onResume && (
                    <button
                      type="button"
                      className="ot-btn ot-btn-secondary"
                      onClick={() => onResume(event.id)}
                    >
                      返回处理
                    </button>
                  )}
                </div>
              ) : (
                <div className="btnrow" style={{ marginTop: 8 }}>
                  {(event.choices ?? []).map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className="ot-btn ot-btn-secondary"
                      onClick={() => onChoice(event.id, choice.id)}
                    >
                      {renderWithGlossary(choice.label, glossarySeen)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* READ ARCHIVE: append-only story_history, strictly read-only.
          No onChoice / onResume / API calls / SFX here -- structure forbids it. */}
      <details className="story-archive">
        <summary className="story-archive-summary">
          已读档案 <span className="en-secondary">READ ARCHIVE</span>
          <span className="story-archive-count">{history.length}</span>
        </summary>

        <div className="story-archive-list">
          {history.length === 0 ? (
            <span className="market-viz-na">DATA_UNAVAILABLE</span>
          ) : (
            [...history].reverse().map((entry, index) => (
              <details
                className="story-archive-entry"
                key={`${entry.template_id}-${entry.game_date}-${index}`}
              >
                <summary>
                  <time>{entry.game_date}</time>
                  <strong>{entry.headline}</strong>
                  <span className="story-archive-choice">
                    你的选择：{entry.chosen_choice_id || 'DATA_UNAVAILABLE'}
                  </span>
                </summary>

                <div className="story-archive-body">
                  {entry.body || 'DATA_UNAVAILABLE'}
                </div>
              </details>
            ))
          )}
        </div>
      </details>
    </div>
  );
}
