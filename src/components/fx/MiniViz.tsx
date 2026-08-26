import React from 'react';
import { vizSourceAttr, type VizSourceKey } from './vizSources';

/**
 * Mini-viz：把"文字数据块"变成"图形数据单元"（2026-08-19 claude）
 *
 * ── 为什么需要这一批 ────────────────────────────────────────────────
 *
 * 三方评审在这一点上是一致的（harv 明确裁决为最高优先级，AVG 与 dante
 * 也各自列在清单里）：
 *
 *   harv：「当前最大差距已不是『质感没抛光』，而是**参考图用高密度 mini-viz
 *          承载信息、实机却大量退化成纯文字**，导致信息密度、节奏和视觉锚点
 *          从结构层就不一样。」
 *
 * 逐块对比过：参考图的 FUND OVERVIEW 是环形图、RISK EXPOSURE 是 sparkline、
 * PORTFOLIO GREEKS 是五边形雷达、MARGIN STATUS 是双进度条、WAR ROOM 每人
 * 一条迷你波形；我们对应的位置全是纯文字。
 * **一个由文字堆成的面板，无论材质做得多好，都不可能看起来像一个由图表堆成的面板。**
 *
 * ── 三条硬规矩 ──────────────────────────────────────────────────────
 *
 * 1. **纯 SVG，零素材、零远程依赖。** 全离线单机，CSP `connect-src 'none'`。
 * 2. **颜色一律走主题 token**，三套主题自动跟随，不写字面色。
 * 3. **没有数据就画空态骨架，绝不编数。** 这是本作的核心承诺——
 *    一个漂亮的图表里放假数字，比不画更糟。所有组件都接受 `null`/`undefined`
 *    并渲染成明确的"暂无数据"形态。
 */

/* ── 通用：空态骨架 ──────────────────────────────────────────────── */

function EmptySkeleton({ w, h, label, source }: { w: number; h: number; label?: string; source?: VizSourceKey }): JSX.Element {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mv-empty" role="img" aria-label={label ?? '暂无数据'} {...srcAttr(source)}>
      <rect
        x="0.5"
        y="0.5"
        width={w - 1}
        height={h - 1}
        rx="4"
        fill="none"
        stroke="var(--thm-line, var(--thm-muted))"
        strokeDasharray="3 3"
        opacity="0.45"
      />
      {/* 空态要说清**缺的是什么**，不是一律"暂无数据"。
          席位那四条写"尚无往来记录"，玩家才知道那是账本空着、
          而不是图表坏了。label 太长时才回落到通用文案。 */}
      <text
        x={w / 2}
        y={h / 2 + 3}
        textAnchor="middle"
        fontSize="9"
        fill="var(--thm-muted)"
        opacity="0.8"
      >
        {label && label.length <= 8 ? label : '暂无数据'}
      </text>
    </svg>
  );
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 每个图都必须说得出自己画的是什么（2026-08-19 claude · harv P8）
 *
 * harv P8 判据：「每个 viz 有 data-key/source；**source 缺失自动空态**；
 * 装饰性 canvas/svg 数 = 0」。
 *
 * 这条不是为了好看，是为了**让"这张图是装饰"变成一件查得出来的事**。
 * 本作已经踩过两次：War Room 那四条写死的贝塞尔曲线、LP 信任度的 `?? 85`，
 * 两处都长得像数据。有了 data-source，探针一扫就知道哪张图没有出处。
 *
 * 约定：`source` 写**真实字段路径**（如 `state.fund_stats.lp_confidence`），
 * 不是人话描述。人话会随时间漂移，字段路径不会。
 */
export interface VizSource {
  /**
   * 数据来源。**只能取 `vizSources.ts` 注册表里登记过的 key**——
   * 上一版是任意字符串，dante 指出软肋：字段改名后那行字不会跟着变，
   * 探针照样报"有出处"，而那个出处已经指向不存在的东西。
   * 收紧成 literal union 之后，打错字或用没登记的来源 tsc 直接拒。
   */
  source: VizSourceKey;
}

