import type { ReactNode } from 'react';

export function CommandBottomRail({ children }: { children: ReactNode }): JSX.Element {
  return (
    <footer className="ot-command-dock command-bottom-rail" data-testid="command-dock" data-visual-key="bottom-rail">
      {children}
    </footer>
  );
}
