import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  IChartApi,
  LineSeries,
  Time,
  SeriesMarker,
} from 'lightweight-charts';
import { fmt } from '../lib/format';
import { cssStr, useThemeTick } from './fx/useMotionScale';
import { CentralMarketField } from './fx/CentralMarketField';
import type { MarketNode } from '../types';
import type { RevealedPriceBar } from '../engine/schemas';
import { hasValidOhlc, isChartReady } from '../lib/chartReadiness';
import {
  buildPlayerIntradaySeries,
  buildDailyAnchoredVisualSeries,
  type IntradaySeriesMode,
} from '../engine/engines/intraday_path';

export type DisplayMode = 'CANDLE' | 'AREA' | 'LINE' | 'INTRADAY';

export interface PriceChartPanelProps {
  nodes: MarketNode[];
  visibleCount: number;
  totalNodeCount: number;
  campaignId: string;
  /** The current replay date. Future rows are always filtered out, even if a
   * caller accidentally provides a full campaign history array. */
  currentGameDate?: string;
  buyIndices?: number[];
  sellIndices?: number[];
  callWall?: number;
  putWall?: number;
  gammaFlip?: number;
  /**
   * 当日已揭晓的真实小时 bar。有它才能画盘中模式。
   * **只传已揭晓的** —— 未揭晓的 bar 传进来就是前视泄漏。
   */
  intradayBars?: RevealedPriceBar[];
  /** Fully admitted daily OHLC used only as a truth-labelled visual fallback when no partial intraday reveal is active. */
  dailyVisualAnchor?: RevealedPriceBar | null;
  /**
   * 事件针脚（2026-08-19 claude）
   *
   * 两位评审独立给了同一条最高优先级：主图现在是"一大块画布上一根裸线"，
   * 参考图那种硬核感来自**行情和剧情节点在同一条时间轴上对得上**。
   *
   * 数据来自 `view.decision_timeline`（真实发生过的事件，带 game_date）。
   * **调用方必须只传已揭晓的**——传进来一条未来的事件，
   * 玩家就能从针脚位置推断出后面要发生什么。
   */
  eventPins?: ChartEventPin[];
  /** Reports when the player-facing chart has a sized canvas, mounted series, valid OHLC, and a visible body. */
  onChartReady?: (ready: boolean) => void;
}

export interface ChartEventPin {
  /** 必须是已经走过的交易日 */
  date: string;
  headline: string;
  /** 决定针脚颜色：风险类走 risk，机会类走 good，其余走 accent */
  tone?: 'risk' | 'good' | 'neutral';
}

interface CurrentCandleOverlay {
  x: number;
  yOpen: number;
  yClose: number;
  yHigh: number;
  yLow: number;
  width: number;
  height: number;
  isUp: boolean;
  isNew: boolean;
}

interface LivePriceOverlay {
  x: number;
  y: number;
  width: number;
  height: number;
}

const animatedCandleKeys = new Set<string>();
const CANDLE_DEPTH_OPACITY = [1, 0.92, 0.84, 0.78, 0.73, 0.68, 0.64, 0.61, 0.59, 0.57, 0.55, 0.53] as const;

interface NeuralFieldPoint {
  x: number;
  y: number;
  energy: 1 | 2 | 3;
}

interface NeuralFieldEdge {
  from: number;
  to: number;
  major: boolean;
}

/**
 * A real, deterministic graph for the MARKET GRAPH optical field.
 *
 * Earlier reference passes drew this organ with two CSS pseudo-elements. That
 * made it impossible to increase relational density without producing another
 * flat texture. These points and edges are deliberately data-independent: the
 * graph is cockpit material, never a claim about live market relationships.
 */
const NEURAL_FIELD_COLUMNS = 15;
const NEURAL_FIELD_ROWS = 5;
const NEURAL_FIELD_POINTS: NeuralFieldPoint[] = Array.from(
  { length: NEURAL_FIELD_COLUMNS * NEURAL_FIELD_ROWS },
  (_, index) => {
    const column = index % NEURAL_FIELD_COLUMNS;
    const row = Math.floor(index / NEURAL_FIELD_COLUMNS);
    const x = 22 + (column / (NEURAL_FIELD_COLUMNS - 1)) * 956
      + Math.sin(index * 1.73 + row * 0.61) * 13;
    const y = 24 + (row / (NEURAL_FIELD_ROWS - 1)) * 312
      + Math.cos(index * 1.11 + column * 0.47) * 15;
    return {
      x: Math.max(8, Math.min(992, Number(x.toFixed(2)))),
      y: Math.max(8, Math.min(352, Number(y.toFixed(2)))),
      energy: index % 19 === 0 ? 3 : index % 7 === 0 ? 2 : 1,
    };
  },
);

