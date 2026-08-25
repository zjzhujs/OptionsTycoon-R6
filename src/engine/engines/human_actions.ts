import type { AcquiredEdgeIntel, GameState, HumanActionChoice, HumanActionEvent, MarketNode } from "../schemas";
import { new_id } from "../ids";
import * as evidence_engine from "./evidence_engine";
import { appendImmutableEvidence, ensureEconomyState } from "./economy_core";

export function default_favor_balances(): Record<string, number> {
  return { maya_chen: 10, victor_hale: 10, leo_park: 10, daniel_ross: 5, evelyn_shaw: 0, marcus_reed: 0, adrian_cross: -10, jpmorgan_pb: 5, goldman_sachs: 0 };
}

const c = (id: string, label: string, values: Partial<HumanActionChoice> = {}): HumanActionChoice => {
  const choice: HumanActionChoice = { id, label, cost_usd: 0, favor_delta: 0, morale_delta: 0, reputation_delta: 0, ...values };
  if ((choice.cost_usd ?? 0) > 0 && !choice.wallet) choice.wallet = "MANAGEMENT_COMPANY";
  return choice;
};
const event = (id: string, node: MarketNode, action_kind: HumanActionEvent["action_kind"], character_id: string | null, headline: string, body: string, choices: HumanActionChoice[]): HumanActionEvent => ({ id, date: node.date, action_kind, character_id, headline, body, choices, resolved: false, chosen_choice_id: null, source_type: "SIMULATED" });

