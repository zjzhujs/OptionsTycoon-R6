import React from 'react';

export interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreditsModal({ isOpen, onClose }: CreditsModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="modal-content credits-modal credits-modal-card ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="credits-header modal-header ui-modal-header">
          <h2 className="ui-title" data-level="1">制作群与鸣谢 (Credits & Provenance)</h2>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="credits-body modal-body ui-modal-body">
          <section className="credits-section">
            <h3>🎮 游戏设计与系统架构</h3>
            <p><strong>《期权大亨 / Options Tycoon》</strong> — 真实历史金融数据衍生品 RPG 模拟器</p>
            <p>架构设计：金融衍生品量化引擎、做市商微观结构模型、故事战役与延迟后果驱动系统</p>
          </section>

          <section className="credits-section">
            <h3>📊 真实历史市场数据 (Market Data Provenance)</h3>
            <ul>
              <li><strong>2025 DeepSeek R1 历史市场路径</strong>: 真实 NVDA/SPX 日线 OHLCV、CBOE VIX、美债收益率快照 <span className="ot-truth-label ot-badge-real"><span className="ot-badge-dot" />REAL</span></li>
              <li><strong>2026 H1 宏观风暴历史节点</strong>: 真实美债收益率曲线 (2Y/5Y/10Y/30Y/2s10s)、SOFR、美元指数与日元汇率 <span className="ot-truth-label ot-badge-real"><span className="ot-badge-dot" />REAL</span></li>
              <li><strong>期权理论定价与做市商模型</strong>: Black-Scholes 教学模型叠加真实 IV Skew 与做市商微观库存 <span className="ot-truth-label ot-badge-estimated"><span className="ot-badge-dot" />ESTIMATED</span> <span className="ot-truth-label ot-badge-simulated"><span className="ot-badge-dot" />SIMULATED</span></li>
            </ul>
          </section>

          <section className="credits-section">
            <h3>🎨 视觉与声音设计 (Art & Audio Production)</h3>
            <ul>
              <li><strong>视觉风格</strong>: Prestige Financial Drama / Wall Street Noir (Photorealistic)</li>
              <li><strong>角色设定与立绘</strong>: Maya Chen, Victor Hale, Evelyn Shaw, Daniel Ross, Marcus Reed, Adrian Cross, Leo Park</li>
              <li><strong>音效与环境音</strong>: 机构级交易室、夜间终端分析、做市商微波脉冲与风控警报合成音效</li>
            </ul>
          </section>

          <section className="credits-section">
            <h3>⚖️ 免责声明与教育宗旨 (Educational Purpose)</h3>
            <p>
              本产品为金融教育与量化期权模拟工具，所有历史数据与微观结构模型仅用于金融教学与交易逻辑复盘，不构成任何现实投资建议。
            </p>
          </section>
        </div>

        <div className="credits-footer modal-footer ui-modal-footer">
          <button className="ot-btn ui-btn ui-btn-primary" onClick={onClose}>返回游戏</button>
        </div>
      </div>
    </div>
  );
}
