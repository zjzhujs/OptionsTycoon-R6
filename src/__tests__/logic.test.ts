import { describe, it, expect } from 'vitest';
import { money, fmt, pct, clamp, badgeClass } from '../lib/format';
import { audioManager, sfxForIntelClass } from '../lib/audio';
import {
  formatVerdictRewrite,
  formatVerdictFinding,
  formatArchetype,
  formatExitReason,
  formatProvenance,
  formatBilingual,
  PROVENANCE_TERMS,
  ARCHETYPE_TERMS,
  EXIT_REASON_TERMS,
} from '../lib/financialLanguage';

describe('format utilities', () => {
  it('formats positive and negative currency amounts', () => {
    expect(money(123456.78)).toBe('$123,456.78');
    expect(money(-500.25)).toBe('-$500.25');
    expect(money(0)).toBe('$0.00');
  });

  it('formats precision numbers and percentages', () => {
    expect(fmt(4.5678, 2)).toBe('4.57');
    expect(pct(15.6)).toBe('+15.60%');
    expect(pct(-4.2)).toBe('-4.20%');
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns appropriate badge class for provenance', () => {
    expect(badgeClass('REAL')).toBe('badge real');
    expect(badgeClass('ESTIMATED')).toBe('badge estimated');
    expect(badgeClass('SIMULATED')).toBe('badge simulated');
    expect(badgeClass('UNKNOWN')).toBe('badge unavailable');
  });
});

describe('audio manager & sfx classification', () => {
  it('resolves the same routine notification cue for every intel classification (locked manifest has no distinct danger cue)', () => {
    expect(sfxForIntelClass('POSSIBLE_MNPI')).toBe('sfx_notification');
    expect(sfxForIntelClass('PRIVATE_INTEL')).toBe('sfx_notification');
    expect(sfxForIntelClass('MARKET_RUMOR')).toBe('sfx_notification');
    expect(sfxForIntelClass('MACRO_DATA')).toBe('sfx_notification');
  });

  it('manages audio volume levels and mute state', () => {
    audioManager.setLevels({ master: 0.75, muted: false });
    const lvls = audioManager.getLevels();
    expect(lvls.master).toBe(0.75);
    expect(lvls.muted).toBe(false);
  });

  it('handles effective volume calculations when muted', () => {
    audioManager.setLevels({ master: 0.8, muted: true });
    expect(audioManager.getLevels().muted).toBe(true);
  });

  it('clamps numerical values strictly within bounds', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(50, 0, 100)).toBe(50);
  });
});

