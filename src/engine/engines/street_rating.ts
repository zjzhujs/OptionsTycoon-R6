import type { GameState, MarketNode, PlayerStreetScore, SellSideAnalystReport, StreetConsensus } from "../schemas";

function report(bank_id: string, bank_name: string, analyst_name: string, ticker: string, rating: string, target_price: number, prev_target: number, thesis_summary: string, published_date: string): SellSideAnalystReport {
  return { bank_id, bank_name, analyst_name, ticker, rating, target_price, prev_target, thesis_summary, published_date, source_type: "SIMULATED" };
}

export function get_street_consensus(node: MarketNode, campaign_id: string): StreetConsensus {
  const ticker = campaign_id === "r1" ? "NVDA" : "SPX";
  const post_shock = node.date >= "2025-01-27";
  const reports = post_shock ? [
    report("jpmorgan", "JPMorgan Equity Research", "Marcus Yeoh (虚构分析师 / Fictional Analyst)", ticker, "OVERWEIGHT", 165, 170, "DeepSeek 优化算法加速推理端算力渗透，AI 长期基础设施周期无虞，维持超配。", "2025-01-27"),
    report("goldman_sachs", "Goldman Sachs Global Investment Research", "Elena Voss (虚构分析师 / Fictional Analyst)", ticker, "BUY", 150, 160, "下调短期硬件出货量预期，但整体云厂商 CapEx 支出依然坚韧，重申买入评级。", "2025-01-27"),
    report("morgan_stanley", "Morgan Stanley Research", "David Okonkwo (虚构分析师 / Fictional Analyst)", ticker, "OVERWEIGHT", 168, 175, "Blackwell 产能爬坡顺利，市场对软件算法突破的恐慌带来非理性抛售买点。", "2025-01-27"),
  ] : [
    report("jpmorgan", "JPMorgan Equity Research", "Marcus Yeoh (虚构分析师 / Fictional Analyst)", ticker, "OVERWEIGHT", 170, 155, "超大规模云服务商资本开支高增，算力需求远超供给，重申首选标的。", "2025-01-22"),
    report("goldman_sachs", "Goldman Sachs Global Investment Research", "Elena Voss (虚构分析师 / Fictional Analyst)", ticker, "BUY", 160, 150, "企业级 AI 普及率提升驱动全产业链算力加单，维持确信买入。", "2025-01-22"),
  ];
  return { ticker, buy_count: 38, hold_count: 4, sell_count: 1, consensus_rating: "STRONG_BUY", mean_target_price: post_shock ? 161 : 165, high_target_price: post_shock ? 185 : 180, low_target_price: post_shock ? 135 : 145, rating_dispersion: post_shock ? "ELEVATED" : "LOW", reports, source_type: "DERIVED_REAL_INPUTS" };
}

export function compute_player_street_score(state: GameState, current_equity: number): PlayerStreetScore {
  const ret_pct = ((current_equity - state.start_cash) / state.start_cash) * 100;
  const dd_pct = state.max_drawdown_pct ?? 0;
  const alpha_score = Math.min(100, Math.max(0, 50 + ret_pct * 1.5));
  const risk_score = Math.min(100, Math.max(0, 100 - dd_pct * 2.5));
  const exec_score = state.compliance_state?.breaches ? 40 : 80;
  const research_cred = Math.min(100, 50 + (state.trade_reviews?.length ?? 0) * 5);
  const jpm_rel = (state.institutional_relationships?.jpmorgan ?? {}) as Record<string, number>;
  const inst_trust = jpm_rel.trust ?? 60;
  const lp_rep = Math.min(100, Math.max(0, 70 + ret_pct * 0.5 - dd_pct * 1.2));
  const counterparty_standing = state.account_type === "Margin" ? 75 : 65;
  const media_profile = state.player_street_score?.media_profile ?? 0;
  const media_prof = Math.min(100, 40 + media_profile);
  const compliance_stand = state.compliance_state?.investigations ? 30 : 95;
  const talent_mag = Math.min(100, (alpha_score + inst_trust) * 0.5);
  const ha_bonus = Math.max(-200, Math.min(200, state.player_street_score?.human_action_reputation_bonus ?? 0));
  const total = Math.min(1000, Math.max(0, alpha_score * 1.5 + risk_score * 1.5 + exec_score + research_cred + inst_trust + lp_rep + counterparty_standing + media_prof * 0.5 + compliance_stand + talent_mag * 0.5 + ha_bonus));
  const tier = total >= 800 ? "LEGENDARY_INSTITUTION" : total >= 650 ? "ELITE_FUND" : total >= 450 ? "ESTABLISHED_FUND" : "EMERGING_MANAGER";
  return { total_score: Math.round(total * 10) / 10, alpha_reputation: Math.round(alpha_score * 10) / 10, risk_discipline: Math.round(risk_score * 10) / 10, execution_quality: exec_score, research_credibility: Math.round(research_cred * 10) / 10, institutional_trust: Math.round(inst_trust * 10) / 10, lp_reputation: Math.round(lp_rep * 10) / 10, counterparty_standing, media_profile: Math.round(media_prof * 10) / 10, compliance_standing: compliance_stand, talent_magnet: Math.round(talent_mag * 10) / 10, standing_tier: tier, human_action_reputation_bonus: ha_bonus };
}

