import type { AcquiredEdgeIntel, GameState, HumanActionEvent, InvestigationStage, ThesisSignal } from '../schemas';

interface Candidate {
  key: string;
  score: number;
  signal: ThesisSignal;
}

const INVESTIGATION_ORDER: InvestigationStage[] = [
  'CLEAN','SUSPICIOUS','INTERNAL_CONCERN','REGULATORY_INQUIRY','FORMAL_INVESTIGATION','CIVIL_ENFORCEMENT',
  'CRIMINAL_INVESTIGATION','CHARGED','SETTLED','TRIAL','CONVICTED','ACQUITTED',
];

const CHARACTER_NAMES: Record<string, string> = {
  maya_chen: 'Maya Chen', victor_hale: 'Victor Hale', leo_park: 'Leo Park', daniel_ross: 'Daniel Ross',
  evelyn_shaw: 'Evelyn Shaw', marcus_reed: 'Marcus Reed', adrian_cross: 'Adrian Cross',
};

function currentDate(state: GameState): string {
  return state.market_clock?.current_node_date || state.updated_at?.slice(0, 10) || '2025-01-23';
}

function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `$${value.toFixed(0)}`;
}

function mk(id: string, source: string, role: string, kind: ThesisSignal['kind'], headline: string, body: string, reliability: ThesisSignal['reliability'], motive: string): ThesisSignal {
  // Dynamic state constraints are intentionally ORTHOGONAL. They can change the
  // expression, sizing, legality, or survivability of a thesis without secretly
  // telling the player which market direction is "correct".
  return { id, source_name: source, source_role: role, kind, stance: 'ORTHOGONAL', order: 'FIRST_ORDER', headline, body, reliability, motive };
}

function regulatoryCandidate(state: GameState, ep: number): Candidate | null {
  const stage = state.evidence_state?.investigation_stage ?? 'CLEAN';
  const idx = INVESTIGATION_ORDER.indexOf(stage);
  if (idx < INVESTIGATION_ORDER.indexOf('REGULATORY_INQUIRY')) return null;
  const stageCn: Partial<Record<InvestigationStage, string>> = {
    REGULATORY_INQUIRY: '监管问询', FORMAL_INVESTIGATION: '正式调查', CIVIL_ENFORCEMENT: '民事执法',
    CRIMINAL_INVESTIGATION: '刑事调查', CHARGED: '已起诉', TRIAL: '审理中', SETTLED: '和解程序',
  };
  const label = stageCn[stage] ?? stage;
  return {
    key: 'regulatory',
    score: 100 + idx,
    signal: mk(
      `dyn_ep${ep}_regulatory_${stage.toLowerCase()}`,
      'Marcus Reed', '监管 / SEC 线路', 'POLICY',
      `监管状态已经不是背景：${label}`,
      `你当前的基金正处于「${label}」阶段。这个事实本身不告诉你标的会上涨还是下跌，但它会改变哪些信息可以使用、交易记录需要多强的可解释性，以及你还能承受多少灰色空间。`,
      'HIGH',
      'Marcus 的职责是审查过程与边界，不是替你判断价格方向。',
    ),
  };
}

function lpCandidate(state: GameState, ep: number): Candidate | null {
  const ranks: Record<string, number> = { REDEEMING: 4, CRITICAL: 3, ELEVATED: 2, LOW: 0 };
  const risky = [...(state.lp_profiles ?? [])]
    .filter((lp) => (ranks[lp.redemption_risk ?? 'LOW'] ?? 0) >= 2)
    .sort((a, b) => (ranks[b.redemption_risk ?? 'LOW'] ?? 0) - (ranks[a.redemption_risk ?? 'LOW'] ?? 0) || (a.confidence_score ?? 100) - (b.confidence_score ?? 100));
  const lp = risky[0];
  if (!lp) return null;
  const risk = lp.redemption_risk ?? 'ELEVATED';
  const confidence = lp.confidence_score ?? 0;
  return {
    key: 'lp',
    score: risk === 'REDEEMING' ? 96 : risk === 'CRITICAL' ? 92 : 78,
    signal: mk(
      `dyn_ep${ep}_lp_${lp.id}_${risk.toLowerCase()}`,
      lp.key_contact || lp.name, `${lp.name} / LP`, 'COUNTERPARTY',
      `资本不是常数：${lp.name} 的赎回风险升到 ${risk}`,
      `当前 LP 信心约 ${confidence.toFixed(0)}/100，风险等级 ${risk}。这条信息不回答你的公司 Thesis；它回答的是另一件事：如果市场继续逆着你走，这笔资本是否还会允许你等到 Thesis 被验证。`,
      'HIGH',
      'LP 的第一目标是保护自己的资本与流动性，不是证明你的投资观点。',
    ),
  };
}

