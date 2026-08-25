import { describe, expect, it } from 'vitest';
import { assertCampaignMacroEventTag } from '../campaign_contract';
import { get_campaign_events_key, get_campaign_nodes, load_events, load_gme_2021 } from '../data_loader';
import { check_carry_data_coverage } from '../settlement';
import {
  checkOfflineDataCoverage,
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  validateOfflineContentPacks,
  validateOfflineIntradaySession,
} from '../engines/offline_content_pack';

describe('GME P5 data/content vertical slice', () => {
  it('loads the exact 19-date GME timeline from real 1m-derived daily nodes', () => {
    const nodes = load_gme_2021();
    expect(nodes).toHaveLength(19);
    expect(nodes[0].date).toBe('2021-01-11');
    expect(nodes[nodes.length - 1].date).toBe('2021-02-05');
    expect(nodes.find((node) => node.date === '2021-01-28')?.underlying_bar.high).toBe(483);
    expect(nodes.every((node) => node.vix === null)).toBe(true);
    expect(get_campaign_nodes('gme')).toBe(nodes);
  });

  it('registers all 19 sessions and preserves observed missing intraday minutes', () => {
    const manifest = getOfflineContentPackManifest('gme');
    expect(manifest?.pack_id).toBe('gme_intraday_v1');
    expect(manifest?.data_mode).toBe('INTRADAY_PLUS_AGGREGATE_EVIDENCE');
    expect(manifest?.included_sessions).toHaveLength(19);

    const fracture = getOfflineIntradaySession('gme', '2021-01-28', 'GME');
    expect(fracture).not.toBeNull();
    expect(fracture?.bars).toHaveLength(314);
    expect(() => validateOfflineIntradaySession(fracture!)).not.toThrow();
    expect(fracture?.aggregate_evidence?.mode).toBe('AGGREGATE_EVIDENCE');
    expect(fracture?.aggregate_evidence?.coverage.contract_iv).toBe('MISSING');
    expect(fracture?.aggregate_evidence?.metrics.options_call_contracts_m).toBe(0.2);

    expect(() => validateOfflineContentPacks()).not.toThrow();
  });

  it('records real coverage ratios and refuses missing carry fields', () => {
    const manifest = getOfflineContentPackManifest('gme')!;
    const borrow = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('borrow_fee'));
    const options = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('options_aggregate'));
    const contract = manifest.carry_data_coverage?.find((rule) => rule.required_fields.includes('contract_iv_greeks_utilization'));

    expect(borrow?.status).toBe('PARTIAL');
    expect(borrow?.available_dates).toHaveLength(14);
    expect(options?.coverage_ratio).toBeCloseTo(4 / 19);
    expect(contract?.status).toBe('MISSING');

    expect(check_carry_data_coverage('GME', '2021-01-12')).toBe(true);
    expect(check_carry_data_coverage('GME', '2021-01-11')).toBe(false);
    expect(check_carry_data_coverage('GME', '2021-01-28')).toBe(false);
    expect(checkOfflineDataCoverage('gme', '2021-01-28', ['options_aggregate'])).toBe(true);
    expect(checkOfflineDataCoverage('gme', '2021-01-28', ['contract_iv_greeks_utilization'])).toBe(false);
  });

  it('adds eight public event nodes with only union vocabulary tags', () => {
    expect(get_campaign_events_key('gme')).toBe('gme_2021');
    const events = load_events().gme_2021;
    expect(events).toHaveLength(8);
    expect(events.map((event) => event.id)).toEqual([
      'gme-2021-01-11-setup',
      'gme-2021-01-22-first-feedback',
      'gme-2021-01-25-acceleration',
      'gme-2021-01-27-stress',
      'gme-2021-01-28-fracture',
      'gme-2021-01-29-restrictions',
      'gme-2021-02-01-unwind',
      'gme-2021-02-05-postmortem',
    ]);
    for (const event of events) {
      expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });
});
