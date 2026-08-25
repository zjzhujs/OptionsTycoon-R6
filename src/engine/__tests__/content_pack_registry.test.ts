import { describe, expect, it } from 'vitest';
import {
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  runtimeNetworkRequired,
  validateOfflineContentPacks,
} from '../engines/offline_content_pack';

const H1_DAYS = [
  '2026-01-20', '2026-02-23', '2026-03-26', '2026-04-08', '2026-05-08',
  '2026-05-20', '2026-05-21', '2026-06-05', '2026-06-11', '2026-06-30',
];

describe('offline content-pack registry', () => {
  it('validates every registered offline pack', () => {
    expect(() => validateOfflineContentPacks()).not.toThrow();
  });

  for (const campaign of ['r1', 'h1', 'c7'] as const) {
    it(`${campaign}: every manifest session is retrievable`, () => {
      const manifest = getOfflineContentPackManifest(campaign);
      expect(manifest).toBeTruthy();
      expect(manifest!.included_sessions.length).toBeGreaterThan(0);
      const missing = manifest!.included_sessions.filter(
        (session) => !getOfflineIntradaySession(campaign, session.date, session.ticker),
      );
      expect(missing).toHaveLength(0);
    });
  }

  it('R1 covers NVDA / QQQ / VIX on its seven trading dates', () => {
    const days = ['2025-01-23', '2025-01-24', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31'];
    for (const ticker of ['NVDA', 'QQQ', 'VIX']) {
      for (const date of days) {
        const session = getOfflineIntradaySession('r1', date, ticker);
        expect(session).toBeTruthy();
        expect(session!.bars.length).toBe(ticker === 'NVDA' ? 390 : 7);
      }
    }
  });

  it('H1 covers SPY / QQQ / VXX and labels every session PROXY', () => {
    for (const ticker of ['SPY', 'QQQ', 'VXX']) {
      for (const date of H1_DAYS) {
        const session = getOfflineIntradaySession('h1', date, ticker);
        expect(session, `${ticker} ${date}`).toBeTruthy();
        expect(session!.truth_label).toBe('PROXY');
        expect(session!.integrity_note).toContain('PROXY');
        expect(session!.integrity_note).toContain('not');
        if (ticker === 'VXX') expect(session!.integrity_note).toContain('Cboe VIX');
        else expect(session!.bars.length).toBe(date === '2026-05-21' && ticker === 'QQQ' ? 389 : 390);
      }
    }
    expect(getOfflineContentPackManifest('h1')!.truth_label).toBe('PROXY');
    expect(getOfflineContentPackManifest('h1')!.distribution_note).toContain('not Cboe VIX');
  });

  it('C7 exposes daily context but keeps cash-SPX carry coverage missing', () => {
    const manifest = getOfflineContentPackManifest('c7')!;
    expect(manifest.data_mode).toBe('DAILY');
    expect(manifest.provenance.some((item) => item.source_type === 'REAL_PRIMARY')).toBe(true);
    const missingCashIndex = manifest.carry_data_coverage?.find((rule) => rule.symbol === 'SPX');
    expect(missingCashIndex?.status).toBe('MISSING');
    expect(getOfflineIntradaySession('c7', '2025-04-09', 'SPY')).toBeTruthy();
  });

  it('R1 VIX zero volume is an index fact, not a missing field', () => {
    const session = getOfflineIntradaySession('r1', '2025-01-27', 'VIX')!;
    expect(session.bars.every((bar) => bar.volume === 0)).toBe(true);
    expect(session.integrity_note).toContain('指数');
  });

  it('R1 crash-day VIX peak is materially above the calm-day peak', () => {
    const crash = getOfflineIntradaySession('r1', '2025-01-27', 'VIX')!;
    const calm = getOfflineIntradaySession('r1', '2025-01-24', 'VIX')!;
    expect(Math.max(...crash.bars.map((bar) => bar.high))).toBeGreaterThan(
      Math.max(...calm.bars.map((bar) => bar.high)) * 1.25,
    );
  });

  it('registered packs do not require runtime networking', () => {
    expect(runtimeNetworkRequired('r1')).toBe(false);
    expect(runtimeNetworkRequired('h1')).toBe(false);
    expect(runtimeNetworkRequired('c7')).toBe(false);
  });

  it('unknown campaigns return null rather than throwing', () => {
    expect(getOfflineContentPackManifest('nope')).toBeNull();
    expect(getOfflineIntradaySession('nope', '2025-01-27', 'NVDA')).toBeNull();
  });
});
