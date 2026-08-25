import type { GameState, MarketNode, OptionType, PositionLot } from "./schemas";
import { recomputeStateFundBalanceSheet, type FundValuationMarks } from "./campaign_contract";
import { loadDailyHistory } from "./daily_history_loader";
import { model_quote } from "./engines/options";
import { checkOfflineDataCoverage, getOfflineContentPackManifest } from "./engines/offline_content_pack";

// Fallback empty data for corporate actions until real data is available.
export interface CorporateAction {
  type: "DIVIDEND" | "SPLIT" | "MERGER";
  date: string;
  ticker: string;
  amount?: number; // Dividend amount or Merger cash
  ratio?: number; // Split ratio
}

export function get_corporate_actions(ticker: string, date: string): CorporateAction[] {
  if (ticker === "ATVI" && date === "2023-10-13") {
    return [{ type: "MERGER", date: "2023-10-13", ticker: "ATVI", amount: 95 }];
  }
  return [];
}

function get_synthetic_node(underlying: string, date: string): MarketNode | null {
  const bars = loadDailyHistory(underlying, date);
  if (!bars.length) return null;
  const bar = bars[bars.length - 1];
  if (bar.date !== date) return null;
  
  const vixBars = loadDailyHistory("VIX", date);
  const vixBar = vixBars.length ? vixBars[vixBars.length - 1] : null;
  const vixClose = vixBar && vixBar.date === date ? vixBar.close : 15.0;

  return {
    date,
    underlying_bar: { date: bar.date, close: bar.close, open: bar.open ?? bar.close, high: bar.high ?? bar.close, low: bar.low ?? bar.close, volume: bar.volume ?? undefined },
    vix: { date, open: vixClose, high: vixClose, low: vixClose, close: vixClose },
    point_only: true,
    provenance: { source_type: "REAL", source_name: "synthetic_eod", source_url_or_identifier: null, confidence: "" }
  };
}

export function settle_eod_mark(state: GameState, date: string): void {
  const marks: FundValuationMarks = {};
  const lots = state.fund_balance_sheet?.position_lots ?? [];

  for (const lot of lots) {
    if (lot.qty === 0) { marks[lot.id] = 0; continue; }
    const node = get_synthetic_node(lot.underlying, date);
    if (!node) {
      const prevBars = loadDailyHistory(lot.underlying, date);
      const prevBar = prevBars.length > 0 ? prevBars[prevBars.length - 1] : null;
      if (prevBar) {
        if (lot.kind === "shares") {
          marks[lot.id] = prevBar.close;
        } else {
          const fallbackNode = get_synthetic_node(lot.underlying, prevBar.date);
          if (fallbackNode) {
            const q = model_quote(lot.origin_campaign, fallbackNode, lot.type as OptionType, lot.strike as number, lot.expiration as string);
            marks[lot.id] = lot.short ? q.ask : q.mid;
          } else {
             marks[lot.id] = lot.entry_price;
          }
        }
      } else {
         marks[lot.id] = lot.entry_price;
      }
      continue;
    }

    if (lot.kind === "shares") {
      marks[lot.id] = node.underlying_bar.close;
    } else {
      const q = model_quote(lot.origin_campaign, node, lot.type as OptionType, lot.strike as number, lot.expiration as string);
      marks[lot.id] = lot.short ? q.ask : q.mid;
    }
  }
  
  if (lots.length > 0) {
    recomputeStateFundBalanceSheet(state, date, marks);
  }
}

