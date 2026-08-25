import { describe, expect, it } from "vitest";

import { hasValidOhlc, isChartReady } from "../../lib/chartReadiness";

describe("player chart readiness", () => {
  const validOhlc = [{ underlying_bar: { open: 100, high: 104, low: 98, close: 103 } }];

  it("does not report ready before the canvas and both series exist", () => {
    expect(hasValidOhlc(validOhlc)).toBe(true);
    expect(isChartReady({
      containerWidth: 0,
      containerHeight: 420,
      priceSeriesMounted: true,
      volumeSeriesMounted: true,
      validOhlc: true,
      bodyPixels: [8],
    })).toBe(false);
    expect(isChartReady({
      containerWidth: 800,
      containerHeight: 420,
      priceSeriesMounted: true,
      volumeSeriesMounted: false,
      validOhlc: true,
      bodyPixels: [8],
    })).toBe(false);
  });

  it("accepts valid OHLC with a visibly measurable body", () => {
    expect(isChartReady({
      containerWidth: 800,
      containerHeight: 420,
      priceSeriesMounted: true,
      volumeSeriesMounted: true,
      validOhlc: hasValidOhlc(validOhlc),
      bodyPixels: [2.1],
    })).toBe(true);
    expect(isChartReady({
      containerWidth: 800,
      containerHeight: 420,
      priceSeriesMounted: true,
      volumeSeriesMounted: true,
      validOhlc: true,
      bodyPixels: [0.8],
    })).toBe(false);
  });

  it("rejects malformed OHLC instead of unlocking the guide", () => {
    expect(hasValidOhlc([{ underlying_bar: { open: 100, high: 99, low: 98, close: 101 } }])).toBe(false);
    expect(hasValidOhlc([{ underlying_bar: { open: 100, high: 104, low: 98, close: Number.NaN } }])).toBe(false);
  });
});
