import { useCallback, useEffect, useMemo, useState } from 'react';

export interface TypewriterOptions {
  disabled?: boolean;
  msPerChar?: number;
}

export function useTypewriterSequence(
  segments: string[],
  resetKey: string,
  options: TypewriterOptions = {},
) {
  const { disabled = false, msPerChar = 26 } = options;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const chars = useMemo(() => segments.map((s) => Array.from(s)), [segments]);
  const instant = disabled || reduceMotion;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    setSegmentIndex(0);
    setCharIndex(0);
  }, [resetKey]);

  const current = chars[segmentIndex] ?? [];
  const segmentComplete = instant || charIndex >= current.length;
  const complete =
    instant ||
    chars.length === 0 ||
    (segmentIndex === chars.length - 1 && segmentComplete);

  useEffect(() => {
    if (instant || segmentComplete || current.length === 0) return;
    const previous = current[charIndex - 1] ?? '';
    const delay =
      /[。！？!?]/.test(previous) ? 180 :
      /[，、：；,:;]/.test(previous) ? 85 :
      msPerChar;

    const timer = window.setTimeout(
      () => setCharIndex((n) => Math.min(current.length, n + 1)),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [charIndex, current, instant, msPerChar, segmentComplete]);

  const advance = useCallback(() => {
    if (instant || complete) return;
    if (!segmentComplete) {
      setCharIndex(current.length);
      return;
    }
    setSegmentIndex((n) => Math.min(chars.length - 1, n + 1));
    setCharIndex(0);
  }, [chars.length, complete, current.length, instant, segmentComplete]);

  const visible = chars.map((part, index) => {
    if (instant || index < segmentIndex) return part.join('');
    if (index === segmentIndex) return part.slice(0, charIndex).join('');
    return '';
  });

  return { visible, complete, advance };
}
