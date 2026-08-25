/** Deterministic mulberry32 RNG compatible with backend/app/rng.py. */

const MASK32 = 0xffffffff;

export interface RngSnapshot {
  state: number;
  draws: number;
}

export class SeededRNG {
  state: number;
  draws: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    this.draws = 0;
  }

  next_float(): number {
    this.state = (this.state + 0x6d2b79f5) & MASK32;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.draws += 1;
    return result;
  }

  next_range(lo: number, hi: number): number {
    return lo + this.next_float() * (hi - lo);
  }

  randint(lo: number, hi: number): number {
    return lo + Math.floor(this.next_float() * (hi - lo + 1));
  }

  choice<T>(seq: readonly T[]): T {
    if (seq.length === 0) throw new Error("choice() called on empty sequence");
    return seq[Math.floor(this.next_float() * seq.length) % seq.length];
  }

  shuffled<T>(seq: readonly T[]): T[] {
    const arr = [...seq];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next_float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  weighted_choice<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return this.choice(items);
    const target = this.next_float() * total;
    let upto = 0;
    for (let i = 0; i < Math.min(items.length, weights.length); i += 1) {
      upto += weights[i];
      if (upto >= target) return items[i];
    }
    return items[items.length - 1];
  }

  snapshot(): RngSnapshot {
    return { state: this.state >>> 0, draws: this.draws };
  }

  static from_snapshot(snapshot: RngSnapshot): SeededRNG {
    const rng = new SeededRNG(snapshot.state);
    rng.draws = snapshot.draws ?? 0;
    return rng;
  }
}