export function settle_corporate_actions(state: GameState, date: string): string[] {
  const logs: string[] = [];
  const bs = state.fund_balance_sheet;
  if (!bs) return [];

  const activeLots = [...bs.position_lots.filter(l => l.qty > 0)];
  
  for (const lot of activeLots) {
    const actions = get_corporate_actions(lot.underlying, date);
    for (const action of actions) {
      if (action.type === "DIVIDEND" && action.amount) {
        if (lot.kind === "shares") {
          const payout = action.amount * lot.qty;
          if (!lot.short) {
            bs.cash += payout; state.cash = bs.cash;
            bs.realized_pnl += payout; state.realized_pl = bs.realized_pnl;
            logs.push(`Dividend received for ${lot.underlying}: +$${payout}`);
          } else {
            bs.cash -= payout; state.cash = bs.cash;
            bs.realized_pnl -= payout; state.realized_pl = bs.realized_pnl;
            logs.push(`Dividend paid for short ${lot.underlying}: -$${payout}`);
          }
        }
      } else if (action.type === "SPLIT" && action.ratio) {
        if (lot.kind === "shares") {
          lot.qty *= action.ratio;
          lot.entry_price /= action.ratio;
          logs.push(`Split applied to ${lot.underlying}: ratio ${action.ratio}`);
        } else if (lot.kind === "option") {
          lot.qty *= action.ratio;
          if (lot.strike) lot.strike /= action.ratio;
          logs.push(`Options split applied to ${lot.underlying}: ratio ${action.ratio}`);
        }
      } else if (action.type === "MERGER" && action.amount) {
        if (lot.kind === "shares") {
          const payout = action.amount * lot.qty;
          if (!lot.short) {
            bs.cash += payout; state.cash = bs.cash;
            bs.realized_pnl += (action.amount - lot.entry_price) * lot.qty; state.realized_pl = bs.realized_pnl;
            logs.push(`Merger cash settlement for ${lot.underlying} shares at $${action.amount}`);
          } else {
            bs.cash -= payout; state.cash = bs.cash;
            bs.realized_pnl += (lot.entry_price - action.amount) * lot.qty; state.realized_pl = bs.realized_pnl;
            logs.push(`Merger cash settlement for short ${lot.underlying} shares at $${action.amount}`);
          }
          lot.qty = 0; 
        } else if (lot.kind === "option") {
          let intrinsic = 0;
          if (lot.type === "call" && action.amount > (lot.strike || 0)) {
            intrinsic = action.amount - (lot.strike || 0);
          } else if (lot.type === "put" && action.amount < (lot.strike || 0)) {
            intrinsic = (lot.strike || 0) - action.amount;
          }
          
          if (intrinsic > 0) {
            const payout = intrinsic * lot.qty * lot.contract_multiplier;
            if (!lot.short) {
              bs.cash += payout; state.cash = bs.cash;
              bs.realized_pnl += (intrinsic - lot.entry_price) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
              logs.push(`Merger option settlement for ${lot.underlying} ${lot.type} at intrinsic $${intrinsic}`);
            } else {
              bs.cash -= payout; state.cash = bs.cash;
              bs.realized_pnl += (lot.entry_price - intrinsic) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
              logs.push(`Merger option settlement for short ${lot.underlying} ${lot.type} at intrinsic $${intrinsic}`);
            }
          } else {
             bs.realized_pnl += (lot.short ? lot.entry_price : -lot.entry_price) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
          }
          lot.qty = 0; 
        }
      }
    }
  }

  bs.position_lots = bs.position_lots.filter(l => l.qty > 0);
  
  // Need to force recompute to update NAV after realized_pnl/cash changes
  // even if there were no mark changes. But we don't have all the marks here.
  // Actually, NAV will be recomputed downstream or we can just trigger a recompute.
  
  return logs;
}

export function settle_option_expiries(state: GameState, date: string): string[] {
  const logs: string[] = [];
  const bs = state.fund_balance_sheet;
  if (!bs) return [];

  const activeLots = [...bs.position_lots.filter(l => l.qty > 0)];
  
  for (const lot of activeLots) {
    if (lot.kind === "option" && lot.expiration && lot.expiration <= date) {
      const node = get_synthetic_node(lot.underlying, lot.expiration);
      if (!node) {
        logs.push(`carry_data_coverage: Missing underlying bar for ${lot.underlying} on ${lot.expiration}. Cannot settle option ${lot.id}.`);
        continue;
      }
      const settle_price = node.underlying_bar.close;
      
      let intrinsic = 0;
      if (lot.type === "call") {
        intrinsic = Math.max(0, settle_price - (lot.strike || 0));
      } else if (lot.type === "put") {
        intrinsic = Math.max(0, (lot.strike || 0) - settle_price);
      }
      
      const payout = intrinsic * lot.qty * lot.contract_multiplier;
      
      if (intrinsic > 0) {
        if (!lot.short) {
          bs.cash += payout; state.cash = bs.cash;
          bs.realized_pnl += (intrinsic - lot.entry_price) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
          logs.push(`Option ${lot.id} EXERCISED at intrinsic $${intrinsic}. Payout: $${payout}`);
        } else {
          bs.cash -= payout; state.cash = bs.cash;
          bs.realized_pnl += (lot.entry_price - intrinsic) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
          logs.push(`Short option ${lot.id} ASSIGNED at intrinsic $${intrinsic}. Cost: $${payout}`);
        }
      } else {
        bs.realized_pnl += (lot.short ? lot.entry_price : -lot.entry_price) * lot.qty * lot.contract_multiplier; state.realized_pl = bs.realized_pnl;
        logs.push(`Option ${lot.id} EXPIRED worthless.`);
      }
      
      lot.qty = 0;
    }
  }

  bs.position_lots = bs.position_lots.filter(l => l.qty > 0);
  return logs;
}

import { daily_financing_cost, DAILY_FINANCING_SOFR_PCT } from "./engines/margin";

