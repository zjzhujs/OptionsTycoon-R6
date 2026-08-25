import React, { useState } from 'react';
import type { OptionQuote, OrderKind, OrderRequest, OrderSide, ThesisRequest } from '../types';
import { HoldConfirmButton } from './command/HoldConfirmButton';

interface Props {
  quote: OptionQuote | null;
  isOpen: boolean;
  onClose: () => void;
  onPlaceOrder: (order: OrderRequest) => Promise<void>;
  onOpenThesis: (contract: string, price: number) => void;
  attachedThesis: ThesisRequest | null;
  confirmation: {
    fillPrice: number;
    totalCost: number;
    cashBefore: number;
    cashAfter: number;
    navBefore: number;
    navAfter: number;
    side: string;
  } | null;
  orderMessage: string;
  preferredCloseSide?: 'sell_to_close' | 'buy_to_close' | null;
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export const MobileBottomSheet: React.FC<Props> = ({
  quote,
  isOpen,
  onClose,
  onPlaceOrder,
  onOpenThesis,
  attachedThesis,
  confirmation,
  orderMessage,
  preferredCloseSide = null,
}) => {
  if (!isOpen || !quote) return null;

  const [qty, setQty] = useState(1);
  const [orderKind, setOrderKind] = useState<OrderKind>('Market');
  const [limitPrice, setLimitPrice] = useState(quote.mid);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const isCall = quote.type === 'call';

  const handleOrder = async (side: OrderSide) => {
    setIsSubmitting(true);
    setHasSubmitted(true);
    try {
      await onPlaceOrder({
        side,
        type: quote.type,
        strike: quote.strike,
        expiration: quote.expiration,
        qty,
        order_kind: orderKind,
        limit_price: orderKind === 'Limit' ? Number(limitPrice) : undefined,
        thesis: attachedThesis,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mobile-sheet-overlay ui-enforced" onClick={onClose}>
      <div className="mobile-bottom-sheet order-ticket-panel ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle-bar" />

        <div className="sheet-header ot-section-header modal-header ui-modal-header">
          <div>
            <div className="ot-badge ot-badge-derived">
              {quote.underlying} {quote.type.toUpperCase()} ${quote.strike}
            </div>
            <h3 className="sheet-title ot-section-title ui-title" data-level="1">{quote.expiration} 到期合约</h3>
          </div>
          <button className="btn-sheet-close ui-btn" data-variant="compact" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body ui-modal-body">
        {/* Quotes & Greeks Grid */}
        <div className="sheet-quote-strip">
          <div className="sheet-quote-box ot-metric">
            <span className="q-label ot-metric-label">买价 Bid</span>
            <span className="q-val font-mono ot-metric-delta-up">${quote.bid.toFixed(2)}</span>
          </div>
          <div className="sheet-quote-box ot-metric">
            <span className="q-label ot-metric-label">中间价 Mid</span>
            <span className="q-val font-mono">${quote.mid.toFixed(2)}</span>
          </div>
          <div className="sheet-quote-box ot-metric">
            <span className="q-label ot-metric-label">卖价 Ask</span>
            <span className="q-val font-mono ot-metric-delta-down">${quote.ask.toFixed(2)}</span>
          </div>
        </div>

        {quote.greeks && (
          <div className="sheet-greeks-row font-mono">
            <div className="sheet-greek">Δ {quote.greeks.delta.toFixed(2)}</div>
            <div className="sheet-greek">Γ {quote.greeks.gamma.toFixed(3)}</div>
            <div className="sheet-greek">Θ {quote.greeks.theta.toFixed(2)}</div>
            <div className="sheet-greek">V {quote.greeks.vega.toFixed(2)}</div>
            {quote.iv != null && <div className="sheet-greek">IV {(quote.iv * 100).toFixed(0)}%</div>}
          </div>
        )}

        {/* Order Controls */}
        <div className="sheet-order-controls">
          <div className="sheet-control-row">
            <label className="sheet-label">合约张数 (Contracts)</label>
            <div className="qty-stepper">
              <button
                type="button"
                className="btn-qty ot-action ui-btn"
                data-variant="compact"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                -
              </button>
              <span className="qty-display font-mono">{qty}</span>
              <button
                type="button"
                className="btn-qty ot-action ui-btn"
                data-variant="compact"
                onClick={() => setQty(qty + 1)}
              >
                +
              </button>
            </div>
          </div>

          <div className="sheet-control-row">
            <label className="sheet-label">订单类型</label>
            <div className="order-kind-toggle">
              <button
                type="button"
                className={`btn-kind ot-action ui-btn ${orderKind === 'Market' ? 'active' : ''}`}
                data-variant="compact"
                aria-pressed={orderKind === 'Market'}
                onClick={() => setOrderKind('Market')}
              >
                市价 (Market)
              </button>
              <button
                type="button"
                className={`btn-kind ot-action ui-btn ${orderKind === 'Limit' ? 'active' : ''}`}
                data-variant="compact"
                aria-pressed={orderKind === 'Limit'}
                onClick={() => setOrderKind('Limit')}
              >
                限价 (Limit)
              </button>
            </div>
          </div>

          {orderKind === 'Limit' && (
            <div className="sheet-control-row">
              <label className="sheet-label">限价价格 ($)</label>
              <input
                type="number"
                step="0.05"
                value={limitPrice}
                onChange={(e) => setLimitPrice(Number(e.target.value))}
                className="sheet-input font-mono"
              />
            </div>
          )}

          {/* Thesis Attachment Button */}
          <div className="sheet-thesis-bar">
            <button
              type="button"
              className={`btn-thesis-attach ot-btn ui-btn ${attachedThesis ? 'has-thesis' : ''}`}
              data-variant="row"
              aria-pressed={Boolean(attachedThesis)}
              onClick={() => onOpenThesis(quote.contract_key, quote.mid)}
            >
              {attachedThesis
                ? `✅ 已绑定 Thesis (${attachedThesis.direction})`
                : '📝 建立开仓 Thesis (推荐)'}
            </button>
          </div>

          {hasSubmitted && confirmation ? (
            <div className="mobile-trade-confirmation ui-surface ui-l2" data-testid="mobile-trade-confirmation" role="status">
              <strong>成交确认 (TRADE CONFIRMATION)</strong>
              <div className="font-mono">成交价 {money(confirmation.fillPrice)} · 金额 {money(Math.abs(confirmation.totalCost))}</div>
              <div className="font-mono">现金 {money(confirmation.cashBefore)} → {money(confirmation.cashAfter)}</div>
              <div className="font-mono">净值 {money(confirmation.navBefore)} → {money(confirmation.navAfter)}</div>
              <button type="button" className="ot-btn ui-btn" data-variant="row" onClick={onClose}>完成</button>
            </div>
          ) : hasSubmitted && !isSubmitting ? (
            <div className="mobile-trade-rejected ui-surface ui-l2" data-testid="mobile-trade-rejected" role="alert">
              <strong>订单未成交</strong>
              <span>{orderMessage || '请检查订单条件后重试。'}</span>
            </div>
          ) : null}

          <div className="mobile-order-action-preview" data-testid="mobile-order-action-preview">
            <span className="command-kicker">ACTION PREVIEW · NO ONE-TAP TRADES</span>
            <strong className="font-mono">
              {quote.underlying} {quote.type.toUpperCase()} {quote.strike} · {quote.expiration} · ×{qty}
            </strong>
            <span>
              {orderKind === 'Limit'
                ? `限价 ${money(Number(limitPrice) || quote.mid)} · 最终成交以撮合回报为准`
                : `盘口 Bid ${money(quote.bid)} / Ask ${money(quote.ask)} · 最终成交以撮合回报为准`}
            </span>
            <small>触屏必须按住确认；松手、滑出或取消指针都会归零，不会产生订单。</small>
          </div>

          {/* Irreversible order actions use the same deliberate actuator as Five-Key.
              This closes the remaining mobile one-tap path even when the player enters
              the sheet from Options Chain instead of the decision deck. */}
          <div className="sheet-actions ot-action-grid" aria-busy={isSubmitting}>
            {preferredCloseSide ? (
              <HoldConfirmButton
                className="btn btn-action btn-buy-open ot-strategy-btn ot-primary-action ot-submit ui-btn ui-btn-primary"
                label={preferredCloseSide === 'sell_to_close' ? 'HOLD TO SELL TO CLOSE' : 'HOLD TO BUY TO CLOSE'}
                sublabel="Release to cancel · position changes only at 100%"
                testId="mobile-close-position"
                disabled={isSubmitting}
                onConfirm={() => handleOrder(preferredCloseSide)}
              />
            ) : (
              <>
                <HoldConfirmButton
                  className="btn btn-action btn-buy-open ot-strategy-btn ot-primary-action ot-submit ui-btn ui-btn-primary"
                  label="HOLD TO BUY TO OPEN"
                  sublabel={`Ask ${money(quote.ask)} · release to cancel`}
                  testId="buy-to-open"
                  disabled={isSubmitting}
                  onConfirm={() => handleOrder('buy_to_open')}
                />

                {isCall ? (
                  <HoldConfirmButton
                    className="btn btn-action btn-covered ot-action ot-strategy-btn ui-btn"
                    label="HOLD TO SELL COVERED CALL"
                    sublabel="Requires 100 unencumbered shares · release to cancel"
                    testId="mobile-covered-call"
                    disabled={isSubmitting}
                    onConfirm={() => handleOrder('sell_covered_call')}
                  />
                ) : (
                  <HoldConfirmButton
                    className="btn btn-action btn-csp ot-action ot-strategy-btn ui-btn"
                    label="HOLD TO SELL CASH-SECURED PUT"
                    sublabel={`Bid ${money(quote.bid)} · collateral required · release to cancel`}
                    testId="mobile-cash-secured-put"
                    disabled={isSubmitting}
                    onConfirm={() => handleOrder('sell_cash_secured_put')}
                  />
                )}
              </>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};
