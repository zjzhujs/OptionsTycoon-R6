import { HoldConfirmButton } from './HoldConfirmButton';

export type DecisionKeyId = 'BUY_CALLS' | 'SELL_PUTS' | 'SPREAD' | 'HEDGE' | 'DO_NOTHING';

export interface DecisionPreviewModel {
  eyebrow: string;
  title: string;
  contract: string;
  detail: string;
  risk: string;
  confirmLabel: string;
  confirmSublabel?: string;
  ready: boolean;
  /** `true` means confirmation changes money/positions and should read as armed. */
  irreversible?: boolean;
}

export interface DecisionDeckProps {
  thesis: string;
  selectedKey?: DecisionKeyId | null;
  preview?: DecisionPreviewModel | null;
  onSelect: (key: DecisionKeyId) => void;
  onConfirm?: () => void | Promise<void>;
  onClear?: () => void;
}

const KEYS: Array<{ id: DecisionKeyId; zh: string; en: string; index: string; tone: string }> = [
  { id: 'BUY_CALLS', zh: '买入看涨', en: 'BUY CALLS', index: '01', tone: 'bull' },
  { id: 'SELL_PUTS', zh: '卖出看跌', en: 'SELL PUTS', index: '02', tone: 'income' },
  { id: 'SPREAD', zh: '价差组合', en: 'SPREAD', index: '03', tone: 'spread' },
  { id: 'HEDGE', zh: '对冲保护', en: 'HEDGE', index: '04', tone: 'hedge' },
  { id: 'DO_NOTHING', zh: '按兵不动', en: 'DO NOTHING', index: '05', tone: 'neutral' },
];

/**
 * Five-Key is an INTENT SELECTOR, never an execution surface.
 *
 * Clicking a key only arms an intent. Money/position state may change only from
 * the independent confirmation actuator rendered in ACTION PREVIEW below.
 */
export function DecisionDeck({
  thesis,
  selectedKey = null,
  preview = null,
  onSelect,
  onConfirm,
  onClear,
}: DecisionDeckProps): JSX.Element {
  return (
    <section className="decision-deck" data-testid="decision-deck" data-visual-key="decision-deck">
      <header className="decision-deck-thesis" data-testid="current-thesis-instrument" data-visual-key="thesis-panel">
        <span className="command-kicker">CURRENT THESIS</span>
        <strong>{thesis || '尚未建立论点 — 先定义观点，再选择工具。'}</strong>
      </header>

      <div className="decision-key-console">
        <div className="decision-key-console-head" aria-hidden="true">
          <span>CHOOSE YOUR ACTION</span>
          <span>SELECT → PREVIEW → CONFIRM</span>
        </div>
        <div className="decision-key-grid" aria-label="Five-key decision deck">
          {KEYS.map((key) => {
            const selected = key.id === selectedKey;
            return (
              <button
                type="button"
                key={key.id}
                className={`decision-key decision-key-${key.id.toLowerCase()} decision-tone-${key.tone}${selected ? ' is-selected' : ''}`}
                data-testid={`decision-key-${key.id.toLowerCase()}`}
                data-decision-label={key.en}
                aria-pressed={selected}
                onClick={() => onSelect(key.id)}
              >
                <span className="decision-key-index">{key.index}</span>
                <span className="decision-key-label">{key.zh}</span>
                <span className="decision-key-en">{key.en}</span>
                <span className="decision-key-signal" aria-hidden="true" />
                {selected && <span className="decision-key-armed">ARMED</span>}
              </button>
            );
          })}
        </div>
      </div>

      {selectedKey && preview && (
        <section className="decision-action-preview" data-testid="decision-action-preview" data-visual-key="decision-action-preview">
          <div className="decision-preview-copy">
            <div className="decision-preview-heading">
              <span className="command-kicker">{preview.eyebrow}</span>
              <strong>{preview.title}</strong>
            </div>
            <span className="decision-preview-contract font-mono">{preview.contract}</span>
            <span className="decision-preview-detail">{preview.detail}</span>
            <span className="decision-preview-risk">{preview.risk}</span>
          </div>

          <div className="decision-preview-actions">
            {onClear && (
              <button type="button" className="decision-preview-cancel" data-testid="decision-cancel" onClick={onClear}>
                CHANGE / 重新选择
              </button>
            )}
            {onConfirm && (
              <HoldConfirmButton
                label={preview.confirmLabel}
                sublabel={preview.confirmSublabel}
                disabled={!preview.ready}
                onConfirm={onConfirm}
                className={preview.irreversible ? 'is-irreversible' : 'is-safe-navigation'}
                testId="decision-confirm"
              />
            )}
          </div>
        </section>
      )}
    </section>
  );
}
