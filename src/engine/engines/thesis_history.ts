import type { GameState, ThesisDriftAssessment, ThesisDriftFinding, ThesisRevision, TradeThesis } from "../schemas";
import { new_id } from "../ids";

const DIRECTIONAL = new Set(["BULLISH", "BEARISH"]);
const LEVEL_ORDER: Record<string, number> = { NONE: 0, MINOR: 1, MATERIAL: 2, SEVERE: 3 };
const INSTRUMENT_TERMS = ["call", "put", "option", "期权", "认购", "认沽", "iv", "vega", "theta", "gamma", "delta", "convex", "凸性", "leverage", "杠杆", "expiry", "expiration", "到期", "spread", "价差", "premium", "权利金", "波动率", "vol"];
const COMPANY_TERMS = ["long-term", "long term", "长期", "story", "叙事", "基本面", "fundamental", "moat", "护城河", "secular", "franchise", "company", "公司", "行业格局", "believe in", "看好公司", "价值"];

function max_level(levels: string[]): "NONE" | "MINOR" | "MATERIAL" | "SEVERE" {
  if (!levels.length) return "NONE";
  return levels.reduce((best, level) => LEVEL_ORDER[level] > LEVEL_ORDER[best] ? level : best, "NONE") as "NONE" | "MINOR" | "MATERIAL" | "SEVERE";
}

export function entry_revision_from_thesis(thesis: TradeThesis, node_index: number, underlying: number): ThesisRevision {
  return { revision_index: 0, revision_id: new_id(), game_date: thesis.created_at_date, node_index, direction: thesis.direction, catalyst: thesis.catalyst, expected_move_pct: thesis.expected_move_pct, time_horizon_days: thesis.time_horizon_days, invalidation_level: thesis.invalidation_level, why_instrument: thesis.why_instrument, risk_budget_usd: thesis.risk_budget_usd, revision_reason: "", underlying_at_revision: underlying, is_entry: true };
}

export function invalidation_breached(direction: string, invalidation_level: number, underlying: number): boolean | null {
  if (!DIRECTIONAL.has(direction) || invalidation_level <= 0 || underlying <= 0) return null;
  return direction === "BULLISH" ? underlying <= invalidation_level : underlying >= invalidation_level;
}

function invalidation_loosened(direction: string, old_level: number, new_level: number): boolean | null {
  if (!DIRECTIONAL.has(direction) || old_level <= 0 || new_level <= 0) return null;
  return direction === "BULLISH" ? new_level < old_level : new_level > old_level;
}