export function settle_daily_accruals(state: GameState, date: string): string[] {
  const logs: string[] = [];
  const bs = state.fund_balance_sheet;
  if (!bs) return [];

  const margin_spread = 150;
  const margin_interest = daily_financing_cost(bs.margin_debt, margin_spread);
  if (margin_interest > 0) {
    bs.accrued_margin_interest += margin_interest;
    bs.cash -= margin_interest; state.cash = bs.cash;
    bs.realized_pnl -= margin_interest; state.realized_pl = bs.realized_pnl;
  }

  let borrow_notional = 0;
  for (const lot of bs.position_lots) {
    if (lot.qty > 0 && lot.kind === "shares" && lot.short) {
      borrow_notional += lot.qty * lot.entry_price; 
    }
  }
  const borrow_spread = 200;
  const borrow_fee = borrow_notional * (borrow_spread / 10000) / 365;
  if (borrow_fee > 0) {
    bs.accrued_borrow_fee += borrow_fee;
    bs.cash -= borrow_fee; state.cash = bs.cash;
    bs.realized_pnl -= borrow_fee; state.realized_pl = bs.realized_pnl;
  }

  if (bs.cash > 0) {
    const cash_interest = bs.cash * (DAILY_FINANCING_SOFR_PCT / 100) / 365;
    bs.cash += cash_interest; state.cash = bs.cash;
    bs.realized_pnl += cash_interest; state.realized_pl = bs.realized_pnl;
  }

  const management_fee = bs.nav * 0.02 / 365;
  if (management_fee > 0) {
    bs.cash -= management_fee; state.cash = bs.cash;
    bs.realized_pnl -= management_fee; state.realized_pl = bs.realized_pnl;
    
    const s = state as any;
    if (s.management_company) {
      s.management_company.cash = (s.management_company.cash || 0) + management_fee;
      s.management_company.fee_income_ytd = (s.management_company.fee_income_ytd || 0) + management_fee;
    }
    logs.push(`Management fee accrued: -$${management_fee.toFixed(2)}`);
  }

  return logs;
}

export function settle_lp_flows(state: GameState, date: string): string[] {
  const logs: string[] = [];
  const bs = state.fund_balance_sheet;
  if (!bs) return [];

  // 6. LP subscription / redemption flow
  // For now, assume a placeholder logic where we check `state.pending_lp_flows`
  const s = state as any;
  if (s.pending_lp_flows) {
    for (const flow of s.pending_lp_flows) {
      if (flow.date === date) {
        bs.cash += flow.amount; state.cash = bs.cash;
        if (flow.amount > 0) {
          logs.push(`LP Subscription: +$${flow.amount}`);
        } else {
          logs.push(`LP Redemption: -$${Math.abs(flow.amount)}`);
        }
      }
    }
    // Remove processed
    s.pending_lp_flows = s.pending_lp_flows.filter((f: any) => f.date !== date);
  }

  return logs;
}

export function check_carry_data_coverage(ticker: string, targetDate: string): boolean {
  // 8. carry_data_coverage gate
  const normalizedTicker = ticker.toLowerCase();
  const campaignId = normalizedTicker === "gme"
    ? "gme"
    : normalizedTicker === "nflx"
      ? "c5"
      : normalizedTicker === "atvi"
        ? "c8"
        : "";
  if (campaignId && getOfflineContentPackManifest(campaignId)?.carry_data_coverage?.length) {
    if (campaignId === "c5") {
      // NFLX has real underlying marks for all five dates. Option-chain/IV gates
      // remain separate and must not be inferred from the aggregate carry gate.
      return checkOfflineDataCoverage(campaignId, targetDate, ["daily_ohlcv"]);
    }
    if (campaignId === "c8") {
      // ATVI's 2023-10-13 source gap is intentional. Merger settlement on that
      // date is a deal-term action, not a market-data carry mark.
      return checkOfflineDataCoverage(campaignId, targetDate, ["daily_ohlcv"]);
    }
    // Shares need a real mark, loan balance, and an observed borrow-fee point for this date.
    // Options have a stricter contract-level gate elsewhere; aggregate evidence never pretends
    // to be a complete IV/Greeks/utilization chain.
    return checkOfflineDataCoverage(campaignId, targetDate, ["daily_ohlcv", "loan_balance", "borrow_fee"]);
  }

  // Ensure that daily_history_loader has data up to targetDate
  const bars = loadDailyHistory(ticker, targetDate);
  if (bars.length === 0) return false;
  const lastBar = bars[bars.length - 1];
  
  // If the last bar is at least near the target date (e.g. within 5 days to account for weekends/holidays)
  const lastBarTime = new Date(lastBar.date).getTime();
  const targetTime = new Date(targetDate).getTime();
  const diffDays = (targetTime - lastBarTime) / (1000 * 3600 * 24);
  
  return diffDays <= 7;
}

