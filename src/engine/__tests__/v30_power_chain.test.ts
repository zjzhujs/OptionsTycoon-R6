/**
 * V30 · 后果链。
 *
 * ── 返工说明 ──────────────────────────────────────────────────────
 *
 * 初版另造了一套四阶段合规调查，后来发现项目**早已有** evidence_engine：
 * 12 阶段调查（CLEAN → … → CHARGED → CONVICTED/ACQUITTED）、证据点/证人/知情度、
 * 举报人机制、PB 与 LP 反应，而且每天都在 game.ts 里跑。那套自造引擎已删除。
 *
 * 现在的分工是明确的：
 *   evidence_engine  管「监管会不会查你」——证据、证人、调查升级
 *   grudge_ledger    管「人会不会记你的仇」——恩、怨、把柄，以及具体那句话
 *
 * 所以这套测试盯两件事：
 *   1. 账本记得住具体做过什么，且后续事件引用得出来
 *   2. 越线的选项**确实带上了 legality_class 与证据 delta**，
 *      能被既有的 evidence_engine 接管——不是并行一套自嗨的系统
 */
import { describe, expect, it } from 'vitest';
import { generatePowerEvents, recordChoiceConsequence } from '../engines/power_events';
import { getLedger, standingWith } from '../engines/grudge_ledger';

const NODE = { date: '2025-01-27', underlying_bar: { close: 118.42 } } as any;

/** 从生成的事件里取某个选项，用来检查它带了哪些 delta */
function choiceOf(events: any[], eventPrefix: string, choiceId: string) {
  const e = events.find((x) => x.id.startsWith(eventPrefix));
  return e?.choices?.find((c: any) => c.id === choiceId);
}

describe('V30 后果链 — 选择会找上门来', () => {
  it('结怨当天不会立刻报复 —— 对手不会在同一个下午就发点名报告', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'legal_injunction', '2025-01-27');
    // 同一天
    const sameDay = generatePowerEvents(s, NODE);
    expect(sameDay.find((e) => e.id.startsWith('pw_retaliate'))).toBeUndefined();
    // 账本上那笔怨必须还在，没被静默消费掉
    expect(getLedger(s)[0].spent).toBe(false);
  });

  it('用律师函羞辱过对手，后续做空报告点名本基金并提起那件事', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'legal_injunction', '2025-01-24');
    const hit = generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_retaliate'));
    expect(hit).toBeTruthy();
    expect(hit!.headline).toContain('点名');
    // 关键：文案必须复述玩家当初具体做了什么，而不是泛泛的"对手报复你"
    expect(hit!.body).toContain('竞业禁止律师函');
  });

  it('没有旧怨就不会凭空出现报复 —— 事件由行为驱动，不是随机', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'match_bonus', '2025-01-24');
    expect(generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_retaliate'))).toBeUndefined();
  });

  it('放走的人带着"知道我们怎么想"回来，文案引用当初的处理', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'let_go_and_reorg', '2025-01-24'); // 距 1/27 三天
    const hit = generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_defect'));
    expect(hit).toBeTruthy();
    expect(hit!.body).toContain('任由她的建模师被挖走');
  });

  it('报复只清算一次，不会天天刷屏', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'legal_injunction', '2025-01-24');
    expect(generatePowerEvents(s, NODE).some((e) => e.id.startsWith('pw_retaliate'))).toBe(true);
    expect(
      generatePowerEvents(s, { ...NODE, date: '2025-01-28' }).some((e) => e.id.startsWith('pw_retaliate'))
    ).toBe(false);
  });
});

describe('V30 后果链 — 人情是要开口求的，而且可能被拒', () => {
  it('欠着账时，求宽限的文案直接说破"未必有人接"', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e1', 'ask_forbearance', '2025-01-24');
    const hit = generatePowerEvents(s, NODE, { marginPressure: true })
      .find((e) => e.id.startsWith('pw_favor_pb'));
    expect(hit).toBeTruthy();
    expect(hit!.body).toContain('未必有人接');
  });

  it('没有保证金压力时不会无端弹出求助事件', () => {
    const s: any = {};
    expect(
      generatePowerEvents(s, NODE, { marginPressure: false }).find((e) => e.id.startsWith('pw_favor_pb'))
    ).toBeUndefined();
  });
});