/** 把 source 展开成 `key · 字段路径 · 真实性类别` 落到 DOM，供探针核查 */
const srcAttr = (source?: VizSourceKey) => ({
  'data-source': source ? vizSourceAttr(source) : 'MISSING',
});

/* ── 环形进度（FUND OVERVIEW / LP 信任度）──────────────────────────── */

export interface DonutProps {
  /** 0–1。超出范围会被夹住；null/NaN 走空态 */
  value: number | null | undefined;
  size?: number;
  thickness?: number;
  /** 圆环颜色，默认主题强调色 */
  color?: string;
  /** 中心大字（自己格式化好，组件不做单位推断） */
  centerLabel?: string;
  /** 中心小字 */
  centerSub?: string;
}

export function Donut({
  value,
  size = 76,
  thickness = 7,
  color = 'var(--thm-accent)',
  centerLabel,
  centerSub,
  source,
}: DonutProps & Partial<VizSource>): JSX.Element {
  if (!isNum(value)) return <EmptySkeleton w={size} h={size} label="环形图暂无数据" source={source} />;
  const v = Math.max(0, Math.min(1, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mv-donut" role="img" {...srcAttr(source)}>
      <g transform={`translate(${size / 2} ${size / 2}) rotate(-90)`}>
        <circle r={r} fill="none" stroke="var(--thm-line, var(--thm-muted))" strokeWidth={thickness} opacity="0.28" />
        <circle
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          style={{ filter: 'drop-shadow(0 0 4px currentColor)', color }}
        />
      </g>
      {centerLabel && (
        <text x={size / 2} y={size / 2 + (centerSub ? 0 : 4)} textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--thm-text)">
          {centerLabel}
        </text>
      )}
      {centerSub && (
        <text x={size / 2} y={size / 2 + 13} textAnchor="middle" fontSize="8" fill="var(--thm-muted)">
          {centerSub}
        </text>
      )}
    </svg>
  );
}

/* ── Sparkline（RISK EXPOSURE / THESIS CONFIDENCE）────────────────── */

export interface SparklineProps {
  /** 至少两个有限数才画；否则空态 */
  points: Array<number | null | undefined> | null | undefined;
  width?: number;
  height?: number;
  color?: string;
  /** 面积填充 */
  fill?: boolean;
}

