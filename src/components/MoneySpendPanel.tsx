import React from 'react';
import economyCopy from '../engine/data/economy_copy/economy_ui_copy.json';
import intelCopy from '../engine/data/economy_copy/intel_copy.json';
import type { EconomyState, FundStats, IntelState, IntelTier } from '../types';
import { money } from '../lib/format';
import {
  HexFactorCard,
  NetConstellation,
  PulseWave,
  RiskFan,
  TankGauge,
  TrustBars,
  VizMetricCard,
} from './CppGauges';

type TierCopy = (typeof intelCopy.subscription_tiers)[number];

export interface MoneySpendPanelProps {
  fundNav: number;
  economy: EconomyState;
  intel: IntelState;
  fundStats?: FundStats;
  busy?: boolean;
  onSubscribeIntel: (tier: IntelTier, shadowEnabled: boolean) => Promise<void>;
}

const tierCharge = (tier: TierCopy, cold: boolean): number => {
  const elite = intelCopy.subscription_tiers.find((item) => item.tier_id === 'ELITE')?.monthly_cost ?? 0;
  const recurring = tier.tier_id === 'SHADOW' ? elite + tier.monthly_cost : tier.monthly_cost;
  return recurring + (cold && tier.tier_id !== 'OFF' ? 200 : 0);
};

