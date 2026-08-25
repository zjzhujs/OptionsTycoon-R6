import type { ReactNode } from 'react';

export function FundRiskRail({ children }: { children: ReactNode }): JSX.Element {
  return (
    <aside className="fund-risk-rail col-left" data-testid="fund-risk-rail" data-visual-key="left-rail" aria-label="Fund and risk rail">
      {children}
    </aside>
  );
}
