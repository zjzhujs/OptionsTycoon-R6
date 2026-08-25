import { describe, expect, it } from 'vitest';
import { assertCampaignMacroEventTag } from '../campaign_contract';
import { get_campaign_events_key, get_campaign_nodes, load_c7_2025, load_events } from '../data_loader';
import { CAMPAIGN_MANIFESTS } from '../campaign_manifests';
import { checkOfflineDataCoverage, getOfflineContentPackManifest } from '../engines/offline_content_pack';

describe('C7/H1 final P5 data boundary', () => {
  it('uses the four Part2 official policy-text nodes as C7 events', () => {
    expect(get_campaign_events_key('c7')).toBe('c7_2025');
    const events = load_events().c7_2025;
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.date)).toEqual(['2025-04-02', '2025-04-02', '2025-04-09', '2025-04-11']);
    expect(events.every((event) => event.source.includes('White House'))).toBe(true);
    expect(events.every((event) => event.url?.includes('whitehouse.gov'))).toBe(true);
    for (const event of events) expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
  });

  it('keeps C7 context rows separate from the missing cash-SPX carry gate', () => {
    const nodes = load_c7_2025();
    expect(nodes).toHaveLength(8);
    expect(get_campaign_nodes('c7')).toBe(nodes);
    expect(nodes.every((node) => node.truth_label === 'PROXY')).toBe(true);
    expect(nodes.every((node) => node.provenance.confidence?.includes('not cash SPX/IXIC'))).toBe(true);
    expect(checkOfflineDataCoverage('c7', '2025-04-09', ['daily_ohlcv'])).toBe(false);
    expect(CAMPAIGN_MANIFESTS.c7.required_fields).toEqual(['policy_text', 'scope', 'effective_time']);
  });

  it('makes H1 proxy provenance explicit at pack and campaign boundaries', () => {
    const manifest = getOfflineContentPackManifest('h1')!;
    expect(manifest.truth_label).toBe('PROXY');
    expect(manifest.data_mode).toBe('PROXY');
    expect(manifest.distribution_note).toContain('SPY/QQQ/VXX');
    expect(manifest.distribution_note).toContain('not Cboe VIX');
    expect(CAMPAIGN_MANIFESTS.h1.historical_vs_simulated).toBe('HISTORICAL');
    expect(CAMPAIGN_MANIFESTS.h1.carry_data_coverage.some((rule) => rule.status === 'MISSING')).toBe(true);
  });
});
