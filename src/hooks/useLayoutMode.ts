import { useEffect, useState } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

export function layoutModeForWidth(width: number): LayoutMode {
  if (width <= 767) return 'mobile';
  if (width <= 1279) return 'tablet';
  return 'desktop';
}

function currentLayoutMode(): LayoutMode {
  if (typeof window === 'undefined') return 'desktop';
  return layoutModeForWidth(window.innerWidth);
}

/** Width-driven shell selection: no user-agent or pointer-type assumptions. */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(currentLayoutMode);

  useEffect(() => {
    const handleResize = (): void => setMode(currentLayoutMode());
    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return mode;
}
