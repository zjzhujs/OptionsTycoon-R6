// ---------------------------------------------------------------------------
// Canonical Financial Language & Bilingual Display Mappings
//
// Language Policy:
// Primary: Natural Chinese
// Secondary: Standard Professional English Financial Terminology
//
// Standard Display Format: 中文（ENGLISH） or two-line 中文 / ENGLISH.
// ---------------------------------------------------------------------------

export interface BilingualTerm {
  cn: string;
  en: string;
  display: string;
  tooltip?: string;
}

export const DIRECTION_TERMS: Record<string, BilingualTerm> = {
  BULLISH: { cn: '看涨', en: 'BULLISH', display: '看涨（BULLISH）' },
  BEARISH: { cn: '看跌', en: 'BEARISH', display: '看跌（BEARISH）' },
  NEUTRAL: { cn: '中性', en: 'NEUTRAL', display: '中性（NEUTRAL）' },
  UNSURE: { cn: '暂不判断', en: 'UNSURE', display: '暂不判断（UNSURE）' },
};

export const ACTION_TERMS: Record<string, BilingualTerm> = {
  BUY_TO_OPEN: { cn: '买入开仓', en: 'BUY TO OPEN', display: '买入开仓（BUY TO OPEN）' },
  SELL_TO_CLOSE: { cn: '卖出平仓', en: 'SELL TO CLOSE', display: '卖出平仓（SELL TO CLOSE）' },
  SELL_TO_OPEN: { cn: '卖出开仓', en: 'SELL TO OPEN', display: '卖出开仓（SELL TO OPEN）' },
  BUY_TO_CLOSE: { cn: '买入平仓', en: 'BUY TO CLOSE', display: '买入平仓（BUY TO CLOSE）' },
};

export const OPTION_TYPE_TERMS: Record<string, BilingualTerm> = {
  CALL: { cn: '看涨期权', en: 'CALL', display: '看涨期权（CALL）' },
  PUT: { cn: '看跌期权', en: 'PUT', display: '看跌期权（PUT）' },
};

export const ORDER_TYPE_TERMS: Record<string, BilingualTerm> = {
  MARKET: { cn: '市价单', en: 'MARKET ORDER', display: '市价单（MARKET ORDER）' },
  LIMIT: { cn: '限价单', en: 'LIMIT ORDER', display: '限价单（LIMIT ORDER）' },
  MARKET_ORDER: { cn: '市价单', en: 'MARKET ORDER', display: '市价单（MARKET ORDER）' },
  LIMIT_ORDER: { cn: '限价单', en: 'LIMIT ORDER', display: '限价单（LIMIT ORDER）' },
};

export const GREEKS_TERMS: Record<string, BilingualTerm> = {
  DELTA: {
    cn: '德尔塔',
    en: 'DELTA',
    display: '德尔塔（DELTA）',
    tooltip: '标的价格每变化1美元，期权价格大致变化的金额。',
  },
  GAMMA: {
    cn: '伽马',
    en: 'GAMMA',
    display: '伽马（GAMMA）',
    tooltip: '标的价格变化时，Delta本身的敏感度变化速度。',
  },
  THETA: {
    cn: '西塔 / 时间价值损耗',
    en: 'THETA',
    display: '西塔 / 时间价值损耗（THETA）',
    tooltip: '时间流逝本身对期权价值每日造成的损耗金额。',
  },
  VEGA: {
    cn: '维加 / 波动率敏感度',
    en: 'VEGA',
    display: '维加 / 波动率敏感度（VEGA）',
    tooltip: '隐含波动率变化1%对期权价格的影响。',
  },
};

