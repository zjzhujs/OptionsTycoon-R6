import type { MarketNode, MarketPulseFeed, SocialPost } from "../schemas";

export function generate_market_pulse(node: MarketNode, campaign_id: string): MarketPulseFeed {
  const date = node.date;
  const ticker = campaign_id === "r1" ? "NVDA" : "SPX";
  const post = (value: Omit<SocialPost, "timestamp" | "source_type">): SocialPost => ({ ...value, timestamp: `${date} ${value.id.includes("panic") ? "09:35" : value.id.includes("analyst") ? "10:15" : value.id.includes("short") ? "11:00" : value.id.includes("meme") ? "14:20" : value.id.includes("bull") ? "09:30" : value.id.includes("bot") ? "11:15" : "13:45"} ET`, source_type: "SIMULATED" });
  const posts: SocialPost[] = date >= "2025-01-27" ? [
    post({ id: "pulse_01_panic", author_handle: "@OptionsDegenerate_0DTE", author_type: "RETAIL_SWARM", avatar: "/art/characters/leo_park.jpg", content: "DeepSeek 用 $6M 训练出了吊打几百亿卡集群的模型？！我的 150 Call 瞬间归零... 这到底是怎么回事 💀😭", engagement_likes: 1420, engagement_reposts: 890, bias: "BEARISH", credibility: 25, bot_probability: 5, is_pump: false }),
    post({ id: "pulse_02_analyst", author_handle: "@SemiConductorDeepDive", author_type: "FINFLUENCER", avatar: "/art/characters/maya_chen.jpg", content: "别慌！推理成本暴降 10 倍只会彻底引爆应用层的推理需求，数据中心的吞吐量需求依然是指数级的。千万别在底部把肉割在 Gamma Wall 上！", engagement_likes: 3200, engagement_reposts: 1150, bias: "BULLISH", credibility: 80, bot_probability: 10, is_pump: false }),
    post({ id: "pulse_03_short", author_handle: "@ApexMacroAlpha", author_type: "SHORT_SELLER", avatar: "/art/characters/adrian_cross.jpg", content: "AI 资本开支的故事已经彻底讲不下去了！北美四大云厂商 CapEx 指引下调在即。科技巨头的估值倍数回到 20x 才是合理区间。继续做空高估值的科技标的。", engagement_likes: 980, engagement_reposts: 430, bias: "BEARISH", credibility: 65, bot_probability: 20, is_pump: true }),
    post({ id: "pulse_04_meme", author_handle: "@WallStreetMemes_HQ", author_type: "TRADER_MEME", avatar: "/art/characters/daniel_ross.jpg", content: "[Meme] 昨天我还在算 200 块的 Call 能赚几百万买迈阿密大别墅，今天我已经在这填麦当劳的求职表了 🍟📈📉", engagement_likes: 5600, engagement_reposts: 2300, bias: "NEUTRAL", credibility: 15, bot_probability: 5, is_pump: false }),
  ] : [
    post({ id: "pulse_00_bull", author_handle: "@TechSuperCycle", author_type: "FINFLUENCER", avatar: "/art/characters/maya_chen.jpg", content: "算力即权力！Blackwell 芯片全线售罄，华尔街投行分析师正集体将目标价上调至 $180+。无脑全仓买入 Call 躺赢！🚀🔥", engagement_likes: 4200, engagement_reposts: 1500, bias: "BULLISH", credibility: 70, bot_probability: 15, is_pump: false }),
    post({ id: "pulse_01_bot", author_handle: "@QuantumFlowTracker", author_type: "QUANT_BOT", avatar: "/art/characters/leo_park.jpg", content: "ALERT: 监测到单笔 $50M 深度虚值 Call 大宗异动扫单，做市商正处于极度 Gamma 暴露状态。", engagement_likes: 850, engagement_reposts: 310, bias: "BULLISH", credibility: 60, bot_probability: 85, is_pump: false }),
    post({ id: "pulse_02_hedge", author_handle: "@RiskManagementGuy", author_type: "SHORT_SELLER", avatar: "/art/characters/victor_hale.jpg", content: "注意：Put/Call Ratio 已经降至历史最低的 0.35 分位数，美债 10Y 收益率压迫贴现率，警惕任何黑天鹅催化的流动性抽离。", engagement_likes: 1120, engagement_reposts: 420, bias: "BEARISH", credibility: 85, bot_probability: 5, is_pump: false }),
  ];
  return { date, sentiment_regime: date >= "2025-01-27" ? "PANIC_UNWIND" : "EUPHORIC_EXPANSION", posts };
}

