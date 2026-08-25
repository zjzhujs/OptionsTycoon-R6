import React from 'react';
import type { EpisodeMeta, GameStateView } from '../types';
import { money } from '../lib/format';
import { WhatMattersTodayPanel } from './WhatMattersTodayPanel';
import { WarRoomRail } from './WarRoomRail';
import { PortfolioPulse } from './PortfolioPulse';
import { MissionTrackerPanel } from './MissionTrackerPanel';
import { FundHealthRadar } from './fx/MiniViz';
import { AppIcon } from './icons/AppIcons';

/**
 * batch2 图形化：资金五维健康雷达的归一化（0–1）。
 * 规则必须可辩护、缺数给 null 走空轴——绝不编数：
 *  流动性   = cash / NAV（现金占净值比，>1 截断）
 *  距高水位 = NAV / high_water_mark，1=回到历史高点
 *  杠杆缓冲 = 1 - 保证金占用率
 *  当日动能 = 0.5 + 当日盈亏/(10% NAV)，0.5 为中性
 *  LP 信心  = lp_confidence / 100（缺失即 null，不用假 85 兜底）
 */
function fundVitalsAxes(view: GameStateView): Array<{ label: string; value: number | null }> {
  const nav = view.equity;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const liquidity = nav > 0 ? clamp01(view.state.cash / nav) : null;
  const hwm = view.state.fund_stats?.high_water_mark;
  const navLevel = hwm && hwm > 0 && nav > 0 ? clamp01(nav / hwm) : null;
  const marginReq = view.margin_requirement;
  const leverageBuffer = nav > 0 && typeof marginReq === 'number' ? clamp01(1 - marginReq / nav) : null;
  const momentum = nav > 0 ? clamp01(0.5 + view.unrealized_pnl / (0.1 * nav)) : null;
  const lpRaw = view.state.fund_stats?.lp_confidence;
  const lp = typeof lpRaw === 'number' ? clamp01(lpRaw / 100) : null;
  return [
    { label: '流动性', value: liquidity },
    { label: '距高水位', value: navLevel },
    { label: '杠杆缓冲', value: leverageBuffer },
    { label: '当日动能', value: momentum },
    { label: 'LP信心', value: lp },
  ];
}

interface Props {
  view: GameStateView;
  episode: EpisodeMeta | null;
  visitedWarRoom: boolean;
  visitedTradingFloor: boolean;
  hasResolvedOpeningBriefing: boolean;
  onRecommendedAction: (stepId: string) => void;
  onEnterWarRoom: () => void;
  onOpenScanner: () => void;
  onOpenTradeFloor: () => void;
  onOpenPortfolio: () => void;
  onOpenIntel: () => void;
  onOpenGlossary: () => void;
  onOpenStrategyLab?: () => void;
  onOpenLpRelations: () => void;
  onNavigatePanel?: (panel: string) => void;
  onOpenWallStreet?: () => void;
  onOpenPolicyDesk?: () => void;
  onOpenMarketPulse?: () => void;
  onOpenFlowDesk?: () => void;
  onOpenHumanAction?: () => void;
  onOpenPowerLedger?: () => void;
  onOpenCapitalPower?: () => void;
  onOpenMasterclass?: () => void;
  onOpenSettings?: () => void;
  onOpenMainMenu?: () => void;
}

/**
 * Fund HQ is the campaign landing page, not a launcher wall. The first screen
 * answers location, story, fund health and the one action that matters now;
 * departments remain available behind progressive disclosure.
 */
