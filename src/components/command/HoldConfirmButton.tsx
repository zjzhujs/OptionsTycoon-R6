import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface HoldConfirmButtonProps {
  label: string;
  sublabel?: string;
  disabled?: boolean;
  /** Touch / coarse-pointer hold duration. Mouse and keyboard confirm with one click. */
  holdMs?: number;
  onConfirm: () => void | Promise<void>;
  className?: string;
  testId?: string;
}

/**
 * Deliberate-action actuator used for irreversible trade actions.
 *
 * Mouse / keyboard: explicit click is sufficient because the pointer is precise.
 * Touch / coarse pointer: the user must keep contact for `holdMs`. Releasing,
 * cancelling or sliding the pointer away resets progress and performs no action.
 *
 * This is intentionally not a generic debounce. The safety boundary is visible
 * in the UI and therefore comprehensible to the player.
 */
export function HoldConfirmButton({
  label,
  sublabel,
  disabled = false,
  holdMs = 1050,
  onConfirm,
  className = '',
  testId = 'hold-confirm',
}: HoldConfirmButtonProps): JSX.Element {
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const touchHoldRef = useRef(false);
  const committedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntilRef = useRef(0);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startedAtRef.current = null;
    touchHoldRef.current = false;
    activePointerIdRef.current = null;
    startPointRef.current = null;
    if (!committedRef.current) setProgress(0);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (touchHoldRef.current) cancelFrame();
    };
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      cancelFrame();
    };
  }, [cancelFrame]);

  const commit = useCallback(async () => {
    if (disabled || committedRef.current) return;
    committedRef.current = true;
    setProgress(1);
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate?.(14); } catch { /* optional hardware feedback */ }
      }
      await onConfirm();
    } finally {
      // Keep the completed state for a beat so the user can see the boundary.
      window.setTimeout(() => {
        committedRef.current = false;
        setProgress(0);
      }, 420);
    }
  }, [disabled, onConfirm]);

  const animateHold = useCallback((now: number) => {
    if (startedAtRef.current == null) startedAtRef.current = now;
    const next = Math.min(1, (now - startedAtRef.current) / holdMs);
    setProgress(next);
    if (next >= 1) {
      frameRef.current = null;
      touchHoldRef.current = false;
      void commit();
      return;
    }
    frameRef.current = requestAnimationFrame(animateHold);
  }, [commit, holdMs]);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // Touch and pen are the high-mistap modes. Mouse stays a deliberate click.
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    event.preventDefault();
    touchHoldRef.current = true;
    activePointerIdRef.current = event.pointerId;
    startPointRef.current = { x: event.clientX, y: event.clientY };
    // Browsers may dispatch a synthetic click after touch pointerup even when we
    // prevented the pointer event. Keep an explicit suppression window so a
    // quick tap can never fall through to the mouse-click confirmation path.
    suppressClickUntilRef.current = Date.now() + Math.max(1600, holdMs + 500);
    committedRef.current = false;
    startedAtRef.current = null;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported browser */ }
    frameRef.current = requestAnimationFrame(animateHold);
  };

  const cancelTouchHold = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (event && touchHoldRef.current) {
      event.preventDefault();
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    }
    cancelFrame();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!touchHoldRef.current || activePointerIdRef.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    const start = startPointRef.current;
    const movedTooFar = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18 : false;
    if (outside || movedTooFar) cancelTouchHold(event);
  };

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    // A synthetic click follows touch pointerup. The hold path already owns it.
    if ((event.detail > 0 && Date.now() < suppressClickUntilRef.current) || touchHoldRef.current || progress > 0) {
      event.preventDefault();
      return;
    }
    void commit();
  };

  return (
    <button
      type="button"
      className={`decision-confirm-actuator ${className}`.trim()}
      data-testid={testId}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelTouchHold}
      onPointerCancel={cancelTouchHold}
      onLostPointerCapture={cancelTouchHold}
      onPointerLeave={(event) => {
        if (touchHoldRef.current && event.buttons !== 0) cancelTouchHold(event);
      }}
      onClick={onClick}
      aria-label={label}
      style={{ '--confirm-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties}
    >
      <span className="decision-confirm-fill" aria-hidden="true" />
      <span className="decision-confirm-copy">
        <strong>{label}</strong>
        {sublabel && <small>{sublabel}</small>}
      </span>
      <span className="decision-confirm-meter" aria-hidden="true">
        <i />
      </span>
    </button>
  );
}
