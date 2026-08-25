import React from 'react';
import type { AudioLevels } from '../lib/audio';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioLevels: AudioLevels;
  onUpdateAudio: (next: Partial<AudioLevels>) => void;
  accountRuleText?: string;
}

export function SettingsModal({
  isOpen,
  onClose,
  audioLevels,
  onUpdateAudio,
  accountRuleText,
}: SettingsModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div className="modal-content settings-modal settings-modal-card ui-modal ui-surface ui-l3" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header modal-header ui-modal-header">
          <h2 className="ui-title" data-level="1">系统设置 (System Settings)</h2>
          <button className="btn-close ui-btn" data-variant="compact" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body modal-body ui-modal-body">
          {/* Audio Controls */}
          <div className="settings-group">
            <h3>🔊 声音与混音通道 (Audio Channels)</h3>
            <div className="setting-row">
              <label>全局静音 (Mute All)</label>
              <button
                className={`btn-toggle ui-btn ${audioLevels.muted ? 'active' : ''}`}
                data-variant="compact"
                onClick={() => onUpdateAudio({ muted: !audioLevels.muted })}
              >
                {audioLevels.muted ? '🔇 已静音' : '🔊 声音开启'}
              </button>
            </div>

            <div className="setting-row">
              <label>主音量（MASTER）: {Math.round(audioLevels.master * 100)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioLevels.master}
                onChange={(e) => onUpdateAudio({ master: Number(e.target.value) })}
              />
            </div>

            <div className="setting-row">
              <label>音乐（MUSIC）: {Math.round(audioLevels.music * 100)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioLevels.music}
                onChange={(e) => onUpdateAudio({ music: Number(e.target.value) })}
              />
            </div>

            <div className="setting-row">
              <label>音效（SFX）: {Math.round(audioLevels.sfx * 100)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioLevels.sfx}
                onChange={(e) => onUpdateAudio({ sfx: Number(e.target.value) })}
              />
            </div>

            <div className="setting-row">
              <label>环境声（AMBIENCE）: {Math.round(audioLevels.ambience * 100)}%</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={audioLevels.ambience}
                onChange={(e) => onUpdateAudio({ ambience: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Account & Regulatory Rules */}
          {accountRuleText && (
            <div className="settings-group">
              <h3>📜 账户监管规则 (Account Rules)</h3>
              <div className="rule-box">{accountRuleText}</div>
            </div>
          )}

          {/* Data Transparency & Provenance */}
          <div className="settings-group">
            <h3>🛡️ 数据真实性分级说明（DATA PROVENANCE）</h3>
            <div className="provenance-grid">
              <div className="provenance-item">
                <span className="ot-truth-label ot-badge-real"><span className="ot-badge-dot" />真实（REAL）</span> 真实历史日线 OHLCV、VIX、国债利率与外汇汇率
              </div>
              <div className="provenance-item">
                <span className="ot-truth-label ot-badge-derived"><span className="ot-badge-dot" />推导数据（DERIVED）</span> 由真实历史价格数学衍生（如 2s10s 利差、GEX 分布）
              </div>
              <div className="provenance-item">
                <span className="ot-truth-label ot-badge-estimated"><span className="ot-badge-dot" />估算（ESTIMATED）</span> Black-Scholes 教学期权定价模型计算公允价值
              </div>
              <div className="provenance-item">
                <span className="ot-truth-label ot-badge-simulated"><span className="ot-badge-dot" />模拟数据（SIMULATED）</span> 做市商微观盘口深度与动态对冲模拟（严禁修改历史真实价格）
              </div>
            </div>
          </div>
        </div>

        <div className="settings-footer modal-footer ui-modal-footer">
          <button className="ot-btn ui-btn ui-btn-primary" onClick={onClose}>完成设置</button>
        </div>
      </div>
    </div>
  );
}
