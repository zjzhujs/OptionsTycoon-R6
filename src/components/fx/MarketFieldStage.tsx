import React, { useRef, type ReactNode } from 'react';

import {
  CentralMarketField,
  type MarketFieldTopology,
} from './CentralMarketField';

interface MarketFieldStageProps {
  topology: MarketFieldTopology;
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * One coordinate space for the price chart, volume, MARKET GRAPH chrome, and
 * the data-driven field. Grid layering keeps every surface attached to normal
 * layout; the renderer measures a dedicated MARKET GRAPH viewport so its canvas
 * cannot feed intrinsic size back into the chart/volume rows.
 */
export function MarketFieldStage({
  topology,
  fallback,
  children,
}: MarketFieldStageProps): JSX.Element {
  const fieldViewportRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="pcp-market-field-stage"
      data-testid="market-field-stage"
      data-coordinate-space="chart-volume-network"
    >
      <div
        ref={fieldViewportRef}
        className="pcp-market-field-viewport"
        data-testid="market-field-viewport"
        aria-hidden="true"
      >
        <CentralMarketField topology={topology} viewportRef={fieldViewportRef} />
        {fallback}
      </div>
      {children}
    </div>
  );
}
