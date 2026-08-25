import type { AIStackLevel, EmployeeRole, GameState, Employee, DataSubscription, ManagementCompanyState } from "../schemas";
import { new_id } from "../ids";
import { distributeAuditedGpDividend, ensureEconomyState, injectGpCapital as transferGpCapital, isCashPreservation } from "./economy_core";

export const DAYS_PER_YEAR = 365;
export const ROLE_SALARY: Record<EmployeeRole, number> = {
  RESEARCH_ASSOCIATE: 140000, SENIOR_ANALYST: 260000, MACRO_STRATEGIST: 320000, QUANT_RESEARCHER: 300000, RISK_MANAGER: 240000, COMPLIANCE_OFFICER: 200000, LEGAL_COUNSEL: 280000, DATA_ENGINEER: 210000, AI_ENGINEER: 260000, INVESTOR_RELATIONS: 190000, OPERATIONS: 150000,
};
export const ROLE_FICTIONAL_NAMES: Record<EmployeeRole, string[]> = {
  RESEARCH_ASSOCIATE: ["Priya Nair", "Tom Delacroix", "Yuki Sato"], SENIOR_ANALYST: ["Grace Whitfield", "Marcus Elling"], MACRO_STRATEGIST: ["Owen Baptiste", "InesAld"], QUANT_RESEARCHER: ["Ravi Chandran", "Lena Kowalski"], RISK_MANAGER: ["Derek Song", "Farah Nasser"], COMPLIANCE_OFFICER: ["Bianca Ruiz", "Colin Fenwick"], LEGAL_COUNSEL: ["Harriet Byun", "Simon Okafor"], DATA_ENGINEER: ["Petra Vance", "Ahmed Farouk"], AI_ENGINEER: ["Nina Torval", "Kwame Boateng"], INVESTOR_RELATIONS: ["Charlotte Reyes", "Julian Voss"], OPERATIONS: ["Mateo Alvarez", "Sophie Lindqvist"],
};
export const DATA_CATALOG: Record<string, { name: string; category: string; monthly_cost: number }> = {
  options_flow_premium: { name: "机构级期权流数据订阅", category: "OPTIONS_DATA", monthly_cost: 8000 }, alt_data_satellite: { name: "另类数据 · 卫星与信用卡流水", category: "ALT_DATA", monthly_cost: 15000 }, news_wire_premium: { name: "高级新闻电报订阅", category: "NEWS", monthly_cost: 3000 }, filings_parser: { name: "监管文件自动解析工具", category: "FILINGS", monthly_cost: 5000 }, transcript_analytics: { name: "财报电话会议转录分析", category: "TRANSCRIPTS", monthly_cost: 6000 }, macro_data_terminal: { name: "宏观数据终端", category: "MACRO", monthly_cost: 4500 }, policy_research_service: { name: "政策研究订阅服务", category: "POLICY", monthly_cost: 5500 },
};
export const AI_STACK_COST: Record<AIStackLevel, { monthly_compute: number; headcount: number; hallucination_risk: number }> = {
  LEVEL_0_MANUAL: { monthly_compute: 0, headcount: 0, hallucination_risk: 15 }, LEVEL_1_ASSISTANT: { monthly_compute: 12000, headcount: 1, hallucination_risk: 22 }, LEVEL_2_MULTI_AGENT: { monthly_compute: 35000, headcount: 3, hallucination_risk: 18 }, LEVEL_3_INSTITUTIONAL: { monthly_compute: 90000, headcount: 6, hallucination_risk: 12 },
};
export const AI_UPGRADE_SETUP_COST: Record<AIStackLevel, number> = { LEVEL_1_ASSISTANT: 50000, LEVEL_2_MULTI_AGENT: 200000, LEVEL_3_INSTITUTIONAL: 750000 } as Record<AIStackLevel, number>;

function internals(state: GameState): any { return state as any; }

export function recompute_burn(mc: ManagementCompanyState): ManagementCompanyState {
  const annual = (mc.payroll_cost_annual ?? 0) + (mc.data_cost_annual ?? 0) + (mc.ai_compute_cost_annual ?? 0) + (mc.legal_cost_annual ?? 0) + (mc.compliance_cost_annual ?? 0) + (mc.technology_cost_annual ?? 0) + (mc.ir_cost_annual ?? 0) + (mc.other_operating_cost_annual ?? 0);
  mc.annualized_burn = annual; mc.monthly_burn = annual / 12; mc.runway_months = mc.monthly_burn > 0 ? (mc.cash ?? 0) / mc.monthly_burn : 999;
  return mc;
}

