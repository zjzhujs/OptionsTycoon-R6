import { fmt, money, pct } from '../lib/format';

// Deliberately narrower than the full AIFund shape in types.ts — this panel
// only needs what a leaderboard row shows, and max_drawdown may be
// unavailable (null) for a fund that hasn't been marked yet.
export interface AIFundRankingEntry {
  id: string;
  name: string;
  return_pct: number;
  nav: number;
  max_drawdown: number | null;
}

export interface AIFundsRankingPanelProps {
  ranking: AIFundRankingEntry[];
}

// Right-column panel: leaderboard of the simulated AI opponent funds.
export function AIFundsRankingPanel({ ranking }: AIFundsRankingPanelProps): JSX.Element {
  return (
    <div className="panel ot-panel ui-enforced ai-ranking-viz">
      <div className="title ot-section-title">
        AI 对手排行 <span className="ot-badge ot-badge-simulated">SIMULATED</span>
      </div>
      <div className="small ot-dim-text" style={{ marginBottom: 8 }}>
        这些角色只参与游戏竞争，不改变真实历史价格，也不冒充真实机构。
      </div>
      {(() => {
        if (ranking.length === 0) {
          return (
            <div className="ot-empty-state">
              <span className="ot-empty-text">暂无 AI 对手排行数据</span>
            </div>
          );
        }
        const playerNav = ranking.find((r) => r.id === 'player')?.nav ?? null;
        if (playerNav == null || playerNav <= 0) {
          return <span className="market-viz-na">DATA_UNAVAILABLE</span>;
        }
        const sorted = [...ranking].sort((a, b) => b.nav - a.nav);
        const indexed = sorted.map((fund) => ({ fund, idx: (fund.nav / playerNav) * 100 }));
        const maxIndex = Math.max(...indexed.map((e) => e.idx), 1e-9);
        const playerIdx = indexed.find((e) => e.fund.id === 'player')?.idx ?? 100;

        const visible = new Set<string>();
        indexed.slice(0, 3).forEach((e) => visible.add(e.fund.id));
        visible.add('player');
        const closest = indexed
          .filter((e) => e.fund.id !== 'player' && !visible.has(e.fund.id))
          .sort((a, b) => Math.abs(a.idx - playerIdx) - Math.abs(b.idx - playerIdx))[0];
        if (closest) visible.add(closest.fund.id);

        const shown = indexed.filter((e) => visible.has(e.fund.id));
        const hidden = indexed.filter((e) => !visible.has(e.fund.id));

        const row = ({ fund, idx }: { fund: AIFundRankingEntry; idx: number }) => (
          <div className={`ai-rank-row ${fund.id === 'player' ? 'is-player' : ''}`} key={fund.id}>
            <div className="ai-fund-info">
              <b className="ot-role-name">{fund.id === 'player' ? 'YOU · ' : ''}{fund.name}</b>
              <div className="muted font-mono" style={{ fontSize: 10 }}>
                NAV {money(fund.nav)} · {idx.toFixed(0)}
                {fund.max_drawdown != null ? ` · 回撤 ${fmt(fund.max_drawdown, 2)}%` : ''}
              </div>
            </div>
            <div className="ai-rank-track">
              <i className="ai-rank-baseline" />
              <i className="ai-rank-fill" style={{ width: `${Math.max(2, Math.min(100, (idx / maxIndex) * 100))}%` }} />
            </div>
            <div className={`ai-fund-pnl font-mono ${fund.return_pct >= 0 ? 'ot-metric-delta-up' : 'ot-metric-delta-down'}`}>
              {pct(fund.return_pct)}
            </div>
          </div>
        );

        return (
          <>
            {shown.map(row)}
            {hidden.length > 0 && (
              <details className="ai-rank-more">
                <summary className="ia-summary"><span>+{hidden.length} MORE FUNDS</span></summary>
                {hidden.map(row)}
              </details>
            )}
          </>
        );
      })()}
    </div>
  );
}