function pbCandidate(state: GameState, ep: number): Candidate | null {
  const rows = Object.entries(state.institutional_relationships ?? {})
    .map(([bankId, raw]) => ({ bankId, rel: raw as Record<string, unknown>, spread: Number(raw.financing_spread_bps ?? 150), trust: Number(raw.trust ?? 60) }))
    .filter((row) => row.spread >= 180 || row.trust <= 42)
    .sort((a, b) => (b.spread - a.spread) || (a.trust - b.trust));
  const worst = rows[0];
  if (!worst) return null;
  const bankName = worst.bankId.replace(/_/g, ' ').toUpperCase();
  return {
    key: 'pb',
    score: worst.spread >= 240 || worst.trust <= 25 ? 94 : 82,
    signal: mk(
      `dyn_ep${ep}_pb_${worst.bankId}`,
      'Daniel Ross', `Prime Broker / ${bankName}`, 'COUNTERPARTY',
      `${bankName} 正在重新给你的生存时间定价`,
      `当前融资点差约 SOFR + ${Math.round(worst.spread)} bps，机构信任 ${Math.round(worst.trust)}/100。它不证明你的方向错了，但会缩短你能够“等市场证明自己”的时间，并提高错误持续一天的成本。`,
      'HIGH',
      'Daniel 希望你活下来，但银行同时在保护自己的资产负债表和风险委员会。',
    ),
  };
}

function balanceSheetCandidate(state: GameState, ep: number): Candidate | null {
  const debt = Math.max(0, state.margin_debt ?? 0);
  const cash = Math.max(0, state.cash ?? 0);
  if (debt <= 0) return null;
  const debtToCash = debt / Math.max(1, cash);
  if (debtToCash < 0.18 && cash > (state.start_cash ?? cash) * 0.35) return null;
  return {
    key: 'balance_sheet',
    score: debtToCash >= 0.7 ? 95 : debtToCash >= 0.35 ? 88 : 74,
    signal: mk(
      `dyn_ep${ep}_balance_sheet`,
      'Daniel Ross', '融资 / 资产负债表', 'COUNTERPARTY',
      `你的观点正在和资产负债表抢时间`,
      `当前保证金融资余额 ${money(debt)}，账面现金 ${money(cash)}。融资余额约为现金的 ${(debtToCash * 100).toFixed(0)}%。即使 Thesis 最终正确，融资成本和现金 runway 也可能决定你是否能活到那一天。`,
      'HIGH',
      '这是基金自身的实时资金约束，不是价格方向信号。',
    ),
  };
}

function intelCandidate(state: GameState, ep: number): Candidate | null {
  const today = currentDate(state);
  const ticker = (state.active_ticker ?? '').toUpperCase();
  const relevant = [...(state.acquired_intel ?? [])]
    .filter((intel) => intel.thesis_linked && intel.acquired_date.slice(0, 10) <= today)
    .filter((intel) => !ticker || [intel.ticker, ...(intel.related_tickers ?? [])].filter(Boolean).map((x) => String(x).toUpperCase()).includes(ticker))
    .sort((a, b) => b.acquired_date.localeCompare(a.acquired_date))[0];
  if (!relevant) return null;
  const legality = relevant.legality_class === 'LEGAL' || relevant.legality_class === 'AGGRESSIVE_LAWFUL' ? '可用边界较清晰' : '来源边界本身就是风险变量';
  return {
    key: 'intel',
    score: 76,
    signal: mk(
      `dyn_ep${ep}_intel_${relevant.id}`,
      '情报库 / Intel Desk', '已链接投资逻辑的情报', 'POLICY',
      `你亲手把这条情报加入了 Thesis：${relevant.headline}`,
      `${relevant.body}｜传导路径：${relevant.transmission_path || '尚未形成完整传导链'}。${legality}。现在的问题不是“它听起来有多独家”，而是它能否被其他证据重复验证，以及你是否因为独家感而错误提高仓位。`,
      relevant.source_type === 'REAL_PRIMARY' ? 'HIGH' : 'CONFLICTED',
      '这条信息已经被你主动纳入投资逻辑；“稀缺”本身不等于“正确”。',
    ),
  };
}

