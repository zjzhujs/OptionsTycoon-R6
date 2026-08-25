import { describe, expect, it } from 'vitest';
import { getGlossaryEntries, getGlossaryEntry, matchGlossary } from './glossaryMatch';

describe('glossaryMatch 术语词典匹配', () => {
  it('词条数据有效：非空且必备字段齐全', () => {
    const entries = getGlossaryEntries();
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const e of entries) {
      expect(e.id).toBeTruthy();
      expect(e.cn).toBeTruthy();
      expect(e.en).toBeTruthy();
      expect(e.definition.length).toBeGreaterThan(20);
    }
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('中文术语按子串命中并只标注首现', () => {
    const segs = matchGlossary('隐含波动率飙升，隐含波动率随后回落');
    const tagged = segs.filter((s) => s.termId === 'iv');
    expect(tagged).toHaveLength(1);
    expect(tagged[0].text).toBe('隐含波动率');
    expect(segs.map((s) => s.text).join('')).toBe('隐含波动率飙升，隐含波动率随后回落');
  });

  it('英文缩写要求词边界：IV 不命中 DIVIDEND', () => {
    const segs = matchGlossary('DIVIDEND policy unchanged');
    expect(segs.every((s) => !s.termId)).toBe(true);
    const hit = matchGlossary('当前 IV 已超过 200%');
    expect(hit.some((s) => s.termId === 'iv' && s.text === 'IV')).toBe(true);
  });

  it('跨文本共享 seen：同一界面第二段不重复标注', () => {
    const seen = new Set<string>();
    const a = matchGlossary('权利金太贵', seen);
    const b = matchGlossary('权利金继续上涨', seen);
    expect(a.some((s) => s.termId === 'premium')).toBe(true);
    expect(b.every((s) => !s.termId)).toBe(true);
  });

  it('重叠时长词优先且原文不丢字', () => {
    const text = '做市商的伽马挤压推动逼空';
    const segs = matchGlossary(text);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    expect(segs.some((s) => s.termId === 'gamma-squeeze')).toBe(true);
    expect(segs.some((s) => s.termId === 'market-maker')).toBe(true);
    expect(segs.some((s) => s.termId === 'short-squeeze')).toBe(true);
  });

  it('getGlossaryEntry 按 id 取词条', () => {
    expect(getGlossaryEntry('iv')?.cn).toBe('隐含波动率');
    expect(getGlossaryEntry('不存在')).toBeUndefined();
  });
});