export function recompute_cost_buckets(state: GameState): void {
  const s = internals(state); const mc = s.management_company;
  const employees: Employee[] = s.employees ?? []; const subscriptions: DataSubscription[] = s.data_subscriptions ?? []; const ai = s.ai_stack;
  mc.payroll_cost_annual = employees.reduce((sum, employee) => sum + employee.salary_annual * (1 + (employee.bonus_expectation_pct ?? 0) / 100), 0);
  mc.headcount = employees.length;
  mc.data_cost_annual = subscriptions.filter((subscription) => subscription.active).reduce((sum, subscription) => sum + subscription.monthly_cost * 12, 0);
  const levelKey = (ai?.level ?? "LEVEL_0_MANUAL") as AIStackLevel;
  const ai_cfg = AI_STACK_COST[levelKey] ?? AI_STACK_COST.LEVEL_0_MANUAL;
  ai.monthly_compute_cost = ai_cfg.monthly_compute; ai.engineering_headcount = ai_cfg.headcount; ai.hallucination_risk = ai_cfg.hallucination_risk;
  mc.ai_compute_cost_annual = ai.monthly_compute_cost * 12;
  recompute_burn(mc);
}

export function accrue_days(state: GameState, _node_date: string, days_elapsed: number): string[] {
  if (days_elapsed <= 0) return [];
  const s = internals(state); const mc = s.management_company; const logs: string[] = [];
  for (let day = 0; day < days_elapsed; day += 1) {
    const daily_fee = s.fund_stats.aum * (mc.management_fee_rate ?? 0) / DAYS_PER_YEAR;
    if (daily_fee > 0) { mc.cash += daily_fee; mc.fee_income_ytd += daily_fee; }
    const daily_burn = (mc.annualized_burn ?? 0) / DAYS_PER_YEAR;
    if (daily_burn > 0) mc.cash -= daily_burn;
  }
  recompute_burn(mc);
  logs.push(`管理费/运营开销已按 ${days_elapsed} 天计提：管理公司现金 ${(mc.cash ?? 0).toFixed(0)}，跑道 ${(mc.runway_months ?? 0).toFixed(1)} 个月。`);
  return logs;
}

export function accrue_performance_fee(state: GameState, current_equity: number, _node_date: string): string[] {
  const mc = internals(state).management_company;
  if (current_equity <= (mc.high_water_mark ?? 0)) return [];
  const gain = current_equity - (mc.high_water_mark ?? 0); const fee = gain * (mc.performance_fee_rate ?? 0);
  mc.high_water_mark = current_equity;
  if (fee <= 0) return [];
  mc.cash += fee; mc.performance_income_ytd += fee;
  return [`业绩报酬计提：NAV 创新高 ${current_equity.toFixed(0)}，超出前高水位线 ${gain.toFixed(0)}，按 ${((mc.performance_fee_rate ?? 0) * 100).toFixed(0)}% 计提 ${fee.toFixed(0)} 进入管理公司现金。`];
}

export function hire_employee(state: GameState, role: EmployeeRole, name: string | undefined, node_date: string): [boolean, string, Employee] {
  const s = internals(state); ensureEconomyState(state);
  if (isCashPreservation(state)) return [false, "CASH_PRESERVATION：跑道低于 1 个月，已冻结新招聘。", {} as Employee];
  const salary = ROLE_SALARY[role]; const names = ROLE_FICTIONAL_NAMES[role] ?? ["Fictional Hire"]; const display_name = name || names[(s.employees?.length ?? 0) % names.length];
  const employee: Employee = { id: new_id(), name: display_name, role, salary_annual: salary, hired_date: node_date, bonus_expectation_pct: 15, morale: 70, loyalty: 60, skill: 50, capacity_pct: 100, poaching_risk: 10, fictional: true, simulated_notice: "SIMULATED EMPLOYEE -- fictional hire, not a real person." };
  s.employees.push(employee); recompute_cost_buckets(state); return [true, `已聘用 ${display_name}（${role}），年薪 $${salary.toFixed(0)}。`, employee];
}

export function fire_employee(state: GameState, employee_id: string): [boolean, string] {
  const s = internals(state); const before = s.employees.length; const fired = s.employees.find((employee: Employee) => employee.id === employee_id); s.employees = s.employees.filter((employee: Employee) => employee.id !== employee_id);
  if (s.employees.length === before) return [false, "未找到该员工。"]; recompute_cost_buckets(state); return [true, `已裁撤 ${fired?.name ?? employee_id}，年化薪酬开支相应下降。`];
}

