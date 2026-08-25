import { describe, expect, it } from 'vitest';
import { get_campaign_nodes, load_c4_2020, load_events } from '../data_loader';
import {
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  validateOfflineContentPacks,
  validateOfflineIntradaySession,
} from '../engines/offline_content_pack';
import { assertCampaignMacroEventTag } from '../campaign_contract';

describe('C4 Content Pack & Data Wiring (Milestone 2 - P5 Step 1)', () => {
  it('loads C4 2020 market nodes with full 11 trading days and valid OHLCV', () => {
    const nodes = load_c4_2020();
    expect(nodes).toHaveLength(11);
    expect(nodes[0].date).toBe('2020-03-09');
    expect(nodes[nodes.length - 1].date).toBe('2020-03-23');

    for (const node of nodes) {
      expect(node.underlying_bar).toBeDefined();
      expect(node.underlying_bar.close).toBeGreaterThan(0);
      expect(node.underlying_bar.open).toBeGreaterThan(0);
      expect(node.underlying_bar.high).toBeGreaterThanOrEqual(node.underlying_bar.low);
      expect(node.secondary_close).toBeGreaterThan(0);
      expect(node.vix).toBeDefined();
      expect(node.vix?.close).toBeGreaterThan(0);
      expect(node.point_only).toBe(false);
    }

    const campaignNodes = get_campaign_nodes('c4');
    expect(campaignNodes).toHaveLength(11);
    expect(campaignNodes).toBe(nodes);
  });

  it('loads C4 macro events with valid regime tags adhering to union vocabulary', () => {
    const allEvents = load_events();
    const c4Events = allEvents['c4_2020'];
    expect(c4Events).toBeDefined();
    expect(c4Events.length).toBeGreaterThanOrEqual(8);

    for (const event of c4Events) {
      expect(event.id).toMatch(/^c4-2020-/);
      expect(event.date).toBeDefined();
      expect(event.headline.length).toBeGreaterThan(5);
      expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });

  it('provides complete offline intraday sessions and valid manifest for C4', () => {
    const manifest = getOfflineContentPackManifest('c4');
    expect(manifest).not.toBeNull();
    expect(manifest?.pack_id).toBe('c4_intraday_v1');
    expect(manifest?.scenario_id).toBe('c4');
    expect(manifest?.truth_label).toBe('REAL_INTRADAY');
    expect(manifest?.runtime_network_required).toBe(false);
    expect(manifest?.included_sessions.length).toBe(22);
    expect(manifest?.provenance.length).toBeGreaterThanOrEqual(4);

    // Verify each day has SPY and TLT intraday sessions
    const sampleSpy = getOfflineIntradaySession('c4', '2020-03-09', 'SPY');
    expect(sampleSpy).not.toBeNull();
    expect(sampleSpy?.bars.length).toBe(390);
    expect(sampleSpy?.ticker).toBe('SPY');
    expect(() => validateOfflineIntradaySession(sampleSpy!)).not.toThrow();

    const sampleTlt = getOfflineIntradaySession('c4', '2020-03-09', 'TLT');
    expect(sampleTlt).not.toBeNull();
    expect(sampleTlt?.bars.length).toBe(390);
    expect(sampleTlt?.ticker).toBe('TLT');
    expect(() => validateOfflineIntradaySession(sampleTlt!)).not.toThrow();

    // Verify entire suite of offline content packs
    expect(() => validateOfflineContentPacks()).not.toThrow();
  });
});
