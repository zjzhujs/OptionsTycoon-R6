import React, { useEffect, useState } from 'react';

/**
 * 主题工作室（2026-08-19 claude）
 *
 * 接管原来那个「🔬 视觉原型 (FX Lab)」入口——它此前只是个演示页，
 * 对玩家没有实际用处。现在它是真正的外观控制台：主题、效果强度、减少动效。
 *
 * ── 为什么主题写在 <html> 而不是某个 React 容器上 ──────────────────
 *
 * 主题 token 定义在 `:root`。写在组件容器上的话，任何 portal 出去的东西
 * （modal、tooltip、全屏遮罩）都在容器之外，会拿不到 token 而露出裸色。
 * 本作的弹窗很多——盘中时点那一屏就是全屏遮罩——所以必须挂在文档根上。
 *
 * ── 为什么首屏之前就要写 ──────────────────────────────────────────
 *
 * 见 main.tsx 里的同步初始化：等 React 挂载完再套主题会闪一下默认色。
 * 这里的 effect 只负责"玩家切换之后"的持久化，不负责首屏。
 */

export type ThemeId = 'neon' | 'amber' | 'calm';

export const THEMES: Array<{
  id: ThemeId;
  name: string;
  en: string;
  blurb: string;
  swatch: [string, string, string];
}> = [
  {
    id: 'neon',
    name: '霓虹战情室',
    en: 'NEON WAR ROOM',
    blurb: '电光青 × 等离子红紫，HUD 切角与 Bloom 最强；用于战情室高压场景。',
    swatch: ['#030713', '#00f0ff', '#ff0055'],
  },
  {
    id: 'amber',
    name: '琥珀指挥部',
    en: 'AMBER COMMAND',
    blurb: '黑曜石 × 战术琥珀，CRT 扫描线、荧光字与硬件控制台内凹材质。',
    swatch: ['#0c0d10', '#f59e0b', '#fbbf24'],
  },
  {
    id: 'calm',
    name: '静默主控台',
    en: 'EXECUTIVE CALM',
    blurb: '深海冷灰蓝毛玻璃，24px 背景模糊与发丝边缘光；低饱和长时阅读。',
    swatch: ['#071219', '#80c8d8', '#c4dde4'],
  },
];

const LS_THEME = 'ot_theme';
const LS_MOTION = 'ot_motion';

export const DEFAULT_THEME: ThemeId = 'neon';

/** 供 main.tsx 在 React 挂载前同步调用，避免首屏闪色 */
export function applyStoredAppearance(): void {
  try {
    const t = (localStorage.getItem(LS_THEME) as ThemeId) || DEFAULT_THEME;
    const reduced = localStorage.getItem(LS_MOTION) === 'reduced';
    const root = document.documentElement;
    // 三套主题都显式写到 <html data-theme=...>。
    // 这样 portal / modal / 全屏 backplane 与第三方挂载节点都读取同一主题，
    // 也避免默认 neon 走一条‘无属性’的隐式分支而漏掉主题专属材质选择器。
    const resolved: ThemeId = THEMES.some((item) => item.id === t) ? t : DEFAULT_THEME;
    root.setAttribute('data-theme', resolved);
    if (reduced) root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
  } catch {
    /* localStorage 不可用（无痕模式等）时保持默认，不要因此白屏 */
  }
}

export interface ThemeStudioProps {
  onClose: () => void;
}

export function ThemeStudio({ onClose }: ThemeStudioProps): JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(() => {
    try {
      const stored = (localStorage.getItem(LS_THEME) as ThemeId) || DEFAULT_THEME;
      return THEMES.some((item) => item.id === stored) ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });
  const [reduced, setReduced] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_MOTION) === 'reduced';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_THEME, theme);
      localStorage.setItem(LS_MOTION, reduced ? 'reduced' : 'full');
    } catch {
      /* 存不进去也要让当前这次切换生效 */
    }
    applyStoredAppearance();
  }, [theme, reduced]);

  return (
    <div className="modal-overlay ui-enforced" onClick={onClose}>
      <div
        className="modal-content ths-modal ui-modal ui-surface ui-l3"
        onClick={(e) => e.stopPropagation()}
        data-testid="theme-studio"
      >
        <button onClick={onClose} className="btn-close ui-btn" data-variant="compact" aria-label="关闭">✕</button>

        <div className="ths-head modal-header ui-modal-header">
          <span className="ths-title ui-title" data-level="1">
            外观 <span className="en-secondary">APPEARANCE</span>
          </span>
          <span className="ths-sub">三套主题共用同一套布局，只换质感。切换即时生效并记住。</span>
        </div>

        <div className="modal-body ui-modal-body">
        <div className="ths-grid" role="radiogroup" aria-label="主题">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              className={`ths-card ot-panel ui-btn ${theme === t.id ? 'ths-card-on' : ''}`}
              data-variant="row"
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
              data-testid={`theme-${t.id}`}
              data-theme-preview={t.id}
            >
              <span className="ths-swatch" aria-hidden>
                {t.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="ths-name">
                {t.name}
                {t.id === DEFAULT_THEME && <em className="ths-default ot-badge">默认</em>}
              </span>
              <span className="ths-en font-mono">{t.en}</span>
              <span className="ths-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>

        <label className="ths-toggle">
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
            data-testid="theme-reduced-motion"
          />
          <span>
            <strong>减少动效</strong>
            <small>
              关闭粒子漂移与呼吸光，保留全部信息与颜色。
              系统级「减少动态效果」也会自动生效，不必在这里重复设置。
            </small>
          </span>
        </label>

        <div className="v28-data-boundary-note ths-note">
          外观设置只影响呈现，<strong>不改变任何行情数据、成交价与结算逻辑</strong>。
          三套主题下同一天的 K 线、同一笔成交的价格完全一致。
        </div>
        </div>
      </div>
    </div>
  );
}