export function generate_human_action_events(node: MarketNode, state: GameState): HumanActionEvent[] {
  const s = state as any; const day_idx = s.game_day_index ?? 0; const equity = s.cash + s.shares * node.underlying_bar.close - s.margin_debt; const drawdown = s.peak_aum > 0 ? (s.peak_aum - equity) / s.peak_aum * 100 : 0; const events: HumanActionEvent[] = [];
  if (day_idx === 1) events.push(event(`ha_adrian_poach_${node.date}`, node, "RIVAL_POACHING", "adrian_cross", "Adrian Cross (Apex Horizon) 砸重金挖墙脚", "猎头圈子传疯了：Adrian Cross 那混蛋亲自批了 2.5 倍签字费，就为了把 Maya 手下最硬的量化建模师连盆端走。这孙子是想赶在财报前把我们的算力模型直接废掉。", [c("match_bonus", "撒钱留人：拍出 $25,000 封住他的嘴，放权给 Maya", { cost_usd: 25000, favor_delta: 15, morale_delta: 20, reputation_delta: 5, result_narrative: "那小子当着大家的面撕了 Apex 的合约。Maya 没给好脸色，但盘前模型跑得冒火。" }), c("let_go_and_reorg", "让他滚蛋：老子不惯这毛病，内部重新整顿", { favor_delta: -10, morale_delta: -15, reputation_delta: -5, result_narrative: "人去了 Apex。Maya 熬夜补窟窿，在办公室大骂没种的叛徒，前瞻估值还是掉链子了。" }), c("legal_injunction", "上竞业禁止律师函，把这条路给他堵死", { cost_usd: 10000, morale_delta: 5, reputation_delta: 10, result_narrative: "一纸律师函直接把挖角流程按死。Adrian 在彭博私信里急得直跳脚嘲讽咱们玩不起。" })]));
  else if (day_idx === 3) events.push(event(`ha_adrian_short_${node.date}`, node, "RIVAL_SHORT_ATTACK", "adrian_cross", "Apex Horizon 狗急跳墙发做空报告：狂踩 AI 资本开支", "Adrian 这老阴逼直接上了 CNBC 直播，大嘴巴狂喷科技巨头 GPU 需求假设纯属扯淡，背地里却在期权链狂扫深度虚值 Put。这番狗屁言论直接引爆了市场的恐慌性对冲盘，IV 瞬间飙升。", [c("rebuttal_brief", "放 Maya 出去咬人：在彭博发反驳简报，拿硬数据做反证，抽他的脸", { cost_usd: 5000, favor_delta: 10, morale_delta: 10, reputation_delta: 15, result_narrative: "Maya 扒光了他的虚伪论据，用铁证砸烂了那篇破报告。买方圈子全在看 Apex 的笑话，我们也算帮市场做了一次真正的价格发现。" }), c("exploit_vol", "吃他的血筹码：趁着恐慌 IV 爆表，狂卖虚值期权抽干做市商", { favor_delta: -5, reputation_delta: 5, result_narrative: "暴利落袋。不过底下人吓傻了，觉得咱们这波吃相太糙，简直像个流氓倒爷。" })]));
  if (day_idx === 2) events.push(event(`ha_internal_dispute_${node.date}`, node, "EMPLOYEE_DISPUTE", "victor_hale", "交易室起火：Maya 搏命抄底 vs Victor 拔电源", "玻璃门都快被震碎了。Maya 拍着桌子吼「这他妈是十年一遇的黄金坑，现在不进等死吗？」，Victor 黑着脸指着屏幕：「10Y 美债收益率再飙我们全得爆仓！现在立刻给我冻结 Delta 敞口！」", [c("side_with_maya", "把弹药给 Maya：放宽 20% 科技股风险预算，干就完了", { favor_delta: 10, morale_delta: 5, result_narrative: "Maya 拿到子弹直接杀入期权链。Victor 冷笑一声，把你的疯子行径逐字记进了风控备忘录。" }), c("side_with_victor", "听 Victor 的：单笔期权死死卡住 NAV 10% 红线，谁也不准越界", { favor_delta: -10, reputation_delta: 10, result_narrative: "仓位被死死锁住。Maya 在工位上疯狂砸键盘，大骂你把几百万的利润拱手让人。" }), c("compromise_hedge", "各退一步：让 Leo 去搞保护性领式期权 (Collar) 上保险，熬到最后 30 分钟再扫货", { favor_delta: 5, morale_delta: 15, reputation_delta: 10, result_narrative: "对冲头寸建好了。虽然都在骂骂咧咧，但至少证明我们不是一群只会梭哈的白痴。" })]));
  const at_risk = (s.lp_profiles ?? []).filter((lp: any) => drawdown > lp.redemption_threshold_pct).sort((a: any, b: any) => a.redemption_threshold_pct - b.redemption_threshold_pct);
  if (at_risk.length) {
    const lp = at_risk[0]; events.push(event(`ha_lp_warning_${node.date}`, node, "LP_REDEMPTION_WARNING", "daniel_ross", `${lp.name} 的赎回警告：这帮吸血鬼要掀桌子了`, `回撤干到了 ${drawdown.toFixed(1)}%，直接踩碎了 ${lp.name} 的赎回预警线 (阈值 ${lp.redemption_threshold_pct.toFixed(0)}%)。对方委员会下了最后通牒：“我们不替你买单了”，24小时内拿不出像样的救市方案，就准备被抽干现金流吧。`, [c("deleveraging_pledge", "认怂降杠杆：承诺砍掉 Margin 负债，装孙子保平安", { favor_delta: 10, morale_delta: -5, reputation_delta: 5, result_narrative: `${lp.name} 勉强把赎回文件按住了，但以后他们每周都要像查账一样死盯着我们的敞口。` }), c("in_person_presentation", "当面硬刚：买机票杀过去，拿历史数据把他们砸晕", { cost_usd: 8000, favor_delta: 15, morale_delta: 10, reputation_delta: 15, result_narrative: `${lp.name} 委员会被深度期权归因报告镇住了，极其不情愿地多给了 3 个月死缓。` }), c("accept_partial_redemption", `断尾求生：主动吐出 ${lp.name} 15% 的本金，拿钱堵嘴`, { favor_delta: 5, morale_delta: -10, reputation_delta: -5, target_lp_id: lp.id, lp_capital_delta: -0.15 * lp.capital_current, result_narrative: `${lp.name} 拿钱走人。基金 AUM 狠狠缩水，但避免了被当场挤兑的惨剧。` })]));
  }
  const ret_pct = s.start_cash > 0 ? (equity - s.start_cash) / s.start_cash * 100 : 0;
  if (day_idx >= 5 && drawdown < 5 && ret_pct > 8 && s.lp_profiles?.length) {
    const lp = [...s.lp_profiles].sort((a: any, b: any) => b.confidence_score - a.confidence_score)[0]; const amount = Math.round(lp.capital_current * 0.2 / 1000) * 1000;
    events.push(event(`ha_lp_injection_${node.date}`, node, "LP_ALLOCATION_PROPOSAL", "daniel_ross", `${lp.name} 闻着血腥味来了：要求加注`, `这帮墙头草看到 ${ret_pct.toFixed(1)}% 的收益率立刻又变成亲爹了。${lp.name} 急不可耐地要塞 $${amount.toFixed(0)} 进来，生怕赶不上我们下一波吃肉的行情。`, [c("accept_injection", `照单全收：把 $${amount.toFixed(0)} 吞进 AUM，马上变现成买力`, { favor_delta: 10, morale_delta: 5, reputation_delta: 10, target_lp_id: lp.id, lp_capital_delta: amount, result_narrative: `${lp.name} 的钱光速到账。弹药库满血，准备在期权链上大开杀戒。` }), c("decline_injection", "让他吃闭门羹：老子的策略容量有限，不伺候", { favor_delta: -5, reputation_delta: 5, result_narrative: `${lp.name} 碰了一鼻子灰，外面反而传咱们的额度千金难求，逼格拉满了。` })]));
  }
  if (day_idx === 4) events.push(event(`ha_evelyn_leak_${node.date}`, node, "JOURNALIST_INQUIRY", "evelyn_shaw", "《华尔街日报》Evelyn 来探底：GPU 出口禁令", "Evelyn 私信丢来几行带着毒药的草稿：商务部正拟定死锁先进制程 GPU 出口。她话里藏针，绕着弯子试探 Dante Capital 是不是提前闻着味儿调了期权仓位。应付这女人得提着十二分小心。", [c("on_the_record_quote", "打官腔：发合规公关稿，咬死我们只看公开数据操作", { favor_delta: 5, reputation_delta: 10, result_narrative: "文章登出来了，我们的引语四平八稳。无聊透顶，但是极其安全。" }), c("off_the_record_exchange", "私下交易 (On Background)：跟她互换华盛顿的内幕风向", { favor_delta: 15, morale_delta: 5, reputation_delta: 5, result_narrative: "见不得光的互信管道建成了。你喂她行业底牌，她给你喂一手政策筹码。" })]));
  return events;
}

