import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getGlossaryEntry, matchGlossary } from '../lib/glossaryMatch';

// 制作人裁定：IV 等专业术语可点击，点击弹出详细中文定义（词条文案归 AVG）。
// 弹卡走 portal 定位到 body，避免被 modal 的 overflow 裁掉。

interface TermProps {
  termId: string;
  children: React.ReactNode;
}

export const GlossaryTerm: React.FC<TermProps> = ({ termId, children }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const entry = getGlossaryEntry(termId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || cardRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!entry) return <>{children}</>;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      const cardW = Math.min(340, window.innerWidth - 16);
      let left = r.left + r.width / 2 - cardW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - cardW - 8));
      // Prefer below the term; flip above when near the bottom edge.
      const below = r.bottom + 8;
      const top = below + 260 > window.innerHeight ? Math.max(8, r.top - 8 - 260) : below;
      setPos({ top, left });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={`glossary-term ui-btn${open ? ' glossary-term-open' : ''}`}
        data-variant="compact"
        onClick={toggle}
        data-testid={`glossary-term-${termId}`}
        aria-expanded={open}
      >
        {children}
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={cardRef}
            className="glossary-card ot-card"
            style={{ top: pos.top, left: pos.left }}
            role="dialog"
            aria-label={`术语解释：${entry.cn}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glossary-card-head">
              <span className="glossary-card-cn">{entry.cn}</span>
              <span className="glossary-card-en">
                {entry.en}
                {entry.abbr ? ` · ${entry.abbr}` : ''}
              </span>
              <button
                type="button"
                className="glossary-card-close ui-btn"
                data-variant="compact"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="glossary-card-def">{entry.definition}</div>
            {entry.example && (
              <div className="glossary-card-example">
                <span className="glossary-card-example-label">举例</span>
                {entry.example}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

/**
 * Render a string with glossary terms wrapped as clickable GlossaryTerm spans.
 * Pass a shared `seen` set to keep the first-occurrence rule across all texts
 * of one surface (e.g. every message in one War Room modal).
 */
export function renderWithGlossary(text: string, seen?: Set<string>): React.ReactNode {
  const segments = matchGlossary(text, seen);
  if (segments.length === 1 && !segments[0].termId) return text;
  return segments.map((s, i) =>
    s.termId ? (
      <GlossaryTerm key={i} termId={s.termId}>
        {s.text}
      </GlossaryTerm>
    ) : (
      <React.Fragment key={i}>{s.text}</React.Fragment>
    ),
  );
}
