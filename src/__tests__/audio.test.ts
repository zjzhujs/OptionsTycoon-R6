// Audio engine technical tests for the 2026-08-15 PLAYTEST FIX + AUDIO DIRECTION PASS.
//
// Section 52 explicitly scopes these tests to TECHNICAL correctness, not "does it sound
// good" -- asset mapping exists, no missing files, iOS unlock works, channel mute works,
// BGM switching never stacks three layers, and a no-music state actually silences.
// Scene-to-track MAPPING correctness (which BGM plays on which screen) is verified by the
// manual browser check in PLAYTEST_FIX_AUDIO_REPORT.md section N, per section 54 -- that
// requires a real running app + real ears, not a jsdom unit test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { audioManager, sfxForIntelClass, type BgmName, type AmbienceName, type SfxName } from '../lib/audio';

const PUBLIC_AUDIO_DIR = path.resolve(__dirname, '../../public/audio');

const BGM_NAMES: BgmName[] = [
  'bgm_minimal_drumless',
  'bgm_research_idm',
  'bgm_position_minimal',
  'bgm_pressure',
  'bgm_investigation',
];
const AMBIENCE_NAMES: AmbienceName[] = ['amb_main_office', 'amb_private_room'];
const SFX_NAMES: SfxName[] = [
  'ui_click',
  'ui_hover',
  'save',
  'load',
  'sfx_phone_vibration',
  'sfx_notification',
  'sfx_rejected',
  'sfx_low_hit',
  'sfx_glass_door',
  'sfx_paper_handling',
  'amb_desk_activity',
  'sfx_elevator_arrival',
  'sfx_printer',
];

