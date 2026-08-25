import React from 'react';
import type { GameStateView } from '../types';

interface Props {
  view: GameStateView;
  isOpen: boolean;
  onClose: () => void;
  onSelectSurvival: (choiceId: string) => void;
}

export const SurvivalCrisisModal: React.FC<Props> = ({
  view,
  isOpen,
  onClose,
  onSelectSurvival,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay crisis-overlay ui-enforced">
      <div className="modal-content crisis-modal ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header ui-modal-header">
          <div>
            <div className="ot-badge ot-badge-critical">
              CRISIS SURVIVAL / 基金危机求生
            </div>
            <h2 className="crisis-title ui-title" data-level="1">⚠️ 保证金追缴与流动性警报</h2>
            <div className="crisis-subtitle">
              当前维持担保金不足或面临 LP 紧急赎回，必须立即选择应对方案以避免爆仓清盘。
            </div>
          </div>
          <button className="btn-close ot-btn ot-btn-ghost ui-btn" data-variant="compact" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="crisis-body modal-body ui-modal-body">
          <div className="crisis-options-list">
            <button
              type="button"
              className="crisis-opt-card ui-btn"
              data-variant="row"
              onClick={() => onSelectSurvival('cut_positions')}
            >
              <div className="opt-header">
                <span className="opt-title">1. 断臂求生：平仓 50% 敞口补充现金</span>
                <span className="opt-badge ot-badge ot-badge-real">风控首选</span>
              </div>
              <p className="opt-desc">
                立即市价卖出部分期权与正股持仓，迅速释放保证金占用。代价是锁定短期账面浮亏。
              </p>
            </button>

            <button
              type="button"
              className="crisis-opt-card ui-btn"
              data-variant="row"
              onClick={() => onSelectSurvival('daniel_lifeline')}
            >
              <div className="opt-header">
                <span className="opt-title">2. 向 Prime Broker (Daniel Ross) 申请紧急过桥融资</span>
                <span className="opt-badge ot-badge ot-badge-derived">商业信任</span>
              </div>
              <p className="opt-desc">
                动用与 Daniel 的商业伙伴关系，申请 48 小时借贷宽限。代价是支付高额惩罚性利息并消耗好感度。
              </p>
            </button>

            <button
              type="button"
              className="crisis-opt-card ui-btn"
              data-variant="row"
              onClick={() => onSelectSurvival('adrian_rescue')}
            >
              <div className="opt-header">
                <span className="opt-title">3. 接受对手基金 (Adrian Cross) 的折价注资救助</span>
                <span className="opt-badge ot-badge ot-badge-estimated">出让权力</span>
              </div>
              <p className="opt-desc">
                出让 15% 基金管理股权换取即时流动性注入。基金得以保全，但竞争对手将正式进入董事会。
              </p>
            </button>

            <button
              type="button"
              className="crisis-opt-card ui-btn"
              data-variant="row"
              onClick={() => onSelectSurvival('lp_side_pocket')}
            >
              <div className="opt-header">
                <span className="opt-title">4. 启动 LP 资产侧袋隔离条款 (Side-Pocketing)</span>
                <span className="opt-badge ot-badge ot-badge-unavailable">法律合规</span>
              </div>
              <p className="opt-desc">
                启动基金合同中的特殊流动性条款，暂缓非流动性份额赎回。代价是扣减 LP 信任度并引起潜在合规质询。
              </p>
            </button>
          </div>
        </div>

        <div className="modal-footer ui-modal-footer">
          <button className="ot-btn ot-btn-ghost crisis-footer-btn ui-btn" data-variant="row" onClick={onClose}>
            暂不处理（风险自担）
          </button>
        </div>
      </div>
    </div>
  );
};
