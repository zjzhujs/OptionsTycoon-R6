import { new_id } from '../ids';
import type {
  EconomySettlementRecord,
  EconomyState,
  GameState,
  ImmutableEvidenceEntry,
} from '../schemas';

const cents = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const nonNegative = (value: number): number => Math.max(0, cents(value));

export const ECONOMY_SCHEMA_VERSION = 2;
const DEFAULT_MANAGEMENT_CASH = 12_000;
const DEFAULT_GP_CASH = 6_000;

export interface SettlementInput {
  settlementId: string;
  monthId: string;
  date: string;
  fundNav: number;
  intelMonthlyCost?: number;
  /** Additional operating burn settled atomically with the intelligence burn. */
  quantMonthlyCost?: number;
  /** Talent retainers are management-company burn and settle atomically too. */
  talentMonthlyCost?: number;
  /** Optional fixed legal retainer, paid after core talent and before quant. */
  legalMonthlyCost?: number;
  /** Optional fixed PR/IR retainer, paid after core operating subscriptions. */
  prMonthlyCost?: number;
  crystallizable?: boolean;
}

export interface SettlementResult {
  record: EconomySettlementRecord;
  duplicate: boolean;
}

export function createEconomyState(fundNav: number, managementCash = 12_000, gpCash = 6_000): EconomyState {
  return {
    schema_version: ECONOMY_SCHEMA_VERSION,
    management_cash: nonNegative(managementCash),
    gp_cash: nonNegative(gpCash),
    high_water_mark: nonNegative(fundNav),
    accrued_mgmt_fee: 0,
    accrued_perf_fee: 0,
    monthly_burn: 0,
    last_month_settled: null,
    settled_ids: [],
    transfer_ledger: [],
    settlement_ledger: [],
  };
}

function legacyCashLabel(economyValue: unknown, legacyWallet: unknown): string {
  const canonical = Number(economyValue);
  if (Number.isFinite(canonical)) return String(canonical);
  const legacy = Number(legacyWallet);
  return Number.isFinite(legacy) ? String(legacy) : 'UNSET';
}

function resetLegacyEconomy(state: GameState, economy: EconomyState): void {
  const legacyManagement = legacyCashLabel(economy.management_cash, state.management_company?.cash);
  const legacyGp = legacyCashLabel(economy.gp_cash, state.gp_wealth?.cash);
  const resetDate = state.updated_at?.slice(0, 10) || 'MIGRATION';
  const resetDetail = `MIGRATION_RESET economy schema_version=${String(economy.schema_version ?? 'UNSET')} legacy management_cash=${legacyManagement}, gp_cash=${legacyGp}; reset to management_cash=12000, gp_cash=6000`;

  economy.management_cash = DEFAULT_MANAGEMENT_CASH;
  economy.gp_cash = DEFAULT_GP_CASH;
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

  state.audit_trail ??= [];
  state.audit_trail.push({
    id: new_id(),
    date: resetDate,
    action: 'MIGRATION_RESET',
    wallet: 'NONE',
    amount: 0,
    detail: resetDetail,
  });
}

function bindCashAlias(target: Record<string, unknown>, state: GameState, key: 'management_cash' | 'gp_cash'): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'cash');
  if (descriptor?.get && descriptor?.set && descriptor.enumerable === false) return;
  if (!descriptor || descriptor.configurable !== false) delete target.cash;
  Object.defineProperty(target, 'cash', {
    configurable: true,
    enumerable: false,
    get: () => ensureEconomyState(state)[key],
    set: (value: unknown) => {
      ensureEconomyState(state)[key] = nonNegative(Number(value));
    },
  });
}

/**
 * Restores canonical economy state and non-persisted compatibility aliases.
 * There is exactly one stored balance for each non-fund wallet.
 */
