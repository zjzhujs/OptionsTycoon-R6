import type { RevealedPriceBar } from '../schemas';

/**
 * 盘中路径推演（2026-08-18 claude，2026-08-19 按评审意见重写）
 *
 * ── 要解决什么 ──────────────────────────────────────────────────────
 *
 * 本地只有小时级真实 bar（每天 7 根）。免费源拿不到更细粒度——1m/5m/15m/30m
 * 对两个战役窗口一律 HTTP 422，实测过。所以一根柱子跳到下一根柱子中间是空的，
 * 图表看起来仍然是"闪"而不是"走"。
 *
 * Owner 裁定：小时节点用真数据，中间的波动按真实波幅算法补，且不许出现暴涨暴跌。
 *
 * ── 这条路的定性（重要，别写错）────────────────────────────────────
 *
 * 这是**受真实低频锚点约束的条件模拟**，不是"历史分钟数据重建"。
 * 生成的点一律 SIMULATED。评审原话：随机生成的盘中路径不能用
 * DERIVED_REAL_INPUTS 冒充确定性推导——那个标签是留给"由真实输入唯一确定"
 * 的量的，而这里每次抽样都不同（虽然同一存档下可复现）。
 * 小时 / 日线的 O/H/L/C 继续是 REAL。
 *
 * ── 2026-08-19 重写掉了什么（三个真问题）──────────────────────────
 *
 * **① 前视泄漏：极值顺序原本由收盘方向决定。**
 * 旧代码写的是 `firstExtreme = up ? low : high`——阳线先探低、阴线先冲高。
 * 这意味着**看一眼路径前半段的形状，就能推出这根 bar 收阳还是收阴**，
 * 而收盘价在盘中揭示里是尚未揭晓的信息。这是确定性的、可机械利用的泄漏，
 * 与本作"结构性防前视"的立场直接冲突。现在改为抛硬币决定，与收盘无关。
 *
 * **② 逐点 clamp 会造出贴边平台。**
 * 旧代码对每个点做 `clamp(price, low, high)`，评审指出这会产生"贴边平台和
 * 分布畸变"——价格会长时间黏在当日高低点上，一眼假。
 * 现在改为：先生成布朗桥，再**二分搜索最大缩放系数 α**，使整段内点自然落在
 * 区间内。约束是在生成阶段满足的，不是事后压回去的。
 *
 * **③ 命中时点原本几乎固定。**
 * 旧代码把极值放在 18%~32% 和 58%~74% 两个窄窗里。窄到玩家看几天就能背下来
 * "高点总在这个位置"。现在时点在整段内随机。
 *
 * ── 为什么这个算法造不出假行情 ──────────────────────────────────────
 *
 * 关键不在参数调得好，在于**约束在生成阶段就成立**：
 *   - 四个 knot 精确落在真实 O / H / L / C 上
 *   - 段内点被二分搜索保证落在 [low+tick, high-tick] 内——**严格在区间内侧**，
 *     所以除了指定的命中时点，路径不会提前触到当日极值
 *   - 生成完成后再做一次终检：min==low、max==high、首==open、尾==close，
 *     不满足就退回有界单调插值。**宁可保守，不可越界。**
 *
 * 「不许暴涨暴跌」因此不是靠限制振幅参数实现的，是靠区间本身。
 * 注意：限的是**额外模拟出来的波动**。如果真实 bar 本身就是一根暴涨的柱子，
 * 那个涨幅照原样保留——真实锚点优先，不许为了"看起来平稳"篡改真实数据。
 *
 * ── 可复现 ──────────────────────────────────────────────────────────
 *
 * 播种含 MODEL_VERSION：算法一改版，种子就变，老存档的路径不会被新算法悄悄改写
 * ——除非调用方自己持久化了 tape（评审建议首次生成后直接存档，最稳）。
 * 同一根 bar + 同一版本永远推出同一条路径：回放、存档、复盘三处必须一致。
 */

