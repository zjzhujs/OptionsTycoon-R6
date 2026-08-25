import React, { useMemo, useState, type ChangeEvent } from 'react';
import { fmt } from '../lib/format';
import { formatProvenance } from '../lib/financialLanguage';
import type { OptionQuote, OptionType } from '../types';
import { Tooltip, InfoIcon } from './Tooltip';
import { OIHeatBar } from './fx/MiniViz';

export type ChainSide = 'both' | OptionType;

export interface OptionsChainPanelProps {
  quotes: OptionQuote[];
  selectedKey: string | null;
  onSelect: (quote: OptionQuote) => void;
  realOptionsLoaded?: boolean;
  side: ChainSide;
  onSideChange: (side: ChainSide) => void;
  expirations: string[];
  selectedExpiration: string;
  onExpirationChange: (expiration: string) => void;
  /** batch2 断点7/8：已建 Thesis 时聚焦 ATM±2 并给平值推荐合约光环。 */
  thesisDirection?: 'BULLISH' | 'BEARISH' | null;
  underlyingPrice?: number;
  intradaySettlementActive?: boolean;
}

const EM_DASH = '—';

function isChainSide(value: string): value is ChainSide {
  return value === 'both' || value === 'call' || value === 'put';
}

export function OptionsChainPanel({
  quotes,
  selectedKey,
  onSelect,
  realOptionsLoaded,
  side,
  onSideChange,
  expirations,
  selectedExpiration,
  onExpirationChange,
  thesisDirection = null,
  underlyingPrice,
  intradaySettlementActive = false,
}: OptionsChainPanelProps): JSX.Element {
  const handleExpirationChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    onExpirationChange(e.target.value);
  };

  const handleSideChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    if (isChainSide(value)) onSideChange(value);
  };

  // Tier-2 progressive disclosure: first paint shows the strike neighborhood that
  // is actually useful for a decision. Full depth remains one explicit click away.
  const [showFullChain, setShowFullChain] = useState(false);
  // With a thesis in hand the novice window tightens to ATM±2 (5 strikes) and
  // anchors on the true at-the-money strike; otherwise keep the ±3 default.
  const focusHalf = thesisDirection ? 2 : 3;
  const windowSize = focusHalf * 2 + 1;
  const visibleQuotes = useMemo(() => {
    if (showFullChain || quotes.length === 0) return quotes;
    const strikes = Array.from(new Set(quotes.map((q) => q.strike))).sort((a, b) => a - b);
    if (strikes.length <= windowSize) return quotes;
    const selectedStrike = quotes.find((q) => q.contract_key === selectedKey)?.strike;
    const atmIndex = underlyingPrice != null && Number.isFinite(underlyingPrice)
      ? strikes.reduce((best, s, i) => (Math.abs(s - underlyingPrice) < Math.abs(strikes[best] - underlyingPrice) ? i : best), 0)
      : Math.floor((strikes.length - 1) / 2);
    const anchorIndex = selectedStrike == null ? atmIndex : Math.max(0, strikes.indexOf(selectedStrike));
    const lo = Math.max(0, anchorIndex - focusHalf);
    const hi = Math.min(strikes.length, lo + windowSize);
    const windowSet = new Set(strikes.slice(Math.max(0, hi - windowSize), hi));
    return quotes.filter((q) => windowSet.has(q.strike));
  }, [quotes, selectedKey, showFullChain, focusHalf, windowSize, underlyingPrice]);

  // batch2 断点8：thesis 方向对应的平值合约（数据齐全者优先）拿推荐光环。
  const maxVisibleOi = useMemo(() => Math.max(0, ...visibleQuotes.map((q) => typeof q.open_interest === 'number' ? q.open_interest : 0)), [visibleQuotes]);

  const recommendedKey = useMemo(() => {
    if (!thesisDirection || underlyingPrice == null || !Number.isFinite(underlyingPrice)) return null;
    const wantType: OptionType = thesisDirection === 'BULLISH' ? 'call' : 'put';
    const candidates = quotes.filter((q) => q.type === wantType);
    if (!candidates.length) return null;
    const best = candidates.reduce((a, b) =>
      Math.abs(b.strike - underlyingPrice) < Math.abs(a.strike - underlyingPrice) ? b : a);
    return best.contract_key;
  }, [quotes, thesisDirection, underlyingPrice]);

  return (
    <div className="panel options-chain-panel ui-enforced ui-surface ui-l1" data-coach="options-chain">
      <div className="title options-chain-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="options-chain-heading-main" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>期权链 (Option Chain)</span>
          <span className={realOptionsLoaded ? 'ot-badge ot-badge-real' : 'ot-badge ot-badge-estimated'}>
            {realOptionsLoaded ? '真实行情（REAL MARKET）' : '模型定价（ESTIMATED MODEL）'}
          </span>
          <InfoIcon
            title="期权链 (Option Chain)"
            content="列出所有可行权价 (Strike) 与到期日 (Expiry) 的看涨 Call / 看跌 Put 合约的盘口报价。"
            subtext="合约乘数为 100 股。买入开仓通常以 Ask 成交，卖出平仓通常以 Bid 成交。"
          />
        </div>
        <div className="options-chain-hint" style={{ fontSize: 11, color: 'var(--muted)' }}>
          点击所在行即可选择合约
        </div>
      </div>

      {intradaySettlementActive && (
        <div className="options-chain-intraday-note ot-surface-l1" data-testid="options-chain-intraday-note">
          昨收报价 · 盘中结算以揭晓价为准
        </div>
      )}

      <div className="split options-chain-controls">
        <div>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            到期日 (Expiration)
            <InfoIcon
              title="到期日 (Expiration Date)"
              content="期权合约拥有行权效力的最后截止日期。到期后合约自动现金结算或作废。"
            />
          </label>
          <select value={selectedExpiration} onChange={handleExpirationChange}>
            {expirations.map((exp) => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center' }}>
            期权方向 (Type)
            <InfoIcon
              title="期权方向"
              content="Call 看涨期权（押注上涨）；Put 看跌期权（押注下跌）。"
            />
          </label>
          <select value={side} onChange={handleSideChange}>
            <option value="both">全部 · Call + Put</option>
            <option value="call">看涨 · Call 偏多</option>
            <option value="put">看跌 · Put 偏空</option>
          </select>
        </div>
      </div>

      <div className="options-chain-depthbar">
        <span className="ot-badge ot-badge-estimated">TIER 2 · ATM ±{focusHalf}</span>
        <span className="options-chain-depthcopy">
          {thesisDirection
            ? `已按你的 ${thesisDirection === 'BULLISH' ? '看涨' : '看跌'} Thesis 聚焦到平值附近 ${windowSize} 档。`
            : `默认收敛到 ${windowSize} 个行权价；完整矩阵仅在需要深度时展开。`}
        </span>
        {quotes.length > visibleQuotes.length ? (
          <button type="button" className="ot-btn ot-btn-secondary options-chain-depthtoggle ui-btn" data-variant="compact" onClick={() => setShowFullChain(true)}>
            展开全链 ({Array.from(new Set(quotes.map((q) => q.strike))).length} Strikes)
          </button>
        ) : showFullChain && quotes.length > 7 ? (
          <button type="button" className="ot-btn ot-btn-secondary options-chain-depthtoggle ui-btn" data-variant="compact" onClick={() => setShowFullChain(false)}>
            收起至 ATM ±{focusHalf}
          </button>
        ) : null}
      </div>

      <div className="chain chain-scroll" style={{ marginTop: 8 }}>
        <table className="ot-table ui-table">
          <thead>
            <tr>
              <th>
                <Tooltip title="合约类型与行权价" content="C 代表看涨 Call，P 代表看跌 Put，数字为行权价 (Strike Price)。">
                  <span>合约 (Strike)</span>
                </Tooltip>
              </th>
              <th>
                <Tooltip title="买入价 (Bid)" content="做市商愿意买入的价格。你若市价【卖出平仓】，按 Bid 成交。">
                  <span>买价 (Bid)</span>
                </Tooltip>
              </th>
              <th>
                <Tooltip title="卖出价 (Ask)" content="做市商愿意卖出的价格。你若市价【买入开仓】，按 Ask 成交。">
                  <span>卖价 (Ask)</span>
                </Tooltip>
              </th>
              <th>
                <Tooltip title="德尔塔 (Delta)" content="标的价格每变动 $1.00，该期权理论价格变动的金额（Call 为正，Put 为负）。">
                  <span>Δ (Delta)</span>
                </Tooltip>
              </th>
              <th>
                <Tooltip title="隐含波动率 (IV)" content="期权盘口价格所隐含的未来标的年化波动率预期。IV 越高，权利金越贵。">
                  <span>IV</span>
                </Tooltip>
              </th>
              <th><Tooltip title="持仓量 (Open Interest)" content="仅在历史链条提供真实 OI 时显示热度；缺失时明确标记无数据。"><span>OI 热度</span></Tooltip></th>
              <th>
                <Tooltip title="数据真实性" content="标注该合约报价是历史真实盘口 (REAL) 还是定价模型计算 (ESTIMATED)。">
                  <span>来源</span>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleQuotes.length === 0 ? (
              <tr className="ot-empty-state">
                <td colSpan={7} style={{ textAlign: 'center', padding: '16px' }}>
                  请选择上方到期日以加载期权链报价…
                </td>
              </tr>
            ) : (
              visibleQuotes.map((q) => {
                const contractLabel = `${q.type === 'call' ? 'C' : 'P'} ${q.strike}`;
                const deltaText = q.greeks ? q.greeks.delta.toFixed(2) : EM_DASH;
                const ivText = q.iv !== null && q.iv !== undefined ? `${Math.round(q.iv * 100)}%` : EM_DASH;
                const sourceBadgeClass = q.provenance.source_type === 'REAL' ? 'ot-badge ot-badge-real' : 'ot-badge ot-badge-estimated';
                const isSelected = q.contract_key === selectedKey;
                const isRecommended = q.contract_key === recommendedKey;
                return (
                  <tr
                    key={q.contract_key}
                    className={[isSelected ? 'selected is-selected' : '', isRecommended ? 'chain-recommended' : ''].filter(Boolean).join(' ') || undefined}
                    onClick={() => onSelect(q)}
                    style={{ cursor: 'pointer' }}
                    data-testid={isRecommended ? 'chain-recommended-row' : undefined}
                  >
                    <td>
                      <span className={`contract-badge ${q.type}`}>{contractLabel}</span>
                      {isRecommended && (
                        <span className="chain-reco-tag" title="按你的 Thesis 方向定位的平值 (ATM) 合约，仅为新手起点，不构成建议">
                          ★ 新手推荐 · 平值
                        </span>
                      )}
                    </td>
                    <td className="font-mono" data-side="bid">{fmt(q.bid)}</td>
                    <td className="font-mono" data-side="ask">{fmt(q.ask)}</td>
                    <td className="font-mono">{deltaText}</td>
                    <td className="font-mono">{ivText}</td>
                    <td className="chain-oi-cell">
                      <OIHeatBar source="optionOpenInterest" value={q.open_interest} maxValue={maxVisibleOi || null} width={72} />
                    </td>
                    <td>
                      <span
                        className={sourceBadgeClass}
                        title={formatProvenance(q.provenance.source_type)}
                      >
                        {formatProvenance(q.provenance.source_type)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
