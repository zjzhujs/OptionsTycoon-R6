import type { FundStats } from "../schemas";
import { SeededRNG } from "../rng";

export const COMPLIANCE_ESCALATION_THRESHOLD = 70;
export const COMPLIANCE_ESCALATION_TEMPLATE_ID = "sec_subpoena";

export function apply_compliance_delta(fund_stats: FundStats, delta: number): FundStats {
  fund_stats.compliance_risk = Math.max(0, Math.min(100, (fund_stats.compliance_risk ?? 0) + delta)); return fund_stats;
}
export function maybe_escalate(fund_stats: FundStats, already_pending_ids: Set<string>, rng: SeededRNG): string | null {
  if ((fund_stats.compliance_risk ?? 0) >= COMPLIANCE_ESCALATION_THRESHOLD && !already_pending_ids.has(COMPLIANCE_ESCALATION_TEMPLATE_ID) && rng.next_float() < 0.35) return COMPLIANCE_ESCALATION_TEMPLATE_ID;
  return null;
}

