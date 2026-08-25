/**
 * V30 机制 A · 恩怨账本
 *
 * ── 这个引擎存在的理由 ────────────────────────────────────────────
 *
 * V27 评测报告说「感受不到被手下背叛或被同行绞杀的实感」。读过现有实现后，问题不在文案
 * ——Adrian Cross 用 2.5 倍签字费挖人、Maya 和 Victor 闭门争执这些写得很好——而在于
 * **选择的后果会蒸发**：每个选项给三个数字（favor/morale/reputation）加一句结果文案，
 * 然后没有任何东西记得这件事。你用律师函羞辱过 Adrian，和你花钱息事宁人，后续毫无区别。
 *
 * 背叛的实感来自后果链，不来自事件本身。所以这里建一本账：谁、什么时候、你对他做了什么、
 * 那件事是恩是怨、还是留下了一个把柄。后续所有事件生成先读这本账，再决定说什么话。
 *
 * ── 三种性质，分开记 ──────────────────────────────────────────────
 *
 * DEBT（恩）    你帮过对方，或对方欠你。可以在关键时刻兑现，兑现即消耗。
 * GRUDGE（怨）  你得罪过对方。不会自己消失，只会被对方在有利时机使用。
 * LEVERAGE（把柄）你手上握着对方的什么，或对方握着你的什么。**有方向**，
 *                 因为「谁握着谁」决定了后续是你要挟别人还是被人要挟。
 *
 * ── 为什么怨不会随时间衰减，恩会 ──────────────────────────────────
 *
 * 这是刻意的不对称，也是这类圈子的真实规律：人情不用会淡，仇不报不会忘。恩每过一段时间
 * 衰减一点，逼玩家要么及时兑现要么失去；怨保持原值直到被使用。这让「今天羞辱他省下的
 * $25,000」在三十天后仍然是一笔待付的账。
 */
// 类型定义统一放在 schemas.ts，与项目其余部分一致；这里只做行为。
import type { GrudgeKind, GrudgeLedgerEntry } from '../schemas';

export type { GrudgeKind };
export type LedgerEntry = GrudgeLedgerEntry;

/**
 * 账本宿主。刻意不写成 `GameState`：schemas 与 types 各自声明了一个 GameState，
 * 调用方（引擎侧 / UI 侧）持有的是不同那一个。只要求它带账本字段，两边都能传。
 */
export interface LedgerHost {
  grudge_ledger?: GrudgeLedgerEntry[];
}

/** 恩的半衰期：30 个游戏日衰减到一半。怨不适用。 */
const DEBT_HALFLIFE_DAYS = 30;

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
  return Math.max(0, Math.round((db - da) / 86400000));
}

export function getLedger(state: LedgerHost): LedgerEntry[] {
  return state.grudge_ledger ?? [];
}

function setLedger(state: LedgerHost, entries: LedgerEntry[]): void {
  state.grudge_ledger = entries;
}

export function record(
  state: LedgerHost,
  entry: Omit<LedgerEntry, 'id' | 'source_type' | 'spent'>
): LedgerEntry {
  const ledger = getLedger(state);
  const full: LedgerEntry = {
    ...entry,
    // 确定性 id：同一事件同一选项不会因为重复调用而记两笔
    id: `led_${entry.subject}_${entry.date}_${entry.origin_choice_id ?? entry.kind}`,
    spent: false,
    source_type: 'SIMULATED',
  };
  const existing = ledger.findIndex((e) => e.id === full.id);
  if (existing >= 0) ledger[existing] = full;
  else ledger.push(full);
  setLedger(state, ledger);
  return full;
}

/**
 * 当前有效强度。恩按半衰期衰减，怨与把柄保持原值。
 * 已使用的条目一律返回 0——它还在账上，但不再有力量。
 */
export function effectiveWeight(entry: LedgerEntry, asOfDate: string): number {
  if (entry.spent) return 0;
  if (entry.kind !== 'DEBT') return entry.weight;
  const elapsed = daysBetween(entry.date, asOfDate);
  return entry.weight * Math.pow(0.5, elapsed / DEBT_HALFLIFE_DAYS);
}

export interface StandingWith {
  subject: string;
  /** 净好感：恩为正、怨为负。用于判断对方现在愿不愿意帮你 */
  net: number;
  debt: number;
  grudge: number;
  /** 你握着对方的把柄 */
  leverageOver: LedgerEntry[];
  /** 对方握着你的把柄 */
  leverageAgainst: LedgerEntry[];
  /** 最重的一笔未结怨——事件文案会引用它，让对方"提起那件事" */
  sorest: LedgerEntry | null;
}

export function standingWith(state: LedgerHost, subject: string, asOfDate: string): StandingWith {
  const rows = getLedger(state).filter((e) => e.subject === subject);
  let debt = 0;
  let grudge = 0;
  const leverageOver: LedgerEntry[] = [];
  const leverageAgainst: LedgerEntry[] = [];
  let sorest: LedgerEntry | null = null;

  for (const e of rows) {
    const w = effectiveWeight(e, asOfDate);
    if (e.kind === 'DEBT') debt += w;
    else if (e.kind === 'GRUDGE') {
      grudge += w;
      if (w > 0 && (!sorest || w > effectiveWeight(sorest, asOfDate))) sorest = e;
    } else if (e.kind === 'LEVERAGE' && w > 0) {
      (e.holder === 'PLAYER' ? leverageOver : leverageAgainst).push(e);
    }
  }
  return { subject, net: debt - grudge, debt, grudge, leverageOver, leverageAgainst, sorest };
}

