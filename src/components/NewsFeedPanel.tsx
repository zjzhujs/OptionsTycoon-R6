import type { MacroEvent } from '../types';

export interface NewsFeedPanelProps {
  events: MacroEvent[];
}

export function NewsFeedPanel(props: NewsFeedPanelProps): JSX.Element {
  const { events } = props;

  const sorted = events
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <div className="panel ot-panel">
      <div className="title ot-section-title">
        公开信息流 <span className="en-secondary">PUBLIC NEWS FEED</span>
      </div>
      <div className="news">
        {sorted.length === 0 ? (
          <div className="ot-empty-state">
            <span className="ot-empty-text">暂无公开信息流</span>
          </div>
        ) : (
          sorted.map((e) => (
            <div className="newsitem realnews ot-card" key={e.id}>
              <div className="time font-mono ot-dim-text">
                <span className="ot-badge ot-badge-real">{e.source}</span> {e.date} · {e.tag}
              </div>
              <div className="headline ot-role-name">{e.headline}</div>
              {e.body && <div className="body ot-role-quote">{e.body}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