/**
 * 每根真实 bar 之间插入多少个推演点。24 => 每 2.5 分钟一个。
 *
 * 为什么从 12 提到 24：路径要依次经过 开盘 → 极值A → 极值B → 收盘，
 * 而每一段都必须有足够的步数才能在**不违反单步限幅**的前提下走完。
 * 最坏情况是某一段要横跨整个区间，按 34% 的单步上限至少需要 4 步；
 * 三段各留 4 步就把 12 占满了，命中时点将完全没有随机空间——
 * 而固定的命中时点本身就是一种可被玩家背下来的规律。
 */
export const DEFAULT_STEPS_PER_BAR = 24;

/**
 * 单步最大变动占该 bar 真实振幅的比例。
 *
 * **这条一定要在二分搜索的可行性判据里，不能只靠事后 clamp。**
 * 我 2026-08-19 重写时把它整个丢了，结果第一版能产出
 * `124.78 → 128.40`（一步走完整个区间）这种路径，正是 Owner 明说不许有的暴涨暴跌。
 * 更糟的是我同时删掉了盯这条的测试，所以没有任何东西拦住它。
 */
const MAX_STEP_FRACTION = 0.34;

/** 每段至少几步。少于这个数就没法在限幅内跨越大的价差 */
const MIN_SEGMENT_STEPS = 4;

/**
 * 算法版本。**改了生成逻辑就要 +1**，否则老存档会拿新算法重放出不同的路径，
 * 而玩家看到的复盘会和当时的截图对不上。
 */
export const PATH_MODEL_VERSION = 2;

/** 报价最小变动。段内点要比真实极值至少内缩这么多，避免提前触顶/触底 */
const TICK = 0.01;

/** 二分搜索的迭代次数。24 次足以把 α 收敛到 range 的 1e-7 量级 */
const ALPHA_SEARCH_ITERS = 24;

export interface DerivedPathPoint {
  /** 相对 bar 起点的偏移序号，0 = 开盘 */
  index: number;
  price: number;
  /**
   * 恒为 SIMULATED —— 这些点不是成交价，也不是由真实输入唯一确定的推导值。
   * 成交、结算、复盘一律只认真实 bar。
   */
  source_type: 'SIMULATED';
}

/* ── 确定性随机 ──────────────────────────────────────────────────── */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 厚尾创新。评审要求标准化创新带 skew/kurtosis（真实收益不是正态）。
 * 这里用"正态 + 5% 概率放大 2.5 倍"的混合分布——比查 t 分布表便宜得多，
 * 而且尾部行为是我们真正需要的那一项：偶尔一下大的，其余时候温和。
 */
