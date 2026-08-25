import { money } from '../lib/format';
import type {
  PnLAttribution,
  Position,
  PositionMark,
  ThesisDriftAssessment,
  ThesisRevision,
} from '../types';
import { ThesisHistoryPanel } from './ThesisHistoryPanel';

export interface SharesRow {
  qty: number;
  costBasis: number;
  mark: number;
  pl: number;
}

export interface PositionsAttributionPanelProps {
  positions: Position[];
  marks: Record<string, PositionMark>;
  sharesRow: SharesRow | null;
  underlyingLabel: string;
  attribution: PnLAttribution | null;
  // Thesis history keyed by position id; index 0 of each list is the frozen entry thesis.
  thesisHistory?: Record<string, ThesisRevision[]>;
  openThesisDrift?: Record<string, ThesisDriftAssessment>;
  onReviseThesis?: (positionId: string) => void;
  onClosePosition?: (position: Position) => void;
  onExercisePosition?: (position: Position) => void;
  onCloseStrategy?: (strategyId: string, positions: Position[]) => void;
}

const EM_DASH = '—';

type AttrKey = 'delta' | 'theta' | 'vega' | 'residual';

const ATTR_ROWS: Array<{ key: AttrKey; caption: string }> = [
  { key: 'delta', caption: 'Delta 方向贡献 (Delta P&L)' },
  { key: 'theta', caption: 'Theta 时间损耗 (Theta Decay)' },
  { key: 'vega', caption: 'Vega 隐波贡献 (Vega P&L)' },
  { key: 'residual', caption: 'Gamma / 残差 (Residual)' },
];

function positionLabel(p: Position): string {
  const side = p.is_short || p.short ? 'SHORT' : 'LONG';
  const type = p.type ? p.type.toUpperCase() : '';
  const strike = p.strike !== null && p.strike !== undefined ? String(p.strike) : '';
  const expiration = p.expiration ?? '';
  return [side, type, strike, expiration].filter((part) => part !== '').join(' ');
}

export function PositionsAttributionPanel({
  positions,
  marks,
  sharesRow,
  underlyingLabel,
  attribution,
  thesisHistory,
  openThesisDrift,
  onReviseThesis,
}: PositionsAttributionPanelProps): JSX.Element {
  const showEmptyRow = !sharesRow && positions.length === 0;

  const attrValues = attribution
    ? [Math.abs(attribution.delta), Math.abs(attribution.theta), Math.abs(attribution.vega), Math.abs(attribution.residual)]
    : [];
  const maxAbs = Math.max(1, ...attrValues);

  return (
    <div className="panel ui-enforced positions-attribution-viz">
      <div className="title">仓位与损益归因</div>
      <div className="positions">
        <table>
          <thead>
            <tr>
              <th>仓位</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Mark</th>
              <th>P&L</th>
            </tr>
          </thead>
          <tbody>
            {sharesRow && (
              <tr>
                <td>{`${underlyingLabel} shares`}</td>
                <td>{sharesRow.qty}</td>
                <td>{money(sharesRow.costBasis)}</td>
                <td>{money(sharesRow.mark)}</td>
                <td className={sharesRow.pl >= 0 ? 'green' : 'red'}>{money(sharesRow.pl)}</td>
              </tr>
            )}
            {positions.map((p) => {
              const mark = marks[p.id];
              return (
                <tr key={p.id}>
                  <td>{positionLabel(p)}</td>
                  <td>{p.qty}</td>
                  <td>{money(p.entry_price)}</td>
                  <td>{mark ? money(mark.mark) : EM_DASH}</td>
                  <td className={mark ? (mark.pl >= 0 ? 'green' : 'red') : undefined}>
                    {mark ? money(mark.pl) : EM_DASH}
                  </td>
                </tr>
              );
            })}
            {showEmptyRow && (
              <tr>
                <td colSpan={5} className="muted">
                  暂无仓位
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="divider" />
      <div className="split">
        {ATTR_ROWS.map(({ key, caption }) => {
          const value = attribution ? attribution[key] : null;
          const widthPct = value !== null ? (Math.abs(value) / maxAbs) * 100 : 0;
          return (
            <div key={key}>
              <div className="small">{caption}</div>
              <div className={value === null ? undefined : value >= 0 ? 'green' : 'red'}>
                {value === null ? EM_DASH : money(value)}
              </div>
              {value === null ? (
                <span className="market-viz-na">DATA_UNAVAILABLE</span>
              ) : (
                <div className="attr-signed-axis">
                  <b />
                  <i
                    className={value >= 0 ? 'is-positive' : 'is-negative'}
                    style={{ width: `${Math.min(50, (Math.abs(value) / maxAbs) * 50)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="small" style={{ marginTop: 8 }}>
        损益归因为教学近似：基于持仓 Greeks 的局部线性化拆解 Delta/Theta/Vega 贡献，剩余部分归入残差。即使期权价格来自真实历史
        Bid/Ask，本归因也不是交易所级别的精确解释。
      </div>

      {/* THESIS EVOLUTION for each OPEN position -- drift is visible while the player can
          still act on it, not only in the post-mortem. */}
      {positions.map((p) => {
        const revisions = thesisHistory?.[p.id] ?? [];
        if (revisions.length === 0) return null;
        return (
          <div key={`thesis-${p.id}`} style={{ marginTop: 10 }}>
            <div className="small" style={{ opacity: 0.75, marginBottom: 4 }}>
              {positionLabel(p)}
            </div>
            <ThesisHistoryPanel
              revisions={revisions}
              drift={openThesisDrift?.[p.id] ?? null}
              onRevise={onReviseThesis ? () => onReviseThesis(p.id) : undefined}
              compact
            />
          </div>
        );
      })}
    </div>
  );
}
