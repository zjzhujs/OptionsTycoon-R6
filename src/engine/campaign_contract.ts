import type {
  ArcStatus,
  CampaignArcState,
  CampaignManifest,
  CampaignRegimeTag,
  FundBalanceSheet,
  GameState,
  Position,
  PositionLot,
  PrerequisiteResolution,
  TransitionSpec,
} from './schemas';

export const LEGACY_REGIME_TAGS = ['AI', 'EARNINGS', 'GENERIC', 'NEWS', 'TARIFF', 'WAR'] as const;
export const NEW_REGIME_TAGS = ['CRISIS', 'FED', 'INFLATION', 'M&A', 'MEME', 'RATES', 'REGULATION', 'VOLATILITY'] as const;
export const CAMPAIGN_REGIME_TAGS = [...LEGACY_REGIME_TAGS, ...NEW_REGIME_TAGS] as const;

const REGIME_TAG_SET = new Set<string>(CAMPAIGN_REGIME_TAGS);
const ACTIVE_ARC_STATUSES = new Set<ArcStatus>(['ACTIVE_FOCUS', 'ACTIVE_DORMANT']);
const EPSILON = 1e-8;

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sameNumber(left: number, right: number, epsilon = EPSILON): boolean {
  return Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right));
}

export function assertCampaignRegimeTags(tags: readonly string[]): asserts tags is readonly CampaignRegimeTag[] {
  const invalid = tags.filter((tag) => !REGIME_TAG_SET.has(tag));
  if (invalid.length) {
    throw new Error(`Unknown campaign regime tag(s): ${invalid.join(', ')}`);
  }
}

/** Validate a compound MacroEvent.tag such as `AI/TARIFF` for campaign use. */
export function assertCampaignMacroEventTag(tag: string): void {
  const parts = tag.split('/').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Campaign MacroEvent.tag cannot be empty.');
  assertCampaignRegimeTags(parts);
}

export function validateCampaignManifest(manifest: CampaignManifest): void {
  assertCampaignRegimeTags(manifest.regime_tags);
  if (manifest.can_overlap === false && manifest.carryable_positions.enabled) {
    throw new Error(`Campaign ${manifest.id} cannot carry positions while overlap is disabled.`);
  }
  // This is intentionally an informational resolution. Prerequisites never
  // become a historical-clock blocker.
  resolvePrerequisites(manifest, []);
}

export function resolvePrerequisites(
  manifest: Pick<CampaignManifest, 'prerequisites'>,
  masteredSkills: readonly string[],
): PrerequisiteResolution {
  const mastered = new Set(masteredSkills);
  const missing = manifest.prerequisites.filter((skill) => !mastered.has(skill));
  return {
    missing,
    scaffolding_required: missing.length > 0,
    blocks_timeline: false,
  };
}

export function createCampaignArcState(status: ArcStatus = 'NOT_STARTED'): CampaignArcState {
  return {
    status,
    next_beat_index: 0,
    resolved_beat_ids: [],
    last_public_event_at: null,
    last_transition_at: null,
  };
}

export function assertCampaignProgressInvariant(progress: Record<string, CampaignArcState>): void {
  for (const [campaignId, arc] of Object.entries(progress)) {
    if (arc.next_beat_index !== arc.resolved_beat_ids.length) {
      throw new Error(
        `Campaign arc invariant failed for ${campaignId}: ` +
        `next_beat_index=${arc.next_beat_index} but resolved_beat_ids.length=${arc.resolved_beat_ids.length}.`,
      );
    }
    if (arc.next_beat_index < 0) {
      throw new Error(`Campaign arc invariant failed for ${campaignId}: next_beat_index cannot be negative.`);
    }
    if (new Set(arc.resolved_beat_ids).size !== arc.resolved_beat_ids.length) {
      throw new Error(`Campaign arc invariant failed for ${campaignId}: duplicate resolved beat id.`);
    }
  }
}

function activeCampaignIds(progress: Record<string, CampaignArcState>): string[] {
  return Object.entries(progress)
    .filter(([, arc]) => ACTIVE_ARC_STATUSES.has(arc.status))
    .map(([campaignId]) => campaignId)
    .sort();
}