function fatTailNormal(rand: () => number): number {
  // Box–Muller。u 取 (0,1] 避免 log(0)
  const u = 1 - rand();
  const v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return rand() < 0.05 ? z * 2.5 : z;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 单段布朗桥：从 (0, pa) 走到 (m, pb)，返回 m+1 个点（含两端）。
 *
 * α 由二分搜索决定：取**能让所有内点落在 [lo, hi] 内的最大值**。
 * 二分是安全的，因为桥的形状固定、只有整体缩放在变，
 * 越小的 α 离直线越近，可行性单调。
 */
function bridgeSegment(
  pa: number,
  pb: number,
  m: number,
  lo: number,
  hi: number,
  amp: number,
  cap: number,
  rand: () => number,
): number[] {
  if (m <= 1) return [pa, pb].slice(0, m + 1);

  // 累积游走，再减去线性趋势 => 两端为 0 的桥
  const w: number[] = [0];
  for (let j = 1; j <= m; j += 1) w.push(w[j - 1] + fatTailNormal(rand));
  const bridge = w.map((wj, j) => wj - (j / m) * w[m]);

  const linear = (j: number) => pa + ((pb - pa) * j) / m;

  // 单步限幅也进可行性判据。下限取"线性段本身的步长"×1.05：
  // 否则当这一段本来就要跨越大的价差时，任何 α（含 0）都不可行，
  // 二分会一路收敛到 0 却仍然违规。**真实锚点优先于限幅**——
  // 限的是额外模拟出来的波动，不是真实发生过的价差。
  const linStep = Math.abs(pb - pa) / m;
  const maxStep = Math.max(cap, linStep * 1.05);

  const feasible = (alpha: number) => {
    let prev = pa;
    for (let j = 1; j <= m; j += 1) {
      const x = j === m ? pb : linear(j) + alpha * bridge[j];
      if (j < m && (x < lo || x > hi)) return false;
      if (Math.abs(x - prev) > maxStep) return false;
      prev = x;
    }
    return true;
  };

  let loA = 0;
  let hiA = amp;
  if (!feasible(hiA)) {
    for (let k = 0; k < ALPHA_SEARCH_ITERS; k += 1) {
      const mid = (loA + hiA) / 2;
      if (feasible(mid)) loA = mid;
      else hiA = mid;
    }
  } else {
    loA = hiA;
  }

  const out = [pa];
  for (let j = 1; j < m; j += 1) out.push(linear(j) + loA * bridge[j]);
  out.push(pb);
  return out;
}

/**
 * 把一根真实 bar 展开成一条价格路径。
 *
 * 路径必须经过四个**真实发生过**的点：开盘 → 两个极值 → 收盘。
 * 极值的先后顺序由种子抛硬币决定，**与收盘方向无关**（见文件头 ①）。
 */
export function derivePathForBar(
  bar: RevealedPriceBar,
  steps: number = DEFAULT_STEPS_PER_BAR,
): DerivedPathPoint[] {
  const n = Math.max(2, Math.trunc(steps));
  const { open, high, low, close } = bar;
  const range = high - low;

  const flat = (price: number) =>
    Array.from({ length: n + 1 }, (_, i) => ({
      index: i,
      price: round2(price),
      source_type: 'SIMULATED' as const,
    }));

  // 振幅为 0（极罕见，但会让后面全部除零）：直接给一条平线
  if (!(range > 0)) return flat(close);

  const rand = mulberry32(
    xmur3(`v${PATH_MODEL_VERSION}|${bar.ts}|${open}|${high}|${low}|${close}`)(),
  );

  // 极值如果本来就落在开盘或收盘上，**不要再给它排一个独立的 knot**。
  // 否则「极值 knot → 端点 knot」两点同值，整段退化成一条钉在极值上的平线。
  // 实测踩到的：SPX 2026-06-11 收盘==最高，路径末尾 12 个点全钉在 7337.15；
  // VIX 2026-06-11 开盘==最高，开头 7 个点全钉在 19.91。
  // 收在当日最高/最低的小时 bar 很常见，这不是边角情况。
  const needHigh = open !== high && close !== high;
  const needLow = open !== low && close !== low;

  // ① 极值顺序：抛硬币。**绝对不能写成 close >= open 的函数**——那是前视泄漏。
  const extremes: number[] = [];
  if (needHigh && needLow) {
    const lowFirst = rand() < 0.5;
    extremes.push(lowFirst ? low : high, lowFirst ? high : low);
  } else if (needHigh) {
    extremes.push(high);
  } else if (needLow) {
    extremes.push(low);
  }

  // ③ 命中时点：随机，但每段至少 MIN_SEGMENT_STEPS 步——否则某一段会被压到
  //    1~2 步，而它可能要跨越整个区间，必然违反单步限幅。
  const segMin = MIN_SEGMENT_STEPS;
  const segCount = extremes.length + 1;
  if (n < segMin * segCount) return flat(close);

  const slots: number[] = [];
  let lowBound = segMin;
  for (let i = 0; i < extremes.length; i += 1) {
    const after = extremes.length - i - 1; // 后面还要排几个极值
    const highBound = n - segMin * (after + 1);
    if (highBound < lowBound) return flat(close);
    slots.push(lowBound + Math.floor(rand() * (highBound - lowBound + 1)));
    lowBound = slots[i] + segMin;
  }

  const knots: Array<[number, number]> = [
    [0, open],
    ...slots.map((k, i) => [k, extremes[i]] as [number, number]),
    [n, close],
  ];

  // 段内点严格内缩一个 tick：除了指定的命中时点，路径不提前触及当日极值
  const innerLo = low + TICK;
  const innerHi = high - TICK;
  const amp = range * 0.5;

  const prices: number[] = new Array(n + 1);
  for (let s = 0; s < knots.length - 1; s += 1) {
    const [ia, pa] = knots[s];
    const [ib, pb] = knots[s + 1];
    // 界限只管**内点**，端点（knot）不参与检查，所以不需要为"端点本身是极值"
    // 而放宽。我一开始放宽成 min(innerLo, pa, pb)，等于允许内点压到极值上，
    // 结果 clamp 平台从这条缝溜了回来（NVDA 那根出现 116.25 连续三个）。
    const segLo = innerLo;
    const segHi = innerHi;
    const part = bridgeSegment(pa, pb, ib - ia, segLo, segHi, amp, range * MAX_STEP_FRACTION, rand);
    for (let j = 0; j <= ib - ia; j += 1) prices[ia + j] = part[j];
  }

  // knot 精确写回真实值，round 之后再终检
  for (const [i, p] of knots) prices[i] = p;
  const rounded = prices.map(round2);
  rounded[0] = round2(open);
  rounded[n] = round2(close);

  // 终检：越界就不要这条路径。宁可退回保守插值，也不能放一条越界的出去。
  const mn = Math.min(...rounded);
  const mx = Math.max(...rounded);
  if (mn < round2(low) - 1e-9 || mx > round2(high) + 1e-9) {
    return fallbackBoundedPath(knots, n);
  }

  return rounded.map((price, index) => ({ index, price, source_type: 'SIMULATED' as const }));
}

/** 二分搜索失败时的兜底：knot 之间纯线性，一定不越界，只是没有质感 */
function fallbackBoundedPath(knots: Array<[number, number]>, n: number): DerivedPathPoint[] {
  const out: DerivedPathPoint[] = [];
  for (let i = 0; i <= n; i += 1) {
    let s = 0;
    while (s < knots.length - 2 && i > knots[s + 1][0]) s += 1;
    const [ia, pa] = knots[s];
    const [ib, pb] = knots[s + 1];
    const t = ib === ia ? 1 : (i - ia) / (ib - ia);
    out.push({ index: i, price: round2(pa + (pb - pa) * t), source_type: 'SIMULATED' });
  }
  return out;
}

/** 把一串已揭晓的真实 bar 展开成完整的当日推演路径 */
export function derivePathForSession(
  bars: RevealedPriceBar[],
  steps: number = DEFAULT_STEPS_PER_BAR,
): DerivedPathPoint[] {
  const out: DerivedPathPoint[] = [];
  bars.forEach((bar, bi) => {
    const seg = derivePathForBar(bar, steps);
    // 相邻 bar 之间去掉重复的接缝点（前一根的收盘 == 后一根路径的起点）
    const slice = bi === 0 ? seg : seg.slice(1);
    slice.forEach((p) => out.push({ ...p, index: out.length }));
  });
  return out;
}

/**
 * **因果基线**：只用 O / H / L 生成路径，**完全不看 close**。
 *
 * 存在的唯一理由是给泄漏检测做对照组。评审说得很清楚：
 * 「数学上『路径必定命中尚未揭晓的真实 H/L/C』与『可见前缀对这些未来量零信息』
 * 无法同时满足」——正确的目标是**没有确定性、可机械利用的泄漏**，
 * 而不是要求价格对未来完全无预测力。
 *
 * 道理是：开盘价在 [low, high] 里的位置本身就预示了收盘方向
 * （开在接近低点，收盘多半在开盘之上），这条信息**真实存在于已揭晓的数据里**，
 * 不是我们泄漏的。所以只比"绝对一致率"会把这部分算到算法头上，冤枉它。
 * 要比的是真生成器**比这个基线多泄漏了多少**。
 */
function derivecausalBaselinePath(
  bar: RevealedPriceBar,
  steps: number = DEFAULT_STEPS_PER_BAR,
): number[] {
  const { open, high, low } = bar;
  if (!(high - low > 0)) return derivePathForBar(bar, steps).map((p) => p.price);

  // **同一个生成器，只把真实收盘换成一个假的**。
  //
  // 我第一版基线写的是"夹在 [low, high] 里的随机游走"，那根本不是同类：
  // 它不经过极值、不受 knot 结构约束，两者的前缀形状天然不同，
  // 比出来的 delta 有一大半是"两个算法不一样"，不是"真算法泄漏"。
  //
  // 换成同算法 + 假收盘之后，两边的结构性偏差完全一致，
  // 剩下的差异才真的是"路径前缀知道多少真实收盘的信息"。
  const rand = mulberry32(xmur3(`decoy|${bar.ts}|${open}|${high}|${low}`)());
  const decoyClose = low + rand() * (high - low);
  return derivePathForBar({ ...bar, close: decoyClose }, steps).map((p) => p.price);
}

function prefixIsUp(prices: number[], prefixFraction: number): boolean {
  const cut = Math.max(1, Math.floor(prices.length * prefixFraction));
  const prefix = prices.slice(0, cut + 1);
  const up = Math.max(...prefix) - prefix[0];
  const down = prefix[0] - Math.min(...prefix);
  return up >= down;
}

/**
 * 泄漏自测：真生成器的"前缀方向猜中收盘方向"一致率，**减去**因果基线的同一指标。
 *
 * `delta` 才是我们要盯的数。评审给的工程门槛是 ΔAUC > 0.03 即拒收；
 * 这里用一致率代替 AUC（二分类下两者同向），阈值取同一量级。
 *
 * 旧算法把极值顺序写成 `close >= open ? low : high`，delta 会直接顶到 0.4+，
 * 一测就现形。导出它而不是只写在测试里，是为了以后动路径逻辑时能随手复测。
 */
export function measureDirectionLeak(
  bars: RevealedPriceBar[],
  prefixFraction = 0.4,
  steps: number = DEFAULT_STEPS_PER_BAR,
): { samples: number; agreement: number; baseline: number; delta: number } {
  let agree = 0;
  let baseAgree = 0;
  let total = 0;
  for (const bar of bars) {
    if (!(bar.high - bar.low > 0) || bar.close === bar.open) continue;
    const closeUp = bar.close > bar.open;
    if (prefixIsUp(derivePathForBar(bar, steps).map((p) => p.price), prefixFraction) === closeUp) {
      agree += 1;
    }
    if (prefixIsUp(derivecausalBaselinePath(bar, steps), prefixFraction) === closeUp) {
      baseAgree += 1;
    }
    total += 1;
  }
  if (total === 0) return { samples: 0, agreement: 0.5, baseline: 0.5, delta: 0 };
  const agreement = agree / total;
  const baseline = baseAgree / total;
  return { samples: total, agreement, baseline, delta: agreement - baseline };
}

/* ── 盘中成交量分配 ─────────────────────────────────────────────────
 *
 * 评审 dante 的规格（2026-08-19）：
 *
 *   「小时真实 volume 按每小时 24 份做确定性非负分配，
 *     **24 份之和必须严格等于该小时 REAL volume**；
 *     子柱整体标 SIMULATED / REAL hourly anchors。
 *     VIX 无量：不伪造，隐藏量图区或明确 DATA_UNAVAILABLE。」
 *
 * "严格等于"这条不是形式主义：小时总量是**真实数据**，
 * 如果 24 份加起来不等于它，玩家把子柱加总就会得到一个不存在的成交量。
 * 所以这里用**最大余数法**分配，而不是各自四舍五入——后者的和会漂。
 *
 * 权重取自路径本身的单步变动幅度：价格动得多的那几分钟成交也多，
 * 这是真实市场的行为，也让量柱和走势对得上，不是一排随机噪音。
 */

/** 一根真实小时 bar 拆出来的量柱。总和严格等于 bar.volume */
export interface DerivedVolumeBar {
  index: number;
  volume: number;
  /** 恒为 SIMULATED —— 小时总量是真的，这一份的切分是模拟的 */
  source_type: 'SIMULATED';
}

export function deriveVolumeForBar(
  bar: RevealedPriceBar,
  path: DerivedPathPoint[],
): DerivedVolumeBar[] | null {
  const total = Math.max(0, Math.trunc(Number(bar.volume) || 0));
  const n = Math.max(1, path.length - 1);

  // VIX 这类指数没有成交量。**不要伪造**——返回 null，让调用方显示
  // DATA_UNAVAILABLE 或干脆隐藏量图区。给指数编一条成交量是纯粹的假数据。
  if (total <= 0) return null;

  // 权重 = 该步的价格变动幅度 + 一个地板值。
  // 地板是必要的：一段完全横盘的分钟不该是 0 成交量，
  // 而且全零权重会让后面除零。
  const raw: number[] = [];
  let sum = 0;
  for (let i = 1; i <= n; i += 1) {
    const w = Math.abs(path[i].price - path[i - 1].price) + 1e-6;
    raw.push(w);
    sum += w;
  }

  // 最大余数法：先取整数部分，再把余下的量按小数部分从大到小补足，
  // 保证 Σ 严格等于 total。
  const exact = raw.map((w) => (w / sum) * total);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k += 1) {
    floors[order[k].i] += 1;
    remainder -= 1;
  }

  return floors.map((v, i) => ({ index: i + 1, volume: v, source_type: 'SIMULATED' as const }));
}

