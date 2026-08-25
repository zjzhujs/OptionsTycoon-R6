import type { CharacterIncentiveSnapshot, GameState, IncentivePressureLevel, ReflexivityChallenge, ReflexivityFrame, ThesisCollision } from '../schemas';
import * as relationshipStages from './relationship_stage_engine';
import { renderReflexivityVoice } from './character_voice_engine';

const MIN_CAUSAL_TEXT = 10;

function clean(value: string | undefined | null): string { return (value ?? '').trim(); }

export function build_frame(
  firstOrderDriver: string,
  successFeedback: string,
  reflexiveFailure: string,
  observableStopTrigger: string,
): ReflexivityFrame {
  const values = [firstOrderDriver, successFeedback, reflexiveFailure, observableStopTrigger].map(clean);
  if (values.some((v) => v.length < MIN_CAUSAL_TEXT)) {
    throw new Error('别拿糊弄 LP 的套话来糊弄风控。因果链四项必须写到能被客观数据证伪，否则重写。');
  }
  return {
    first_order_driver: values[0],
    success_feedback: values[1],
    reflexive_failure: values[2],
    observable_stop_trigger: values[3],
    updated_at: new Date().toISOString(),
  };
}

export function backward_compatible_frame(mustBeTrue: string, falsifier: string, blindSpot = ''): ReflexivityFrame {
  const must = clean(mustBeTrue);
  const fail = clean(falsifier);
  const blind = clean(blindSpot);
  return {
    first_order_driver: must,
    success_feedback: blind || '如果这条判断开始兑现，我仍要观察供需、竞争、融资与政策是否因此改变参与者行为。',
    reflexive_failure: fail,
    observable_stop_trigger: fail,
    updated_at: new Date().toISOString(),
  };
}

function clamp(value: number, low = 0, high = 100): number { return Math.max(low, Math.min(high, value)); }

function pressureLevel(score: number): IncentivePressureLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'ELEVATED';
  return 'LOW';
}

function relationshipFact(state: GameState, characterId: string): { trust: number; respect: number } {
  const rel = state.relationships?.[characterId];
  return { trust: Number(rel?.trust ?? 50), respect: Number(rel?.respect ?? 50) };
}

function currentDate(state: GameState): string {
  return state.market_clock?.current_node_date || state.updated_at?.slice(0, 10) || 'UNKNOWN';
}

/**
 * Snapshot the character's current institutional incentive at the moment the
 * challenge is created. This explains WHY NOW; it never marks the character's
 * market view as correct and it reads no future campaign data.
 */
export function incentive_snapshot_for(state: GameState, characterId: string): CharacterIncentiveSnapshot {
  const date = currentDate(state);
  const fs = state.fund_stats ?? ({ cash: state.cash, nav: state.cash, aum: state.cash } as GameState['fund_stats']);
  const { trust, respect } = relationshipFact(state, characterId);

  if (characterId === 'maya_chen') {
    const morale = Number(fs.staff_morale ?? 60);
    const network = Number(fs.information_network ?? 50);
    const score = clamp((50 - morale) * 1.05 + (45 - network) * 0.75 + (45 - respect) * 0.55);
    const level = pressureLevel(score);
    const agenda = level === 'CRITICAL' || level === 'HIGH'
      ? '团队士气濒临崩溃；她死盯着你是不是在拿研报当遮羞布，掩饰你那千疮百孔的仓位。'
      : level === 'ELEVATED'
        ? '研究资源经不起再错一次了；她会逼问这套因果链是不是又一次“先画靶子再射箭”。'
        : '后方暂时安稳；她有精力把你逻辑里的产业常识漏洞一个个戳破。';
    return { pressure_level: level, agenda, state_facts: [`团队士气 ${morale.toFixed(0)}/100`, `信息网络 ${network.toFixed(0)}/100`, `Maya 尊重 ${respect.toFixed(0)}/100`, `Maya 信任 ${trust.toFixed(0)}/100`], captured_date: date };
  }

  if (characterId === 'victor_hale') {
    const drawdown = Math.max(0, Number(state.max_drawdown_pct ?? 0));
    const lp = Number(fs.lp_confidence ?? 70);
    const debt = Math.max(0, Number(state.margin_debt ?? 0));
    const cash = Math.max(1, Number(state.cash ?? 0));
    const debtRatio = debt / cash;
    const score = clamp(drawdown * 4.2 + (55 - lp) * 1.15 + Math.min(40, debtRatio * 45));
    const level = pressureLevel(score);
    const agenda = level === 'CRITICAL'
      ? '清盘的达摩克利斯之剑已经落下；他只问一个问题：就算你全对，你的保证金能撑到黎明吗？'
      : level === 'HIGH'
        ? '净值曲线在流血；他现在不在乎你看多看空，他只在乎你什么时候认输。'
        : level === 'ELEVATED'
          ? '回撤空间越来越窄；他会逼着你白纸黑字写下止损位，不给你留任何滑头的余地。'
          : '风险预算还够烧；他有耐心陪你推演一轮完整的反馈周期，但他随时会掐断你的粮草。';
    return { pressure_level: level, agenda, state_facts: [`最大回撤 ${drawdown.toFixed(1)}%`, `LP 信心 ${lp.toFixed(0)}/100`, `Margin/Cash ${(debtRatio * 100).toFixed(0)}%`], captured_date: date };
  }

  if (characterId === 'leo_park') {
    const open = (state.positions ?? []).filter((p) => Number(p.qty ?? 0) > 0);
    const shortDated = open.filter((p) => Number(p.thesis?.time_horizon_days ?? 99) <= 7).length;
    const volExposed = open.filter((p) => ['IV_RISE','IV_FALL','IV_STABLE'].includes(String(p.thesis?.volatility_view ?? ''))).length;
    const score = clamp(open.length * 12 + shortDated * 22 + volExposed * 8);
    const level = pressureLevel(score);
    const agenda = level === 'CRITICAL' || level === 'HIGH'
      ? '账面上堆满了短命、高杠杆的废纸；他懒得听基本面，他只会拿 IV 偏度和滑点往你脸上砸。'
      : level === 'ELEVATED'
        ? '方向看对却把期权做成亏损的风险极高；他会扒开你的合约，嘲笑你把便宜货买成了天价。'
        : '衍生品头寸还算干净；但他依然会检查做市商是不是早把你那点好消息割完了。';
    return { pressure_level: level, agenda, state_facts: [`开放期权仓位 ${open.length}`, `短期限仓位 ${shortDated}`, `显式 IV 假设仓位 ${volExposed}`], captured_date: date };
  }

  // Daniel / Prime Broker and fallback counterparty lens.
  const rows = Object.entries(state.institutional_relationships ?? {}).map(([id, raw]) => {
    const rel = raw as Record<string, unknown>;
    return { id, spread: Number(rel.financing_spread_bps ?? 150), bankTrust: Number(rel.trust ?? 60) };
  });
  const worst = rows.sort((a,b) => (b.spread-a.spread) || (a.bankTrust-b.bankTrust))[0] ?? { id: 'prime_broker', spread: 150, bankTrust: Number(fs.counterparty_trust ?? 60) };
  const debt = Math.max(0, Number(state.margin_debt ?? 0));
  const cash = Math.max(1, Number(state.cash ?? 0));
  const debtRatio = debt / cash;
  const score = clamp(Math.max(0, worst.spread - 140) * 0.45 + Math.max(0, 55 - worst.bankTrust) * 1.1 + Math.min(35, debtRatio * 40));
  const level = pressureLevel(score);
  const agenda = level === 'CRITICAL' || level === 'HIGH'
    ? '华尔街已经在准备吃你的尸体；他会直白地告诉你，再补不上保证金，明天他就替你平仓。'
    : level === 'ELEVATED'
      ? '信用敞口亮起黄灯；他会冷冷地提醒你，一旦挤兑发生，你连平仓的资格都没有。'
      : '额度还算充裕；但他依然会按惯例警告：别把流动性当成理所当然的空气，拔管子只是一瞬间的事。';
  return { pressure_level: level, agenda, state_facts: [`最紧 PB 点差 SOFR + ${Math.round(worst.spread)} bps`, `对应 PB 信任 ${Math.round(worst.bankTrust)}/100`, `Margin/Cash ${(debtRatio * 100).toFixed(0)}%`], captured_date: date };
}

