import type { GameState, HumanActionChoice, HumanActionEvent, MarketNode } from "../schemas";
import type { InformationReliability } from "../schemas";
import { new_id } from "../ids";
import { SeededRNG } from "../rng";

const INSIDER_NAMES = ["一名急于套现的供应链财务经理", "一位被优化的核心产品工程师", "一名手握订单数据的销售运营"];
const FIXER_NAMES = ["一名自称认识 SEC 核心层的掮客", "一位专门处理烂摊子的前监管顾问", "一名常驻华盛顿的游说黑手"];
const SECRET_SOURCES = ["一份来自竞品董事会的绝密路线图", "一份能让标的腰斩的未公开诉讼卷宗", "一份藏在对赌协议里的供应商合同"];
const pseudo_index = (value: string, length: number): number => [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0) % length;
const mk = (suffix: string, node: MarketNode) => `edge_${suffix}_${node.date}_${new_id().slice(0, 6)}`;
const ticker_for = (campaign_id: string) => campaign_id === "r1" ? "NVDA" : "SPX";
const choice = (id: string, label: string, extra: Partial<HumanActionChoice> = {}): HumanActionChoice => ({ id, label, ...extra });

export function generate_edge_opportunities(node: MarketNode, state: GameState, rng: SeededRNG): HumanActionEvent[] {
  const offers = new Set(["LEGAL_EDGE_OFFER", "CORPORATE_INSIDER_OFFER", "COMMERCIAL_SECRET_OFFER", "CORRUPT_PROFESSIONAL_OFFER", "POLITICAL_CORRUPTION_OFFER", "MARKET_MANIPULATION_OFFER"]);
  if ((state.human_action_events ?? []).filter((event) => !event.resolved && offers.has(event.action_kind)).length >= 3) return [];
  const ticker = ticker_for(state.campaign_id ?? "r1"); const events: HumanActionEvent[] = [];
  if (rng.next_float() < 0.35) events.push(legal_edge_offer(node, ticker));
  if (rng.next_float() < 0.12 && (state.management_company?.cash ?? 0) > 50000) events.push(corporate_insider_offer(node, ticker));
  if (rng.next_float() < 0.08) events.push(commercial_secret_offer(node, ticker, rng));
  if ((state.evidence_state?.investigation_stage ?? "CLEAN") !== "CLEAN" && rng.next_float() < 0.1) events.push(corrupt_professional_offer(node));
  return events;
}

export function legal_edge_offer(node: MarketNode, ticker: string): HumanActionEvent {
  return { id: mk("legal_expert_network", node), date: node.date, action_kind: "LEGAL_EDGE_OFFER", headline: "SOURCE PROPOSAL · 专家网络合规对谈", body: "一家顶级专家网络可以安排一场前高管访谈。信息停留在行业常识层面，但完全合规。Legality: LEGAL。Cost: $40,000（管理公司现金）。Information Quality: MEDIUM。", choices: [choice("decline", "DECLINE · 没兴趣听套话", { result_narrative: "你拒绝了这通只值白菜价的合规废话。" }), choice("proceed", "PROCEED · 支付 $40,000 买个心安", { cost_usd: 40000, wallet: "MANAGEMENT_COMPANY", legality_class: "LEGAL", result_narrative: "花了四万块，听了一小时任何人都能在财报里读到的东西，但至少合规官很高兴。", unlocks_intel: { id: new_id(), headline: `合规纪要：${ticker} 产能评估`, body: "该前高管字斟句酌地重复了卖方研报里的老调重弹。毫无 MNPI 风险，但也毫无 Alpha 可言。", legality_class: "LEGAL", source_type: "SIMULATED", reliability: "PARTIAL", acquired_date: node.date, cost_usd: 40000, who_else_knows: [], ticker } })], source_type: "SIMULATED" };
}

