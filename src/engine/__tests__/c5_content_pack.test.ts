import { describe, expect, it } from 'vitest';
import { assertCampaignMacroEventTag } from '../campaign_contract';
import { get_campaign_events_key, get_campaign_nodes, load_c5_2022, load_events } from '../data_loader';
import { check_carry_data_coverage } from '../settlement';
import {
  checkOfflineDataCoverage,
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  validateOfflineContentPacks,
  validateOfflineIntradaySession,
} from '../engines/offline_content_pack';

describe('C5 P5 data/content vertical slice', () => {
  it('loads the exact five-date NFLX timeline from Part41 real 1m bars', () => {
    const nodes = load_c5_2022();
    expect(nodes).toHaveLength(5);
    expect(nodes[0].date).toBe('2022-04-18');
    expect(nodes[nodes.length - 1].date).toBe('2022-04-22');
    expect(nodes.every((node) => node.underlying_bar.open !== null)).toBe(true);
    expect(nodes.every((node) => node.underlying_bar.high! >= node.underlying_bar.low!)).toBe(true);
    expect(get_campaign_nodes('c5')).toBe(nodes);
  });

  it('registers five real sessions and preserves the two missing-chain downgrade dates', () => {
    const manifest = getOfflineContentPackManifest('c5');
    expect(manifest?.pack_id).toBe('c5_intraday_v1');
    expect(manifest?.data_mode).toBe('INTRADAY_PLUS_AGGREGATE_EVIDENCE');
    expect(manifest?.included_sessions).toHaveLength(5);

    const missingChain = getOfflineIntradaySession('c5', '2022-04-19', 'NFLX');
    const completeChain = getOfflineIntradaySession('c5', '2022-04-20', 'NFLX');
    expect(missingChain?.bars).toHaveLength(390);
    expect(completeChain?.bars).toHaveLength(390);
    expect(() => validateOfflineIntradaySession(missingChain!)).not.toThrow();
    expect(missingChain?.aggregate_evidence?.coverage.complete_option_chain).toBe('MISSING');
    expect(missingChain?.aggregate_evidence?.coverage.iv_crush_scoring).toBe('PARTIAL');
    expect(missingChain?.aggregate_evidence?.iv_crush_scoring_policy).toBe('DOWNGRADED_PARTIAL_CHAIN');
    expect(completeChain?.aggregate_evidence?.coverage.complete_option_chain).toBe('VERIFIED');
    expect(completeChain?.aggregate_evidence?.iv_crush_scoring_policy).toBe('FULL_CHAIN');
    expect(() => validateOfflineContentPacks()).not.toThrow();
  });

  it('exposes honest carry and contract coverage without treating aggregates as a chain', () => {
    const manifest = getOfflineContentPackManifest('c5')!;
    const daily = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('daily_ohlcv'));
    const chain = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('complete_option_chain'));
    const iv = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('iv_crush_scoring'));
    const utilization = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('contract_utilization'));

    expect(daily?.status).toBe('VERIFIED');
    expect(chain?.status).toBe('PARTIAL');
    expect(chain?.available_dates).toEqual(['2022-04-18', '2022-04-20', '2022-04-22']);
    expect(iv?.status).toBe('PARTIAL');
    expect(utilization?.status).toBe('MISSING');

    expect(check_carry_data_coverage('NFLX', '2022-04-19')).toBe(true);
    expect(check_carry_data_coverage('NFLX', '2022-04-23')).toBe(false);
    expect(checkOfflineDataCoverage('c5', '2022-04-20', ['complete_option_chain'])).toBe(true);
    expect(checkOfflineDataCoverage('c5', '2022-04-21', ['complete_option_chain'])).toBe(false);
    expect(checkOfflineDataCoverage('c5', '2022-04-21', ['iv_crush_scoring'])).toBe(false);
  });

  it('wires five C5 event records using only the shared regime vocabulary', () => {
    expect(get_campaign_events_key('c5')).toBe('c5_2022');
    const events = load_events().c5_2022;
    expect(events).toHaveLength(5);
    expect(events.map((event) => event.id)).toEqual([
      'c5-2022-04-18-earnings-window',
      'c5-2022-04-19-earnings-release',
      'c5-2022-04-20-post-earnings-crush',
      'c5-2022-04-21-chain-gap',
      'c5-2022-04-22-earnings-window-close',
    ]);
    for (const event of events) {
      expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });
});