export function generate_capital_introduction_event(bank_id: string, state: GameState): HumanActionEvent | null {
  const s = state as any; const prospects: Record<string, [string, string, number]> = { jpmorgan: ["Crescendo Family Office", "lp_crescendo_fo", 3000000], goldman_sachs: ["Pinnacle Endowment", "lp_pinnacle_endow", 5000000], morgan_stanley: ["Eastbridge Wealth Partners", "lp_eastbridge_wp", 2500000] }; const [name, lp_id, amount] = prospects[bank_id] ?? ["Prospect Investor", "lp_prospect", 2000000]; if ((s.lp_profiles ?? []).some((lp: any) => lp.id === lp_id)) return null;
  return capital_event(bank_id, state, name, amount);
}

// Separate overload-free constructor used by generate_capital_introduction_event.
function capital_event(bank_id: string, state: GameState, name: string, amount: number): HumanActionEvent {
  const date = state.updated_at?.slice(0, 10) ?? "2025-01-23";
  return { id: `cap_intro_${bank_id}_${state.game_day_index ?? 0}`, date, action_kind: "LP_ALLOCATION_PROPOSAL", character_id: null, headline: `Capital Introduction: ${name} 盯上我们了`, body: `靠着 ${bank_id.toUpperCase()} 的拉皮条安排，${name} 这帮有钱人觉得 Dante Capital 有点意思，兜里大概揣着 $${amount.toFixed(0)} 随时准备下注。记住，这只是机构间的调情，真金白银没到账前都是放屁。`, choices: [c(`accept_intro_${bank_id}`, `见一面 · 争取拿下这 $${amount.toFixed(0)} AUM`, { favor_delta: 2, reputation_delta: 3, lp_capital_delta: amount, result_narrative: `${name} 查完了我们的底，痛快地签了 $${amount.toFixed(0)} 的支票。` }), c(`decline_intro_${bank_id}`, "让他们滚蛋 · 现在的盘子够吃了", { favor_delta: -1, result_narrative: `一脚踢开了 ${name} 的邀约，老子的基金不是谁想进就能进的。` })], source_type: "SIMULATED" };
}

