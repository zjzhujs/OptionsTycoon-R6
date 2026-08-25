import type { Character, Relationship } from '../types';
import { clamp } from '../lib/format';

export interface RelationshipsPanelProps {
  relationships: Record<string, Relationship>;
  characters: Character[];
}

interface RelMetric {
  key: keyof Pick<Relationship, 'trust' | 'respect' | 'fear' | 'favor' | 'rivalry'>;
  label: string;
  color: string;
}

const REL_METRICS: RelMetric[] = [
  { key: 'trust', label: '信任', color: 'var(--thm-good)' },
  { key: 'respect', label: '尊重', color: 'var(--thm-accent)' },
  { key: 'fear', label: '恐惧', color: 'var(--thm-risk)' },
  { key: 'favor', label: '好感', color: 'var(--thm-accent-2)' },
  { key: 'rivalry', label: '敌意', color: 'var(--thm-gold)' },
];

// Right-column panel: one compact row per character the player has an
// established relationship with (trust/respect/fear/favor/rivalry bars).
export function RelationshipsPanel({ relationships, characters }: RelationshipsPanelProps): JSX.Element {
  const known = characters.filter((c) => relationships[c.id] !== undefined);

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        人物关系 <span className="en-secondary">RELATIONSHIPS</span>
      </div>
      {known.length === 0 ? (
        <div className="ot-empty-state">
          <span className="ot-empty-text">暂无已建立联系的人物</span>
        </div>
      ) : (
        known.map((character) => {
          const rel = relationships[character.id];
          return (
            <div className="relrow ot-role-card" key={character.id}>
              <div className="ot-avatar rel-avatar">
                <img
                  src={character.portrait || character.avatar || `/art/characters/${character.id}.webp`}
                  alt={character.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.endsWith(`${character.id}.webp`)) {
                      target.src = `/art/characters/${character.id}.webp`;
                    }
                  }}
                />
              </div>
              <span className="ot-role-name rel-char-name">{character.name}</span>
              <div className="rel-metrics-strip">
                {REL_METRICS.map((metric) => (
                  <div key={metric.key} className="rel-metric-item">
                    <span className="rel-metric-label font-mono">
                      {metric.label}
                    </span>
                    <div className="relbar">
                      <i style={{ width: `${clamp(rel ? (rel[metric.key] ?? 50) : 50, 0, 100)}%`, background: metric.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
