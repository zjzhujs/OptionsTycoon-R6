import type { EvidenceRecord, GameState, HumanActionChoice, HumanActionEvent, InvestigationStage } from "../schemas";
import { new_id } from "../ids";
import { SeededRNG } from "../rng";

export const INVESTIGATION_STAGE_ORDER: InvestigationStage[] = ["CLEAN", "SUSPICIOUS", "INTERNAL_CONCERN", "REGULATORY_INQUIRY", "FORMAL_INVESTIGATION", "CIVIL_ENFORCEMENT", "CRIMINAL_INVESTIGATION", "CHARGED", "SETTLED", "TRIAL", "CONVICTED", "ACQUITTED"];
const ESCALATION_ROLL_FLOOR: Partial<Record<InvestigationStage, number>> = { CLEAN: 0, SUSPICIOUS: 0.15, INTERNAL_CONCERN: 0.2, REGULATORY_INQUIRY: 0.18, FORMAL_INVESTIGATION: 0.15, CIVIL_ENFORCEMENT: 0.12, CRIMINAL_INVESTIGATION: 0.1, CHARGED: 0.08 };
const state_internals = (state: GameState): any => state as any;

export function record_action(state: GameState, event: HumanActionEvent, choice: HumanActionChoice, resolved_on_date: string): void {
  const deltas = [choice.evidence_points_delta, choice.witness_delta, choice.internal_awareness_delta, choice.external_awareness_delta, choice.compliance_risk_delta, choice.information_ethics_delta];
  if (!deltas.some(Boolean)) return;
  const s = state_internals(state); const evidence = s.evidence_state;
  evidence.evidence_points = Math.max(0, evidence.evidence_points + (choice.evidence_points_delta ?? 0)); evidence.witness_count = Math.max(0, evidence.witness_count + (choice.witness_delta ?? 0)); evidence.internal_awareness = Math.max(0, Math.min(100, evidence.internal_awareness + (choice.internal_awareness_delta ?? 0))); evidence.external_awareness = Math.max(0, Math.min(100, evidence.external_awareness + (choice.external_awareness_delta ?? 0))); evidence.whistleblower_risk = Math.max(0, Math.min(100, evidence.internal_awareness * 0.5 + evidence.witness_count * 4)); evidence.enforcement_interest = Math.max(0, Math.min(100, evidence.external_awareness * 0.6 + evidence.evidence_points * 0.3));
  if (choice.legality_class && choice.legality_class !== "LEGAL") {
    const record: EvidenceRecord = { id: new_id(), date: resolved_on_date, category: event.action_kind, description: `${event.headline} -- ${choice.label}`, evidence_points: choice.evidence_points_delta ?? 0, witness_ids: event.character_id ? [event.character_id] : [], legality_class: choice.legality_class, related_action_id: event.id };
    evidence.records.push(record);
  }
  if (choice.compliance_risk_delta) s.fund_stats.compliance_risk = Math.max(0, Math.min(100, (s.fund_stats.compliance_risk ?? 0) + choice.compliance_risk_delta));
  if (choice.information_ethics_delta) s.hidden_state.information_ethics = Math.max(0, Math.min(100, (s.hidden_state.information_ethics ?? 0) + choice.information_ethics_delta));
}

function next_stage(current: InvestigationStage): InvestigationStage | null { const index = INVESTIGATION_STAGE_ORDER.indexOf(current); return index < 0 || index + 1 >= INVESTIGATION_STAGE_ORDER.length ? null : INVESTIGATION_STAGE_ORDER[index + 1]; }
function stage_narrative(stage: InvestigationStage): [string, string] {
  const table: Partial<Record<InvestigationStage, [string, string]>> = {
    SUSPICIOUS: ["Marcus Reed：有些交易时点看起来太巧了", "合规官 Marcus Reed 提醒你，近期几笔交易时点异常。他尚未正式立档，但已起疑。"],
    INTERNAL_CONCERN: ["内部关注：合规部门启动非正式复核", "Marcus Reed 启动了非正式的内部交易复核。团队中已察觉异样。"],
    REGULATORY_INQUIRY: ["SEC 发出非正式问询函", "SEC 就几笔交易时点发出非正式问询函。虽非正式调查，律师建议严阵以待。"],
    FORMAL_INVESTIGATION: ["正式调查启动", "监管已将问询升级为正式调查，要求提交通讯与交易日志。PB 与 LP 很快会得知此事。"],
    CIVIL_ENFORCEMENT: ["民事执法程序", "监管启动民事执法程序，寻求天价罚款与不当得利追缴。"],
    CRIMINAL_INVESTIGATION: ["司法部介入：刑事调查", "DOJ 介入，定性为刑事调查。个人法律风险急剧上升。"],
    CHARGED: ["正式被指控", "检方正式指控。基金存续与你的个人自由都面临实质性终结风险。"],
  };
  return table[stage] ?? ["调查状态更新", "调查状态已更新。"];
}