export function ensureCareerContract(state: GameState, currentAt: string): void {
  const campaignId = state.campaign_id ?? 'r1';
  state.career_clock ??= {
    current_at: currentAt,
    event_cursor: null,
    transition_cursor: null,
    last_advance_at: null,
  };
  state.campaign_progress ??= {};
  state.campaign_progress[campaignId] ??= createCampaignArcState('ACTIVE_FOCUS');
  state.applied_transition_ids ??= [];

  if (state.career_clock.current_at && currentAt < state.career_clock.current_at) {
    throw new Error(`Global Career Clock cannot move backwards from ${state.career_clock.current_at} to ${currentAt}.`);
  }
  if (currentAt > state.career_clock.current_at) {
    state.career_clock.last_advance_at = currentAt;
    state.career_clock.current_at = currentAt;
  }

  assertCampaignProgressInvariant(state.campaign_progress);
  state.active_campaign_ids = activeCampaignIds(state.campaign_progress);
  const currentArc = state.campaign_progress[campaignId];
  if (!state.spotlight_campaign_id || !state.campaign_progress[state.spotlight_campaign_id] ||
      !ACTIVE_ARC_STATUSES.has(state.campaign_progress[state.spotlight_campaign_id].status)) {
    state.spotlight_campaign_id = ACTIVE_ARC_STATUSES.has(currentArc.status)
      ? campaignId
      : state.active_campaign_ids[0] ?? null;
  }
}

export function applyTransitionSpec(state: GameState, spec: TransitionSpec, at: string): void {
  ensureCareerContract(state, at);
  if (state.applied_transition_ids?.includes(spec.id)) return;
  if (state.career_clock && state.career_clock.current_at > at) {
    throw new Error(`Transition ${spec.id} would rewind the Global Career Clock.`);
  }

  state.campaign_progress ??= {};
  const arc = state.campaign_progress[spec.campaign_id] ?? createCampaignArcState();
  state.campaign_progress[spec.campaign_id] = arc;
  arc.last_transition_at = at;

  if (spec.kind === 'ENTER') arc.status = 'ACTIVE_FOCUS';
  if (spec.kind === 'FOCUS' || spec.kind === 'RESUME') arc.status = 'ACTIVE_FOCUS';
  if (spec.kind === 'SUSPEND') arc.status = 'ACTIVE_DORMANT';
  if (spec.kind === 'COMPLETE') arc.status = 'COMPLETED';

  if (spec.kind === 'FOCUS' || spec.kind === 'RESUME' || spec.kind === 'ENTER') {
    for (const [campaignId, other] of Object.entries(state.campaign_progress)) {
      if (campaignId !== spec.campaign_id && other.status === 'ACTIVE_FOCUS') other.status = 'ACTIVE_DORMANT';
    }
    state.spotlight_campaign_id = spec.campaign_id;
  } else if (spec.kind === 'COMPLETE' && state.spotlight_campaign_id === spec.campaign_id) {
    state.spotlight_campaign_id = null;
  }

  state.applied_transition_ids ??= [];
  state.applied_transition_ids.push(spec.id);
  state.career_clock!.transition_cursor = spec.id;
  state.career_clock!.last_advance_at = at;
  state.career_clock!.current_at = at;
  assertCampaignProgressInvariant(state.campaign_progress);
  state.active_campaign_ids = activeCampaignIds(state.campaign_progress);
  if (!state.spotlight_campaign_id) state.spotlight_campaign_id = state.active_campaign_ids[0] ?? null;
}

export function positionToLot(position: Position, fallbackCampaign: string): PositionLot {
  return {
    ...position,
    origin_campaign: position.origin_campaign || fallbackCampaign,
    thesis_id: position.thesis_id ?? position.thesis?.id ?? null,
    contract_multiplier: position.contract_multiplier ?? (position.kind === 'option' ? 100 : 1),
  };
}

/** Bridge legacy root fields into the P1 lot shape without fabricating prices. */
export function legacyPositionLots(state: GameState): PositionLot[] {
  const campaignId = state.campaign_id ?? 'r1';
  const lots = (state.positions ?? []).map((position) => positionToLot(position, campaignId));
  const shares = finite(state.shares);
  if (shares !== 0) {
    lots.push({
      id: 'legacy-shares',
      kind: 'shares',
      underlying: state.active_ticker ?? campaignId,
      qty: Math.abs(shares),
      entry_price: Math.abs(finite(state.share_cost_basis)),
      entry_date: state.fund_balance_sheet?.valuation_at ?? state.created_at,
      short: shares < 0,
      origin_campaign: campaignId,
      thesis_id: null,
      contract_multiplier: 1,
    });
  }
  return lots;
}

