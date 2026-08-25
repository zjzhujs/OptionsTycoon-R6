import React, { useMemo } from 'react';
import type { RevealedPriceBar } from '../engine/schemas';
import { buildPlayerIntradaySeries } from '../engine/engines/intraday_path';

/**
 * 盘中走势图（2026-08-19 claude）
 *
 * ── 为什么要有它 ────────────────────────────────────────────────────
 *
 * 盘中揭示原来只有一张 OHLC 表格，价格是一小时一跳的。Owner 的原话是
 * 「这个 K 线图为什么不是动态的？简直就是败笔中的败笔」。
 * 这一屏画的就是真实小时锚点之间的推演走势。
 *
 * ── 这条线是什么、不是什么（**改之前先读完**）──────────────────────
 *
 * 两位评审给了同一条硬边界，这里必须守住：
 *
 *   **图表插值层 ≠ 成交价格流。**
 *
 * 这条折线只是**视觉层**。玩家的挂单、成交、盈亏、复盘评分，一律走
 * `game.ts` 里的 `price_snapshot.latest_price`——那是**真实小时收盘价**。
 * 本组件不导出任何取价函数，也不接受任何回调把点位交出去，
 * 就是为了从结构上杜绝"从图上取价成交"这条路。
 *
 * 评审 harv 的原话：「若要严格公平模式，就只能降低粒度到真实已知 bar，
 * 不能提前用未来 H/L/C 约束 tradable path」。我们的选择是：
 * 成交保持小时粒度（真实），视觉补到 2.5 分钟（模拟）。
 *
 * ── 为什么不用图表库 ────────────────────────────────────────────────
 *
 * 这是个全离线单文件产物，CSP `connect-src 'none'`。手写 SVG 折线
 * 比再引一个图表库轻得多，也不用担心它偷偷去拉字体或 sourcemap。
 */

export interface IntradayPathChartProps {
  bars: RevealedPriceBar[];
  /** 无障碍标题，通常是标的代码 + 日期 */
  label?: string;
}

const W = 640;
const H = 132;
const PAD_X = 6;
const PAD_Y = 10;

export function IntradayPathChart({ bars, label }: IntradayPathChartProps): JSX.Element | null {
  const model = useMemo(() => {
    if (!bars || bars.length === 0) return null;
    /* 走引擎的统一判定：数据是真实分钟就直接用真实点，
     * 只有小时锚点才推演。这个判断不该在组件里各写一份
     * （PriceChartPanel 曾经就是自己写的一份，把分钟当小时用了）。 */
    const built = buildPlayerIntradaySeries(bars);
    if (!built || built.points.length < 2) return null;
    const path = built.points;

    const prices = path.map((p) => p.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const span = hi - lo || 1;

    const x = (i: number) => PAD_X + (i / (path.length - 1)) * (W - PAD_X * 2);
    const y = (v: number) => PAD_Y + (1 - (v - lo) / span) * (H - PAD_Y * 2);

    const line = path.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
    const area = `${line} L${x(path.length - 1).toFixed(1)},${H - PAD_Y} L${x(0).toFixed(1)},${H - PAD_Y} Z`;

    /* 锚点圆的**唯一作用**是让人一眼分清"哪些点是真的、哪些是补的"。
     * REAL_1M 下每个点都是真的，这个区分就不存在了——
     * 再画 390 个圆不是更诚实，只是把线糊住。所以真实数据下不画锚点。 */
    const anchors =
      built.mode === 'REAL_1M'
        ? []
        : bars.map((b, k) => {
            // 推演路径去掉了接缝重复点，第 k 根 bar 的收盘位于索引 k*stepsPerBar。
            // 用 path 长度反推，避免两处写死同一个常数。
            const stepsPerBar = (path.length - 1) / bars.length;
            const idx = Math.round((k + 1) * stepsPerBar);
            return { cx: x(idx), cy: y(b.close), label: b.label, close: b.close };
          });

    const last = path[path.length - 1];
    const first = path[0];
    return { line, area, anchors, lo, hi, up: last.price >= first.price, mode: built.mode };
  }, [bars]);

  if (!model) return null;

  return (
    <figure className="ipc-wrap" aria-label={label ? `${label} 盘中走势` : '盘中走势'}>
      <svg
        className={`ipc-svg ${model.up ? 'ipc-up' : 'ipc-down'}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
      >
        <path className="ipc-area" d={model.area} />
        <path className="ipc-line" d={model.line} />
        {/* 真实小时收盘点画成实心圆：一眼看出哪些是真的、哪些是补的 */}
        {model.anchors.map((a) => (
          <circle key={a.label} className="ipc-anchor" cx={a.cx} cy={a.cy} r={3} />
        ))}
      </svg>

      {/* 标注必须跟着数据走。写死 SIMULATED 在真实分钟数据下就是**反向说谎**：
          把真的说成假的，跟把假的说成真的一样破坏这套真值标签的可信度。 */}
      <figcaption className="ipc-caption">
        {model.mode === 'REAL_1M' ? (
          <>
            <span className="ot-badge ipc-badge ot-badge-real">REAL · 真实分钟</span>
            <span className="ipc-note">
              整条曲线为<strong>真实分钟收盘价</strong>（REAL），逐分钟来自历史行情归档，
              <strong>没有任何插值或模拟点</strong>。
            </span>
          </>
        ) : (
          <>
            <span className="ot-badge ipc-badge">SIMULATED · 历史锚定</span>
            <span className="ipc-note">
              实心点 = <strong>真实小时收盘</strong>（REAL）；点之间的走势为离线模拟（SIMULATED），
              <strong>仅用于呈现，不参与任何成交与结算</strong>。
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
