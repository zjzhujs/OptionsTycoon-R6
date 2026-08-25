import { useEffect } from 'react';
import type { Grade } from '../engine/engines/trade_grade';

// 鬼泣式评级图章（dante Q1 动效规格）：0.95s 入场、字重 900 倾 3°、
// SSS 一次 120ms 白闪；音效走低频确认音，SSS 加上扬层；reduced-motion 只淡入。
export function GradeStamp({ grade, playSound }: { grade: Grade; playSound?: (k: 'confirm' | 'sss') => void }) {
  useEffect(() => {
    playSound?.(grade === 'SSS' ? 'sss' : 'confirm');
  }, [grade, playSound]);
  const hi = ['SSS', 'SS', 'S'].includes(grade);
  return (
    <div
      className={`grade-stamp grade-stamp-${grade.toLowerCase()} ${hi ? 'grade-stamp-hi' : 'grade-stamp-lo'}${grade === 'SSS' ? ' grade-stamp-sss' : ''}`}
      data-testid="grade-stamp"
      aria-label={`交易质量评级 ${grade}`}
    >
      {grade}
    </div>
  );
}