export function createEmptyFundBalanceSheet(cash: number, valuationAt = ''): FundBalanceSheet {
  return {
    valuation_at: valuationAt,
    cash,
    realized_pnl: 0,
    margin_debt: 0,
    borrow_liability: 0,
    accrued_margin_interest: 0,
    accrued_borrow_fee: 0,
    collateral_reserved: 0,
    position_lots: [],
    nav: cash,
    unrealized_pnl: 0,
    cost_basis: 0,
    valuation_cache_valid: false,
  };
}

export type FundValuationMarks = Record<string, number>;

/**
 * The only P1 valuation recompute entry point.
 *
 * The ledger's mutable inputs are copied; nav, unrealized_pnl and cost_basis
 * are never accepted from a caller as authoritative values.
 */
export function recomputeFundBalanceSheet(
  ledger: FundBalanceSheet,
  marks: FundValuationMarks,
  valuationAt = ledger.valuation_at,
): FundBalanceSheet {
  let positionValue = 0;
  let unrealized = 0;
  let costBasis = 0;

  for (const lot of ledger.position_lots) {
    const quantity = Math.abs(finite(lot.qty));
    if (quantity === 0) continue;
    const mark = marks[lot.id];
    if (!Number.isFinite(mark)) throw new Error(`Missing valuation mark for position lot ${lot.id}.`);
    const multiplier = finite(lot.contract_multiplier, lot.kind === 'option' ? 100 : 1);
    const signed = lot.short ? -1 : 1;
    const entry = finite(lot.entry_price);
    positionValue += signed * mark * multiplier * quantity;
    unrealized += (lot.short ? entry - mark : mark - entry) * multiplier * quantity;
    costBasis += Math.abs(entry) * multiplier * quantity;
  }

  return {
    ...ledger,
    valuation_at: valuationAt,
    position_lots: ledger.position_lots.map((lot) => ({ ...lot })),
    nav: finite(ledger.cash) + positionValue - finite(ledger.margin_debt) - finite(ledger.borrow_liability),
    unrealized_pnl: unrealized,
    cost_basis: costBasis,
    valuation_cache_valid: true,
  };
}

export function assertFundBalanceSheetConsistent(
  ledger: FundBalanceSheet,
  marks: FundValuationMarks,
  epsilon = EPSILON,
): void {
  const recomputed = recomputeFundBalanceSheet(ledger, marks, ledger.valuation_at);
  if (!sameNumber(recomputed.nav, ledger.nav, epsilon) ||
      !sameNumber(recomputed.unrealized_pnl, ledger.unrealized_pnl, epsilon) ||
      !sameNumber(recomputed.cost_basis, ledger.cost_basis, epsilon)) {
    throw new Error(
      `FundBalanceSheet derived cache mismatch at ${ledger.valuation_at}: ` +
      `stored(nav=${ledger.nav}, unrealized=${ledger.unrealized_pnl}, cost_basis=${ledger.cost_basis}) ` +
      `recomputed(nav=${recomputed.nav}, unrealized=${recomputed.unrealized_pnl}, cost_basis=${recomputed.cost_basis}).`,
    );
  }
}

/**
 * P1 bridge for the current engine. Until all financial writers move to the
 * ledger, legacy root fields are copied into the ledger inputs on each view;
 * all derived valuation still goes through recomputeFundBalanceSheet().
 */
export function recomputeStateFundBalanceSheet(
  state: GameState,
  valuationAt: string,
  marks: FundValuationMarks,
): FundBalanceSheet {
  const existing = state.fund_balance_sheet ?? createEmptyFundBalanceSheet(finite(state.cash), valuationAt);
  // The current engine still materializes legacy `positions`/`shares` fields
  // on every state, including an intentionally empty portfolio after close.
  // Presence, not length, tells us whether those compatibility fields are the
  // authoritative bridge; otherwise a stale ledger lot could resurrect.
  const useLegacyPortfolio = state.positions !== undefined || state.shares !== undefined;
  const ledger: FundBalanceSheet = {
    ...existing,
    valuation_at: valuationAt,
    cash: finite(state.cash, existing.cash),
    realized_pnl: finite(state.realized_pl, existing.realized_pnl),
    margin_debt: finite(state.margin_debt, existing.margin_debt),
    collateral_reserved: finite(state.cash_collateral_reserved, existing.collateral_reserved),
    position_lots: useLegacyPortfolio ? legacyPositionLots(state) : existing.position_lots.map((lot) => ({ ...lot })),
  };
  const recomputed = recomputeFundBalanceSheet(ledger, marks, valuationAt);
  state.fund_balance_sheet = recomputed;
  assertFundBalanceSheetConsistent(recomputed, marks);
  return recomputed;
}
