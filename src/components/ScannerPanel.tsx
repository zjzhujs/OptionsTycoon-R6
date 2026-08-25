import React, { useState } from 'react';
import type { ScannerResult, ScannerRow } from '../types';

interface Props {
  scannerResult: ScannerResult | null;
  onSelectTicker?: (ticker: string) => void;
}

export const ScannerPanel: React.FC<Props> = ({ scannerResult, onSelectTicker }) => {
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('ALL');
  const [onlyHighIV, setOnlyHighIV] = useState(false);
  const [onlyCatalysts, setOnlyCatalysts] = useState(false);

  if (!scannerResult || !scannerResult.rows) {
    return (
      <div className="panel scanner-panel">
        <div className="panel-header">
          <h3>晨间选股 Opportunity Scanner</h3>
        </div>
        <div className="panel-body ot-empty-state">扫描器数据加载中...</div>
      </div>
    );
  }

  const sectors = ['ALL', ...Array.from(new Set(scannerResult.rows.map((r) => r.sector)))];

  const filteredRows = scannerResult.rows.filter((r) => {
    if (search && !r.ticker.toLowerCase().includes(search.toLowerCase()) && !r.name.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (sectorFilter !== 'ALL' && r.sector !== sectorFilter) {
      return false;
    }
    if (onlyHighIV && r.iv_rank < 60) {
      return false;
    }
    if (onlyCatalysts && !r.upcoming_event) {
      return false;
    }
    return true;
  });

  return (
    <div className="panel scanner-panel">
      <div className="panel-header">
        <div className="flex-row items-center gap-sm">
          <span className="panel-icon">🔍</span>
          <h3>晨间选股 Opportunity Scanner</h3>
          <span className="badge-tag ot-badge derived">{scannerResult.date} 盘前扫描</span>
        </div>
      </div>
      <div className="v28-data-boundary-note">
        <strong>数据来源声明</strong>：本游戏完全离线运行，不会连接任何网络。所有行情来自随版本打包的本地历史数据（真实收盘价 CSV）。
        标注 <code>REAL DAILY</code> 的标的拥有完整日线历史；<code>DERIVED FALLBACK</code> 表示该标的缺少本地数据包，由引擎基于板块统计推算——
        这不是真实行情，购买任何订阅也不会使其变成真实数据。缺少的期权成交量、SEC Filings 等字段将持续显示 DATA_UNAVAILABLE，直到对应数据包被纳入未来版本。
      </div>

      <div className="scanner-controls">
        <input
          type="text"
          placeholder="搜索代码 / 公司 (例: NVDA, TSLA, 芯片)..."
          className="input-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="scanner-filters">
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="select-filter"
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                板块: {s}
              </option>
            ))}
          </select>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyHighIV}
              onChange={(e) => setOnlyHighIV(e.target.checked)}
            />
            高 IV Rank (≥60%)
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyCatalysts}
              onChange={(e) => setOnlyCatalysts(e.target.checked)}
            />
            仅有催化剂
          </label>
        </div>
      </div>

      {scannerResult.highlighted_tickers.length > 0 && (
        <div className="scanner-highlights">
          <span className="highlight-label">🔥 今日重点异动：</span>
          {scannerResult.highlighted_tickers.map((t) => (
            <button
              key={t}
              className="chip-highlight"
              onClick={() => onSelectTicker && onSelectTicker(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="table-wrapper ot-table-wrapper">
        <table className="data-table scanner-table ot-table">
          <thead>
            <tr>
              <th>代码 / 资产</th>
              <th>最新价</th>
              <th>涨跌幅</th>
              <th>IV / IV Rank</th>
              <th>期权量 / OI</th>
              <th>价差质量</th>
              <th>近期催化剂 / 分析师观点</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r: ScannerRow) => {
              const isPositive = r.daily_change_pct >= 0;
              return (
                <tr
                  key={r.ticker}
                  className="scanner-row cursor-pointer"
                  onClick={() => onSelectTicker && onSelectTicker(r.ticker)}
                >
                  <td>
                    <div className="ticker-cell">
                      <span className="ticker-symbol">{r.ticker}</span>
                      <span className="ticker-name">{r.name}</span>
                      <span className="ticker-sector">{r.sector}</span>
                      <span
                        /* price_data_status 是可选字段（schemas.ts:196）。下面的三元
                           在 undefined 时落到 'DERIVED FALLBACK'，class 必须跟着落到
                           同一档——否则标签写着 fallback 而样式是另一回事。
                           直接 .toLowerCase() 会让任何缺 provenance 的行把整个扫描器打崩。 */
                        className={`badge-tag ot-badge ${(r.price_data_status ?? 'DERIVED_FALLBACK').toLowerCase()}`}
                        title={r.price_source_name ?? 'No provenance metadata'}
                      >
                        {r.price_data_status === 'ADMITTED_REAL_DAILY'
                          ? 'REAL DAILY'
                          : r.price_data_status === 'PARTIAL_REAL_PRICE'
                            ? 'REAL PRICE / DERIVED FIELDS'
                            : 'DERIVED FALLBACK'}
                      </span>
                    </div>
                  </td>
                  <td className="num-cell font-mono">${r.price.toFixed(2)}</td>
                  <td className={`num-cell font-mono ${isPositive ? 'text-green' : 'text-red'}`}>
                    {isPositive ? '+' : ''}
                    {r.daily_change_pct.toFixed(2)}%
                  </td>
                  <td>
                    <div className="iv-cell">
                      <span className="font-mono">{(r.iv * 100).toFixed(1)}%</span>
                      <div className="iv-rank-bar">
                        <div
                          className="iv-rank-fill"
                          style={{
                            width: `${Math.min(100, r.iv_rank)}%`,
                            backgroundColor: r.iv_rank > 70 ? '#EF4444' : r.iv_rank > 40 ? '#F59E0B' : '#10B981',
                          }}
                        />
                      </div>
                      <span className="font-mono text-dim text-xs">Rank {r.iv_rank.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="font-mono text-dim text-sm">
                    {r.options_volume.toLocaleString()} / {r.open_interest.toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge-spread ${r.spread_quality.toLowerCase()}`}>
                      {r.spread_quality === 'TIGHT' ? '极窄 (Tight)' : r.spread_quality === 'MODERATE' ? '适中 (Mod)' : '较宽 (Wide)'}
                    </span>
                  </td>
                  <td>
                    <div className="catalyst-cell">
                      {r.upcoming_event && (
                        <div className="catalyst-tag">⚡ {r.upcoming_event}</div>
                      )}
                      <div className="analyst-view text-dim text-xs">{r.analyst_conviction}</div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
