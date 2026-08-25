import React, { useState } from 'react';
import type { WhatMattersItem } from '../types';
import { formatProvenance } from '../lib/financialLanguage';

// Spec Section 49: any "今日重点" list defaults to at most 3 items shown, rest collapsed
// behind an explicit expand -- prevents 5+ HIGH-impact cards all fighting for attention
// on first paint of Fund HQ.
const DEFAULT_VISIBLE_COUNT = 3;

interface Props {
  items: WhatMattersItem[];
  onNavigate?: (panel: string) => void;
  compact?: boolean;
  maxCount?: number;
}

const PANEL_LABELS: Record<string, string> = {
  MACRO: '宏观仪表盘',
  POLICY: '政策通道',
  NEWS: '新闻快讯',
  MARKET_PULSE: '市场脉搏',
  FLOW: '资金流 & 持仓',
  WALL_STREET: '华尔街专柜',
  HUMAN_ACTION: '人物事件',
  LP_RELATIONS: 'LP 出资人',
};

function getImpactBadgeClass(impact: string): string {
  if (impact === 'HIGH') return 'ot-badge-risk';
  if (impact === 'MEDIUM') return 'ot-badge-estimated';
  return 'ot-badge-real';
}

export const WhatMattersTodayPanel: React.FC<Props> = ({ items, onNavigate, compact = false, maxCount }) => {
  const [expanded, setExpanded] = useState(false);
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null);
  if (!items || items.length === 0) return null;

  const defaultLimit = maxCount ?? (compact ? 3 : DEFAULT_VISIBLE_COUNT);
  const visibleItems = expanded ? items : items.slice(0, defaultLimit);
  const hiddenCount = items.length - visibleItems.length;

  if (compact) {
    return (
      <div className="wmt-container-compact ot-panel" data-testid="what-matters-compact">
        <div className="wmt-header ot-section-header">
          <div className="ot-section-titles">
            <span className="ot-section-zh">今日关注焦点</span>
            <span className="ot-section-en">FOCUS STACK</span>
          </div>
          <span className="wmt-count font-mono ot-badge ot-badge-simulated">{items.length} 项</span>
        </div>

        <div className="wmt-compact-list">
          {visibleItems.map((item, idx) => {
            const impactLabel = item.impact === 'HIGH' ? '高' : item.impact === 'MEDIUM' ? '中' : '低';
            const impactBadgeClass = getImpactBadgeClass(item.impact);
            const isDetailOpen = activeDetailId === item.id;

            return (
              <div
                key={item.id}
                className={`wmt-compact-row ${isDetailOpen ? 'wmt-compact-row-active' : ''}`}
                onClick={() => setActiveDetailId(isDetailOpen ? null : item.id)}
                title={`${item.headline} — ${item.why_it_matters}`}
              >
                <div className="wmt-compact-prefix">
                  <span className="wmt-rank font-mono">#{idx + 1}</span>
                  <span className={`ot-badge ${impactBadgeClass} wmt-compact-impact`}>
                    {impactLabel}
                  </span>
                </div>
                <div className="wmt-compact-body">
                  <div className={`wmt-compact-title ${isDetailOpen ? 'wmt-compact-title-wrap' : ''}`}>{item.headline}</div>
                  <div className="wmt-compact-sub font-mono">
                    <span>{item.affected}</span>
                    <span className="wmt-compact-src">{PANEL_LABELS[item.source_panel] || item.source_panel}</span>
                  </div>
                  {isDetailOpen && (
                    <div className="wmt-compact-detail-box">
                      <p className="wmt-compact-why">{item.why_it_matters}</p>
                      {onNavigate && (
                        <button
                          type="button"
                          className="ot-btn ot-btn-secondary ot-btn-xs"
                          style={{ marginTop: 4, width: '100%' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(item.source_panel);
                          }}
                        >
                          前往 {PANEL_LABELS[item.source_panel] || item.source_panel} ➔
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span
                  className="wmt-compact-arrow"
                  onClick={(e) => {
                    if (onNavigate) {
                      e.stopPropagation();
                      onNavigate(item.source_panel);
                    }
                  }}
                >
                  →
                </span>
              </div>
            );
          })}
        </div>

        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            className="wmt-expand-compact-btn ot-btn ot-btn-ghost font-mono"
            onClick={() => setExpanded(true)}
          >
            查看更多 ({hiddenCount} 项) ▾
          </button>
        )}
        {expanded && (
          <button
            type="button"
            className="wmt-expand-compact-btn ot-btn ot-btn-ghost font-mono"
            onClick={() => setExpanded(false)}
          >
            收起 ▴
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wmt-container ot-panel">
      <div className="wmt-header ot-section-header">
        <div className="wmt-title-row">
          <h3 className="wmt-title ot-section-title">
            今日最值得关注 <span className="en-secondary">WHAT MATTERS TODAY</span>
          </h3>
          <span className="wmt-count font-mono ot-badge ot-badge-simulated">{items.length} 项</span>
        </div>
      </div>

      <div className="wmt-items">
        {visibleItems.map((item, idx) => {
          const impactLabel =
            item.impact === 'HIGH' ? '高' : item.impact === 'MEDIUM' ? '中' : '低';
          const srcLabel = formatProvenance(item.source_type);
          const impactBadgeClass = getImpactBadgeClass(item.impact);

          return (
            <div
              key={item.id}
              className="wmt-card ot-card"
              onClick={() => onNavigate?.(item.source_panel)}
              style={{ cursor: onNavigate ? 'pointer' : 'default' }}
            >
              <div className="wmt-card-header font-mono">
                <span className="wmt-rank">#{idx + 1}</span>
                <span className={`wmt-impact-badge ot-badge ${impactBadgeClass}`}>
                  {impactLabel}
                </span>
              </div>

              <div className="wmt-card-headline">{item.headline}</div>

              <div className="wmt-card-meta font-mono">
                <span className="wmt-affected">影响标的: {item.affected}</span>
                <span className="wmt-source-tag ot-badge ot-badge-derived" title={`Source: ${item.source_type} · Confidence: ${item.confidence ?? 'N/A'}`}>
                  {srcLabel}
                </span>
              </div>

              <div className="wmt-card-why">{item.why_it_matters}</div>

              {item.character_voice && (
                <div className="wmt-card-voice">{item.character_voice}</div>
              )}

              {onNavigate && (
                <div className="wmt-card-link font-mono">
                  {PANEL_LABELS[item.source_panel] || item.source_panel} ➔
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="wmt-expand-btn ot-btn ot-btn-secondary"
          onClick={() => setExpanded(true)}
        >
          显示其余 {hiddenCount} 项 ➔
        </button>
      )}
      {expanded && items.length > DEFAULT_VISIBLE_COUNT && (
        <button
          type="button"
          className="wmt-expand-btn ot-btn ot-btn-secondary"
          onClick={() => setExpanded(false)}
        >
          收起
        </button>
      )}
    </div>
  );
};
