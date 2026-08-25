// 交易质量评级（鬼泣式 SSS-F）。设计=dante Q1（制作人已批），实现=chat-harv 产码+claude-2 上机。
// 核心哲学：P&L 权重=0。暴赚的烂单可以 F/C，亏钱但结构正确纪律好的单可以 S 级。
// 四维：Thesis 匹配 30 + 风险结构 25 + 执行纪律 25 + 成本效率 20；硬帽制封顶。

export type Grade = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TradeGradeContext {
  thesis?: { risk_budget_usd: number } | null;
  max_risk_usd: number;
  strategy_matches_thesis?: boolean;
  exit_defined_before_entry?: boolean;
  defined_risk?: boolean;
  protective_leg?: boolean;
  spread_reduced_cost?: boolean;
  naked_unlimited_risk?: boolean;
  capital_reason_for_naked?: boolean;
  margin_near_limit?: boolean;
  exit_adherence?: 'exact' | 'planned' | 'none';
  reduced_on_new_evidence?: boolean;
  adverse_adds_without_new_evidence?: number;
  stop_triggered_then_delayed?: boolean;
  reasonable_limit_or_spread_control?: boolean;
  chase?: 'severe' | 'mild' | 'none';
  unnecessary_legs_or_fees?: boolean;
  risk_limit_breached?: boolean;
  mnpi?: boolean;
}

export interface TradeGradeResult {
  score: number;
  grade: Grade;
  raw: number;
  dimensions: { thesis: number; risk: number; discipline: number; efficiency: number };
  cap: number | null;
  cap_reasons: string[];
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, n));

export const toGrade = (n: number): Grade =>
  n >= 95 ? 'SSS' : n >= 90 ? 'SS' : n >= 84 ? 'S' : n >= 75 ? 'A' : n >= 65 ? 'B' : n >= 55 ? 'C' : n >= 40 ? 'D' : 'F';

export function tradeGrade(x: TradeGradeContext): TradeGradeResult {
  const hasThesis = !!x.thesis;
  // Thesis 匹配（30）：有 Thesis +10、策略表达该观点 +10、退出条件事前定义 +10
  const t =
    (hasThesis ? 10 : 0) + (x.strategy_matches_thesis ? 10 : 0) + (x.exit_defined_before_entry ? 10 : 0);
  // 风险结构（25）：defined-risk/保护腿 +15、价差降成本 +6、仓位≤风险预算 +8；裸卖无资本理由 -20、保证金逼近上限 -10
  const r = clamp(
    (x.defined_risk || x.protective_leg ? 15 : 0) +
      (x.spread_reduced_cost ? 6 : 0) +
      (hasThesis && x.thesis && x.max_risk_usd <= x.thesis.risk_budget_usd ? 8 : 0) -
      (x.naked_unlimited_risk && !x.capital_reason_for_naked ? 20 : 0) -
      (x.margin_near_limit ? 10 : 0),
    25,
  );
  // 执行纪律（25）：基础 10、按预设退出 +15/+10、按新证据减仓 +5；逆势加仓 -15、触发 stop 拖延 -15、无 Thesis -20
  const d = clamp(
    10 +
      (x.exit_adherence === 'exact' ? 15 : x.exit_adherence === 'planned' ? 10 : 0) +
      (x.reduced_on_new_evidence ? 5 : 0) -
      ((x.adverse_adds_without_new_evidence ?? 0) > 0 ? 15 : 0) -
      (x.stop_triggered_then_delayed ? 15 : 0) -
      (hasThesis ? 0 : 20),
    25,
  );
  // 成本效率（20）：基础 15、限价/价差控制 +5；追价 -10/-5、多余腿与费用 -5
  const e = clamp(
    15 +
      (x.reasonable_limit_or_spread_control ? 5 : 0) -
      (x.chase === 'severe' ? 10 : x.chase === 'mild' ? 5 : 0) -
      (x.unnecessary_legs_or_fees ? 5 : 0),
    20,
  );

  const raw = t + r + d + e;
  const cap_reasons: string[] = [];
  let cap = 100;
  const applyCap = (n: number, reason: string): void => {
    cap = Math.min(cap, n);
    cap_reasons.push(reason);
  };
  if (!hasThesis) applyCap(64, '无 Thesis 下单（最高 C）');
  if (x.risk_limit_breached) applyCap(54, '违反明确风控上限（最高 D）');
  if (
    x.naked_unlimited_risk &&
    !x.protective_leg &&
    !x.defined_risk &&
    hasThesis &&
    x.thesis &&
    x.max_risk_usd > x.thesis.risk_budget_usd
  )
    applyCap(54, '裸卖无保护且超风险预算（最高 D）');
  if ((x.adverse_adds_without_new_evidence ?? 0) >= 2) applyCap(39, '连续逆势加仓且无新证据（最高 F）');
  if (x.mnpi) applyCap(39, '涉 MNPI / 合规红线（直接 F）');

  const score = Math.min(raw, cap);
  return { score, grade: toGrade(score), raw, dimensions: { thesis: t, risk: r, discipline: d, efficiency: e }, cap: cap < 100 ? cap : null, cap_reasons };
}