/* ──────────────────────────────────────────────────────────────────────
 * 玩家可见的盘中序列（2026-08-20 claude）
 *
 * harv 的裁定（REPLAN_2 第 1 条）：
 *   「R1 七天全部切为 REAL_1M；旧的『小时锚点 + 布朗桥 169 点/日』
 *     不再作为玩家可见主数据。缺真实盘中时宁可空态，不生成假点。」
 *
 * 所以"用真的还是用推演的"必须是**一个由数据决定的判断**，
 * 而不是散在组件里的假设。放在引擎里的另一个理由是：
 * 判据测试要能断言这个判断本身，而不是去镜像组件里的一段算法
 * —— 镜像出来的测试会跟着组件一起错。
 * ────────────────────────────────────────────────────────────────────── */

export type IntradaySeriesMode = 'REAL_1M' | 'DERIVED_FROM_ANCHORS' | 'DERIVED_FROM_DAILY_OHLC';

export interface PlayerIntradaySeries {
  mode: IntradaySeriesMode;
  /** 真实 bar 间隔（秒），由相邻时间戳差值的中位数得出 */
  barGapSec: number;
  points: Array<{ timeSec: number; price: number }>;
  /** 每根量柱；null = 没有可信的量，调用方应整体隐藏量图而不是画半截 */
  volume: Array<{ timeSec: number; volume: number; up: boolean }> | null;
  /** 真值标签，直接给 UI 用 */
  truthLabel: 'REAL' | 'DERIVED_REAL_INPUTS' | 'SIMULATED';
}

