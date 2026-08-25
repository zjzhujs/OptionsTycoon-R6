import type { EpisodeMeta, EpisodeOutcome, GameState } from "../schemas";

const SEASON_1_EPISODES: EpisodeMeta[] = [
  { episode_id: "s1_ep01", season_id: "season_1", number: 1, title: "EP01: 暴风雨前的死寂", subtitle: "2025年1月23日 · 算力估值顶峰与暗流", date_start: "2025-01-23", date_end: "2025-01-24", main_underlying: "NVDA", historical_context: "NVDA 死咬着 145 美元的高位，期权链平值 IV 趴在 42%。这帮华尔街的买方还在做梦，以为大模型推理算力能永远线性暴涨。", opening_narrative: "早晨 07:30，曼哈顿中城。你的新基金 Dante Capital 刚敲定首期资金。Maya Chen 拽着一份中国开源大模型的内部研报冲进会议室，神色冷峻：'如果这份内参结论属实，全华尔街基于算力线性暴涨建的多头模型，全得推倒重来。'", focus_characters: ["maya_chen", "victor_hale", "leo_park"] },
  { episode_id: "s1_ep02", season_id: "season_1", number: 2, title: "EP02: 算力地震", subtitle: "2025年1月27日 · DeepSeek R1 发布与千亿蒸发", date_start: "2025-01-27", date_end: "2025-01-27", main_underlying: "NVDA", historical_context: "DeepSeek R1 开源，用极低的训练成本把全球按在地上摩擦。NVDA 盘中跳空重挫 20%，成交量砸出破纪录的 8.18 亿股，全市场的 Gamma 墙像纸一样塌了。", opening_narrative: "开盘前 15 分钟，彭博终端闪着血红的光。期指跳空干碎 15%，分析师电话会全线炸锅。Adrian Cross 还在推特上不知死活地喊多，而 Victor 已经把枪顶在你脑门上，逼你清仓保命。", focus_characters: ["maya_chen", "victor_hale", "adrian_cross", "leo_park"] },
  { episode_id: "s1_ep03", season_id: "season_1", number: 3, title: "EP03: 绝地反扑还是死猫跳", subtitle: "2025年1月28日 · 恐慌杀跌后的剧烈博弈", date_start: "2025-01-28", date_end: "2025-01-29", main_underlying: "NVDA", historical_context: "屠杀次日，抄底赌徒和空头回补在绞肉机里互撕。NVDA 日内狂拉 8% 的猴市震荡，IV 砸出离谱的 Skew 畸变，做市商直接单边拉宽 Spread 关门打狗。", opening_narrative: "昨天的血腥味还没散。Daniel Ross 甩来 PB 晨报，暗示几家拉满杠杆的基金正在排队天台。Leo Park 盯着屏幕提醒，平值 Put 溢价仍然高得离谱，卖方肉烂在锅里，就看你敢不敢去舔血。", focus_characters: ["leo_park", "daniel_ross", "maya_chen"] },
  { episode_id: "s1_ep04", season_id: "season_1", number: 4, title: "EP04: 财报前夜的暗涌", subtitle: "2025年1月31日 · 情绪分化与期权跨式博弈", date_start: "2025-01-30", date_end: "2025-01-31", main_underlying: "NVDA", historical_context: "第一波断头铡刚停，资金又盯上了即将出炉的财报和供应链底牌。期权筹码在 120-130 之间重新码好了绞刑架。", opening_narrative: "一月收官。LP 委员会发来质询邮件，咬死要求提供回撤压力测试。Evelyn Shaw 的夺命连环call打进来，想从你嘴里撬出同行爆仓爆到什么程度的独家猛料。", focus_characters: ["evelyn_shaw", "victor_hale", "daniel_ross"] },
  { episode_id: "s1_ep05", season_id: "season_1", number: 5, title: "EP05: 宏观风暴与利差倒挂", subtitle: "2026年1月20日 · 降息周期博弈与指数重定价", date_start: "2026-01-20", date_end: "2026-02-10", main_underlying: "SPX", historical_context: "美债 10Y 收益率死撑在 4.38%，2s10s 曲线利差陡得吓人，科技股那虚伪的高估值正被宏观贴现率和资本开支双面凌迟。", opening_narrative: "2026 年初，Dante Capital 盘子虽然做大了，但宏观盘面乱成了一锅粥。Victor 拍着桌子警告，别对美联储降息抱任何幻想，立刻把指数对冲拉满。", focus_characters: ["victor_hale", "maya_chen", "marcus_reed"] },
  { episode_id: "s1_ep06", season_id: "season_1", number: 6, title: "EP06: 监管传票与挖角风波", subtitle: "2026年2月12日 · SEC 审查与核心人才危机", date_start: "2026-02-12", date_end: "2026-02-28", main_underlying: "SPX", historical_context: "财报雷区刚到，监管机构就开始对之前 AI 产业链的异动作妖，外加某空头秃鹫直接甩出狙击报告砸场子。", opening_narrative: "清早，合规官像见了鬼一样撞开门——Marcus Reed 挥舞着监管质询函杀上门了。更绝的是，Adrian Cross 正在背后砸双倍价码挖 Maya 的墙角。", focus_characters: ["marcus_reed", "maya_chen", "adrian_cross"] },
  { episode_id: "s1_ep07", season_id: "season_1", number: 7, title: "EP07: 流动性黑天鹅", subtitle: "2026年3月3日 · 波动率海啸与流动性考验", date_start: "2026-03-03", date_end: "2026-03-20", main_underlying: "SPX", historical_context: "地缘擦枪走火叠加通胀诈尸，全市场吓得疯狂逃命。VIX 脉冲飙破 25.5，基石 LP 闹着要抽资。这是要看你的流动性底裤穿没穿稳了。", opening_narrative: "全线警报。PB 落井下石抬高保证金要求，两个金主爸爸同时威胁要抽梯子。办公室电话已经接爆，你现在要么断臂保流动性，要么死扛头寸进棺材。", focus_characters: ["daniel_ross", "victor_hale", "leo_park"] },
  { episode_id: "s1_ep08", season_id: "season_1", number: 8, title: "EP08: 决战时刻与最终审判", subtitle: "2026年6月30日 · 华尔街终局与遗产判定", date_start: "2026-06-30", date_end: "2026-06-30", main_underlying: "SPX", historical_context: "2026 上半年收官。所有敞口迎来清算日，华尔街投委会将扒光你过去一年的底裤，拿着业绩、风控和合规记录，来给你宣判死刑还是封神。", opening_narrative: "下午四点收盘。屏幕上的数字定格，死局已定。Evelyn 的头版头条、SEC 的结案通报、团队是走是留都已无可更改。这是你在华尔街刻下的墓志铭。", focus_characters: ["maya_chen", "victor_hale", "adrian_cross", "marcus_reed", "daniel_ross", "evelyn_shaw", "leo_park"] },
];

