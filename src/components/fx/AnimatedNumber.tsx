import React, { useEffect, useState, useRef } from 'react';

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  formatFn?: (n: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  duration = 600,
  formatFn,
  className = '',
  style
}) => {
  const [displayValue, setDisplayValue] = useState(value);
  const startValRef = useRef(value);
  const startTimeRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = displayValue;
    const targetVal = value;
    if (startVal === targetVal) return;

    startValRef.current = startVal;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const now = typeof currentTime === 'number' ? currentTime : performance.now();
      const elapsed = Math.max(0, now - startTimeRef.current);
      const progress = Math.min(Math.max(elapsed / duration, 0), 1);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startValRef.current + (targetVal - startValRef.current) * ease;
      setDisplayValue(progress >= 1 ? targetVal : current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const text = formatFn ? formatFn(displayValue) : Math.round(displayValue).toLocaleString();

  return (
    <span className={className} style={style}>
      {text}
    </span>
  );
};

export default AnimatedNumber;
