import React from 'react';
import type { RetailSentiment, MarketPulse } from '../types';
import { formatProvenance } from '../lib/financialLanguage';
import { SentimentPulse } from './fx/MiniViz';

export interface MarketPulsePanelProps {
  retailSentiment?: RetailSentiment;
  marketPulse?: MarketPulse;
}

export function MarketPulsePanel({
  retailSentiment,
  marketPulse,
}: MarketPulsePanelProps): JSX.Element {
  if (!retailSentiment || !marketPulse) {
    return (
      <div className="mpx-panel mpx-empty ot-empty-state">
        正在捕获社交舆情与散户资金流...
      </div>
    );
  }

  const fg = retailSentiment.fear_greed_index;
  const fgColor =
    fg >= 70
      ? 'mpx-dial-greed'
      : fg <= 30
      ? 'mpx-dial-fear'
      : 'mpx-dial-neutral';

  return (
    <div className="mpx-panel">
      {/* Top Header */}
      <div className="mpx-head">
        <div>
          <div className="mpx-head-titles">
            <h2 className="mpx-h2">
              <span className="mpx-dot" />
              MARKET PULSE & RETAIL SENTIMENT
            </h2>
            <span className="mpx-chip mpx-chip-green font-mono">
              0DTE FLOW & FINFLUENCERS
            </span>
          </div>
          <p className="mpx-sub">
            实时监控散户期权狂热度、FOMO 速度、恐慌贪婪指数与 X/WallStreetBets 社交舆情
          </p>
        </div>

        {/* Capitulation Status */}
        {retailSentiment.capitulation_flag && (
          <div className="mpx-capitulation font-mono">
            ⚠️ 散户多头踩踏平仓 (CAPITULATION)
          </div>
        )}
      </div>

      <div className="mpx-sentiment-pulse" data-testid="sentiment-pulse">
        <SentimentPulse source="retailSentiment" bullish={retailSentiment.bullish_pct} bearish={retailSentiment.bearish_pct} fearGreed={fg} width={220} />
      </div>

      {/* Sentiment Dials Matrix */}
      <div className="mpx-dials font-mono">
        {/* Fear & Greed Index */}
        <div className={`mpx-dial ot-metric ${fgColor}`}>
          <div className="mpx-dial-label mpx-dial-label-strong ot-metric-label">Fear & Greed Index</div>
          <div className="mpx-dial-value-xl ot-metric-value">{fg.toFixed(0)}</div>
          <div className="mpx-dial-note">{fg >= 70 ? 'Extreme Greed' : fg <= 30 ? 'Extreme Fear' : 'Neutral'}</div>
        </div>

        {/* Bull vs Bear Ratio */}
        <div className="mpx-dial ot-metric">
          <div className="mpx-dial-label ot-metric-label">Bull vs Bear %</div>
          <div className="mpx-dial-value-md mpx-val-green ot-metric-value">
            {retailSentiment.bullish_pct.toFixed(0)}% <span className="mpx-val-sep">/</span>{' '}
            <span className="mpx-val-red">{retailSentiment.bearish_pct.toFixed(0)}%</span>
          </div>
          <div className="mpx-bar">
            <div className="mpx-bar-bull" style={{ width: `${retailSentiment.bullish_pct}%` }} />
            <div className="mpx-bar-bear" style={{ width: `${retailSentiment.bearish_pct}%` }} />
          </div>
        </div>

        {/* FOMO Velocity */}
        <div className="mpx-dial ot-metric">
          <div className="mpx-dial-label ot-metric-label">FOMO Velocity</div>
          <div className="mpx-dial-value-lg mpx-val-cyan ot-metric-value">{retailSentiment.fomo_velocity.toFixed(1)}x</div>
          <div className="mpx-dial-note mpx-dial-note-muted">Call Chase Speed</div>
        </div>

        {/* Meme Intensity */}
        <div className="mpx-dial ot-metric">
          <div className="mpx-dial-label ot-metric-label">Meme Intensity</div>
          <div className="mpx-dial-value-lg mpx-val-purple ot-metric-value">{retailSentiment.meme_intensity.toFixed(0)}%</div>
          <div className="mpx-dial-note mpx-dial-note-muted">WSB Swarm Activity</div>
        </div>
      </div>

      {/* Social Feed List */}
      <div className="mpx-feed">
        <div className="mpx-feed-title font-mono">
          Market Pulse Live Feed ({marketPulse.posts.length} Posts)
        </div>

        <div className="mpx-feed-list">
          {marketPulse.posts.map((post) => {
            const biasBg =
              post.bias === 'BULLISH'
                ? 'mpx-bias-bull'
                : post.bias === 'BEARISH'
                ? 'mpx-bias-bear'
                : 'mpx-bias-neutral';

            return (
              <div key={post.id} className="mpx-post">
                <div className="mpx-post-head">
                  <div className="mpx-post-ids">
                    <span className="mpx-handle font-mono">{post.author_handle}</span>
                    <span className="mpx-tag font-mono">
                      {post.author_type}
                    </span>
                    {post.bot_probability >= 40 && (
                      <span className="mpx-tag mpx-tag-bot font-mono">
                        BOT PROBABILITY {post.bot_probability.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <div className="mpx-post-meta">
                    <span className={`mpx-bias font-mono ${biasBg}`}>
                      {post.bias}
                    </span>
                    <span className="mpx-time font-mono">{post.timestamp}</span>
                  </div>
                </div>

                <div className="mpx-post-body">{post.content}</div>

                <div className="mpx-post-foot font-mono">
                  <div className="mpx-post-stats">
                    <span>❤️ {post.engagement_likes}</span>
                    <span>🔄 {post.engagement_reposts}</span>
                    <span className="mpx-cred">Credibility: {post.credibility.toFixed(0)}</span>
                  </div>
                  <span className="mpx-prov" title={formatProvenance('SIMULATED')}>
                    {formatProvenance('SIMULATED')} · SOCIAL NARRATIVE
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