function looks_like(value: string | undefined, terms: string[]): boolean {
  const lower = (value ?? "").toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function normalized(value: string | undefined): string { return (value ?? "").toLowerCase().trim().split(/\s+/).join(" "); }

export function assess_drift(history: ThesisRevision[]): ThesisDriftAssessment {
  if (!history.length || history.length === 1) return { level: "NONE", revision_count: 0 };
  const entry = history[0];
  const findings: ThesisDriftFinding[] = [];
  const adaptive: string[] = [];
  for (const revision of history.slice(1)) {
    const previous = history[revision.revision_index - 1] ?? entry;
    const breached = invalidation_breached(previous.direction, previous.invalidation_level, revision.underlying_at_revision ?? 0);
    if (normalized(revision.catalyst) !== normalized(entry.catalyst)) {
      if (breached === true) findings.push({ rule_id: "catalyst_replaced_after_invalidation", level: "SEVERE", summary: "原催化剂已失效后，理由被替换为新的催化剂。", evidence: `${revision.game_date}: 入场催化剂「${entry.catalyst}」对应的止损位 ${previous.invalidation_level.toFixed(2)} 已被触发（标的 ${(revision.underlying_at_revision ?? 0).toFixed(2)}），但仓位继续持有，催化剂改为「${revision.catalyst}」。` });
      else {
        findings.push({ rule_id: "catalyst_changed", level: "MINOR", summary: "催化剂与入场时不同。", evidence: `${revision.game_date}: 「${entry.catalyst}」→「${revision.catalyst}」。变更理由：${revision.revision_reason || "(未填写)"}` });
        if (revision.revision_reason?.trim()) adaptive.push(`${revision.game_date}: 止损未触发时更新催化剂及理由 —— 属于合理观点更新 (ADAPTIVE REVISION)。`);
      }
    }
    if (entry.time_horizon_days > 0) {
      const ratio = revision.time_horizon_days / entry.time_horizon_days;
      const delta = revision.time_horizon_days - entry.time_horizon_days;
      if (ratio >= 2 && delta >= 5) findings.push({ rule_id: "horizon_extended_major", level: "MATERIAL", summary: "持仓周期大幅拉长。", evidence: `${revision.game_date}: ${entry.time_horizon_days} 天 → ${revision.time_horizon_days} 天（${ratio.toFixed(1)}x）。` });
      else if (ratio >= 1.5 && delta >= 3) findings.push({ rule_id: "horizon_extended", level: "MINOR", summary: "持仓周期被拉长。", evidence: `${revision.game_date}: ${entry.time_horizon_days} 天 → ${revision.time_horizon_days} 天（${ratio.toFixed(1)}x）。` });
    }
    const loosened = invalidation_loosened(previous.direction, previous.invalidation_level, revision.invalidation_level);
    if (loosened === true) {
      if (breached === true) findings.push({ rule_id: "invalidation_rewritten_after_breach", level: "SEVERE", summary: "止损触发后，止损位被放宽。", evidence: `${revision.game_date}: 标的 ${(revision.underlying_at_revision ?? 0).toFixed(2)} 已越过原止损位 ${previous.invalidation_level.toFixed(2)}，止损位随后被改为 ${revision.invalidation_level.toFixed(2)}。` });
      else findings.push({ rule_id: "invalidation_loosened", level: "MINOR", summary: "止损位被放宽（尚未触发）。", evidence: `${revision.game_date}: ${previous.invalidation_level.toFixed(2)} → ${revision.invalidation_level.toFixed(2)}。` });
    } else if (breached === true && normalized(revision.catalyst) === normalized(entry.catalyst)) {
      findings.push({ rule_id: "held_through_invalidation", level: "MATERIAL", summary: "止损触发，仓位仍未平。", evidence: `${revision.game_date}: 标的 ${(revision.underlying_at_revision ?? 0).toFixed(2)} 已越过止损位 ${previous.invalidation_level.toFixed(2)}。` });
    }
    if (revision.direction !== entry.direction) findings.push({ rule_id: "direction_changed", level: "MATERIAL", summary: "交易方向论据改变。", evidence: `${revision.game_date}: ${entry.direction} → ${revision.direction}。变更理由：${revision.revision_reason || "(未填写)"}` });
    if (looks_like(entry.why_instrument, INSTRUMENT_TERMS) && looks_like(revision.why_instrument, COMPANY_TERMS) && !looks_like(revision.why_instrument, INSTRUMENT_TERMS)) {
      findings.push({ rule_id: "instrument_thesis_became_company_thesis", level: "MATERIAL", summary: "工具论据被替换为公司长期看涨论点。", evidence: `${revision.game_date}: 入场理由「${entry.why_instrument}」是针对期权工具的，修订后变为「${revision.why_instrument}」。注意：期权有到期日，长期公司观点不能自动延续到一张会到期的合约上。（本条为关键词启发式判断，仅供参考）` });
    }
    if (revision.revision_reason?.trim() && breached === false) adaptive.push(`${revision.game_date}: 止损未触发时主动修订并说明原因。`);
  }
  return { level: max_level(findings.map((finding) => finding.level)), findings, revision_count: history.length - 1, adaptive_notes: [...new Set(adaptive)] };
}

export function get_history(state: GameState, position_id: string): ThesisRevision[] { return [...(state.thesis_history?.[position_id] ?? [])]; }

export function record_entry(state: GameState, position_id: string, thesis: TradeThesis, underlying: number): void {
  if (!thesis || state.thesis_history?.[position_id]) return;
  (state.thesis_history ??= {})[position_id] = [entry_revision_from_thesis(thesis, state.game_day_index ?? 0, underlying)];
}

export function append_revision(
  state: GameState,
  position_id: string,
  values: Omit<ThesisRevision, "revision_index" | "revision_id" | "node_index" | "is_entry" | "underlying_at_revision"> & { underlying: number },
): ThesisRevision {
  const history = state.thesis_history?.[position_id];
  if (!history) throw new Error("该持仓没有入场 Thesis，无法创建修订记录。");
  if (!values.revision_reason?.trim()) throw new Error("必须填写 Thesis 变更原因 (WHY DID YOUR THESIS CHANGE?)。");
  const revision: ThesisRevision = { revision_index: history.length, revision_id: new_id(), game_date: values.game_date, node_index: state.game_day_index ?? 0, direction: values.direction, catalyst: values.catalyst, expected_move_pct: values.expected_move_pct, time_horizon_days: values.time_horizon_days, invalidation_level: values.invalidation_level, why_instrument: values.why_instrument, risk_budget_usd: values.risk_budget_usd, revision_reason: values.revision_reason.trim(), underlying_at_revision: values.underlying, is_entry: false };
  history.push(revision);
  const active = state.active_theses?.[position_id];
  if (active) Object.assign(active, { direction: revision.direction, catalyst: revision.catalyst, expected_move_pct: revision.expected_move_pct, time_horizon_days: revision.time_horizon_days, invalidation_level: revision.invalidation_level, why_instrument: revision.why_instrument, risk_budget_usd: revision.risk_budget_usd });
  return revision;
}

export function open_position_drift(state: GameState): Record<string, ThesisDriftAssessment> {
  const open_ids = new Set((state.positions ?? []).map((position) => position.id));
  const result: Record<string, ThesisDriftAssessment> = {};
  for (const [id, history] of Object.entries(state.thesis_history ?? {})) if (open_ids.has(id) && history.length > 1) result[id] = assess_drift(history);
  return result;
}

