import { useEffect, useMemo, useState } from 'react';
import strategyLibrary from '../engine/data/strategy_library.json';
import { renderWithGlossary } from './GlossaryTerm';

type TeachingLevel = 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
type RiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME_HIGH';

type StrategyRecord = {
  strategy_id: string;
  name_cn: string;
  name_en: string;
  teaching_level: TeachingLevel;
  risk_tier: RiskTier;
  unlock_hint?: string;
  legs?: unknown;
  payoff_shape?: string;
  max_profit?: string;
  max_loss?: string;
  breakevens?: string;
  ideal_direction?: string;
  ideal_iv?: string;
  greek_profile?: string;
  time_decay?: string;
  liquidity_need?: string;
  assignment_risk?: string;
  capital_need?: string;
  what_it_is: string;
  when_to_use: string;
  counterexample: string;
  first_check: string;
};

type StrategyLabModalProps = {
  open: boolean;
  onClose: () => void;
};

const LEVELS: Array<{ value: TeachingLevel; label: string }> = [
  { value: 'BEGINNER', label: '入门' },
  { value: 'INTERMEDIATE', label: '进阶' },
  { value: 'EXPERT', label: '专家' },
];

const RISKS: Array<{ value: 'ALL' | RiskTier; label: string }> = [
  { value: 'ALL', label: '全部风险' },
  { value: 'LOW', label: '低风险' },
  { value: 'MEDIUM', label: '中风险' },
  { value: 'HIGH', label: '高风险' },
  { value: 'EXTREME_HIGH', label: '极高风险' },
];

const RISK_LABEL: Record<RiskTier, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  EXTREME_HIGH: '极高',
};

const strategies = (strategyLibrary as unknown as { strategies: StrategyRecord[] }).strategies;

type ShapeSpec = { points: string; baseline?: number };

function resolvePayoffShape(strategy: StrategyRecord): ShapeSpec | null {
  const key = `${strategy.strategy_id} ${strategy.payoff_shape ?? ''}`.toLowerCase();

  if (/bull[_ -]?call|bull call|牛市看涨|debit call spread/.test(key)) {
    return { points: '8,74 30,74 72,28 92,28' };
  }
  if (/bear[_ -]?put|bear put|熊市看跌|debit put spread/.test(key)) {
    return { points: '8,28 28,28 72,74 92,74' };
  }
  if (/long[_ -]?call|long call|买入看涨/.test(key)) {
    return { points: '8,68 48,68 92,20' };
  }
  if (/long[_ -]?put|long put|买入看跌/.test(key)) {
    return { points: '8,20 52,68 92,68' };
  }
  if (/short[_ -]?put|cash.?secured put|卖出看跌/.test(key)) {
    return { points: '8,78 48,30 92,30' };
  }
  if (/short[_ -]?call|naked call|卖出看涨/.test(key)) {
    return { points: '8,30 52,30 92,78' };
  }
  if (/covered[_ -]?call|covered call|备兑/.test(key)) {
    return { points: '8,78 48,34 92,34' };
  }
  if (/protective[_ -]?put|protective put|保护性看跌/.test(key)) {
    return { points: '8,66 34,66 72,28 92,28' };
  }
  if (/straddle|跨式/.test(key)) {
    return { points: '8,18 50,76 92,18' };
  }
  if (/strangle|宽跨式/.test(key)) {
    return { points: '8,18 34,68 66,68 92,18' };
  }
  if (/iron[_ -]?condor|iron condor|铁鹰/.test(key)) {
    return { points: '8,72 28,30 72,30 92,72' };
  }
  if (/butterfly|蝶式/.test(key)) {
    return { points: '8,70 28,70 50,24 72,70 92,70' };
  }
  if (/collar|领口/.test(key)) {
    return { points: '8,68 28,68 72,28 92,28' };
  }
  if (/calendar|diagonal|日历|对角/.test(key)) {
    return { points: '8,66 28,58 50,28 72,58 92,66' };
  }
  if (/credit spread|credit[_ -]?spread|信用价差/.test(key)) {
    return { points: '8,30 32,30 72,72 92,72' };
  }

  return null;
}

function PayoffSketch({ strategy }: { strategy: StrategyRecord }) {
  const shape = resolvePayoffShape(strategy);

  if (!shape) {
    return (
      <div className="strategy-lab__payoff-fallback">
        <span>收益形状</span>
        <strong>{strategy.payoff_shape || '暂无标准化示意'}</strong>
      </div>
    );
  }

  return (
    <div className="strategy-lab__payoff-wrap" aria-label={`收益形状：${strategy.payoff_shape || strategy.name_cn}`}>
      <svg className="strategy-lab__payoff" viewBox="0 0 100 92" role="img" aria-hidden="true">
        <line x1="6" y1="50" x2="94" y2="50" className="strategy-lab__payoff-axis" />
        <line x1="50" y1="8" x2="50" y2="84" className="strategy-lab__payoff-axis" />
        <polyline points={shape.points} className="strategy-lab__payoff-line" />
      </svg>
      <span>{strategy.payoff_shape || '典型到期收益'}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="strategy-lab__fact">
      <dt>{label}</dt>
      <dd>{value ? renderWithGlossary(value) : '—'}</dd>
    </div>
  );
}

