import { useEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

type FieldTheme = 'neon' | 'amber' | 'calm';

interface FieldNode {
  x: number;
  y: number;
  z: number;
  size: number;
  energy: 1 | 2 | 3;
  tone: 0 | 1;
  phase: number;
  lane: number;
  anchor: number;
}

interface FieldEdge {
  from: number;
  to: number;
  alpha: number;
  tone: number;
}

export interface MarketFieldSample {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
  /** Network-local x / width from lightweight-charts timeToCoordinate(). */
  projectedX?: number;
}

interface MarketFieldProfile {
  price: number[];
  range: number[];
  volume: number[];
  activity: number[];
  direction: Array<0 | 1>;
  timelineX: number[];
  projectedCount: number;
  projectionSource: 'lightweight-charts-timeToCoordinate' | 'market-time-fallback';
  visibilityPairs: Array<readonly [number, number]>;
  visibleAnchors: Set<string>;
}

interface MarketFieldSpinePoint {
  x: number;
  y: number;
  z: number;
}

export interface MarketFieldTopology {
  nodes: FieldNode[];
  edges: FieldEdge[];
  spines: MarketFieldSpinePoint[][];
  signature: string;
  projectionSource: 'lightweight-charts-timeToCoordinate' | 'market-time-fallback' | 'static-fallback';
  projectionState: 'empty' | 'ready' | 'degraded';
  projectedBarCount: number;
  gateAnchor: number | null;
  gateX: number | null;
}

interface FieldPalette {
  primary: readonly [number, number, number];
  secondary: readonly [number, number, number];
  hot: readonly [number, number, number];
  tissuePrimary: readonly [number, number, number];
  tissueSecondary: readonly [number, number, number];
  spine: readonly [number, number, number];
  bloom: number;
}

const FIELD_PALETTES: Record<FieldTheme, FieldPalette> = {
  neon: {
    primary: [0.05, 0.78, 1.18],
    secondary: [0.62, 0.30, 1.26],
    hot: [2.75, 3.05, 3.35],
    tissuePrimary: [0.04, 0.35, 0.48],
    tissueSecondary: [0.24, 0.14, 0.48],
    spine: [1.55, 0.72, 2.25],
    bloom: 1.22,
  },
  amber: {
    primary: [0.08, 0.65, 0.76],
    secondary: [1.18, 0.55, 0.12],
    hot: [3.20, 2.62, 1.34],
    tissuePrimary: [0.04, 0.30, 0.35],
    tissueSecondary: [0.40, 0.22, 0.05],
    spine: [1.85, 0.88, 0.18],
    bloom: 1.02,
  },
  calm: {
    primary: [0.16, 0.58, 0.66],
    secondary: [0.26, 0.42, 0.70],
    hot: [1.72, 2.08, 2.18],
    tissuePrimary: [0.06, 0.24, 0.28],
    tissueSecondary: [0.09, 0.18, 0.30],
    spine: [0.62, 0.88, 1.08],
    bloom: 0.58,
  },
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function staticSpineY(lane: number, x: number): number {
  const t = (x + 1) * 0.5;
  if (lane === 0) {
    return Math.sin((t * Math.PI * 2.18) + 0.35) * 0.31 + (t - 0.5) * 0.18;
  }
  if (lane === 1) {
    return Math.sin((t * Math.PI * 1.72) + 2.05) * 0.30 - 0.03;
  }
  return Math.cos((t * Math.PI * 2.42) + 0.76) * 0.25 - (t - 0.5) * 0.24;
}

function interpolate(values: readonly number[], t: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const cursor = clamp(t, 0, 1) * (values.length - 1);
  const low = Math.floor(cursor);
  const high = Math.min(values.length - 1, low + 1);
  const mix = cursor - low;
  return values[low] * (1 - mix) + values[high] * mix;
}

function smooth(values: readonly number[]): number[] {
  if (values.length < 3) return [...values];
  return values.map((value, index) => {
    const before = values[Math.max(0, index - 1)];
    const after = values[Math.min(values.length - 1, index + 1)];
    return before * 0.2 + value * 0.6 + after * 0.2;
  });
}

export function buildNaturalVisibilityPairs(
  values: readonly number[],
  times: readonly number[],
): Array<readonly [number, number]> {
  const pairs: Array<readonly [number, number]> = [];
  for (let from = 0; from < values.length - 1; from += 1) {
    let steepestIntermediate = Number.NEGATIVE_INFINITY;
    for (let to = from + 1; to < values.length; to += 1) {
      const elapsed = times[to] - times[from];
      if (!(elapsed > 0)) continue;
      const slope = (values[to] - values[from]) / elapsed;
      // This is the Natural Visibility Graph criterion in its incremental
      // slope form: every intermediate point must stay below the sight line.
      if (slope > steepestIntermediate + 1e-12) pairs.push([from, to]);
      steepestIntermediate = Math.max(steepestIntermediate, slope);
    }
  }
  return pairs;
}

function topologySignature(
  nodes: readonly FieldNode[],
  edges: readonly FieldEdge[],
  spines: readonly MarketFieldSpinePoint[][],
): string {
  let hash = 0x811c9dc5;
  const feed = (value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  nodes.forEach((node) => feed(`${node.x.toFixed(4)},${node.y.toFixed(4)},${node.anchor};`));
  edges.forEach((edge) => feed(`${edge.from}:${edge.to};`));
  spines[1]?.forEach((point) => feed(`${point.y.toFixed(4)};`));
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildProfile(samples: readonly MarketFieldSample[]): MarketFieldProfile | null {
  const admitted = samples
    .map((sample) => {
      const close = Number(sample.close);
      if (!Number.isFinite(close) || close <= 0) return null;
      const openValue = Number(sample.open);
      const highValue = Number(sample.high);
      const lowValue = Number(sample.low);
      const open = Number.isFinite(openValue) && openValue > 0 ? openValue : close;
      const high = Number.isFinite(highValue) && highValue > 0 ? Math.max(highValue, open, close) : Math.max(open, close);
      const low = Number.isFinite(lowValue) && lowValue > 0 ? Math.min(lowValue, open, close) : Math.min(open, close);
      const volumeValue = Number(sample.volume ?? 0);
      const volume = Number.isFinite(volumeValue) && volumeValue > 0 ? volumeValue : null;
      const projectedValue = Number(sample.projectedX);
      const projectedX = Number.isFinite(projectedValue) ? projectedValue : null;
      return { time: sample.time, open, high, low, close, volume, projectedX };
    })
    .filter((sample): sample is NonNullable<typeof sample> => sample !== null);

  if (admitted.length === 0) return null;

  // Every profile anchor is one admitted bar. Do not insert a synthetic open
  // timestamp: the first bar's open can influence return intensity without
  // pretending that an extra market time exists before the first reveal.
  const baseline = admitted[0].open;
  const rawPriceAnchors = admitted.map((sample) => sample.close);
  const priceAnchors = admitted.map((sample, index) => {
    const reference = index === 0 ? sample.open : baseline;
    return clamp(Math.tanh(Math.log(sample.close / reference) * 10.5), -1, 1);
  });
  const rawRanges = admitted.map((sample) => Math.max(0, (sample.high - sample.low) / sample.open));
  const rangeAnchors = rawRanges.map((value) => clamp(Math.tanh(value * 18), 0, 1));
  const rawReturns = admitted.map((sample) => Math.abs(sample.close - sample.open) / sample.open);

  const logVolumes = admitted.map((sample) => sample.volume === null ? null : Math.log1p(sample.volume));
  const knownVolumes = logVolumes.filter((value): value is number => value !== null);
  const minVolume = knownVolumes.length > 0 ? Math.min(...knownVolumes) : 0;
  const maxVolume = knownVolumes.length > 0 ? Math.max(...knownVolumes) : 0;
  const volumeSpan = maxVolume - minVolume;
  const volume = logVolumes.map((value) => {
    if (value === null || maxVolume <= 0) return 0;
    return volumeSpan > 1e-6 ? (value - minVolume) / volumeSpan : 0.55;
  });
  const maxReturn = Math.max(...rawReturns, 1e-9);
  const maxRange = Math.max(...rawRanges, 1e-9);
  const activity = admitted.map((sample, index) => {
    const returnSignal = rawReturns[index] / maxReturn;
    const rangeSignal = rawRanges[index] / maxRange;
    let weighted = returnSignal * 0.36 + rangeSignal * 0.28;
    let weight = 0.64;
    if (sample.volume !== null) {
      weighted += volume[index] * 0.36;
      weight += 0.36;
    }
    return clamp(weighted / weight, 0, 1);
  });
  const direction = admitted.map((sample): 0 | 1 => sample.close >= sample.open ? 0 : 1);

  const parsedTimes = admitted.map((sample) => Date.parse(sample.time));
  const useClockTime = parsedTimes.every((time, index) => (
    Number.isFinite(time) && (index === 0 || time > parsedTimes[index - 1])
  ));
  const fallbackTimes = useClockTime ? parsedTimes : admitted.map((_, index) => index);
  const startTime = fallbackTimes[0];
  const timeSpan = fallbackTimes[fallbackTimes.length - 1] - startTime || 1;
  const normalizedTimes = fallbackTimes.map((time) => (time - startTime) / timeSpan);
  const projectedCount = admitted.filter((sample) => sample.projectedX !== null).length;
  const fullyProjected = projectedCount === admitted.length;
  const timelineX = fullyProjected
    ? admitted.map((sample) => sample.projectedX as number)
    : normalizedTimes;
  const visibilityPairs = buildNaturalVisibilityPairs(
    rawPriceAnchors.map((price) => Math.log(price)),
    normalizedTimes,
  );

  return {
    price: smooth(priceAnchors),
    range: smooth(rangeAnchors),
    volume: smooth(volume),
    activity: smooth(activity),
    direction,
    timelineX,
    projectedCount,
    projectionSource: fullyProjected ? 'lightweight-charts-timeToCoordinate' : 'market-time-fallback',
    visibilityPairs,
    visibleAnchors: new Set(visibilityPairs.map(([from, to]) => `${from}:${to}`)),
  };
}

function projectedTimeline(
  profile: MarketFieldProfile | null,
  quantile: number,
): { x: number; sampleT: number; anchor: number } {
  if (!profile || profile.timelineX.length === 0) return { x: quantile, sampleT: quantile, anchor: 0 };
  if (profile.timelineX.length === 1) return { x: profile.timelineX[0], sampleT: 0, anchor: 0 };
  const cursor = clamp(quantile, 0, 1) * (profile.timelineX.length - 1);
  const low = Math.floor(cursor);
  const high = Math.min(profile.timelineX.length - 1, low + 1);
  const mix = cursor - low;
  return {
    x: profile.timelineX[low] * (1 - mix) + profile.timelineX[high] * mix,
    sampleT: cursor / (profile.timelineX.length - 1),
    anchor: Math.round(cursor),
  };
}

function sampleTimeAtScreenX(profile: MarketFieldProfile, screenX: number): number {
  const values = profile.timelineX;
  if (values.length < 2) return 0;
  if (screenX <= values[0]) return 0;
  if (screenX >= values[values.length - 1]) return 1;
  let segment = 0;
  while (segment < values.length - 2 && screenX > values[segment + 1]) segment += 1;
  const low = values[segment];
  const high = values[segment + 1];
  const within = high > low ? (screenX - low) / (high - low) : 0;
  return (segment + clamp(within, 0, 1)) / (values.length - 1);
}

function spineY(lane: number, x: number, profile: MarketFieldProfile | null): number {
  if (!profile) return staticSpineY(lane, x);
  const screenX = clamp((x + 1) / 2, 0, 1);
  const t = sampleTimeAtScreenX(profile, screenX);
  const price = interpolate(profile.price, t);
  const range = interpolate(profile.range, t);
  const volume = interpolate(profile.volume, t);
  const prior = interpolate(profile.price, Math.max(0, t - 0.045));
  const next = interpolate(profile.price, Math.min(1, t + 0.045));
  const slope = next - prior;
  const center = clamp(price * 0.52 + slope * 0.16, -0.61, 0.61);
  const envelope = 0.13 + range * 0.105 + volume * 0.075;
  if (lane === 0) return clamp(center + envelope + slope * 0.06, -0.82, 0.82);
  if (lane === 1) return center;
  return clamp(center - envelope - slope * 0.06, -0.82, 0.82);
}

export function buildMarketFieldTopology(samples: readonly MarketFieldSample[]): MarketFieldTopology {
  const profile = buildProfile(samples);
  const random = seededRandom(0x66301679);
  const nodes: FieldNode[] = [];

  for (let index = 0; index < 228; index += 1) {
    // Reserve the final node as the current gate: it is always anchored to the
    // final revealed bar. All other tissue samples interpolate between canonical
    // chart coordinates, never between uniform or volume-weighted fake times.
    const timeline = projectedTimeline(profile, profile && index === 227 ? 1 : random());
    const x = -1 + timeline.x * 2;
    const lanePick = random();
    const lane = lanePick < 0.39 ? 0 : lanePick < 0.72 ? 1 : 2;
    const freeNode = index % 11 === 0;
    const y = freeNode
      ? profile
        ? clamp(spineY(lane, x, profile) + (random() - 0.5) * 0.76, -0.88, 0.88)
        : -0.84 + random() * 1.68
      : clamp(spineY(lane, x, profile) + (random() + random() - 1) * 0.22, -0.88, 0.88);
    const activity = profile ? interpolate(profile.activity, timeline.sampleT) : random();
    const energy: 1 | 2 | 3 = activity >= 0.72 ? 3 : activity >= 0.38 ? 2 : 1;
    const size = profile
      ? 1.25 + activity * 6.15
      : energy === 3 ? 6.4 + random() * 2.8 : energy === 2 ? 3.0 + random() * 1.9 : 1.25 + random() * 1.15;

    nodes.push({
      x,
      y,
      z: -0.08 + random() * 0.16,
      size,
      energy,
      tone: profile ? profile.direction[timeline.anchor] : (lane === 2 || index % 13 === 0 ? 1 : 0),
      phase: random() * Math.PI * 2,
      lane,
      anchor: profile ? timeline.anchor : 0,
    });
  }

  const edges: FieldEdge[] = [];
  const seen = new Set<string>();
  for (let from = 0; from < nodes.length; from += 1) {
    const source = nodes[from];
    const candidates = nodes
      .map((target, to) => {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const lanePenalty = target.lane === source.lane ? 0 : 0.012;
        return { to, distance2: (dx * dx * 1.55) + (dy * dy) + lanePenalty };
      })
      .filter(({ to }) => {
        if (to === from) return false;
        if (!profile) return true;
        const targetAnchor = nodes[to].anchor;
        const lowAnchor = Math.min(source.anchor, targetAnchor);
        const highAnchor = Math.max(source.anchor, targetAnchor);
        return lowAnchor === highAnchor || profile.visibleAnchors.has(`${lowAnchor}:${highAnchor}`);
      })
      .sort((a, b) => a.distance2 - b.distance2);
    const targetCount = source.energy === 3 ? 5 : source.energy === 2 ? 4 : 3;
    let connected = 0;

    for (const candidate of candidates) {
      if (candidate.distance2 > 0.15 || connected >= targetCount) break;
      const low = Math.min(from, candidate.to);
      const high = Math.max(from, candidate.to);
      const key = `${low}:${high}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const distance = Math.sqrt(candidate.distance2);
      edges.push({
        from,
        to: candidate.to,
        alpha: clamp(0.10 + (1 - distance / Math.sqrt(0.15)) * 0.20 + (source.energy - 1) * 0.025, 0.09, 0.34),
        tone: source.tone === nodes[candidate.to].tone ? source.tone : 0.5,
      });
      connected += 1;
    }
  }

  if (profile) {
    const representative = (anchor: number, lane: number): number => {
      const expectedX = -1 + profile.timelineX[anchor] * 2;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      nodes.forEach((node, index) => {
        const lanePenalty = node.lane === lane ? 0 : 0.24;
        const anchorPenalty = Math.abs(node.anchor - anchor) * 0.18;
        const distance = Math.abs(node.x - expectedX) + lanePenalty + anchorPenalty;
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      return best;
    };

    // Local tissue remains dense, but these bounded bridge edges are the part
    // whose adjacency is dictated directly by the admitted close series.
    const bridges = profile.visibilityPairs
      .filter(([from, to]) => to - from > 1)
      .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))
      .slice(0, 96);
    bridges.forEach(([fromAnchor, toAnchor], bridgeIndex) => {
      const lane = bridgeIndex % 3;
      const from = representative(fromAnchor, lane);
      const to = representative(toAnchor, lane);
      if (from === to) return;
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const key = `${low}:${high}`;
      if (seen.has(key)) return;
      seen.add(key);
      const span = (toAnchor - fromAnchor) / Math.max(1, profile.price.length - 1);
      edges.push({
        from,
        to,
        alpha: clamp(0.18 + span * 0.11, 0.18, 0.29),
        tone: lane === 2 ? 1 : lane === 1 ? 0.5 : 0,
      });
    });
  }

  const spines: MarketFieldSpinePoint[][] = Array.from({ length: 3 }, (_, lane) => (
    Array.from({ length: 89 }, (__, index) => {
      const x = -1.06 + (index / 88) * 2.12;
      return { x, y: spineY(lane, x, profile), z: 0.04 + lane * 0.01 };
    })
  ));

  return {
    nodes,
    edges,
    spines,
    signature: profile ? topologySignature(nodes, edges, spines) : 'static-fallback',
    projectionSource: profile?.projectionSource ?? 'static-fallback',
    projectionState: !profile
      ? 'empty'
      : profile.projectionSource === 'lightweight-charts-timeToCoordinate'
        ? 'ready'
        : 'degraded',
    projectedBarCount: profile?.projectedCount ?? 0,
    gateAnchor: profile ? profile.timelineX.length - 1 : null,
    gateX: profile ? -1 + profile.timelineX[profile.timelineX.length - 1] * 2 : null,
  };
}

const STATIC_FIELD_TOPOLOGY = buildMarketFieldTopology([]);

export const CENTRAL_MARKET_FIELD_COUNTS = Object.freeze({
  nodes: STATIC_FIELD_TOPOLOGY.nodes.length,
  edges: STATIC_FIELD_TOPOLOGY.edges.length,
  spines: STATIC_FIELD_TOPOLOGY.spines.length,
});

function readTheme(): FieldTheme {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'amber' || theme === 'calm' ? theme : 'neon';
}

function setColor(target: THREE.Color, color: readonly [number, number, number]): void {
  target.setRGB(color[0], color[1], color[2], THREE.LinearSRGBColorSpace);
}

function createNodeGeometry(topology: MarketFieldTopology): THREE.BufferGeometry {
  const { nodes } = topology;
  const positions = new Float32Array(nodes.length * 3);
  const sizes = new Float32Array(nodes.length);
  const energies = new Float32Array(nodes.length);
  const tones = new Float32Array(nodes.length);
  const phases = new Float32Array(nodes.length);

  nodes.forEach((node, index) => {
    const offset = index * 3;
    positions[offset] = node.x;
    positions[offset + 1] = node.y;
    positions[offset + 2] = node.z;
    sizes[index] = node.size;
    energies[index] = node.energy;
    tones[index] = node.tone;
    phases[index] = node.phase;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aEnergy', new THREE.BufferAttribute(energies, 1));
  geometry.setAttribute('aTone', new THREE.BufferAttribute(tones, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

function createEdgeGeometry(topology: MarketFieldTopology): THREE.BufferGeometry {
  const { nodes, edges } = topology;
  const positions = new Float32Array(edges.length * 6);
  const alphas = new Float32Array(edges.length * 2);
  const tones = new Float32Array(edges.length * 2);

  edges.forEach((edge, index) => {
    const from = nodes[edge.from];
    const to = nodes[edge.to];
    const offset = index * 6;
    positions.set([from.x, from.y, from.z, to.x, to.y, to.z], offset);
    alphas[index * 2] = edge.alpha;
    alphas[index * 2 + 1] = edge.alpha;
    tones[index * 2] = edge.tone;
    tones[index * 2 + 1] = edge.tone;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aTone', new THREE.BufferAttribute(tones, 1));
  return geometry;
}

const POINT_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uDpr;
  attribute float aSize;
  attribute float aEnergy;
  attribute float aTone;
  attribute float aPhase;
  varying float vEnergy;
  varying float vTone;
  varying float vPulse;

  void main() {
    vEnergy = aEnergy;
    vTone = aTone;
    vPulse = 0.88 + 0.12 * sin(uTime * (0.62 + aEnergy * 0.07) + aPhase);
    gl_PointSize = aSize * uDpr * (0.92 + vPulse * 0.12);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POINT_FRAGMENT_SHADER = `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  uniform vec3 uHot;
  varying float vEnergy;
  varying float vTone;
  varying float vPulse;

  void main() {
    float radius = distance(gl_PointCoord, vec2(0.5));
    if (radius > 0.5) discard;
    float halo = 1.0 - smoothstep(0.12, 0.5, radius);
    float core = 1.0 - smoothstep(0.0, 0.16, radius);
    float hotMask = step(2.5, vEnergy);
    vec3 base = mix(uPrimary, uSecondary, vTone);
    base = mix(base, uHot, hotMask);
    float gain = vEnergy < 1.5 ? 0.48 : (vEnergy < 2.5 ? 1.05 : 1.95);
    float alpha = (halo * 0.44 + core * 0.82) * (0.42 + vEnergy * 0.18) * vPulse;
    gl_FragColor = vec4(base * gain * (0.62 + core * 0.92), alpha);
  }
`;

const EDGE_VERTEX_SHADER = `
  attribute float aAlpha;
  attribute float aTone;
  varying float vAlpha;
  varying float vTone;

  void main() {
    vAlpha = aAlpha;
    vTone = aTone;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EDGE_FRAGMENT_SHADER = `
  uniform vec3 uPrimary;
  uniform vec3 uSecondary;
  varying float vAlpha;
  varying float vTone;

  void main() {
    gl_FragColor = vec4(mix(uPrimary, uSecondary, vTone), vAlpha);
  }
`;

interface MarketFieldRenderer {
  updateTopology: (topology: MarketFieldTopology) => void;
  dispose: () => void;
}

function setupMarketField(
  canvas: HTMLCanvasElement,
  topology: MarketFieldTopology,
  viewport: HTMLElement,
): MarketFieldRenderer {
  let disposed = false;
  let animationFrame: number | null = null;
  let lastFrame = 0;
  let composer: EffectComposer | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  camera.position.z = 0.5;

  const edgeUniforms = {
    uPrimary: { value: new THREE.Color() },
    uSecondary: { value: new THREE.Color() },
  };
  let edgeGeometry = createEdgeGeometry(topology);
  const edgeMaterial = new THREE.ShaderMaterial({
    uniforms: edgeUniforms,
    vertexShader: EDGE_VERTEX_SHADER,
    fragmentShader: EDGE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.frustumCulled = false;
  edges.renderOrder = 0;
  scene.add(edges);

  const pointUniforms = {
    uTime: { value: 0 },
    uDpr: { value: 1 },
    uPrimary: { value: new THREE.Color() },
    uSecondary: { value: new THREE.Color() },
    uHot: { value: new THREE.Color() },
  };
  let nodeGeometry = createNodeGeometry(topology);
  const nodeMaterial = new THREE.ShaderMaterial({
    uniforms: pointUniforms,
    vertexShader: POINT_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
  nodes.frustumCulled = false;
  nodes.renderOrder = 2;
  scene.add(nodes);

  const spineGeometries: LineGeometry[] = [];
  const spineMaterials: LineMaterial[] = [];
  const spineLines: Line2[] = [];
  topology.spines.forEach((spine, lane) => {
    const curvePoints = spine.flatMap((point) => [point.x, point.y, point.z]);
    const geometry = new LineGeometry();
    geometry.setPositions(curvePoints);
    const material = new LineMaterial({
      linewidth: lane === 1 ? 1.45 : 1.15,
      transparent: true,
      opacity: lane === 1 ? 0.58 : 0.44,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      worldUnits: false,
    });
    material.toneMapped = false;
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 1;
    scene.add(line);
    spineGeometries.push(geometry);
    spineMaterials.push(material);
    spineLines.push(line);
  });

  const bloom = new BloomEffect({
    luminanceThreshold: 0.92,
    luminanceSmoothing: 0.14,
    mipmapBlur: true,
    intensity: FIELD_PALETTES.neon.bloom,
    radius: 0.62,
    levels: 6,
  });

  try {
    composer = new EffectComposer(renderer, {
      depthBuffer: false,
      stencilBuffer: false,
      multisampling: 0,
      frameBufferType: THREE.HalfFloatType,
    });
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, bloom));
  } catch {
    composer?.dispose();
    composer = null;
  }

  const applyTheme = (): void => {
    const palette = FIELD_PALETTES[readTheme()];
    setColor(pointUniforms.uPrimary.value, palette.primary);
    setColor(pointUniforms.uSecondary.value, palette.secondary);
    setColor(pointUniforms.uHot.value, palette.hot);
    setColor(edgeUniforms.uPrimary.value, palette.tissuePrimary);
    setColor(edgeUniforms.uSecondary.value, palette.tissueSecondary);
    spineMaterials.forEach((material, index) => {
      const color = index === 0 ? palette.primary : index === 1 ? palette.spine : palette.secondary;
      setColor(material.color, color);
      material.needsUpdate = true;
    });
    bloom.intensity = palette.bloom;
  };

  const resize = (): boolean => {
    const bounds = viewport.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (width < 2 || height < 2) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.4);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    pointUniforms.uDpr.value = dpr;
    spineMaterials.forEach((material) => material.resolution.set(width, height));
    return true;
  };

  const render = (time: number, delta: number): boolean => {
    pointUniforms.uTime.value = time * 0.001;
    try {
      if (composer) composer.render(delta);
      else renderer.render(scene, camera);
      return true;
    } catch {
      if (composer) {
        composer.dispose();
        composer = null;
        try {
          renderer.render(scene, camera);
          return true;
        } catch {
          // The SVG sibling stays visible when both WebGL paths fail.
        }
      }
      return false;
    }
  };

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = (): void => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };
  const tick = (time: number): void => {
    animationFrame = null;
    if (disposed || document.hidden || motionQuery.matches) return;
    if (time - lastFrame >= 1000 / 30) {
      const delta = lastFrame === 0 ? 0 : Math.min((time - lastFrame) / 1000, 0.1);
      render(time, delta);
      lastFrame = time;
    }
    animationFrame = requestAnimationFrame(tick);
  };
  const start = (): void => {
    if (!disposed && !document.hidden && !motionQuery.matches && animationFrame === null) {
      animationFrame = requestAnimationFrame(tick);
    }
  };

  const renderStaticFrame = (): void => {
    if (resize() && render(performance.now(), 0)) {
      canvas.dataset.webglReady = 'true';
    } else {
      canvas.removeAttribute('data-webgl-ready');
    }
  };
  const updateTopology = (nextTopology: MarketFieldTopology): void => {
    const nextEdgeGeometry = createEdgeGeometry(nextTopology);
    const nextNodeGeometry = createNodeGeometry(nextTopology);
    const nextSpineGeometries = nextTopology.spines.map((spine) => {
      const geometry = new LineGeometry();
      geometry.setPositions(spine.flatMap((point) => [point.x, point.y, point.z]));
      return geometry;
    });

    const oldEdgeGeometry = edgeGeometry;
    const oldNodeGeometry = nodeGeometry;
    const oldSpineGeometries = [...spineGeometries];
    edgeGeometry = nextEdgeGeometry;
    nodeGeometry = nextNodeGeometry;
    edges.geometry = edgeGeometry;
    nodes.geometry = nodeGeometry;
    nextSpineGeometries.forEach((geometry, index) => {
      spineGeometries[index] = geometry;
      spineLines[index].geometry = geometry;
    });
    oldEdgeGeometry.dispose();
    oldNodeGeometry.dispose();
    oldSpineGeometries.forEach((geometry) => geometry.dispose());
    renderStaticFrame();
  };
  const onVisibilityChange = (): void => {
    if (document.hidden) stop();
    else start();
  };
  const onMotionChange = (): void => {
    stop();
    renderStaticFrame();
    start();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    stop();
    canvas.removeAttribute('data-webgl-ready');
  };

  applyTheme();
  renderStaticFrame();
  start();

  const themeObserver = new MutationObserver(() => {
    applyTheme();
    renderStaticFrame();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(renderStaticFrame);
    resizeObserver.observe(viewport);
  } else {
    window.addEventListener('resize', renderStaticFrame);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery.addEventListener('change', onMotionChange);
  canvas.addEventListener('webglcontextlost', onContextLost);

  const dispose = (): void => {
    disposed = true;
    stop();
    canvas.removeAttribute('data-webgl-ready');
    themeObserver.disconnect();
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', renderStaticFrame);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    motionQuery.removeEventListener('change', onMotionChange);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    composer?.dispose();
    edgeGeometry.dispose();
    edgeMaterial.dispose();
    nodeGeometry.dispose();
    nodeMaterial.dispose();
    spineGeometries.forEach((geometry) => geometry.dispose());
    spineMaterials.forEach((material) => material.dispose());
    scene.clear();
    renderer.dispose();
  };

  return { updateTopology, dispose };
}

/**
 * Desktop-only MARKET GRAPH renderer. PriceChartPanel builds one topology from
 * admitted market data and shares it with this canvas and the SVG fallback.
 */
interface CentralMarketFieldProps {
  topology: MarketFieldTopology;
  viewportRef?: RefObject<HTMLElement>;
}

export function CentralMarketField({
  topology,
  viewportRef,
}: CentralMarketFieldProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MarketFieldRenderer | null>(null);
  const latestTopologyRef = useRef(topology);
  const appliedTopologyRef = useRef(topology);
  latestTopologyRef.current = topology;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window.matchMedia !== 'function') return;
    const desktopQuery = window.matchMedia('(min-width: 1280px)');

    const syncRenderer = (): void => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      canvas.removeAttribute('data-webgl-ready');
      if (!desktopQuery.matches) return;
      try {
        const nextTopology = latestTopologyRef.current;
        rendererRef.current = setupMarketField(canvas, nextTopology, viewportRef?.current ?? canvas);
        appliedTopologyRef.current = nextTopology;
      } catch {
        canvas.removeAttribute('data-webgl-ready');
      }
    };

    syncRenderer();
    desktopQuery.addEventListener('change', syncRenderer);
    return () => {
      desktopQuery.removeEventListener('change', syncRenderer);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (appliedTopologyRef.current === topology) return;
    rendererRef.current?.updateTopology(topology);
    appliedTopologyRef.current = topology;
  }, [topology]);

  return (
    <canvas
      ref={canvasRef}
      className="pcp-neural-canvas"
      width="1"
      height="1"
      aria-hidden="true"
      data-testid="central-market-field"
      data-renderer="webgl-threshold-bloom"
      data-size-source={viewportRef ? 'market-field-stage' : 'canvas'}
      data-node-count={topology.nodes.length}
      data-edge-count={topology.edges.length}
      data-spine-count={topology.spines.length}
      data-topology-signature={topology.signature}
      data-time-projection-source={topology.projectionSource}
      data-projection-state={topology.projectionState}
      data-projection-empty-reason={topology.projectionState === 'empty' ? 'no-admitted-bars' : undefined}
      data-projected-bar-count={topology.projectedBarCount}
      data-gate-anchor={topology.gateAnchor ?? undefined}
      data-gate-x={topology.gateX ?? undefined}
    />
  );
}
