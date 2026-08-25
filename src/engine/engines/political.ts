import type { MarketNode, PoliticalContact, PoliticalState, PolicyEvent } from "../schemas";

export function get_default_political_contacts(): PoliticalContact[] {
  return [
    { id: "contact_policy_adviser", name: "Robert Vance", role: "Former Senior Policy Adviser", organization: "Brookings / Macro Policy Institute", avatar: "/art/characters/daniel_ross.jpg", access_cost_capital: 10, briefing_summary: "这老狐狸能直接拿到白宫国家经济委员会 (NEC) 关于高科技产业补贴与通胀法案的内部研判底牌。", favor_balance: 10 },
    { id: "contact_tech_counsel", name: "Sarah Jenkins", role: "Technology Policy Counsel", organization: "Senate Commerce & Tech Sub-Committee", avatar: "/art/characters/evelyn_shaw.jpg", access_cost_capital: 15, briefing_summary: "她能提前透露两党在先进芯片算力出口限制与反垄断听证会上准备怎么分赃，以及具体的屠宰时间表。", favor_balance: 5 },
    { id: "contact_defense_consultant", name: "Gen. Arthur Bradley (Ret.)", role: "Defense Procurement Consultant", organization: "Potomac Strategic Group", avatar: "/art/characters/victor_hale.jpg", access_cost_capital: 20, briefing_summary: "军工复合体的白手套。能精确解读国防授权法案 (NDAA) 中对军工级 AI 采购预算和关键供应链强制本土化背后的血腥分润机制。", favor_balance: 0 },
  ];
}

const policy = (id: string, date: string, branch: PolicyEvent["branch"], headline: string, body: string, sector_impact: string, potential_transmission: string, probability_pct: number, source_type: PolicyEvent["source_type"]): PolicyEvent => ({ id, date, branch, headline, body, sector_impact, potential_transmission, probability_pct, source_type });

export function evaluate_political_state(node: MarketNode, current_capital = 50, existing_contacts?: PoliticalContact[]): PoliticalState {
  const policies: PolicyEvent[] = [];
  if (node.date >= "2025-01-20") policies.push(policy("pol_eo_tariffs_2025", "2025-01-20", "WHITE_HOUSE", "白宫发布全面贸易关税与供应链行政令审查备忘录", "新一届政府正式签署行政令，指示美国贸易代表办公室 (USTR) 评估对进口半导体及关键电子元器件实施针对性关税可行性，重塑全球科技硬件供应链成本预期。", "Semiconductors, Hardware, Auto Tech", "关税预期升温 → 硬件进口成本上升 → 科技股估值倍数承压 → 避险资金推高 IV", 100, "REAL_PRIMARY"));
  if (node.date >= "2025-01-27") policies.push(policy("pol_export_controls_gpu", "2025-01-27", "REGULATORS", "美国商务部工业与安全局 (BIS) 拟更新先进制程 GPU 性能密度门槛", "监管层就 DeepSeek R1 算力架构突破展开内部闭门简报，计划进一步收紧分布式算力集群的出口审批通道。", "AI Data Centers, GPU Makers", "出口通道收紧 → 海外大客户采购减缓 → 营收指引分歧 → 恐慌性保护 Put 溢价走高", 90, "DERIVED_REAL_INPUTS"));
  if (node.date >= "2025-01-23") {
    policies.push(policy("pol_congress_chip_export_hearing", node.date, "CONGRESS", "SIMULATED ANALYSIS: 参议院商务委员会拟就先进芯片出口管制召开听证", "市场预期参议院商务与科技分委会将在未来数周就 AI 算力出口管制立法举行听证，两党在“国家安全优先”与“产业竞争力”之间尚未形成统一口径。这是模拟概率分析，不代表已确认的具体听证日程。", "Semiconductors, AI Infrastructure, Cloud Hyperscalers", "听证时间表明朗化 → 出口管制立法路径清晰 → 板块估值重新定价出口敞口风险", 55, "SIMULATED"));
    policies.push(policy("pol_congress_funding_watch", node.date, "CONGRESS", "SIMULATED ANALYSIS: 政府拨款与债务上限时间表观察", "国会拨款与债务上限谈判是持续性宏观尾部风险，本战役窗口内没有已确认的具体停摆或违约事件——这是基于历史周期模式的模拟概率观察，用于教学目的，不代表已发生的真实立法结果。", "Broad Market, Rates-Sensitive Sectors", "拨款僵局风险上升 → 短期国债收益率波动 → 风险资产波动率溢价走高", 20, "SIMULATED"));
    policies.push(policy("pol_election_regime_continuity", node.date, "ELECTIONS", "SIMULATED ANALYSIS: AI 产业政策延续性概率", "市场对当前行政当局是否延续既有的芯片出口管制与产业补贴路线存在分歧。这是基于公开政策信号的模拟概率估计，不构成对任何具体决策者立场的真实断言。", "Semiconductors, AI Infrastructure", "政策延续性概率上升 → 长期资本开支指引更确定 → 板块估值倍数获得支撑", 65, "SIMULATED"));
    policies.push(policy("pol_election_cabinet_fed_speculation", node.date, "ELECTIONS", "SIMULATED ANALYSIS: 财政部与美联储人事市场猜测", "华尔街持续猜测财政部与美联储关键人事对贸易、关税与货币政策路径的潜在影响。本条目为模拟市场情绪聚合，不代表任何真实个人的确认立场或既定事实。", "Rates, USD, Broad Market", "人事预期变化 → 政策路径不确定性 → 美债收益率曲线与美元指数波动", 40, "SIMULATED"));
  }
  if (node.date >= "2025-01-20") {
    policies.push(policy("geo_china_taiwan_tension", node.date, "GEOPOLITICS", "SIMULATED ANALYSIS: 台海局势与半导体供应链风险评估", "台海紧张局势持续作为全球半导体供应链的系统性尾部风险存在。TSMC 先进制程产能高度集中于台湾，任何军事升级预期都会直接冲击芯片股估值。这是基于公开地缘政治信号的持续性风险评估，不代表已发生或即将发生的具体军事行动。", "Semiconductors, AI Infrastructure, Defense", "台海风险溢价上升 → TSMC 供应链折价 → 替代产能受益 → 芯片股整体波动率走高", 15, "SIMULATED"));
    policies.push(policy("geo_sanctions_regime", node.date, "GEOPOLITICS", "SIMULATED ANALYSIS: 多边制裁体系对科技供应链的传导评估", "美国主导的对华先进芯片出口管制持续收紧，欧盟与日本荷兰在光刻机出口限制上协调立场。制裁升级路径直接影响 GPU 制造商海外营收占比与库存周期。本条目为模拟制裁传导路径分析，不代表具体制裁措施的确认时间表。", "Semiconductors, GPU Makers, Lithography Equipment", "制裁范围扩大 → 海外客户采购延迟 → 营收指引下修 → 估值倍数压缩", 45, "SIMULATED"));
    policies.push(policy("geo_middle_east_energy", node.date, "GEOPOLITICS", "SIMULATED ANALYSIS: 中东局势与能源价格传导风险", "红海航运中断与中东地缘冲突持续推升全球航运成本与能源价格波动预期。原油价格飙升路径会通过通胀预期 → 美债收益率 → 成长股贴现率链条传导至科技股。本条目为模拟宏观传导分析，不断言具体军事或外交事件的发生时间。", "Energy, Shipping, Rates-Sensitive Growth", "能源价格飙升 → 通胀预期上修 → 美债收益率走高 → 成长股估值承压", 30, "SIMULATED"));
    policies.push(policy("geo_opec_supply", node.date, "GEOPOLITICS", "SIMULATED ANALYSIS: OPEC+ 产量政策与宏观波动率传导", "OPEC+ 减产/增产决策直接影响全球能源成本基线，进而通过 CPI 路径影响美联储政策预期与风险资产定价。本条目为基于历史周期模式的模拟概率评估。", "Energy, Broad Market, Rates", "OPEC+ 意外减产 → 油价飙升 → 通胀预期升温 → 美联储延缓降息 → 纳斯达克承压", 25, "SIMULATED"));
  }
  return { political_capital: current_capital, active_policies: policies, contacts: existing_contacts && existing_contacts.length ? existing_contacts : get_default_political_contacts(), washington_sentiment: node.date >= "2025-01-25" ? "ELEVATED_SCRUTINY" : "NEUTRAL", regulatory_heat: node.date >= "2025-01-25" ? 35 : 15 };
}

