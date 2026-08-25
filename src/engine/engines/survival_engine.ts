import type { GameState } from "../schemas";

export function get_survival_options(state: GameState, _crisis_type: string): Record<string, string>[] {
  const options: Record<string, string>[] = [
    { id: "cut_positions", title: "断臂求生：平掉 50% 敞口补充现金", description: "抛售流动性资产以满足保证金要求，锁定浮亏。" },
    { id: "daniel_lifeline", title: "向 PB (Daniel Ross) 申请紧急融资宽限", description: "消耗信任换取 48 小时缓冲，代价为额外利息。" },
  ];
  const adrian = state.relationships?.adrian_cross; if (adrian && ((adrian.trust ?? 0) > 30 || (adrian.favor ?? 0) > 20)) options.push({ id: "adrian_rescue", title: "接受对家 (Adrian Cross) 过桥救助", description: "让渡 15% 管理权换取流动性，引狼入室。" });
  if ((state.fund_stats.lp_confidence ?? 0) > 40) options.push({ id: "lp_side_pocket", title: "启动侧袋隔离 (Side-Pocket)", description: "暂缓资产赎回保全主基金，扣除 LP 信任分。" }); return options;
}

export function execute_survival_choice(state: GameState, choice_id: string): string {
  const s = state as any;
  if (choice_id === "cut_positions") { let freed_cash = 0; for (const position of s.positions) { position.qty = Math.max(1, Math.floor(position.qty / 2)); freed_cash += position.entry_price * 50; } s.cash += freed_cash; s.order_log.push({ date: "CRISIS", message: `紧急减仓降风控要求，释出现金 $${freed_cash.toFixed(2)}。`, kind: "yellow" }); return "减仓降杠杆，解除保证金警报。"; }
  if (choice_id === "daniel_lifeline") { s.cash += 25000; s.margin_debt += 25000; const relation = s.relationships?.daniel_ross; if (relation) { relation.trust = Math.max(0, (relation.trust ?? 0) - 5); relation.favor = Math.max(0, (relation.favor ?? 0) + 10); } return "Daniel 同意过桥贷款，PB 宽限期延至下一结算日。"; }
  if (choice_id === "adrian_rescue") { s.cash += 50000; s.fund_stats.reputation = Math.max(0, (s.fund_stats.reputation ?? 0) - 10); const relation = s.relationships?.adrian_cross; if (relation) { relation.rivalry = Math.max(0, (relation.rivalry ?? 0) - 15); relation.favor = (relation.favor ?? 0) + 20; } return "Adrian 注入过桥资金，基金挺过危机，但业界对你的控制权生疑。"; }
  if (choice_id === "lp_side_pocket") { s.fund_stats.lp_confidence = Math.max(0, (s.fund_stats.lp_confidence ?? 0) - 12); s.fund_stats.compliance_risk = Math.min(100, (s.fund_stats.compliance_risk ?? 0) + 5); return "已启动侧袋隔离，赎回压力冻结。须以真实业绩挽回 LP 信任。"; }
  return "危机处理指令已下达。";
}

