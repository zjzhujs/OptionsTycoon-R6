import type { GameState, TimelineEvent } from "../schemas";

function hash_id(parts: string[]): string { let hash = 2166136261; for (const char of parts.join("|") ) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; } return hash.toString(16).padStart(8, "0"); }
function node_index_for_date(date_to_index: Record<string, number>, date: string): number { return date_to_index[date] ?? -1; }
function in_window(date: string, start?: string, end?: string): boolean { return Boolean(date) && (!start || date >= start) && (!end || date <= end); }

export function collect_events(state: GameState, date_to_index: Record<string, number>, start_date?: string, end_date?: string, position_id = ""): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const add = (date: string, actor: TimelineEvent["actor"], category: string, headline: string, detail = "", pos = "", source_type: TimelineEvent["source_type"] = "DERIVED_REAL_INPUTS") => {
    if (!in_window(date, start_date, end_date)) return;
    out.push({ event_id: hash_id([category, date, headline.slice(0, 40), pos]), game_date: date, node_index: node_index_for_date(date_to_index, date), actor, category, headline, detail, position_id: pos, source_type });
  };
  for (const entry of state.order_log ?? []) add(entry.date, entry.kind === "green" || entry.kind === "blue" ? "PLAYER" : "SYSTEM", entry.kind === "green" || entry.kind === "blue" ? "ORDER" : "MARKET_MESSAGE", entry.message);
  for (const [id, history] of Object.entries(state.thesis_history ?? {})) {
    if (position_id && id !== position_id) continue;
    for (const revision of history) add(revision.game_date, "PLAYER", revision.is_entry ? "THESIS_ENTRY" : "THESIS_REVISION", revision.is_entry ? `建立入场 Thesis：${revision.direction}` : `修订 Thesis（第 ${revision.revision_index} 次）`, revision.is_entry ? `催化剂：${revision.catalyst}｜止损位：${revision.invalidation_level.toFixed(2)}｜周期：${revision.time_horizon_days} 天` : `变更原因：${revision.revision_reason}｜催化剂：${revision.catalyst}｜止损位：${revision.invalidation_level.toFixed(2)}｜周期：${revision.time_horizon_days} 天`, id, "DERIVED");
  }
  for (const story of state.story_history ?? []) { add(story.game_date, "CHARACTER", "INTEL", story.headline, story.body.slice(0, 160), "", "SIMULATED"); if (story.resolved) add(story.resolved_on_date ?? story.game_date, "PLAYER", "INTEL_RESPONSE", `回应情报：${story.headline}`, `选择：${story.chosen_choice_id ?? "(未记录)"}`, "", "DERIVED_REAL_INPUTS"); }
  for (const action of state.human_action_events ?? []) { add(action.date, "INSTITUTION", "HUMAN_ACTION", action.headline, action.body.slice(0, 160), "", action.source_type); if (action.resolved) add(action.resolved_on_date ?? action.date, "PLAYER", "HUMAN_ACTION_RESPONSE", `处理事件：${action.headline}`, `选择：${action.chosen_choice_id ?? "(未记录)"}｜${(action.impact_summary ?? "").slice(0, 120)}`); else add(action.date, "PLAYER", "IGNORED_WARNING", `未处理：${action.headline}`, "该事件在本次交易窗口内始终未被回应。", "", "DERIVED_REAL_INPUTS"); }
  for (const policy of state.political_state?.active_policies ?? []) add(policy.date, "POLITICAL", policy.branch === "GEOPOLITICS" ? "GEOPOLITICS" : "POLICY", policy.headline, `影响板块：${policy.sector_impact}｜${policy.potential_transmission}`, "", policy.source_type);
  for (const decision of state.player_decisions ?? []) if ((!position_id || !decision.position_id || decision.position_id === position_id) && in_window(decision.game_date, start_date, end_date)) out.push(decision);
  for (const entry of state.capital_spend_log ?? []) add(entry.date, "PLAYER", `SPEND_${entry.category}`, entry.label, `$${entry.amount_usd.toFixed(0)} · ${entry.wallet} · ${entry.legality_class ?? ""}`);
  for (const record of state.evidence_state?.records ?? []) add(record.date, "SYSTEM", "EVIDENCE", record.description, `Evidence +${record.evidence_points.toFixed(0)} · ${record.legality_class}`, "", "SIMULATED");
  return out;
}

function sort_key(event: TimelineEvent): [string, number] { return [event.game_date, ({ MARKET: 0, POLITICAL: 1, INSTITUTION: 2, CHARACTER: 3, SYSTEM: 4, PLAYER: 5 } as Record<string, number>)[event.actor] ?? 9]; }

export function build_timeline(state: GameState, nodes: { date: string }[], start_date?: string, end_date?: string, position_id = "", limit = 0): TimelineEvent[] {
  const date_to_index = Object.fromEntries(nodes.map((node, index) => [node.date, index])); const events = collect_events(state, date_to_index, start_date, end_date, position_id); const unique = [...new Map(events.sort((a, b) => sort_key(a)[0].localeCompare(sort_key(b)[0]) || sort_key(a)[1] - sort_key(b)[1]).map((event) => [event.event_id, event])).values()]; return limit && unique.length > limit ? unique.slice(-limit) : unique;
}

export function record_decision(state: GameState, nodes: { date: string }[], category: string, headline: string, detail = "", position_id = "", game_date_override = ""): TimelineEvent {
  const fallbackIndex = nodes.length ? Math.max(0, Math.min(nodes.length - 1, state.game_day_index ?? 0)) : 0; const overrideIndex = game_date_override ? nodes.findIndex((node) => node.date === game_date_override) : -1; const index = overrideIndex >= 0 ? overrideIndex : fallbackIndex; const date = game_date_override || nodes[index]?.date || ""; const decisions = (state.player_decisions ??= []); const event: TimelineEvent = { event_id: hash_id([category, date, headline.slice(0, 40), position_id, String(decisions.length)]), game_date: date, node_index: index, actor: "PLAYER", category, headline, detail, position_id, source_type: "DERIVED_REAL_INPUTS" }; decisions.push(event); return event;
}

