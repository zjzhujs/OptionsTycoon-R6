import React, { useState } from 'react';
import type { HumanActionChoice, HumanActionEvent } from '../types';
import { audioManager } from '../lib/audio';
import { fmt } from '../lib/format';

export interface HumanActionFeedPanelProps {
  events: HumanActionEvent[];
  onResolve: (eventId: string, choiceId: string) => Promise<string>;
}

const KIND_LABELS: Record<string, string> = {
  RIVAL_POACHING: '竞对挖角',
  RIVAL_SHORT_ATTACK: '竞对做空狙击',
  EMPLOYEE_DISPUTE: '内部团队分歧',
  LP_REDEMPTION_WARNING: 'LP 赎回预警',
  JOURNALIST_INQUIRY: '媒体问询',
  LEGAL_EDGE_OFFER: 'SOURCE PROPOSAL',
  CORPORATE_INSIDER_OFFER: 'SOURCE PROPOSAL',
  COMMERCIAL_SECRET_OFFER: 'SOURCE PROPOSAL',
  CORRUPT_PROFESSIONAL_OFFER: 'SOURCE PROPOSAL',
  POLITICAL_CORRUPTION_OFFER: 'SOURCE PROPOSAL',
  MARKET_MANIPULATION_OFFER: 'ALTERNATE TIMELINE',
  MNPI_DECISION: 'MNPI DECISION',
  INVESTIGATION_ESCALATION: 'INVESTIGATION',
  WHISTLEBLOWER_EVENT: 'WHISTLEBLOWER',
};

const LEGALITY_LABELS: Record<string, string> = {
  LEGAL: '合法（LEGAL）',
  AGGRESSIVE_LAWFUL: '激进但合法（AGGRESSIVE LAWFUL）',
  MNPI_RISK: '存在MNPI风险（MNPI RISK）',
  ILLEGAL: '违法（ILLEGAL）',
};

const LEGALITY_CLASS: Record<string, string> = {
  LEGAL: 'haf-legal-legal',
  AGGRESSIVE_LAWFUL: 'haf-legal-aggressive',
  MNPI_RISK: 'haf-legal-mnpi',
  ILLEGAL: 'haf-legal-illegal',
};

const WALLET_LABELS: Record<string, string> = {
  MANAGEMENT_COMPANY: '管理公司现金',
  GP_WEALTH: 'GP 个人财富',
  FUND_CASH_MISAPPROPRIATION: '⚠ 基金资产（挪用）',
};

function rewardSummary(choice: HumanActionChoice): string {
  const rewards: string[] = [];
  if ((choice.favor_delta ?? 0) > 0) rewards.push(`关系好感度 +${choice.favor_delta}`);
  if ((choice.morale_delta ?? 0) > 0) rewards.push(`团队士气 +${choice.morale_delta}`);
  if ((choice.reputation_delta ?? 0) > 0) rewards.push(`行业声誉 +${choice.reputation_delta}`);
  if ((choice.lp_capital_delta ?? 0) > 0) rewards.push(`潜在 LP 资金 +${fmt(choice.lp_capital_delta ?? 0)}`);
  if (choice.unlocks_intel) rewards.push('解锁一条后续情报');
  return rewards.length > 0 ? rewards.join(' · ') : '无即时奖励；结果取决于后续状态变化';
}