const NEURAL_FIELD_EDGES: NeuralFieldEdge[] = [];
for (let index = 0; index < NEURAL_FIELD_POINTS.length; index += 1) {
  const column = index % NEURAL_FIELD_COLUMNS;
  const row = Math.floor(index / NEURAL_FIELD_COLUMNS);
  const connect = (to: number, major = false): void => {
    if (to >= 0 && to < NEURAL_FIELD_POINTS.length) {
      NEURAL_FIELD_EDGES.push({ from: index, to, major });
    }
  };

  if (column < NEURAL_FIELD_COLUMNS - 1) connect(index + 1, index % 9 === 0);
  if (row < NEURAL_FIELD_ROWS - 1) {
    connect(index + NEURAL_FIELD_COLUMNS, index % 11 === 0);
    if (column < NEURAL_FIELD_COLUMNS - 1) connect(index + NEURAL_FIELD_COLUMNS + 1, index % 13 === 0);
    if (column > 0 && (column + row) % 2 === 0) connect(index + NEURAL_FIELD_COLUMNS - 1);
  }
  if (row < NEURAL_FIELD_ROWS - 2 && column % 3 === 0) {
    connect(index + (NEURAL_FIELD_COLUMNS * 2) + (column < NEURAL_FIELD_COLUMNS - 1 ? 1 : -1), true);
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = Number.parseInt(hex[1], 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(color.trim());
  return rgb ? `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})` : color;
}

export function PriceChartPanel({
  nodes,
  visibleCount,
  totalNodeCount,
  campaignId,
  currentGameDate,
  buyIndices = [],
  sellIndices = [],
  callWall,
  putWall,
  gammaFlip,
  intradayBars,
  dailyVisualAnchor,
  eventPins,
  onChartReady,
}: PriceChartPanelProps): JSX.Element {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  /** 主线下面那条更粗的半透明线，两层叠出光晕（见 createChart 里的说明） */
  const glowSeriesRef = useRef<any>(null);
  /** 盘中参考线句柄。重画前必须逐条 remove，否则每次刷新叠一层，几步就糊成一片 */
  const refLinesRef = useRef<any[]>([]);
  const [currentCandleOverlay, setCurrentCandleOverlay] = useState<CurrentCandleOverlay | null>(null);
  const [livePriceOverlay, setLivePriceOverlay] = useState<LivePriceOverlay | null>(null);
  const [chartReady, setChartReady] = useState(false);

  const [hoveredBar, setHoveredBar] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  /**
   * 默认显示模式（2026-08-19 claude，按评审 dante R4 #1 改）
   *
   * 他的原话：「参考图第一眼最有压迫感的不是粒子本身，而是『**密集、持续、
   * 正在发生**』的市场中心画面；当前默认 market 截图仍展示少量巨大蜡烛。」
   *
   * 盘中走势（169 点 + 169 根量柱）在此之前是**存在但不是默认**——
   * 玩家进市场页第一眼看到的还是 5 根大色块。
   * 现在只要当天有已揭晓的小时 bar 就默认切过去，没有才回落到日线蜡烛。
   */
  const themeTick = useThemeTick();
  const intradayModel = useMemo(() => {
    const revealed = intradayBars && intradayBars.length > 0
      ? buildPlayerIntradaySeries(intradayBars)
      : null;
    if (revealed && revealed.points.length > 1) return revealed;
    if (dailyVisualAnchor && currentGameDate) {
      // 391 points = 390 RTH minute intervals plus both endpoints. Interior
      // points remain SIMULATED visual data; admitted real bars still own truth.
      const anchored = buildDailyAnchoredVisualSeries(dailyVisualAnchor, currentGameDate, 391);
      if (!anchored || anchored.points.length < 8) return anchored;

      // This branch is the explicitly SIMULATED daily-OHLC visual fallback only.
      // Add deterministic minute-scale texture without changing admitted truth:
      // endpoints and exact daily extrema stay untouched, while all other points
      // remain strictly inside the real daily range. Execution/settlement/scoring
      // continue to use admitted bars, never these visual-only points.
      const dayRange = dailyVisualAnchor.high - dailyVisualAnchor.low;
      if (!(dayRange > 0.02)) return anchored;
      const innerLow = dailyVisualAnchor.low + 0.01;
      const innerHigh = dailyVisualAnchor.high - 0.01;
      const points = anchored.points.map((point, index, all) => {
        if (index === 0 || index === all.length - 1) return point;
        if (
          Math.abs(point.price - dailyVisualAnchor.high) < 0.005
          || Math.abs(point.price - dailyVisualAnchor.low) < 0.005
        ) return point;

        const t = index / (all.length - 1);
        const envelope = Math.pow(Math.sin(Math.PI * t), 0.55);
        const wave = (
          Math.sin(index * 2.399)
          + 0.65 * Math.sin(index * 0.971)
          + 0.35 * Math.sin(index * 0.417)
        ) / 2;
        const raw = point.price + wave * dayRange * 0.055 * envelope;
        const price = Math.round(Math.min(innerHigh, Math.max(innerLow, raw)) * 100) / 100;
        return { ...point, price };
      });
      return { ...anchored, points };
    }
    return revealed;
  }, [intradayBars, dailyVisualAnchor, currentGameDate]);
  const hasIntradayVisual = Boolean(intradayModel && intradayModel.points.length > 1);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(
    hasIntradayVisual ? 'INTRADAY' : 'CANDLE',
  );

  // 盘中数据从无到有时（玩家推进到第一个揭示日）自动切过去一次。
  // 之后玩家手动选了别的模式就不再抢——只在"当前是 CANDLE"时才切。
  const hadIntradayRef = useRef(false);
  useEffect(() => {
    const has = hasIntradayVisual;
    if (has && !hadIntradayRef.current) {
      hadIntradayRef.current = true;
      setDisplayMode((m) => (m === 'CANDLE' ? 'INTRADAY' : m));
    }
    if (!has) hadIntradayRef.current = false;
  }, [hasIntradayVisual]);
  const [showVolume, setShowVolume] = useState(true);
  const [showGexLines, setShowGexLines] = useState(true);

  /**
   * 周期档位（2026-08-19 claude 加入「本场战役」档）
   *
   * ── 修的是什么 ──────────────────────────────────────────────────
   *
   * 原来的档位是 1天 / 1周 / 1个月 / 3个月 / 6个月 / 1年，默认停在 **1天**。
   * 而 `1天` = 1 个交易日 = **1 根 K 线**；更长的档位分别需要 7 / 21 / 63 / 126 / 252
   * 个交易日，而 R1 战役总共只有 7 天。
   *
   * 结果是：**这个图表在整场战役里结构上不可能显示超过 1 根 K 线。**
   * 玩家推进到第 5 天，界面上写着"已准入 5 个真实交易日"，图表却仍然只有一根柱子，
   * 主舞台永远是空的——评审 dante 判 FAIL 的第一条 P0 就是这个。
   *
   * 加一档 `本场战役`：显示**全部已准入的真实交易日**，并设为默认。
   * 它不是"更长的日历区间"，而是"这场战役目前为止的全部真实数据"，
   * 所以天然不会越界，也不需要 🔒。日历档位保留，数据够了才解锁。
   */
  type RangeKey = '本场战役' | '1天' | '1周' | '1个月' | '3个月' | '6个月' | '1年';
  const CAMPAIGN_RANGE: RangeKey = '本场战役';
  // 日历档位所需的交易日数。「本场战役」不在此表内——它按实际可用量走。
  const RANGE_TRADING_DAYS: Record<Exclude<RangeKey, '本场战役'>, number> = {
    '1天': 1, '1周': 7, '1个月': 21, '3个月': 63, '6个月': 126, '1年': 252,
  };
  const RANGE_KEYS: RangeKey[] = [CAMPAIGN_RANGE, ...(Object.keys(RANGE_TRADING_DAYS) as Array<Exclude<RangeKey, '本场战役'>>)];
  const RANGE_SHORT_LABELS: Record<RangeKey, string> = { '本场战役': '本场', '1天': '1D', '1周': '1W', '1个月': '1M', '3个月': '3M', '6个月': '6M', '1年': '1Y' };
  const needFor = (k: RangeKey) => (k === CAMPAIGN_RANGE ? 1 : RANGE_TRADING_DAYS[k as Exclude<RangeKey, '本场战役'>]);
  const [range, setRange] = useState<RangeKey>(CAMPAIGN_RANGE);

  // Daily history packs are indicator-only inputs. The player-facing chart may
  // show campaign nodes that have actually been revealed, but must never splice
  // the 260-row indicator lookback into that same canvas.
  const availableHistory = nodes.filter((n) => !currentGameDate || n.date <= currentGameDate);
  const rangeCount = range === CAMPAIGN_RANGE
    ? availableHistory.length
    : Math.min(RANGE_TRADING_DAYS[range as Exclude<RangeKey, '本场战役'>], availableHistory.length);
  const clampedVisible = rangeCount > 0 ? rangeCount : availableHistory.length;
  const visibleNodes = availableHistory.slice(Math.max(0, availableHistory.length - clampedVisible));
  const latestNode = visibleNodes.length > 0 ? visibleNodes[visibleNodes.length - 1] : null;

  useEffect(() => {
    // 「本场战役」永远可用，不需要回落
    if (range !== CAMPAIGN_RANGE && needFor(range) > availableHistory.length) {
      setRange(CAMPAIGN_RANGE);
    }
  }, [availableHistory.length, range]);

  // Initialize Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    /**
     * 主图配色从主题 token 读（2026-08-19 claude）
     *
     * lightweight-charts 只吃 JS 字面色，喂 `var(--thm-*)` 它不认——
     * 所以主图此前三套主题共用同一支霓虹青，评审的原话是
     * 「会让主题像只换了边框」。主图是第一视觉焦点，这条必须修。
     *
     * `themeTick` 进依赖数组：切主题时整个图表重建并重读 token。
     * 图表本来就在 displayMode/range 变化时重建，多一个触发源不增加复杂度。
     *
     * fallback 一律给 neon 的值：token 万一没定义，退化成原来的样子，
     * 而不是退化成黑底黑线。
     */
    const C = (name: string, fb: string) => cssStr(name, fb);

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C('--thm-chart-bg', '#070b14') },
        textColor: C('--thm-chart-text', '#94a3b8'),
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Inter', monospace",
      },
      grid: {
        vertLines: { color: C('--thm-chart-grid', '#1e293b') },
        horzLines: { color: C('--thm-chart-grid', '#1e293b') },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: C('--thm-chart-cross', '#38bdf8'),
          width: 1,
          style: 3,
          labelBackgroundColor: C('--thm-chart-cross-label', '#0f172a'),
        },
        horzLine: {
          color: C('--thm-chart-cross', '#38bdf8'),
          width: 1,
          style: 3,
          labelBackgroundColor: C('--thm-chart-cross-label', '#0f172a'),
        },
      },
      rightPriceScale: {
        borderColor: C('--thm-chart-grid', '#1e293b'),
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: C('--thm-chart-grid', '#1e293b'),
        timeVisible: true,
        secondsVisible: false,
        /**
         * 时间轴按**美东**显示。
         *
         * lightweight-charts 默认拿浏览器本地时区渲染，于是 09:30 ET 的第一根
         * 小时 bar 在本机上显示成 20:30——玩家看到的是一个跟美股毫无关系的时刻。
         *
         * 这里**不改时间戳**（改了就是篡改数据），只改显示：
         * 用 `Intl.DateTimeFormat` 指定 `America/New_York`，
         * 它自带夏令时规则（EST/EDT 三月切换），比手写 UTC 偏移可靠——
         * 我们在抓 H1 数据时就因为写死 14:30 UTC 开盘被夏令时坑过一次。
         */
        tickMarkFormatter: (time: number) => {
          try {
            return new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(time * 1000));
          } catch {
            return '';
          }
        },
      },
      /**
       * 十字光标的时间标签也必须走美东（2026-08-19 claude）
       *
       * `tickMarkFormatter` 只管**时间轴上的刻度**。十字光标那个跟着鼠标走的
       * 标签是另一条路径，仍然用浏览器本地时区——于是同一张图上，
       * 轴上写着 14:00，光标标签写着 19:37（本机 UTC+8）。
       * 一张图里两个时区，比全都用本地时区更容易骗到人。
       *
       * 和轴刻度一样：**不动时间戳，只改显示**。
       */
      localization: {
        timeFormatter: (time: number) => {
          try {
            return new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }).format(new Date(time * 1000)) + ' ET';
          } catch {
            return '';
          }
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    /**
     * 折线外发光（2026-08-19 claude · AVG 压了三轮的诉求）
     *
     * AVG 原话：「左右两侧的辅助图表，缺乏赛博发光感，面积图没渐变，全是死实色」
     * 「给各处的面积图铺上透明渐变，给折线加上外发光滤镜」。
     *
     * lightweight-charts **没有 glow 参数**，CSS `filter: drop-shadow` 又会
     * 把量柱和坐标轴一起糊掉。做法是先铺一条**更粗、半透明的同色线**，
     * 主线再画在它上面——两层叠出来就是光晕。
     * 顺序不能反：这个库按创建顺序绘制，光晕必须先创建。
     *
     * 只在折线类模式下加。蜡烛图加光晕会让实体边界发虚，反而更难读。
     */
    const glowSeries =
      displayMode === 'INTRADAY' || displayMode === 'AREA' || displayMode === 'LINE'
        ? chart.addSeries(LineSeries, {
            color: C('--thm-chart-glow-line', 'rgba(34, 211, 238, 0.20)'),
            // lineWidth 是受限类型（1|2|3|4），传 7 会被 tsc 拒。
            // 4 压在 2 的主线下，两侧各露 1px 光边——薄但真实。
            lineWidth: 4,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
          })
        : null;
    glowSeriesRef.current = glowSeries;

    const priceSeries =
      displayMode === 'INTRADAY'
        ? // 盘中：发光折线 + 低 alpha 面积填充。评审明确要求不要画成蜡烛——
          // 我们没有分钟级 OHLC，画蜡烛等于暗示存在不存在的数据。
          chart.addSeries(AreaSeries, {
            lineColor: C('--thm-chart-line', '#22d3ee'),
            // 真渐变：顶部有色、底部近透明。之前我把 bottomColor 写成
            // 'transparent' —— 那是"上下同一个透明"，等于没有渐变，
            // 正是 AVG 说的"面积图没渐变，全是死实色"。
            topColor: C('--thm-chart-line-fill', 'rgba(34, 211, 238, 0.30)'),
            bottomColor: C('--thm-chart-fill-bottom', 'rgba(34, 211, 238, 0.015)'),
            lineWidth: 2,
          })
        : displayMode === 'AREA'
        ? chart.addSeries(AreaSeries, {
            lineColor: C('--thm-chart-line', '#22d3ee'),
            topColor: C('--thm-chart-line-fill', 'rgba(34, 211, 238, 0.32)'),
            bottomColor: C('--thm-chart-fill-bottom', 'rgba(34, 211, 238, 0.015)'),
            lineWidth: 2,
          })
        : displayMode === 'LINE'
        ? chart.addSeries(LineSeries, { color: C('--thm-chart-line2', '#fbbf24'), lineWidth: 2 })
        : // 涨跌语义色不整体染成主题色：绿涨红跌是通用约定，改掉会真的害人误读。
          // 三套主题只调它的饱和度与亮度。
          chart.addSeries(CandlestickSeries, {
            upColor: C('--thm-chart-up', '#10b981'),
            downColor: C('--thm-chart-down', '#ef4444'),
            borderVisible: false,
            wickUpColor: C('--thm-chart-up', '#10b981'),
            wickDownColor: C('--thm-chart-down', '#ef4444'),
          });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: C('--thm-chart-cross', '#38bdf8'),
      priceFormat: {
        type: 'volume',
      },
      // Keep volume in its own lower pane; sharing the price scale makes the
      // bars consume the candle body's vertical range and hides small bodies.
      priceScaleId: 'volume',
      // 成交量走的是叠加价格轴，它的**末值标签**默认也画在右缘，
      // 于是 "155.92M" 和价格的 "147.22" 糊在一起、还压住中间的刻度。
      // 双方实机试玩都独立报了这个问题。成交量的绝对值本来就不需要常驻标签
      // ——十字光标悬停时仍会显示——所以这里直接关掉末值标签与价格线。
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current = chart;
    priceSeriesRef.current = priceSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair subscribe
    chart.subscribeCrosshairMove((param) => {
      if (
        param.point === undefined ||
        !param.time ||
        param.point.x < 0 ||
        param.point.y < 0
      ) {
        setHoveredBar(null);
      } else {
        const data = param.seriesData.get(priceSeries) as any;
        const volData = param.seriesData.get(volumeSeries) as any;
        if (data) {
          const close = typeof data.close === 'number' ? data.close : data.value;
          setHoveredBar({
            time: String(param.time),
            open: typeof data.open === 'number' ? data.open : close,
            high: typeof data.high === 'number' ? data.high : close,
            low: typeof data.low === 'number' ? data.low : close,
            close,
            volume: volData?.value || 0,
          });
        }
      }
    });

    // Resize observer
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 420,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      glowSeriesRef.current = null;
      setLivePriceOverlay(null);
      setChartReady(false);
    };
    // themeTick：切主题时整图重建并重读配色 token。
    // 图表本来就在 displayMode 变化时重建，多这一个触发源不增加复杂度，
    // 也省得逐个 series 调 applyOptions（那样容易漏掉十字线/网格/量柱）。
  }, [displayMode, themeTick]);

  /**
   * R6.6.3 live-market pulse.
   *
   * The reference screens read as "the market is still happening" even in a still frame.
   * We do that without inventing a single price tick: only the duplicate glow series alpha
   * breathes. The price series and all coordinates remain untouched. This is deliberately
   * throttled to ~20fps so it does not turn the chart into a GPU fan test on mobile.
   */
  useEffect(() => {
    if (!(displayMode === 'INTRADAY' || displayMode === 'AREA' || displayMode === 'LINE')) return;
    if (!glowSeriesRef.current) return;
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const baseColor = cssStr('--thm-chart-line', '#22d3ee');
    const themeStrengthRaw = Number.parseFloat(cssStr('--cmd-glow-strength', '0.24'));
    const themeStrength = Number.isFinite(themeStrengthRaw) ? Math.max(0.06, Math.min(0.55, themeStrengthRaw)) : 0.24;
    const minAlpha = 0.08 + themeStrength * 0.12;
    const maxAlpha = Math.min(0.58, 0.18 + themeStrength * 0.86);
    let frame = 0;
    let lastPaint = 0;
    const started = performance.now();

    const breathe = (now: number) => {
      if (now - lastPaint >= 50) {
        lastPaint = now;
        const phase = (Math.sin((now - started) / 430) + 1) / 2;
        const alpha = minAlpha + (maxAlpha - minAlpha) * phase;
        glowSeriesRef.current?.applyOptions?.({ color: colorWithAlpha(baseColor, alpha) });
      }
      frame = window.requestAnimationFrame(breathe);
    };
    frame = window.requestAnimationFrame(breathe);
    return () => window.cancelAnimationFrame(frame);
  }, [displayMode, themeTick]);

  // Update Data and Markers
  useEffect(() => {
    if (!priceSeriesRef.current || !volumeSeriesRef.current || visibleNodes.length === 0) {
      setChartReady(false);
      return;
    }

    const candleData = visibleNodes.map((n, index) => {
      const b = n.underlying_bar;
      const o = b.open ?? b.close;
      const c = b.close;
      const h = b.high ?? Math.max(o, c);
      const l = b.low ?? Math.min(o, c);
      const age = visibleNodes.length - 1 - index;
      const opacity = age < CANDLE_DEPTH_OPACITY.length ? CANDLE_DEPTH_OPACITY[age] : 0.51;
      const up = c >= o;
      const semanticColor = cssStr(up ? '--thm-candle-up' : '--thm-candle-down', up ? '#36f0c5' : '#ff5f7a');
      const wickColor = cssStr('--thm-candle-wick', 'rgba(191,226,242,.62)');
      return {
        time: n.date as Time,
        open: o,
        high: h,
        low: l,
        close: c,
        color: colorWithAlpha(semanticColor, opacity),
        borderColor: colorWithAlpha(semanticColor, Math.min(1, opacity + 0.08)),
        wickColor: colorWithAlpha(wickColor, opacity),
      };
    });

    const volumeData = visibleNodes.map((n) => {
      const b = n.underlying_bar;
      const isUp = (b.close >= (b.open ?? b.close));
      return {
        time: n.date as Time,
        // 原来这里是 `b.volume ?? 10000000` —— 成交量缺失时凭空编一千万。
        // 本作的立场是宁可不画也不编，所以缺失记 0 并在下方整体隐藏量图。
        value: b.volume ?? 0,
        color: isUp ? cssStr('--thm-chart-vol-up', 'rgba(16, 185, 129, 0.4)')
                    : cssStr('--thm-chart-vol-down', 'rgba(239, 68, 68, 0.4)'),
      };
    });

    /* ── 盘中模式 ──────────────────────────────────────────────────────
     *
     * 这里有**两条数据路径**，取决于数据包给的是什么粒度：
     *
     * A. 真实分钟 bar（R1 已全量切到 1m）→ **直接画，不做任何推演**。
     *    harv 的裁定（REPLAN_2）：「旧的小时锚点+布朗桥不再作为玩家可见主数据」。
     *    有真的就用真的，一个模拟点都不该出现在玩家眼前。
     *
     * B. 小时锚点（尚未切换的战役）→ 保留 derivePathForBar 的推演路径，
     *    但**步长必须由真实 bar 间隔算出**，不能写死一小时。
     *
     * ⚠️ 这里原来是 `const stepSec = 3600 / DEFAULT_STEPS_PER_BAR`，
     * 即"一根 bar 必是一小时"。数据换成 1m 之后这个假设就成了错的：
     * 每根分钟 bar 的 24 个子点被摊到整整一小时，390 根一小时的斜坡互相重叠，
     * 末尾还多出一小时。`intraday_realtime_axis.test.ts` 量到的跨度是
     * 26940 秒 / 应为 ≤23460 秒 —— 是那条测试先抓出来的，不是看代码看出来的。
     *
     * 折线/面积而不画蜡烛的原因在 A 路径下已经变了：真实 1m 是有 O/H/L/C 的，
     * 蜡烛不再构成"暗示不存在的分钟 OHLC"。但要不要改成蜡烛是显示层决策，
     * 归 dante/harv 定，这里不擅自改观感，只把数据的真实性修对。
     */
    const intradaySeries: Array<{ time: Time; value: number }> = [];
    const intradayVolume: Array<{ time: Time; value: number; color: string }> = [];
    let intradayMode: IntradaySeriesMode | null = null;
    if (displayMode === 'INTRADAY' && intradayModel) {
      intradayMode = intradayModel.mode;
      intradayModel.points.forEach((point) => {
        intradaySeries.push({ time: point.timeSec as Time, value: point.price });
      });
      intradayModel.volume?.forEach((item) => {
        intradayVolume.push({
          time: item.timeSec as Time,
          value: item.volume,
          color: item.up ? cssStr('--thm-chart-vol-up', 'rgba(16, 185, 129, 0.35)')
                         : cssStr('--thm-chart-vol-down', 'rgba(239, 68, 68, 0.35)'),
        });
      });
    }
    const intradayReady = intradaySeries.length > 1;

    /**
     * 盘中参考线：前收盘 + VWAP（2026-08-19 claude）
     *
     * 为什么加这两条：评审要「command chart」，但**事件针脚在盘中轴上落不了地**
     * （事件只有日期没有时刻，钉在开盘那根 bar 上等于编一个时间）。
     * 而真正的交易终端在盘中图上常驻的就是这两条，且**两条我都算得出来**：
     *
     *   前收盘  = 前一个交易日的日线收盘价，直接取，纯真实数据
     *   VWAP    = Σ(价×量) / Σ量，由已有的盘中价与已有的成交量算出
     *
     * 都不是装饰：前收盘决定"今天是红是绿"，VWAP 是机构成交的分水岭。
     * 没有量（VIX 这类指数）就不画 VWAP——不拿等权均价冒充 VWAP。
     */
    let prevClose: number | null = null;
    if (visibleNodes.length >= 2) {
      const c = visibleNodes[visibleNodes.length - 2]?.underlying_bar?.close;
      if (Number.isFinite(c)) prevClose = c as number;
    }
    let vwap: number | null = null;
    if (intradayReady && intradayVolume.length > 0) {
      // 按时间戳把量对到价上；对不上的点直接跳过，不用邻近值凑
      const volAt = new Map<string, number>();
      for (const v of intradayVolume) volAt.set(String(v.time), v.value);
      let pv = 0;
      let vv = 0;
      for (const pt of intradaySeries) {
        const vol = volAt.get(String(pt.time));
        if (!Number.isFinite(vol as number) || (vol as number) <= 0) continue;
        pv += pt.value * (vol as number);
        vv += vol as number;
      }
      if (vv > 0) vwap = pv / vv;
    }

    const lineData =
      displayMode === 'INTRADAY' && intradayReady
        ? intradaySeries
        : visibleNodes.map((n) => ({ time: n.date as Time, value: n.underlying_bar.close }));

    if (displayMode === 'INTRADAY' && intradayReady) {
      priceSeriesRef.current.setData(intradaySeries);
    } else if (displayMode === 'CANDLE') {
      priceSeriesRef.current.setData(candleData);
    } else {
      priceSeriesRef.current.setData(lineData);
    }
    // 光晕层喂同一份数据。喂不同的数据会看到两条错位的线，
    // 那不是发光是重影。
    if (glowSeriesRef.current) glowSeriesRef.current.setData(lineData);
    if (showVolume && displayMode === 'INTRADAY' && intradayReady) {
      // 盘中量柱可能为空（指数无量）——空数组就是"不画"，不是画一排 0
      volumeSeriesRef.current.setData(intradayVolume);
    } else if (showVolume) {
      volumeSeriesRef.current.setData(volumeData);
    } else {
      volumeSeriesRef.current.setData([]);
    }

    // Add Trade Markers only to the candlestick view; the area/line modes are
    // intentionally clean price views, not a second GEX/position chart.
    const markers: SeriesMarker<Time>[] = [];
    buyIndices.forEach((idx) => {
      if (displayMode !== 'CANDLE') return;
      const chartIndex = idx;
      if (chartIndex < visibleNodes.length) {
        markers.push({
          time: visibleNodes[chartIndex].date as Time,
          position: 'belowBar',
          color: cssStr('--thm-chart-up', '#10b981'),
          shape: 'arrowUp',
          text: 'BUY',
          size: 2,
        });
      }
    });

    sellIndices.forEach((idx) => {
      if (displayMode !== 'CANDLE') return;
      const chartIndex = idx;
      if (chartIndex < visibleNodes.length) {
        markers.push({
          time: visibleNodes[chartIndex].date as Time,
          position: 'aboveBar',
          color: cssStr('--thm-chart-down', '#ef4444'),
          shape: 'arrowDown',
          text: 'SELL',
          size: 2,
        });
      }
    });

    /**
     * 事件针脚（2026-08-19 claude）
     *
     * 两位评审独立给了同一条最高优先级：现在是"一大块画布上一根裸线"，
     * 参考图的硬核感来自**行情和剧情节点对得上同一条时间轴**。
     *
     * 只画调用方传进来的（已揭晓的）事件；这里再做一道日期上限过滤，
     * 是因为防前视这种事**多一道无害，少一道就漏**：
     * 图表层拿到一条未来事件就会把针脚画在未来的位置上，
     * 玩家一眼就能看出"那天有事发生"。
     */
    /**
     * ⚠️ 针脚只能画在**日期轴**上。
     *
     * 盘中模式的时间轴是小时级 unix 时间戳，日期字符串 "2025-01-30" 落不上去——
     * 第一版我没注意，针脚在默认的盘中模式下**一根都没画出来**，
     * 而事件条照常显示，看着像做完了。
     *
     * 不给盘中模式硬凑位置：事件只有日期、没有具体时刻，
     * 把它钉在开盘那根 bar 上等于声称"这事发生在 09:30"，那是编的。
     * 盘中模式下针脚交给下方事件条，日线模式才画针。
     */
    const dateAxis = displayMode !== 'INTRADAY';
    const lastDate = visibleNodes.length ? visibleNodes[visibleNodes.length - 1].date : '';
    const pinnable = dateAxis
      ? (eventPins ?? []).filter((p) => p.date && (!lastDate || p.date <= lastDate))
      : [];
    // 同一天多条事件只画一根针，文字取第一条——一天堆五根针会糊成一片
    const byDate = new Map<string, ChartEventPin>();
    for (const p of pinnable) if (!byDate.has(p.date)) byDate.set(p.date, p);
    for (const [date, pin] of byDate) {
      markers.push({
        time: date as Time,
        position: 'aboveBar',
        color:
          pin.tone === 'risk'
            ? cssStr('--thm-chart-down', '#ef4444')
            : pin.tone === 'good'
            ? cssStr('--thm-chart-up', '#10b981')
            : cssStr('--thm-chart-cross', '#38bdf8'),
        shape: 'circle',
        // 标题会截断——针脚是"这里有事"的锚点，全文在下面的事件条里
        text: pin.headline.length > 10 ? pin.headline.slice(0, 10) + '…' : pin.headline,
        size: 1,
      });
    }

    /**
     * 挂参考线。
     *
     * 先把上一轮的全部摘掉——lightweight-charts 的 priceLine 是**累加**的，
     * 不清就每次刷新叠一层，推进几天之后图上会横着七八条一样的线。
     */
    for (const l of refLinesRef.current) {
      try { priceSeriesRef.current?.removePriceLine?.(l); } catch { /* series 已被换掉 */ }
    }
    refLinesRef.current = [];
    if (displayMode === 'INTRADAY' && intradayReady && typeof priceSeriesRef.current?.createPriceLine === 'function') {
      if (prevClose != null) {
        refLinesRef.current.push(
          priceSeriesRef.current.createPriceLine({
            price: prevClose,
            color: cssStr('--thm-chart-text', '#94a3b8'),
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: '前收 PREV',
          }),
        );
      }
      if (vwap != null) {
        refLinesRef.current.push(
          priceSeriesRef.current.createPriceLine({
            price: vwap,
            color: cssStr('--thm-chart-line2', '#fbbf24'),
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: 'VWAP',
          }),
        );
      }
    }

    // Sort markers by time
    markers.sort((a, b) => (String(a.time) > String(b.time) ? 1 : -1));
    if (typeof (priceSeriesRef.current as any)?.setMarkers === 'function') {
      (priceSeriesRef.current as any).setMarkers(markers);
    }

    if (chartRef.current) {
      // fitContent() stretches whatever bars exist to fill 100% of the container width --
      // with only 1-2 real bars (e.g. Day 1 of a short campaign) that turns a single candle
      // into one giant block. Below a sane bar count, use a fixed bar width instead so a
      // sparse chart reads as "a few narrow candles with empty space", not a smear.
      const MIN_BARS_FOR_FIT = 5;
      // 盘中模式一天就有 169 个点，永远该铺满。
      // 原来这里只看日线节点数（第 4 天 = 4 < 5），于是走了 barSpacing:28 的稀疏分支，
      // 169 × 28px = 4700px 塞进 836px 的容器，实机只看得到约 30 个点、约一小时。
      const intradayFit = displayMode === 'INTRADAY' && intradaySeries.length > 1;
      if (intradayFit || visibleNodes.length >= MIN_BARS_FOR_FIT) {
        chartRef.current.timeScale().fitContent();
      } else {
        chartRef.current.timeScale().applyOptions({ barSpacing: 28 });
        chartRef.current.timeScale().scrollToPosition(0, false);
      }
    }

    let overlayFrame = 0;
    if (displayMode === 'CANDLE' && latestNode && chartRef.current && chartContainerRef.current) {
      overlayFrame = window.requestAnimationFrame(() => {
        const b = latestNode.underlying_bar;
        const open = b.open ?? b.close;
        const close = b.close;
        const high = b.high ?? Math.max(open, close);
        const low = b.low ?? Math.min(open, close);
        const x = chartRef.current?.timeScale().timeToCoordinate(latestNode.date as Time);
        const yOpen = priceSeriesRef.current?.priceToCoordinate?.(open);
        const yClose = priceSeriesRef.current?.priceToCoordinate?.(close);
        const yHigh = priceSeriesRef.current?.priceToCoordinate?.(high);
        const yLow = priceSeriesRef.current?.priceToCoordinate?.(low);
        const width = chartContainerRef.current?.clientWidth ?? 0;
        const height = chartContainerRef.current?.clientHeight ?? 0;
        if ([x, yOpen, yClose, yHigh, yLow, width, height].every((value) => typeof value === 'number' && Number.isFinite(value)) && width > 0 && height > 0) {
          const animationKey = `${campaignId}:${latestNode.date}`;
          const isNew = !animatedCandleKeys.has(animationKey);
          if (isNew) {
            animatedCandleKeys.add(animationKey);
            if (animatedCandleKeys.size > 200) animatedCandleKeys.delete(animatedCandleKeys.values().next().value as string);
          }
          const next: CurrentCandleOverlay = {
            x: x as number,
            yOpen: yOpen as number,
            yClose: yClose as number,
            yHigh: yHigh as number,
            yLow: yLow as number,
            width,
            height,
            isUp: close >= open,
            isNew,
          };
          setCurrentCandleOverlay((previous) => previous
            && previous.x === next.x
            && previous.yOpen === next.yOpen
            && previous.yClose === next.yClose
            && previous.width === next.width
            && previous.height === next.height
            && previous.isUp === next.isUp
            && previous.isNew === next.isNew
              ? previous
              : next);
        }
      });
    } else {
      setCurrentCandleOverlay(null);
    }

    let liveOverlayFrame = 0;
    if (displayMode === 'INTRADAY' && intradayReady && chartRef.current && chartContainerRef.current) {
      liveOverlayFrame = window.requestAnimationFrame(() => {
        const latest = intradaySeries[intradaySeries.length - 1];
        if (!latest) return;
        const x = chartRef.current?.timeScale().timeToCoordinate(latest.time);
        const y = priceSeriesRef.current?.priceToCoordinate?.(latest.value);
        const width = chartContainerRef.current?.clientWidth ?? 0;
        const height = chartContainerRef.current?.clientHeight ?? 0;
        if ([x, y, width, height].every((value) => typeof value === 'number' && Number.isFinite(value)) && width > 0 && height > 0) {
          const next: LivePriceOverlay = { x: x as number, y: y as number, width, height };
          setLivePriceOverlay((previous) => previous
            && previous.x === next.x
            && previous.y === next.y
            && previous.width === next.width
            && previous.height === next.height
              ? previous
              : next);
        }
      });
    } else {
      setLivePriceOverlay(null);
    }

    const readinessFrame = window.requestAnimationFrame(() => {
      const width = chartContainerRef.current?.clientWidth ?? 0;
      const height = chartContainerRef.current?.clientHeight ?? 0;
      const bodyPixels = visibleNodes.map((node) => {
        const open = node.underlying_bar.open ?? node.underlying_bar.close;
        const close = node.underlying_bar.close;
        const yOpen = priceSeriesRef.current?.priceToCoordinate?.(open);
        const yClose = priceSeriesRef.current?.priceToCoordinate?.(close);
        return typeof yOpen === 'number' && typeof yClose === 'number'
          ? Math.abs(yClose - yOpen)
          : Number.NaN;
      });
      setChartReady(isChartReady({
        containerWidth: width,
        containerHeight: height,
        priceSeriesMounted: Boolean(priceSeriesRef.current),
        volumeSeriesMounted: Boolean(volumeSeriesRef.current),
        validOhlc: hasValidOhlc(visibleNodes),
        bodyPixels,
      }));
    });
    return () => {
      window.cancelAnimationFrame(overlayFrame);
      window.cancelAnimationFrame(liveOverlayFrame);
      window.cancelAnimationFrame(readinessFrame);
    };
    // themeTick 必须在这里也列一份：切主题会重建图表、series ref 全部换新，
    // 这个 effect 不跟着重跑的话，新图表拿不到数据 —— 会白屏。
    // （displayMode 在这两处都出现，也正是同一个原因。）
  }, [visibleNodes, buyIndices, sellIndices, showVolume, displayMode, intradayModel, themeTick, eventPins]);

  useEffect(() => {
    onChartReady?.(chartReady);
  }, [chartReady, onChartReady]);

  const activeDisplay = hoveredBar || (latestNode ? {
    time: latestNode.date,
    open: latestNode.underlying_bar.open ?? latestNode.underlying_bar.close,
    high: latestNode.underlying_bar.high ?? latestNode.underlying_bar.close,
    low: latestNode.underlying_bar.low ?? latestNode.underlying_bar.close,
    close: latestNode.underlying_bar.close,
    volume: latestNode.underlying_bar.volume ?? 0,
  } : null);

  const priceDiff = activeDisplay ? activeDisplay.close - activeDisplay.open : 0;
  const pctDiff = activeDisplay && activeDisplay.open > 0 ? (priceDiff / activeDisplay.open) * 100 : 0;

  return (
    /* 舞台高度随可见 K 线数变化。
       V30 UI 把主图从固定 460px 放大到视口比例后，开局只有 1 根 K 线那天
       变成"一大片空"——舞台越大越显空，改动反而帮了倒忙。
       所以少于 4 根时收回接近原高度，等数据长出来再展开。 */
    <div className="ot-panel pcp-panel" data-density={visibleNodes.length < 4 ? 'sparse' : 'full'} data-chart-ready={chartReady ? 'true' : 'false'} data-visual-key="price-chart">
      {/* Top Header & HUD */}
      <div className="ot-section-header pcp-header" data-visual-key="hero-header">
          <div className="pcp-header-left">
            <div className="pcp-hero-identity">
              <span className="font-mono pcp-symbol">{campaignId === 'r1' ? 'NVDA' : 'SPX'}</span>
              <span className="pcp-company-name">{campaignId === 'r1' ? 'NVIDIA Corporation · 英伟达' : 'S&P 500 Index · 标普500指数'}</span>
            </div>

          {activeDisplay && (
            <>
              <div className="pcp-price-row font-mono" data-visual-key="hero-price-readout">
                <strong className="pcp-hero-price">{fmt(activeDisplay.close)}</strong>
                <span className={`pcp-hero-change ${priceDiff >= 0 ? 'pcp-up' : 'pcp-down'}`}>
                  {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)} ({pctDiff >= 0 ? '+' : ''}{pctDiff.toFixed(2)}%)
                </span>
              </div>
              <div className="pcp-ohlc font-mono">
              <span className="pcp-ohlc-item">O: <strong className="pcp-neutral">{fmt(activeDisplay.open)}</strong></span>
              <span className="pcp-ohlc-item">H: <strong className="pcp-up">{fmt(activeDisplay.high)}</strong></span>
              <span className="pcp-ohlc-item">L: <strong className="pcp-down">{fmt(activeDisplay.low)}</strong></span>
              <span className="pcp-ohlc-item">C: <strong className={priceDiff >= 0 ? 'pcp-up' : 'pcp-down'}>{fmt(activeDisplay.close)}</strong></span>
            </div>
            </>
          )}
          {displayMode === 'INTRADAY' && intradayModel && (
            <span
              className={`pcp-truth-badge ${intradayModel.mode === 'REAL_1M' ? 'is-real' : 'is-simulated'}`}
              data-testid="chart-truth-badge"
            >
              {intradayModel.mode === 'REAL_1M'
                ? 'REAL · 1M ARCHIVE'
                : intradayModel.mode === 'DERIVED_FROM_DAILY_OHLC'
                  ? 'SIMULATED · DAILY OHLC ANCHORED'
                  : 'SIMULATED · REAL INTRADAY ANCHORS'}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="pcp-controls">
          <div className="pcp-range-strip" data-testid="chart-range-strip">
            <div className="pcp-range-group" role="group" aria-label="时间范围">
              {RANGE_KEYS.map((key) => {
                const need = needFor(key);
                const available = need <= availableHistory.length;
                return (
                  <button
                    key={key}
                    onClick={() => available && setRange(key)}
                    disabled={!available}
                    className={`pcp-range-btn font-mono ${range === key ? 'pcp-range-btn-active' : ''} ${!available ? 'pcp-range-btn-unavail' : ''}`}
                    title={!available ? `历史数据不足：需 ${need} 个交易日，当前仅 ${availableHistory.length} 个` : undefined}
                  >
                    <span className="pcp-range-label-full">{key}</span>
                    <span className="pcp-range-label-short">{RANGE_SHORT_LABELS[key]}</span>
                    {!available && <span className="pcp-range-lock" aria-hidden> 🔒</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main TradingView Lightweight Canvas Container */}
      <div className="pcp-chart-stage">
        <div ref={chartContainerRef} className="pcp-chart" aria-label="正股价格图" data-testid="chart-canvas" />
        {currentCandleOverlay && (
          <svg
            className="ot-current-candle-overlay"
            viewBox={`0 0 ${currentCandleOverlay.width} ${currentCandleOverlay.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            data-testid="current-candle-overlay"
          >
            <line
              x1="6"
              x2={Math.max(6, currentCandleOverlay.width - 62)}
              y1={currentCandleOverlay.yClose}
              y2={currentCandleOverlay.yClose}
              className="ot-current-price-line"
            />
            <g className={`ot-candle ${currentCandleOverlay.isUp ? 'ot-candle--up' : 'ot-candle--down'} ot-candle--current${currentCandleOverlay.isNew ? ' ot-candle--new' : ''}`}>
              <line
                x1={currentCandleOverlay.x}
                x2={currentCandleOverlay.x}
                y1={currentCandleOverlay.yHigh}
                y2={currentCandleOverlay.yLow}
                className="ot-candle__wick"
              />
              <rect
                x={currentCandleOverlay.x - 5}
                y={Math.min(currentCandleOverlay.yOpen, currentCandleOverlay.yClose)}
                width="10"
                height={Math.max(2, Math.abs(currentCandleOverlay.yClose - currentCandleOverlay.yOpen))}
                rx="1"
                className="ot-candle__body"
              />
            </g>
            <circle cx={currentCandleOverlay.x} cy={currentCandleOverlay.yClose} r="3" className="ot-current-price-dot" />
          </svg>
        )}
        {displayMode === 'INTRADAY' && livePriceOverlay && (
          <>
            <div className="ot-market-sweep" aria-hidden="true" />
            <svg
              className="ot-live-price-overlay"
              viewBox={`0 0 ${livePriceOverlay.width} ${livePriceOverlay.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
              data-testid="live-price-overlay"
            >
              <line
                x1="6"
                x2={Math.max(6, livePriceOverlay.width - 62)}
                y1={livePriceOverlay.y}
                y2={livePriceOverlay.y}
                className="ot-live-price-guide"
              />
              <line
                x1={Math.max(0, livePriceOverlay.x - 78)}
                x2={livePriceOverlay.x}
                y1={livePriceOverlay.y}
                y2={livePriceOverlay.y}
                className="ot-live-price-tail"
              />
              <circle cx={livePriceOverlay.x} cy={livePriceOverlay.y} r="4" className="ot-live-price-ring ot-live-price-ring--a" />
              <circle cx={livePriceOverlay.x} cy={livePriceOverlay.y} r="4" className="ot-live-price-ring ot-live-price-ring--b" />
              <circle cx={livePriceOverlay.x} cy={livePriceOverlay.y} r="2.8" className="ot-live-price-core" />
            </svg>
          </>
        )}
        {availableHistory.length === 0 && (
          <div className="pcp-empty-history" data-testid="chart-no-history">当前没有足够历史数据</div>
        )}
      </div>

      {showVolume && (() => {
        const dense = displayMode === 'INTRADAY' ? (intradayModel?.volume ?? []) : [];
        if (dense.length > 0) {
          const maxVolume = Math.max(1, ...dense.map((item) => Number(item.volume || 0)));
          return (
            <div className="pcp-volume-band is-intraday" data-testid="chart-volume-band" data-visual-key="volume-strip" aria-label="Intraday volume field">
              <span className="command-kicker">VOLUME</span>
              <div className="pcp-volume-bars" aria-hidden="true">
                {dense.map((item, index) => (
                  <i
                    key={`${item.timeSec}-${index}`}
                    className={item.up ? 'is-up' : 'is-down'}
                    style={{ height: `${Math.max(2, (Number(item.volume || 0) / maxVolume) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
          );
        }
        const points = visibleNodes.slice(-24);
        const maxVolume = Math.max(1, ...points.map((item) => Number(item.underlying_bar.volume ?? 0)));
        return (
          <div className="pcp-volume-band" data-testid="chart-volume-band" data-visual-key="volume-strip" aria-label="Real reported volume">
            <span className="command-kicker">VOLUME</span>
            <div className="pcp-volume-bars" aria-hidden="true">
              {points.map((item) => {
                const volume = Number(item.underlying_bar.volume ?? 0);
                return <i key={item.date} style={{ height: `${Math.max(2, (volume / maxVolume) * 100)}%` }} />;
              })}
            </div>
          </div>
        );
      })()}

      <div className="pcp-network-band" data-testid="chart-network-band" data-visual-key="network-plane" aria-label="Market decision network">
        <CentralMarketField />
        <svg
          className="pcp-neural-field"
          viewBox="0 0 1000 360"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          focusable="false"
        >
          <g className="pcp-neural-aurora">
            <ellipse cx="205" cy="218" rx="182" ry="112" />
            <ellipse cx="512" cy="154" rx="230" ry="128" />
            <ellipse cx="815" cy="221" rx="176" ry="108" />
          </g>
          <g className="pcp-neural-links">
            {NEURAL_FIELD_EDGES.map((edge, index) => {
              const from = NEURAL_FIELD_POINTS[edge.from];
              const to = NEURAL_FIELD_POINTS[edge.to];
              return (
                <line
                  key={`${edge.from}-${edge.to}-${index}`}
                  className={edge.major ? 'is-major' : undefined}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
          <g className="pcp-neural-spines">
            <path d="M4 268 C118 254 124 95 251 151 S408 314 520 185 S694 44 786 171 S925 278 996 112" vectorEffect="non-scaling-stroke" />
            <path d="M8 115 C125 202 202 281 324 202 S493 41 618 143 S792 319 996 234" vectorEffect="non-scaling-stroke" />
            <path d="M74 346 C181 275 292 312 392 236 S559 90 697 164 S837 255 954 42" vectorEffect="non-scaling-stroke" />
          </g>
          <g className="pcp-neural-nodes">
            {NEURAL_FIELD_POINTS.map((point, index) => (
              <g
                key={index}
                className={`pcp-neural-node energy-${point.energy}`}
                transform={`translate(${point.x} ${point.y})`}
              >
                {point.energy > 1 && <circle className="pcp-neural-node-ring" r={point.energy === 3 ? 10 : 6.5} />}
                <circle className="pcp-neural-node-core" r={point.energy === 3 ? 3.1 : point.energy === 2 ? 2.2 : 1.25} />
              </g>
            ))}
          </g>
        </svg>
        <div className="pcp-network-label">
          <span className="command-kicker">MARKET GRAPH</span>
          <small>PRICE · VOL · EVENTS · RISK</small>
        </div>
        <div className="pcp-network-mesh" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => (
            <span key={index} className={`pcp-network-node pcp-network-node-${index + 1}`} />
          ))}
        </div>
        <div className="pcp-network-readouts font-mono" aria-hidden="true">
          <span>PX</span><span>VOL</span><span>EVT</span><span>RISK</span>
        </div>
      </div>

      <div className="pcp-secondary-controls" data-testid="chart-secondary-controls">
        <div className="pcp-display-group" role="group" aria-label="图表显示模式">
          {([
            ['CANDLE', '蜡烛图'],
            ['AREA', '面积图'],
            ['LINE', '折线图'],
            ...((hasIntradayVisual
              ? [['INTRADAY', '盘中走势']]
              : []) as Array<[DisplayMode, string]>),
          ] as ReadonlyArray<readonly [DisplayMode, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pcp-display-btn ${displayMode === key ? 'pcp-display-btn-active' : ''}`}
              onClick={() => setDisplayMode(key)}
              data-testid={`chart-mode-${key.toLowerCase()}`}
            >
              {label}<span className="en-secondary">{key}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setShowVolume(!showVolume)} className={`pcp-toggle font-mono ${showVolume ? 'pcp-toggle-on-vol' : ''}`}>VOL</button>
        <button onClick={() => setShowGexLines(!showGexLines)} className={`pcp-toggle font-mono ${showGexLines ? 'pcp-toggle-on-gex' : ''}`}>
          Gamma关键位 <span className="en-secondary">GEX LEVELS</span>
        </button>
        <span className="pcp-days font-mono" data-testid="chart-visible-bars">{clampedVisible}/{totalNodeCount} 根战役K线</span>
      </div>

      {/**
        * 事件条（2026-08-19 claude）
        *
        * 针脚只能挂 10 个字，剩下的话得有地方说。这一条把已发生的事件
        * 按时间排开，和上面的针脚是同一批数据——**看图看到一根针，
        * 往下就能读到它是什么事**。参考图那种"行情与剧情互相解释"的感觉
        * 靠的就是这个闭环，光有针脚不够。
        *
        * 只显示最近 6 条：全部铺出来会变成一个日志面板，
        * 那是"复盘与档案"页的事，不是主图该干的。
        */}
      {(eventPins?.length ?? 0) > 0 && (
        <div className="pcp-event-strip" data-testid="chart-event-strip">
          <span className="pcp-event-strip-label">
            事件 <span className="en-secondary">EVENTS</span>
          </span>
          <div className="pcp-event-strip-items">
            {(eventPins ?? []).slice(-6).map((p, i) => (
              <span key={`${p.date}-${i}`} className={`pcp-event-chip pcp-event-${p.tone ?? 'neutral'}`}>
                <span className="pcp-event-dot" aria-hidden />
                <span className="pcp-event-date font-mono">{p.date.slice(5)}</span>
                {/* "SIMULATED ANALYSIS: " 这种前缀会把正文挤没，但真实性标签**不能删**。
                    压成一个短徽章：标签还在，正文也读得到。 */}
                {(() => {
                  const m = /^([A-Z_ ]*(SIMULATED|DERIVED|ESTIMATED|REAL)[A-Z_ ]*)[:：]\s*/.exec(p.headline);
                  const label = m ? m[2] : '';
                  const body = m ? p.headline.slice(m[0].length) : p.headline;
                  return (
                    <>
                      {label && <span className="pcp-event-label">{label.slice(0, 3)}</span>}
                      <span className="pcp-event-text">{body}</span>
                    </>
                  );
                })()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/**
        * 数据边界（2026-08-19 claude 改为收起态）
        *
        * 这块**不能删**：说清"本地只有几天真实数据、哪些区间因此不可用"
        * 是本作的核心承诺，删了就成了假装什么都有。
        *
        * 但它此前是完全展开的一大块：一句说明 + 五个灰掉的区间标签竖着堆，
        * 在首屏吃掉约 200px，而里面几乎没有信息量。评审的原话是
        * 「制造了参考图没有的视觉真空，并把下方已有内容压到折叠线以下」。
        *
        * 折中：**结论那一句永远可见**（几天数据、有区间不可用），
        * 只把"具体是哪几个区间"收进 details。真话一句没少，
        * 首屏从 ~200px 降到一条状态栏。
        */}
      {availableHistory.length < Math.max(...Object.values(RANGE_TRADING_DAYS)) && (() => {
        const blocked = (Object.keys(RANGE_TRADING_DAYS) as Array<Exclude<RangeKey, '本场战役'>>)
          .filter((k) => RANGE_TRADING_DAYS[k] > availableHistory.length);
        return (
          <details className="v28-data-boundary-note pcp-boundary-bar" data-testid="chart-history-boundary">
            <summary className="pcp-boundary-summary">
              <strong>数据边界</strong>
              <span className="pcp-boundary-fact">
                本地 {availableHistory.length} 个已准入真实交易日 · {blocked.length} 个区间暂不可用
              </span>
              <span className="pcp-boundary-more">详情</span>
            </summary>
            <div className="pcp-boundary-detail">
              {blocked.map((k) => (
                <span key={k} className="v28-boundary-tag">{k}（需 {RANGE_TRADING_DAYS[k]} 日）</span>
              ))}
              <span className="pcp-boundary-why">缺少对应时段的本地真实数据——不做外推，也不用模型值顶替。</span>
            </div>
          </details>
        );
      })()}

      {/* GEX Level Floating Overlay Badges */}
      {showGexLines && (callWall || putWall || gammaFlip) && (
        <div className="pcp-gex-overlay">
          {callWall && (
            <div className="pcp-gex-badge pcp-gex-call font-mono">
              看涨墙 <span className="en-secondary">CALL WALL</span> · ${callWall.toFixed(0)}
            </div>
          )}
          {gammaFlip && (
            <div className="pcp-gex-badge pcp-gex-flip font-mono">
              Gamma翻转位 <span className="en-secondary">GAMMA FLIP</span> · ${gammaFlip.toFixed(0)}
            </div>
          )}
          {putWall && (
            <div className="pcp-gex-badge pcp-gex-put font-mono">
              看跌墙 <span className="en-secondary">PUT WALL</span> · ${putWall.toFixed(0)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
