import type { IPODealOffering, SellSideAnalystReport, WallStreetBankDesk } from "../schemas";

const research = (bank_id: string, bank_name: string, analyst_name: string, ticker: string, rating: string, target_price: number, prev_target: number, thesis_summary: string): SellSideAnalystReport => ({ bank_id, bank_name, analyst_name, ticker, rating, target_price, prev_target, thesis_summary, published_date: "2025-01-22", source_type: "SIMULATED" });
const ipo = (deal_id: string, company_name: string, ticker: string, lead_underwriter: string): IPODealOffering => ({ deal_id, company_name, ticker, lead_underwriter, price_range_low: deal_id.includes("cerebras") ? 27 : 32, price_range_high: deal_id.includes("cerebras") ? 31 : 36, expected_date: "2025-Q2", status: "ROADSHOW" });

export function get_default_wall_street_desks(): WallStreetBankDesk[] {
  return [
    { bank_id: "jpmorgan", bank_name: "JPMorgan Chase & Co.", logo: "/art/brands/jpmorgan.png", relationship_tier: "TIER_1_PARTNER", trust_score: 75, favor_points: 10, prime_brokerage_available: true, financing_spread_bps: 135, stock_borrow_fee_pct: 0.35, corporate_access_available: true, rep_contact_name: "Nicholas Thorne", rep_contact_title: "Managing Director, Prime Brokerage & Synthetic Equity", available_ipo_deals: [ipo("ipo_cerebras_2025", "Cerebras Systems Inc.", "CBRS", "JPMorgan / Morgan Stanley")], recent_research: [research("jpmorgan", "JPMorgan Equity Research", "Marcus Yeoh (虚构分析师 / Fictional Analyst)", "NVDA", "OVERWEIGHT", 170, 155, "AI 算力基础设施采购规模稳步上修，维持行业首选。")] },
    { bank_id: "goldman_sachs", bank_name: "Goldman Sachs", logo: "/art/brands/goldman_sachs.png", relationship_tier: "PREFERRED", trust_score: 68, favor_points: 5, prime_brokerage_available: true, financing_spread_bps: 145, stock_borrow_fee_pct: 0.4, corporate_access_available: true, rep_contact_name: "Claire Sterling", rep_contact_title: "Head of Global Markets & Derivatives Distribution", available_ipo_deals: [ipo("ipo_coreweave_2025", "CoreWeave Cloud Infrastructure", "CWV", "Goldman Sachs / Morgan Stanley")], recent_research: [research("goldman_sachs", "Goldman Sachs GIR", "Elena Voss (虚构分析师 / Fictional Analyst)", "NVDA", "BUY", 160, 150, "全球数据中心重构驱动算力利用率饱和，重申买入。")] },
    { bank_id: "morgan_stanley", bank_name: "Morgan Stanley", logo: "/art/brands/morgan_stanley.png", relationship_tier: "PREFERRED", trust_score: 65, favor_points: 5, prime_brokerage_available: true, financing_spread_bps: 150, stock_borrow_fee_pct: 0.42, corporate_access_available: true, rep_contact_name: "Harrison Vance", rep_contact_title: "Executive Director, Institutional Equity Division", recent_research: [research("morgan_stanley", "Morgan Stanley Research", "David Okonkwo (虚构分析师 / Fictional Analyst)", "NVDA", "OVERWEIGHT", 175, 165, "下一代 Blackwell 架构算力集群订单排期已延伸至下半财年。")] },
    { bank_id: "bofa", bank_name: "Bank of America Securities", logo: "/art/brands/bofa.png", relationship_tier: "STANDARD", trust_score: 55, favor_points: 0, prime_brokerage_available: true, financing_spread_bps: 160, stock_borrow_fee_pct: 0.48, corporate_access_available: false, rep_contact_name: "Brenda Collins", rep_contact_title: "Director, Securities Lending & Capital Markets" },
    { bank_id: "citi", bank_name: "Citigroup Global Markets", logo: "/art/brands/citi.png", relationship_tier: "STANDARD", trust_score: 50, favor_points: 0, prime_brokerage_available: true, financing_spread_bps: 165, stock_borrow_fee_pct: 0.5, corporate_access_available: false, rep_contact_name: "Vincent Ross", rep_contact_title: "VP, Prime Solutions" },
    { bank_id: "ubs", bank_name: "UBS Investment Bank", logo: "/art/brands/ubs.png", relationship_tier: "STANDARD", trust_score: 50, favor_points: 0, prime_brokerage_available: true, financing_spread_bps: 170, stock_borrow_fee_pct: 0.52, corporate_access_available: false, rep_contact_name: "Stefan Weber", rep_contact_title: "Director, Derivatives Solutions" },
    { bank_id: "barclays", bank_name: "Barclays Capital", logo: "/art/brands/barclays.png", relationship_tier: "STANDARD", trust_score: 45, favor_points: 0, prime_brokerage_available: true, financing_spread_bps: 175, stock_borrow_fee_pct: 0.55, corporate_access_available: false, rep_contact_name: "Alistair Finch", rep_contact_title: "Head of US Equity Financing" },
  ];
}

export function evaluate_institutional_desks(state_relationships: Record<string, unknown>): WallStreetBankDesk[] {
  const desks = get_default_wall_street_desks();
  for (const desk of desks) {
    const relation = state_relationships?.[desk.bank_id];
    if (!relation) continue;
    const rel = relation as Record<string, unknown>;
    desk.trust_score = typeof rel.trust === "number" ? rel.trust : desk.trust_score;
    desk.favor_points = typeof rel.favor === "number" ? rel.favor : desk.favor_points;
    desk.financing_spread_bps = typeof rel.financing_spread_bps === "number" ? rel.financing_spread_bps : desk.financing_spread_bps;
    desk.relationship_tier = (desk.trust_score ?? 0) >= 80 ? "TIER_1_PARTNER" : (desk.trust_score ?? 0) >= 60 ? "PREFERRED" : "STANDARD";
  }
  return desks;
}

