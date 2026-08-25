import { describe, expect, it } from 'vitest';
import { assertCampaignMacroEventTag } from '../campaign_contract';
import { get_campaign_events_key, get_campaign_nodes, load_c8_2022_2023, load_events } from '../data_loader';
import { get_corporate_actions, check_carry_data_coverage } from '../settlement';
import {
  checkOfflineDataCoverage,
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  validateOfflineContentPacks,
  validateOfflineIntradaySession,
} from '../engines/offline_content_pack';

describe('C8 P5 daily/event vertical slice', () => {
  it('loads the exact Part46 ATVI daily range without inventing 2023-10-13', () => {
    const nodes = load_c8_2022_2023();
    expect(nodes).toHaveLength(437);
    expect(nodes[0].date).toBe('2022-01-18');
    expect(nodes[nodes.length - 1].date).toBe('2023-10-12');
    expect(nodes.every((node) => node.underlying_bar.high! >= node.underlying_bar.low!)).toBe(true);
    expect(nodes.every((node) => node.secondary_close !== null)).toBe(true);
    expect(get_campaign_nodes('c8')).toBe(nodes);
    expect(nodes.find((node) => node.date === '2023-10-13')).toBeUndefined();
  });

  it('registers daily pack provenance and preserves the source boundary', () => {
    const manifest = getOfflineContentPackManifest('c8');
    expect(manifest?.pack_id).toBe('c8_daily_v1');
    expect(manifest?.truth_label).toBe('REAL_DAILY');
    expect(manifest?.data_mode).toBe('DAILY');
    expect(manifest?.included_sessions).toHaveLength(437);

    const finalMarketDay = getOfflineIntradaySession('c8', '2023-10-12', 'ATVI');
    expect(finalMarketDay?.bars).toHaveLength(1);
    expect(finalMarketDay?.truth_label).toBe('REAL_DAILY');
    expect(finalMarketDay?.previous_close).toBeGreaterThan(0);
    expect(getOfflineIntradaySession('c8', '2023-10-13', 'ATVI')).toBeNull();
    expect(() => validateOfflineIntradaySession(finalMarketDay!)).not.toThrow();
    expect(() => validateOfflineContentPacks()).not.toThrow();
  });

  it('keeps daily carry separate from deal-term settlement', () => {
    expect(check_carry_data_coverage('ATVI', '2023-10-12')).toBe(true);
    expect(check_carry_data_coverage('ATVI', '2023-10-13')).toBe(false);
    expect(checkOfflineDataCoverage('c8', '2023-10-13', ['merger_cash_settlement_terms'])).toBe(true);
    expect(checkOfflineDataCoverage('c8', '2023-10-13', ['daily_ohlcv'])).toBe(false);

    expect(get_corporate_actions('ATVI', '2023-10-13')).toEqual([
      { type: 'MERGER', date: '2023-10-13', ticker: 'ATVI', amount: 95 },
    ]);
  });

  it('wires FTC, court, CMA and completion events with legal regime tags', () => {
    expect(get_campaign_events_key('c8')).toBe('c8_2022_2023');
    const events = load_events().c8_2022_2023;
    expect(events).toHaveLength(8);
    expect(events.map((event) => event.id)).toEqual([
      'c8-2022-01-18-acquisition-announcement',
      'c8-2022-12-08-ftc-complaint',
      'c8-2023-04-26-cma-block',
      'c8-2023-05-15-ec-approval',
      'c8-2023-07-10-court-denies-injunction',
      'c8-2023-09-22-cma-provisional-clearance',
      'c8-2023-10-12-atvi-final-session',
      'c8-2023-10-13-completion',
    ]);
    for (const event of events) {
      expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });
});
