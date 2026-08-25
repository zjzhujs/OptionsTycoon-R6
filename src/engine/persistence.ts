/** Save-game persistence, ported from backend/app/persistence.py.
 * The Python original is a dependency-free sqlite3 key-value store, one row per
 * save slot. The browser has no filesystem, so this uses localStorage as the
 * equivalent flat key-value store: one JSON blob per slot under a fixed prefix,
 * with the same denormalized metadata (campaign_id/game_date/equity/updated_at)
 * kept alongside the full state payload so slot listings don't need to
 * deserialize every payload's positions/trade_reviews/etc. */
import type { GameState, SaveSlotInfo } from "./schemas";
import { createCampaignArcState, createEmptyFundBalanceSheet, legacyPositionLots, positionToLot } from "./campaign_contract";
import { ECONOMY_SCHEMA_VERSION, createEconomyState, ensureEconomyState } from "./engines/economy_core";
import { createIntelState } from "./engines/economy_intel";
import { ensureQuantInfra } from "./engines/economy_quant";
import { new_id } from "./ids";

const KEY_PREFIX = "optionstycoon_save_";

/**
 * 存档 schema 版本（2026-08-19 claude）
 *
 * 此前存档**没有版本号**，也就没有迁移的落脚点：将来加一个字段，
 * 老存档要么崩、要么静默读出 undefined 然后在某个远处炸掉。
 * harv 把这条列为"现在必须还"的债——素材/新字段接进来之后再补会变成横向返工。
 *
 * 约定：
 *   · **只在存档结构真的变了时 +1**，不跟游戏版本号走
 *   · 每加一版，在 `migrate()` 里补一段，并且**只做加法**
 *     （补默认值、改字段名），不删玩家数据
 *   · 读不出版本号的一律当 v1（那是加版本号之前的所有存档）
 */
export const SAVE_SCHEMA_VERSION = 4;

interface SaveRow {
  /** v1 的存档没有这个字段，读出来是 undefined —— 见 migrate() */
  schema_version?: number;
  slot: string;
  campaign_id: string;
  game_date: string;
  equity: number;
  updated_at: string;
  payload: GameState;
}

/**
 * 把老存档抬到当前 schema。
 *
 * **原则：只加不减。** 玩家的存档是他自己的时间，
 * 迁移出错宁可留着用不上的旧字段，也不能丢东西。
 */
