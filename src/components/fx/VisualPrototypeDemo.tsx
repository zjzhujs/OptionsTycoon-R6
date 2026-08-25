import React, { useState, useEffect, useRef } from 'react';
import {
  FinancialParticleNetwork,
  type ParticleNetworkConfig,
  type ParticleNetworkHandle,
} from './FinancialParticleNetwork';
import './VisualPrototypeDemo.css';

export type PresetKey = 'main_menu' | 'fund_hq' | 'trading_floor' | 'investigation' | 'review';

export interface PresetConfig extends ParticleNetworkConfig {
  name: string;
  badge: string;
  description: string;
}

export const PRESET_CONFIGS: Record<PresetKey, PresetConfig> = {
  main_menu: {
    name: 'Main Menu',
    badge: '🏛️ 宏观全景',
    description: '华丽深邃，粒子密集，金色重点节点多，视差与冲击波响应最强',
    particleCount: 360,
    linkDistance: 135,
    speed: 0.9,
    parallaxStrength: 1.4,
    hoverRadius: 180,
    burstStrength: 3.2,
    burstCount: 65,
    depthStrength: 1.6,
    goldRatio: 0.22,
    redRatio: 0.0,
    showLines: true,
    showDepthFog: true,
  },
  fund_hq: {
    name: 'Fund HQ',
    badge: '🏢 合伙人总部',
    description: '稳重沉着，空间纵深高，金色节点适度，展现机构资本格局',
    particleCount: 240,
    linkDistance: 120,
    speed: 0.65,
    parallaxStrength: 1.1,
    hoverRadius: 150,
    burstStrength: 2.5,
    burstCount: 45,
    depthStrength: 1.3,
    goldRatio: 0.15,
    redRatio: 0.0,
    showLines: true,
    showDepthFog: true,
  },
  trading_floor: {
    name: 'Trading Floor',
    badge: '⚡ 做市交易台',
    description: '粒子稀疏克制，连线紧凑，冷青主调，绝不干扰高频盘口与数据阅读',
    particleCount: 150,
    linkDistance: 100,
    speed: 0.5,
    parallaxStrength: 0.7,
    hoverRadius: 120,
    burstStrength: 2.0,
    burstCount: 30,
    depthStrength: 0.9,
    goldRatio: 0.08,
    redRatio: 0.0,
    showLines: true,
    showDepthFog: true,
  },
  investigation: {
    name: 'Investigation',
    badge: '🚨 监管调查 / 异动',
    description: '引入深红警示节点，网络不稳定，高扰动撕裂，冲击波扩散剧烈',
    particleCount: 320,
    linkDistance: 140,
    speed: 1.35,
    parallaxStrength: 1.5,
    hoverRadius: 210,
    burstStrength: 4.0,
    burstCount: 80,
    depthStrength: 1.7,
    goldRatio: 0.1,
    redRatio: 0.25,
    showLines: true,
    showDepthFog: true,
  },
  review: {
    name: 'Review',
    badge: '📊 战局复盘',
    description: '慢速漂浮，极简连线，沉思安静，提供清晰的复盘思考心流',
    particleCount: 180,
    linkDistance: 90,
    speed: 0.35,
    parallaxStrength: 0.6,
    hoverRadius: 100,
    burstStrength: 1.8,
    burstCount: 25,
    depthStrength: 1.0,
    goldRatio: 0.12,
    redRatio: 0.0,
    showLines: true,
    showDepthFog: true,
  },
};

interface VisualPrototypeDemoProps {
  onExit?: () => void;
}

