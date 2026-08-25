// ---------------------------------------------------------------------------
// First-trade review -- deliberately SMALL.
//
// The 20-factor Decision Context Matrix, Who-Was-Right, driver rankings and
// what-if scenarios all live in TradeReview360Modal. A player who just closed
// their first contract gets six things and one button, not a research terminal.
//
// Provenance is PER FIELD. Where the TradeReview record genuinely does not carry
// a number (exit-day spot, per-fill bid/ask), the field says DATA_UNAVAILABLE --
// it is never back-filled with a prettier estimate, and never covered by a single
// blanket "Source: X" line spanning fields of different origin.
//
// The trade may well have lost money. Nothing in this copy may imply that a
// different choice would have guaranteed a profit.
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';
import { money } from '../lib/format';
import { formatProvenance } from '../lib/financialLanguage';
import type { TradeReview } from '../types';

export interface FirstTradeReviewModalProps {
  review: TradeReview | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenFull360: () => void;
}

const UNAVAILABLE = 'DATA_UNAVAILABLE';

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

/** Per-field badge. DERIVED never borrows REAL's green. */
function srcClass(source: string): string {
  if (source.startsWith('REAL')) return 'ot-badge ot-badge-real';
  if (source.startsWith('DERIVED_REAL')) return 'ot-badge ot-badge-derived';
  if (source.startsWith('DERIVED')) return 'ot-badge ot-badge-derived';
  if (source === 'ESTIMATED') return 'ot-badge ot-badge-estimated';
  if (source === 'SIMULATED') return 'ot-badge ot-badge-simulated';
  if (source === 'PLAYER_INPUT') return 'ot-badge ot-badge-simulated';
  return 'ot-badge ot-badge-unavailable';
}

function Row({
  label,
  value,
  source,
  hint,
}: {
  label: string;
  value: ReactNode;
  source: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="ftr-row">
      <div className="ftr-row-left">
        <div className="ftr-row-label">{label}</div>
        <div className="ftr-row-value font-mono">
          {value}
        </div>
        {hint && (
          <div className="ftr-row-hint">
            {hint}
          </div>
        )}
      </div>
      <span className={srcClass(source)}>
        {formatProvenance(source)}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="ftr-section">
      <div className="ftr-section-title font-mono">
        {title}
      </div>
      {children}
    </div>
  );
}

