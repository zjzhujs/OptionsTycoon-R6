import type { ReactNode } from 'react';

export interface MarketCommandShellProps {
  children: ReactNode;
}

export function MarketCommandShell({ children }: MarketCommandShellProps): JSX.Element {
  return (
    <section
      className="market-command-shell command-grid-texture"
      data-testid="market-command-shell"
      data-visual-key="market-command-shell"
      aria-label="Market command workspace"
    >
      {children}
    </section>
  );
}