export function ensureEconomyState(state: GameState): EconomyState {
  if (!state.economy) {
    // Legacy wallet values were never balanced against the canonical economy.
    // A true save migration records their values in persistence and starts the
    // new system from its designed opening balances instead of importing them.
    state.economy = createEconomyState(state.start_cash);
  }

  const economy = state.economy;
  const economySchemaVersion = Number(economy.schema_version ?? 0);
  if (!Number.isFinite(economySchemaVersion) || economySchemaVersion < ECONOMY_SCHEMA_VERSION) {
    resetLegacyEconomy(state, economy);
  }
  economy.management_cash = nonNegative(economy.management_cash);
  economy.gp_cash = nonNegative(economy.gp_cash);
  economy.high_water_mark = nonNegative(economy.high_water_mark || state.start_cash);
  economy.accrued_mgmt_fee = nonNegative(economy.accrued_mgmt_fee);
  economy.accrued_perf_fee = nonNegative(economy.accrued_perf_fee);
  economy.monthly_burn = nonNegative(economy.monthly_burn);
  economy.settled_ids ??= [];
  economy.transfer_ledger ??= [];
  economy.settlement_ledger ??= [];
  economy.last_month_settled ??= null;

  state.management_company ??= {};
  state.gp_wealth ??= {};
  bindCashAlias(state.management_company as Record<string, unknown>, state, 'management_cash');
  bindCashAlias(state.gp_wealth as Record<string, unknown>, state, 'gp_cash');
  state.evidence_ledger ??= [];
  state.mnpi_flags ??= [];
  state.bribery_flags ??= [];
  state.audit_trail ??= [];
  return economy;
}

/** Returns the runway using canonical cash and the largest known committed burn. */
export function managementRunwayMonths(state: GameState): number {
  const economy = ensureEconomyState(state);
  const configuredBurn = Math.max(
    economy.monthly_burn,
    Number(state.management_company?.monthly_burn ?? 0),
  );
  const runway = configuredBurn > 0 ? economy.management_cash / configuredBurn : 999;
  const rounded = Math.round(Math.max(0, runway) * 10) / 10;
  if (state.management_company) state.management_company.runway_months = rounded;
  return rounded;
}

/** A hard gate used by all new discretionary management-company spending. */
export function isCashPreservation(state: GameState): boolean {
  const runway = managementRunwayMonths(state);
  state.cash_preservation = runway < 1;
  state.runway_warning = state.cash_preservation ? 'CASH_PRESERVATION' : runway < 2 ? 'RUNWAY_2M' : 'NONE';
  return state.cash_preservation;
}

export function settleMonth(state: GameState, input: SettlementInput): SettlementResult {
  const economy = ensureEconomyState(state);
  const existing = economy.settlement_ledger.find((entry) => entry.settlement_id === input.settlementId);
  if (existing) return { record: existing, duplicate: true };

  const managementCashBefore = economy.management_cash;
  const hwmBefore = economy.high_water_mark;
  const fundNav = nonNegative(input.fundNav);
  const managementFee = cents(fundNav * 0.02 / 12);
  const performanceFee = input.crystallizable === false || fundNav <= hwmBefore
    ? 0
    : cents((fundNav - hwmBefore) * 0.20);
  const hwmAfter = performanceFee > 0 ? fundNav : hwmBefore;
  const intelDue = nonNegative(input.intelMonthlyCost ?? 0);
  const quantDue = nonNegative(input.quantMonthlyCost ?? 0);
  const talentDue = nonNegative(input.talentMonthlyCost ?? 0);
  const legalDue = nonNegative(input.legalMonthlyCost ?? 0);
  const prDue = nonNegative(input.prMonthlyCost ?? 0);
  const totalBurnDue = cents(intelDue + quantDue + talentDue + legalDue + prDue);

  // Fixed priority: core talent -> legal -> quant -> intel -> optional PR.
  // Once an obligation cannot be met, lower-priority obligations are not
  // silently paid from another wallet and are marked delinquent/suspended by
  // their owning engines on the same node.
  let available = cents(managementCashBefore + managementFee + performanceFee);
  let blocked = false;
  const pay = (due: number): boolean => {
    if (due <= 0) return true;
    if (blocked || available < due) {
      blocked = true;
      return false;
    }
    available = cents(available - due);
    return true;
  };
  const talentPaid = pay(talentDue);
  const legalPaid = pay(legalDue);
  const quantPaid = pay(quantDue);
  const intelPaid = pay(intelDue);
  const prPaid = pay(prDue);
  economy.management_cash = nonNegative(available);

  economy.high_water_mark = hwmAfter;
  economy.accrued_mgmt_fee = cents(economy.accrued_mgmt_fee + managementFee);
  economy.accrued_perf_fee = cents(economy.accrued_perf_fee + performanceFee);
  // Burn is committed spend, not merely the amount successfully paid this
  // month. Keeping it visible makes runway and CASH_PRESERVATION deterministic.
  economy.monthly_burn = totalBurnDue;
  economy.last_month_settled = input.monthId;
  economy.settled_ids.push(input.settlementId);

  const record: EconomySettlementRecord = {
    settlement_id: input.settlementId,
    month_id: input.monthId,
    date: input.date,
    fund_nav: fundNav,
    management_cash_before: managementCashBefore,
    management_cash_after: economy.management_cash,
    management_fee: managementFee,
    performance_fee: performanceFee,
    high_water_mark_before: hwmBefore,
    high_water_mark_after: hwmAfter,
    intel_due: intelDue,
    intel_paid: intelPaid,
    quant_due: quantDue,
    quant_paid: quantPaid,
    talent_due: talentDue,
    talent_paid: talentPaid,
    legal_due: legalDue,
    legal_paid: legalPaid,
    pr_due: prDue,
    pr_paid: prPaid,
    total_burn_due: totalBurnDue,
  };
  economy.settlement_ledger.push(record);

  if (state.management_company) {
    state.management_company.high_water_mark = hwmAfter;
    state.management_company.fee_income_ytd = cents((state.management_company.fee_income_ytd ?? 0) + managementFee);
    state.management_company.performance_income_ytd = cents((state.management_company.performance_income_ytd ?? 0) + performanceFee);
    state.management_company.monthly_burn = economy.monthly_burn;
    managementRunwayMonths(state);
  }

  state.audit_trail?.push({
    id: new_id(),
    date: input.date,
    action: 'MONTHLY_SETTLEMENT',
    wallet: 'MANAGEMENT_CASH',
    amount: cents(
      managementFee + performanceFee
      - (intelPaid ? intelDue : 0)
      - (quantPaid ? quantDue : 0)
      - (talentPaid ? talentDue : 0)
      - (legalPaid ? legalDue : 0)
      - (prPaid ? prDue : 0),
    ),
    detail: input.settlementId,
  });
  return { record, duplicate: false };
}

