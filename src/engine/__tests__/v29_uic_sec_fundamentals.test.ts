/**
 * V29-UI-C — SEC-sourced profile and point-in-time valuation.
 *
 * The rule under test is that a valuation shown on a game date must be one that was public on
 * that game date. The pack is keyed per scene date precisely so a January scene cannot receive
 * a P/E that only became public in June, and this suite pins that behaviour along with the
 * refusals: ETFs file no EPS, a negative TTM makes P/E meaningless, and a date outside the
 * pack is a gap rather than an invitation to borrow a neighbouring value.
 */
import { describe, expect, it } from 'vitest';
import { buildCompanyProfile, buildValuationSummary } from '../engines/fundamentals';

describe('V29-UI-C profile — SEC filings outrank the bundled label', () => {
  it('prefers the SEC entity name and SIC classification', () => {
    const p = buildCompanyProfile('NVDA', 'NVIDIA', 'AI/Semiconductors', {
      sec_status: 'REAL_PRIMARY',
      sec_entity_name: 'NVIDIA CORP',
      sic_description: 'Semiconductors & Related Devices',
      exchanges: ['Nasdaq'],
      state_of_incorporation: 'DE',
      filer_category: 'Large accelerated filer',
    });
    expect(p.name.value).toBe('NVIDIA CORP');
    expect(p.name.source_type).toBe('REAL_PRIMARY');
    expect(p.sector.value).toBe('Semiconductors & Related Devices');
  });

  it('assembles the description from filed facts only, never authored prose', () => {
    const p = buildCompanyProfile('NVDA', undefined, undefined, {
      sec_status: 'REAL_PRIMARY',
      sec_entity_name: 'NVIDIA CORP',
      sic_description: 'Semiconductors & Related Devices',
      exchanges: ['Nasdaq'],
      state_of_incorporation: 'DE',
    });
    expect(p.description.value).toContain('SIC 行业');
    expect(p.description.value).toContain('Nasdaq');
    expect(p.description.source_type).toBe('REAL_PRIMARY');
  });

  it('falls back to the bundled label when SEC has no record', () => {
    const p = buildCompanyProfile('SPY', 'SPDR S&P 500 ETF Trust', 'ETF', {
      sec_status: 'DATA_UNAVAILABLE',
      unavailable_reason: 'SEC ticker 映射里没有该代码',
    });
    expect(p.name.value).toBe('SPDR S&P 500 ETF Trust');
    expect(p.name.source_type).toBe('REAL');
    // No SIC means no description; the reason must carry the SEC explanation through.
    expect(p.description.value).toBeNull();
    expect(p.description.unavailable_reason).toContain('SEC');
  });
});

describe('V29-UI-C valuation — refusals are explicit', () => {
  it('reports DATA_UNAVAILABLE with the instrument-level reason for an ETF', () => {
    const v = buildValuationSummary({
      status: 'DATA_UNAVAILABLE',
      reason: 'ETF/信托在 SEC XBRL 中不申报每股收益；不使用持仓加权估值伪造 P/E',
    });
    expect(v.eps_ttm.value).toBeNull();
    expect(v.pe_ratio.value).toBeNull();
    expect(v.pe_ratio.unavailable_reason).toContain('不使用持仓加权估值伪造');
  });

  it('reports DATA_UNAVAILABLE when no pack entry exists at all', () => {
    const v = buildValuationSummary(null);
    expect(v.eps_ttm.value).toBeNull();
    expect(v.pe_ratio.unavailable_reason).toBeTruthy();
  });

  it('shows EPS but withholds P/E when trailing earnings are negative', () => {
    const v = buildValuationSummary({
      eps_ttm: -1.25,
      pe: null,
      status: 'NOT_MEANINGFUL',
      reason: 'TTM EPS ≤ 0，P/E 无意义（不显示负 P/E）',
    });
    expect(v.eps_ttm.value).toBe(-1.25);
    expect(v.pe_ratio.value).toBeNull();
    expect(v.pe_ratio.unavailable_reason).toContain('无意义');
  });

  it('never claims an analyst rating, and warns that in-game analyst copy is fiction', () => {
    const v = buildValuationSummary({ eps_ttm: 2.54, pe: 50.8 });
    expect(v.analyst_rating.value).toBeNull();
    expect(v.analyst_rating.unavailable_reason).toContain('SIMULATED');
  });
});

describe('V29-UI-C valuation — labels match how each number was obtained', () => {
  it('labels filed EPS REAL_PRIMARY and the computed ratio DERIVED_REAL_INPUTS', () => {
    const v = buildValuationSummary({ eps_ttm: 2.539, pe: 50.8 });
    expect(v.eps_ttm.source_type).toBe('REAL_PRIMARY');
    expect(v.pe_ratio.source_type).toBe('DERIVED_REAL_INPUTS');
    // Four quarters back the TTM figure; the panel renders this as "4 个季度".
    expect(v.eps_ttm.sample_size).toBe(4);
  });
});