export function maybe_escalate(state: GameState, node_date: string, rng: SeededRNG): [HumanActionEvent | null, string[]] {
  const s = state_internals(state); const evidence = s.evidence_state; const stage: InvestigationStage = evidence.investigation_stage; const logs: string[] = [];
  if (stage === "CLEAN" && evidence.evidence_points <= 0) return [null, logs];
  if (["CONVICTED", "ACQUITTED", "SETTLED"].includes(stage)) return [null, logs];
  const pressure = evidence.evidence_points * 0.01 + evidence.enforcement_interest * 0.004 + evidence.whistleblower_risk * 0.003;
  const threshold = Math.min(0.85, (ESCALATION_ROLL_FLOOR[stage] ?? 0.1) + pressure);
  if (rng.next_float() >= threshold) return [null, logs];
  const next = next_stage(stage); if (!next) return [null, logs]; evidence.investigation_stage = next; evidence.last_escalation_date = node_date; logs.push(`调查状态升级：${stage} → ${next}（${node_date}）。`);
  const [headline, body] = stage_narrative(next);
  return [{ id: `investigation_${next.toLowerCase()}_${node_date}_${new_id().slice(0, 6)}`, date: node_date, action_kind: "INVESTIGATION_ESCALATION", character_id: evidence.investigator_character_id, headline, body, choices: [{ id: "ack", label: "知悉并继续", result_narrative: "已记录本次升级。" }], source_type: "SIMULATED" }, logs];
}

export function maybe_whistleblower(state: GameState, node_date: string, rng: SeededRNG): [HumanActionEvent | null, string[]] {
  const s = state_internals(state); const evidence = s.evidence_state;
  if (evidence.whistleblower_risk <= 0 || evidence.witness_count <= 0 || rng.next_float() >= Math.min(0.5, evidence.whistleblower_risk / 150)) return [null, []];
  evidence.external_awareness = Math.max(0, Math.min(100, evidence.external_awareness + 15)); evidence.enforcement_interest = Math.max(0, Math.min(100, evidence.enforcement_interest + 10));
  return [{ id: `whistleblower_${node_date}_${new_id().slice(0, 6)}`, date: node_date, action_kind: "WHISTLEBLOWER_EVENT", headline: "有人泄密", body: "一名内部或外部的知情人士向外泄露了信息。具体是谁、说了多少，暂无法确认。", choices: [{ id: "acknowledge", label: "知悉此事", result_narrative: "已记录。外部知情范围已经扩大，无法收回。" }], source_type: "SIMULATED" }, ["一起 Whistleblower 事件已触发，外部知情度上升。"]];
}

export function pb_reaction(state: GameState): string[] {
  const s = state_internals(state); const stage: InvestigationStage = s.evidence_state.investigation_stage; if (INVESTIGATION_STAGE_ORDER.indexOf(stage) < INVESTIGATION_STAGE_ORDER.indexOf("REGULATORY_INQUIRY")) return [];
  const logs: string[] = [];
  for (const [bank_id, relation] of Object.entries(s.institutional_relationships ?? {})) { if (!relation || typeof relation !== "object") continue; const rel = relation as Record<string, number>; const trust = rel.trust ?? 60; if (trust > 30) { rel.trust = Math.max(0, trust - 15); rel.financing_spread_bps = (rel.financing_spread_bps ?? 150) + 40; logs.push(`${bank_id.toUpperCase()} 主经纪商已知悉调查动态，上调融资点差并下调信任分。`); } }
  return logs;
}

export function lp_reaction(state: GameState): string[] {
  const s = state_internals(state); const stage: InvestigationStage = s.evidence_state.investigation_stage; if (INVESTIGATION_STAGE_ORDER.indexOf(stage) < INVESTIGATION_STAGE_ORDER.indexOf("REGULATORY_INQUIRY")) return [];
  const logs: string[] = [];
  for (const lp of s.lp_profiles ?? []) { const sensitivity = ({ LOW: 0.3, STANDARD: 1, HIGH: 1.8 } as Record<string, number>)[lp.compliance_sensitivity] ?? 1; lp.confidence_score = Math.max(0, lp.confidence_score - 12 * sensitivity); if (lp.confidence_score < 40 && ["LOW", "ELEVATED"].includes(lp.redemption_risk)) { lp.redemption_risk = "CRITICAL"; logs.push(`${lp.name} 因合规调查信心大幅下滑，赎回风险升至 CRITICAL。`); } }
  return logs;
}

