import { useEffect, useState } from 'react';

/**
 * 装饰动效的统一开关（2026-08-19 claude）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────────
 *
 * CSS 里的 `:root[data-motion="reduced"]` 只能杀掉 CSS 动画。本作有六个
 * canvas / WebGL 特效组件（Particles、LiquidEther、FinancialParticleNetwork…），
 * 它们的运动来自 requestAnimationFrame 里的时间累加，**CSS 规则一点都管不到**。
 *
 * 结果是：外观面板上写着「关闭粒子漂移与呼吸光」，玩家勾上之后画面照样在动。
 * 这不是纯粹的观感问题——减少动效是无障碍功能，晕动症玩家是真的需要它。
 *
 * 这个洞是靠 `tools/probe_reduced_motion.mjs` 连采两帧截屏做差抓出来的。
 * 读 CSS 里的 animation-duration 抓不到它，因为根本没有 CSS 动画参与。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *
 * 在动画循环里把时间增量乘上去即可，返回 0 时画面自然冻结在原地：
 *
 *     const motion = useMotionScale();
 *     elapsed += delta * speed * motion;
 *
 * 冻结而不是卸载，是刻意的：卸载会让画面在勾选的瞬间突然少一层，
 * 颜色与构图都变了；冻结则保留全部信息与颜色，只是不再移动——
 * 这正是外观面板上对玩家的原话。
 */

const SPEED_TOKEN = '--thm-particle-speed';

/** 读一个 --thm-* 数值 token。导出给同样要读 token 的粒子组件复用，
 *  免得两处各写一份、将来改名时漏掉一处。 */
export function cssNum(name: string, fallback: number): number {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return fallback;
  try {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** 读一个 --thm-* 颜色/字符串 token。 */
export function cssStr(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return fallback;
  try {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return raw || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 主题变更计数器（2026-08-19 claude）
 *
 * 给**吃不了 CSS 变量的画布库**用。lightweight-charts 的颜色只能传 JS 字面值，
 * 传 `var(--thm-accent)` 进去它不认——所以主图在三套主题下一直是同一支霓虹青，
 * 评审的原话是「会让主题像只换了边框」。
 *
 * 解法是在主题变更时重新读 token 再喂给图表。这个 hook 只负责告诉调用方
 * 「换主题了，去重读」，具体读哪些 token 由调用方决定。
 */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver(() => setTick((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return tick;
}

function readMotionScale(): number {
  return cssNum(SPEED_TOKEN, 1);
}

export function useMotionScale(): number {
  const [scale, setScale] = useState(readMotionScale);

  useEffect(() => {
    if (typeof MutationObserver !== 'function') return;
    // 不每帧读 getComputedStyle：读计算样式会强制样式重算，60fps 下实打实掉帧。
    // 主题与减少动效一次会话只切几次，观察 <html> 上的属性变化就够。
    const obs = new MutationObserver(() => {
      const next = readMotionScale();
      setScale((prev) => (prev === next ? prev : next));
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-motion'],
    });
    return () => obs.disconnect();
  }, []);

  return scale;
}
