import rawCampaignBeats from './data/campaigns_new.json';
import { CAMPAIGNS } from './data_loader';
import { assertCampaignRegimeTags, validateCampaignManifest } from './campaign_contract';
import { getOfflineContentPackManifest } from './engines/offline_content_pack';
import type { CampaignManifest, CampaignRegimeTag, DomainRoleSlot, InitialStatePolicy } from './schemas';
import type { StoryTemplate } from './schemas';

/** Strict historical order. C8 remains active while C5/C6 take focus. */
export const CAREER_CAMPAIGN_ORDER = ['c4', 'gme', 'c8', 'c5', 'c6', 'r1', 'c7', 'h1'] as const;

const beatRows = rawCampaignBeats as StoryTemplate[];

function activationBeats(campaignId: string): string[] {
  return beatRows.filter((beat) => beat.id.startsWith(`${campaignId}_`)).map((beat) => beat.id);
}

const defaultBackground = {
  mark_to_market: false,
  accrue_financing: false,
  apply_corporate_actions: false,
  process_story_events: false,
};

const longArcBackground = {
  mark_to_market: true,
  accrue_financing: true,
  apply_corporate_actions: true,
  process_story_events: false,
};

const noCarry = {
  enabled: false,
  next_campaign_ids: [],
  symbols: [],
  asset_kinds: [],
};

const historicalFallback = {
  mode: 'EVENT_ONLY' as const,
  notice: '缺少经过核验的历史字段时只显示公开事件，不补造价格或成交。',
};

function slots(primary: string, domain: string, fallback: string[] = []): DomainRoleSlot[] {
  return [{ domain, primary_character_id: primary, fallback_character_ids: fallback, minimum_viable: 'SYSTEM_PANEL' }];
}

function initialStatePolicy(mode: InitialStatePolicy['mode']): InitialStatePolicy {
  return {
    mode,
    allow_cash_seed: mode === 'CAREER_ORIGIN',
    allow_position_seed: false,
  };
}

function newManifest(
  id: string,
  title: string,
  note: string,
  startAt: string,
  endAt: string,
  underlying: string,
  secondary: string,
  dateMode: CampaignManifest['date_mode'],
  regimeTags: CampaignRegimeTag[],
  requiredSymbols: string[],
  requiredFields: string[],
  domainRoleSlots: DomainRoleSlot[],
  teaches: string[],
  tests: string[],
  complexityAxes: string[],
  background = defaultBackground,
): CampaignManifest {
  assertCampaignRegimeTags(regimeTags);
  const beats = activationBeats(id);
  return {
    id,
    title,
    note,
    playable: CAMPAIGNS[id]?.playable ?? false,
    underlying,
    secondary,
    account_default: 'Cash',
    data_start: startAt,
    data_end: endAt,
    node_count: CAMPAIGNS[id]?.node_count ?? 0,
    start_at: startAt,
    end_at: endAt,
    activation_beats: beats,
    can_overlap: id === 'c8',
    background_update_policy: background,
    completion_rule: { mode: beats.length ? 'ALL' : 'ANY', beat_ids: beats },
    date_mode: dateMode,
    session_rules: { opening_gate: 'campaign_opening', guided_mode: id === 'c4' },
    trade_lock_windows: [],
    required_symbols: requiredSymbols,
    required_fields: requiredFields,
    fallback_policy: historicalFallback,
    historical_vs_simulated: 'HISTORICAL',
    initial_state_policy: initialStatePolicy(id === 'c4' ? 'CAREER_ORIGIN' : 'CONTINUE_LEDGER'),
    carryable_positions: noCarry,
    carry_data_coverage: getOfflineContentPackManifest(id)?.carry_data_coverage ?? [],
    domain_role_slots: domainRoleSlots,
    prerequisites: [],
    teaches,
    tests,
    complexity_axes: complexityAxes,
    regime_tags: regimeTags,
  };
}

function legacyManifest(id: 'r1' | 'h1', regimeTags: CampaignRegimeTag[]): CampaignManifest {
  const meta = CAMPAIGNS[id];
  assertCampaignRegimeTags(regimeTags);
  return {
    ...meta,
    start_at: meta.data_start,
    end_at: meta.data_end,
    activation_beats: [],
    can_overlap: false,
    background_update_policy: defaultBackground,
    completion_rule: { mode: 'ANY', public_event_ids: [] },
    date_mode: 'EVENT_NODE',
    session_rules: { opening_gate: 'day1_briefing_maya', guided_mode: id === 'r1' },
    trade_lock_windows: [],
    required_symbols: [meta.underlying, meta.secondary].filter(Boolean),
    required_fields: ['daily_ohlc', 'macro_event'],
    fallback_policy: historicalFallback,
    historical_vs_simulated: 'HISTORICAL',
    initial_state_policy: initialStatePolicy('CONTINUE_LEDGER'),
    carryable_positions: noCarry,
    carry_data_coverage: getOfflineContentPackManifest(id)?.carry_data_coverage ?? [],
    domain_role_slots: slots(id === 'r1' ? 'maya_chen' : 'victor_hale', id === 'r1' ? 'RESEARCH' : 'MACRO_RISK', ['leo_park']),
    prerequisites: [],
    teaches: [],
    tests: [],
    complexity_axes: [],
    regime_tags: regimeTags,
  };
}