export function corporate_insider_offer(node: MarketNode, ticker: string): HumanActionEvent {
  const contact = INSIDER_NAMES[pseudo_index(node.date, INSIDER_NAMES.length)];
  return { id: mk("corporate_insider", node), date: node.date, action_kind: "CORPORATE_INSIDER_OFFER", headline: "SOURCE PROPOSAL · 内幕线人主动兜售", body: `${contact}透过白手套找到了你，手里捏着足以让股价跳水的未公开核心数据。这是玩火，但极其致命。Legality: ILLEGAL。Cost: $150,000（管理公司现金）。Information Quality: HIGH。Exposure Risk: HIGH。People Aware: 1。`, choices: [choice("decline", "DECLINE · 太脏了，不要碰", { result_narrative: "你把这个烫手山芋踢开了。安全第一。" }), choice("legal_review", "ASK LEGAL · 让法务去当恶人", { result_narrative: "法务部看了一眼就差点拉响警报：标准的内幕交易雷区，绝对不能碰。", compliance_risk_delta: 0 }), choice("proceed", "PROCEED · 掏钱，拿黑料（ILLEGAL）", { cost_usd: 150000, wallet: "MANAGEMENT_COMPANY", legality_class: "ILLEGAL", evidence_points_delta: 25, witness_delta: 1, internal_awareness_delta: 8, external_awareness_delta: 2, compliance_risk_delta: 18, information_ethics_delta: -15, result_narrative: `十五万美元打入了一个离岸账户，你拿到了致命的底牌。这是铁打的 MNPI。记住，天下没有不透风的墙。`, unlocks_intel: { id: new_id(), headline: "MNPI 核心物证：未公开经营数据", body: `${contact}透漏的东西具体、及时，精度超出任何公开渠道——但你**没有任何办法独立核实它是不是真的**。这就是内幕信息最脏的地方：你押的是一个人的嘴，同时留下了可被追溯的痕迹。`, legality_class: "ILLEGAL", source_type: "SIMULATED", reliability: "PARTIAL", acquired_date: node.date, cost_usd: 150000, who_else_knows: [contact], ticker } })], source_type: "SIMULATED" };
}

export function commercial_secret_offer(node: MarketNode, ticker: string, rng: SeededRNG): HumanActionEvent {
  const source = SECRET_SOURCES[pseudo_index(`${node.date}s`, SECRET_SOURCES.length)];
  const reliability: InformationReliability = rng.weighted_choice(["TRUE", "PARTIAL", "MISLEADING", "FABRICATED"], [0.25, 0.35, 0.25, 0.15]);
  return { id: mk("commercial_secret", node), date: node.date, action_kind: "COMMERCIAL_SECRET_OFFER", headline: "SOURCE PROPOSAL · 灰产情报盲盒", body: `某个游荡在暗网边缘的掮客想把${source}卖给你。可能是惊天大雷，也可能是诈骗。Legality: ILLEGAL。Cost: $60,000。Information Quality: UNKNOWN（薛定谔的情报）。Exposure Risk: MODERATE。`, choices: [choice("decline", "DECLINE · 别拿假货来骗钱", { result_narrative: "你把这个可能带毒的盲盒扔进了垃圾桶。" }), choice("proceed", "PROCEED · 开盲盒（ILLEGAL / 真假自负）", { cost_usd: 60000, wallet: "MANAGEMENT_COMPANY", legality_class: "ILLEGAL", evidence_points_delta: 15, witness_delta: 1, internal_awareness_delta: 4, compliance_risk_delta: 10, information_ethics_delta: -8, result_narrative: "六万美元换来了一份来源不明的文件。至于里面是 Alpha 还是陷阱，全凭你的运气。", unlocks_intel: { id: new_id(), headline: `灰产截获：${source}`, body: "这份文件的水印模糊不清。它可能是能让你翻盘的底牌，也可能是对手盘故意放出来坑你的诱饵。", legality_class: "ILLEGAL", source_type: "SIMULATED", reliability, acquired_date: node.date, cost_usd: 60000, who_else_knows: ["匿名中间人"], ticker } })], source_type: "SIMULATED" };
}

