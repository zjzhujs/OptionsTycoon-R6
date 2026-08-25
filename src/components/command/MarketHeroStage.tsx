import type { ReactNode } from 'react';

export function MarketHeroStage({ children }: { children: ReactNode }): JSX.Element {
  return (
    <section className="market-hero-stage" data-testid="market-hero-stage" data-visual-key="market-stage">
      {children}
    </section>
  );
}
