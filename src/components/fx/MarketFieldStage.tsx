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
 * layout; the field is no longer sized from the legacy network strip.
 */
export function MarketFieldStage({
  topology,
  fallback,
  children,
}: MarketFieldStageProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={stageRef}
      className="pcp-market-field-stage"
      data-testid="market-field-stage"
      data-coordinate-space="chart-volume-network"
    >
      <CentralMarketField topology={topology} viewportRef={stageRef} />
      {fallback}
      {children}
    </div>
  );
}
