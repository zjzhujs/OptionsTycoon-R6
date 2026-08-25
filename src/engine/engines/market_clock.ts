import type { GameState, GameStateView, MarketClockState, PauseReason } from "../schemas";
import { invalidation_breached } from "./thesis_history";

export const POSITION_ALERT_PCT = 20;
export const SIGNIFICANT_PROFIT_RETURN = 0.4;
export const GIVEBACK_FROM_PEAK = 0.3;

function position_label(position: NonNullable<GameState["positions"]>[number]): string {
  return position.kind === "option" && position.type ? `${position.underlying} ${position.type.toUpperCase()} ${position.strike ?? ""}` : position.underlying;
}

export function position_decision_triggers(state: GameState, view: GameStateView, current_underlying?: number): PauseReason[] {
  const marks = new Map((view.position_marks ?? []).map((mark) => [mark.position_id, mark.pl]));
  const reasons: PauseReason[] = [];
  for (const position of state.positions ?? []) {
    if (position.kind !== "option") continue;
    const cost_basis = Math.abs(position.entry_price) * 100 * Math.abs(position.qty);
    const current_pl = marks.get(position.id);
    if (!cost_basis || current_pl == null) continue;
    const label = position_label(position);
    let invalidation_reason: PauseReason | undefined;
    const thesis = state.active_theses?.[position.id];
    if (!position.invalidation_decision_fired && current_underlying != null && thesis && invalidation_breached(thesis.direction, thesis.invalidation_level, current_underlying) === true) {
      const breach_verb = thesis.direction === "BULLISH" ? "已跌破" : "已涨破";
      invalidation_reason = { trigger_id: "position_decision", severity: "NOTABLE", headline: `THESIS INVALIDATION — ${label}`, detail: `标的现价 ${current_underlying.toFixed(2)} ${breach_verb}你自己设定的失效位 ${thesis.invalidation_level.toFixed(2)}。`, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS", position_id: position.id };
    }
    let giveback_reason: PauseReason | undefined;
    const peak = position.peak_unrealized_pl ?? 0;
    if (!position.profit_giveback_decision_fired && peak > 0 && current_pl <= (1 - GIVEBACK_FROM_PEAK) * peak) {
      const giveback_pct = (1 - current_pl / peak) * 100;
      giveback_reason = { trigger_id: "position_decision", severity: "NOTABLE", headline: `PROFIT GIVEBACK — ${label}`, detail: `浮盈已从峰值 ${peak.toFixed(2)} 回吐至 ${current_pl.toFixed(2)}（回吐 ${giveback_pct.toFixed(0)}%）。`, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS", position_id: position.id };
    }
    let significant_reason: PauseReason | undefined;
    if (!position.significant_profit_decision_fired && current_pl / cost_basis >= SIGNIFICANT_PROFIT_RETURN) significant_reason = { trigger_id: "position_decision", severity: "NOTABLE", headline: `SIGNIFICANT PROFIT — ${label}`, detail: `未实现盈亏 ${current_pl.toFixed(2)}，占权利金成本 ${(current_pl / cost_basis * 100).toFixed(0)}%。未实现盈亏不是已实现盈亏。在平仓之前，一分钱都还没落袋。`, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS", position_id: position.id };
    if (invalidation_reason) position.invalidation_decision_fired = true;
    if (giveback_reason) position.profit_giveback_decision_fired = true;
    if (significant_reason) position.significant_profit_decision_fired = true;
    reasons.push(invalidation_reason ?? giveback_reason ?? significant_reason ?? null as never);
  }
  return reasons.filter(Boolean);
}

function cost_basis_at_risk(state: GameState): number {
  return (state.positions ?? []).filter((position) => position.kind === "option").reduce((sum, position) => sum + Math.abs(position.entry_price) * 100 * Math.abs(position.qty), 0);
}

export function capture_pre_advance(state: GameState, view: GameStateView): Record<string, unknown> {
  return {
    unrealized_pnl: view.unrealized_pnl ?? 0,
    equity: view.equity ?? 0,
    cost_basis: cost_basis_at_risk(state),
    margin_call_active: Boolean(view.margin_call_active),
    open_position_ids: new Set((state.positions ?? []).map((position) => position.id)),
    policy_ids: new Set((state.political_state?.active_policies ?? []).map((policy) => policy.id)),
    unresolved_human: new Set((state.human_action_events ?? []).filter((event) => !event.resolved).map((event) => event.id)),
  };
}

export function evaluate_pause(
  state: GameState,
  view: GameStateView,
  before: Record<string, unknown>,
  settle_logs: string[] = [],
  current_underlying?: number,
): PauseReason[] {
  const reasons: PauseReason[] = [];
  if (view.margin_call_active && !before.margin_call_active) reasons.push({ trigger_id: "margin_call", severity: "MANDATORY", headline: "PRIME BROKER MARGIN CALL", detail: `维持保证金要求 ${(view.margin_requirement ?? 0).toFixed(0)}，当前净资产 ${view.equity.toFixed(0)}。`, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS" });
  for (const detail of settle_logs) reasons.push({ trigger_id: "option_expiry", severity: "MANDATORY", headline: "OPTION EXPIRY SETTLED", detail, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS" });
  const before_human = before.unresolved_human instanceof Set ? before.unresolved_human as Set<string> : new Set<string>();
  for (const event of state.human_action_events ?? []) if (!event.resolved && !before_human.has(event.id)) reasons.push({ trigger_id: "human_action_pending", severity: "MANDATORY", headline: `决策待处理：${event.headline}`, detail: event.body.slice(0, 180), source_panel: "HUMAN_ACTION", source_type: event.source_type });
  for (const event of state.pending_story_events ?? []) if (!event.resolved) reasons.push({ trigger_id: "story_choice_pending", severity: "MANDATORY", headline: `待回应：${event.headline}`, detail: event.body.slice(0, 180), source_panel: "INTEL", source_type: "SIMULATED" });
  for (const lp of state.lp_profiles ?? []) if (lp.redemption_risk === "CRITICAL" || lp.redemption_risk === "REDEEMING") reasons.push({ trigger_id: "lp_redemption_pressure", severity: "MANDATORY", headline: `LP 赎回压力：${lp.name}`, detail: `赎回风险等级 ${lp.redemption_risk}，信心 ${(lp.confidence_score ?? 0).toFixed(0)}。${lp.simulated_notice ?? ""}`, source_panel: "LP_RELATIONS", source_type: "SIMULATED" });
  const cost_basis = typeof before.cost_basis === "number" ? before.cost_basis : 0;
  if (cost_basis > 0) {
    const prior = typeof before.unrealized_pnl === "number" ? before.unrealized_pnl : 0;
    const delta = view.unrealized_pnl - prior;
    const move_pct = Math.abs(delta) / cost_basis * 100;
    if (move_pct >= POSITION_ALERT_PCT) reasons.push({ trigger_id: "position_alert", severity: "NOTABLE", headline: "POSITION ALERT", detail: `未实现盈亏${delta > 0 ? "上升" : "下降"} ${Math.abs(delta).toFixed(0)}（占期权持仓成本 ${move_pct.toFixed(1)}%）。未实现盈亏不是已实现盈亏。在平仓之前，一分钱都还没落袋。`, source_panel: "PORTFOLIO", source_type: "DERIVED_REAL_INPUTS" });
  }
  const before_policies = before.policy_ids instanceof Set ? before.policy_ids as Set<string> : new Set<string>();
  for (const policy of state.political_state?.active_policies ?? []) if (!before_policies.has(policy.id)) reasons.push({ trigger_id: "policy_alert", severity: "NOTABLE", headline: policy.headline, detail: `影响板块：${policy.sector_impact}。${policy.potential_transmission}`, source_panel: "POLICY", source_type: policy.source_type });
  reasons.push(...position_decision_triggers(state, view, current_underlying));
  return reasons;
}

export function has_mandatory(reasons: PauseReason[]): boolean { return reasons.some((reason) => reason.severity === "MANDATORY"); }
export function should_stop(reasons: PauseReason[], mode: "NEXT_NODE" | "NEXT_MAJOR_EVENT"): boolean { return mode === "NEXT_NODE" || reasons.length > 0; }

export function refresh(state: GameState, nodes: { date: string }[], mode?: "NEXT_NODE" | "NEXT_MAJOR_EVENT", advanced = 0, reasons: PauseReason[] = []): MarketClockState {
  const total_nodes = nodes.length;
  const index = total_nodes ? Math.max(0, Math.min(total_nodes - 1, state.game_day_index ?? 0)) : 0;
  const clock: MarketClockState = { paused: true, node_granularity: "DAILY", current_node_index: index, current_node_date: total_nodes ? nodes[index].date : "", total_nodes, is_final_node: total_nodes > 0 && index >= total_nodes - 1, last_advance_mode: mode, nodes_advanced_last_call: advanced, pause_reasons: [...reasons] };
  clock.advance_label = "ADVANCE MARKET";
  clock.next_node_label = "NEXT MARKET NODE";
  state.market_clock = clock;
  return clock;
}
