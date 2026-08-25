/**
 * V30 机制 C · 资金链级联
 *
 * ── 评测报告原话 ──────────────────────────────────────────────────
 *
 * 「缺乏真正的『内部造反』和『资金链断裂』的可逆推演」
 *
 * 现在 LP 赎回是单点扣分：赎回 15%，AUM 减少，结束。玩家感受不到任何压力传导。
 *
 * ── 「可逆」是这里最重要的两个字 ──────────────────────────────────
 *
 * 报告要的不是必死的死亡螺旋，是**可以被扭转的下坠**。所以这个引擎的输出不是「你死了」，
 * 而是一份**逐环推演**：下一环会发生什么、在这一环你还能做什么、做了之后螺旋会不会停。
 *
 * 赢的方式不是不下坠，是在第几环把它拦住。这才是《亿万》里那种「三天之内必须搞定
 * 一笔过桥」的紧迫感——不是随机死亡，是看得见的倒计时和看得见的出手机会。
 *
 * ── 五环 ──────────────────────────────────────────────────────
 *
 *   1 赎回落地      AUM 下降
 *   2 买力收缩      保证金买力随 AUM 同比下降（接的是已有的真实 margin 引擎）
 *   3 被迫平仓      持仓要求超出新买力 → 真的强平，不是提示
 *   4 业绩恶化      强平锁定亏损，回撤扩大
 *   5 下一个触线    回撤越过下一个 LP 的阈值 → 回到第 1 环
 *
 * 每一环都给出「拦截手段」，并标明代价。没有免费的出路。
 */
import type { GameState, LPProfile } from '../schemas';

export type CascadeLP = LPProfile;
export type CascadeHost = GameState;

export type CascadeStage =
  | 'REDEMPTION'
  | 'BUYING_POWER'
  | 'FORCED_LIQUIDATION'
  | 'PERFORMANCE'
  | 'NEXT_TRIGGER';

export interface Intervention {
  id: string;
  label: string;
  /** 这一手要付出什么——现金、人情、声誉、还是接受一部分损失 */
  cost_summary: string;
  /** 拦住之后螺旋会停在哪一环 */
  halts_at: CascadeStage;
}

export interface CascadeStep {
  stage: CascadeStage;
  headline: string;
  detail: string;
  /** 该环的量化后果，供 UI 显示真实数字而不是形容词 */
  figures: Record<string, number>;
  /** 这一环还能怎么拦 */
  interventions: Intervention[];
}

export interface CascadeProjection {
  triggered: boolean;
  /** 触发这次推演的 LP */
  origin_lp?: { id: string; name: string; threshold_pct: number };
  drawdown_pct: number;
  steps: CascadeStep[];
  /** 推演到最后是否会引发新一轮赎回 —— true 表示这是一个自我强化的螺旋 */
  self_reinforcing: boolean;
  /** 若一路不拦，预计 AUM 从多少掉到多少 */
  aum_before: number;
  aum_projected: number;
  source_type: 'SIMULATED';
}

const EMPTY: CascadeProjection = {
  triggered: false,
  drawdown_pct: 0,
  steps: [],
  self_reinforcing: false,
  aum_before: 0,
  aum_projected: 0,
  source_type: 'SIMULATED',
};

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * 推演当前状态下的资金链走向。**纯函数，不改 state。**
 *
 * 这一点是刻意的：推演要能在玩家做决定之前反复调用来预览「如果我不管会怎样」，
 * 所以它绝不能有副作用。真正落地由 applyRedemption 负责。
 */