export default function StrategyLabModal({ open, onClose }: StrategyLabModalProps) {
  const [level, setLevel] = useState<TeachingLevel>('BEGINNER');
  const [risk, setRisk] = useState<'ALL' | RiskTier>('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => strategies.find((item) => item.strategy_id === selectedId) ?? null,
    [selectedId],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return strategies.filter((item) => {
      if (item.teaching_level !== level) return false;
      if (risk !== 'ALL' && item.risk_tier !== risk) return false;
      if (!needle) return true;

      return [item.name_cn, item.name_en, item.strategy_id, item.what_it_is]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(needle));
    });
  }, [level, risk, query]);

  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedId) setSelectedId(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, selectedId]);

  if (!open) return null;

  return (
    <div className="strategy-lab ui-enforced" role="dialog" aria-modal="true" aria-label="策略研讨室">
      <button className="strategy-lab__backdrop ui-btn" data-variant="compact" aria-label="关闭策略研讨室" onClick={onClose} />

      <section className="strategy-lab__panel ui-modal ui-surface ui-l3">
        <header className="strategy-lab__header ui-modal-header">
          <div>
            <span className="strategy-lab__eyebrow">STRATEGY LAB</span>
            <h2 className="ui-title" data-level="1">策略研讨室</h2>
          </div>
          <button type="button" className="strategy-lab__close ui-btn" data-variant="compact" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="strategy-lab__body modal-body ui-modal-body">
        {selected ? (
          <div className="strategy-lab__detail ui-surface ui-l2">
            <button type="button" className="strategy-lab__text-button ui-btn" data-variant="row" onClick={() => setSelectedId(null)}>
              ← 返回策略列表
            </button>

            <div className="strategy-lab__detail-title-row">
              <div>
                <div className="strategy-lab__badges">
                  <span className={`strategy-lab__risk strategy-lab__risk--${selected.risk_tier.toLowerCase()}`}>
                    风险 {RISK_LABEL[selected.risk_tier]}
                  </span>
                  <span className="strategy-lab__level-chip">
                    {LEVELS.find((item) => item.value === selected.teaching_level)?.label}
                  </span>
                </div>
                <h3>{selected.name_cn}</h3>
                <p className="strategy-lab__name-en">{selected.name_en}</p>
              </div>
              <PayoffSketch strategy={selected} />
            </div>

            <div className="strategy-lab__detail-grid">
              <article className="strategy-lab__card">
                <h4>这是什么</h4>
                <p>{renderWithGlossary(selected.what_it_is)}</p>
              </article>
              <article className="strategy-lab__card">
                <h4>什么时候用</h4>
                <p>{renderWithGlossary(selected.when_to_use)}</p>
              </article>
            </div>

            <section className="strategy-lab__facts-card">
              <h4>结构事实</h4>
              <dl className="strategy-lab__facts">
                <Fact label="最大盈利" value={selected.max_profit} />
                <Fact label="最大亏损" value={selected.max_loss} />
                <Fact label="盈亏平衡" value={selected.breakevens} />
                <Fact label="希腊字母暴露" value={selected.greek_profile} />
              </dl>
            </section>

            <div className="strategy-lab__detail-grid">
              <article className="strategy-lab__card strategy-lab__card--warning">
                <h4>反例：什么时候别用</h4>
                <p>{renderWithGlossary(selected.counterexample)}</p>
              </article>
              <article className="strategy-lab__card strategy-lab__card--check">
                <h4>第一检查项</h4>
                <p>{renderWithGlossary(selected.first_check)}</p>
              </article>
            </div>
          </div>
        ) : (
          <>
            <div className="strategy-lab__toolbar">
              <div className="strategy-lab__tabs" role="tablist" aria-label="教学层级">
                {LEVELS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={level === item.value}
                    className={`ui-btn ${level === item.value ? 'is-active' : ''}`}
                    data-variant="compact"
                    onClick={() => setLevel(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="strategy-lab__filters">
                <label className="strategy-lab__search">
                  <span className="sr-only">搜索策略</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索中英文名 / 关键词"
                  />
                </label>

                <label className="strategy-lab__risk-filter">
                  <span className="sr-only">风险档位</span>
                  <select value={risk} onChange={(event) => setRisk(event.target.value as 'ALL' | RiskTier)}>
                    {RISKS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="strategy-lab__result-bar">
              <span>{filtered.length} 个策略</span>
              <span>共 {strategies.length} 条</span>
            </div>

            <div className="strategy-lab__list">
              {filtered.map((item) => (
                <button
                  key={item.strategy_id}
                  type="button"
                  className="strategy-lab__list-item ui-btn"
                  data-variant="row"
                  onClick={() => setSelectedId(item.strategy_id)}
                >
                  <div className="strategy-lab__list-heading">
                    <div>
                      <strong>{item.name_cn}</strong>
                      <span>{item.name_en}</span>
                    </div>
                    <span className={`strategy-lab__risk strategy-lab__risk--${item.risk_tier.toLowerCase()}`}>
                      {RISK_LABEL[item.risk_tier]}
                    </span>
                  </div>
                  <p>{renderWithGlossary(item.what_it_is)}</p>
                </button>
              ))}

              {filtered.length === 0 && (
                <div className="strategy-lab__empty">
                  <strong>没有匹配策略</strong>
                  <span>尝试切换层级、风险档或搜索关键词。</span>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </section>
    </div>
  );
}