export const PROVENANCE_TERMS: Record<string, BilingualTerm> = {
  REAL: { cn: '真实', en: 'REAL', display: '真实（REAL）' },
  REAL_PRIMARY: { cn: '真实原始数据', en: 'REAL PRIMARY', display: '真实原始数据（REAL PRIMARY）' },
  DERIVED: { cn: '推导数据', en: 'DERIVED', display: '推导数据（DERIVED）' },
  DERIVED_REAL_INPUTS: {
    cn: '基于真实输入推导',
    en: 'DERIVED REAL INPUTS',
    display: '基于真实输入推导（DERIVED REAL INPUTS）',
  },
  DERIVED_MODEL: { cn: '模型推导', en: 'DERIVED MODEL', display: '模型推导（DERIVED MODEL）' },
  DERIVED_HEURISTIC: { cn: '启发式推导', en: 'DERIVED HEURISTIC', display: '启发式推导（DERIVED HEURISTIC）' },
  ESTIMATED: { cn: '估算', en: 'ESTIMATED', display: '估算（ESTIMATED）' },
  SIMULATED: { cn: '模拟数据', en: 'SIMULATED', display: '模拟数据（SIMULATED）' },
  DATA_UNAVAILABLE: { cn: '暂无可靠数据', en: 'DATA UNAVAILABLE', display: '暂无可靠数据（DATA UNAVAILABLE）' },
  PLAYER_INPUT: { cn: '玩家输入', en: 'PLAYER INPUT', display: '玩家输入（PLAYER INPUT）' },
};

export const LEGAL_STATUS_TERMS: Record<string, BilingualTerm> = {
  LEGAL: { cn: '合法', en: 'LEGAL', display: '合法（LEGAL）' },
  AGGRESSIVE_LAWFUL: { cn: '激进但合法', en: 'AGGRESSIVE LAWFUL', display: '激进但合法（AGGRESSIVE LAWFUL）' },
  MNPI_RISK: { cn: '存在MNPI风险', en: 'MNPI RISK', display: '存在MNPI风险（MNPI RISK）' },
  ILLEGAL: { cn: '违法', en: 'ILLEGAL', display: '违法（ILLEGAL）' },
};

export const POSITION_DECISION_ACTIONS: Record<string, BilingualTerm> = {
  HOLD: { cn: '继续持有', en: 'HOLD', display: '继续持有（HOLD）' },
  REDUCE: { cn: '减仓', en: 'REDUCE', display: '减仓（REDUCE）' },
  CLOSE: { cn: '全部平仓', en: 'CLOSE', display: '全部平仓（CLOSE）' },
};

export const POSITION_DECISION_HEADLINES: Record<string, BilingualTerm> = {
  SIGNIFICANT_PROFIT: { cn: '大幅浮盈', en: 'SIGNIFICANT PROFIT', display: '大幅浮盈（SIGNIFICANT PROFIT）' },
  PROFIT_GIVEBACK: { cn: '浮盈明显回吐', en: 'PROFIT GIVEBACK', display: '浮盈明显回吐（PROFIT GIVEBACK）' },
  THESIS_INVALIDATION: { cn: '投资逻辑失效', en: 'THESIS INVALIDATION', display: '投资逻辑失效（THESIS INVALIDATION）' },
};

export const ARCHETYPE_TERMS: Record<string, BilingualTerm> = {
  CONTRARIAN_VOLATILITY_SPECIALIST: {
    cn: '逆向波动率专家',
    en: 'CONTRARIAN VOLATILITY SPECIALIST',
    display: '逆向波动率专家（CONTRARIAN VOLATILITY SPECIALIST）',
  },
  DISCIPLINED_EQUITY_MANAGER: {
    cn: '纪律性股票基金经理',
    en: 'DISCIPLINED EQUITY MANAGER',
    display: '纪律性股票基金经理（DISCIPLINED EQUITY MANAGER）',
  },
  BALANCED_OPERATOR: {
    cn: '均衡配置型交易员',
    en: 'BALANCED OPERATOR',
    display: '均衡配置型交易员（BALANCED OPERATOR）',
  },
  MOMENTUM_GROWTH_TRADER: {
    cn: '动量成长交易员',
    en: 'MOMENTUM GROWTH TRADER',
    display: '动量成长交易员（MOMENTUM GROWTH TRADER）',
  },
  MACRO_TAIL_HEDGER: {
    cn: '宏观尾部对冲者',
    en: 'MACRO TAIL HEDGER',
    display: '宏观尾部对冲者（MACRO TAIL HEDGER）',
  },
  SYSTEMATIC_QUANT: {
    cn: '系统量化交易员',
    en: 'SYSTEMATIC QUANT',
    display: '系统量化交易员（SYSTEMATIC QUANT）',
  },
};