export const CAMPAIGN_MANIFESTS: Record<string, CampaignManifest> = {
  c4: newManifest(
    'c4', 'DASH FOR CASH', '2020 流动性危机', '2020-03-09', '2020-03-23', 'SPY', 'TLT', 'CONTIGUOUS',
    ['CRISIS', 'FED', 'RATES'], ['SPY', 'TLT', 'IEF', 'HYG', 'VIX'], ['daily_ohlc', 'volume', 'fed_statement'],
    slots('victor_hale', 'MACRO_RISK', ['daniel_ross']), ['LIQUIDITY', 'RUNWAY'], ['SURVIVAL', 'EXECUTION'], ['LIQUIDITY', 'FINANCING'],
  ),
  gme: newManifest(
    'gme', 'FEEDBACK LOOP', 'GME 反身性与强制流', '2021-01-11', '2021-02-05', 'GME', '', 'CONTIGUOUS',
    ['MEME', 'VOLATILITY'], ['GME'], ['daily_ohlc', 'short_sale_volume', 'ftd', 'borrow_fee_if_observed', 'loan_balance', 'options_aggregate'],
    slots('leo_park', 'OPTIONS_EXECUTION', ['adrian_cross']), ['REFLEXIVITY', 'FORCED_FLOW'], ['FALSIFIER', 'EXIT_DISCIPLINE'], ['CROWDING', 'LIQUIDITY'],
  ),
  c8: newManifest(
    'c8', 'THE SPREAD', 'MSFT/ATVI 并购长弧线', '2022-01-18', '2023-10-13', 'ATVI', 'MSFT', 'LONG_HORIZON',
    ['M&A', 'REGULATION', 'NEWS'], ['ATVI', 'MSFT'], ['public_event', 'cash_settlement', 'corporate_action'],
    slots('marcus_reed', 'COMPLIANCE', ['evelyn_shaw']), ['MERGER_SPREAD', 'INFORMATION_ETHICS'], ['COMPLIANCE', 'PROBABILITY_UPDATE'], ['LONG_HORIZON', 'OVERLAP'],
    longArcBackground,
  ),
  c5: newManifest(
    'c5', 'AFTER THE BELL', 'NFLX 财报窗口', '2022-04-18', '2022-04-22', 'NFLX', '', 'EVENT_NODE',
    ['EARNINGS', 'VOLATILITY'], ['NFLX'], ['daily_ohlc', 'earnings_week_aggregate', 'option_quote_if_available'],
    slots('leo_park', 'OPTIONS_EXECUTION', ['maya_chen']), ['IMPLIED_MOVE', 'IV_VS_REALIZED'], ['STRUCTURE_EFFICIENCY', 'EXECUTION'], ['EVENT_RISK', 'VOLATILITY'],
  ),
  c6: newManifest(
    'c6', 'DURATION TRAP', '利率冲击与久期', '2022-06-09', '2022-06-17', 'QQQ', 'TLT', 'EVENT_NODE',
    ['INFLATION', 'FED', 'RATES', 'VOLATILITY'], ['QQQ', 'TLT', 'SPY'], ['daily_ohlc', 'rates_event_points', 'fed_statement'],
    slots('victor_hale', 'MACRO_RISK', ['leo_park']), ['DURATION', 'HEDGE'], ['PATH_RISK', 'THESIS_REVISION'], ['RATES', 'CONVEXITY'],
  ),
  r1: legacyManifest('r1', ['AI', 'GENERIC', 'VOLATILITY']),
  c7: newManifest(
    'c7', 'POLICY SHOCKWAVE', '关税政策冲击', '2025-04-02', '2025-04-11', 'SPX', '', 'EVENT_NODE',
    ['TARIFF', 'NEWS'], ['SPX'], ['policy_text', 'scope', 'effective_time'],
    slots('evelyn_shaw', 'POLICY', ['marcus_reed']), ['POLICY_TEXT', 'TRANSMISSION'], ['SCOPE_DISCIPLINE', 'SOURCE_QUALITY'], ['POLICY', 'CROSS_ASSET'],
  ),
  h1: legacyManifest('h1', ['CRISIS', 'FED', 'RATES', 'VOLATILITY']),
};

export function getCampaignManifest(campaignId: string): CampaignManifest | null {
  return CAMPAIGN_MANIFESTS[campaignId] ?? null;
}

export function validateCampaignManifests(): void {
  for (const manifest of Object.values(CAMPAIGN_MANIFESTS)) validateCampaignManifest(manifest);
  for (let index = 1; index < CAREER_CAMPAIGN_ORDER.length; index += 1) {
    const previous = CAMPAIGN_MANIFESTS[CAREER_CAMPAIGN_ORDER[index - 1]];
    const current = CAMPAIGN_MANIFESTS[CAREER_CAMPAIGN_ORDER[index]];
    if (!previous || !current || previous.start_at > current.start_at) {
      throw new Error('Campaign manifest order is not strictly chronological.');
    }
  }
}

validateCampaignManifests();