describe('financialLanguage bilingual helpers', () => {
  it('translates all 9 Fund Manager Verdict headline and narrative branches with numbers', () => {
    // 1. YOU WON THE TRADE. YOU IGNORED THE FUND.
    const v1 = formatVerdictRewrite(
      'YOU WON THE TRADE. YOU IGNORED THE FUND.',
      'Your thesis was directionally correct and the position produced a profit of $884.54. But while it was open, 2 actionable fund event(s) went unanswered. You proved you could trade. You did not manage the fund.'
    );
    expect(v1.titleCn).toBe('这笔交易你赢了，但你忽视了基金管理。');
    expect(v1.titleEn).toBe('YOU WON THE TRADE. YOU IGNORED THE FUND.');
    expect(v1.bodyCn).toContain('$884.54');
    expect(v1.bodyCn).toContain('2');

    // 2. YOU WERE RIGHT. YOU STILL IGNORED THE FUND.
    const v2 = formatVerdictRewrite(
      'YOU WERE RIGHT. YOU STILL IGNORED THE FUND.',
      'Direction was correct, but the trade still lost $350.00, and 1 actionable fund event(s) went unanswered while it was open.'
    );
    expect(v2.titleCn).toBe('你的判断是对的，但你依然忽视了基金管理。');
    expect(v2.bodyCn).toContain('$350.00');
    expect(v2.bodyCn).toContain('1');

    // 3. GOOD THESIS. BAD TIMING.
    const v3 = formatVerdictRewrite(
      'GOOD THESIS. BAD TIMING.',
      'The direction call was right, but entry/exit timing relative to your own thesis horizon cost you.'
    );
    expect(v3.titleCn).toBe('投资逻辑没问题，时机选错了。');
    expect(v3.bodyCn).toBe('方向判断正确，但相对于你设定的投资周期，入场/出场时机出现了偏差，导致收益受损。');

    // 4. GOOD THESIS. WEAK DISCIPLINE.
    const v4 = formatVerdictRewrite(
      'GOOD THESIS. WEAK DISCIPLINE.',
      'Peak unrealized P&L reached $1,200.00; you closed at $600.00 (50% given back from the peak).'
    );
    expect(v4.titleCn).toBe('投资逻辑正确，但缺乏止盈纪律。');
    expect(v4.bodyCn).toContain('$1,200.00');
    expect(v4.bodyCn).toContain('$600.00');
    expect(v4.bodyCn).toContain('50%');

    // 5. WRONG THESIS. GOOD RISK CONTROL.
    const v5 = formatVerdictRewrite(
      'WRONG THESIS. GOOD RISK CONTROL.',
      'The directional call did not hold up against the real underlying move, but sizing and exit still returned a profit.'
    );
    expect(v5.titleCn).toBe('方向判断错了，但风险控制救了你。');
    expect(v5.bodyCn).toBe('方向判断未被标的真实走势验证，但合理的仓位控制与退出执行依然保住了利润。');

    // 6. YOU MADE MONEY. THE PROCESS WAS WEAK.
    const v6 = formatVerdictRewrite(
      'YOU MADE MONEY. THE PROCESS WAS WEAK.',
      'Realized P&L was positive ($500.00), but the process score (48/100) says the discipline behind it was not.'
    );
    expect(v6.titleCn).toBe('你赚到了钱，但这笔交易的过程并不漂亮。');
    expect(v6.bodyCn).toContain('$500.00');
    expect(v6.bodyCn).toContain('48/100');

    // 7. YOU LOST MONEY. THE PROCESS HELD.
    const v7 = formatVerdictRewrite(
      'YOU LOST MONEY. THE PROCESS HELD.',
      'The trade lost $200.00, but the process score (88/100) says the discipline behind it was sound.'
    );
    expect(v7.titleCn).toBe('这笔交易亏了钱，但你的决策过程没有失控。');
    expect(v7.bodyCn).toContain('$200.00');
    expect(v7.bodyCn).toContain('88/100');

    // 8. YOU WERE RIGHT, AND THE PROCESS HELD.
    const v8 = formatVerdictRewrite(
      'YOU WERE RIGHT, AND THE PROCESS HELD.',
      'Direction correct, profitable ($750.00), no unanswered fund events, no significant giveback from peak.'
    );
    expect(v8.titleCn).toBe('你的判断正确，且执行过程扎实严密。');
    expect(v8.bodyCn).toContain('$750.00');

    // 9. WRONG THESIS. WEAK PROCESS.
    const v9 = formatVerdictRewrite(
      'WRONG THESIS. WEAK PROCESS.',
      'Direction did not hold up and the process score (68/100) reflects real gaps, not just an unlucky outcome.'
    );
    expect(v9.titleCn).toBe('逻辑判断失误，交易过程存在硬伤。');
    expect(v9.titleEn).toBe('WRONG THESIS. WEAK PROCESS.');
    expect(v9.bodyCn).toContain('68/100');
  });

  it('translates verdict findings accurately', () => {
    expect(formatVerdictFinding('Thesis direction correct')).toBe('投资逻辑方向正确（Thesis direction correct）');
    expect(formatVerdictFinding('Thesis direction wrong')).toBe('投资逻辑方向错误（Thesis direction wrong）');
    expect(formatVerdictFinding('Instrument selection added value')).toBe('交易工具选择创造了价值（Instrument selection added value）');
    expect(formatVerdictFinding('Instrument selection cost you')).toBe('交易工具选择造成了损失（Instrument selection cost you）');
    expect(formatVerdictFinding('Entry/exit timing matched your own thesis horizon')).toBe('入场/出场时机与投资周期相匹配（Entry/exit timing matched horizon）');
    expect(formatVerdictFinding('Entry/exit timing drifted from your own thesis horizon')).toBe('入场/出场时机偏离了投资周期（Entry/exit timing drifted from horizon）');
    expect(formatVerdictFinding('Gave back 45% of peak unrealized profit before closing')).toContain('45%');
    expect(formatVerdictFinding('Ignored 3 actionable fund event(s) while this position was open')).toContain('3');
  });

  it('translates archetypes into bilingual Chinese (ENGLISH) format', () => {
    expect(formatArchetype('CONTRARIAN_VOLATILITY_SPECIALIST')).toBe('逆向波动率专家（CONTRARIAN VOLATILITY SPECIALIST）');
    expect(formatArchetype('DISCIPLINED_EQUITY_MANAGER')).toBe('纪律性股票基金经理（DISCIPLINED EQUITY MANAGER）');
    expect(formatArchetype('BALANCED_OPERATOR')).toBe('均衡配置型交易员（BALANCED OPERATOR）');
  });

  it('translates exit reasons into bilingual format', () => {
    expect(formatExitReason('TARGET_REACHED_OR_STOP_LOSS')).toBe('达到目标价或触发止损（TARGET REACHED OR STOP LOSS）');
    expect(formatExitReason('TARGET_OR_STOP')).toBe('止盈或止损平仓（TARGET OR STOP）');
    expect(formatExitReason('MANUAL_CLOSE')).toBe('手动主动平仓（MANUAL CLOSE）');
  });

  it('translates all provenance terms into bilingual format without raw strings', () => {
    expect(formatProvenance('REAL')).toBe('真实（REAL）');
    expect(formatProvenance('REAL_PRIMARY')).toBe('真实原始数据（REAL PRIMARY）');
    expect(formatProvenance('DERIVED_REAL_INPUTS')).toBe('基于真实输入推导（DERIVED REAL INPUTS）');
    expect(formatProvenance('DERIVED_HEURISTIC')).toBe('启发式推导（DERIVED HEURISTIC）');
    expect(formatProvenance('DERIVED_MODEL')).toBe('模型推导（DERIVED MODEL）');
    expect(formatProvenance('ESTIMATED')).toBe('估算（ESTIMATED）');
    expect(formatProvenance('SIMULATED')).toBe('模拟数据（SIMULATED）');
    expect(formatProvenance('DATA_UNAVAILABLE')).toBe('暂无可靠数据（DATA UNAVAILABLE）');
  });

  it('formats bilingual strings with fullwidth parentheses', () => {
    expect(formatBilingual('看涨', 'BULLISH')).toBe('看涨（BULLISH）');
  });
});
