export interface ChartReadinessInput {
  containerWidth: number;
  containerHeight: number;
  priceSeriesMounted: boolean;
  volumeSeriesMounted: boolean;
  validOhlc: boolean;
  bodyPixels: readonly number[];
}

export interface OhlcRow {
  underlying_bar?: {
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
  };
}

const MIN_VISIBLE_BODY_PIXELS = 2;

export function hasValidOhlc(rows: readonly OhlcRow[]): boolean {
  return rows.some((row) => {
    const bar = row.underlying_bar;
    if (!bar) return false;
    const close = Number(bar.close);
    const open = Number(bar.open ?? bar.close);
    const high = Number(bar.high ?? Math.max(open, close));
    const low = Number(bar.low ?? Math.min(open, close));
    if (![open, high, low, close].every(Number.isFinite)) return false;
    return high >= Math.max(open, close) && low <= Math.min(open, close) && high >= low;
  });
}

export function isChartReady(input: ChartReadinessInput): boolean {
  return (
    input.containerWidth > 0 &&
    input.containerHeight > 0 &&
    input.priceSeriesMounted &&
    input.volumeSeriesMounted &&
    input.validOhlc &&
    input.bodyPixels.some((pixels) => Number.isFinite(pixels) && pixels >= MIN_VISIBLE_BODY_PIXELS)
  );
}