export const EXIT_REASON_TERMS: Record<string, BilingualTerm> = {
  PLAYER_MANUAL_CLOSE: {
    cn: '玩家主动平仓',
    en: 'PLAYER MANUAL CLOSE',
    display: '玩家主动平仓（PLAYER MANUAL CLOSE）',
  },
  PLAYER_SELL_TO_CLOSE: {
    cn: '玩家卖出平仓',
    en: 'PLAYER SELL TO CLOSE',
    display: '玩家卖出平仓（PLAYER SELL TO CLOSE）',
  },
  PLAYER_BUY_TO_CLOSE: {
    cn: '玩家买入平仓',
    en: 'PLAYER BUY TO CLOSE',
    display: '玩家买入平仓（PLAYER BUY TO CLOSE）',
  },
  STRATEGY_CLOSE: {
    cn: '玩家关闭组合策略',
    en: 'STRATEGY CLOSE',
    display: '玩家关闭组合策略（STRATEGY CLOSE）',
  },
  TARGET_REACHED_OR_STOP_LOSS: {
    cn: '达到目标价或触发止损',
    en: 'TARGET REACHED OR STOP LOSS',
    display: '达到目标价或触发止损（TARGET REACHED OR STOP LOSS）',
  },
  TARGET_OR_STOP: {
    cn: '止盈或止损平仓',
    en: 'TARGET OR STOP',
    display: '止盈或止损平仓（TARGET OR STOP）',
  },
  MANUAL_CLOSE: {
    cn: '手动主动平仓',
    en: 'MANUAL CLOSE',
    display: '手动主动平仓（MANUAL CLOSE）',
  },
  EXPIRATION: {
    cn: '合约到期结算',
    en: 'EXPIRATION',
    display: '合约到期结算（EXPIRATION）',
  },
  RISK_LIMIT_BREACH: {
    cn: '触及风险限额强制平仓',
    en: 'RISK LIMIT BREACH',
    display: '触及风险限额强制平仓（RISK LIMIT BREACH）',
  },
};

export const INVESTIGATION_STAGE_TERMS: Record<string, BilingualTerm> = {
  CLEAN: { cn: '暂无调查', en: 'CLEAN', display: '暂无调查（CLEAN）' },
  SUSPICIOUS: { cn: '已引起注意', en: 'SUSPICIOUS', display: '已引起注意（SUSPICIOUS）' },
  INTERNAL_CONCERN: { cn: '内部合规关注', en: 'INTERNAL CONCERN', display: '内部合规关注（INTERNAL CONCERN）' },
  REGULATORY_INQUIRY: { cn: '监管问询', en: 'REGULATORY INQUIRY', display: '监管问询（REGULATORY INQUIRY）' },
  FORMAL_INVESTIGATION: { cn: '正式调查', en: 'FORMAL INVESTIGATION', display: '正式调查（FORMAL INVESTIGATION）' },
  CIVIL_ENFORCEMENT: { cn: '民事执法程序', en: 'CIVIL ENFORCEMENT', display: '民事执法程序（CIVIL ENFORCEMENT）' },
  CRIMINAL_INVESTIGATION: { cn: '刑事调查', en: 'CRIMINAL INVESTIGATION', display: '刑事调查（CRIMINAL INVESTIGATION）' },
  CHARGED: { cn: '已被起诉', en: 'CHARGED', display: '已被起诉（CHARGED）' },
  SETTLED: { cn: '达成和解', en: 'SETTLED', display: '达成和解（SETTLED）' },
  TRIAL: { cn: '审判程序', en: 'TRIAL', display: '审判程序（TRIAL）' },
  CONVICTED: { cn: '定罪', en: 'CONVICTED', display: '定罪（CONVICTED）' },
  ACQUITTED: { cn: '无罪判决', en: 'ACQUITTED', display: '无罪判决（ACQUITTED）' },
};

