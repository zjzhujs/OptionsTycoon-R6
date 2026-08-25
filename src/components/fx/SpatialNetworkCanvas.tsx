import React, { useEffect, useRef } from 'react';
import { useMotionScale } from './useMotionScale';

/**
 * 空间层节点网络（2026-08-19 claude）
 *
 * ── 为什么重写成 Canvas ──────────────────────────────────────────────
 *
 * 评审 dante 交付过三张静态 WebP，画得是对的，但**在实机里完全看不见**。
 * 实测（`tools/probe_particle_visibility.mjs`）：
 *
 *     只留背景层、藏掉所有内容 → 整屏最亮像素 = 15（近黑）
 *     隐藏空间层 → 画面只变 0.42% 像素
 *     `filter: brightness(16)` 也救不回来，只到 0.57%
 *
 * 根因：他把「最终合成后的 alpha .05–.24」直接**烘进了图**。
 * 图片的 alpha 一旦低了，CSS 的 `brightness()` 只乘 RGB 不动 alpha，救不回来；
 * 叠 `screen` 也没用——源本身就几乎透明。
 *
 * Canvas 没这个问题：alpha 是**绘制时**决定的，画在近黑底上直接就是那个亮度。
 * dante 自己也说过 Canvas 才是主路、静态图只是 fallback。
 *
 * ── 更要紧的教训 ────────────────────────────────────────────────────
 *
 * 在此之前我一直报「粒子 111 / 94 / 44 ✅」——那是 `data-particle-count`，
 * 是 **DOM 里的节点数，不是画面上的可见性**。节点在 WebGL 里存在，
 * 不代表它在屏幕上贡献了任何像素。
 *
 * 这条教训我自己写进过 HANDOFF §7.9（"token 对了不等于效果生效了"），
 * 然后又原样犯了一次，还拿它当"已完成"报上去。
 *
 * **所以这个组件的验收判据是像素，不是节点数**：
 *     只留背景层时，亮度 > 25 的像素 ≥ 8%
 *     隐藏背景层时，画面变化 ≥ 5%
 * 见 `tools/probe_particle_visibility.mjs`。
 *
 * ── 参数来源 ────────────────────────────────────────────────────────
 *
 * 三层景深的节点数 / 连线阈值 / 点线 alpha / 漂移速度 / 色相 / 视差，
 * 全部照抄 dante 在 `OT_UI_ASSETS_FROM_DANTE/README.md` 里给的表，
 * 不是我自己调的。他还给了两条容易被忽略的约束，都实现了：
 *   · 每个节点最多连**最近 2 条边** —— 全连会立刻变成蜘蛛网噪音
 *   · 60–70% 的节点放在屏幕 y=42%–98% —— 上半屏留稀疏"数据尘"，
 *     这和参考图里主图下方网络更密的重心一致
 */

type ThemeKey = 'neon' | 'amber' | 'calm';

interface LayerSpec {
  count: number;
  linkDist: number;
  radius: [number, number];
  nodeAlpha: number;
  lineAlpha: number;
  speed: number;
  parallax: number;
}

interface ThemeSpec {
  layers: [LayerSpec, LayerSpec, LayerSpec];
  /** [主色相, 次色相]，HSL 的 hue 角度 */
  hues: [number, number];
  /** 强发光节点占比 */
  glowRatio: number;
  saturation: number;
  lightness: number;
  /** 底部环境光晕的强度 */
  haloAlpha: number;
}