const LENSES: Array<{ id: string; name: string; role: string; lens: string; full: (f: ReflexivityFrame) => string }> = [
  {
    id: 'maya_chen', name: 'Maya Chen', role: '基本面研究', lens: '产业 / 单位经济 / 竞争反应',
    full: (f) => `别把事情想得那么顺。“${f.first_order_driver}”一旦兑现，闻着血腥味过来的竞争者和上下游立刻就会因为“${f.success_feedback}”反噬你的利润池。你的护城河在哪？`,
  },
  {
    id: 'victor_hale', name: 'Victor Hale', role: '宏观 / 风险', lens: '组合生存 / 反馈速度 / 资本约束',
    full: (f) => `少扯基本面，你写的“${f.reflexive_failure}”要是发生，亏多少钱才会触发你的“${f.observable_stop_trigger}”？别告诉我你要等到净值爆仓才肯认错。`,
  },
  {
    id: 'leo_park', name: 'Leo Park', role: '期权做市', lens: 'IV / Skew / 期限 / 流动性',
    full: (f) => `就算“${f.first_order_driver}”真的发生了，做市商早就把“${f.success_feedback}”的预期抽干了 IV。你是在买入一份期权，还是在给对冲基金交智商税？`,
  },
  {
    id: 'daniel_ross', name: 'Daniel Ross', role: 'Prime Broker', lens: '融资 / Haircut / 对手方行为',
    full: (f) => `如果全市场都去抢“${f.success_feedback}”，谁来提供流动性？一旦保证金模型开始收缩，你的逻辑再对，也会被对手方强平出局。想清楚谁在借钱给你。`,
  },
];

export function build_character_challenges(state: GameState, frame: ReflexivityFrame): ReflexivityChallenge[] {
  return LENSES.map((lens) => {
    const stage = relationshipStages.stage_for(state, lens.id)?.stage ?? null;
    const disclosure = relationshipStages.disclosure_level(state, lens.id);
    const challenge = renderReflexivityVoice(state, lens.id, frame, disclosure);
    const incentive = incentive_snapshot_for(state, lens.id);
    return { character_id: lens.id, character_name: lens.name, role: lens.role, lens: lens.lens, challenge, relationship_stage: stage, disclosure_level: disclosure, incentive_snapshot: incentive };
  });
}

export function latest_resolved_frame(state: GameState): ReflexivityFrame | null {
  const episode = state.current_episode_number ?? 1;
  const resolved = (state.thesis_collisions ?? [])
    .filter((c) => c.resolved && c.episode === episode && c.hypothesis_frame?.reflexivity_frame)
    .sort((a,b) => b.date.localeCompare(a.date));
  return resolved[0]?.hypothesis_frame?.reflexivity_frame ?? null;
}

export function frame_for_collision(collision: ThesisCollision | null | undefined): ReflexivityFrame | null {
  return collision?.hypothesis_frame?.reflexivity_frame ?? null;
}