export const DATA_CATEGORY_TERMS: Record<string, BilingualTerm> = {
  OPTIONS_DATA: { cn: '期权交易流', en: 'OPTIONS FLOW', display: '期权交易流（OPTIONS FLOW）' },
  OPTIONS_FLOW: { cn: '期权交易流', en: 'OPTIONS FLOW', display: '期权交易流（OPTIONS FLOW）' },
  ALT_DATA: { cn: '另类数据', en: 'ALTERNATIVE DATA', display: '另类数据（ALTERNATIVE DATA）' },
  ALTERNATIVE_DATA: { cn: '另类数据', en: 'ALTERNATIVE DATA', display: '另类数据（ALTERNATIVE DATA）' },
  NEWS: { cn: '新闻资讯', en: 'NEWS', display: '新闻资讯（NEWS）' },
  FILINGS: { cn: '监管文件', en: 'FILINGS', display: '监管文件（FILINGS）' },
  TRANSCRIPTS: { cn: '财报与电话会记录', en: 'TRANSCRIPTS', display: '财报与电话会记录（TRANSCRIPTS）' },
  MACRO: { cn: '宏观数据', en: 'MACRO', display: '宏观数据（MACRO）' },
  POLICY: { cn: '政策研究', en: 'POLICY', display: '政策研究（POLICY）' },
};

export const AI_STACK_TERMS: Record<string, BilingualTerm> = {
  LEVEL_0_MANUAL: { cn: '手工投研', en: 'LEVEL 0 · MANUAL', display: '手工投研（LEVEL 0 · MANUAL）' },
  LEVEL_1_ASSISTANT: { cn: 'AI研究助手', en: 'LEVEL 1 · ASSISTANT', display: 'AI研究助手（LEVEL 1 · ASSISTANT）' },
  LEVEL_2_MULTI_AGENT: { cn: '多智能体投研台', en: 'LEVEL 2 · MULTI-AGENT', display: '多智能体投研台（LEVEL 2 · MULTI-AGENT）' },
  LEVEL_3_INSTITUTIONAL: { cn: '机构级AI投研系统', en: 'LEVEL 3 · INSTITUTIONAL', display: '机构级AI投研系统（LEVEL 3 · INSTITUTIONAL）' },
};

export const EMOTION_TERMS: Record<string, BilingualTerm> = {
  NEUTRAL: { cn: '平静', en: 'NEUTRAL', display: '平静（NEUTRAL）' },
  PRESSURE: { cn: '承压', en: 'PRESSURE', display: '承压（PRESSURE）' },
  CONFLICT: { cn: '分歧', en: 'CONFLICT', display: '分歧（CONFLICT）' },
  SUCCESS: { cn: '顺风', en: 'SUCCESS', display: '顺风（SUCCESS）' },
  LOSS: { cn: '受挫', en: 'LOSS', display: '受挫（LOSS）' },
};

export const CONTEXT_SNAPSHOT_TERMS: Record<string, BilingualTerm> = {
  STOCK_PRICE: { cn: '标的价格', en: 'STOCK PRICE', display: '标的价格（STOCK PRICE）' },
  STREET_CONSENSUS: { cn: '市场一致预期', en: 'STREET CONSENSUS', display: '市场一致预期（STREET CONSENSUS）' },
  COUNTERPARTY: { cn: '对手方类型', en: 'COUNTERPARTY', display: '对手方类型（COUNTERPARTY）' },
  FLOW_PCR: { cn: '期权流 Put/Call 比', en: 'FLOW PCR', display: '期权流 Put/Call 比（FLOW PCR）' },
  CROWDEDNESS: { cn: '拥挤度', en: 'CROWDEDNESS', display: '拥挤度（CROWDEDNESS）' },
  RETAIL_FEAR_GREED: { cn: '散户情绪', en: 'RETAIL FEAR/GREED', display: '散户情绪（RETAIL FEAR/GREED）' },
  BANK_TIER: { cn: '做市商层级', en: 'BANK TIER', display: '做市商层级（BANK TIER）' },
  VOLUME_SHOCK: { cn: '成交量异动', en: 'VOLUME SHOCK', display: '成交量异动（VOLUME SHOCK）' },
  EXIT_PRICE: { cn: '离场价格', en: 'EXIT PRICE', display: '离场价格（EXIT PRICE）' },
};

export const MATRIX_HEADER_TERMS: Record<string, BilingualTerm> = {
  FACTOR: { cn: '因子', en: 'FACTOR', display: '因子（FACTOR）' },
  ENTRY: { cn: '入场时', en: 'ENTRY', display: '入场时（ENTRY）' },
  EXIT: { cn: '离场时', en: 'EXIT', display: '离场时（EXIT）' },
  CHANGED: { cn: '是否变化', en: 'CHANGED', display: '是否变化（CHANGED）' },
  IMPACT: { cn: '影响', en: 'IMPACT', display: '影响（IMPACT）' },
  SOURCE: { cn: '数据来源', en: 'SOURCE', display: '数据来源（SOURCE）' },
  CONFIDENCE: { cn: '置信度', en: 'CONFIDENCE', display: '置信度（CONFIDENCE）' },
};

