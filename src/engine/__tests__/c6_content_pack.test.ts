import { describe, expect, it } from 'vitest';
import { get_campaign_nodes, load_c6_2022, load_events } from '../data_loader';
import {
  getOfflineContentPackManifest,
  getOfflineIntradaySession,
  validateOfflineContentPacks,
  validateOfflineIntradaySession,
} from '../engines/offline_content_pack';
import { assertCampaignMacroEventTag } from '../campaign_contract';

describe('C6 Content Pack & Data Wiring (Milestone 2 - P5 Step 2)', () => {
  it('loads C6 2022 market nodes with full 7 trading days and valid OHLCV', () => {
    const nodes = load_c6_2022();
    expect(nodes).toHaveLength(7);
    expect(nodes[0].date).toBe('2022-06-09');
    expect(nodes[nodes.length - 1].date).toBe('2022-06-17');

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

    const campaignNodes = get_campaign_nodes('c6');
    expect(campaignNodes).toHaveLength(7);
    expect(campaignNodes).toBe(nodes);
  });

  it('loads C6 macro events with valid regime tags adhering to union vocabulary', () => {
    const allEvents = load_events();
    const c6Events = allEvents['c6_2022'];
    expect(c6Events).toBeDefined();
    expect(c6Events.length).toBeGreaterThanOrEqual(7);

    for (const event of c6Events) {
      expect(event.id).toMatch(/^c6-2022-/);
      expect(event.date).toBeDefined();
      expect(event.headline.length).toBeGreaterThan(5);
      expect(() => assertCampaignMacroEventTag(event.tag)).not.toThrow();
    }
  });

  it('provides complete offline intraday sessions and valid manifest for C6', () => {
    const manifest = getOfflineContentPackManifest('c6');
    expect(manifest).not.toBeNull();
    expect(manifest?.pack_id).toBe('c6_intraday_v1');
    expect(manifest?.scenario_id).toBe('c6');
    expect(manifest?.truth_label).toBe('REAL_INTRADAY');
    expect(manifest?.runtime_network_required).toBe(false);
    expect(manifest?.included_sessions.length).toBe(14);
    expect(manifest?.provenance.length).toBeGreaterThanOrEqual(4);

    // Verify each day has QQQ and TLT intraday sessions
    const sampleQqq = getOfflineIntradaySession('c6', '2022-06-10', 'QQQ');
    expect(sampleQqq).not.toBeNull();
    expect(sampleQqq?.bars.length).toBe(390);
    expect(sampleQqq?.ticker).toBe('QQQ');
    expect(() => validateOfflineIntradaySession(sampleQqq!)).not.toThrow();

    const sampleTlt = getOfflineIntradaySession('c6', '2022-06-10', 'TLT');
    expect(sampleTlt).not.toBeNull();
    expect(sampleTlt?.bars.length).toBe(390);
    expect(sampleTlt?.ticker).toBe('TLT');
    expect(() => validateOfflineIntradaySession(sampleTlt!)).not.toThrow();

    // Verify entire suite of offline content packs
    expect(() => validateOfflineContentPacks()).not.toThrow();
  });
});