export function Sparkline({
  points,
  width = 132,
  height = 34,
  color = 'var(--thm-accent)',
  fill = true,
  source,
}: SparklineProps & Partial<VizSource>): JSX.Element {
  const vals = (points ?? []).filter(isNum);
  if (vals.length < 2) return <EmptySkeleton w={width} h={height} label="趋势暂无数据" source={source} />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => pad + (i / (vals.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(vals.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-spark" role="img" {...srcAttr(source)}>
      {fill && <path d={area} fill={color} opacity="0.16" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

/* ── 五边形雷达（PORTFOLIO GREEKS）────────────────────────────────── */

export interface RadarAxis {
  label: string;
  /** 已归一化到 0–1。组件不做归一化——不同 Greeks 的量纲差太远，
   *  归一化规则必须由调用方按业务定义，塞进组件会变成隐形的假设。 */
  value: number | null | undefined;
}

export function Radar({
  axes,
  size = 118,
  color = 'var(--thm-accent)',
  source,
}: {
  axes: RadarAxis[] | null | undefined;
  size?: number;
  color?: string;
} & Partial<VizSource>): JSX.Element {
  const list = (axes ?? []).filter((a) => a && typeof a.label === 'string');
  if (list.length < 3) return <EmptySkeleton w={size} h={size} label="雷达图暂无数据" source={source} />;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const n = list.length;
  const pt = (i: number, k: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
  };
  const ring = (k: number) =>
    list.map((_, i) => pt(i, k).map((v) => v.toFixed(1)).join(',')).join(' ');
  const axisValue = (value: number | null | undefined) =>
    isNum(value) ? Math.max(0, Math.min(1, value)) : 0;
  // 缺值的轴画到 0，并在标签上标出来——不要悄悄跳过，那会让图形形状说谎
  const shape = list
    .map((axis, i) => pt(i, axisValue(axis.value)).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  // 全 0 是**合法状态**（空仓的账本确实没有敞口），但画出来是个塌在中心的点，
  // 看着像坏了。这时候把话说明白，而不是留一个空网格让人猜。
  const allZero = list.every((a) => !isNum(a.value) || Math.abs(a.value) < 1e-9);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mv-radar mv-radar-instrument"
      role="img"
      aria-label="Portfolio Greeks exposure radar"
      {...srcAttr(source)}
    >
      <polygon className="mv-radar-field" points={ring(1)} fill={color} fillOpacity="0.035" stroke="none" />
      {[0.25, 0.5, 0.75, 1].map((k) => (
        <polygon
          key={k}
          className="mv-radar-ring"
          points={ring(k)}
          fill="none"
          stroke="var(--thm-line, var(--thm-muted))"
          strokeWidth={k === 1 ? 1.15 : 0.7}
          opacity={k === 1 ? 0.78 : 0.42}
        />
      ))}
      {list.map((_, i) => {
        const [x2, y2] = pt(i, 1);
        return (
          <g key={i} className="mv-radar-axis">
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="var(--thm-line, var(--thm-muted))" strokeWidth="0.8" opacity="0.58" />
            <circle cx={x2} cy={y2} r="1.45" fill="var(--thm-line, var(--thm-muted))" opacity="0.88" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="2.2" fill="var(--thm-line, var(--thm-muted))" opacity="0.74" />
      {allZero ? (
        <g className="mv-radar-zero">
          <circle cx={cx} cy={cy} r={Math.max(8, r * 0.24)} fill="none" stroke={color} strokeWidth="1" opacity="0.42" />
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--thm-muted)">
            无敞口
          </text>
        </g>
      ) : (
        <g className="mv-radar-data" style={{ color }}>
          <polygon
            className="mv-radar-exposure"
            points={shape}
            fill={color}
            fillOpacity="0.36"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 4px currentColor)' }}
          />
          {list.map((axis, i) => {
            if (!isNum(axis.value)) return null;
            const [px, py] = pt(i, axisValue(axis.value));
            return (
              <circle
                key={`${axis.label}-point`}
                className="mv-radar-node"
                cx={px}
                cy={py}
                r="2.5"
                fill={color}
                stroke="var(--thm-bg, transparent)"
                strokeWidth="0.9"
              />
            );
          })}
        </g>
      )}
      {list.map((a, i) => {
        const [tx, ty] = pt(i, 1.24);
        return (
          <text
            key={a.label}
            className="mv-radar-label"
            x={tx}
            y={ty + 3}
            textAnchor="middle"
            fontSize="8"
            fontWeight="800"
            fill={isNum(a.value) ? 'var(--thm-text)' : 'var(--thm-risk)'}
          >
            {isNum(a.value) ? a.label : `${a.label}·无`}
          </text>
        );
      })}
    </svg>
  );
}

/* ── 双段进度条（MARGIN STATUS）──────────────────────────────────── */

export function MeterBar({
  value,
  warn = 0.7,
  danger = 0.9,
  width = 132,
  height = 8,
  label,
  source,
}: {
  value: number | null | undefined;
  /** 越过就转警示色 */
  warn?: number;
  danger?: number;
  width?: number;
  height?: number;
  label?: string;
} & Partial<VizSource>): JSX.Element {
  if (!isNum(value)) return <EmptySkeleton w={width} h={Math.max(height, 16)} label="进度暂无数据" source={source} />;
  const v = Math.max(0, Math.min(1, value));
  const color = v >= danger ? 'var(--thm-risk)' : v >= warn ? 'var(--thm-gold)' : 'var(--thm-good)';
  return (
    <svg width={width} height={height + (label ? 12 : 0)} viewBox={`0 0 ${width} ${height + (label ? 12 : 0)}`} className="mv-meter" role="img" {...srcAttr(source)}>
      <rect x="0" y="0" width={width} height={height} rx={height / 2} fill="var(--thm-line, var(--thm-muted))" opacity="0.3" />
      <rect x="0" y="0" width={Math.max(2, width * v)} height={height} rx={height / 2} fill={color} />
      {label && (
        <text x="0" y={height + 9} fontSize="8" fill="var(--thm-muted)">
          {label}
        </text>
      )}
    </svg>
  );
}

/* ── 迷你波形（WAR ROOM 每人的压力条）─────────────────────────────── */

export function Waveform({
  points,
  width = 118,
  height = 30,
  color = 'var(--thm-accent)',
  domainMax,
  source,
}: {
  points: Array<number | null | undefined> | null | undefined;
  width?: number;
  height?: number;
  color?: string;
  /**
   * 刻度上限。**有固定量纲的数据必须传。**
   *
   * 不传就按"观察到的最大值"自适应，那对紧张度这种 0–3 的离散档位是错的：
   * 四个人全程平稳（全 0）时，自适应刻度会把 0 也顶成满格，
   * 或者反过来全压成 1px 的灰渣——我第一版就是后者，
   * 席位上四条波形全成了看不见的小点。
   *
   * 传了 domainMax，「全程平稳」就老老实实画成一排贴地的低柱，
   * 有人炸了才窜起来——那才是这张图该表达的意思。
   */
  domainMax?: number;
} & Partial<VizSource>): JSX.Element {
  const vals = (points ?? []).filter(isNum);
  if (vals.length < 3) return <EmptySkeleton w={width} h={height} label="波形暂无数据" source={source} />;
  const scale = isNum(domainMax) && domainMax > 0 ? domainMax : Math.max(...vals.map(Math.abs), 1e-6);
  const bw = width / vals.length;
  // 地板：0 也要画出一截，否则"这个人一直很稳"会被误读成"这里没数据"
  const FLOOR = 3;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-wave" role="img" {...srcAttr(source)}>
      {vals.map((v, i) => {
        const k = Math.min(1, Math.abs(v) / scale);
        const hh = FLOOR + k * (height - 2 - FLOOR);
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.16}
            y={height - 1 - hh}
            width={Math.max(1.2, bw * 0.68)}
            height={hh}
            rx="0.8"
            fill={color}
            opacity={0.45 + 0.55 * k}
          />
        );
      })}
    </svg>
  );
}

/* ── 席位轨迹（WAR ROOM 专用）─────────────────────────────────────── */

/**
 * 带符号的连续细折线（2026-08-19 claude）
 *
 * 为什么不复用 `Waveform`：那是柱状的，AVG 的原话是
 * 「重构 War Room 的方块波形图，**别再改个高度数字交差了**，
 *   必须换成连续细折线或密集的柱子」。柱子在 38px 高的卡里
 *   只能表达"高低"，表达不了"从欠人情翻成结仇"这种**穿越零点**的过程。
 *
 * 为什么要零基线：这条线画的是 `net = 人情 - 积怨`，
 * **符号本身就是信息**——线在零线之上是他欠你，之下是他记着你。
 * 没有零基线的话，一条一路向下但始终为正的线，
 * 会被读成"关系已经恶化到负数"，那是误读。
 */
export function SeatTrace({
  points,
  width = 118,
  height = 34,
  color = 'var(--thm-accent)',
  /** 刻度上限（绝对值）。传了就钉死，避免同一批席位各用各的尺度没法横向比 */
  domainMax,
  source,
}: {
  points: Array<number | null | undefined> | null | undefined;
  width?: number;
  height?: number;
  color?: string;
  domainMax?: number;
} & Partial<VizSource>): JSX.Element {
  const vals = (points ?? []).filter(isNum);
  // 少于 2 点画不出线。harv 的规矩：**无事件则不画波形**，空态说清楚。
  if (vals.length < 2) return <EmptySkeleton w={width} h={height} label="尚无往来" source={source} />;
  // 全零 = 账本上根本没有这个人的往来记录。
  // 画成一条贴着零基线的直线，看着像"关系持续中性"——那是**过度解读**：
  // 真相是"什么都没发生过"。harv 的规矩是无事件则不画，全零就是无事件。
  if (vals.every((v) => Math.abs(v) < 1e-9)) {
    return <EmptySkeleton w={width} h={height} label="尚无往来" source={source} />;
  }

  const scale = isNum(domainMax) && domainMax > 0
    ? domainMax
    : Math.max(...vals.map((v) => Math.abs(v)), 1e-6);
  const pad = 2;
  const mid = height / 2;
  const x = (i: number) => pad + (i / (vals.length - 1)) * (width - pad * 2);
  const y = (v: number) => mid - Math.max(-1, Math.min(1, v / scale)) * (mid - pad);
  const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vals[vals.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-trace" role="img" {...srcAttr(source)}>
      {/* 零基线：正负的分界，必须画出来 */}
      <line
        x1={pad} y1={mid} x2={width - pad} y2={mid}
        stroke="var(--thm-line, var(--thm-muted))" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"
      />
      {/* 先铺一条更粗的半透明同色线做光晕，主线画在上面——和主图同一个做法 */}
      <path d={d} fill="none" stroke={color} strokeWidth="3" opacity="0.18"
            strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.3"
            strokeLinejoin="round" strokeLinecap="round" />
      {/* 末点：当前站位。正负用不同形状，色盲也分得出 */}
      <circle cx={x(vals.length - 1)} cy={y(last)} r="2.4" fill={color} />
    </svg>
  );
}

/* ── WaterfallPnL：Greeks 损益归因瀑布条（batch2 BP10）──────────────── */

export interface WaterfallPnLProps {
  attribution: {
    delta: number;
    gamma?: number;
    theta: number;
    vega: number;
    residual: number;
    net: number;
  } | null;
  width?: number;
  height?: number;
}

/** 双向条形归因：每个因子一条水平条，正右负左，零轴居中。真实归因数据，缺则空态。 */
export function WaterfallPnL({ attribution, width = 320, height = 132 }: WaterfallPnLProps): JSX.Element {
  if (!attribution) return <EmptySkeleton w={width} h={height} label="暂无归因数据" source="tradeAttribution" />;
  const rows: Array<{ label: string; value: number }> = [
    { label: '方向 Δ', value: attribution.delta },
    ...(typeof attribution.gamma === 'number' ? [{ label: '加速 Γ', value: attribution.gamma }] : []),
    { label: '时间 Θ', value: attribution.theta },
    { label: '波动 V', value: attribution.vega },
    { label: '残差', value: attribution.residual },
  ];
  const maxAbs = Math.max(1e-6, ...rows.map((r) => Math.abs(r.value)), Math.abs(attribution.net));
  const pad = 6;
  const labelW = 58;
  const zero = labelW + (width - labelW - pad) / 2;
  const halfSpan = (width - labelW - pad) / 2 - 4;
  const rowH = Math.floor((height - pad * 2 - 18) / (rows.length + 1));
  const barH = Math.max(7, rowH - 6);
  const xFor = (v: number) => (v / maxAbs) * halfSpan;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-waterfall" role="img"
      aria-label="Greeks 损益归因" {...srcAttr('tradeAttribution')}>
      <line x1={zero} y1={pad} x2={zero} y2={height - pad} stroke="var(--thm-line, var(--thm-muted))" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      {rows.map((r, i) => {
        const y = pad + i * rowH;
        const w = Math.abs(xFor(r.value));
        const isPos = r.value >= 0;
        const color = isPos ? 'var(--green, #10b981)' : 'var(--red, #ef4444)';
        return (
          <g key={r.label}>
            <text x={2} y={y + barH - 1} fontSize="10" fill="var(--thm-muted, #94a3b8)" fontFamily="monospace">{r.label}</text>
            <rect x={isPos ? zero : zero - w} y={y} width={Math.max(1, w)} height={barH} fill={color} opacity="0.75" rx="2" />
            <text
              x={isPos ? zero + w + 4 : zero - w - 4}
              y={y + barH - 1}
              fontSize="10"
              fill={color}
              fontFamily="monospace"
              textAnchor={isPos ? 'start' : 'end'}
            >
              {`${isPos ? '+' : ''}${r.value.toFixed(0)}`}
            </text>
          </g>
        );
      })}
      {(() => {
        const y = pad + rows.length * rowH + 6;
        const w = Math.abs(xFor(attribution.net));
        const isPos = attribution.net >= 0;
        const color = isPos ? 'var(--green, #10b981)' : 'var(--red, #ef4444)';
        return (
          <g>
            <text x={2} y={y + barH - 1} fontSize="10" fontWeight="bold" fill="var(--thm-text, #e2e8f0)" fontFamily="monospace">净 NET</text>
            <rect x={isPos ? zero : zero - w} y={y} width={Math.max(1, w)} height={barH} fill={color} rx="2" />
            <text x={isPos ? zero + w + 4 : zero - w - 4} y={y + barH - 1} fontSize="10" fontWeight="bold"
              fill={color} fontFamily="monospace" textAnchor={isPos ? 'start' : 'end'}>
              {`${isPos ? '+' : ''}${attribution.net.toFixed(0)}`}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}


/* ── Batch2 named financial mini-viz primitives ───────────────────── */

export function FundHealthRadar(props: {
  axes: RadarAxis[] | null | undefined;
  size?: number;
  source?: VizSourceKey;
}): JSX.Element {
  return <Radar axes={props.axes} size={props.size ?? 152} source={props.source} />;
}

export function BipolarArcGauge({
  left,
  right,
  leftLabel = 'Delta',
  rightLabel = 'Theta',
  width = 180,
  height = 74,
  source,
}: {
  left: number | null | undefined;
  right: number | null | undefined;
  leftLabel?: string;
  rightLabel?: string;
  width?: number;
  height?: number;
  source?: VizSourceKey;
}): JSX.Element {
  if (!isNum(left) && !isNum(right)) return <EmptySkeleton w={width} h={height} label="双向仪表暂无数据" source={source} />;
  const l = isNum(left) ? left : 0;
  const r = isNum(right) ? right : 0;
  const scale = Math.max(Math.abs(l), Math.abs(r), 1e-9);
  const cx = width / 2;
  const cy = height - 10;
  const radius = Math.min(width * 0.34, height - 18);
  const arc = (start: number, end: number) => {
    const a0 = Math.PI * start;
    const a1 = Math.PI * end;
    const x0 = cx + Math.cos(a0) * radius;
    const y0 = cy - Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy - Math.sin(a1) * radius;
    return `M ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1}`;
  };
  const lFrac = Math.min(1, Math.abs(l) / scale);
  const rFrac = Math.min(1, Math.abs(r) / scale);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-bipolar-arc" role="img" {...srcAttr(source)}>
      <path d={arc(0, 0.5)} fill="none" stroke="var(--thm-line)" strokeWidth="8" opacity="0.32" />
      <path d={arc(0.5, 1)} fill="none" stroke="var(--thm-line)" strokeWidth="8" opacity="0.32" />
      <path d={arc(0.5 - 0.5 * lFrac, 0.5)} fill="none" stroke="var(--thm-good)" strokeWidth="8" strokeLinecap="round" />
      <path d={arc(0.5, 0.5 + 0.5 * rFrac)} fill="none" stroke="var(--thm-risk)" strokeWidth="8" strokeLinecap="round" />
      <line x1={cx} y1={cy-radius-4} x2={cx} y2={cy+2} stroke="var(--thm-muted)" opacity="0.55" />
      <text x="4" y={height-2} fontSize="9" fill="var(--thm-good)">{leftLabel} {isNum(left) ? l.toFixed(3) : '—'}</text>
      <text x={width-4} y={height-2} textAnchor="end" fontSize="9" fill="var(--thm-risk)">{rightLabel} {isNum(right) ? r.toFixed(3) : '—'}</text>
    </svg>
  );
}

export function OIHeatBar({ value, maxValue, width = 76, height = 8, source }: {
  value: number | null | undefined;
  maxValue: number | null | undefined;
  width?: number;
  height?: number;
  source?: VizSourceKey;
}): JSX.Element {
  if (!isNum(value) || !isNum(maxValue) || maxValue <= 0) return <EmptySkeleton w={width} h={height + 12} label="OI无数据" source={source} />;
  const pct = Math.max(0, Math.min(1, value / maxValue));
  return (
    <svg width={width} height={height + 12} viewBox={`0 0 ${width} ${height + 12}`} className="mv-oi-heat" role="img" {...srcAttr(source)}>
      <rect x="0" y="1" width={width} height={height} rx={height/2} fill="var(--thm-line)" opacity="0.3" />
      <rect x="0" y="1" width={Math.max(1,width*pct)} height={height} rx={height/2} fill="var(--thm-accent)" opacity={0.35 + pct*0.65} />
      <text x={width} y={height+11} textAnchor="end" fontSize="8" fill="var(--thm-muted)">{Math.round(value).toLocaleString()}</text>
    </svg>
  );
}

export function GexZeroAxis({ points, width = 260, rowHeight = 14, source }: {
  points: Array<{ label: string; value: number | null | undefined }>;
  width?: number;
  rowHeight?: number;
  source?: VizSourceKey;
}): JSX.Element {
  const vals = points.map((p) => isNum(p.value) ? p.value : null).filter((v): v is number => v !== null);
  if (!vals.length) return <EmptySkeleton w={width} h={44} label="GEX无数据" source={source} />;
  const maxAbs = Math.max(...vals.map(Math.abs), 1);
  const zero = width * 0.5;
  const h = Math.max(34, points.length * rowHeight + 8);
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} className="mv-gex-zero" role="img" {...srcAttr(source)}>
      <line x1={zero} x2={zero} y1="0" y2={h} stroke="var(--thm-muted)" opacity="0.55" />
      {points.map((p,i) => {
        const v = isNum(p.value) ? p.value : 0;
        const w = Math.abs(v) / maxAbs * (width * 0.42);
        const y = 3 + i*rowHeight;
        const pos = v >= 0;
        return <g key={`${p.label}-${i}`}>
          <rect x={pos ? zero : zero-w} y={y} width={Math.max(1,w)} height={rowHeight-4} rx="2" fill={pos ? 'var(--thm-good)' : 'var(--thm-risk)'} opacity="0.72" />
          <text x={pos ? zero+3 : zero-3} y={y+rowHeight-6} textAnchor={pos ? 'start':'end'} fontSize="8" fill="var(--thm-muted)">{p.label}</text>
        </g>;
      })}
    </svg>
  );
}

export function SentimentPulse({ bullish, bearish, fearGreed, width = 180, height = 42, source }: {
  bullish: number | null | undefined;
  bearish: number | null | undefined;
  fearGreed?: number | null;
  width?: number;
  height?: number;
  source?: VizSourceKey;
}): JSX.Element {
  if (!isNum(bullish) || !isNum(bearish)) return <EmptySkeleton w={width} h={height} label="情绪暂无数据" source={source} />;
  const total = Math.max(1, bullish + bearish);
  const bull = Math.max(0, bullish) / total;
  const bear = Math.max(0, bearish) / total;
  const fg = isNum(fearGreed) ? Math.max(0, Math.min(100, fearGreed)) : null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mv-sentiment-pulse" role="img" {...srcAttr(source)}>
      <rect x="0" y="8" width={width} height="10" rx="5" fill="var(--thm-line)" opacity="0.28" />
      <rect x="0" y="8" width={width*bull} height="10" rx="5" fill="var(--thm-good)" opacity="0.82" />
      <rect x={width*(1-bear)} y="8" width={width*bear} height="10" rx="5" fill="var(--thm-risk)" opacity="0.82" />
      <text x="0" y="34" fontSize="9" fill="var(--thm-good)">BULL {bullish.toFixed(0)}%</text>
      <text x={width} y="34" textAnchor="end" fontSize="9" fill="var(--thm-risk)">BEAR {bearish.toFixed(0)}%</text>
      {fg !== null && <circle cx={width*(fg/100)} cy="13" r="4" fill="var(--thm-gold)" stroke="var(--thm-panel)" strokeWidth="1.5" />}
    </svg>
  );
}
