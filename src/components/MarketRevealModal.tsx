import React, { useState } from 'react';
import type { MarketRevealState, MarketWindowAction } from '../engine/schemas';
import { IntradayPathChart } from './IntradayPathChart';

/**
 * V21 盘中时点界面（2026-08-18 claude）
 *
 * 这一屏要传达的核心感受只有一个：**你现在只知道到这里。**
 *
 * 所以它刻意不做几件事：
 *   - 不画当日完整走势图。已揭晓几根就只显示几根。
 *   - 不给"建议操作"。给了就等于替玩家判断。
 *   - 不显示倒计时或进度条（"第 2/5 个时点"）。知道总共有几个时点，
 *     本身就是一种前视——真实交易日里没人告诉你今天还会发生几件事。
 *
 * 理由输入是必填的。这不是表单校验的洁癖：本作的立场是说不出理由的交易
 * 和赌没有区别，而且这段话会在下一个时点、甚至下一个交易日被原样端回来。
 */

export interface MarketRevealModalProps {
  reveal: MarketRevealState;
  onDecide: (windowId: string, action: MarketWindowAction, reason: string) => void;
  busy?: boolean;
}

const ACTION_LABELS: Record<MarketWindowAction, { label: string; hint: string }> = {
  DO_NOTHING: { label: '不动作', hint: '不调整任何仓位，等待更多已揭晓事实。' },
  HOLD: { label: '维持并观察', hint: '保留现有敞口，继续观察下一段真实价格。' },
  MANAGE_RISK: { label: '处置风险', hint: '按当前已揭晓价格调整敞口。' },
  REVISE: { label: '修正判断', hint: '承认原判断需要修改，并说明修改依据。' },
  STOP: { label: '停手', hint: '切换为只减风险：后续下单只接受降低敞口的方向。' },
};

export function MarketRevealModal({ reveal, onDecide, busy }: MarketRevealModalProps): JSX.Element | null {
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<MarketWindowAction>('DO_NOTHING');

  if (reveal.current_window_index < 0) return null;
  const w = reveal.windows[reveal.current_window_index];
  if (!w || w.resolved) return null;

  const bars = w.visible_price_bars ?? [];
  const canSubmit = reason.trim().length >= 4 && !busy;

  return (
    <div className="modal-overlay mrv-overlay ui-enforced">
      <div className="modal-content mrv-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="mrv-head modal-header ui-modal-header">
          <span className="mrv-time font-mono">{w.reveal_time_label}</span>
          <span className="mrv-date font-mono">{w.session_date}</span>
          <span className={`mrv-truth mrv-truth-${w.truth_mode === 'REAL_INTRADAY' ? 'real' : 'event'}`}>
            {w.truth_mode === 'REAL_INTRADAY' ? 'REAL INTRADAY' : 'EVENT ONLY · 无可执行价格'}
          </span>
        </div>

        <div className="modal-body ui-modal-body">
        <h2 className="mrv-headline ui-title" data-level="1">{w.headline}</h2>
        <p className="mrv-detail">{w.detail}</p>

        {/* 跨日回响：把玩家更早那天写下的话端回来。不加评判，只是摆出来。 */}
        {w.season_continuity_beat && (
          <div className="mrv-callback">
            <div className="mrv-callback-tag">你此前写下的</div>
            <div className="mrv-callback-line">{w.season_continuity_beat.line}</div>
          </div>
        )}

        {/* 已揭晓的真实 bar —— 揭晓几根就显示几根 */}
        {bars.length > 0 && (
          <div className="mrv-bars">
            {/* 走势图放在表格之前：先给"价格在动"的感觉，再给可核对的数字。
                这条线只是视觉层，成交价仍然只认下面表格里的真实小时收盘。 */}
            <IntradayPathChart bars={bars} label={w.session_date} />
            <table className="mrv-bar-table ot-table font-mono">
              <thead>
                <tr>
                  <th>时段</th><th>开</th><th>高</th><th>低</th><th>收</th>
                </tr>
              </thead>
              <tbody>
                {bars.slice(0, 5).map((b) => (
                  <tr key={b.ts}>
                    <td>{b.label}</td>
                    <td>{b.open.toFixed(2)}</td>
                    <td>{b.high.toFixed(2)}</td>
                    <td>{b.low.toFixed(2)}</td>
                    <td className={b.close >= b.open ? 'mrv-up' : 'mrv-down'}>{b.close.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bars.length > 5 && (
              <details className="mrv-more-bars">
                <summary>展开其余 {bars.length - 5} 行分钟数据</summary>
                <div className="ot-table-wrapper">
                  <table className="mrv-bar-table ot-table font-mono">
                    <tbody>
                      {bars.slice(5).map((b) => (
                        <tr key={b.ts}>
                          <td>{b.label}</td>
                          <td>{b.open.toFixed(2)}</td>
                          <td>{b.high.toFixed(2)}</td>
                          <td>{b.low.toFixed(2)}</td>
                          <td className={b.close >= b.open ? 'mrv-up' : 'mrv-down'}>{b.close.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {w.price_snapshot && (
              <div className="mrv-snapshot font-mono">
                当前可执行价 {w.price_snapshot.latest_price.toFixed(2)}
                <span className="mrv-range">
                  （已揭晓区间 {w.price_snapshot.session_low_so_far.toFixed(2)} –{' '}
                  {w.price_snapshot.session_high_so_far.toFixed(2)}）
                </span>
              </div>
            )}
          </div>
        )}

        {w.future_lock_note && <div className="mrv-lock">{w.future_lock_note}</div>}

        {/* 角色发言：说话的人由当下的基金压力决定，不是固定剧本 */}
        {w.character_beat && (
          <div className={`mrv-character mrv-pressure-${w.character_beat.pressure_level.toLowerCase()}`}>
            <div className="mrv-character-name">
              {w.character_beat.character_name}
              <span className="mrv-pressure">{w.character_beat.pressure_level}</span>
            </div>
            <div className="mrv-character-line">{w.character_beat.line}</div>
          </div>
        )}

        <div className="mrv-question">{w.dramatic_question}</div>

        <div className="mrv-actions">
          {(Object.keys(ACTION_LABELS) as MarketWindowAction[]).map((a) => (
            <button
              key={a}
              className={`mrv-action ot-btn ui-btn ${action === a ? 'mrv-action-on' : ''}`}
              data-variant="row"
              aria-pressed={action === a}
              onClick={() => setAction(a)}
              type="button"
            >
              <span className="mrv-action-label">{ACTION_LABELS[a].label}</span>
              <span className="mrv-action-hint">{ACTION_LABELS[a].hint}</span>
            </button>
          ))}
        </div>

        <label className="mrv-reason-label" htmlFor="mrv-reason">
          写下你的理由（会在后续时点原样回放给你）
        </label>
        <textarea
          id="mrv-reason"
          className="mrv-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="你基于哪些已经揭晓的事实作出这个决定？"
          rows={3}
        />

        <button
          className="mrv-submit ot-btn ui-btn ui-btn-primary"
          disabled={!canSubmit}
          onClick={() => onDecide(w.window_id, action, reason.trim())}
          type="button"
        >
          {canSubmit ? '确认这个决定' : '请先写下理由'}
        </button>

        <div className="v28-data-boundary-note mrv-note">
          价格为<strong>本地真实历史盘中数据</strong>；人物与对白为游戏模拟（SIMULATED）。
          当日尚未揭晓的部分不会在此显示，也不参与任何计算。
        </div>
        </div>
      </div>
    </div>
  );
}
