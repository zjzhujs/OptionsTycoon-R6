// Options Tycoon Institutional 4-Channel Audio Engine
// Channels: Master, Music (BGM), Ambience, SFX
// Features: Dynamic Crossfading, Speech/Event Ducking, LocalStorage Persistence, Safe Fallback
//
// Asset set is the Owner-locked Pixabay manifest from the 2026-08-15 PLAYTEST FIX + AUDIO
// DIRECTION PASS (see AUDIO_LICENSE_MANIFEST.md). Every name below maps 1:1 to a licensed
// asset actually present under frontend/public/audio/ -- nothing here is a placeholder.

export type SfxName =
  // Pre-existing, untouched -- no locked replacement was specified for these, and section 38
  // of the audio direction explicitly allows keeping one already-light UI click as-is.
  | 'ui_click'
  | 'ui_hover'
  | 'save'
  | 'load'
  // Locked manifest SFX
  | 'sfx_phone_vibration'
  | 'sfx_notification'
  | 'sfx_rejected'
  | 'sfx_low_hit'
  | 'sfx_glass_door'
  | 'sfx_paper_handling'
  | 'amb_desk_activity'
  | 'sfx_elevator_arrival'
  | 'sfx_printer';

export type AmbienceName = 'amb_main_office' | 'amb_private_room';

export type BgmName =
  | 'bgm_minimal_drumless'
  | 'bgm_research_idm'
  | 'bgm_position_minimal'
  | 'bgm_pressure'
  | 'bgm_investigation';

export interface AudioLevels {
  master: number; // 0..1
  music: number;  // 0..1
  ambience: number; // 0..1
  sfx: number;    // 0..1
  muted: boolean;
}

const STORAGE_KEY = 'options_tycoon_audio_levels_v2';

// Music/ambience tracks are produced in 3 formats: source .wav (uncompressed, kept only as the
// universal fallback), .ogg (Vorbis, smallest), and .m4a (AAC, broadest compatibility incl.
// Safari which historically has weak Opus/Vorbis support). Detect once and prefer the smallest
// format the browser actually supports.
let _preferredAudioExt: 'ogg' | 'm4a' | 'wav' | null = null;
function preferredAudioExt(): 'ogg' | 'm4a' | 'wav' {
  if (_preferredAudioExt) return _preferredAudioExt;
  try {
    const probe = document.createElement('audio');
    if (probe.canPlayType('audio/ogg; codecs="vorbis"') === 'probably') {
      _preferredAudioExt = 'ogg';
    } else if (probe.canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '') {
      _preferredAudioExt = 'm4a';
    } else {
      _preferredAudioExt = 'wav';
    }
  } catch {
    _preferredAudioExt = 'wav';
  }
  return _preferredAudioExt;
}

function audioSrc(basePath: string): string {
  return `${basePath}.${preferredAudioExt()}`;
}

function audioFallbackSrc(basePath: string): string {
  return `${basePath}.wav`;
}

function loadSavedLevels(): AudioLevels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  // Section 42 AUDIO MIX: ambience should sit above music, music should sit at a level where
  // "you only notice it once you turn it off" -- these are the recommended relative gains
  // converted onto this engine's existing 0..1 per-channel scale.
  return { master: 0.7, music: 0.18, ambience: 0.24, sfx: 0.32, muted: false };
}

class AudioManager {
  private levels: AudioLevels = loadSavedLevels();
  private bgmEl: HTMLAudioElement | null = null;
  private nextBgmEl: HTMLAudioElement | null = null;
  private currentBgm: BgmName | null = null;
  private ambienceEl: HTMLAudioElement | null = null;
  private currentAmbience: AmbienceName | null = null;
  private duckTimer: number | null = null;
  private musicDuckTimer: number | null = null;
  private fadeTimer: number | null = null;
  private isCrossfading = false;
  private bgmCrossfadeTimer: number | null = null;
  private pendingBgmName: BgmName | null = null;
  // Bumped by every stopBgm()/fadeOutBgm(). A crossfade in flight captures the token at
  // start and checks it before committing its final state -- if a stop/fade-out happened
  // mid-crossfade, the in-flight one abandons instead of reviving music after silence was
  // explicitly requested (and instead of leaving isCrossfading stuck true forever, which
  // would otherwise silently swallow every later playBgm() call).
  private playToken = 0;
  // Per-track relative gain (section 33 MUSIC 02: "很低音量") -- applied on top of the
  // music channel volume, remembered so setLevels() (master/channel slider moves) keeps
  // respecting it for whichever track is currently playing.
  private bgmVolumeMultiplier = 1;

