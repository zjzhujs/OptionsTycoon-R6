import type { OrderLogEntry } from '../types';

export interface OrderLogPanelProps {
  entries: OrderLogEntry[];
}

// Right-column panel: order/market tape. Renders newest-first, matching the
// prototype's log-prepend behavior, without mutating the incoming array.
export function OrderLogPanel({ entries }: OrderLogPanelProps): JSX.Element {
  const newestFirst = [...entries].reverse();

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        订单 / 市场日志 <span className="en-secondary">ORDER TAPE</span>
      </div>
      <div className="tape font-mono">
        {newestFirst.length === 0 ? (
          <div className="ot-empty-state">
            <span className="ot-empty-text">暂无订单或日志记录</span>
          </div>
        ) : (
          newestFirst.map((entry, index) => (
            <div className={`msg ${entry.kind} ot-tape-item`} key={`${entry.date}-${index}`}>
              <span className="ot-dim-text">{entry.date}</span> · {entry.message}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
