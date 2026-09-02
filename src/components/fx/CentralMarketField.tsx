import { useEffect, useRef } from 'react';
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
}

interface FieldEdge {
  from: number;
  to: number;
  alpha: number;
  tone: number;
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

function spineY(lane: number, x: number): number {
  const t = (x + 1) * 0.5;
  if (lane === 0) {
    return Math.sin((t * Math.PI * 2.18) + 0.35) * 0.31 + (t - 0.5) * 0.18;
  }
  if (lane === 1) {
    return Math.sin((t * Math.PI * 1.72) + 2.05) * 0.30 - 0.03;
  }
  return Math.cos((t * Math.PI * 2.42) + 0.76) * 0.25 - (t - 0.5) * 0.24;
}

function buildTopology(): { nodes: FieldNode[]; edges: FieldEdge[] } {
  const random = seededRandom(0x66301679);
  const nodes: FieldNode[] = [];

  for (let index = 0; index < 228; index += 1) {
    const x = -1.04 + random() * 2.08;
    const lanePick = random();
    const lane = lanePick < 0.39 ? 0 : lanePick < 0.72 ? 1 : 2;
    const freeNode = index % 11 === 0;
    const y = freeNode
      ? -0.84 + random() * 1.68
      : clamp(spineY(lane, x) + (random() + random() - 1) * 0.22, -0.88, 0.88);
    const energyRoll = random();
    const energy: 1 | 2 | 3 = index % 37 === 0 || energyRoll > 0.965
      ? 3
      : energyRoll > 0.75
        ? 2
        : 1;

    nodes.push({
      x,
      y,
      z: -0.08 + random() * 0.16,
      size: energy === 3 ? 6.4 + random() * 2.8 : energy === 2 ? 3.0 + random() * 1.9 : 1.25 + random() * 1.15,
      energy,
      tone: (lane === 2 || index % 13 === 0 ? 1 : 0),
      phase: random() * Math.PI * 2,
      lane,
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
      .filter(({ to }) => to !== from)
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

  return { nodes, edges };
}

const FIELD_TOPOLOGY = buildTopology();

export const CENTRAL_MARKET_FIELD_COUNTS = Object.freeze({
  nodes: FIELD_TOPOLOGY.nodes.length,
  edges: FIELD_TOPOLOGY.edges.length,
  spines: 3,
});

function readTheme(): FieldTheme {
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'amber' || theme === 'calm' ? theme : 'neon';
}

function setColor(target: THREE.Color, color: readonly [number, number, number]): void {
  target.setRGB(color[0], color[1], color[2], THREE.LinearSRGBColorSpace);
}

function createNodeGeometry(): THREE.BufferGeometry {
  const { nodes } = FIELD_TOPOLOGY;
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

function createEdgeGeometry(): THREE.BufferGeometry {
  const { nodes, edges } = FIELD_TOPOLOGY;
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

function setupMarketField(canvas: HTMLCanvasElement): () => void {
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
  const edgeGeometry = createEdgeGeometry();
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
  const nodeGeometry = createNodeGeometry();
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
  for (let lane = 0; lane < 3; lane += 1) {
    const curvePoints: number[] = [];
    for (let index = 0; index <= 88; index += 1) {
      const x = -1.06 + (index / 88) * 2.12;
      curvePoints.push(x, spineY(lane, x), 0.04 + lane * 0.01);
    }
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
  }

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
    const bounds = canvas.getBoundingClientRect();
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
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener('resize', renderStaticFrame);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  motionQuery.addEventListener('change', onMotionChange);
  canvas.addEventListener('webglcontextlost', onContextLost);

  return () => {
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
}

/**
 * Desktop-only MARKET GRAPH renderer. The deterministic SVG sibling remains
 * mounted as the tablet path and as a no-WebGL/context-loss safety fallback.
 */
export function CentralMarketField(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window.matchMedia !== 'function') return;
    const desktopQuery = window.matchMedia('(min-width: 1280px)');
    let teardown: (() => void) | undefined;

    const syncRenderer = (): void => {
      teardown?.();
      teardown = undefined;
      canvas.removeAttribute('data-webgl-ready');
      if (!desktopQuery.matches) return;
      try {
        teardown = setupMarketField(canvas);
      } catch {
        canvas.removeAttribute('data-webgl-ready');
      }
    };

    syncRenderer();
    desktopQuery.addEventListener('change', syncRenderer);
    return () => {
      desktopQuery.removeEventListener('change', syncRenderer);
      teardown?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pcp-neural-canvas"
      width="1"
      height="1"
      aria-hidden="true"
      data-testid="central-market-field"
      data-renderer="webgl-threshold-bloom"
      data-node-count={CENTRAL_MARKET_FIELD_COUNTS.nodes}
      data-edge-count={CENTRAL_MARKET_FIELD_COUNTS.edges}
      data-spine-count={CENTRAL_MARKET_FIELD_COUNTS.spines}
    />
  );
}