export function HumanActionFeedPanel({ events, onResolve }: HumanActionFeedPanelProps): JSX.Element {
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const openEvents = events.filter((e) => !e.resolved);
  const resolvedEvents = events.filter((e) => e.resolved).slice(-5).reverse();

  const handleChoice = async (eventId: string, choiceId: string) => {
    setBusyEventId(eventId);
    audioManager.playSfx('ui_click');
    try {
      const msg = await onResolve(eventId, choiceId);
      setLastMessage(msg);
      setTimeout(() => setLastMessage(null), 4000);
    } finally {
      setBusyEventId(null);
    }
  };

  return (
    <div className="haf-panel ot-surface-l1">
      <div className="haf-header">
        <div className="haf-header-main">
          <h2 className="haf-title">
            <span className="haf-live-dot" />
            人物事件与金融权力博弈（HUMAN ACTION FEED）
          </h2>
          <p className="haf-desc">
            对手基金挖角、团队内部分歧、LP 赎回预警与媒体问询——每一次选择都会真实改变资金、信任与声誉，且只能选一次。
          </p>
        </div>
        <span className="haf-open-count font-mono">
          {openEvents.length} 项待处理（OPEN）
        </span>
      </div>

      {lastMessage && (
        <div className="haf-toast font-mono">
          {lastMessage}
        </div>
      )}

      {openEvents.length === 0 && (
        <div className="haf-empty">
          今日暂无待处理的人为事件。对手基金与团队内部的博弈会随剧情推进持续出现。
        </div>
      )}

      <div className="haf-list">
        {openEvents.map((ev) => (
          <div key={ev.id} className="haf-event ot-panel ot-surface-l1">
            <div className="haf-event-top">
              <div className="haf-tags">
                {ev.character_id && (
                  <div className="ot-role-card">
                    <div className="ot-avatar" />
                    <div className="ot-role-info">
                      <div className="ot-role-name font-mono">{ev.character_id}</div>
                    </div>
                  </div>
                )}
                <span className="haf-chip haf-chip-kind font-mono">
                  {KIND_LABELS[ev.action_kind] ?? ev.action_kind}
                </span>
              </div>
              <span className="haf-date font-mono">{ev.date}</span>
            </div>
            <div className="haf-headline">{ev.headline}</div>
            <div className="haf-body">{ev.body}</div>

            <div className="haf-choices">
              {ev.choices.map((c) => (
                <button
                  key={c.id}
                  disabled={busyEventId === ev.id}
                  onClick={() => handleChoice(ev.id, c.id)}
                  className="haf-choice ot-btn ot-surface-l2"
                >
                  <div className="haf-choice-top">
                    <div className="haf-choice-label">{c.label}</div>
                    {c.legality_class && c.legality_class !== 'LEGAL' && (
                      <span className={`haf-legality ${LEGALITY_CLASS[c.legality_class] ?? ''}`}>
                        {LEGALITY_LABELS[c.legality_class] ?? c.legality_class}
                      </span>
                    )}
                  </div>
                  <div className="haf-choice-contract">
                    <div className="ot-metric">
                      <div className="ot-metric-label">为什么 WHY</div>
                      <div className="ot-metric-value">回应当前人物/权力事件，明确你的立场。</div>
                    </div>
                    <div className="ot-metric">
                      <div className="ot-metric-label">成本 COST</div>
                      <div className="ot-metric-value">{c.cost_usd ? `-${fmt(c.cost_usd)}${c.wallet && WALLET_LABELS[c.wallet] ? `（${WALLET_LABELS[c.wallet]}）` : ''}` : '无直接现金成本'}</div>
                    </div>
                    <div className="ot-metric">
                      <div className="ot-metric-label">收益 REWARD</div>
                      <div className="ot-metric-value">{rewardSummary(c)}</div>
                    </div>
                    <div className="ot-metric">
                      <div className="ot-metric-label">影响 IMPACT</div>
                      <div className="ot-metric-value">{c.result_narrative || '选择后由引擎结算并写入事件结果。'}</div>
                    </div>
                  </div>
                  <div className="haf-choice-meta font-mono">
                    {c.cost_usd !== 0 && (
                      <span className="haf-down">
                        -{fmt(c.cost_usd)}
                        {c.wallet && WALLET_LABELS[c.wallet] ? ` (${WALLET_LABELS[c.wallet]})` : ''}
                      </span>
                    )}
                    {c.favor_delta !== 0 && (
                      <span className={c.favor_delta > 0 ? 'haf-up' : 'haf-down'}>
                        关系好感度 {c.favor_delta > 0 ? '+' : ''}{c.favor_delta}
                      </span>
                    )}
                    {c.reputation_delta !== 0 && (
                      <span className={c.reputation_delta > 0 ? 'haf-info' : 'haf-down'}>
                        行业声誉 {c.reputation_delta > 0 ? '+' : ''}{c.reputation_delta}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {resolvedEvents.length > 0 && (
        <div>
          <div className="haf-resolved-label font-mono">
            近期已处理事件
          </div>
          <div className="haf-resolved-list">
            {resolvedEvents.map((ev) => (
              <div key={ev.id} className="haf-resolved-item">
                <div className="haf-resolved-headline">{ev.headline}</div>
                <div className="haf-resolved-impact">{ev.impact_summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
