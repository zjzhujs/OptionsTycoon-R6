import type { ChangeEvent } from 'react';
import type { OrderKind } from '../types';
import { Tooltip, InfoIcon } from './Tooltip';
import { HoldConfirmButton } from './command/HoldConfirmButton';

export interface OrderTicketPanelProps {
  selectedContractLabel: string;
  qty: number;
  onQtyChange: (qty: number) => void;
  orderKind: OrderKind;
  onOrderKindChange: (kind: OrderKind) => void;
  limitPrice: number | null;
  onLimitPriceChange: (price: number | null) => void;
  onBuyToOpen: () => void;
  onSellToClose: () => void;
  onBuyToClose: () => void;
  onWriteCoveredCall: () => void;
  onWriteCashSecuredPut: () => void;
  onBuyShares: () => void;
  onSellShares: () => void;
  onVerticalSpread?: () => void;
  onStraddle?: () => void;
  shareButtonsDisabled: boolean;
  writeButtonsDisabled: boolean;
  shareButtonLabel: string;
  warningText: string;
  tradeFlashActive?: boolean;
  onOpenThesis?: () => void;
  hasThesis?: boolean;
  submitting?: boolean;
  openingBlocked?: boolean;
  /** A compact, always-visible position strip for the mobile trading loop. */
  openPositions?: ReadonlyArray<{
    type: string;
    strike: number;
    expiration: string;
    qty: number;
    is_short?: boolean;
    short?: boolean;
  }>;
  /** Close actions are contract-specific; never submit a known-empty close. */
  sellToCloseDisabled?: boolean;
  buyToCloseDisabled?: boolean;
}

function isOrderKind(value: string): value is OrderKind {
  return value === 'Market' || value === 'Limit';
}

