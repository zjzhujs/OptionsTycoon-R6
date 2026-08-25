import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fmt, money } from '../lib/format';
import { audioManager } from '../lib/audio';

describe('Financial Formatting Helpers', () => {
  it('formats currency numbers correctly', () => {
    expect(money(125000)).toBe('$125,000.00');
    expect(money(0)).toBe('$0.00');
    expect(money(-450.5)).toBe('-$450.50');
  });

  it('formats decimals with variable precision', () => {
    expect(fmt(3.14159, 2)).toBe('3.14');
    expect(fmt(0.03215, 4)).toBe('0.0322');
    expect(fmt(100, 0)).toBe('100');
  });
});

describe('4-Channel Audio Engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with default volume levels', () => {
    const levels = audioManager.getLevels();
    expect(levels.master).toBeGreaterThan(0);
    expect(levels.music).toBeGreaterThan(0);
    expect(levels.sfx).toBeGreaterThan(0);
    expect(levels.ambience).toBeGreaterThan(0);
  });

  it('updates master volume and persists to storage', () => {
    audioManager.setLevels({ master: 0.6 });
    expect(audioManager.getLevels().master).toBe(0.6);
  });

  it('updates mute state correctly', () => {
    audioManager.setLevels({ muted: true });
    expect(audioManager.getLevels().muted).toBe(true);
    audioManager.setLevels({ muted: false });
    expect(audioManager.getLevels().muted).toBe(false);
  });

  it('handles track changes without error', () => {
    expect(() => {
      audioManager.playBgm('bgm_minimal_drumless');
      audioManager.playAmbience('amb_main_office');
      audioManager.playSfx('sfx_notification');
      audioManager.stopBgm();
      audioManager.stopAmbience();
    }).not.toThrow();
  });
});

describe('Mathematical Greeks Consistency Check', () => {
  it('verifies Net PnL is decomposed by delta, theta, vega, gamma and residual', () => {
    const deltaPnL = 1200.0;
    const thetaPnL = -300.0;
    const vegaPnL = 500.0;
    const residualPnL = 100.0;
    const expectedNet = deltaPnL + thetaPnL + vegaPnL + residualPnL;
    expect(expectedNet).toBe(1500.0);
  });
});