export function injectGpCapital(state: GameState, amount: number, date: string, reason = 'GP Capital Injection'): boolean {
  const economy = ensureEconomyState(state);
  const transfer = nonNegative(amount);
  if (transfer <= 0 || economy.gp_cash < transfer) return false;
  economy.gp_cash = cents(economy.gp_cash - transfer);
  economy.management_cash = cents(economy.management_cash + transfer);
  economy.transfer_ledger.push({
    id: new_id(),
    date,
    from_wallet: 'GP_CASH',
    to_wallet: 'MANAGEMENT_CASH',
    amount: transfer,
    reason,
  });
  if (state.gp_wealth) state.gp_wealth.total_injected_to_company = cents((state.gp_wealth.total_injected_to_company ?? 0) + transfer);
  state.audit_trail?.push({
    id: new_id(),
    date,
    action: 'GP_CAPITAL_INJECTION',
    wallet: 'GP_CASH',
    amount: transfer,
    detail: reason,
  });
  return true;
}

export function distributeAuditedGpDividend(state: GameState, amount: number, date: string): boolean {
  const economy = ensureEconomyState(state);
  const transfer = nonNegative(amount);
  if (transfer <= 0 || economy.management_cash < transfer) return false;
  economy.management_cash = cents(economy.management_cash - transfer);
  economy.gp_cash = cents(economy.gp_cash + transfer);
  economy.transfer_ledger.push({
    id: new_id(),
    date,
    from_wallet: 'MANAGEMENT_CASH',
    to_wallet: 'GP_CASH',
    amount: transfer,
    reason: 'Audited GP Dividend',
  });
  if (state.gp_wealth) state.gp_wealth.total_distributions_received = cents((state.gp_wealth.total_distributions_received ?? 0) + transfer);
  state.audit_trail?.push({
    id: new_id(),
    date,
    action: 'GP_DIVIDEND',
    wallet: 'MANAGEMENT_CASH',
    amount: transfer,
    detail: 'Explicit audited distribution',
  });
  return true;
}

export function appendImmutableEvidence(state: GameState, entry: Omit<ImmutableEvidenceEntry, 'id'>): ImmutableEvidenceEntry {
  ensureEconomyState(state);
  const persisted: ImmutableEvidenceEntry = { id: new_id(), ...entry };
  state.evidence_ledger!.push(persisted);
  if (entry.category === 'MNPI' && !state.mnpi_flags!.includes(entry.action_id)) state.mnpi_flags!.push(entry.action_id);
  if ((entry.category === 'BRIBERY' || entry.category === 'EXTORTION_RISK') && !state.bribery_flags!.includes(entry.action_id)) {
    state.bribery_flags!.push(entry.action_id);
  }
  return persisted;
}
