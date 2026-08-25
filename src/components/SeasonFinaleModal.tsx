import React, { useState } from 'react';
import type { SeasonOutcome } from '../types';
import { money } from '../lib/format';

interface Props {
  outcome: SeasonOutcome | null;
  isOpen: boolean;
  onClose: () => void;
  onRestartNewSeason: () => void;
}

export const SeasonFinaleModal: React.FC<Props> = ({
  outcome,
  isOpen,
  onClose,
  onRestartNewSeason,
}) => {
  if (!isOpen || !outcome) return null;

  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const scenes: string[] = outcome.narrative_scenes || [outcome.narrative || '赛季战役圆满达成。'];
  const card = outcome.legacy_card || {
    ending_title: outcome.title,
    player_archetype: outcome.player_archetype,
    legacy_score: outcome.legacy_score,
    ending_type: outcome.ending_type,
    legacy_quote: '在华尔街的历史上，只有真正恪守风控与直面不确定性的交易员，才能留下不可磨灭的传奇。',
    peak_aum: outcome.peak_equity || outcome.final_equity,
  };
  const review: Partial<SeasonOutcome['season_review']> = outcome.season_review || {};
  const endingTitle = outcome.ending_title || outcome.title || '赛季战役完结';
  const endingSubtitle = outcome.ending_subtitle || outcome.player_archetype || '华尔街操盘传奇';

  const isLastScene = activeSceneIndex >= scenes.length;

  return (
    <div className="modal-overlay ui-enforced">
      <div className="modal-content finale-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="badge-tag ot-badge ot-badge-derived">SEASON 1 FINALE / 最终结局判定</div>
            <h2 className="finale-title ui-title" data-level="1">{endingTitle}</h2>
            <div className="finale-subtitle" style={{ color: 'var(--thm-dim, var(--muted))' }}>{endingSubtitle}</div>
          </div>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="finale-body modal-body ui-modal-body">
          {!isLastScene ? (
            /* Cinematic Scene Progression */
            <div className="cinematic-scene-container">
              <div className="scene-progress-dots">
                {scenes.map((_: any, i: number) => (
                  <span
                    key={i}
                    className={`scene-dot ${i === activeSceneIndex ? 'active' : ''} ${i < activeSceneIndex ? 'visited' : ''}`}
                  />
                ))}
              </div>

              <div className="cinematic-card">
                <div className="scene-number font-mono">SCENE {activeSceneIndex + 1} OF {scenes.length}</div>
                <p className="scene-text ot-prose">{scenes[activeSceneIndex]}</p>
              </div>

              <div className="scene-actions">
                {activeSceneIndex > 0 && (
                  <button
                    type="button"
                    className="ot-btn ot-btn-ghost ui-btn"
                    data-variant="row"
                    onClick={() => setActiveSceneIndex(activeSceneIndex - 1)}
                  >
                    ◀ 上一幕
                  </button>
                )}
                <button
                  type="button"
                  className="ot-btn ui-btn"
                  data-variant="row"
                  onClick={() => setActiveSceneIndex(activeSceneIndex + 1)}
                >
                  {activeSceneIndex < scenes.length - 1 ? '下一幕 ➔' : '查看华尔街终章遗产卡 (Legacy Card) ➔'}
                </button>
              </div>
            </div>
          ) : (
            /* Full Legacy Card & Season Review */
            <div className="legacy-card-view">
              {/* Gold/Noir Wall Street Legacy Card */}
              <div className="wall-street-legacy-card">
                <div className="legacy-card-header">
                  <div>
                    <div className="badge-legacy ot-badge ot-badge-derived">
                      华尔街终身档案 <span className="en-secondary">WALL STREET LEGACY</span>
                    </div>
                    <h3 className="legacy-fund-name" style={{ color: 'var(--thm-gold, var(--gold))', margin: '4px 0' }}>
                      {card.fund_name || 'TITAN CAPITAL'}
                    </h3>
                    <div className="legacy-era font-mono" style={{ fontSize: 11, color: 'var(--thm-dim, var(--muted))' }}>
                      {card.era || '2024–2025 AI REVOLUTION'}
                    </div>
                  </div>
                  <div className="legacy-reputation-badge ot-badge ot-badge-real font-mono">
                    {card.reputation_title || 'LEGENDARY OPERATOR'}
                  </div>
                </div>

                <div className="legacy-stats-grid font-mono">
                  <div className="legacy-stat-box">
                    <span className="l-lbl">总收益率 (Return)</span>
                    <span className={`l-val ${Number(card.total_return_pct ?? 0) >= 0 ? 'green' : 'red'}`}>
                      {Number(card.total_return_pct ?? 0) >= 0 ? '+' : ''}{(card.total_return_pct ?? 0).toFixed(2)}%
                    </span>
                  </div>

                  <div className="legacy-stat-box">
                    <span className="l-lbl">最大回撤 (Max DD)</span>
                    <span className="l-val text-red">
                      {Number(card.peak_aum ?? 0) > 0 ? `-${(card.max_drawdown_pct ?? 0).toFixed(1)}%` : 'N/A'}
                    </span>
                  </div>

                  <div className="legacy-stat-box">
                    <span className="l-lbl">峰值 AUM (Peak AUM)</span>
                    <span className="l-val text-cyan">
                      {money(card.peak_aum ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="legacy-details-table">
                  <div className="legacy-row">
                    <span className="l-row-lbl">投资风格 (Investment Style)</span>
                    <span className="l-row-val">{card.investment_style || '基本面催化剂 + 凸性期权对冲'}</span>
                  </div>
                  <div className="legacy-row">
                    <span className="l-row-lbl">风险画像 (Risk Profile)</span>
                    <span className="l-row-val font-mono">{card.risk_profile || 'CALCULATED CONVEXITY'}</span>
                  </div>
                  <div className="legacy-row">
                    <span className="l-row-lbl">团队忠诚度 (Team Loyalty)</span>
                    <span className="l-row-val">{card.team_loyalty_rating || 'HIGH / 忠诚骨干'}</span>
                  </div>
                  <div className="legacy-row">
                    <span className="l-row-lbl">合规等级 (Compliance Grade)</span>
                    <span className="l-row-val font-mono">{card.compliance_grade || 'GRADE A'}</span>
                  </div>
                  <div className="legacy-row">
                    <span className="l-row-lbl">对手 Adrian 最终格局</span>
                    <span className="l-row-val font-mono" style={{ color: 'var(--thm-gold, var(--yellow))' }}>
                      {outcome.adrian_fate || '遭遇 Gamma 挤压清算'}
                    </span>
                  </div>
                </div>

                <div className="legacy-quote-box">
                  <p className="legacy-quote ot-prose">{card.legacy_quote}</p>
                </div>
              </div>

              {/* Season Review Highlights */}
              <div className="season-review-section">
                <h4 className="section-title">📊 赛季复盘亮点 (Season Review)</h4>
                <div className="review-highlight-grid">
                  <div className="rev-item">
                    <span className="rev-lbl">🏆 最佳交易 (Best Trade)</span>
                    <span className="rev-val">{review.best_trade || review.highest_return_trade || 'NVDA Call Spread'}</span>
                  </div>
                  <div className="rev-item">
                    <span className="rev-lbl">📉 最痛教训 (Worst Trade)</span>
                    <span className="rev-val">{review.worst_trade || review.worst_process_trade || 'N/A'}</span>
                  </div>
                  <div className="rev-item">
                    <span className="rev-lbl">🎯 最佳纪律 (Best Process)</span>
                    <span className="rev-val">{review.best_process_trade || 'NVDA Hedged Position'}</span>
                  </div>
                  <div className="rev-item">
                    <span className="rev-lbl">🤝 最信任角色</span>
                    <span className="rev-val">{review.most_trusted_character || 'Maya Chen'}</span>
                  </div>
                </div>
              </div>

              {/* Season 2 Inheritance Preview */}
              <div className="season-2-preview-box ot-prose">
                <h4>🔮 第二季《发现与审判》（SEASON 2: DISCOVERY）状态继承</h4>
                <p>
                  继承资金：<strong className="font-mono">{money(card.peak_aum || outcome.final_equity || 0)}</strong> · 留任核心团队：<strong>{outcome.season_2_inherited_state?.team_retention?.join('、') || '全员留任（Full Retention）'}</strong> · SEC 调查标记：<strong>{outcome.season_2_inherited_state?.sec_probe_active ? '活跃（Active Inquiry）' : '清白（Clean）'}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer ui-modal-footer">
          {isLastScene && (
            <button type="button" className="ot-btn ot-btn-ghost ui-btn" data-variant="row" onClick={() => setActiveSceneIndex(0)}>
              重新回放结局剧情
            </button>
          )}
          <button type="button" className="ot-btn ui-btn ui-btn-primary" onClick={onRestartNewSeason}>
            开启新赛季 (New Season+) ➔
          </button>
        </div>
      </div>
    </div>
  );
};