export function resolve_human_action(state: GameState, event_id: string, choice_id: string, resolved_on_date = ""): HumanActionEvent | null {
  const s = state as any; const economy = ensureEconomyState(state); const action = (s.human_action_events ?? []).find((candidate: HumanActionEvent) => candidate.id === event_id); if (!action || action.resolved) return null; const selected = action.choices?.find((choice: HumanActionChoice) => choice.id === choice_id); if (!selected) return null;
  const cost = selected.cost_usd ?? 0;
  const wallet = cost > 0 ? (selected.wallet ?? "MANAGEMENT_COMPANY") : selected.wallet;
  if (cost > 0 && !selected.wallet) selected.wallet = wallet;
  if (cost > 0) {
    const balances: Record<string, number> = {
      FUND_CASH: Number(s.cash ?? 0),
      MANAGEMENT_COMPANY: economy.management_cash,
      GP_WEALTH: economy.gp_cash,
    };
    if (!wallet || (balances[wallet] ?? 0) < cost) return null;
  }
  action.resolved = true; action.chosen_choice_id = choice_id; action.resolved_on_date = resolved_on_date || action.date; action.impact_summary = selected.result_narrative;
  if (cost > 0 && wallet === "MANAGEMENT_COMPANY") economy.management_cash -= cost;
  else if (cost > 0 && wallet === "GP_WEALTH") economy.gp_cash -= cost;
  else if (cost > 0 && wallet === "FUND_CASH") s.cash -= cost;
  if (action.character_id && s.relationships?.[action.character_id]) { const rel = s.relationships[action.character_id]; rel.favor = Math.max(0, Math.min(100, (rel.favor ?? 0) + (selected.favor_delta ?? 0))); rel.trust = Math.max(0, Math.min(100, (rel.trust ?? 0) + (selected.favor_delta ?? 0) * 0.5)); }
  s.player_street_score.media_profile = (s.player_street_score.media_profile ?? 0) + (selected.reputation_delta ?? 0) * 0.5; s.player_street_score.human_action_reputation_bonus = (s.player_street_score.human_action_reputation_bonus ?? 0) + (selected.reputation_delta ?? 0);
  if (selected.target_lp_id && selected.lp_capital_delta) { const lp = s.lp_profiles.find((candidate: any) => candidate.id === selected.target_lp_id); if (lp) { lp.capital_current = Math.max(0, lp.capital_current + selected.lp_capital_delta); lp.allocated_capital = Math.max(0, lp.allocated_capital + selected.lp_capital_delta); } s.fund_stats.aum = Math.max(0, s.fund_stats.aum + selected.lp_capital_delta); s.cash = Math.max(0, s.cash + selected.lp_capital_delta); }
  evidence_engine.record_action(state, action, selected, action.resolved_on_date);
  if ((selected.evidence_points_delta ?? 0) > 0 || selected.immutable_flag) appendImmutableEvidence(state, {
    date: action.resolved_on_date,
    action_id: selected.immutable_flag ?? `${action.id}:${selected.id}`,
    category: selected.immutable_evidence_category ?? "OTHER",
    evidence_points: selected.evidence_points_delta ?? 0,
    fact: `${action.headline} -- ${selected.label}`,
    truth_state: selected.intel_truth_state === "UNVERIFIED" ? "UNVERIFIED" : "VERIFIED",
  });
  if (selected.cost_usd) s.capital_spend_log.push({ id: new_id(), date: action.resolved_on_date, category: selected.legality_class && selected.legality_class !== "LEGAL" ? "INTELLIGENCE" : "RESEARCH", label: `${action.headline} · ${selected.label}`, amount_usd: selected.cost_usd, wallet: selected.wallet ?? "FUND_CASH", legality_class: selected.legality_class });
  if (selected.unlocks_intel) (s.acquired_intel ??= []).push(selected.unlocks_intel as AcquiredEdgeIntel);
  return action;
}