export const FundHQPortal: React.FC<Props> = ({
  view,
  episode,
  visitedWarRoom,
  visitedTradingFloor,
  hasResolvedOpeningBriefing,
  onRecommendedAction,
  onEnterWarRoom,
  onOpenScanner,
  onOpenTradeFloor,
  onOpenPortfolio,
  onOpenIntel,
  onOpenGlossary,
  onOpenStrategyLab,
  onOpenLpRelations,
  onNavigatePanel,
  onOpenWallStreet,
  onOpenPolicyDesk,
  onOpenMarketPulse,
  onOpenFlowDesk,
  onOpenHumanAction,
  onOpenPowerLedger,
  onOpenCapitalPower,
  onOpenMasterclass,
  onOpenSettings,
  onOpenMainMenu,
}) => {
  const unreadCount = (view.pending_story_public || []).filter((event) => !event.resolved).length;
  // 权力事件走的是另一条队列（human_action_feed），此前只在折叠的导航栏里露出
  const pendingPowerEvents = (view.human_action_feed || []).filter((event) => !event.resolved).length;
  const latestStory = view.state.story_history?.[view.state.story_history.length - 1] as
    | { headline?: string; body?: string; character_id?: string }
    | undefined;
  const storyText = episode?.opening_narrative || latestStory?.body || episode?.core_conflict || '今天的市场还没有新的剧情简报。';
  const storyHeadline = latestStory?.headline || episode?.title || '晨间投研简报';
  const riskText = view.margin_call_active
    ? '紧急保证金缺口'
    : view.margin_requirement > 0
    ? money(view.margin_requirement)
    : '低';
  const actionItems = view.what_matters_today || [];

  const [showMoreDepts, setShowMoreDepts] = React.useState(false);

  const coreDepartmentButtons = [
    ['War Room', onEnterWarRoom, '🎙️ 盘前晨会'],
    ['Scanner', onOpenScanner, '🔍 机会扫描仪'],
    ['Events', onOpenHumanAction, '⚔️ 人物事件'],
    ['LP', onOpenLpRelations, '🤝 LP 出资人'],
    ['Policy', onOpenPolicyDesk, '⚖️ 政策通道'],
    ['Capital', onOpenCapitalPower, '💼 资本与团队'],
    ['StrategyLab', onOpenStrategyLab, '📖 策略研讨室'],
  ].filter(([, callback]) => Boolean(callback)) as Array<[string, (() => void) | undefined, string]>;

  const secondaryDepartmentButtons = [
    ['Flow', onOpenFlowDesk, '🌊 资金流向'],
    ['Wall Street', onOpenWallStreet, '🏛️ 投行专柜'],
    ['Pulse', onOpenMarketPulse, '📡 市场脉搏'],
    ['Glossary', onOpenGlossary, '📚 术语词典'],
    ['Masterclass', onOpenMasterclass, '🎓 交易讲堂'],
    ['Portfolio', onOpenPortfolio, '💼 持仓与风控'],
  ].filter(([, callback]) => Boolean(callback)) as Array<[string, (() => void) | undefined, string]>;

  return (
    <main className="fund-hq-container" data-testid="fund-hq">
      <section className="hq-location-bar">
        <div>
          <div className="hq-location-primary">基金总部</div>
          <div className="hq-location-secondary">FUND HQ · Dante Capital</div>
        </div>
        <div className="hq-location-actions">
          <span className="hq-clock-badge">⏸ 市场已暂停 · {view.market_clock?.current_node_date ?? ''}</span>
          {onOpenSettings && <button className="btn-menu-small" type="button" onClick={onOpenSettings}>⚙️</button>}
          {onOpenMainMenu && <button className="btn-menu-small" type="button" onClick={onOpenMainMenu}>主菜单</button>}
        </div>
      </section>

      <div className="hq-cockpit-grid">
        {/* LEFT COLUMN: Fund Vitals, Risk & Quick Departments */}
        <aside className="hq-col-left">
          <section className="hq-status-section ot-panel ot-surface-l1" data-testid="fund-status">
            <div className="ot-section-header">
              <div className="ot-section-titles">
                <span className="ot-section-zh">资金与风控</span>
                <span className="ot-section-en">FUND VITALS &amp; RISK</span>
              </div>
            </div>
            {/* batch2 图形化：五维健康雷达在数字之上先给整体印象 */}
            <div className="hq-vitals-radar" data-testid="fund-vitals-radar">
              <FundHealthRadar source="fundVitals" axes={fundVitalsAxes(view)} size={152} />
            </div>
            <div className="hq-status-grid-vert">
              <div className="ot-metric">
                <span className="ot-metric-value-lg">{money(view.equity)}</span>
                <span className="ot-metric-label">净资产 NAV</span>
              </div>
              <div className="ot-metric">
                <span className="ot-metric-value">{money(view.state.cash)}</span>
                <span className="ot-metric-label">现金 Cash</span>
              </div>
              <div className="ot-metric">
                <span className={`ot-metric-value ${view.unrealized_pnl >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>{money(view.unrealized_pnl)}</span>
                <span className="ot-metric-label">当日 P&amp;L</span>
              </div>
              <div className="ot-metric">
                <span className={`ot-metric-value ${view.margin_call_active ? 'ot-metric-delta-down' : ''}`}>{riskText}</span>
                <span className="ot-metric-label">风险 Risk</span>
              </div>
              <div className="ot-metric">
                <span className="ot-metric-value">{typeof view.state.fund_stats?.lp_confidence === 'number' ? `${view.state.fund_stats.lp_confidence.toFixed(0)}%` : '—'}</span>
                <span className="ot-metric-label">LP 信心</span>
              </div>
            </div>
          </section>

          {onOpenCapitalPower && (
            <button
              type="button"
              className="hq-capital-summary ot-surface-l1"
              onClick={onOpenCapitalPower}
              data-testid="capital-power-entry"
            >
              <span className="hq-capital-summary-title">CAPITAL &amp; POWER <b>OPEN →</b></span>
              <span><small>FUND NAV</small><strong>{money(view.equity)}</strong></span>
              <span><small>MANAGEMENT CASH</small><strong>{money(view.state.economy?.management_cash ?? view.state.management_company.cash)}</strong></span>
              <span><small>GP CASH</small><strong>{money(view.state.economy?.gp_cash ?? view.state.gp_wealth.cash)}</strong></span>
            </button>
          )}

          <section className="hq-departments-panel ot-panel">
            <div className="ot-section-header">
              <div className="ot-section-titles">
                <span className="ot-section-zh">部门通道</span>
                <span className="ot-section-en">CORE DEPARTMENTS</span>
              </div>
            </div>
            <div className="hq-quick-dept-grid">
              {coreDepartmentButtons.map(([id, callback, label]) => (
                <button key={id} type="button" className="hq-dept-btn" onClick={callback}>{label}</button>
              ))}
            </div>

            {showMoreDepts && (
              <div className="hq-secondary-dept-grid hq-quick-dept-grid" style={{ marginTop: 8, borderTop: '1px dashed var(--thm-border, #233e6b)', paddingTop: 8 }}>
                {secondaryDepartmentButtons.map(([id, callback, label]) => (
                  <button key={id} type="button" className="hq-dept-btn" onClick={callback}>{label}</button>
                ))}
              </div>
            )}

            <button
              type="button"
              className="hq-dept-toggle-btn ot-btn ot-btn-ghost"
              style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '4px 8px', color: 'var(--thm-dim, var(--muted))' }}
              onClick={() => setShowMoreDepts(!showMoreDepts)}
              data-testid="toggle-more-depts"
            >
              {showMoreDepts ? '收起更多专柜 ▴' : `更多部门与专柜 ▾ (${secondaryDepartmentButtons.length}个)`}
            </button>
          </section>
        </aside>

        {/* CENTER COLUMN: Morning Brief, Action Required, What Matters */}
        <div className="hq-col-center">
          <section className="hq-story-brief ot-panel ot-surface-l1" data-testid="morning-brief">
            <div className="ot-section-header">
              <div className="ot-section-titles">
                <span className="ot-section-zh">当前剧情 / 晨间简报</span>
                <span className="ot-section-en">CURRENT STORY / MORNING BRIEF</span>
              </div>
            </div>
            <h1>{storyHeadline}</h1>
            <p>{storyText}</p>
            <div className="hq-npc-suggestion">
              <strong>Maya Chen</strong>：先查看 {episode?.main_underlying || 'NVDA'} 最近走势，确认观点后再进入期权链。
            </div>
            {unreadCount > 0 && (
              <button type="button" className="hq-inline-link" onClick={onOpenIntel}>阅读待处理情报（{unreadCount}） →</button>
            )}
          </section>

          <section className="hq-action-section ot-panel ot-surface-l1" data-testid="action-required">
            <div className="ot-section-header">
              <div className="ot-section-titles">
                <span className="ot-section-zh">需要处理</span>
                <span className="ot-section-en">ACTION REQUIRED</span>
              </div>
            </div>
            <div className="hq-primary-action-grid">
              <button type="button" className="hq-action-card tile-tradefloor ot-btn ot-btn-primary ot-surface-l2" data-navigation-kind="NAVIGATE" onClick={onOpenTradeFloor} data-testid="tile-tradefloor">
                <span className="hq-action-icon"><AppIcon name="market" size={18} /></span>
                <span><strong>查看 {episode?.main_underlying || 'NVDA'} 最近走势</strong><small>进入市场与交易，建立 Thesis 并选择合约。</small></span>
                <span className="hq-action-arrow">→</span>
              </button>
              {pendingPowerEvents > 0 && onOpenHumanAction && (
                <button type="button" className="hq-action-card hq-action-power ot-btn ot-btn-secondary ot-surface-l2" data-navigation-kind="DECISION" onClick={onOpenHumanAction} data-testid="tile-power-events">
                  <span className="hq-action-icon"><AppIcon name="risk" size={18} /></span>
                  <span>
                    <strong>回应权力博弈事件</strong>
                    <small>{pendingPowerEvents} 件人物/机构事件等你表态——每件只能选一次，且会被人记住。</small>
                  </span>
                  <span className="hq-action-badge">{pendingPowerEvents}</span>
                  <span className="hq-action-arrow">→</span>
                </button>
              )}
              {unreadCount > 0 ? (
                <button type="button" className="hq-action-card ot-btn ot-btn-secondary ot-surface-l2" data-navigation-kind="INSPECT" onClick={onOpenIntel}>
                  <span className="hq-action-icon"><AppIcon name="intel" size={18} /></span>
                  <span><strong>处理待回应情报</strong><small>{unreadCount} 条剧情或关系事件等待你的选择。</small></span>
                  <span className="hq-action-arrow">→</span>
                </button>
              ) : (
                <button type="button" className="hq-action-card ot-btn ot-btn-secondary ot-surface-l2" data-navigation-kind="DECISION" onClick={onEnterWarRoom}>
                  <span className="hq-action-icon"><AppIcon name="hq" size={18} /></span>
                  <span><strong>参加今日晨会</strong><small>听取团队分歧，确定今天的交易方针。</small></span>
                  <span className="hq-action-arrow">→</span>
                </button>
              )}
            </div>
          </section>

          {episode && (
            <MissionTrackerPanel
              view={view}
              episodeNumber={episode.number}
              episodeTitle={episode.title}
              visitedWarRoom={visitedWarRoom}
              visitedTradingFloor={visitedTradingFloor}
              hasResolvedOpeningBriefing={hasResolvedOpeningBriefing}
              onRecommendedAction={onRecommendedAction}
            />
          )}
        </div>

        {/* RIGHT COLUMN: Context Dock (War Room Rail + Focus Stack + Portfolio Pulse + Breathing Zone) */}
        <aside className="hq-col-right hq-context-dock">
          {/* ① War Room 3-State Rail */}
          <WarRoomRail
            state={view.state as never}
            asOfDate={(view.state as { current_date?: string }).current_date
              ?? (view as { market_clock?: { current_node_date?: string } }).market_clock?.current_node_date
              ?? ''}
            pendingEvents={pendingPowerEvents}
            onOpenEvents={onOpenHumanAction}
            onOpenLedger={onOpenPowerLedger}
          />

          {/* ② Compact Focus Stack (Top 3 Glanceable Items) */}
          {actionItems.length > 0 && (
            <WhatMattersTodayPanel
              items={actionItems}
              onNavigate={onNavigatePanel}
              compact={true}
              maxCount={3}
            />
          )}

          {/* ③ Portfolio Risk Pulse / Next Catalyst */}
          <PortfolioPulse
            view={view}
            onOpenPortfolio={onOpenPortfolio}
            onOpenTradeFloor={onOpenTradeFloor}
          />

          {/* ④ Atmosphere Breathing Zone (25-35% transparent bottom) */}
          <div className="hq-breathing-zone" aria-hidden="true" />
        </aside>
      </div>
    </main>
  );
};