export function adjust_bonus(state: GameState, employee_id: string, bonus_pct: number, node_date: string): [boolean, string] {
  const s = internals(state); if (isCashPreservation(state)) return [false, "CASH_PRESERVATION：跑道低于 1 个月，已冻结留任奖金。"]; const employee = s.employees.find((candidate: Employee) => candidate.id === employee_id); if (!employee) return [false, "未找到该员工。"];
  const payout = employee.salary_annual * Math.max(0, bonus_pct) / 100; if (payout > s.management_company.cash) return [false, `管理公司现金不足以支付该奖金（需要 $${payout.toFixed(0)}）。`];
  s.management_company.cash -= payout; employee.bonus_expectation_pct = bonus_pct; const delta = bonus_pct - 15;
  employee.morale = Math.max(0, Math.min(100, (employee.morale ?? 0) + delta * 0.6)); employee.loyalty = Math.max(0, Math.min(100, (employee.loyalty ?? 0) + delta * 0.5)); employee.poaching_risk = Math.max(0, Math.min(100, (employee.poaching_risk ?? 0) - delta * 0.4)); recompute_cost_buckets(state);
  s.capital_spend_log.push({ id: new_id(), date: node_date, category: "TEAM", label: `${employee.name} 奖金`, amount_usd: payout, wallet: "MANAGEMENT_COMPANY", legality_class: "LEGAL" });
  return [true, `已向 ${employee.name} 支付 $${payout.toFixed(0)} 奖金，士气与忠诚度相应变化。`];
}

export function subscribe_data(state: GameState, key: string, node_date: string): [boolean, string] {
  const s = internals(state); const catalog = DATA_CATALOG[key]; if (!catalog) return [false, "未知数据订阅项。"]; if (isCashPreservation(state)) return [false, "CASH_PRESERVATION：跑道低于 1 个月，已冻结新增非核心订阅。"]; if (s.data_subscriptions.some((subscription: DataSubscription) => subscription.id === key && subscription.active)) return [false, "该订阅已经处于激活状态。"];
  const subscription: DataSubscription = { id: key, name: catalog.name, category: catalog.category, monthly_cost: catalog.monthly_cost, active: true, subscribed_date: node_date, provenance_note: "模拟管理公司数据订阅成本" };
  s.data_subscriptions = s.data_subscriptions.filter((item: DataSubscription) => item.id !== key).concat(subscription); recompute_cost_buckets(state); s.capital_spend_log.push({ id: new_id(), date: node_date, category: "DATA", label: subscription.name, amount_usd: subscription.monthly_cost * 12, wallet: "MANAGEMENT_COMPANY", legality_class: "LEGAL" }); return [true, `已订阅 ${subscription.name}，月费 $${subscription.monthly_cost.toFixed(0)}。`];
}

export function cancel_data_subscription(state: GameState, subscription_id: string): [boolean, string] {
  const s = internals(state); const subscription = s.data_subscriptions.find((item: DataSubscription) => item.id === subscription_id); if (!subscription || !subscription.active) return [false, "未找到该订阅或订阅已取消。"]; subscription.active = false; recompute_cost_buckets(state); return [true, `已取消 ${subscription.name} 订阅，年化开支下降 $${(subscription.monthly_cost * 12).toFixed(0)}。`];
}

export function upgrade_ai_stack(state: GameState, target: AIStackLevel, node_date: string): [boolean, string] {
  const s = internals(state); if (isCashPreservation(state)) return [false, "CASH_PRESERVATION：跑道低于 1 个月，已冻结算力升级。"]; const order: AIStackLevel[] = ["LEVEL_0_MANUAL", "LEVEL_1_ASSISTANT", "LEVEL_2_MULTI_AGENT", "LEVEL_3_INSTITUTIONAL"]; if (order.indexOf(target) <= order.indexOf(s.ai_stack.level)) return [false, "目标等级不高于当前 AI 能力等级。"];
  const setup = AI_UPGRADE_SETUP_COST[target] ?? 0; if (setup > s.management_company.cash) return [false, `管理公司现金不足，升级需要一次性投入 $${setup.toFixed(0)}。`]; s.management_company.cash -= setup; s.ai_stack.level = target; recompute_cost_buckets(state); s.capital_spend_log.push({ id: new_id(), date: node_date, category: "AI", label: `AI 能力升级至 ${target}`, amount_usd: setup, wallet: "MANAGEMENT_COMPANY", legality_class: "LEGAL" }); return [true, `AI 研究体系已升级至 ${target}，一次性投入 $${setup.toFixed(0)}，月度算力开支相应上升。`];
}

export function inject_gp_capital(state: GameState, amount_usd: number, node_date: string): [boolean, string] {
  const s = internals(state); if (amount_usd <= 0) return [false, "金额必须为正。"]; if (!transferGpCapital(state, amount_usd, node_date)) return [false, "GP 个人财富不足。"]; s.capital_spend_log.push({ id: new_id(), date: node_date, category: "OPERATIONS", label: "GP 个人注资", amount_usd, wallet: "GP_WEALTH", legality_class: "LEGAL" }); return [true, `已从个人财富向管理公司注资 $${amount_usd.toFixed(0)}。`];
}

export function distribute_to_gp(state: GameState, amount_usd: number, _node_date: string): [boolean, string] {
  if (amount_usd <= 0) return [false, "金额必须为正。"]; if (!distributeAuditedGpDividend(state, amount_usd, _node_date)) return [false, "管理公司现金不足以完成本次分配。"]; return [true, `管理公司已通过审计分红动作向 GP 分配 $${amount_usd.toFixed(0)}。`];
}
