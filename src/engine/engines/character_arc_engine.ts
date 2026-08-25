import type { GameState, CharacterMemoryItem } from "../schemas";


export function current_game_date(state: GameState, explicitDate = ""): string {
  const candidate = explicitDate || state.market_reveal?.session_date || state.market_clock?.current_node_date || "2025-01-23";
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : candidate.slice(0, 10);
}

export function record_memory(
  state: GameState,
  character_id: string,
  summary: string,
  sentiment = "NEUTRAL",
  key_fact = "",
  gameDate = "",
): void {
  const memories = (state.character_memories ??= {});
  (memories[character_id] ??= []).push({ timestamp: current_game_date(state, gameDate), episode_id: `EP${state.current_episode_number ?? 1}`, summary, sentiment, key_fact });
}

export function get_character_dialogue(character_id: string, state: GameState, context = "WAR_ROOM"): string {
  const rel = state.relationships?.[character_id];
  const trust = rel?.trust ?? 40.0;
  const traits = new Set(state.player_traits ?? []);

  if (character_id === "maya_chen") {
    if (traits.has("FOLLOWS_MAYA") && trust >= 60.0) {
      return "梁慧，你一直重视我的基本面调研，这次 DeepSeek 效率重构和算力需求偏斜，我建议紧跟 120-130 之间的 Gamma 护栏。";
    } else if (trust < 30.0) {
      return "如果你还是像前几轮那样把我的产业链检查当耳边风，那何必在晨会上问我的意见。";
    } else if (traits.has("HOLDS_LOSERS")) {
      return "浮亏不肯止损不是价值投资，现在的算力资本开支假设已经完全变了，不要跟市场赌气。";
    }
    return "最新的产业链出货量数据显示，北美头部云厂商并没有削减长期 Capex，短期跳空更多是情绪性超卖。";
  }

  if (character_id === "victor_hale") {
    if (traits.has("IGNORES_MACRO")) {
      return "你每次亏损了就突然变成“长期投资”。10 年期美债收益率在 4.5% 压着，成长股估值不可能不受地心引力约束。";
    } else if (trust >= 60.0) {
      return "2s10s 曲线开始走陡，流动性正在从单一科技股向更广泛的宏观资产扩散，做好指数跨期对冲是稳健的选择。";
    }
    return "宏观贴现率是所有资产的锚。在波动率高企的窗口，我们绝不能只看个股故事，必须留足现金缓冲。";
  }

  if (character_id === "leo_park") {
    if (traits.has("OVERTRADES")) {
      return "梁慧，你股票方向判断再准，在 5.10/5.80 的宽价差里乱打市价单（Market Buy），第一秒就送给做市商大笔无风险 Spread。";
    }
    return "做市商的 Delta 对冲盘正在下方的 Put 集中区形成重力场。不要猜底，善用 Limit 单挂在 Mid 附近吃流动性。";
  }

  if (character_id === "adrian_cross") {
    if (trust >= 50.0 || (rel?.favor ?? 0) > 30.0) {
      return "梁慧，我们在华尔街斗了这么久，这次做空机构狙击如果属实，或许我们可以联手吃下这笔流动性。";
    }
    return "如果 Dante Capital 在这轮回撤中撑不住，我很乐意用极低折价接收你们的核心分析师和资产。";
  }

  return "市场正在快速重定价，我们需要保持严密纪律。";
}

