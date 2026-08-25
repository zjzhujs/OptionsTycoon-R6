import type { ChangeEvent } from 'react';
import type { AccountType, CampaignMeta } from '../types';

export interface CampaignSelectorPanelProps {
  campaigns: CampaignMeta[];
  selectedCampaignId: string;
  onSelectCampaign: (id: string) => void;
  accountType: AccountType;
  onAccountTypeChange: (accountType: AccountType) => void;
  startCash: number;
  onStartCashChange: (value: number) => void;
  onRestart: () => void;
  accountRuleText: string;
}

const ACCOUNT_TYPES: AccountType[] = ['TFSA', 'CASH', 'MARGIN'];

export function CampaignSelectorPanel(props: CampaignSelectorPanelProps): JSX.Element {
  const {
    campaigns,
    selectedCampaignId,
    onSelectCampaign,
    accountType,
    onAccountTypeChange,
    startCash,
    onStartCashChange,
    onRestart,
    accountRuleText,
  } = props;

  const selected = campaigns.find((c) => c.id === selectedCampaignId);

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        战役与账户 <span className="en-secondary">CAMPAIGN & ACCOUNT</span>
      </div>

      <div className="campaign-field-group">
        <label className="ot-metric-label">历史战役</label>
        <select
          className="ot-select font-mono"
          value={selectedCampaignId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onSelectCampaign(e.target.value)}
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>
      {selected ? <div className="src ot-badge ot-badge-derived" style={{ marginTop: 6 }}>{selected.note}</div> : null}

      {selected && !selected.playable ? (
        <div className="warn ot-badge ot-badge-risk" style={{ marginTop: 8 }}>
          该战役目前没有完整真实行情包，为遵守“不能假”的原则，回放已禁用。
        </div>
      ) : null}

      <div className="ot-divider" />

      <div className="split">
        <div className="campaign-field-group">
          <label className="ot-metric-label">账户类型</label>
          <select
            className="ot-select font-mono"
            value={accountType}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              onAccountTypeChange(e.target.value as AccountType)
            }
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="campaign-field-group">
          <label className="ot-metric-label">初始资金</label>
          <input
            type="number"
            className="ot-input font-mono"
            value={startCash}
            min={1000}
            step={1000}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onStartCashChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button type="button" className="ot-btn ot-btn-primary" onClick={onRestart}>
          重新开始战役
        </button>
      </div>

      <div className="warn-note ot-badge ot-badge-estimated" style={{ marginTop: 8 }}>
        {accountRuleText}
      </div>
    </div>
  );
}