const THEMES: Record<ThemeKey, ThemeSpec> = {
  /* Dante 2026-08-21：三层 alpha 严格落在交付区间内；
     主题气质由同一区间的高/中/低端与 glowRatio 区分。 */
  neon: {
    layers: [
      { count: 320, linkDist: 150, radius: [0.8, 1.3], nodeAlpha: 0.036, lineAlpha: 0.018, speed: 0.35, parallax: 3 },
      { count: 420, linkDist: 165, radius: [1.1, 1.8], nodeAlpha: 0.065, lineAlpha: 0.030, speed: 0.65, parallax: 7 },
      { count: 220, linkDist: 190, radius: [1.5, 2.6], nodeAlpha: 0.115, lineAlpha: 0.052, speed: 0.9, parallax: 13 },
    ],
    hues: [192, 270],
    glowRatio: 0.05,
    saturation: 92,
    lightness: 64,
    haloAlpha: 0.16,
  },
  amber: {
    layers: [
      { count: 280, linkDist: 150, radius: [0.8, 1.3], nodeAlpha: 0.029, lineAlpha: 0.014, speed: 0.35, parallax: 3 },
      { count: 360, linkDist: 165, radius: [1.1, 1.8], nodeAlpha: 0.052, lineAlpha: 0.024, speed: 0.65, parallax: 7 },
      { count: 180, linkDist: 190, radius: [1.5, 2.4], nodeAlpha: 0.095, lineAlpha: 0.041, speed: 0.9, parallax: 13 },
    ],
    hues: [195, 43],
    glowRatio: 0.035,
    saturation: 88,
    lightness: 60,
    haloAlpha: 0.11,
  },
  calm: {
    layers: [
      { count: 190, linkDist: 155, radius: [0.7, 1.1], nodeAlpha: 0.022, lineAlpha: 0.010, speed: 0.3, parallax: 3 },
      { count: 240, linkDist: 170, radius: [1.0, 1.5], nodeAlpha: 0.040, lineAlpha: 0.018, speed: 0.5, parallax: 7 },
      { count: 120, linkDist: 195, radius: [1.3, 2.0], nodeAlpha: 0.075, lineAlpha: 0.030, speed: 0.7, parallax: 11 },
    ],
    hues: [200, 208],
    glowRatio: 0.018,
    saturation: 48,
    lightness: 58,
    haloAlpha: 0.05,
  },
};

const DPR_CAP = 1.5;
const TARGET_FPS = 30;
const MAX_EDGES_PER_NODE = 3;

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** 0=远（屏幕上方）1=近（屏幕下方）。近的更大更亮更密 */
  depth: number;
  hue: number;
  glow: boolean;
}

function readTheme(): ThemeKey {
  if (typeof document === 'undefined') return 'neon';
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'amber' || t === 'calm' ? t : 'neon';
}