export function OrderTicketPanel({
  selectedContractLabel,
  qty,
  onQtyChange,
  orderKind,
  onOrderKindChange,
  limitPrice,
  onLimitPriceChange,
  onBuyToOpen,
  onSellToClose,
  onBuyToClose,
  onWriteCoveredCall,
  onWriteCashSecuredPut,
  onBuyShares,
  onSellShares,
  onVerticalSpread,
  onStraddle,
  shareButtonsDisabled,
  writeButtonsDisabled,
  shareButtonLabel,
  warningText,
  tradeFlashActive,
  onOpenThesis,
  hasThesis,
  submitting = false,
  openingBlocked = false,
  openPositions,
  sellToCloseDisabled = false,
  buyToCloseDisabled = false,
}: OrderTicketPanelProps): JSX.Element {
  const handleQtyChange = (e: ChangeEvent<HTMLInputElement>): void => {
    onQtyChange(Number(e.target.value));
  };

  const handleOrderKindChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value;
    if (isOrderKind(value)) onOrderKindChange(value);
  };

  const handleLimitPriceChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value;
    if (raw === '') {
      onLimitPriceChange(null);
      return;
    }
    const parsed = parseFloat(raw);
    onLimitPriceChange(Number.isNaN(parsed) ? null : parsed);
  };

  return (
    <div className="panel order-ticket-panel ui-enforced ui-surface ui-l1" data-testid="order-ticket-panel">
      <div className="title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>交易订单台 (Order Ticket)</span>
          <InfoIcon
            title="交易订单台 (Order Ticket)"
            content="选择方向与类型，将观点转化为实际敞口。"
            subtext="建议新手从【买入开仓 (Buy to Open)】开始，亏损下限锁死在权利金。"
          />
        </div>
        {hasThesis && <span className="badge good">THESIS 已绑定</span>}
      </div>

      <div className="split">
        <div className="ot-metric">
          <label style={{ display: 'flex', alignItems: 'center' }}>
            已选合约 (Contract)
            <InfoIcon
              title="已选标的 / 合约"
              content="当前点选的标的、方向、行权价与到期日。"
            />
          </label>
          <input type="text" readOnly value={selectedContractLabel} className="font-mono" />
        </div>
        <div className="ot-metric">
          <label style={{ display: 'flex', alignItems: 'center' }}>
            合约张数 (Contracts)
            <InfoIcon
              title="合约张数 (Contracts)"
              content="1 张美式期权对应 100 股正股。建议从 1 张开始。"
            />
          </label>
          <input type="number" min={1} value={qty} onChange={handleQtyChange} />
        </div>
      </div>

      <div className="split">
        <div className="ot-metric">
          <label style={{ display: 'flex', alignItems: 'center' }}>
            订单类型 (Order Type)
            <InfoIcon
              title="订单类型"
              content="市价单：按做市商最优盘口成交。限价单：指定价位等待撮合。"
            />
          </label>
          <select value={orderKind} onChange={handleOrderKindChange}>
            <option value="Market">市价单 (Market Order)</option>
            <option value="Limit">限价单 (Limit Order)</option>
          </select>
        </div>
        <div className="ot-metric">
          <label style={{ display: 'flex', alignItems: 'center' }}>
            限价 (Limit Price)
          </label>
          <input
            type="number"
            step={0.01}
            value={limitPrice === null ? '' : limitPrice}
            disabled={orderKind === 'Market'}
            placeholder={orderKind === 'Market' ? '按市价 Ask/Bid 撮合' : '输入限价…'}
            onChange={handleLimitPriceChange}
          />
        </div>
      </div>

      {openPositions && (
        <div className="ot-position-summary" data-testid="mobile-position-summary" aria-label="当前期权持仓">
          <div className="ot-position-summary-head">
            <span>当前期权持仓</span>
            <span className="en-secondary">POSITION MANAGEMENT</span>
          </div>
          {openPositions.length > 0 ? openPositions.map((position) => (
            <div className="ot-position-summary-row" key={`${position.type}-${position.strike}-${position.expiration}`}>
              <span className="font-mono">
                {position.is_short || position.short ? 'SHORT' : 'LONG'} {position.type.toUpperCase()} {position.strike} · {position.expiration}
              </span>
              <strong>{position.qty} 张</strong>
            </div>
          )) : (
            <span className="ot-position-summary-empty">暂无期权持仓；选择合约后可买入开仓。</span>
          )}
        </div>
      )}

      {(sellToCloseDisabled || buyToCloseDisabled) && (
        <div className="ot-close-availability-note" role="status">
          No matching close position for the selected contract.
        </div>
      )}

      {/* Irreversible actions share one deliberate actuator contract.
          Mouse/keyboard remain explicit single-click; touch/pen must hold to 100%.
          This prevents the mobile main-flow Order Ticket from bypassing the
          Five-Key / MobileBottomSheet confirmation boundary. */}
      <div className="order-ticket-action-preview" data-testid="order-ticket-action-preview">
        <span className="command-kicker">EXECUTION GATE · NO ONE-TAP TOUCH ORDERS</span>
        <strong className="font-mono">{selectedContractLabel || 'SELECT A CONTRACT'}</strong>
        <small>{orderKind === 'Limit' ? `LIMIT ${limitPrice ?? '—'} · ×${qty}` : `MARKET · ×${qty}`} · touch: hold to confirm · release to cancel</small>
      </div>

      <div className="ot-action-grid">
        <Tooltip title="买入开仓 (Buy to Open)" content="买入多头，付出权利金。亏损有限，无保证金要求。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-strategy-btn ot-primary-action btn-trade-action ot-submit ui-btn ui-btn-primary"
            label="BUY TO OPEN"
            sublabel="Touch: hold to confirm · release to cancel"
            testId="buy-to-open"
            disabled={submitting || openingBlocked}
            onConfirm={onBuyToOpen}
          />
        </Tooltip>

        <Tooltip title="卖出平仓 (Sell to Close)" content="平掉手上的多头期权，锁定盈亏并解除敞口（非做空）。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ot-strategy-btn btn-trade-action ui-btn"
            label="SELL TO CLOSE"
            sublabel={sellToCloseDisabled ? 'No matching long position' : 'Close long exposure · touch hold'}
            testId="sell-to-close"
            disabled={submitting || sellToCloseDisabled}
            onConfirm={onSellToClose}
          />
        </Tooltip>

        <Tooltip title="买入平仓 (Buy to Close)" content="买入期权，平掉之前的卖空仓位。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ot-strategy-btn ui-btn"
            label="BUY TO CLOSE"
            sublabel={buyToCloseDisabled ? 'No matching short position' : 'Cover short exposure · touch hold'}
            disabled={submitting || buyToCloseDisabled}
            onConfirm={onBuyToClose}
          />
        </Tooltip>

        <Tooltip title="备兑看涨期权 (Covered Call)" content="持 100 股正股并卖出 Call，赚取权利金，放弃行权价以上的涨幅。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ot-strategy-btn ui-btn"
            label="SELL COVERED CALL"
            sublabel="Requires 100 unencumbered shares · touch hold"
            disabled={writeButtonsDisabled || submitting || openingBlocked}
            onConfirm={onWriteCoveredCall}
          />
        </Tooltip>

        <Tooltip title="现金担保看跌期权 (Cash-Secured Put)" content="全额锁定现金并卖出 Put。若跌破行权价，按该价格接盘正股。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ot-strategy-btn ui-btn"
            label="SELL CASH-SECURED PUT"
            sublabel="Collateral required · touch hold"
            disabled={writeButtonsDisabled || submitting || openingBlocked}
            onConfirm={onWriteCashSecuredPut}
          />
        </Tooltip>
      </div>

      <div className="btnrow" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
        {onOpenThesis && (
          <Tooltip title="建立投资逻辑 (Thesis)" content="记录方向、催化剂与失效条件。平仓后作复盘对照。" placement="top">
            <button
              className="ot-btn ui-btn"
              data-variant="row"
              data-coach="thesis-open"
              data-testid="thesis-open"
              style={{
                borderColor: hasThesis ? 'var(--green)' : 'var(--cyan)',
                color: hasThesis ? 'var(--green)' : 'var(--cyan)',
                fontWeight: 600,
              }}
              onClick={onOpenThesis}
              disabled={submitting}
            >
              {hasThesis ? '✅ 已绑定投资逻辑 (Thesis)' : '📝 建立开仓 Thesis'}
            </button>
          </Tooltip>
        )}
        <Tooltip title="直接买入正股" content="直接按市价买入 100 股底层标的股票。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ui-btn"
            label={`BUY 100 ${shareButtonLabel}`}
            sublabel="Touch: hold to confirm"
            disabled={shareButtonsDisabled || submitting || openingBlocked}
            onConfirm={onBuyShares}
          />
        </Tooltip>
        <Tooltip title="直接卖出正股" content="卖出手上持有的 100 股标的股票。" placement="top">
          <HoldConfirmButton
            className="ot-btn ot-action ui-btn"
            label={`SELL 100 ${shareButtonLabel}`}
            sublabel="Touch: hold to confirm"
            disabled={shareButtonsDisabled || submitting}
            onConfirm={onSellShares}
          />
        </Tooltip>
      </div>

      {(onVerticalSpread || onStraddle) && (
        <div className="btnrow" style={{ marginTop: 8, flexWrap: 'wrap', gap: 6 }}>
          {onVerticalSpread && <HoldConfirmButton
            className="ot-btn ot-action ui-btn"
            label="VERTICAL SPREAD"
            sublabel="Validate both legs · touch hold"
            testId="vertical-spread"
            disabled={submitting || openingBlocked}
            onConfirm={onVerticalSpread}
          />}
          {onStraddle && <HoldConfirmButton
            className="ot-btn ot-action ui-btn"
            label="LONG STRADDLE"
            sublabel="Two-leg opening risk · touch hold"
            testId="straddle"
            disabled={submitting || openingBlocked}
            onConfirm={onStraddle}
          />}
        </div>
      )}
      {openingBlocked && (
        <div className="src warning-bar thesis-gate-message" style={{ marginTop: 8 }}>
          请先完成必修简报并建立 Thesis / Resolve the mandatory briefing and create a thesis before opening risk.
        </div>
      )}
      {warningText && <div className={`src warning-bar${tradeFlashActive ? ' v28-trade-flash' : ''}`} style={{ marginTop: 8 }}>{warningText}</div>}
    </div>
  );
}