// Which PolicyEvent branches each contact is actually positioned to have real insight on --
// used so a "consult" surfaces something the public card doesn't already say, instead of
// echoing contact.briefing_summary back at the player (that was a real dead-action bug: the
// player spent Political Capital to be shown text already visible on the card for free).
const CONTACT_RELEVANT_BRANCHES: Record<string, PolicyEvent["branch"][]> = {
  contact_policy_adviser: ["WHITE_HOUSE", "CONGRESS"],
  contact_tech_counsel: ["REGULATORS", "CONGRESS"],
  contact_defense_consultant: ["GEOPOLITICS"],
};

export function spend_political_capital(state_pol: PoliticalState, contact_id: string): string {
  const contact = (state_pol.contacts ?? []).find((candidate) => candidate.id === contact_id);
  if (!contact) return "未找到指定的华盛顿政策联系人。";
  if ((state_pol.political_capital ?? 0) < (contact.access_cost_capital ?? 0)) return "政治资本 (Political Capital) 不足，无法解锁该高级别政策简报。";
  state_pol.political_capital = (state_pol.political_capital ?? 0) - (contact.access_cost_capital ?? 0);
  contact.favor_balance = (contact.favor_balance ?? 0) + 5;

  const branches = CONTACT_RELEVANT_BRANCHES[contact.id] ?? [];
  const relevant = (state_pol.active_policies ?? [])
    .filter((p) => branches.includes(p.branch))
    .sort((a, b) => (b.probability_pct ?? 0) - (a.probability_pct ?? 0))[0];

  if (!relevant) {
    return `【华盛顿内线】${contact.name} (${contact.organization})：当前华盛顿这帮官僚还没搞出什么能直接影响你账面的动作。${contact.name} 建议别把宝贵的筹码浪费在没影子的事上，把你的政治支票留给下一次见血的危机。`;
  }

  // Deterministic (not random -- must reproduce identically on save/load), derived from the
  // relationship's own favor_balance so repeated consultation of the same contact doesn't
  // always yield the same delta. Framed as the contact's private read, not a REAL fact --
  // consistent with the rest of the app's REAL/DERIVED/ESTIMATED/SIMULATED truth labeling.
  const insiderDelta = ((contact.favor_balance ?? 0) % 20) - 10;
  const publicPct = relevant.probability_pct ?? 50;
  const insiderPct = Math.max(5, Math.min(99, publicPct + insiderDelta));
  const direction = insiderDelta >= 0 ? '更高' : '更低';
  return `【华盛顿内线】${contact.name} (${contact.organization})：针对"${relevant.headline}"，街上那些用公开模型算概率的蠢货都错了。私人线人透了底，实际落地概率绝对比外面传的要${direction}——内部死磕的评估是 ${insiderPct}%（公开模型：${publicPct}%，SIMULATED）。资本绞杀路径：${relevant.potential_transmission}`;
}

