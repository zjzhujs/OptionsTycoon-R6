import React, { useState, useEffect, useRef } from 'react';
import { money } from '../lib/format';
import { resolveArtSrc } from '../lib/assetResolver';
import type { GameMode, SaveSlotInfo } from '../types';
import { useMotionScale } from './fx/useMotionScale';
import { Particles } from './fx/Particles';

export interface MainMenuModalProps {
  isOpen: boolean;
  saves: SaveSlotInfo[];
  /** `guided` requests the FIRST-TIME GUIDED FIRST DAY over the real panels. */
  onStartNewGame: (mode: GameMode, guided?: boolean) => void;
  /** Whether this player has already finished onboarding (from the save file). */
  tutorialCompleted?: boolean;
  onLoadGame: (slot: string) => void;
  onOpenTutorial: () => void;
  onOpenSettings: () => void;
  onOpenCredits: () => void;
  onOpenFxLab?: () => void;
  onClose: () => void;
}

export function MainMenuModal({
  isOpen,
  saves,
  onStartNewGame,
  onLoadGame,
  onOpenTutorial,
  onOpenSettings,
  onOpenCredits,
  onOpenFxLab,
  onClose,
  tutorialCompleted = false,
}: MainMenuModalProps): JSX.Element | null {
  const [showSavePicker, setShowSavePicker] = useState(false);
  const [showFirstTimeChoice, setShowFirstTimeChoice] = useState(false);
  const motionScale = useMotionScale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const theme = document.documentElement.getAttribute('data-theme') || 'neon';

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      if (theme === 'amber') {
        // Amber Tactical Grid, Scanline Aura & Golden Nodes
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.07)';
        ctx.lineWidth = 1;
        const step = 44;
        for (let x = 0; x < w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        // Radar sweep
        const sweepY = (time * 50) % (h + 120);
        const grad = ctx.createLinearGradient(0, Math.max(0, sweepY - 70), 0, sweepY);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.06)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, Math.max(0, sweepY - 70), w, 70);
      } else if (theme === 'calm') {
        // Calm Minimalist High-Precision Glass Grid
        ctx.strokeStyle = 'rgba(79, 195, 217, 0.06)';
        ctx.lineWidth = 1;
        const step = 56;
        for (let x = 0; x < w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      } else {
        // Neon Cybernetic Spatial Beam Network
        const pulse = Math.sin(time * 1.2) * 0.02 + 0.05;
        const grad = ctx.createRadialGradient(w * 0.25, h * 0.35, 20, w * 0.25, h * 0.35, w * 0.7);
        grad.addColorStop(0, `rgba(53, 224, 255, ${pulse})`);
        grad.addColorStop(0.6, `rgba(139, 108, 255, ${pulse * 0.6})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      time += 0.016 * motionScale;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, [motionScale]);

  if (!isOpen) return null;

  return (
    <div className="mm-cinematic ui-enforced">
      {/* 电影片头式入口（dante A档）：75% 场景 / 25% 命令轨。背景图走 resolveArtSrc 防便携包路径失效。 */}
      <div
        className="mm-scene-far" data-ui-exempt="scene"
        style={{ backgroundImage: `url('${resolveArtSrc('/art/scenes/bg_main_menu')}')` }}
        aria-hidden
      />
      <div
        className="mm-floor-layer" data-ui-exempt="scene"
        style={{ backgroundImage: `url('${resolveArtSrc('/art/scenes/bg_trading_floor')}')` }}
        aria-hidden
      />
      <div className="mm-particles" data-ui-exempt="scene" aria-hidden>
        <Particles
          particleCount={window.innerWidth < 768 ? 40 : 90}
          particleColors={['#47dff6', '#7d8cff', '#ffffff']}
          particleSpread={14}
          speed={0.035}
          moveParticlesOnHover={true}
          particleHoverFactor={0.55}
          particleBaseSize={70}
        />
      </div>
      <canvas ref={canvasRef} className="mm-ambient-canvas" data-ui-exempt="scene" aria-hidden="true" />
      <div className="mm-grade" aria-hidden />
      <div className="mm-vignette" aria-hidden />

      <main className="mm-stage">
        <div className="mm-layout">
          <section className="mm-brand" aria-label="期权大亨">
            <div className="mm-eyebrow">OPTIONS TYCOON / INSTITUTIONAL MARKET SIMULATION</div>
            <h1 className="mm-title">
              <span className="mm-title-zh">期权大亨</span>
              <span className="mm-title-en">OPTIONS TYCOON</span>
            </h1>
            <div className="mm-title-rule" aria-hidden />
            <p className="mm-subtitle">在真实历史市场里形成观点、承担风险、面对人和资本的后果。</p>
            <div className="mm-status">
              <span className="mm-live-dot" /> OFFLINE HISTORICAL ENGINE · REAL / DERIVED / SIMULATED_NARRATIVE
            </div>
          </section>

          <section className="mm-command" aria-label="主菜单">
            <div className="mm-command-head">
              <span className="mm-command-label">FUND TERMINAL</span>
            </div>
            {showFirstTimeChoice ? (
              <div className="mm-command-deck">
                <div className="mm-first-time">FIRST TIME FUND MANAGER · 用真实期权链与订单台完成第一笔交易，不是练习沙盒。</div>
                <button
                  type="button"
                  className="mm-command-row ui-btn ui-btn-primary" data-variant="row"
                  data-testid="guided-first-day"
                  onClick={() => {
                    onStartNewGame('STORY_CAMPAIGN', true);
                    onClose();
                  }}
                >
                  <span className="mm-command-index">[01]</span>
                  <span className="mm-command-copy">
                    <strong>GUIDED FIRST DAY / 新手引导</strong>
                    <small>先形成观点，再逐步认识工具</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
                <button
                  type="button"
                  className="mm-command-row ui-btn" data-variant="row"
                  data-testid="start-directly"
                  onClick={() => {
                    onStartNewGame('STORY_CAMPAIGN', false);
                    onClose();
                  }}
                >
                  <span className="mm-command-index">[02]</span>
                  <span className="mm-command-copy">
                    <strong>START DIRECTLY / 直接开始</strong>
                    <small>已经熟悉期权，跳过引导</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
                <button type="button" className="mm-back ui-btn" data-variant="row" onClick={() => setShowFirstTimeChoice(false)}>
                  ← BACK / 返回
                </button>
              </div>
            ) : showSavePicker ? (
              <div className="mm-command-deck">
                <div className="mm-command-label" style={{ marginBottom: 8 }}>LOAD FUND ARCHIVE / 载入基金档案</div>
                <div className="mm-save-list">
                  {saves.map((s) => (
                    <button
                      key={s.slot}
                      type="button"
                      className="mm-command-row mm-save-row ui-btn" data-variant="row"
                      onClick={() => {
                        onLoadGame(s.slot);
                        onClose();
                      }}
                    >
                      <span className="mm-command-index">{s.slot?.toUpperCase() ?? 'SAVE'}</span>
                      <span className="mm-command-copy">
                        <strong>{s.game_date ?? 'UNKNOWN DATE'} · {s.campaign_id?.toUpperCase() ?? 'CAMPAIGN'}</strong>
                        <small>{s.episode_info || '基金档案'} · NAV {money(s.equity ?? 0)}</small>
                      </span>
                      <span className="mm-command-arrow" aria-hidden>↗</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="mm-back ui-btn" data-variant="row" onClick={() => setShowSavePicker(false)}>
                  ← RETURN / 返回主菜单
                </button>
              </div>
            ) : (
              <div className="mm-command-deck">
                <button
                  type="button"
                  className="mm-command-row ui-btn ui-btn-primary" data-variant="row"
                  data-testid="new-fund"
                  onClick={() => {
                    if (!tutorialCompleted) {
                      setShowFirstTimeChoice(true);
                      return;
                    }
                    onStartNewGame('STORY_CAMPAIGN');
                    onClose();
                  }}
                >
                  <span className="mm-command-index">[01]</span>
                  <span className="mm-command-copy">
                    <strong>NEW FUND / 新基金战役</strong>
                    <small>Season 1 · AI 赌局 · 8 集完整故事</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
                {saves.length > 0 && (
                  <button type="button" className="mm-command-row ui-btn" data-variant="row" onClick={() => setShowSavePicker(true)}>
                    <span className="mm-command-index">[02]</span>
                    <span className="mm-command-copy">
                      <strong>CONTINUE / 继续基金档案</strong>
                      <small>{saves.length} saves · {saves[0]?.game_date ?? ''} · {money(saves[0]?.equity ?? 0)}</small>
                    </span>
                    <span className="mm-command-arrow" aria-hidden>↗</span>
                  </button>
                )}
                <button
                  type="button"
                  className="mm-command-row ui-btn" data-variant="row"
                  onClick={() => {
                    onStartNewGame('WALL_STREET_REPLAY');
                    onClose();
                  }}
                >
                  <span className="mm-command-index">[03]</span>
                  <span className="mm-command-copy">
                    <strong>WALL STREET REPLAY / 历史自由回放</strong>
                    <small>Historical market replay</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
                <button
                  type="button"
                  className="mm-command-row ui-btn" data-variant="row"
                  onClick={() => {
                    onStartNewGame('EMPIRE_MODE');
                    onClose();
                  }}
                >
                  <span className="mm-command-index">[04]</span>
                  <span className="mm-command-copy">
                    <strong>EMPIRE MODE / 帝国沙盒</strong>
                    <small>Multi-strategy fund sandbox</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
                <button type="button" className="mm-command-row ui-btn" data-variant="row" onClick={onOpenTutorial}>
                  <span className="mm-command-index">[05]</span>
                  <span className="mm-command-copy">
                    <strong>TUTORIAL MASTERCLASS / 期权交易讲堂</strong>
                    <small>Options · Greeks · execution</small>
                  </span>
                  <span className="mm-command-arrow" aria-hidden>↗</span>
                </button>
              </div>
            )}
            <div className="mm-tools" aria-label="System tools">
              {onOpenFxLab && (
                <button type="button" className="ui-btn" data-variant="row" onClick={onOpenFxLab} data-testid="open-appearance">
                  外观 <span className="en-secondary">APPEARANCE</span>
                </button>
              )}
              <button type="button" className="ui-btn" data-variant="row" onClick={onOpenSettings}>设置 <span className="en-secondary">SETTINGS</span></button>
              <button type="button" className="ui-btn" data-variant="row" onClick={onOpenCredits}>制作名单 <span className="en-secondary">CREDITS</span></button>
              <button type="button" className="ui-btn" data-variant="row" onClick={onClose}>进入交易大厅 ▶ <span className="en-secondary">ENTER FLOOR</span></button>
            </div>
          </section>
        </div>
      </main>


      <footer className="mm-footer">
        <span>数据真实性承诺：REAL / DERIVED / ESTIMATED / SIMULATED · 严禁使用未来信息</span>
        <span>NO LOOKAHEAD · OFFLINE FUND SIMULATION</span>
      </footer>
    </div>
  );
}