export function formatContextSnapshotField(field?: string): string {
  if (!field) return '—';
  const clean = field.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  return CONTEXT_SNAPSHOT_TERMS[clean]?.display || field;
}

export function formatMatrixHeader(header?: string): string {
  if (!header) return '—';
  const clean = header.trim().toUpperCase().replace(/[\s\/-]+/g, '_');
  return MATRIX_HEADER_TERMS[clean]?.display || header;
}


export function formatInvestigationStage(stage?: string): string {
  if (!stage) return '暂无调查（CLEAN）';
  const clean = stage.trim().toUpperCase();
  return INVESTIGATION_STAGE_TERMS[clean]?.display || `${stage}（${stage}）`;
}

export function formatDataCategory(category?: string): string {
  if (!category) return '—';
  const clean = category.trim().toUpperCase();
  return DATA_CATEGORY_TERMS[clean]?.display || `${category}（${category}）`;
}

export function formatAIStack(level?: string): string {
  if (!level) return '—';
  const clean = level.trim().toUpperCase();
  return AI_STACK_TERMS[clean]?.display || `${level}（${level}）`;
}

export function formatEmotion(emotion?: string): string {
  if (!emotion) return '平静（NEUTRAL）';
  const clean = emotion.trim().toUpperCase();
  return EMOTION_TERMS[clean]?.display || `${emotion}（${emotion}）`;
}

/**
 * Format Trader Profile Archetype tag to bilingual Chinese (ENGLISH).
 */
export function formatArchetype(tag?: string): string {
  if (!tag) return '—';
  const cleanTag = tag.trim();
  const item = ARCHETYPE_TERMS[cleanTag] || ARCHETYPE_TERMS[cleanTag.toUpperCase()];
  if (item) return item.display;
  const humanEn = cleanTag.replace(/_/g, ' ');
  return `${humanEn}（${cleanTag}）`;
}

/**
 * Format Exit Reason enum to bilingual Chinese (ENGLISH).
 */
export function formatExitReason(reason?: string): string {
  if (!reason) return '主动平仓止盈/止损';
  const cleanReason = reason.trim();
  const item = EXIT_REASON_TERMS[cleanReason] || EXIT_REASON_TERMS[cleanReason.toUpperCase()];
  if (item) return item.display;
  return cleanReason;
}

/**
 * Format Provenance Source Type to bilingual Chinese (ENGLISH).
 */
export function formatProvenance(sourceType?: string): string {
  if (!sourceType) return '暂无可靠数据（DATA UNAVAILABLE）';
  const cleanSrc = sourceType.trim();
  const term = PROVENANCE_TERMS[cleanSrc] || PROVENANCE_TERMS[cleanSrc.toUpperCase()];
  if (term) return term.display;
  return `${cleanSrc}（${cleanSrc}）`;
}

/**
 * Translate 360 Review Verdict Finding lines into polished bilingual format.
 */
export function formatVerdictFinding(text?: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === 'Thesis direction correct') {
    return '投资逻辑方向正确（Thesis direction correct）';
  }
  if (trimmed === 'Thesis direction wrong') {
    return '投资逻辑方向错误（Thesis direction wrong）';
  }
  if (trimmed === 'Instrument selection added value') {
    return '交易工具选择创造了价值（Instrument selection added value）';
  }
  if (trimmed === 'Instrument selection cost you') {
    return '交易工具选择造成了损失（Instrument selection cost you）';
  }
  if (trimmed === 'Entry/exit timing matched your own thesis horizon') {
    return '入场/出场时机与投资周期相匹配（Entry/exit timing matched horizon）';
  }
  if (trimmed === 'Entry/exit timing drifted from your own thesis horizon') {
    return '入场/出场时机偏离了投资周期（Entry/exit timing drifted from horizon）';
  }

  const givebackMatch = trimmed.match(/Gave back (\d+(?:\.\d+)?)% of peak unrealized profit before closing/i);
  if (givebackMatch) {
    return `平仓前从最高浮盈回吐了 ${givebackMatch[1]}% 利润（Gave back ${givebackMatch[1]}% peak profit）`;
  }

  const ignoredMatch = trimmed.match(/Ignored (\d+) actionable fund event\(s\)? while this position was open/i);
  if (ignoredMatch) {
    return `持仓期间忽视了 ${ignoredMatch[1]} 件需要处理的基金重要事项（Ignored ${ignoredMatch[1]} fund events）`;
  }

  return trimmed;
}

