import { motion, type MotionStyle, type Transition } from 'motion/react';
import { cn } from '../../lib/utils';
import React from 'react';

export interface BorderBeamProps {
  /**
   * The size of the beam in pixels.
   */
  size?: number;
  /**
   * The duration of the beam animation in seconds.
   */
  duration?: number;
  /**
   * The delay of the beam animation in seconds.
   */
  delay?: number;
  /**
   * The color of the beam from.
   */
  colorFrom?: string;
  /**
   * The color of the beam to.
   */
  colorTo?: string;
  /**
   * The motion transition configuration.
   */
  transition?: Transition;
  /**
   * The class name of the beam.
   */
  className?: string;
  /**
   * The style of the beam.
   */
  style?: React.CSSProperties;
  /**
   * Whether to reverse the animation direction.
   */
  reverse?: boolean;
  /**
   * The initial offset position (0-100).
   */
  initialOffset?: number;
  /**
   * The border width of the beam.
   */
  borderWidth?: number;
}

export const BorderBeam = ({
  className,
  size = 60,
  delay = 0,
  duration = 6,
  colorFrom = '#ffd700',
  colorTo = '#00f0ff',
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 1.5
}: BorderBeamProps) => {
  return (
    <motion.div
      aria-hidden="true"
      style={
        {
          '--size': `${size}px`,
          '--duration': `${duration}s`,
          '--anchor': `${initialOffset}%`,
          '--border-width': `${borderWidth}px`,
          '--color-from': colorFrom,
          '--color-to': colorTo,
          ...style
        } as MotionStyle
      }
      className={cn(
        'pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]',
        // Mask styles
        '![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]',
        // Pseudo-element pseudo styles
        'after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam after:[animation-delay:calc(var(--delay)*1s)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)] after:[offset-anchor:calc(var(--anchor)*1%)_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))]',
        className
      )}
      initial={false}
      animate={{
        offsetDistance: reverse ? ['100%', '0%'] : ['0%', '100%']
      }}
      transition={{
        repeat: Infinity,
        ease: 'linear',
        duration,
        delay: -delay,
        ...transition
      }}
    />
  );
};

export default BorderBeam;