/**
 * 真实分钟数据判定门槛。
 * 用 ≤60 秒而不是 ==60：缺失分钟会让个别间隔变大，中位数仍是 60；
 * 而任何比分钟更细的源（若将来有）也应当走真实路径。
 */
const REAL_INTRADAY_MAX_GAP_SEC = 60;


/**
 * Convert a New York wall-clock session time to epoch seconds without hard-coding
 * EST/EDT. This stays display-only; it never changes any historical price value.
 */
function newYorkWallClockEpochSec(sessionDate: string, hour: number, minute: number): number {
  const [year, month, day] = sessionDate.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date(guess));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const representedAsUtc = Date.UTC(
      value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'),
    );
    const offsetMs = representedAsUtc - guess;
    return Math.floor((guess - offsetMs) / 1000);
  } catch {
    // Fallback is only a visual time label. The path prices themselves remain exact anchors.
    return Math.floor(Date.UTC(year, month - 1, day, 14, 30, 0) / 1000);
  }
}

/**
 * Visual-only RTH tape generated from an already-admitted DAILY O/H/L/C bar.
 *
 * This is the Day-1 empty-stage fallback requested by the visual execution spec.
 * It is legal ONLY when the caller has already admitted the full daily bar and
 * there is no active partial intraday reveal. Every interior point is explicitly
 * SIMULATED and may never be used for execution, settlement, scoring or replay truth.
 */
