import React from 'react';
import type {
  FlowSummary,
  PositioningSummary,
  CounterpartyProfile,
  SourceType,
} from '../types';
import { formatProvenance } from '../lib/financialLanguage';

interface Props {
  flow?: FlowSummary | null;
  positioning?: PositioningSummary | null;
  counterparty?: CounterpartyProfile | null;
  onOpenFullDesk?: () => void;
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#10B981',
  NORMAL: '#8FA2C2',
  MODERATE: '#F59E0B',
  ELEVATED: '#F59E0B',
  HIGH: '#EF4444',
  EXTREME: '#DC2626',
};

// Provenance is colour-coded so a glance separates "measured" from "authored".
const SOURCE_COLORS: Record<string, string> = {
  REAL: '#10B981',
  REAL_PRIMARY: '#10B981',
  REAL_VENDOR: '#10B981',
  DERIVED: '#38BDF8',
  DERIVED_REAL_INPUTS: '#38BDF8',
  DERIVED_MODEL: '#F59E0B',
  DERIVED_HEURISTIC: '#F59E0B',
  ESTIMATED: '#F59E0B',
  SIMULATED: '#A855F7',
  DATA_UNAVAILABLE: '#6B7280',
};

function SourceTag({ source, note }: { source?: SourceType | string; note: string }) {
  const s = (source as string) || 'DATA_UNAVAILABLE';
  return (
    <span
      className={`msb-src ot-badge ${s.toLowerCase()}`}
      title={`${formatProvenance(s)} · ${note}`}
    >
      {formatProvenance(s)}
    </span>
  );
}

function Metric({
  title, value, source, note, caption, children,
}: {
  title: string;
  value: string | null;
  source?: SourceType | string;
  note: string;
  caption: string;
  children?: React.ReactNode;
}) {
  const unavailable = value == null;
  return (
    <div className={`msb-metric ${unavailable ? 'is-unavailable' : ''}`}>
      <div className="msb-metric-head">
        <span className="msb-key">{title}</span>
        <SourceTag source={source} note={note} />
      </div>
      <div className="msb-visual">
        {unavailable ? <span className="msb-data-na">{formatProvenance('DATA_UNAVAILABLE')}</span> : children}
      </div>
      <strong className="msb-metric-value">{value ?? formatProvenance('DATA_UNAVAILABLE')}</strong>
      <span className="msb-metric-caption">{caption}</span>
    </div>
  );
}

export const MarketStructureBrief: React.FC<Props> = ({
  flow,
  positioning,
  counterparty,
  onOpenFullDesk,
}) => {
  const crowding = positioning?.crowdedness_score ?? null;
  const pcr = flow?.put_call_ratio ?? null;
  const relVol = flow?.relative_options_vol ?? null;

  const longRisk = positioning?.trapped_long_risk ?? null;
  const shortRisk = positioning?.trapped_short_risk ?? null;
  const riskRank: Record<string, number> = {
    LOW: 0, NORMAL: 0, MODERATE: 1, ELEVATED: 1, HIGH: 2, EXTREME: 2,
  };
  const trappedLevel =
    longRisk == null && shortRisk == null
      ? null
      : Math.max(riskRank[longRisk ?? 'LOW'] ?? 0, riskRank[shortRisk ?? 'LOW'] ?? 0);

  const dealerBias = counterparty?.dealer_inventory_bias ?? null;
  const signedDealerSrc =
    counterparty?.dealer_inventory_signed_source_type ?? 'DATA_UNAVAILABLE';

  const clamp = (n: number, min = 0, max = 100) =>
    Math.min(max, Math.max(min, n));

  return (
    <div className="msb-container ot-surface-l1 ui-enforced">
      <div className="msb-header">
        <span className="msb-label ot-panel-title">市场结构速览（MARKET STRUCTURE BRIEF）</span>
        {onOpenFullDesk && (
          <button className="msb-link ot-surface-l2 ui-btn" data-variant="compact" onClick={onOpenFullDesk}>
            完整交易台（FULL DESK） ➔
          </button>
        )}
      </div>

      <div className="msb-grid msb-micro-grid">
        <Metric
          title="拥挤度" value={crowding == null ? null : crowding.toFixed(0)}
          source={positioning?.crowdedness_source_type}
          note="情景读数，非真实全市场持仓统计。"
          caption={crowding == null ? '' : crowding >= 80 ? '极端拥挤' : crowding >= 60 ? '偏拥挤' : crowding >= 40 ? '中等' : '较低'}
        >
          {crowding != null && <div className="msb-track heat"><i style={{ width: `${clamp(crowding)}%` }} /></div>}
        </Metric>

        <Metric
          title="Put / Call Ratio" value={pcr == null ? null : pcr.toFixed(2)}
          source={flow?.put_call_ratio_source_type}
          note="模型成交量推导，非实际逐笔成交统计。"
          caption={pcr == null ? '' : pcr > 1 ? 'Put 偏重' : pcr < 1 ? 'Call 偏重' : '中性'}
        >
          {pcr != null && (
            <div className="msb-axis">
              <b className="zero" />
              <i className="marker" style={{ left: `${clamp((pcr / 2) * 100)}%` }} />
            </div>
          )}
        </Metric>

        <Metric
          title="相对期权成交" value={relVol == null ? null : `${relVol.toFixed(1)}x`}
          source={flow?.relative_options_vol_source_type}
          note="模型活跃度；1.0x 为模型基准。"
          caption={relVol == null ? '' : relVol >= 2 ? '显著高于基准' : relVol >= 1.5 ? '成交升温' : '接近基准'}
        >
          {relVol != null && (
            <div className="msb-track volume">
              <b className="baseline" />
              <i style={{ width: `${clamp((relVol / 3) * 100)}%` }} />
            </div>
          )}
        </Metric>

        <Metric
          title="被套风险"
          value={trappedLevel == null ? null : `L ${longRisk ?? '—'} · S ${shortRisk ?? '—'}`}
          source={positioning?.trapped_risk_source_type}
          note="情景风险推导，不代表已确认被套仓位。"
          caption={trappedLevel == null ? '' : ['低风险', '需观察', '高风险'][trappedLevel]}
        >
          {trappedLevel != null && (
            <div className="msb-threshold">
              {[0,1,2].map((n) => <i key={n} className={n <= trappedLevel ? 'on' : ''} />)}
            </div>
          )}
        </Metric>

        <Metric
          title="Dealer Gamma Proxy" value={dealerBias}
          source={counterparty?.dealer_inventory_bias_source_type}
          note={counterparty?.dealer_inventory_note || '代理方向，不是实际做市商库存。'}
          caption={dealerBias ? '仅表达代理方向，不表达仓位幅度' : ''}
        >
          {dealerBias && (
            <div className={`msb-dealer-axis bias-${dealerBias.toLowerCase()}`}>
              <span>SHORT</span><b /><span>LONG</span>
            </div>
          )}
        </Metric>

        <Metric
          title="Signed Dealer Inventory" value={null}
          source={signedDealerSrc}
          note="没有 signed dealer inventory 数据源，禁止代理值冒充。"
          caption="无可靠方向与规模数据"
        />
      </div>

      <div className="msb-provenance">
        每个字段单独标注数据来源。这些指标描述模型读数，不指示方向，也不能归因到具体参与者。
      </div>
    </div>
  );
};
