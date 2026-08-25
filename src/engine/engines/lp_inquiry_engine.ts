import rawInquiry from '../data/inquiry_lines.json';
import type { GameState } from '../schemas';

/**
 * LP 季末闭门质询会（batch5 · AVG 提案二，制作人批）
 *
 * 战役收官日，LP 代表与合规官按本季真实表现分档质询，玩家答辩，
 * 答辩立场产生小而诚实的状态后果。分档只读真实存档数据：
 *   MAJOR_DRAWDOWN     nav_history 峰谷回撤 >= 12%
 *   COMPLIANCE_BLEMISH 合规风险 >= 50
 *   SUPER_ALPHA        本季收益 >= +8%
 *   STEADY_ON_TARGET   其余
 */

export type InquiryTier = 'MAJOR_DRAWDOWN' | 'COMPLIANCE_BLEMISH' | 'STEADY_ON_TARGET' | 'SUPER_ALPHA';

interface InquirerBlock {
  character_id: string;
  character_name: string;
  role_label: string;
  opening_inquiries: string[];
  response_choices?: Array<{ id: string; label: string; subsequent_reaction: string }>;
}

interface InquiryBank {
  tiers: Record<string, { tier_label: string; inquirers: Record<string, InquirerBlock> }>;
}

const BANK = rawInquiry as unknown as InquiryBank;

export interface InquiryView {
  tier: InquiryTier;
  tierLabel: string;
  inquirers: Array<{ characterId: string; name: string; role: string; opening: string }>;
  choices: Array<{ id: string; label: string }>;
}

export function maxDrawdownPct(navHistory: Array<{ d?: number; v: number }> | undefined): number {
  if (!navHistory || navHistory.length < 2) return 0;
  let peak = navHistory[0].v;
  let maxDd = 0;
  for (const p of navHistory) {
    if (p.v > peak) peak = p.v;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - p.v) / peak) * 100);
  }
  return maxDd;
}

export function assessInquiryTier(state: GameState, equity: number): InquiryTier {
  const dd = maxDrawdownPct(state.nav_history as never);
  if (dd >= 12) return 'MAJOR_DRAWDOWN';
  const compliance = state.fund_stats?.compliance_risk ?? 0;
  if (compliance >= 50) return 'COMPLIANCE_BLEMISH';
  const start = state.fund_stats?.aum || state.cash || 0;
  const first = (state.nav_history as Array<{ v: number }> | undefined)?.[0]?.v ?? start;
  if (first > 0 && equity > 0 && ((equity - first) / first) * 100 >= 8) return 'SUPER_ALPHA';
  return 'STEADY_ON_TARGET';
}

/** 质询会触发规则：战役最后一个节点 + 至少完成过一笔复盘 + 本战役未开过。 */
export function inquiryDue(state: GameState, dayIndex: number, totalDays: number): boolean {
  if (totalDays <= 1 || dayIndex < totalDays - 1) return false;
  if (!(state.trade_reviews ?? []).length) return false;
  if (state.lp_inquiry_state?.answered) return false;
  const flag = (state as GameState & { lp_inquiry_done_campaigns?: string[] }).lp_inquiry_done_campaigns ?? [];
  return !flag.includes(state.campaign_id ?? 'r1');
}

function pick(lines: string[], seed: string): string {
  if (!lines?.length) return '';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

export function buildInquiry(state: GameState, equity: number, seed: string): InquiryView | null {
  const tier = assessInquiryTier(state, equity);
  const entry = BANK.tiers[tier];
  if (!entry) return null;
  const inquirers = Object.values(entry.inquirers).map((b) => ({
    characterId: b.character_id,
    name: b.character_name,
    role: b.role_label,
    opening: pick(b.opening_inquiries, seed + b.character_id),
  }));
  const withChoices = Object.values(entry.inquirers).find((b) => b.response_choices?.length);
  const choices = (withChoices?.response_choices ?? []).map((c) => ({ id: c.id, label: c.label }));
  if (!inquirers.length || !choices.length) return null;
  return { tier, tierLabel: entry.tier_label, inquirers, choices };
}

export function reactionFor(tier: InquiryTier, answerId: string): Array<{ name: string; text: string }> {
  const entry = BANK.tiers[tier];
  if (!entry) return [];
  const out: Array<{ name: string; text: string }> = [];
  for (const b of Object.values(entry.inquirers)) {
    const hit = b.response_choices?.find((c) => c.id === answerId);
    if (hit) out.push({ name: b.character_name, text: hit.subsequent_reaction });
  }
  return out;
}

/**
 * 答辩后果——小而诚实，全部走既有字段，不造新数值系统：
 *   认错整改  ADMIT_AND_REFORM   lp_confidence +4（态度换信任），reputation -2（认了错）
 *   据理力争  STAND_GROUND_LOGIC reputation +3（专业立得住），lp_confidence -2（委员会不吃这套）
 *   画饼安抚  其余(PROMISE/SOOTHE) lp_confidence +6（当下稳住），reputation -3（圈子记得你画过饼）
 */
export function applyInquiryOutcome(state: GameState, answerId: string): void {
  const fs = state.fund_stats as unknown as Record<string, number>;
  const bump = (key: string, delta: number) => {
    if (typeof fs[key] === 'number') fs[key] = Math.max(0, Math.min(100, fs[key] + delta));
  };
  if (answerId === 'ADMIT_AND_REFORM') {
    bump('lp_confidence', 4); bump('reputation', -2);
  } else if (answerId === 'STAND_GROUND_LOGIC') {
    bump('reputation', 3); bump('lp_confidence', -2);
  } else {
    bump('lp_confidence', 6); bump('reputation', -3);
  }
  const s = state as GameState & { lp_inquiry_done_campaigns?: string[] };
  s.lp_inquiry_done_campaigns = [...(s.lp_inquiry_done_campaigns ?? []), state.campaign_id ?? 'r1'];
}