function humanActionCandidate(state: GameState, ep: number): Candidate | null {
  const today = currentDate(state);
  const supported = new Set([
    'LP_REDEMPTION_WARNING','PB_HAIRCUT_INCREASE','PB_BORROW_RATE_HIKE','JOURNALIST_INQUIRY',
    'REGULATORY_SUBPOENA','INVESTIGATION_ESCALATION','WHISTLEBLOWER_EVENT','RIVAL_SHORT_ATTACK','RIVAL_MEDIA_ATTACK',
  ]);
  const priority: Record<string, number> = {
    REGULATORY_SUBPOENA: 95, INVESTIGATION_ESCALATION: 94, WHISTLEBLOWER_EVENT: 93, LP_REDEMPTION_WARNING: 90,
    PB_HAIRCUT_INCREASE: 88, PB_BORROW_RATE_HIKE: 82, RIVAL_SHORT_ATTACK: 80, RIVAL_MEDIA_ATTACK: 78, JOURNALIST_INQUIRY: 74,
  };
  const event = [...(state.human_action_events ?? [])]
    .filter((x) => !x.resolved && x.date.slice(0, 10) <= today && supported.has(x.action_kind))
    .sort((a, b) => (priority[b.action_kind] ?? 0) - (priority[a.action_kind] ?? 0) || b.date.localeCompare(a.date))[0];
  if (!event) return null;
  const source = event.character_id ? (CHARACTER_NAMES[event.character_id] ?? event.character_id) : sourceForHumanAction(event);
  const kind: ThesisSignal['kind'] = event.action_kind.startsWith('REGULATORY_') || event.action_kind.includes('INVESTIGATION') || event.action_kind === 'WHISTLEBLOWER_EVENT'
    ? 'POLICY' : event.action_kind.startsWith('PB_') || event.action_kind.startsWith('LP_') ? 'COUNTERPARTY' : 'BEHAVIORAL';
  return {
    key: `human_${event.action_kind}`,
    score: priority[event.action_kind] ?? 70,
    signal: mk(
      `dyn_ep${ep}_human_${event.id}`,
      source, '当前未解决的外部压力', kind,
      event.headline,
      `${event.body} 这件事已经发生并且仍未解决。它未必改变标的的内在价值，但可能改变你的资本、执行窗口、声誉或对手行为。`,
      'HIGH',
      motiveForHumanAction(event),
    ),
  };
}

function sourceForHumanAction(event: HumanActionEvent): string {
  if (event.action_kind.startsWith('PB_')) return 'Prime Broker';
  if (event.action_kind.startsWith('LP_')) return 'LP 资本方';
  if (event.action_kind === 'JOURNALIST_INQUIRY' || event.action_kind === 'RIVAL_MEDIA_ATTACK') return '媒体线路';
  if (event.action_kind.startsWith('REGULATORY_') || event.action_kind.includes('INVESTIGATION') || event.action_kind === 'WHISTLEBLOWER_EVENT') return '监管 / 法务线路';
  return '外部事件';
}

function motiveForHumanAction(event: HumanActionEvent): string {
  if (event.action_kind.startsWith('PB_')) return '融资方首先保护自己的资产负债表和抵押品。';
  if (event.action_kind.startsWith('LP_')) return '资本方首先保护自身流动性与回撤预算。';
  if (event.action_kind.includes('MEDIA') || event.action_kind === 'JOURNALIST_INQUIRY') return '媒体需要一个可传播的故事，叙事压力可能和投资事实不是一回事。';
  if (event.action_kind.startsWith('REGULATORY_') || event.action_kind.includes('INVESTIGATION') || event.action_kind === 'WHISTLEBLOWER_EVENT') return '监管与法务关心过程、来源和记录是否自洽，不负责给市场方向。';
  return '事件参与者有自己的利益，不能把其说法当作无动机事实。';
}

/**
 * Returns at most two current-state signals to mix into a scripted collision.
 * Only information already present in the player's current GameState is used.
 * No campaign future nodes, hidden outcomes, or unrevealed external data are read.
 */
export function current_state_signals(state: GameState, episode = state.current_episode_number ?? 1): ThesisSignal[] {
  const candidates = [
    regulatoryCandidate(state, episode),
    humanActionCandidate(state, episode),
    balanceSheetCandidate(state, episode),
    pbCandidate(state, episode),
    lpCandidate(state, episode),
    intelCandidate(state, episode),
  ].filter((x): x is Candidate => Boolean(x));

  candidates.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    // Avoid letting two versions of the same institutional pressure crowd out all
    // other information. Human PB/LP events already represent those categories.
    if (picked.some((x) => sameFamily(x.key, candidate.key))) continue;
    picked.push(candidate);
    if (picked.length >= 2) break;
  }
  return picked.map((x) => x.signal);
}

function sameFamily(a: string, b: string): boolean {
  const family = (x: string) => x.startsWith('human_PB_') || x === 'pb' || x === 'balance_sheet' ? 'funding'
    : x.startsWith('human_LP_') || x === 'lp' ? 'lp'
    : x.startsWith('human_REGULATORY_') || x.startsWith('human_INVESTIGATION') || x.startsWith('human_WHISTLEBLOWER') || x === 'regulatory' ? 'regulatory'
    : x;
  return family(a) === family(b);
}

export function interleave_state_signals(scripted: ThesisSignal[], dynamic: ThesisSignal[]): ThesisSignal[] {
  if (!dynamic.length) return [...scripted];
  const result: ThesisSignal[] = [];
  if (scripted[0]) result.push(scripted[0]);
  if (dynamic[0]) result.push(dynamic[0]);
  if (scripted[1]) result.push(scripted[1]);
  if (dynamic[1]) result.push(dynamic[1]);
  result.push(...scripted.slice(2));
  return result;
}