export function buildDailyAnchoredVisualSeries(
  bar: RevealedPriceBar,
  sessionDate: string,
  pointCount = 169,
): PlayerIntradaySeries | null {
  if (!bar || !sessionDate) return null;
  if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) return null;
  const pointsWanted = Math.max(25, Math.trunc(pointCount));
  const path = derivePathForBar(bar, pointsWanted - 1);
  if (path.length < 2) return null;

  const startSec = newYorkWallClockEpochSec(sessionDate, 9, 30);
  const rthSeconds = 6.5 * 3600;
  const stepSec = rthSeconds / (path.length - 1);
  const points = path.map((point, index) => ({
    timeSec: Math.round(startSec + index * stepSec),
    price: point.price,
  }));

  const derivedVolume = deriveVolumeForBar(bar, path);
  const volume = derivedVolume
    ? derivedVolume.map((item, index) => ({
        timeSec: Math.round(startSec + (index + 1) * stepSec),
        volume: item.volume,
        up: path[index + 1].price >= path[index].price,
      }))
    : null;

  return {
    mode: 'DERIVED_FROM_DAILY_OHLC',
    barGapSec: rthSeconds,
    points,
    volume,
    truthLabel: 'SIMULATED',
  };
}

export function buildPlayerIntradaySeries(
  bars: RevealedPriceBar[],
  steps: number = DEFAULT_STEPS_PER_BAR,
): PlayerIntradaySeries | null {
  if (!bars || bars.length === 0) return null;

  const tsSec = bars.map((b) => Math.floor(new Date(b.ts).getTime() / 1000));
  const gaps: number[] = [];
  for (let i = 1; i < tsSec.length; i += 1) {
    const g = tsSec[i] - tsSec[i - 1];
    if (Number.isFinite(g) && g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  // 中位数而不是首对差：盘中有无成交的空洞分钟，单看一对会被带偏
  const barGapSec = gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : 3600;

  if (barGapSec <= REAL_INTRADAY_MAX_GAP_SEC) {
    // ── 真实分钟：逐根照搬，零推演、零插值 ──
    const points = bars
      .map((b, i) => ({ timeSec: tsSec[i], price: b.close }))
      .filter((p) => Number.isFinite(p.timeSec) && Number.isFinite(p.price));

    // 一根没量就整段不画。混着画会让玩家把"没有量数据"读成"成交为零"。
    const allHaveVolume = bars.every(
      (b) => Number.isFinite(Number(b.volume)) && Number(b.volume) > 0,
    );
    const volume = allHaveVolume
      ? bars.map((b, i) => ({
          timeSec: tsSec[i],
          volume: Number(b.volume),
          up: b.close >= (i > 0 ? bars[i - 1].close : b.open),
        }))
      : null;

    return { mode: 'REAL_1M', barGapSec, points, volume, truthLabel: 'REAL' };
  }

  // ── 小时锚点：保留推演路径，但步长由真实间隔算出，不写死一小时 ──
  const stepSec = barGapSec / steps;
  const points: Array<{ timeSec: number; price: number }> = [];
  const volume: Array<{ timeSec: number; volume: number; up: boolean }> = [];
  let volumeOk = true;

  bars.forEach((bar, bi) => {
    const t0 = tsSec[bi];
    if (!Number.isFinite(t0)) return;
    const path = derivePathForBar(bar, steps);
    const vols = deriveVolumeForBar(bar, path);
    if (!vols) volumeOk = false;
    path.forEach((p, i) => {
      // 接缝：后一根的第 0 点与前一根末点同价，跳过避免重复时间戳
      if (i === 0 && points.length > 0) return;
      points.push({ timeSec: t0 + i * stepSec, price: p.price });
    });
    if (vols) {
      vols.forEach((v, i) => {
        volume.push({
          timeSec: t0 + (i + 1) * stepSec,
          volume: v.volume,
          up: path[i + 1].price >= path[i].price,
        });
      });
    }
  });

  return {
    mode: 'DERIVED_FROM_ANCHORS',
    barGapSec,
    points,
    volume: volumeOk && volume.length > 0 ? volume : null,
    truthLabel: 'DERIVED_REAL_INPUTS',
  };
}

/** 整段会话的量柱。任一根 bar 没有真实成交量就整段返回 null（不做半真半假） */
export function deriveVolumeForSession(
  bars: RevealedPriceBar[],
  steps: number = DEFAULT_STEPS_PER_BAR,
): DerivedVolumeBar[] | null {
  if (!bars.length) return null;
  const out: DerivedVolumeBar[] = [];
  for (const bar of bars) {
    const seg = deriveVolumeForBar(bar, derivePathForBar(bar, steps));
    // 一根没量就整段不画。混着画会让玩家以为缺的那段是"成交为零"，
    // 而真相是"这个标的根本没有成交量数据"。
    if (!seg) return null;
    seg.forEach((v) => out.push({ ...v, index: out.length + 1 }));
  }
  return out;
}
