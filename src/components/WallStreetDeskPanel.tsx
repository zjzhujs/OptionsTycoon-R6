import React, { useState } from 'react';
import type { WallStreetDesk, PlayerStreetScore, InstitutionalRelationship } from '../types';
import { fmt } from '../lib/format';
import { audioManager } from '../lib/audio';

export interface WallStreetDeskPanelProps {
  desks: WallStreetDesk[];
  playerScore?: PlayerStreetScore;
  relationships: Record<string, InstitutionalRelationship>;
  sessionId: string;
  onInteract: (bankId: string, actionId: string) => Promise<void>;
}

export function WallStreetDeskPanel({
  desks = [],
  playerScore,
  relationships = {},
  sessionId,
  onInteract,
}: WallStreetDeskPanelProps): JSX.Element {
  const [selectedBankId, setSelectedBankId] = useState<string>(desks[0]?.bank_id || 'jpmorgan');
  const [busy, setBusy] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const activeDesk = desks.find((d) => d.bank_id === selectedBankId) || desks[0];

  const handleBankAction = async (bankId: string, actionId: string) => {
    setBusy(true);
    audioManager.playSfx('ui_click');
    try {
      await onInteract(bankId, actionId);
      setFeedbackMsg(`已成功向 ${activeDesk?.bank_name || '目标机构'} 发送机构业务指令。`);
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (e: any) {
      setFeedbackMsg(`指令处理失败: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wsd-root">
      {/* Header Banner */}
      <div className="wsd-header">
        <div className="wsd-header-main">
          <div className="wsd-title-row">
            <h2 className="wsd-h2">
              <span className="wsd-dot" />
              WALL STREET INSTITUTIONAL DESK
            </h2>
            <span className="wsd-chip ot-badge ot-badge-derived font-mono">
              7 TOP TIER BANKS
            </span>
          </div>
          <p className="wsd-sub">
            顶级投资银行主经纪商 (PB) 融资利率、融券借券池、高管调研通道与独家 IPO 配售
          </p>
        </div>

        {playerScore && (
          <div className="wsd-score ot-metric">
            <div className="wsd-score-text">
              <div className="wsd-score-label ot-metric-label font-mono">Street Reputation</div>
              <div className="wsd-score-tier font-mono">{playerScore.standing_tier ? playerScore.standing_tier.replace('_', ' ') : '—'}</div>
            </div>
            <div className="wsd-score-val ot-metric-value font-mono">{playerScore.total_score != null ? playerScore.total_score.toFixed(0) : '—'}</div>
          </div>
        )}
      </div>

      {feedbackMsg && (
        <div className="wsd-feedback font-mono">
          {feedbackMsg}
        </div>
      )}

      {/* Main Grid: Left Bank List, Right Desk Detail */}
      <div className="wsd-cols">
        {/* Left Column: Bank Selection */}
        <div className="wsd-col">
          <div className="wsd-collabel font-mono">
            Global Prime Brokers
          </div>
          <div className="wsd-banklist">
            {desks.map((d) => {
              const bankId = d.bank_id || 'jpmorgan';
              const isSel = bankId === selectedBankId;
              const rel = relationships[bankId];
              const logo = d.logo || '/art/brands/jpmorgan.png';
              const tier = (d.relationship_tier || 'STANDARD').replace('_', ' ');
              return (
                <button
                  key={bankId}
                  onClick={() => {
                    setSelectedBankId(bankId);
                    audioManager.playSfx('ui_hover');
                  }}
                  className={isSel ? 'wsd-bank is-sel' : 'wsd-bank'}
                >
                  <div className="wsd-bank-left">
                    <img
                      src={logo}
                      alt={d.bank_name || 'Bank'}
                      className="wsd-bank-logo"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <div>
                      <div className="wsd-bank-name">{d.bank_name || '—'}</div>
                      <div className="wsd-bank-tier font-mono">
                        {tier}
                      </div>
                    </div>
                  </div>

                  <div className="wsd-bank-right font-mono">
                    <div className="wsd-bank-spread">+{d.financing_spread_bps ?? 150} bps</div>
                    <div className="wsd-bank-trust">Trust {rel?.trust != null ? rel.trust.toFixed(0) : 50}%</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected Bank Deep Dossier */}
        <div className="wsd-dossier">
          {activeDesk ? (
            <div className="wsd-dossier-inner">
              <div className="wsd-dossier-head">
                <div className="wsd-dossier-id">
                  <img
                    src={activeDesk.logo || '/art/brands/jpmorgan.png'}
                    alt={activeDesk.bank_name || 'Bank'}
                    className="wsd-dossier-logo"
                  />
                  <div>
                    <h3 className="wsd-dossier-name">{activeDesk.bank_name || '—'}</h3>
                    <div className="wsd-dossier-tier">
                      Tier Level: <span className="wsd-dossier-tier-val font-mono">{activeDesk.relationship_tier || 'STANDARD'}</span>
                    </div>
                    {activeDesk.rep_contact_name && (
                      <div className="wsd-dossier-rm">
                        Relationship Manager: {activeDesk.rep_contact_name}
                        {activeDesk.rep_contact_title ? `, ${activeDesk.rep_contact_title}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                <div className="wsd-dossier-flags">
                  <span className="wsd-pb ot-badge ot-badge-derived font-mono">
                    PB: {activeDesk.prime_brokerage_available ? 'ACTIVE' : 'LOCKED'}
                  </span>
                </div>
              </div>

              {activeDesk.simulated_notice && (
                <div className="wsd-notice">
                  ⚠️ {activeDesk.simulated_notice}
                </div>
              )}

              {/* Terms Grid */}
              <div className="wsd-terms font-mono">
                <div className="wsd-term ot-metric">
                  <div className="wsd-term-k ot-metric-label">SOFR Margin Spread</div>
                  <div className="wsd-term-v ot-metric-value wsd-term-gold">+{activeDesk.financing_spread_bps ?? 150} bps</div>
                </div>
                <div className="wsd-term ot-metric">
                  <div className="wsd-term-k ot-metric-label">Stock Borrow Fee</div>
                  <div className="wsd-term-v ot-metric-value wsd-term-risk">
                    {(relationships[activeDesk.bank_id]?.borrow_fee_pct ?? activeDesk.stock_borrow_fee_pct ?? 0.5).toFixed(2)}% / yr
                  </div>
                </div>
                <div className="wsd-term ot-metric">
                  <div className="wsd-term-k ot-metric-label">Corporate Access</div>
                  <div className="wsd-term-v ot-metric-value wsd-term-good">
                    {activeDesk.corporate_access_available ? 'VIP DIRECT' : 'STANDARD'}
                  </div>
                </div>
                <div className="wsd-term ot-metric">
                  <div className="wsd-term-k ot-metric-label">Research Access</div>
                  <div className="wsd-term-v ot-metric-value wsd-term-accent">
                    {(relationships[activeDesk.bank_id]?.research_access_score ?? 40).toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Available IPO & Syndicate Deals */}
              <div>
                <div className="wsd-sec-label font-mono">
                  Syndicate & IPO Allocation Pipeline
                </div>
                {activeDesk.available_ipo_deals && activeDesk.available_ipo_deals.length > 0 ? (
                  <div className="wsd-ipo-list">
                    {activeDesk.available_ipo_deals.map((deal: any) => {
                      const low = deal.expected_price_range?.[0] ?? deal.price_range_low ?? 25;
                      const high = deal.expected_price_range?.[1] ?? deal.price_range_high ?? 35;
                      const alloc = deal.max_allocation_usd ?? deal.allocation_requested_usd ?? 1000000;
                      const listingDate = deal.listing_date ?? deal.expected_date ?? '2025-03-15';
                      return (
                        <div
                          key={deal.deal_id || deal.company_name}
                          className="wsd-ipo-row"
                        >
                          <div>
                            <div className="wsd-ipo-name">
                              {deal.company_name} ({deal.ticker})
                            </div>
                            <div className="wsd-ipo-meta">
                              Expected Range: ${low} - ${high} | Date: {listingDate}
                            </div>
                          </div>
                          <div className="wsd-ipo-allocwrap">
                            <span className="wsd-ipo-alloc font-mono">
                              Alloc: {fmt(alloc)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="wsd-empty ot-empty-state font-mono">
                    当前该投行暂无开放的独家 IPO 承销额度。
                  </div>
                )}
              </div>

              {/* Bank Actions */}
              <div className="wsd-actions">
                <button
                  disabled={busy}
                  onClick={() => handleBankAction(activeDesk.bank_id, 'negotiate_margin_spread')}
                  className="ot-btn wsd-act wsd-act-blue"
                >
                  洽谈主经纪商 (PB) 降息 (-15 bps)
                </button>
                <button
                  disabled={busy}
                  onClick={() => handleBankAction(activeDesk.bank_id, 'request_hard_to_borrow_locate')}
                  className="ot-btn wsd-act wsd-act-amber"
                >
                  申请特殊融券券源 (Locate)
                </button>
                <button
                  disabled={busy}
                  onClick={() => handleBankAction(activeDesk.bank_id, 'request_analyst_teach_in')}
                  className="ot-btn wsd-act wsd-act-purple"
                >
                  安排首席半导体分析师闭门调研
                </button>
                <button
                  disabled={busy}
                  onClick={() => handleBankAction(activeDesk.bank_id, 'request_ipo_allocation')}
                  className="ot-btn wsd-act wsd-act-emerald"
                >
                  申请 IPO 承销配额 (需 Street Rating 500+)
                </button>
              </div>

              {/* Institutional Gameplay Actions */}
              <div className="wsd-inst">
                <div className="wsd-inst-label font-mono">
                  INSTITUTIONAL ACCESS — PUBLIC / LEGITIMATE
                </div>
                <div className="wsd-actions">
                  <button
                    disabled={busy}
                    onClick={() => handleBankAction(activeDesk.bank_id, 'request_research_corporate_access')}
                    className="ot-btn wsd-act wsd-act-cyan"
                  >
                    Research / Corporate Access (Trust 65+)
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleBankAction(activeDesk.bank_id, 'request_capital_introduction')}
                    className="ot-btn wsd-act wsd-act-teal"
                  >
                    Capital Introduction (Trust 70+ / Rating 450+)
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleBankAction(activeDesk.bank_id, 'accept_block_trade')}
                    className="ot-btn wsd-act wsd-act-rose"
                  >
                    Accept Block Trade (Trust 60+ / Real Position)
                  </button>
                </div>
                <div className="wsd-inst-note font-mono">
                  SIMULATED GAME RELATIONSHIP. No MNPI. Corporate Access = public / legitimate institutional access only.
                </div>
              </div>
            </div>
          ) : (
            <div className="wsd-placeholder ot-empty-state font-mono">选择左侧投行查看详情</div>
          )}
        </div>
      </div>
    </div>
  );
}
