import React, { useState } from 'react';
import type { InquiryView } from '../engine/engines/lp_inquiry_engine';
import { reactionFor } from '../engine/engines/lp_inquiry_engine';
import { renderWithGlossary } from './GlossaryTerm';

/**
 * LP 季末闭门质询会（batch5 · AVG 提案二）
 * 战役收官日触发：LP 代表与合规官按真实表现分档质询，玩家三选一答辩，
 * 看完质询方的后续反应后散会。台词全部来自 inquiry_lines.json（AVG 库）。
 */

interface Props {
  inquiry: InquiryView | null;
  isOpen: boolean;
  onAnswer: (answerId: string) => void;
  onClose: () => void;
}

export const LPInquiryModal: React.FC<Props> = ({ inquiry, isOpen, onAnswer, onClose }) => {
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  if (!isOpen || !inquiry) return null;
  const reactions = answeredId ? reactionFor(inquiry.tier, answeredId) : [];

  return (
    <div className="modal-overlay lp-inquiry-overlay ui-enforced" data-testid="lp-inquiry-modal">
      <div className="modal-content lp-inquiry-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag">季末闭门会 <span className="en-secondary">QUARTERLY TRIBUNAL</span></div>
            <h2 className="ui-title" data-level="1">{inquiry.tierLabel}</h2>
            <div className="text-dim text-sm">会议室的门关上了。没有观众，只有出资人。</div>
          </div>
        </div>

        <div className="lp-inquiry-body modal-body ui-modal-body">
          {inquiry.inquirers.map((q) => (
            <div key={q.characterId} className="lp-inquiry-speaker">
              <div className="lp-inquiry-speaker-head">
                <span className="speaker-name ot-role-name">{q.name}</span>
                <span className="speaker-role ot-role-title">{q.role}</span>
              </div>
              <div className="war-room-card-text ot-role-quote">"{q.opening}"</div>
            </div>
          ))}

          {!answeredId ? (
            <div className="lp-inquiry-answers">
              <div className="decision-prompt">轮到你说话了。这间屋子里的回答会决定下个季度的委托额度。</div>
              {inquiry.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="btn-choice-warroom ot-btn ot-btn-secondary ui-btn"
                  data-variant="row"
                  data-testid={`lp-answer-${c.id}`}
                  onClick={() => {
                    setAnsweredId(c.id);
                    onAnswer(c.id);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="lp-inquiry-reactions">
              {reactions.map((r) => (
                <div key={r.name} className="lp-inquiry-speaker">
                  <div className="lp-inquiry-speaker-head">
                    <span className="speaker-name ot-role-name">{r.name}</span>
                  </div>
                  <div className="war-room-card-text ot-role-quote">"{renderWithGlossary(r.text)}"</div>
                </div>
              ))}
              <button
                type="button"
                className="ot-btn lp-inquiry-close ui-btn ui-btn-primary"
                data-testid="lp-inquiry-close"
                onClick={() => {
                  setAnsweredId(null);
                  onClose();
                }}
              >
                散会 · 回到基金总部
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