describe('V30 那条线 — 必须真的喂进既有的证据系统', () => {
  it('必须先走过背景交流，越线的机会才会出现', () => {
    const s: any = {};
    expect(generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_line'))).toBeUndefined();
    recordChoiceConsequence(s, 'e_wsj', 'off_the_record_exchange', '2025-01-24');
    const hit = generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_line'));
    expect(hit).toBeTruthy();
    expect(hit!.body).toContain('这是那条线');
  });

  it('越线选项带 MNPI_RISK 与证据 delta —— evidence_engine 才接得住', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_wsj', 'off_the_record_exchange', '2025-01-24');
    const c = choiceOf(generatePowerEvents(s, NODE), 'pw_line', 'take_mnpi');
    expect(c).toBeTruthy();
    // 这几项是既有 evidence_engine.record_action 真正读取的字段。
    // 少了它们，越线就只是一句文案，监管永远不会因此查你。
    expect(c.legality_class).toBe('MNPI_RISK');
    expect(c.evidence_points_delta).toBeGreaterThan(0);
    expect(c.witness_delta).toBeGreaterThan(0); // Evelyn 知道这件事
    expect(c.compliance_risk_delta).toBeGreaterThan(0);
    expect(c.information_ethics_delta).toBeLessThan(0);
  });

  it('婉拒是 LEGAL 且提升信息伦理 —— 守住线要被奖励', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_wsj', 'off_the_record_exchange', '2025-01-24');
    const c = choiceOf(generatePowerEvents(s, NODE), 'pw_line', 'decline_mnpi');
    expect(c.legality_class).toBe('LEGAL');
    expect(c.information_ethics_delta).toBeGreaterThan(0);
    expect(c.evidence_points_delta).toBeUndefined();
  });

  it('放料给记者是灰色手段，标 AGGRESSIVE_LAWFUL 并推高外部知情度', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_poach', 'legal_injunction', '2025-01-24');
    const c = choiceOf(generatePowerEvents(s, NODE), 'pw_retaliate', 'counter_leak');
    expect(c.legality_class).toBe('AGGRESSIVE_LAWFUL');
    expect(c.external_awareness_delta).toBeGreaterThan(0);
  });

  it('越线同时在恩怨账本留下"对方握着你"的把柄', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_line', 'take_mnpi', '2025-01-27');
    const st = standingWith(s, 'evelyn_shaw', '2025-01-28');
    expect(st.leverageAgainst).toHaveLength(1);
    expect(st.leverageOver).toHaveLength(0);
  });

  it('越过一次之后不再重复提供这个选项', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'e_wsj', 'off_the_record_exchange', '2025-01-24');
    recordChoiceConsequence(s, 'e_line', 'take_mnpi', '2025-01-27');
    expect(generatePowerEvents(s, NODE).find((e) => e.id.startsWith('pw_line'))).toBeUndefined();
  });
});

describe('V30 账本本身', () => {
  it('每个被映射的选项都真的落账，且写得出具体做了什么', () => {
    const ids = [
      'legal_injunction', 'match_bonus', 'let_go_and_reorg', 'side_with_maya',
      'side_with_victor', 'compromise_hedge', 'off_the_record_exchange',
      'counter_leak', 'apologize_to_maya', 'take_mnpi', 'ask_forbearance',
    ];
    for (const id of ids) {
      const s: any = {};
      const e = recordChoiceConsequence(s, 'evt', id, '2025-01-24');
      expect(e, `${id} 应当落账`).not.toBeNull();
      expect(e!.what.length).toBeGreaterThan(4);
      expect(e!.source_type).toBe('SIMULATED');
    }
  });

  it('未映射的选项不落账，不制造凭空的恩怨', () => {
    const s: any = {};
    expect(recordChoiceConsequence(s, 'evt', 'some_unmapped_choice', '2025-01-24')).toBeNull();
    expect(getLedger(s)).toHaveLength(0);
  });

  it('同一事件同一选项重复调用不会记成两笔', () => {
    const s: any = {};
    recordChoiceConsequence(s, 'evt', 'legal_injunction', '2025-01-24');
    recordChoiceConsequence(s, 'evt', 'legal_injunction', '2025-01-24');
    expect(getLedger(s)).toHaveLength(1);
  });
});
