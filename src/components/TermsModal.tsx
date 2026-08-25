import React, { useState, useEffect } from 'react';
import type { FinancialTerm } from '../types';
import { api } from '../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTermId?: string | null;
}

export const TermsModal: React.FC<Props> = ({ isOpen, onClose, initialTermId }) => {
  const [terms, setTerms] = useState<FinancialTerm[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<FinancialTerm | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  useEffect(() => {
    if (isOpen) {
      api.getTerms().then((res) => {
        setTerms(res);
        if (initialTermId) {
          const match = res.find((t) => t.id === initialTermId);
          if (match) setSelectedTerm(match);
          else if (res.length > 0) setSelectedTerm(res[0]);
        } else if (res.length > 0 && !selectedTerm) {
          setSelectedTerm(res[0]);
        }
      }).catch(console.error);
    }
  }, [isOpen, initialTermId]);

  if (!isOpen) return null;

  const categories = ['ALL', ...Array.from(new Set(terms.map((t) => t.category)))];

  const filteredTerms = terms.filter((t) => {
    if (search && !t.term_cn.toLowerCase().includes(search.toLowerCase()) && !t.term_en.toLowerCase().includes(search.toLowerCase()) && !t.short_def.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (categoryFilter !== 'ALL' && t.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="modal-content terms-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag">即时教学词典 <span className="en-secondary">JIT KNOWLEDGE BASE</span></div>
            <h2 className="ui-title" data-level="1">期权与金融量化术语词典</h2>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="terms-container modal-body ui-modal-body">
          {/* Left Sidebar Term List */}
          <div className="terms-sidebar">
            <input
              type="text"
              placeholder="搜索术语 (例: Delta, Gamma, 做市商, 倒挂)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="terms-search-input"
            />

            <div className="terms-cat-pills">
              {categories.map((c) => (
                <button
                  key={c}
                  className={`cat-pill ui-btn ${categoryFilter === c ? 'active' : ''}`}
                  data-variant="compact"
                  onClick={() => setCategoryFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="terms-list">
              {filteredTerms.map((t) => (
                <div
                  key={t.id}
                  className={`term-item ${selectedTerm?.id === t.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTerm(t)}
                >
                  <div className="term-name-cn">{t.term_cn}</div>
                  <div className="term-name-en">{t.term_en}</div>
                  <span className="badge-cat">{t.category}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Detail Pane */}
          <div className="terms-detail-pane">
            {selectedTerm ? (
              <div className="term-detail-content">
                <div className="detail-header">
                  <span className="badge-cat-lg">{selectedTerm.category ?? ''}</span>
                  <h3 className="detail-title">{selectedTerm.term_cn ?? ''}</h3>
                  <div className="detail-en-title">{selectedTerm.term_en ?? ''}</div>
                </div>

                <div className="detail-short-def">
                  <strong>核心定义：</strong> {selectedTerm.short_def ?? ''}
                </div>

                <div className="detail-section">
                  <h4>📖 深度原理解析</h4>
                  <p>{selectedTerm.detailed_explanation ?? ''}</p>
                </div>

                <div className="detail-section tip-box">
                  <h4>💡 职业交易员实战技巧 (Analyst Tip)</h4>
                  <p>{selectedTerm.analyst_tip ?? ''}</p>
                </div>
              </div>
            ) : (
              <div className="ot-empty-state">请从左侧选择需要查看的术语</div>
            )}
          </div>
        </div>

        <div className="modal-footer ui-modal-footer">
          <button className="ot-btn ot-btn-secondary ui-btn" data-variant="row" onClick={onClose}>
            关闭 (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
