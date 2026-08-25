import type { ReactNode } from 'react';

export function WarRoomCommandRail({ children }: { children: ReactNode }): JSX.Element {
  return (
    <aside className="war-room-command-rail col-right" data-testid="war-room-command-rail" data-visual-key="right-rail" aria-label="War Room command rail">
      {children}
    </aside>
  );
}