function migrate(row: SaveRow): SaveRow {
  const from = row.schema_version ?? 1;
  if (from >= SAVE_SCHEMA_VERSION) return row;

  const payload = row.payload ?? ({} as GameState);

  // v1 → v2：补 nav_history。
  // 老存档没有净值历史，也**无法从当天的状态倒推**（历史持仓已经不在了）。
  // 所以给一个只含"此刻"的单点序列：曲线从今天开始长，
  // 而不是伪造一条看起来玩过很久的假曲线。
  if (from < 2) {
    const anyPayload = payload as GameState & { nav_history?: Array<{ d: number; v: number }> };
    if (!Array.isArray(anyPayload.nav_history)) {
      const d = payload.game_day_index ?? 0;
      anyPayload.nav_history = Number.isFinite(row.equity) ? [{ d, v: row.equity }] : [];
    }
  }

  // v2 → v3：补 P1 canonical ledger / Career Clock contract.
  // No future prices or progress are invented here. The valuation fields are
  // explicitly marked stale and are recomputed on the first game view.
  if (from < 3) {
    const campaignId = payload.campaign_id ?? row.campaign_id ?? "r1";
    const positionLots = legacyPositionLots(payload);
    const existingLedger = payload.fund_balance_sheet ?? createEmptyFundBalanceSheet(payload.cash ?? 0, row.game_date);
    const costBasis = positionLots.reduce(
      (sum, lot) => sum + Math.abs(lot.entry_price) * Math.abs(lot.qty) * (lot.contract_multiplier ?? (lot.kind === "option" ? 100 : 1)),
      0,
    );
    payload.positions = (payload.positions ?? []).map((position) => positionToLot(position, campaignId));
    payload.fund_balance_sheet = {
      ...existingLedger,
      valuation_at: row.game_date || existingLedger.valuation_at,
      cash: Number.isFinite(payload.cash) ? payload.cash : existingLedger.cash,
      realized_pnl: Number.isFinite(payload.realized_pl) ? payload.realized_pl : existingLedger.realized_pnl,
      margin_debt: Number.isFinite(payload.margin_debt) ? payload.margin_debt : existingLedger.margin_debt,
      position_lots: positionLots,
      nav: Number.isFinite(row.equity) ? row.equity : existingLedger.nav,
      unrealized_pnl: Number.isFinite(existingLedger.unrealized_pnl) ? existingLedger.unrealized_pnl : 0,
      cost_basis: costBasis,
      valuation_cache_valid: false,
    };
    payload.career_clock ??= {
      current_at: row.game_date || payload.fund_balance_sheet.valuation_at,
      event_cursor: null,
      transition_cursor: null,
      last_advance_at: null,
    };
    payload.campaign_progress ??= {
      [campaignId]: createCampaignArcState("ACTIVE_FOCUS"),
    };
    payload.active_campaign_ids ??= Object.entries(payload.campaign_progress)
      .filter(([, arc]) => arc.status === "ACTIVE_FOCUS" || arc.status === "ACTIVE_DORMANT")
      .map(([id]) => id);
    payload.spotlight_campaign_id ??= payload.active_campaign_ids[0] ?? campaignId;
    payload.applied_transition_ids ??= [];
  }

  // v3 -> v4: canonical three-wallet economy and intelligence network.
  // Legacy balances are untrusted: the new system always starts at its
  // designed opening balances, while the discarded values remain auditable.
  if (from < 4) {
    const economyManagementCash = Number(payload.economy?.management_cash);
    const economyGpCash = Number(payload.economy?.gp_cash);
    const managementCash = Number.isFinite(economyManagementCash)
      ? economyManagementCash
      : Number(payload.management_company?.cash);
    const gpCash = Number.isFinite(economyGpCash) ? economyGpCash : Number(payload.gp_wealth?.cash);
    const legacyManagement = Number.isFinite(managementCash) ? String(managementCash) : "UNSET";
    const legacyGp = Number.isFinite(gpCash) ? String(gpCash) : "UNSET";
    const resetDate = row.game_date || payload.updated_at?.slice(0, 10) || "MIGRATION";
    const resetDetail = `MIGRATION_RESET legacy management_cash=${legacyManagement}, gp_cash=${legacyGp}; reset to management_cash=12000, gp_cash=6000`;
    const economy = payload.economy ?? createEconomyState(payload.start_cash);
    economy.management_cash = 12_000;
    economy.gp_cash = 6_000;
    economy.schema_version = ECONOMY_SCHEMA_VERSION;
    economy.transfer_ledger ??= [];
    economy.settlement_ledger ??= [];
    economy.transfer_ledger.push({
      id: new_id(),
      date: resetDate,
      from_wallet: 'MANAGEMENT_CASH',
      to_wallet: 'MANAGEMENT_CASH',
      amount: 0,
      reason: resetDetail,
      kind: 'MIGRATION_RESET',
    });
    payload.economy = economy;
    payload.intel ??= createIntelState(payload.story_seed);
    payload.evidence_ledger ??= [];
    payload.mnpi_flags ??= [];
    payload.bribery_flags ??= [];
    payload.audit_trail ??= [];
    payload.audit_trail.push({
      id: new_id(),
      date: resetDate,
      action: 'MIGRATION_RESET',
      wallet: 'NONE',
      amount: 0,
      detail: resetDetail,
    });
    if (payload.management_company) delete payload.management_company.cash;
    if (payload.gp_wealth) delete payload.gp_wealth.cash;
  }

  return { ...row, schema_version: SAVE_SCHEMA_VERSION, payload };
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function slot_key(slot: string): string {
  return `${KEY_PREFIX}${slot}`;
}

export function save_game(state: GameState, slot: string, game_date: string, equity: number): void {
  const store = storage();
  if (!store) throw new Error("localStorage is unavailable; cannot save game.");
  ensureEconomyState(state);
  ensureQuantInfra(state);
  const row: SaveRow = {
    schema_version: SAVE_SCHEMA_VERSION,
    slot,
    campaign_id: state.campaign_id ?? "r1",
    game_date,
    equity,
    updated_at: state.updated_at,
    payload: state,
  };
  store.setItem(slot_key(slot), JSON.stringify(row));
}

export function load_game(slot: string): GameState | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(slot_key(slot));
  if (!raw) return null;
  const row = migrate(JSON.parse(raw) as SaveRow);
  ensureEconomyState(row.payload);
  ensureQuantInfra(row.payload);
  return row.payload;
}

export function list_saves(): SaveSlotInfo[] {
  const store = storage();
  if (!store) return [];
  const rows: SaveSlotInfo[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const raw = store.getItem(key);
    if (!raw) continue;
    try {
      const row = JSON.parse(raw) as SaveRow;
      rows.push({
        slot: row.slot,
        campaign_id: row.campaign_id,
        game_date: row.game_date,
        equity: row.equity,
        updated_at: row.updated_at,
      });
    } catch {
      // Corrupt entry -- skip rather than fail the whole listing.
    }
  }
  return rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
}

export function delete_save(slot: string): boolean {
  const store = storage();
  if (!store) return false;
  const key = slot_key(slot);
  const existed = store.getItem(key) !== null;
  store.removeItem(key);
  return existed;
}