/**
 * Polished, natural Chinese translations for 360 Review Verdicts with live value interpolation.
 * Covers all 9 rule branches generated by backend/app/engines/trade_review.py::build_fund_manager_verdict.
 */
export function formatVerdictRewrite(
  verdictTitle: string,
  defaultMessage?: string,
): { titleCn: string; titleEn: string; bodyCn?: string } {
  const upper = verdictTitle.toUpperCase().trim();

  // 1. YOU WON THE TRADE. YOU IGNORED THE FUND.
  if (upper.includes('YOU WON THE TRADE') && upper.includes('IGNORED THE FUND')) {
    const profitMatch = defaultMessage?.match(/\$([0-9,]+\.[0-9]{2})/);
    const countMatch = defaultMessage?.match(/(\d+)\s+actionable fund event/i);
    const plStr = profitMatch ? `$${profitMatch[1]}` : '盈利';
    const countStr = countMatch ? countMatch[1] : '多';
    return {
      titleCn: '这笔交易你赢了，但你忽视了基金管理。',
      titleEn: 'YOU WON THE TRADE. YOU IGNORED THE FUND.',
      bodyCn: `你的交易假设方向正确，该仓位实现盈利 ${plStr}。但在持仓期间，有 ${countStr} 件需要处理的基金重要事项未予回应。你证明了自己能够交易，但没有尽到基金管理的职责。`,
    };
  }

  // 2. YOU WERE RIGHT. YOU STILL IGNORED THE FUND.
  if (upper.includes('YOU WERE RIGHT') && upper.includes('IGNORED THE FUND')) {
    const lossMatch = defaultMessage?.match(/\$([0-9,]+\.[0-9]{2})/);
    const countMatch = defaultMessage?.match(/(\d+)\s+actionable fund event/i);
    const plStr = lossMatch ? `$${lossMatch[1]}` : '部分金额';
    const countStr = countMatch ? countMatch[1] : '多';
    return {
      titleCn: '你的判断是对的，但你依然忽视了基金管理。',
      titleEn: 'YOU WERE RIGHT. YOU STILL IGNORED THE FUND.',
      bodyCn: `方向判断正确，但该笔交易依然亏损了 ${plStr}；且在持仓期间，有 ${countStr} 件需要处理的基金重要事项未予回应。`,
    };
  }

  // 3. GOOD THESIS. BAD TIMING.
  if (upper.includes('GOOD THESIS') && upper.includes('BAD TIMING')) {
    return {
      titleCn: '投资逻辑没问题，时机选错了。',
      titleEn: 'GOOD THESIS. BAD TIMING.',
      bodyCn: '方向判断正确，但相对于你设定的投资周期，入场/出场时机出现了偏差，导致收益受损。',
    };
  }

  // 4. GOOD THESIS. WEAK DISCIPLINE.
  if (upper.includes('GOOD THESIS') && upper.includes('WEAK DISCIPLINE')) {
    const mfeMatch = defaultMessage?.match(/Peak unrealized P&L reached \$([0-9,]+\.[0-9]{2})/i);
    const closeMatch = defaultMessage?.match(/closed at \$([0-9,]+\.[0-9]{2})/i);
    const pctMatch = defaultMessage?.match(/\((\d+(?:\.\d+)?)%\s+given back/i);
    const mfeStr = mfeMatch ? `$${mfeMatch[1]}` : '高位';
    const closeStr = closeMatch ? `$${closeMatch[1]}` : '当前点位';
    const pctStr = pctMatch ? `${pctMatch[1]}%` : '较多';
    return {
      titleCn: '投资逻辑正确，但缺乏止盈纪律。',
      titleEn: 'GOOD THESIS. WEAK DISCIPLINE.',
      bodyCn: `最高浮盈曾达到 ${mfeStr}；你最终以 ${closeStr} 平仓（从最高点回吐了 ${pctStr} 利润）。`,
    };
  }

  // 5. WRONG THESIS. GOOD RISK CONTROL.
  if (upper.includes('WRONG THESIS') && upper.includes('GOOD RISK CONTROL')) {
    return {
      titleCn: '方向判断错了，但风险控制救了你。',
      titleEn: 'WRONG THESIS. GOOD RISK CONTROL.',
      bodyCn: '方向判断未被标的真实走势验证，但合理的仓位控制与退出执行依然保住了利润。',
    };
  }

  // 6. YOU MADE MONEY. THE PROCESS WAS WEAK.
  if (upper.includes('YOU MADE MONEY') && upper.includes('PROCESS WAS WEAK')) {
    const plMatch = defaultMessage?.match(/\$([0-9,]+\.[0-9]{2})/);
    const scoreMatch = defaultMessage?.match(/(\d+(?:\.\d+)?)\/100/);
    const plStr = plMatch ? `$${plMatch[1]}` : '为正';
    const scoreStr = scoreMatch ? `${scoreMatch[1]}/100` : '偏低';
    return {
      titleCn: '你赚到了钱，但这笔交易的过程并不漂亮。',
      titleEn: 'YOU MADE MONEY. THE PROCESS WAS WEAK.',
      bodyCn: `已实现盈亏为正（${plStr}），但过程评分（${scoreStr}）表明背后的交易纪律存在明显缺陷。`,
    };
  }

  // 7. YOU LOST MONEY. THE PROCESS HELD.
  if (upper.includes('YOU LOST MONEY') && upper.includes('PROCESS HELD')) {
    const lossMatch = defaultMessage?.match(/\$([0-9,]+\.[0-9]{2})/);
    const scoreMatch = defaultMessage?.match(/(\d+(?:\.\d+)?)\/100/);
    const plStr = lossMatch ? `$${lossMatch[1]}` : '部分金额';
    const scoreStr = scoreMatch ? `${scoreMatch[1]}/100` : '良好';
    return {
      titleCn: '这笔交易亏了钱，但你的决策过程没有失控。',
      titleEn: 'YOU LOST MONEY. THE PROCESS HELD.',
      bodyCn: `交易亏损了 ${plStr}，但过程评分（${scoreStr}）表明背后的交易纪律是扎实可靠的。`,
    };
  }

  // 8. YOU WERE RIGHT, AND THE PROCESS HELD.
  if (upper.includes('YOU WERE RIGHT') && upper.includes('PROCESS HELD')) {
    const plMatch = defaultMessage?.match(/\$([0-9,]+\.[0-9]{2})/);
    const plStr = plMatch ? `$${plMatch[1]}` : '预期收益';
    return {
      titleCn: '你的判断正确，且执行过程扎实严密。',
      titleEn: 'YOU WERE RIGHT, AND THE PROCESS HELD.',
      bodyCn: `方向判断正确，实现盈利（${plStr}），无未响应的基金重要事项，且未出现利润大幅回吐。`,
    };
  }

  // 9. WRONG THESIS. WEAK PROCESS.
  if (upper.includes('WRONG THESIS') && upper.includes('WEAK PROCESS')) {
    const scoreMatch = defaultMessage?.match(/(\d+(?:\.\d+)?)\/100/);
    const scoreStr = scoreMatch ? `${scoreMatch[1]}/100` : '不理想';
    return {
      titleCn: '逻辑判断失误，交易过程存在硬伤。',
      titleEn: 'WRONG THESIS. WEAK PROCESS.',
      bodyCn: `方向判断未能站住脚，且过程评分（${scoreStr}）反映出真实的流程漏洞，而不仅是运气不佳。`,
    };
  }

  // Fallback
  return {
    titleCn: verdictTitle,
    titleEn: verdictTitle,
    bodyCn: defaultMessage,
  };
}

/**
 * Format string as bilingual `Chinese（ENGLISH）` if English provided.
 */
export function formatBilingual(cn: string, en?: string): string {
  if (!en || en === cn) return cn;
  return `${cn}（${en}）`;
}
