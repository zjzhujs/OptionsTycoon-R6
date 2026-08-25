import { describe, expect, it } from 'vitest';
import * as data_loader from '../data_loader';
import { generate_scanner_feed } from '../engines/scanner';
import { resolve_scanner_daily_admission } from '../engines/scanner_real_row_adapter';
import { realDailyRow } from '../daily_history_loader';

describe('V28 Scanner REAL-row admission gate', () => {
  it('admits only the explicit V27 R1 NVDA daily rows', () => {
    const admitted = resolve_scanner_daily_admission('r1', '2025-01-27', 'NVDA');
    expect(admitted).not.toBeNull();
    expect(admitted?.production_ready).toBe(true);
    expect(admitted?.source_type).toBe('REAL');
    expect(admitted?.row.close).toBe(118.42);
    expect(admitted?.row.volume).toBe(818830900);
  });

  it('does not admit H1 candidate rows before the Batch17 basis gate', () => {
    expect(resolve_scanner_daily_admission('h1', '2026-01-20', 'NVDA')).toBeNull();
    expect(resolve_scanner_daily_admission('h1', '2026-01-20', 'AAPL')).toBeNull();
  });

  it('labels the admitted R1 row and keeps non-admitted rows explicitly derived', () => {
    const r1Node = data_loader.get_campaign_nodes('r1').find((node) => node.date === '2025-01-27');
    const h1Node = data_loader.get_campaign_nodes('h1')[0];
    expect(r1Node).toBeDefined();
    expect(h1Node).toBeDefined();

    const r1Feed = generate_scanner_feed(r1Node!, 'r1');
    const nvda = r1Feed.rows.find((row) => row.ticker === 'NVDA');
    const qqq = r1Feed.rows.find((row) => row.ticker === 'QQQ');
    expect(nvda?.price_data_status).toBe('ADMITTED_REAL_DAILY');
    expect(nvda?.price_source_type).toBe('REAL');
    expect(qqq?.price_data_status).toBe('PARTIAL_REAL_PRICE');

    /*
     * V29-UI-C restated this assertion.
     *
     * It previously read "every h1 row is DERIVED_FALLBACK", which was a snapshot of the state
     * when only the R1 NVDA rows had a real source. Admitted daily-history packs now cover the
     * whole 28-ticker universe across 2024-01-02..2026-06-30, so h1 rows legitimately carry
     * real closes and that literal assertion went stale.
     *
     * The guard it existed to provide is unchanged and is now asserted directly, in a form
     * that keeps holding as more packs land: a row may claim REAL only when an admitted pack
     * actually has a row for that exact ticker and date, and a row without one must stay
     * explicitly derived. This is strictly stronger than pinning a count.
     */
    const h1Feed = generate_scanner_feed(h1Node!, 'h1');
    expect(h1Feed.rows.length).toBeGreaterThan(0);
    for (const row of h1Feed.rows) {
      const backing = realDailyRow(row.ticker, h1Node!.date);
      if (row.price_data_status === 'ADMITTED_REAL_DAILY') {
        expect(backing).not.toBeNull();
        expect(row.price_source_type).toBe('REAL');
        // The displayed price must BE the admitted close, not merely near it.
        expect(row.price).toBeCloseTo(backing!.close, 2);
      } else {
        expect(row.price_data_status).toBe('DERIVED_FALLBACK');
        expect(row.price_source_type).toBe('DERIVED_HEURISTIC');
      }
    }
  });

  it('never labels a row REAL on a date the pack does not cover', () => {
    // 2027 is outside every admitted pack; the whole feed must fall back.
    const h1Node = data_loader.get_campaign_nodes('h1')[0];
    const future = { ...h1Node!, date: '2027-03-15' };
    const feed = generate_scanner_feed(future as typeof h1Node, 'h1');
    expect(feed.rows.length).toBeGreaterThan(0);
    expect(feed.rows.some((row) => row.price_data_status === 'ADMITTED_REAL_DAILY')).toBe(false);
  });

  it('uses date-keyed admission lookup and cannot leak a different trading day', () => {
    const current = resolve_scanner_daily_admission('r1', '2025-01-27', 'NVDA');
    const other = resolve_scanner_daily_admission('r1', '2025-01-28', 'NVDA');
    expect(current?.date).toBe('2025-01-27');
    expect(other?.date).toBe('2025-01-28');
    expect(current?.row.close).not.toBe(other?.row.close);
  });
});
