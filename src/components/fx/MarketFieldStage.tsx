import React, {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  CentralMarketField,
  type MarketFieldTopology,
} from './CentralMarketField';

interface MarketFieldStageProps {
  topology: MarketFieldTopology;
  fallback: ReactNode;
  children: ReactNode;
  networkRef: RefObject<HTMLElement>;
}

interface MarketFieldGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarketFieldAlignment {
  top: number;
  height: number;
  bottom: number;
}

const GEOMETRY_PRECISION = 100;
const GEOMETRY_EPSILON = 0.01;

function roundedGeometry(value: number): number {
  return Math.round(value * GEOMETRY_PRECISION) / GEOMETRY_PRECISION;
}

function sameGeometry(
  left: MarketFieldGeometry | null,
  right: MarketFieldGeometry | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    Math.abs(left.left - right.left) <= GEOMETRY_EPSILON
    && Math.abs(left.top - right.top) <= GEOMETRY_EPSILON
    && Math.abs(left.width - right.width) <= GEOMETRY_EPSILON
    && Math.abs(left.height - right.height) <= GEOMETRY_EPSILON
  );
}

function sameAlignment(
  left: MarketFieldAlignment | null,
  right: MarketFieldAlignment | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    Math.abs(left.top - right.top) <= GEOMETRY_EPSILON
    && Math.abs(left.height - right.height) <= GEOMETRY_EPSILON
    && Math.abs(left.bottom - right.bottom) <= GEOMETRY_EPSILON
  );
}

function localGeometry(
  stage: HTMLElement,
  network: HTMLElement,
): MarketFieldGeometry | null {
  const stageRect = stage.getBoundingClientRect();
  const networkRect = network.getBoundingClientRect();
  if (
    ![stageRect.left, stageRect.top, networkRect.left, networkRect.top, networkRect.width, networkRect.height]
      .every(Number.isFinite)
    || networkRect.width < 2
    || networkRect.height < 2
  ) return null;

  // getBoundingClientRect() includes ancestor transforms. Divide those back out
  // so the absolute CSS geometry remains correct in the stage's local space.
  const scaleX = stage.offsetWidth > 0 && stageRect.width > 0
    ? stageRect.width / stage.offsetWidth
    : 1;
  const scaleY = stage.offsetHeight > 0 && stageRect.height > 0
    ? stageRect.height / stage.offsetHeight
    : 1;

  return {
    left: roundedGeometry(
      (networkRect.left - stageRect.left - stage.clientLeft * scaleX) / scaleX + stage.scrollLeft,
    ),
    top: roundedGeometry(
      (networkRect.top - stageRect.top - stage.clientTop * scaleY) / scaleY + stage.scrollTop,
    ),
    width: roundedGeometry(networkRect.width / scaleX),
    height: roundedGeometry(networkRect.height / scaleY),
  };
}

/**
 * One coordinate space for the price chart, volume, MARKET GRAPH chrome, and
 * the data-driven field. Grid layering keeps every surface attached to normal
 * layout; the renderer measures a dedicated MARKET GRAPH viewport so its canvas
 * cannot feed intrinsic size back into the chart/volume rows. The visible
 * network band's border box is the sole geometry owner for that viewport.
 */
export function MarketFieldStage({
  topology,
  fallback,
  children,
  networkRef,
}: MarketFieldStageProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const fieldViewportRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<MarketFieldGeometry | null>(null);
  const [alignment, setAlignment] = useState<MarketFieldAlignment | null>(null);

  useLayoutEffect(() => {
    const stageCandidate = stageRef.current;
    const networkCandidate = networkRef.current;
    if (!stageCandidate || !networkCandidate) return;
    const stage = stageCandidate;
    const network = networkCandidate;

    let frame: number | null = null;
    const requestFrame: (callback: FrameRequestCallback) => number =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback) => window.setTimeout(() => callback(performance.now()), 16);
    const cancelFrame: (handle: number) => void =
      typeof window.cancelAnimationFrame === 'function'
        ? window.cancelAnimationFrame.bind(window)
        : window.clearTimeout.bind(window);

    function scheduleMeasure(): void {
      if (frame !== null) cancelFrame(frame);
      frame = requestFrame(measure);
    }

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);

    function measure(): void {
      frame = null;
      const currentNetwork = networkRef.current;
      const next = currentNetwork ? localGeometry(stage, currentNetwork) : null;
      setGeometry((current) => (sameGeometry(current, next) ? current : next));
    }

    resizeObserver?.observe(stage);
    resizeObserver?.observe(network);
    window.addEventListener('resize', scheduleMeasure);

    measure();

    return () => {
      if (frame !== null) cancelFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [networkRef]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const viewport = fieldViewportRef.current;
    const network = networkRef.current;
    if (!geometry || !viewport || !network) {
      setAlignment((current) => (current === null ? current : null));
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const networkRect = network.getBoundingClientRect();
    if (![viewportRect.top, viewportRect.height, viewportRect.bottom, networkRect.top, networkRect.height, networkRect.bottom]
      .every(Number.isFinite)) {
      setAlignment((current) => (current === null ? current : null));
      return;
    }
    const next: MarketFieldAlignment = {
      top: roundedGeometry(viewportRect.top - networkRect.top),
      height: roundedGeometry(viewportRect.height - networkRect.height),
      bottom: roundedGeometry(viewportRect.bottom - networkRect.bottom),
    };
    setAlignment((current) => (sameAlignment(current, next) ? current : next));
  }, [geometry]);

  const viewportStyle: CSSProperties | undefined = geometry ? {
    position: 'absolute',
    gridArea: 'auto',
    left: geometry.left,
    top: geometry.top,
    width: geometry.width,
    height: geometry.height,
  } : undefined;

  return (
    <div
      ref={stageRef}
      className="pcp-market-field-stage"
      data-testid="market-field-stage"
      data-coordinate-space="chart-volume-network"
      style={{ position: 'relative' }}
    >
      <div
        ref={fieldViewportRef}
        className="pcp-market-field-viewport"
        data-testid="market-field-viewport"
        data-geometry-source="chart-network-band-border-box"
        data-geometry-ready={geometry ? 'true' : 'false'}
        data-network-top-delta={alignment?.top}
        data-network-height-delta={alignment?.height}
        data-network-bottom-delta={alignment?.bottom}
        data-network-alignment-delta={alignment
          ? `${alignment.top},${alignment.height},${alignment.bottom}`
          : undefined}
        style={viewportStyle}
        aria-hidden="true"
      >
        <CentralMarketField topology={topology} viewportRef={fieldViewportRef} />
        {fallback}
      </div>
      {children}
    </div>
  );
}