export function FirstTradeReviewModal({
  review,
  isOpen,
  onClose,
  onOpenFull360,
}: FirstTradeReviewModalProps): JSX.Element | null {
  if (!isOpen || !review) return null;

  const thesis = review.entry_thesis ?? null;
  const attribution = review.attribution ?? null;
  const realized = num(review.realized_pl) ?? 0;
  const isLoss = realized < 0;

  // --- underlying ---------------------------------------------------------
  // Entry-day close is frozen in the entry snapshot. The exit-day close is NOT
  // stored anywhere on TradeReview, so the interval move cannot be computed and
  // must not be substituted with the event-attribution heuristic below.
  const entrySpot = num(review.entry_snapshot?.fundamental_context?.price);
  const eventImpact = review.event_impact ?? null;

  // --- option P&L ---------------------------------------------------------
  const entryPrice = num(review.entry_price);
  const exitPrice = num(review.exit_price);
  const qty = num(review.qty);
  const returnPct = num(review.return_pct);

  // --- theta / vega: shown only when material ------------------------------
  const theta = num(attribution?.theta);
  const vega = num(attribution?.vega);
  const scale = Math.max(Math.abs(num(attribution?.net) ?? 0), Math.abs(realized), 1);
  const material = (v: number | null): boolean =>
    v !== null && Math.abs(v) >= 1 && Math.abs(v) / scale >= 0.05;
  const thetaMaterial = material(theta);
  const vegaMaterial = material(vega);

  // --- execution ----------------------------------------------------------
  const fillPrice = num(review.entry_snapshot?.execution_context?.fill_price);
  const exitReason = str(review.exit_snapshot?.reason_for_exit);

  // --- realized vs unrealized ---------------------------------------------
  const mfe = num(review.mfe_usd);
  const mae = num(review.mae_usd);
  const neverBanked = mfe !== null ? mfe - realized : null;

  const processScore =
    typeof review.process_score === 'object' && review.process_score !== null
      ? num(review.process_score.overall_process_score)
      : num(review.process_score);

  return (
    <div className="modal-overlay ftr-overlay ui-enforced" onClick={onClose}>
      <div
        className="modal-content ftr-modal ui-modal ui-surface ui-l3"
        onClick={(e) => e.stopPropagation()}
        data-testid="first-trade-review"
      >
        <div className="modal-header ui-modal-header">
          <div>
            <div className="ot-badge ot-badge-derived">第一笔复盘 <span className="en-secondary">FIRST TRADE</span></div>
            <h2 className="ftr-title font-mono ui-title" data-level="1">{review.contract_or_symbol}</h2>
            <div className="ftr-date font-mono">
              {review.entry_date || '—'} ➔ {review.exit_date || '—'}
            </div>
          </div>
          <button className="btn-close ot-btn ot-btn-ghost ui-btn" data-variant="compact" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="ftr-body modal-body ui-modal-body">
          {/* 1. the player's own thesis ------------------------------- */}
          <Section title="① 你自己写下的 Thesis">
            {thesis ? (
              <>
                <Row label="方向 Direction" value={thesis.direction || '—'} source="PLAYER_INPUT" />
                <Row label="催化剂 Catalyst" value={thesis.catalyst || '—'} source="PLAYER_INPUT" />
                <Row
                  label="失效条件 Invalidation"
                  value={num(thesis.invalidation_level) !== null ? money(thesis.invalidation_level) : UNAVAILABLE}
                  source={num(thesis.invalidation_level) !== null ? 'PLAYER_INPUT' : UNAVAILABLE}
                />
              </>
            ) : (
              <Row
                label="Thesis"
                value="本笔没有绑定 Thesis"
                source={UNAVAILABLE}
                hint="没有开仓前记录，就没有对照。下一笔建议先写三句话再下单。"
              />
            )}
          </Section>

          {/* 2. underlying ------------------------------------------- */}
          <Section title="② 标的走势 Underlying">
            <Row
              label="开仓日收盘价"
              value={entrySpot !== null ? money(entrySpot) : UNAVAILABLE}
              source={entrySpot !== null ? 'REAL' : UNAVAILABLE}
            />
            <Row
              label="平仓日收盘价"
              value={UNAVAILABLE}
              source={UNAVAILABLE}
              hint="这笔记录未包含平仓日现货收盘价，留空且不估算。"
            />
            <Row
              label="持仓区间标的涨跌幅"
              value={UNAVAILABLE}
              source={UNAVAILABLE}
              hint="缺少平仓日现货价无法计算。坚持留空，不编造数字。"
            />
            {eventImpact && (
              <Row
                label={`关联事件归因 ${eventImpact.event_name || ''}`.trim()}
                value={
                  num(eventImpact.underlying_move) !== null
                    ? `${eventImpact.underlying_move >= 0 ? '+' : ''}${eventImpact.underlying_move.toFixed(1)}% · 窗口 ${eventImpact.window || '—'}`
                    : UNAVAILABLE
                }
                source="DERIVED_HEURISTIC"
                hint={`归因置信度 ${eventImpact.attribution_confidence || '—'}。此为事件窗口归因估计，非本持仓区间实测涨幅，亦非因果证明。`}
              />
            )}
          </Section>

          {/* 3. option P&L -------------------------------------------- */}
          <Section title="③ 期权盈亏 Option P&L">
            <Row
              label="开仓价 → 平仓价（每张合约）"
              value={
                entryPrice !== null && exitPrice !== null
                  ? `${money(entryPrice)} → ${money(exitPrice)}`
                  : UNAVAILABLE
              }
              // Option prices come from the Black-Scholes teaching model unless real
              // historical bid/ask has been loaded; options.py explicitly states they must
              // never be labeled REAL. The underlying daily close IS real -- these are not.
              source={entryPrice !== null && exitPrice !== null ? 'ESTIMATED' : UNAVAILABLE}
              hint={
                qty !== null
                  ? `${qty} 张 × 合约乘数 100（期权价为教学模型估算，非真实历史 Bid/Ask）`
                  : '期权价为教学模型估算，非真实历史 Bid/Ask'
              }
            />
            <Row
              label="已实现盈亏 Realized P&L"
              value={
                <span className={isLoss ? 'tr360-neg font-mono' : 'tr360-pos font-mono'}>
                  {money(realized)}
                  {returnPct !== null ? `　(${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%)` : ''}
                </span>
              }
              // Derived from the model-priced fills above, so it inherits their limitation.
              source="DERIVED_MODEL"
            />
          </Section>

          {/* 4. spread cost ------------------------------------------- */}
          <Section title="④ 价差成本 Spread Cost">
            <Row
              label="本笔来回的 bid/ask 价差成本"
              value={UNAVAILABLE}
              source={UNAVAILABLE}
              hint="缺乏逐笔 bid/ask 记录，暂无具体数字。但摩擦未消失：买入于 Ask、卖出于 Bid，摩擦成本已计入已实现盈亏。"
            />
          </Section>

          {/* 5. theta / vega, only if material ------------------------ */}
          <Section title="⑤ 时间价值与波动率 Theta / IV">
            {thetaMaterial || vegaMaterial ? (
              <>
                {thetaMaterial && (
                  <Row
                    label="Theta 贡献（时间价值）"
                    value={money(theta as number)}
                    source="DERIVED_MODEL"
                    hint="按定价模型分解损益，非逐笔实测。"
                  />
                )}
                {vegaMaterial && (
                  <Row
                    label="Vega 贡献（隐含波动率变化）"
                    value={money(vega as number)}
                    source="DERIVED_MODEL"
                    hint="按定价模型分解损益，非逐笔实测。"
                  />
                )}
              </>
            ) : (
              <div className="ftr-muted-note">
                本笔 Theta 与 Vega 贡献占比不足 5%，暂不展开。持仓变长或波动率剧变时它们才是主角。
              </div>
            )}
          </Section>

          {/* 6. execution --------------------------------------------- */}
          <Section title="⑥ 执行 Execution">
            <Row
              label="开仓成交价 Fill"
              value={fillPrice !== null ? money(fillPrice) : UNAVAILABLE}
              source={fillPrice !== null ? 'ESTIMATED' : UNAVAILABLE}
            />
            <Row
              label="平仓原因 Reason for Exit"
              value={exitReason ?? UNAVAILABLE}
              source={exitReason ? 'DERIVED' : UNAVAILABLE}
            />
          </Section>

          {/* 7. realized vs unrealized -------------------------------- */}
          <Section title="⑦ 已实现盈亏 vs 浮动盈亏 (Realized vs Unrealized)">
            <Row
              label="持仓期间峰值浮盈 (MFE)"
              value={mfe !== null ? money(mfe) : UNAVAILABLE}
              // MFE/MAE are floored at realized P&L (max/min against realized), so they are
              // a bound on the excursion, not a measured extremum -- and they sit on top of
              // model-priced marks. DERIVED_MODEL is the honest tag.
              source={mfe !== null ? 'DERIVED_MODEL' : UNAVAILABLE}
              hint="按持仓期模型报价折算，以已实现盈亏为下限，非逐笔实测极值。"
            />
            <Row
              label="持仓期间最深浮亏 (MAE)"
              value={mae !== null ? money(mae) : UNAVAILABLE}
              source={mae !== null ? 'DERIVED_MODEL' : UNAVAILABLE}
            />
            <Row
              label="最终已实现盈亏 (Realized P&L)"
              value={money(realized)}
              source="DERIVED_MODEL"
              hint={
                neverBanked !== null && neverBanked > 0
                  ? `最高账面浮盈比最终落袋多 ${money(neverBanked)}。那部分从未真正属于你。浮盈在平仓那刻才成已实现。`
                  : '浮盈仅为当时报价的账面数字；平仓才成已实现。'
              }
            />
          </Section>

          {/* 8. process framing -- distinct institutional visual treatment */}
          <div className="ftr-process-box">
            {isLoss ? (
              <div>
                这笔亏了。关注流程：开仓前是否写下 Thesis 及失效条件？
                行权价与到期日是否契合判断？价差与时间价值耗损几何？亏损不等于判断错误，同样，没有依据证明换个选择就必定赚钱。
              </div>
            ) : (
              <div>
                这笔赚了。关注流程：多少来自方向判断，多少归于波动率或运气？
                失效条件是否提前写清？单笔盈亏无法验证体系，赚钱的交易也可能出自坏流程。
              </div>
            )}
            {processScore !== null && (
              <div className="ftr-process-score-line">
                流程评分 Process Score：<strong className="ftr-process-score-val font-mono">{processScore.toFixed(1)} / 100</strong>
                <span className="ftr-process-independence-note">（独立于盈亏金额计算）</span>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer ui-modal-footer">
          <button
            className="ot-btn ftr-btn-open ui-btn ui-btn-primary"
            data-testid="open-full-360"
            onClick={onOpenFull360}
          >
            打开完整 360 复盘 (OPEN FULL 360 REVIEW) ▶
          </button>
        </div>
      </div>
    </div>
  );
}