describe('Audio asset mapping (section 52: "asset mapping存在, 文件404=0")', () => {
  it('has all three formats on disk for every locked BGM name', () => {
    const missing: string[] = [];
    for (const name of BGM_NAMES) {
      for (const ext of ['ogg', 'm4a', 'wav']) {
        const p = path.join(PUBLIC_AUDIO_DIR, 'bgm', `${name}.${ext}`);
        if (!fs.existsSync(p)) missing.push(p);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has all three formats on disk for every locked Ambience name', () => {
    const missing: string[] = [];
    for (const name of AMBIENCE_NAMES) {
      for (const ext of ['ogg', 'm4a', 'wav']) {
        const p = path.join(PUBLIC_AUDIO_DIR, 'ambience', `${name}.${ext}`);
        if (!fs.existsSync(p)) missing.push(p);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a .wav on disk for every SfxName the type union declares', () => {
    const missing: string[] = [];
    for (const name of SFX_NAMES) {
      const p = path.join(PUBLIC_AUDIO_DIR, 'sfx', `${name}.wav`);
      if (!fs.existsSync(p)) missing.push(p);
    }
    expect(missing).toEqual([]);
  });

  it('does not ship any file for a removed pre-pass asset name (no dead weight left behind)', () => {
    const removedBgm = [
      'main_menu_theme',
      'war_room_tactics',
      'trading_floor_active',
      'crisis_night_deepseek',
      'sec_investigation_tension',
    ];
    for (const name of removedBgm) {
      expect(fs.existsSync(path.join(PUBLIC_AUDIO_DIR, 'bgm', `${name}.wav`))).toBe(false);
    }
    const removedSfx = ['order_fill', 'order_reject', 'pnl_gain', 'pnl_loss', 'margin_call', 'trading_halt'];
    for (const name of removedSfx) {
      expect(fs.existsSync(path.join(PUBLIC_AUDIO_DIR, 'sfx', `${name}.wav`))).toBe(false);
    }
  });

  it('every audio file actually referenced by a type union member exists (zero broken references, the "404=0" check)', () => {
    const allDirFiles = new Set<string>();
    for (const sub of ['bgm', 'ambience', 'sfx']) {
      for (const f of fs.readdirSync(path.join(PUBLIC_AUDIO_DIR, sub))) {
        allDirFiles.add(`${sub}/${f}`);
      }
    }
    for (const name of BGM_NAMES) {
      for (const ext of ['ogg', 'm4a', 'wav']) expect(allDirFiles.has(`bgm/${name}.${ext}`)).toBe(true);
    }
    for (const name of AMBIENCE_NAMES) {
      for (const ext of ['ogg', 'm4a', 'wav']) expect(allDirFiles.has(`ambience/${name}.${ext}`)).toBe(true);
    }
    for (const name of SFX_NAMES) {
      expect(allDirFiles.has(`sfx/${name}.wav`)).toBe(true);
    }
  });
});

describe('sfxForIntelClass', () => {
  it('always resolves to the one locked notification cue (no fabricated danger cue)', () => {
    for (const cls of ['POSSIBLE_MNPI', 'PRIVATE_INTEL', 'MARKET_RUMOR', 'MACRO_DATA', 'ANYTHING_ELSE']) {
      expect(sfxForIntelClass(cls)).toBe('sfx_notification');
    }
  });
});

// --- Engine behavior with a controllable fake HTMLAudioElement ------------------------
// jsdom's real HTMLMediaElement.play() returns undefined (not a Promise), which silently
// skips the crossfade/state-update branch inside playBgm(). To actually exercise that
// logic (and prove no triple-stack + real mute/duck behavior) these tests substitute a
// minimal fake Audio constructor with a resolving play() Promise, matching how a real
// browser behaves once autoplay is allowed.
class FakeAudio {
  static instances: FakeAudio[] = [];
  static deferPlay = false;
  static pendingPlayResolvers: Array<() => void> = [];
  src = '';
  volume = 1;
  muted = false;
  loop = false;
  paused = true;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(src?: string) {
    if (src) this.src = src;
    FakeAudio.instances.push(this);
  }
  addEventListener(evt: string, cb: () => void) {
    (this.listeners[evt] ||= []).push(cb);
  }
  play() {
    this.paused = false;
    if (FakeAudio.deferPlay) {
      return new Promise<void>((resolve) => {
        FakeAudio.pendingPlayResolvers.push(resolve);
      });
    }
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }

  static resolvePendingPlays(): void {
    const resolvers = FakeAudio.pendingPlayResolvers.splice(0);
    resolvers.forEach((resolve) => resolve());
  }
}

const CROSSFADE_MS = 20;
const SETTLE_MS = 150; // comfortably longer than CROSSFADE_MS so the interval always finishes

describe('AudioManager engine behavior (real crossfade path, fake Audio element)', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakeAudio.deferPlay = false;
    FakeAudio.pendingPlayResolvers = [];
    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    // Fully reset engine state so no timer/token from a previous test can leak in.
    audioManager.stopBgm();
    audioManager.stopAmbience();
    audioManager.setLevels({ master: 0.7, music: 0.2, ambience: 0.25, sfx: 0.3, muted: false });
  });

  afterEach(() => {
    FakeAudio.deferPlay = false;
    FakeAudio.pendingPlayResolvers = [];
    audioManager.stopBgm();
    audioManager.stopAmbience();
    vi.unstubAllGlobals();
  });

  it('switching BGM crossfades and never leaves more than one un-paused element (no triple-stack)', async () => {
    audioManager.playBgm('bgm_minimal_drumless', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    expect(audioManager.getCurrentBgm()).toBe('bgm_minimal_drumless');

    audioManager.playBgm('bgm_research_idm', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    const unpaused = FakeAudio.instances.filter((a) => !a.paused);
    expect(unpaused.length).toBeLessThanOrEqual(1);
    expect(audioManager.getCurrentBgm()).toBe('bgm_research_idm');
  });

  it('replaces a pending play request instead of dropping the newer scene transition', async () => {
    FakeAudio.deferPlay = true;
    audioManager.playBgm('bgm_minimal_drumless', CROSSFADE_MS);
    audioManager.playBgm('bgm_research_idm', CROSSFADE_MS);

    expect(FakeAudio.instances).toHaveLength(2);
    FakeAudio.resolvePendingPlays();
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    expect(audioManager.getCurrentBgm()).toBe('bgm_research_idm');
    expect(FakeAudio.instances[0].paused).toBe(true);
    expect(FakeAudio.instances.filter((a) => !a.paused)).toHaveLength(1);
  });

  it('calling playBgm with the currently-playing track is a no-op (does not spawn a duplicate element)', async () => {
    audioManager.playBgm('bgm_pressure', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const countAfterFirst = FakeAudio.instances.length;
    audioManager.playBgm('bgm_pressure', CROSSFADE_MS);
    expect(FakeAudio.instances.length).toBe(countAfterFirst);
  });

  it('fadeOutBgm actually silences and clears the current track (no-music state really stops, not just visually)', async () => {
    audioManager.playBgm('bgm_position_minimal', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    expect(audioManager.getCurrentBgm()).toBe('bgm_position_minimal');

    audioManager.fadeOutBgm(CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));

    expect(audioManager.getCurrentBgm()).toBeNull();
    expect(FakeAudio.instances.every((a) => a.paused)).toBe(true);
  });

  it('channel mute actually silences SFX playback (no element created while muted)', () => {
    audioManager.setLevels({ muted: true });
    const before = FakeAudio.instances.length;
    audioManager.playSfx('sfx_notification');
    expect(FakeAudio.instances.length).toBe(before);
    audioManager.setLevels({ muted: false });
  });

  it('duckMusic reduces then restores BGM volume after the given duration', async () => {
    audioManager.playBgm('bgm_pressure', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    expect(audioManager.getCurrentBgm()).toBe('bgm_pressure');
    const el = FakeAudio.instances[FakeAudio.instances.length - 1];
    const fullVol = el.volume;
    expect(fullVol).toBeGreaterThan(0);

    audioManager.duckMusic(0.5, CROSSFADE_MS);
    expect(el.volume).toBeLessThan(fullVol);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    expect(el.volume).toBeCloseTo(fullVol, 5);
  });

  it('bgm_research_idm plays quieter than a normal track (section 33: "很低音量"), found live via manual browser check', async () => {
    audioManager.playBgm('bgm_pressure', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const normalVol = FakeAudio.instances[FakeAudio.instances.length - 1].volume;

    audioManager.playBgm('bgm_research_idm', CROSSFADE_MS, 0.4);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const quietVol = FakeAudio.instances[FakeAudio.instances.length - 1].volume;

    expect(quietVol).toBeLessThan(normalVol);
    expect(quietVol).toBeCloseTo(normalVol * 0.4, 5);

    // Switching back to a track without a multiplier must not leave the quiet level stuck.
    audioManager.playBgm('bgm_position_minimal', CROSSFADE_MS);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const restoredVol = FakeAudio.instances[FakeAudio.instances.length - 1].volume;
    expect(restoredVol).toBeCloseTo(normalVol, 5);
  });

  it('resumeAfterUserGesture (iOS unlock retry) never throws, with or without an active track', () => {
    expect(() => audioManager.resumeAfterUserGesture()).not.toThrow();
    audioManager.playBgm('bgm_minimal_drumless', 20);
    expect(() => audioManager.resumeAfterUserGesture()).not.toThrow();
  });
});