export function corrupt_professional_offer(node: MarketNode): HumanActionEvent {
  const fixer = FIXER_NAMES[pseudo_index(`${node.date}f`, FIXER_NAMES.length)];
  return { id: mk("corrupt_professional", node), date: node.date, action_kind: "CORRUPT_PROFESSIONAL_OFFER", headline: "黑手介入：有人声称能「摆平」你的麻烦", body: `${fixer}暗示他有门路，能让针对你的调查凭空消失或者无限期拖延。这是纯粹的干预司法。Legality: ILLEGAL。Cost: $200,000。Exposure Risk: EXTREME。`, choices: [choice("decline", "REFUSE · 滚出我的办公室", { result_narrative: "你没有让情况变得更糟。" }), choice("legal_response", "LEGAL RESPONSE · 找正规律师刚到底", { compliance_risk_delta: -5, information_ethics_delta: 5, result_narrative: "你选择了最艰难但也最干净的路。没有留下新的把柄。" }), choice("proceed", "IMPROPER INFLUENCE · 花钱消灾（ILLEGAL）", { cost_usd: 200000, wallet: "MANAGEMENT_COMPANY", legality_class: "ILLEGAL", evidence_points_delta: 30, witness_delta: 2, internal_awareness_delta: 10, external_awareness_delta: 5, compliance_risk_delta: 22, information_ethics_delta: -18, result_narrative: `${fixer}拿走了钱，丢下一句「事情办妥了」。你不知道他贿赂了谁，也没有收据。你刚刚买下了一颗不知何时爆炸的定时炸弹。` })], source_type: "SIMULATED" };
}

export function build_mnpi_decision_event(intel_id: string, headline: string, node: MarketNode, _ticker: string): HumanActionEvent {
  return { id: `mnpi_decision_${intel_id}`, date: node.date, action_kind: "MNPI_DECISION", character_id: "marcus_reed", headline: `你打算拿「${headline}」怎么办？`, body: "这份料大概率就是 MNPI（未公开重大内幕信息）。你接下来的每一个动作，都可能成为未来法庭上的呈堂证供。", choices: [choice("ignore", "IGNORE · 当没看见", { result_narrative: "你假装自己从来没收到过这东西。" }), choice("send_compliance", "SEND TO COMPLIANCE · 扔给合规官洗白", { compliance_risk_delta: -10, information_ethics_delta: 10, result_narrative: "你把锅甩给了合规部门。如果出事，那是他们的失职。" }), choice("wait_public", "WAIT UNTIL PUBLIC · 忍住，等它上新闻", { result_narrative: "你压住了提前交易的贪念，决定等华尔街日报把它捅出来再说。" }), choice("trade_now", "TRADE · 见血封喉，立刻动手", { legality_class: "MNPI_RISK", evidence_points_delta: 20, compliance_risk_delta: 15, information_ethics_delta: -12, result_narrative: "你跨过了红线。系统已标记你的账户正处于 MNPI 高危状态。去订单台把这笔带血的交易做完吧。" })], source_type: "SIMULATED" };
}

export function market_manipulation_offer(node: MarketNode, is_empire_mode: boolean): HumanActionEvent | null {
  if (!is_empire_mode) return null;
  return { id: mk("market_manipulation", node), date: node.date, action_kind: "MARKET_MANIPULATION_OFFER", headline: "ALTERNATE TIMELINE · 协同喊单操纵", body: "有黑手提议发起一场铺天盖地的水军与假新闻攻势，强行扭转市场情绪。这是明目张胆的操纵市场。SIMULATED MARKET · 此举仅影响模拟时间线的走势，无法撼动真实历史。Legality: ILLEGAL。", choices: [choice("decline", "DECLINE · 太明目张胆了", { result_narrative: "你拒绝了成为庄家的诱惑。" }), choice("proceed", "PROCEED · 砸钱，控制舆论（ILLEGAL，仅限模拟盘）", { cost_usd: 300000, wallet: "MANAGEMENT_COMPANY", legality_class: "ILLEGAL", evidence_points_delta: 35, witness_delta: 3, internal_awareness_delta: 12, external_awareness_delta: 8, compliance_risk_delta: 25, information_ethics_delta: -20, result_narrative: "SIMULATED MARKET IMPACT：三十万美金洒向了下沉渠道。假消息开始蔓延。这能激起多大水花取决于盘子有多重，但你已经是个十足的恶棍了。" })], source_type: "SIMULATED" };
}

export function apply_simulated_manipulation_impact(state: GameState, capital_deployed: number, target_market_cap_bucket: string): number {
  const sensitivity = ({ SMALL_CAP: 1, MID_CAP: 0.35, MEGA_CAP: 0.06 } as Record<string, number>)[target_market_cap_bucket] ?? 0.06;
  const impact_pct = Math.min(8, capital_deployed / 1_000_000 * sensitivity * 2);
  (state.compliance_state ??= {}).empire_simulated_market_impact_pct = impact_pct;
  return impact_pct;
}