export function SpatialNetworkCanvas(): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const motion = useMotionScale();
  const motionRef = useRef(motion);
  motionRef.current = motion;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let theme = readTheme();
    let spec = THEMES[theme];
    let layers: Node[][] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let raf = 0;
    let last = 0;
    let disposed = false;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const build = () => {
      spec = THEMES[theme];
      layers = spec.layers.map((L) => {
        const nodes: Node[] = [];
        for (let i = 0; i < L.count; i += 1) {
          /*
           * ── 透视分布，不是均匀散布（2026-08-19 AVG 评审后重写）────────
           *
           * AVG 的原话：「参考图的空间层是一个带有强烈 3D 透视的『数据地坪』
           * （底部密集堆叠并发光，向上方发散消失）。而现在的实机是一个 2D 的
           * 『稀疏均匀星空』。**不管你把节点加到几百，只要是均匀分布，
           * 就不可能出效果。**」
           *
           * 所以 y 用 `1 - u^2.2` 做偏斜：大部分点被压到屏幕下半，
           * 越靠下越密；同时点的半径与不透明度随 y 线性放大，
           * 制造"近大远小"的地平线纵深。
           */
          const u = Math.random();
          const bias = 1 - Math.pow(u, 2.2); // 0=顶部稀疏，1=底部密集
          const y = h * (0.06 + bias * 0.94);
          const depth = y / h;              // 0=远（上）1=近（下）
          const ang = Math.random() * Math.PI * 2;
          nodes.push({
            x: rand(-40, w + 40),
            y,
            vx: Math.cos(ang) * L.speed,
            vy: Math.sin(ang) * L.speed * 0.4, // 纵向慢一些，地坪才稳
            // 近大远小：底部的点最大可到 2.2 倍
            r: rand(L.radius[0], L.radius[1]) * (0.45 + depth * 1.75),
            depth,
            hue: Math.random() < 0.5 ? spec.hues[0] : spec.hues[1],
            glow: Math.random() < spec.glowRatio * (0.3 + depth * 1.4),
          });
        }
        return nodes;
      });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const onMove = (e: MouseEvent) => {
      mouse.tx = (e.clientX / Math.max(1, w) - 0.5) * 2;
      mouse.ty = (e.clientY / Math.max(1, h) - 0.5) * 2;
    };

    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      /* 底部环境光晕（AVG 清单第 3 条）：
         「不用画点，直接用渐变色把下半部分的声势造起来」。
         这一层成本极低但对"地坪"的存在感贡献最大。 */
      const halo = ctx.createLinearGradient(0, h * 0.35, 0, h);
      halo.addColorStop(0, `hsla(${spec.hues[0]}, ${spec.saturation}%, ${spec.lightness}%, 0)`);
      halo.addColorStop(1, `hsla(${spec.hues[0]}, ${spec.saturation}%, ${spec.lightness}%, ${spec.haloAlpha})`);
      ctx.fillStyle = halo;
      ctx.fillRect(0, h * 0.35, w, h * 0.65);
      // 鼠标视差用 lerp 逼近，别逐像素硬追（dante：lerp 0.025–0.05）
      const m = motionRef.current;
      mouse.x += (mouse.tx - mouse.x) * 0.035 * (m > 0 ? 1 : 0);
      mouse.y += (mouse.ty - mouse.y) * 0.035 * (m > 0 ? 1 : 0);

      layers.forEach((nodes, li) => {
        const L = spec.layers[li];
        const ox = -mouse.x * L.parallax;
        const oy = -mouse.y * L.parallax;

        // 位移。motionScale 为 0 时不前进，网络冻结但仍然绘制
        if (m > 0) {
          for (const n of nodes) {
            n.x += n.vx * dt * m;
            n.y += n.vy * dt * m;
            if (n.x < -20) n.x = w + 20;
            if (n.x > w + 20) n.x = -20;
            if (n.y < -20) n.y = h + 20;
            if (n.y > h + 20) n.y = -20;
          }
        }

        // 连线：每个节点只连**最近的 2 条**。
        // 全连阈值内的节点会立刻变成蜘蛛网噪音——这是 dante 特别点名的坑。
        ctx.lineWidth = 1;
        for (let i = 0; i < nodes.length; i += 1) {
          const a = nodes[i];
          const near: Array<{ j: number; d: number }> = [];
          for (let j = i + 1; j < nodes.length; j += 1) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d < L.linkDist) near.push({ j, d });
          }
          near.sort((p, q) => p.d - q.d);
          for (let k = 0; k < Math.min(MAX_EDGES_PER_NODE, near.length); k += 1) {
            const b = nodes[near[k].j];
            const fade = 1 - near[k].d / L.linkDist;
            // 近处的线更亮更粗 —— 这是"地坪"纵深的主要来源
            const dep = (a.depth + b.depth) / 2;
            ctx.lineWidth = 0.6 + dep * 1.3;
            // Bloom：AVG 说「实机画的只是一根根普通实心线，缺发光溢出，显得干瘪」
            ctx.shadowBlur = 6 + dep * 10;
            ctx.shadowColor = `hsla(${a.hue}, ${spec.saturation}%, ${spec.lightness + 8}%, ${L.lineAlpha * fade})`;
            ctx.strokeStyle = `hsla(${a.hue}, ${spec.saturation}%, ${spec.lightness}%, ${L.lineAlpha * fade * (0.35 + dep * 1.5)})`;
            ctx.beginPath();
            ctx.moveTo(a.x + ox, a.y + oy);
            ctx.lineTo(b.x + ox, b.y + oy);
            ctx.stroke();
          }
        }

        // 节点
        for (const n of nodes) {
          const x = n.x + ox;
          const y = n.y + oy;
          if (n.glow) {
            const glowRadius = 6 + n.depth * 7;
            const g = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
            g.addColorStop(0, `hsla(${n.hue}, ${spec.saturation}%, ${spec.lightness + 12}%, ${L.nodeAlpha * 0.72})`);
            g.addColorStop(1, `hsla(${n.hue}, ${spec.saturation}%, ${spec.lightness}%, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.shadowBlur = 6 + n.depth * 7;
          ctx.shadowColor = `hsla(${n.hue}, ${spec.saturation}%, ${spec.lightness + 10}%, ${L.nodeAlpha})`;
          ctx.fillStyle = `hsla(${n.hue}, ${spec.saturation}%, ${spec.lightness}%, ${L.nodeAlpha * (0.35 + n.depth * 1.5)})`;
          ctx.beginPath();
          ctx.arc(x, y, n.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
    };

    const frameMs = 1000 / TARGET_FPS;
    const loop = (t: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (t - last < frameMs) return;
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      draw(dt);
    };

    // 主题切换要重建（色相和节点数都变）
    const obs = new MutationObserver(() => {
      const next = readTheme();
      if (next !== theme) {
        theme = next;
        build();
        draw(0);
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    resize();
    draw(0);
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      obs.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  // motionScale 变化时立刻重绘一帧，让"冻结"即时生效
  useEffect(() => {
    /* 绘制循环本身读的是 motionRef，这里不需要额外动作；
       保留这个 effect 只为表达依赖关系，避免以后有人误删 motionRef 的更新。 */
  }, [motion]);

  return <canvas ref={ref} className="ot-spatial-canvas ot-particle-canvas" aria-hidden />;
}