  setLevels(next: Partial<AudioLevels>): void {
    this.levels = { ...this.levels, ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.levels));
    } catch {
      /* ignore */
    }

    if (this.bgmEl) {
      this.bgmEl.volume = this.effectiveVolume(this.levels.music) * this.bgmVolumeMultiplier;
      this.bgmEl.muted = this.levels.muted;
    }
    if (this.ambienceEl) {
      this.ambienceEl.volume = this.effectiveVolume(this.levels.ambience);
      this.ambienceEl.muted = this.levels.muted;
    }
  }

  getLevels(): AudioLevels {
    return this.levels;
  }

  getCurrentBgm(): BgmName | null {
    return this.currentBgm;
  }

  private effectiveVolume(channel: number): number {
    if (this.levels.muted) return 0;
    return Math.max(0, Math.min(1, this.levels.master * channel));
  }

  private cancelBgmTransition(restoreCurrent = true): void {
    if (this.bgmCrossfadeTimer !== null) {
      window.clearInterval(this.bgmCrossfadeTimer);
      this.bgmCrossfadeTimer = null;
    }
    if (this.nextBgmEl) {
      this.nextBgmEl.pause();
      this.nextBgmEl = null;
    }
    this.pendingBgmName = null;
    this.isCrossfading = false;
    if (restoreCurrent && this.bgmEl) {
      this.bgmEl.volume = this.effectiveVolume(this.levels.music) * this.bgmVolumeMultiplier;
      this.bgmEl.muted = this.levels.muted;
    }
  }

  /** Play BGM with smooth crossfading. Section 43: 800-1200ms crossfade, never a hard cut.
   * `volumeMultiplier` implements section 33's per-track relative gain (MUSIC 02 Research is
   * explicitly "很低音量" relative to the other four locked tracks). */
  playBgm(name: BgmName, crossfadeMs = 900, volumeMultiplier = 1): void {
    if (this.currentBgm === name && this.bgmEl) {
      if (!this.isCrossfading && !this.nextBgmEl) return;
      this.playToken++;
      this.cancelBgmTransition();
      return;
    }
    // Own the pending slot before touching play(). A second scene transition can therefore
    // cancel/replace this request even while the browser is still resolving its play promise.
    if (this.pendingBgmName === name && this.nextBgmEl) return;
    if (this.fadeTimer) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
      if (this.bgmEl) {
        this.bgmEl.volume = this.effectiveVolume(this.levels.music) * this.bgmVolumeMultiplier;
      }
    }

    const myToken = ++this.playToken;
    this.cancelBgmTransition();

    try {
      const newEl = new Audio(audioSrc(`/audio/bgm/${name}`));
      newEl.addEventListener(
        'error',
        () => {
          if (!newEl.src.endsWith('.wav')) newEl.src = audioFallbackSrc(`/audio/bgm/${name}`);
        },
        { once: true }
      );
      newEl.loop = true;
      const targetVol = this.effectiveVolume(this.levels.music) * volumeMultiplier;
      newEl.volume = 0;
      newEl.muted = this.levels.muted;
      this.nextBgmEl = newEl;
      this.pendingBgmName = name;
      // The lock is deliberately set before play(): play() may resolve asynchronously, and
      // another state transition must be able to cancel this owner instead of starting a stack.
      this.isCrossfading = true;

      const playPromise = newEl.play();
      const finishRejectedPlay = () => {
        // Audio autoplay blocked by browser policy until user interaction. Keep a first
        // rejected request retryable when there was no previous track, but never replace a
        // currently audible track with an element that never started.
        if (this.playToken !== myToken || this.nextBgmEl !== newEl) return;
        newEl.pause();
        if (!this.bgmEl) {
          this.bgmEl = newEl;
          this.currentBgm = name;
          this.bgmVolumeMultiplier = volumeMultiplier;
        }
        this.nextBgmEl = null;
        this.pendingBgmName = null;
        this.isCrossfading = false;
      };

      const startCrossfade = () => {
        if (this.playToken !== myToken || this.nextBgmEl !== newEl) {
          newEl.pause();
          return;
        }

        const oldEl = this.bgmEl;
        const oldStartVol = oldEl ? oldEl.volume : 0;
        const stepMs = 50;
        const steps = Math.max(1, Math.ceil(crossfadeMs / stepMs));
        let currentStep = 0;

        this.bgmCrossfadeTimer = window.setInterval(() => {
          currentStep++;
          const progress = Math.min(1, currentStep / steps);

          if (this.playToken !== myToken || this.nextBgmEl !== newEl) {
            if (this.bgmCrossfadeTimer !== null) {
              window.clearInterval(this.bgmCrossfadeTimer);
              this.bgmCrossfadeTimer = null;
            }
            newEl.pause();
            this.isCrossfading = false;
            return;
          }

          newEl.volume = targetVol * progress;
          if (oldEl) {
            oldEl.volume = oldStartVol * (1 - progress);
          }

          if (currentStep >= steps) {
            if (this.bgmCrossfadeTimer !== null) {
              window.clearInterval(this.bgmCrossfadeTimer);
              this.bgmCrossfadeTimer = null;
            }
            if (oldEl) {
              oldEl.pause();
            }
            this.bgmEl = newEl;
            this.currentBgm = name;
            this.bgmVolumeMultiplier = volumeMultiplier;
            this.nextBgmEl = null;
            this.pendingBgmName = null;
            this.isCrossfading = false;
          }
        }, stepMs);
      };

      // Promise.resolve also handles browsers/test doubles whose play() returns undefined.
      void Promise.resolve(playPromise).then(startCrossfade, finishRejectedPlay);
    } catch {
      // A synchronous play() failure must release the same ownership lock as a rejected
      // promise; otherwise every later scene request would be treated as a phantom transition.
      if (this.playToken === myToken) this.cancelBgmTransition();
    }
  }

  stopBgm(): void {
    this.playToken++;
    if (this.fadeTimer) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.cancelBgmTransition(false);
    if (this.bgmEl) {
      this.bgmEl.pause();
      this.bgmEl = null;
      this.currentBgm = null;
    }
  }

  /** Fades the current BGM to silence over `ms` instead of a hard stop -- used whenever a scene
   * has no locked music of its own (section 34 NO MUSIC STATES) so leaving a music scene never
   * sounds like a cut. No-op if nothing is playing. */
  fadeOutBgm(ms = 700): void {
    this.playToken++; // invalidates any in-flight playBgm() awaiting its play() promise
    if (!this.bgmEl || this.isCrossfading) {
      this.stopBgm();
      return;
    }
    if (this.fadeTimer) window.clearInterval(this.fadeTimer);
    const el = this.bgmEl;
    const startVol = el.volume;
    const stepMs = 50;
    const steps = Math.max(1, Math.floor(ms / stepMs));
    let step = 0;
    this.fadeTimer = window.setInterval(() => {
      step++;
      el.volume = Math.max(0, startVol * (1 - step / steps));
      if (step >= steps) {
        if (this.fadeTimer) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        el.pause();
        if (this.bgmEl === el) {
          this.bgmEl = null;
          this.currentBgm = null;
        }
      }
    }, stepMs);
  }

  /** Ducks background ambience down during critical speech/news and restores smoothly.
   * Ambience never disappears entirely (section 44). */
  duckAmbience(duckFactor = 0.3, durationMs = 1800): void {
    if (!this.ambienceEl || this.levels.muted) return;
    const originalVol = this.effectiveVolume(this.levels.ambience);
    this.ambienceEl.volume = originalVol * duckFactor;

    if (this.duckTimer) window.clearTimeout(this.duckTimer);
    this.duckTimer = window.setTimeout(() => {
      if (this.ambienceEl && !this.levels.muted) {
        this.ambienceEl.volume = originalVol;
      }
    }, durationMs);
  }

  /** Ducks the current BGM (not ambience) by ~25-35% for an important phone/critical event,
   * restoring after `durationMs` (section 44). Used by the Margin Call sequence. */
  duckMusic(duckFactor = 0.7, durationMs = 1800): void {
    if (!this.bgmEl || this.levels.muted) return;
    const originalVol = this.effectiveVolume(this.levels.music);
    this.bgmEl.volume = originalVol * duckFactor;

    if (this.musicDuckTimer) window.clearTimeout(this.musicDuckTimer);
    this.musicDuckTimer = window.setTimeout(() => {
      if (this.bgmEl && !this.levels.muted) {
        this.bgmEl.volume = originalVol;
      }
    }, durationMs);
  }

  playSfx(name: SfxName, volumeMultiplier = 1): void {
    if (this.levels.muted) return;
    try {
      const el = new Audio(`/audio/sfx/${name}.wav`);
      el.volume = Math.max(0, Math.min(1, this.effectiveVolume(this.levels.sfx) * volumeMultiplier));
      void el.play().catch(() => {
        const fallback = new Audio(`/assets/audio/sfx/${name}.wav`);
        fallback.volume = el.volume;
        void fallback.play().catch(() => {});
      });
    } catch {
      /* non-fatal */
    }
  }

  playAmbience(name: AmbienceName): void {
    if (this.currentAmbience === name && this.ambienceEl) return;
    this.stopAmbience();
    try {
      const el = new Audio(audioSrc(`/audio/ambience/${name}`));
      el.addEventListener(
        'error',
        () => {
          if (!el.src.endsWith('.wav')) el.src = audioFallbackSrc(`/audio/ambience/${name}`);
        },
        { once: true }
      );
      el.loop = true;
      el.volume = this.effectiveVolume(this.levels.ambience);
      el.muted = this.levels.muted;
      void el.play().catch(() => {
        const fallback = new Audio(`/assets/audio/ambience/${name}.wav`);
        fallback.loop = true;
        fallback.volume = this.effectiveVolume(this.levels.ambience);
        fallback.muted = this.levels.muted;
        void fallback.play().catch(() => {});
        this.ambienceEl = fallback;
      });
      this.ambienceEl = el;
      this.currentAmbience = name;
    } catch {
      /* non-fatal */
    }
  }

  stopAmbience(): void {
    if (this.ambienceEl) {
      this.ambienceEl.pause();
      this.ambienceEl = null;
      this.currentAmbience = null;
    }
  }

  /** Called once on the page's first real user gesture (touchstart/click/keydown) to retry
   * any BGM/ambience whose initial autoplay was blocked by browser policy (iOS Safari in
   * particular refuses to play audio with no prior user interaction at all). */
  resumeAfterUserGesture(): void {
    if (this.levels.muted) return;
    if (this.bgmEl && this.bgmEl.paused) {
      this.bgmEl.volume = this.effectiveVolume(this.levels.music) * this.bgmVolumeMultiplier;
      void this.bgmEl.play().catch(() => {});
    }
    if (this.ambienceEl && this.ambienceEl.paused) {
      this.ambienceEl.volume = this.effectiveVolume(this.levels.ambience);
      void this.ambienceEl.play().catch(() => {});
    }
  }
}

export const audioManager = new AudioManager();

// iOS Safari (and other mobile browsers) block audio autoplay until a real user gesture.
// playBgm()/playAmbience() already swallow the rejected play() promise instead of crashing,
// but that means the very first BGM pick (typically the main menu theme, chosen before any
// click has happened) can end up silently never playing. Retry once on the first genuine
// user gesture so audio actually starts instead of staying silent all game.
if (typeof window !== 'undefined') {
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    audioManager.resumeAfterUserGesture();
    window.removeEventListener('touchstart', unlock);
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('touchstart', unlock, { once: true, passive: true });
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Every incoming story/intel event uses the same routine notification cue -- the locked
 * manifest's sfx_notification is documented for exactly this ("normal intel ... new message").
 * No locked asset exists for a distinct "this one is MNPI-flagged" danger cue, so this
 * deliberately does not fabricate one; the compliance-relevant framing is carried entirely by
 * the on-screen text, matching section 35's "text carries the emotion" principle. */
export function sfxForIntelClass(_intelClass: string): SfxName {
  return 'sfx_notification';
}
