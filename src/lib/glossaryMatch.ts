// ---------------------------------------------------------------------------
// Glossary term matcher (pure logic, React-free so it can be unit-tested).
//
// 制作人裁定：专业术语可点击，点开弹详细中文定义。
// 词条数据在 engine/data/glossary.json（文案归 AVG，schema 归这里）。
//
// 匹配规则：
// - 中文词条按子串匹配；英文/缩写要求两侧非字母数字（IV 不能命中 DIVIDEND）。
// - 同一段文本里每个词条只标注第一次出现（挂满是灾难，同段首现原则与
//   双语标注规则一致）。
// - 多词条重叠时长词优先（"隐含波动率"赢过"波动率"类的短词）。
// ---------------------------------------------------------------------------

import glossaryData from '../engine/data/glossary.json';

export interface GlossaryEntry {
  id: string;
  cn: string;
  en: string;
  abbr?: string;
  aliases?: string[];
  definition: string;
  example?: string;
}

export interface TextSegment {
  text: string;
  termId?: string;
}

const ENTRIES: GlossaryEntry[] = ((glossaryData as any).terms ?? []) as GlossaryEntry[];

const BY_ID = new Map<string, GlossaryEntry>(ENTRIES.map((e) => [e.id, e]));

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

export function getGlossaryEntries(): GlossaryEntry[] {
  return ENTRIES;
}

interface Pattern {
  needle: string;
  termId: string;
  isLatin: boolean;
}

const PATTERNS: Pattern[] = (() => {
  const out: Pattern[] = [];
  for (const e of ENTRIES) {
    const needles = new Set<string>([e.cn]);
    if (e.abbr) needles.add(e.abbr);
    for (const a of e.aliases ?? []) needles.add(a);
    for (const needle of needles) {
      if (!needle) continue;
      out.push({ needle, termId: e.id, isLatin: /^[A-Za-z0-9 .+-]+$/.test(needle) });
    }
  }
  // Longest needle first so 隐含波动率 beats shorter overlapping needles.
  out.sort((a, b) => b.needle.length - a.needle.length);
  return out;
})();

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9]/.test(ch);
}

/**
 * Split text into segments, tagging the FIRST occurrence of each glossary term.
 * Terms already tagged earlier in the same call are not tagged again
 * (per-text first-occurrence rule). `seen` may be provided to extend the
 * dedup scope across multiple strings of one surface (e.g. a whole modal).
 */
export function matchGlossary(text: string, seen?: Set<string>): TextSegment[] {
  if (!text || ENTRIES.length === 0) return [{ text }];
  const dedup = seen ?? new Set<string>();
  // Collect candidate matches (start, end, termId), earliest first, longest first.
  interface Hit { start: number; end: number; termId: string }
  const hits: Hit[] = [];
  for (const p of PATTERNS) {
    if (dedup.has(p.termId)) continue;
    let idx = text.indexOf(p.needle);
    while (idx !== -1) {
      if (p.isLatin && (isWordChar(text[idx - 1]) || isWordChar(text[idx + p.needle.length]))) {
        idx = text.indexOf(p.needle, idx + 1);
        continue;
      }
      hits.push({ start: idx, end: idx + p.needle.length, termId: p.termId });
      break; // first occurrence of this needle only
    }
  }
  if (hits.length === 0) return [{ text }];
  // Earliest first; on tie, longer match wins (patterns were longest-first,
  // stable sort keeps that ordering for equal starts).
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue; // overlaps a previous accepted hit
    if (dedup.has(h.termId)) continue;
    dedup.add(h.termId);
    if (h.start > cursor) segments.push({ text: text.slice(cursor, h.start) });
    segments.push({ text: text.slice(h.start, h.end), termId: h.termId });
    cursor = h.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