export function MoneySpendPanel({ fundNav, economy, intel, fundStats, busy = false, onSubscribeIntel }: MoneySpendPanelProps): JSX.Element {
  const selectTier = async (tier: TierCopy) => {
    if (tier.tier_id === 'SHADOW') await onSubscribeIntel('ELITE', true);
    else await onSubscribeIntel(tier.tier_id as IntelTier, false);
  };

  const metric = (value: number | null | undefined): number | null =>
    Number.isFinite(value) ? (value as number) : null;
  const infoNetwork = metric(intel.info_network);
  const complianceRisk = metric(fundStats?.compliance_risk);
  const politicalCapital = metric(fundStats?.political_capital);
  const counterpartyTrust = metric(fundStats?.counterparty_trust);
  const staffMorale = metric(fundStats?.staff_morale);

  return (
    <section className="money-spend" data-testid="money-spend-panel">
      <div className="money-wallets" aria-label="Three isolated wallets">
        {economyCopy.three_wallets.map((wallet) => {
          const balance = wallet.wallet_id === 'FUND_NAV'
            ? fundNav
            : wallet.wallet_id === 'MANAGEMENT_CASH'
              ? economy.management_cash
              : economy.gp_cash;
          return (
            <article className="money-wallet ui-surface ui-l1" key={wallet.wallet_id}>
              <span>{wallet.name_cn}</span>
              <strong className="font-mono">{money(balance)}</strong>
              <small>{wallet.short_desc}</small>
            </article>
          );
        })}
      </div>

      <header className="money-spend-head">
        <div>
          <h3>INTELLIGENCE NETWORK</h3>
          <p>{economyCopy.spend_card_five_elements.section_title}</p>
        </div>
      </header>

      <div className="cpp-info-network-grid" data-testid="cpp-info-network-grid" aria-label="Capital and power information network">
        <VizMetricCard
          label="INFO NETWORK"
          value={infoNetwork}
          tone={intel.network_cold ? 'amber' : 'cyan'}
          sub={`${intel.status} / TARGET ${intel.target}`}
        >
          <NetConstellation value={infoNetwork} />
        </VizMetricCard>
        <VizMetricCard
          label="COMPLIANCE RISK"
          value={complianceRisk}
          tone={complianceRisk == null ? 'red' : complianceRisk >= 60 ? 'red' : complianceRisk >= 30 ? 'amber' : 'cyan'}
          sub="LOWER IS CLEANER"
        >
          <RiskFan value={complianceRisk} />
        </VizMetricCard>
        <VizMetricCard
          label="POLITICAL CAPITAL"
          value={politicalCapital}
          tone={politicalCapital != null && politicalCapital < 30 ? 'amber' : 'cyan'}
          sub="ACCESS RESERVE"
        >
          <TankGauge value={politicalCapital} />
        </VizMetricCard>
        <VizMetricCard
          label="COUNTERPARTY TRUST"
          value={counterpartyTrust}
          tone={counterpartyTrust != null && counterpartyTrust < 35 ? 'red' : counterpartyTrust != null && counterpartyTrust < 60 ? 'amber' : 'cyan'}
          sub="MARKET ACCESS"
        >
          <TrustBars value={counterpartyTrust} />
        </VizMetricCard>
        <VizMetricCard
          label="STAFF MORALE"
          value={staffMorale}
          tone={staffMorale != null && staffMorale < 30 ? 'red' : staffMorale != null && staffMorale < 50 ? 'amber' : 'cyan'}
          sub="TEAM CAPACITY"
        >
          <PulseWave value={staffMorale} />
        </VizMetricCard>
      </div>

      <div className="cpp-five-grid">
        {intelCopy.subscription_tiers.map((tier) => {
          const charge = tierCharge(tier, intel.network_cold);
          const recurring = tier.tier_id === 'SHADOW'
            ? (intelCopy.subscription_tiers.find((item) => item.tier_id === 'ELITE')?.monthly_cost ?? 0) + tier.monthly_cost
            : tier.monthly_cost;
          const selected = tier.tier_id === 'SHADOW'
            ? intel.tier === 'ELITE' && intel.shadow_enabled
            : intel.tier === tier.tier_id && !intel.shadow_enabled;
          const insufficient = charge > economy.management_cash;
          const tierScore = Number.isFinite(tier.info_target) ? tier.info_target : null;
          const riskSummary = tier.tier_id === 'SHADOW'
            ? 'MNPI / HIGH RISK'
            : tier.tier_id === 'OFF'
              ? 'PUBLIC ONLY'
              : 'COMPLIANT / REVIEW';
          return (
            <article className={`money-spend-card ui-surface ${selected ? 'ui-l2 is-selected' : 'ui-l1'}`} key={tier.tier_id} data-testid={`hex-factor-card-${tier.tier_id.toLowerCase()}`}>
              <HexFactorCard
                label={tier.tier_id}
                score={tierScore}
                status={selected ? `${intel.status} / ACTIVE` : tier.tier_id === 'OFF' ? 'BASELINE' : 'AVAILABLE'}
                monthly={`${money(recurring)} / MO`}
                risk={riskSummary}
                tone={tier.tier_id === 'SHADOW' ? 'red' : tier.tier_id === 'OFF' ? 'amber' : 'cyan'}
                available={tierScore != null}
              />
              <div className="cpp-factor-compact font-mono">
                <span><b>SOURCE</b> MANAGEMENT CASH</span>
                <span aria-hidden="true"> · </span>
                <span><b>NOW</b> {money(charge)}</span>
                <span aria-hidden="true"> · </span>
                <span><b>AFTER</b> {money(economy.management_cash - charge)}</span>
              </div>
              <details className="cpp-factor-details">
                <summary>DETAILS / LONGFORM</summary>
              <div className="money-spend-card-title">
                <div><strong>{tier.name_cn}</strong><span>{tier.name_en}</span></div>
                <b className="font-mono">{money(recurring)} / MONTH</b>
              </div>
              <p>{tier.summary_pitch}</p>
              <dl className="money-five-elements cpp-spend-specs">
                <div className="cpp-spend-spec" data-field="source"><dt className="cpp-spend-label">SOURCE</dt><dd className="cpp-spend-value">MANAGEMENT CASH</dd></div>
                <div className="cpp-spend-spec" data-field="now"><dt className="cpp-spend-label">NOW</dt><dd className="cpp-spend-value">{money(charge)}</dd></div>
                <div className="cpp-spend-spec" data-field="recurring"><dt className="cpp-spend-label">RECURRING</dt><dd className="cpp-spend-value">{money(recurring)} / MONTH</dd></div>
                <div className="cpp-spend-spec" data-field="risk"><dt className="cpp-spend-label">RISK / MNPI</dt><dd className="cpp-spend-value">{tier.risk_note}</dd></div>
                <div className="cpp-spend-spec" data-field="audit"><dt className="cpp-spend-label">AUDIT TRAIL</dt><dd className="cpp-spend-value">Subscription, charge, interruption, and recovery are recorded in the immutable ledger.</dd></div>
              </dl>
              </details>
              <div className="money-spend-card-foot">
                <span className="font-mono">AFTER {money(economy.management_cash - charge)}</span>
                <button
                  type="button"
                  className="ui-btn ui-btn-primary"
                  aria-pressed={selected}
                  disabled={busy || insufficient || selected}
                  onClick={() => void selectTier(tier)}
                >
                  {selected ? 'ACTIVE' : insufficient ? 'INSUFFICIENT' : 'PROCEED'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