export const VisualPrototypeDemo: React.FC<VisualPrototypeDemoProps> = ({ onExit }) => {
  const [activePreset, setActivePreset] = useState<PresetKey>('main_menu');
  const [isMobileMode, setIsMobileMode] = useState<boolean>(false);
  const [isMobileFrameSim, setIsMobileFrameSim] = useState<boolean>(false);
  const [drawerCollapsed, setDrawerCollapsed] = useState<boolean>(false);

  // Live configurable parameters
  const [config, setConfig] = useState<ParticleNetworkConfig>(PRESET_CONFIGS.main_menu);

  // Performance HUD metrics
  const [metrics, setMetrics] = useState({ fps: 60, activeNodes: 0, activeLinks: 0, renderMs: 0 });

  const networkRef = useRef<ParticleNetworkHandle | null>(null);

  // Switch Preset Handler
  const handleSelectPreset = (presetKey: PresetKey) => {
    setActivePreset(presetKey);
    const preset = PRESET_CONFIGS[presetKey];
    setConfig({
      ...preset,
      isMobileMode,
    });
  };

  // Reset to default of active preset
  const handleReset = () => {
    const preset = PRESET_CONFIGS[activePreset];
    setConfig({
      ...preset,
      isMobileMode,
    });
    networkRef.current?.resetSimulation();
  };

  // Mode Toggle
  const handleToggleMode = () => {
    const nextMode = !isMobileMode;
    setIsMobileMode(nextMode);
    setConfig((prev) => {
      const currentParallax = prev.parallaxStrength ?? 1.0;
      return {
        ...prev,
        isMobileMode: nextMode,
        parallaxStrength: nextMode ? currentParallax * 0.5 : currentParallax * 2.0,
        hoverRadius: nextMode ? 120 : 180,
      };
    });
  };

  // Manual Trigger Burst Shockwave
  const handleTriggerShockwave = () => {
    networkRef.current?.triggerBurst();
  };

  // Poll metrics every 300ms for smooth HUD update
  useEffect(() => {
    const timer = setInterval(() => {
      if (networkRef.current) {
        setMetrics(networkRef.current.getMetrics());
      }
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="visual-prototype-root">
      {/* Background Ambient Subtle Noise / Grid */}
      <div className="visual-prototype-bg-ambient" />

      {/* Top Header Navigation */}
      <header className="prototype-topbar">
        <div className="prototype-brand">
          <span className="prototype-logo-badge">LAB DEMO</span>
          <h1 className="prototype-title">
            3D 金融粒子网络视觉原型
            <small>Options Tycoon Visual Prototype</small>
          </h1>
        </div>

        {/* Preset Selector Pills */}
        <nav className="prototype-presets-bar">
          {(Object.keys(PRESET_CONFIGS) as PresetKey[]).map((key) => {
            const p = PRESET_CONFIGS[key];
            const isActive = activePreset === key;
            return (
              <button
                key={key}
                type="button"
                className={`preset-pill-btn ${isActive ? 'active' : ''} ${
                  key === 'investigation' && isActive ? 'investigation' : ''
                }`}
                onClick={() => handleSelectPreset(key)}
                title={p.description}
              >
                <span>{p.badge}</span>
                <span>{p.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="prototype-header-actions">
          {/* Mode Switch Button */}
          <button
            type="button"
            className={`prototype-btn ${isMobileMode ? 'primary' : ''}`}
            onClick={handleToggleMode}
            title="切换桌面鼠标视差 / 手机触摸模式"
          >
            {isMobileMode ? '📱 Mobile Mode (手机触摸)' : '🖥️ Desktop Mode (桌面视差)'}
          </button>

          {isMobileMode && (
            <button
              type="button"
              className="prototype-btn"
              onClick={() => setIsMobileFrameSim((prev) => !prev)}
              title="切换 390x844 iPhone 视口容器框"
            >
              {isMobileFrameSim ? '📱 退出视口框' : '📱 模拟 390x844 框'}
            </button>
          )}

          <button
            type="button"
            className="prototype-btn primary"
            onClick={handleTriggerShockwave}
            title="模拟点击冲击波爆发"
          >
            💥 触发冲击波
          </button>

          {onExit && (
            <button
              type="button"
              className="prototype-btn"
              onClick={onExit}
              title="退出原型演示返回游戏"
            >
              ⬅ 返回主界面
            </button>
          )}
        </div>
      </header>

      {/* Main Interactive Demo Area */}
      <main className="visual-prototype-canvas-wrapper">
        {isMobileMode && isMobileFrameSim ? (
          <div className="mobile-frame-container">
            <div className="mobile-phone-bezel">
              <div className="mobile-notch" />
              <FinancialParticleNetwork
                ref={networkRef}
                {...config}
                isMobileMode={true}
              />
            </div>
          </div>
        ) : (
          <FinancialParticleNetwork
            ref={networkRef}
            {...config}
            isMobileMode={isMobileMode}
          />
        )}
      </main>

      {/* Interaction Hint Toast (Bottom Center) */}
      <div className="prototype-interaction-hint">
        {isMobileMode ? (
          <span>👆 <b>手机触摸交互</b>：手指滑动扰动网络，轻点任意位置触发局部粒子爆发</span>
        ) : (
          <span>🖱️ <b>桌面交互</b>：移动鼠标体验 3D 空间视差与网络扰动，<b>点击任意空白处</b>触发资本冲击波炸开</span>
        )}
      </div>

      {/* Live Metrics HUD (Bottom Left) */}
      <div className="prototype-metrics-hud">
        <div className="metrics-hud-title">
          <span>WebGL 引擎指标</span>
          <span className="metric-hud-value green">{metrics.fps} FPS</span>
        </div>
        <div className="metrics-hud-grid">
          <div className="metric-hud-item">
            <span className="metric-hud-label">粒子节点数</span>
            <span className="metric-hud-value cyan">{metrics.activeNodes}</span>
          </div>
          <div className="metric-hud-item">
            <span className="metric-hud-label">动态连线条数</span>
            <span className="metric-hud-value gold">{metrics.activeLinks}</span>
          </div>
          <div className="metric-hud-item">
            <span className="metric-hud-label">单帧渲染耗时</span>
            <span className="metric-hud-value">{metrics.renderMs} ms</span>
          </div>
          <div className="metric-hud-item">
            <span className="metric-hud-label">当前场景氛围</span>
            <span className="metric-hud-value" style={{ fontSize: '11px' }}>
              {PRESET_CONFIGS[activePreset].name}
            </span>
          </div>
        </div>
      </div>

      {/* Collapsible Parameter Tuning Drawer (Right Side) */}
      <aside className={`prototype-drawer ${drawerCollapsed ? 'collapsed' : ''}`}>
        <button
          type="button"
          className="prototype-drawer-toggle"
          onClick={() => setDrawerCollapsed((prev) => !prev)}
          title={drawerCollapsed ? '展开调参面板' : '收起调参面板'}
        >
          {drawerCollapsed ? '⚙️' : '▶'}
        </button>

        <div className="drawer-header">
          <div className="drawer-title">
            <span>⚙️ 视觉与物理参数调校</span>
          </div>
          <button type="button" className="prototype-btn" onClick={handleReset} style={{ padding: '4px 8px' }}>
            重置
          </button>
        </div>

        <div className="drawer-content">
          {/* Group 1: 粒子与网络密度 */}
          <div className="control-group">
            <div className="control-group-title">粒子与网络结构</div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Particle Count (粒子总数)</span>
                <span className="control-val-badge">{config.particleCount}</span>
              </div>
              <input
                type="range"
                min="50"
                max="600"
                step="10"
                className="slider-input"
                value={config.particleCount}
                onChange={(e) => setConfig({ ...config, particleCount: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Link Distance (连线极限距离)</span>
                <span className="control-val-badge">{config.linkDistance}px</span>
              </div>
              <input
                type="range"
                min="40"
                max="240"
                step="5"
                className="slider-input"
                value={config.linkDistance}
                onChange={(e) => setConfig({ ...config, linkDistance: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Particle Speed (漂浮速度)</span>
                <span className="control-val-badge">{(config.speed ?? 1.0).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.05"
                className="slider-input"
                value={config.speed ?? 1.0}
                onChange={(e) => setConfig({ ...config, speed: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Depth Spread (空间纵深跨度)</span>
                <span className="control-val-badge">{(config.depthStrength ?? 1.0).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                className="slider-input"
                value={config.depthStrength ?? 1.0}
                onChange={(e) => setConfig({ ...config, depthStrength: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Group 2: 节点色彩与权重 */}
          <div className="control-group">
            <div className="control-group-title">色彩与节点类型</div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Gold Hub Ratio (暗金核心节点占比)</span>
                <span className="control-val-badge">{Math.round((config.goldRatio ?? 0.15) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.5"
                step="0.02"
                className="slider-input"
                value={config.goldRatio ?? 0.15}
                onChange={(e) => setConfig({ ...config, goldRatio: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Red Risk Ratio (监管深红异动节点)</span>
                <span className="control-val-badge">{Math.round((config.redRatio ?? 0.08) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.4"
                step="0.02"
                className="slider-input"
                value={config.redRatio ?? 0.08}
                onChange={(e) => setConfig({ ...config, redRatio: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Group 3: 交互与物理冲击波 */}
          <div className="control-group">
            <div className="control-group-title">交互与冲击波物理</div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Parallax Strength (鼠标视差强度)</span>
                <span className="control-val-badge">{(config.parallaxStrength ?? 1.0).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="3.0"
                step="0.1"
                className="slider-input"
                value={config.parallaxStrength ?? 1.0}
                onChange={(e) => setConfig({ ...config, parallaxStrength: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Hover Radius (光标扰动影响半径)</span>
                <span className="control-val-badge">{config.hoverRadius ?? 180}px</span>
              </div>
              <input
                type="range"
                min="50"
                max="350"
                step="10"
                className="slider-input"
                value={config.hoverRadius ?? 180}
                onChange={(e) => setConfig({ ...config, hoverRadius: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Burst Strength (点击爆散冲击力)</span>
                <span className="control-val-badge">{(config.burstStrength ?? 2.5).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.2"
                className="slider-input"
                value={config.burstStrength ?? 2.5}
                onChange={(e) => setConfig({ ...config, burstStrength: Number(e.target.value) })}
              />
            </div>

            <div className="control-row">
              <div className="control-label-bar">
                <span>Burst Sparks (爆散微火花粒子数)</span>
                <span className="control-val-badge">{config.burstCount}</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                className="slider-input"
                value={config.burstCount}
                onChange={(e) => setConfig({ ...config, burstCount: Number(e.target.value) })}
              />
            </div>
          </div>

          {/* Group 4: 渲染开关 */}
          <div className="control-group">
            <div className="control-group-title">着色器与渲染开关</div>

            <div className="toggle-row">
              <span>渲染动态连线 (Show Network Lines)</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.showLines ?? true}
                  onChange={(e) => setConfig({ ...config, showLines: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="toggle-row">
              <span>空间景深雾化 (Depth Fog Falloff)</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={config.showDepthFog ?? true}
                  onChange={(e) => setConfig({ ...config, showDepthFog: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};

export default VisualPrototypeDemo;
