import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { VisualPrototypeDemo, PRESET_CONFIGS } from '../components/fx/VisualPrototypeDemo';
import { FinancialParticleNetwork } from '../components/fx/FinancialParticleNetwork';

describe('VisualPrototypeDemo Test Suite', () => {
  it('mounts VisualPrototypeDemo and renders header, title, and all 5 preset buttons', () => {
    const onExit = vi.fn();
    render(<VisualPrototypeDemo onExit={onExit} />);

    expect(screen.getByText('3D 金融粒子网络视觉原型')).toBeInTheDocument();
    expect(screen.getByText(/Options Tycoon Visual Prototype/i)).toBeInTheDocument();

    // Verify all 5 presets are rendered
    expect(screen.getAllByText('Main Menu').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Fund HQ').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Trading Floor').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Investigation').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Review').length).toBeGreaterThanOrEqual(1);

    // Verify WebGL metrics HUD is displayed
    expect(screen.getByText('WebGL 引擎指标')).toBeInTheDocument();
    expect(screen.getByText('粒子节点数')).toBeInTheDocument();
    expect(screen.getByText('动态连线条数')).toBeInTheDocument();
  });

  it('switches presets correctly and updates active scenario atmosphere', () => {
    render(<VisualPrototypeDemo />);

    // Click on Investigation preset
    const investigationBtn = screen.getByText('Investigation');
    fireEvent.click(investigationBtn);

    // Metrics HUD should reflect the new preset
    const atmosphereElements = screen.getAllByText('Investigation');
    expect(atmosphereElements.length).toBeGreaterThanOrEqual(1);

    // Click on Review preset
    const reviewBtn = screen.getByText('Review');
    fireEvent.click(reviewBtn);
    expect(screen.getAllByText('Review').length).toBeGreaterThanOrEqual(1);
  });

  it('toggles between Desktop Mode and Mobile Mode', () => {
    render(<VisualPrototypeDemo />);

    const modeBtn = screen.getByText(/Desktop Mode/i);
    expect(modeBtn).toBeInTheDocument();

    // Click to switch to Mobile Mode
    fireEvent.click(modeBtn);
    expect(screen.getByText(/Mobile Mode/i)).toBeInTheDocument();

    // In Mobile Mode, the 390x844 frame simulation button appears
    expect(screen.getByText(/模拟 390x844 框/i)).toBeInTheDocument();

    // Toggle frame simulation
    const frameBtn = screen.getByText(/模拟 390x844 框/i);
    fireEvent.click(frameBtn);
    expect(screen.getByText(/退出视口框/i)).toBeInTheDocument();
  });

  it('allows parameter slider adjustments and drawer collapse', () => {
    render(<VisualPrototypeDemo />);

    // Check sliders exist in drawer
    expect(screen.getByText(/Particle Count/i)).toBeInTheDocument();
    expect(screen.getByText(/Link Distance/i)).toBeInTheDocument();
    expect(screen.getByText(/Burst Strength/i)).toBeInTheDocument();

    // Toggle drawer
    const drawerToggle = screen.getByTitle(/收起调参面板/i);
    fireEvent.click(drawerToggle);
    expect(screen.getByTitle(/展开调参面板/i)).toBeInTheDocument();
  });

  it('triggers shockwave and handles onExit callback', () => {
    const onExit = vi.fn();
    render(<VisualPrototypeDemo onExit={onExit} />);

    const burstBtn = screen.getByText(/触发冲击波/i);
    fireEvent.click(burstBtn);

    const exitBtn = screen.getByText(/返回主界面/i);
    fireEvent.click(exitBtn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('mounts FinancialParticleNetwork standalone safely without crashing', () => {
    const { container } = render(
      <FinancialParticleNetwork
        particleCount={100}
        linkDistance={100}
        speed={1.0}
        parallaxStrength={1.0}
        hoverRadius={150}
        burstStrength={2.0}
        burstCount={30}
        depthStrength={1.0}
        goldRatio={0.1}
        redRatio={0.05}
      />
    );
    expect(container.firstChild).toHaveClass('financial-particle-network-canvas');
  });
});