export function projectCascade(
  state: CascadeHost,
  opts: { equity: number; marginRequirement: number; buyingPower: number }
): CascadeProjection {
  const s = state;
  const lps = s.lp_profiles ?? [];
  if (!lps.length) return EMPTY;

  const peak = s.peak_aum ?? 0;
  const drawdown = peak > 0 ? ((peak - opts.equity) / peak) * 100 : 0;

  // 触线的 LP 按阈值从低到高——最沉不住气的那个先动
  const breached = lps
    .filter((lp) => drawdown > (lp.redemption_threshold_pct ?? Infinity))
    .sort((a, b) => (a.redemption_threshold_pct ?? 0) - (b.redemption_threshold_pct ?? 0));
  if (!breached.length) return { ...EMPTY, drawdown_pct: drawdown, aum_before: opts.equity };

  const origin = breached[0];
  const aum_before = lps.reduce((sum, lp) => sum + (lp.capital_current ?? lp.allocated_capital ?? 0), 0);

  // ── 第 1 环：赎回落地 ────────────────────────────────────────
  // 赎回比例随信心下滑而扩大。信心越低，走得越狠。
  const conf = origin.confidence_score ?? 60;
  const redeemPct = conf < 40 ? 0.5 : conf < 60 ? 0.3 : 0.15;
  const redeemAmount = (origin.capital_current ?? origin.allocated_capital ?? 0) * redeemPct;
  const aum_after = Math.max(0, aum_before - redeemAmount);

  const steps: CascadeStep[] = [];
  steps.push({
    stage: 'REDEMPTION',
    headline: `${origin.name} 赎回 ${Math.round(redeemPct * 100)}%`,
    detail:
      `回撤 ${drawdown.toFixed(1)}% 越过其 ${origin.redemption_threshold_pct?.toFixed(0)}% 阈值，` +
      `信心分 ${conf.toFixed(0)}。委员会触发条款，${money(redeemAmount)} 将在结算日被抽走。`,
    figures: { redeem_amount: redeemAmount, aum_before, aum_after, confidence: conf },
    interventions: [
      {
        id: 'in_person_roadshow',
        label: '当面路演：带归因报告飞去面谈',
        cost_summary: '耗费现金与人情；若成功可换取观察期',
        halts_at: 'REDEMPTION',
      },
      {
        id: 'partial_settle',
        label: '主动接受部分赎回',
        cost_summary: `立即付出 ${money(redeemAmount * 0.5)}，换取委员会停止全额挤兑`,
        halts_at: 'REDEMPTION',
      },
    ],
  });

  // ── 第 2 环：买力收缩 ────────────────────────────────────────
  //
  // 传导路径要说准：赎回的现金是**从基金净值里划出去的**，不是从 LP 台账上抹个数字。
  // 所以买力按 (净值 − 赎回额) / 净值 收缩，而不是按 AUM 比例——AUM 是出资承诺台账，
  // 和交易账户的可用资本是两回事。用错了这一步，杠杆越高的基金反而显得越安全，
  // 整条链就不成立了。
  const equityAfterRedemption = Math.max(0, opts.equity - redeemAmount);
  const shrink = opts.equity > 0 ? equityAfterRedemption / opts.equity : 1;
  const bp_after = opts.buyingPower * shrink;
  const shortfall = Math.max(0, opts.marginRequirement - bp_after);
  steps.push({
    stage: 'BUYING_POWER',
    headline: `保证金买力收缩至 ${money(bp_after)}`,
    detail:
      `资本缩水，PB 重算授信。当前维持保证金要求 ${money(opts.marginRequirement)}，` +
      (shortfall > 0
        ? `**缺口 ${money(shortfall)}**。`
        : `无缺口，但缓冲变薄。`),
    figures: { buying_power_after: bp_after, requirement: opts.marginRequirement, shortfall },
    interventions: [
      {
        id: 'deleverage_now',
        label: '主动去杠杆：自主减仓',
        cost_summary: '锁定亏损，但保留自选平仓腿的控制权',
        halts_at: 'BUYING_POWER',
      },
      {
        id: 'pb_forbearance',
        label: '向 PB 申请一天宽限',
        cost_summary: '消耗 PB 人情；此债必还',
        halts_at: 'BUYING_POWER',
      },
    ],
  });

  if (shortfall <= 0) {
    // 缺口为零，螺旋在第二环自然停住。仍然把前两环报告出来当作预警。
    return {
      triggered: true,
      origin_lp: {
        id: origin.id,
        name: origin.name,
        threshold_pct: origin.redemption_threshold_pct ?? 0,
      },
      drawdown_pct: drawdown,
      steps,
      self_reinforcing: false,
      aum_before,
      aum_projected: aum_after,
      source_type: 'SIMULATED',
    };
  }

  // ── 第 3 环：被迫平仓 ────────────────────────────────────────
  // 强平在最差的时候发生，滑点按压力放大。这里的 8% 是情景假设，不是市场观测，
  // 所以整个推演都标 SIMULATED。
  const forcedSlippage = 0.08;
  const realizedLoss = shortfall * forcedSlippage;
  steps.push({
    stage: 'FORCED_LIQUIDATION',
    headline: `被迫平仓 ${money(shortfall)} 敞口`,
    detail:
      `缺口无法补足，PB 启动强平，无视策略结构，组合腿可能被强拆。` +
      `压力滑点估计 ${(forcedSlippage * 100).toFixed(0)}%，预计额外损失 ${money(realizedLoss)}。`,
    figures: { forced_amount: shortfall, slippage_pct: forcedSlippage * 100, realized_loss: realizedLoss },
    interventions: [
      {
        id: 'choose_own_legs',
        label: '抢在强平前自主平仓',
        cost_summary: '难逃一亏，但可避免组合被拆及最差滑点',
        halts_at: 'FORCED_LIQUIDATION',
      },
    ],
  });

  // ── 第 4 环：业绩恶化 ────────────────────────────────────────
  const newEquity = Math.max(0, opts.equity - realizedLoss);
  const newDrawdown = peak > 0 ? ((peak - newEquity) / peak) * 100 : drawdown;
  steps.push({
    stage: 'PERFORMANCE',
    headline: `回撤扩大至 ${newDrawdown.toFixed(1)}%`,
    detail:
      `强平亏损计入净值。致命连锁：无新决策失误，` +
      `回撤却因上一环被动处置而扩大 ${(newDrawdown - drawdown).toFixed(1)} 个百分点。`,
    figures: { drawdown_before: drawdown, drawdown_after: newDrawdown, equity_after: newEquity },
    interventions: [],
  });

  // ── 第 5 环：下一个触线 ──────────────────────────────────────
  const next = lps
    .filter((lp) => lp.id !== origin.id)
    .filter((lp) => newDrawdown > (lp.redemption_threshold_pct ?? Infinity))
    .sort((a, b) => (a.redemption_threshold_pct ?? 0) - (b.redemption_threshold_pct ?? 0))[0];

  const selfReinforcing = Boolean(next);
  steps.push({
    stage: 'NEXT_TRIGGER',
    headline: next ? `${next.name} 随即触线` : '暂无其他 LP 触线',
    detail: next
      ? `新回撤 ${newDrawdown.toFixed(1)}% 击穿 ${next.name} 的 ${next.redemption_threshold_pct?.toFixed(0)}% 阈值。` +
        `螺旋重启，境况更劣。`
      : `链条中止，但缓冲已耗尽，下一次冲击空间更小。`,
    figures: { next_threshold: next?.redemption_threshold_pct ?? 0 },
    interventions: next
      ? [
          {
            id: 'preemptive_communication',
            label: `抢在触发前主动联系 ${next.name}`,
            cost_summary: '消耗人情，但主动通报胜过被动质询',
            halts_at: 'NEXT_TRIGGER',
          },
        ]
      : [],
  });

  return {
    triggered: true,
    origin_lp: {
      id: origin.id,
      name: origin.name,
      threshold_pct: origin.redemption_threshold_pct ?? 0,
    },
    drawdown_pct: drawdown,
    steps,
    self_reinforcing: selfReinforcing,
    aum_before,
    aum_projected: aum_after,
    source_type: 'SIMULATED',
  };
}

/**
 * 真正落地一次赎回。与 projectCascade 分开，是为了让「预览」和「执行」严格区分——
 * 玩家可以反复看推演而不改变任何东西。
 */
export function applyRedemption(
  state: CascadeHost,
  lpId: string,
  amount: number,
  onDate: string
): { ok: boolean; newCapital: number; log: string } {
  const s = state;
  const lp = (s.lp_profiles ?? []).find((x) => x.id === lpId);
  if (!lp) return { ok: false, newCapital: 0, log: `找不到 LP ${lpId}` };
  const before = lp.capital_current ?? lp.allocated_capital ?? 0;
  const actual = Math.min(before, Math.max(0, amount));
  lp.capital_current = before - actual;
  // 赎回本身就是信心已崩的证据，落地后进一步下调，避免同一个 LP 立刻又"恢复"
  lp.confidence_score = Math.max(10, (lp.confidence_score ?? 60) - 15);
  const log = `${onDate} ${lp.name} 赎回 ${money(actual)}，剩余出资 ${money(lp.capital_current)}`;
  s.cascade_log = [...(s.cascade_log ?? []), log];
  return { ok: true, newCapital: lp.capital_current, log };
}
