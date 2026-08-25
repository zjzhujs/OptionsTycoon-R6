export const fmt = (n: number, d = 2): string =>
  Number(n).toLocaleString('en-CA', { minimumFractionDigits: d, maximumFractionDigits: d });

export const money = (n: number): string => (n < 0 ? '-' : '') + '$' + fmt(Math.abs(n), 2);

export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

export const pct = (n: number, d = 2): string => (n >= 0 ? '+' : '') + n.toFixed(d) + '%';

export function badgeClass(sourceType: string): string {
  switch (sourceType) {
    case 'REAL':
      return 'badge real';
    case 'ESTIMATED':
      return 'badge estimated';
    case 'SIMULATED':
      return 'badge simulated';
    default:
      return 'badge unavailable';
  }
}