export function get_episode_meta(episode_number: number): EpisodeMeta {
  return SEASON_1_EPISODES[Math.max(0, Math.min(SEASON_1_EPISODES.length - 1, episode_number - 1))];
}

export function get_all_season_episodes(): EpisodeMeta[] { return [...SEASON_1_EPISODES]; }

export function evaluate_episode_outcome(state: GameState, prev_equity: number, current_equity: number): EpisodeOutcome {
  const ep_meta = get_episode_meta(state.current_episode_number ?? 1);
  const ret_pct = prev_equity > 0 ? (current_equity / prev_equity - 1) * 100 : 0;
  const realized_pl = current_equity - prev_equity;
  const reviews = state.trade_reviews ?? [];
  const avg_score = reviews.length ? reviews.reduce((sum, review) => sum + (review.process_score.overall_process_score ?? 0), 0) / reviews.length : ((state.hidden_state?.discipline ?? 0) > 70 ? 75 : 55);
  const key_relationship_deltas: Record<string, number> = {};
  for (const [id, rel] of Object.entries(state.relationships ?? {})) key_relationship_deltas[id] = Math.round(((rel.trust ?? 0) - 40) * 10) / 10;
  const summary_narrative = ret_pct > 5 && avg_score >= 80 ? "本集复盘：你在市场绞肉机里展现了极度冷酷的宏观直觉和纪律。团队没散，LP 的钱保住了，算是活出了个人样。" : ret_pct > 0 && avg_score < 60 ? "本集复盘：狗屎运不错，净值是涨了，但你那种不要命的赌徒操作已经让风控红牌警告。再这么玩，迟早爆仓。" : ret_pct < -5 ? "本集复盘：脸着地被市场教做人，回撤难看得不忍直视。收拾烂摊子吧，准备迎接 LP 的夺命连环 call 和随时断供的杠杆。" : "本集复盘：没亏就是赢。缩头乌龟式的防守保住了你的下行底线，至少流动性子弹还在你的枪膛里。";
  const unlocked_clues: string[] = [];
  if ((state.current_episode_number ?? 1) >= 2) unlocked_clues.push("已掌握：DeepSeek 开源生态算力溢出效应模型");
  if ((state.current_episode_number ?? 1) >= 5) unlocked_clues.push("已掌握：2s10s 利率利差传导链条");
  return { episode_id: ep_meta.episode_id, season_id: ep_meta.season_id ?? "season_1", number: ep_meta.number, title: ep_meta.title, portfolio_return_pct: Math.round(ret_pct * 100) / 100, realized_pnl: Math.round(realized_pl * 100) / 100, process_score: Math.round(avg_score * 10) / 10, lp_confidence_delta: Math.round(((state.fund_stats.lp_confidence ?? 0) - 50) * 10) / 10, reputation_delta: Math.round(((state.fund_stats.reputation ?? 0) - 50) * 10) / 10, compliance_risk_delta: Math.round((state.fund_stats.compliance_risk ?? 0) * 10) / 10, key_relationship_deltas, summary_narrative, unlocked_clues };
}