/**
 * 取一笔未结的怨用于生成报复事件，并标记为已使用。
 *
 * 「取走即标记」是刻意的：一笔怨只会被兑现一次。否则同一件事会被反复拿出来说，
 * 玩家会发现报复是一个刷屏的循环而不是一次清算。
 *
 * `minAgeDays` 是实机测出来必须有的一条。事件生成跑在 compute_view 里，而 compute_view
 * 每次算视图都会跑——不设时间门的话，玩家刚选完律师函，同一帧报复事件就把这笔怨消费掉了，
 * 账本上永远显示积怨 0，玩家根本看不见它挂在那里。
 *
 * 而且这也不合理：对手不会在你羞辱他的同一个下午就发出点名做空报告。
 * 「他记了很久」这句文案要成立，就得真的过时间。
 */
export function consumeGrudge(
  state: LedgerHost,
  subject: string,
  asOfDate: string,
  minWeight = 1,
  minAgeDays = 2
): LedgerEntry | null {
  const rows = getLedger(state)
    .filter((e) => e.subject === subject && e.kind === 'GRUDGE' && !e.spent)
    .filter((e) => daysBetween(e.date, asOfDate) >= minAgeDays)
    .filter((e) => effectiveWeight(e, asOfDate) >= minWeight)
    .sort((a, b) => effectiveWeight(b, asOfDate) - effectiveWeight(a, asOfDate));
  const hit = rows[0];
  if (!hit) return null;
  hit.spent = true;
  hit.spent_on_date = asOfDate;
  setLedger(state, getLedger(state));
  return hit;
}

/**
 * 兑现一笔恩情。返回是否兑现成功。
 *
 * 失败不是"没有余额"这么简单——如果这个人对你有未结的怨，即使账面还有恩，也可能拒绝。
 * 净值为负时一律拒绝，这是「你上次那么对我，现在来求我？」的机制表达。
 */
export function callInFavor(
  state: LedgerHost,
  subject: string,
  asOfDate: string,
  cost: number
): { ok: boolean; reason?: string; consumed?: LedgerEntry[] } {
  const st = standingWith(state, subject, asOfDate);
  if (st.net < 0) {
    return {
      ok: false,
      reason: st.sorest
        ? `${subject} 记着「${st.sorest.what}」那件事，现在不会为你出手。`
        : `${subject} 对基金积怨未清，拒绝了这次请求。`,
    };
  }
  if (st.debt < cost) {
    return { ok: false, reason: `人情不够：需要 ${cost}，当前可动用 ${Math.round(st.debt)}。` };
  }
  // 先消耗最旧的恩——旧人情本来就快过期了，优先花掉它是合理的
  const rows = getLedger(state)
    .filter((e) => e.subject === subject && e.kind === 'DEBT' && !e.spent)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  let remaining = cost;
  const consumed: LedgerEntry[] = [];
  for (const e of rows) {
    if (remaining <= 0) break;
    const w = effectiveWeight(e, asOfDate);
    if (w <= 0) continue;
    if (w <= remaining) {
      e.spent = true;
      e.spent_on_date = asOfDate;
      remaining -= w;
      consumed.push(e);
    } else {
      // 部分消耗：按已用比例调低原始权重，保留剩余
      e.weight = e.weight * (1 - remaining / w);
      remaining = 0;
      consumed.push(e);
    }
  }
  setLedger(state, getLedger(state));
  return { ok: true, consumed };
}

/** 面板用：按对象汇总，最重的排前面 */
export function ledgerSummary(state: LedgerHost, asOfDate: string): StandingWith[] {
  const subjects = [...new Set(getLedger(state).map((e) => e.subject))];
  return subjects
    .map((s) => standingWith(state, s, asOfDate))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/**
 * 某人的往来净值**历史**（2026-08-19 claude）
 *
 * ── 为什么加这个，而不是把轨迹存进存档 ──────────────────────────────
 *
 * WAR ROOM 每个席位下面那条折线，画的是 `净值 = 人情 − 积怨` 逐日变化。
 * 第一版是在 UI 组件里按天记进内存的——**刷新或读档就没了**，
 * harv 把它列为"现在必须还"的债。
 *
 * 但真正的解法不是持久化，是**重算**：`standingWith` 是账本与日期的纯函数，
 * 而账本本身早就在存档里。重算比持久化严格更好：
 *   · 老存档不用迁移就能显示完整轨迹
 *   · 永远不可能和账本对不上（存两份就一定有对不上的那天）
 *   · UI 层不用再维护"换 session 要清空"这类状态
 *
 * ── 但重算有个前视陷阱，必须在这里堵 ─────────────────────────────────
 *
 * `standingWith` **不按日期过滤条目**——它算的是"此刻"，本来就该看全部账本。
 * 直接拿它去算过去某一天，会把**那天之后才发生的事**算进去：
 * 玩家在第 5 天得罪了 Victor，第 2 天那个点也会显示为负。
 * 那条线就成了"用后来的事重写历史"。
 *
 * 所以这里先按 `entry.date <= asOf` 裁剪账本再算。
 */
export function standingHistory(
  host: LedgerHost,
  subject: string,
  dates: string[],
): number[] {
  const rows = getLedger(host).filter((e) => e.subject === subject);
  return dates.map((asOf) => {
    // 只看这一天**及之前**发生的事。少了这一行就是前视。
    const upto = rows.filter((e) => !e.date || e.date <= asOf);
    return standingWith({ grudge_ledger: upto } as LedgerHost, subject, asOf).net;
  });
}
