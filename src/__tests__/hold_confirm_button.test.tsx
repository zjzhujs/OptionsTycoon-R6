import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldConfirmButton } from '../components/command/HoldConfirmButton';

describe('HoldConfirmButton safety boundary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps precise mouse confirmation explicit but single-step', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" onConfirm={confirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM' }));
    await act(async () => Promise.resolve());
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('does not let a quick touch tap fall through to synthetic click', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" holdMs={1000} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'CONFIRM' });
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(160));
    fireEvent.pointerUp(button, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.click(button, { detail: 1 });
    await act(async () => Promise.resolve());
    expect(confirm).not.toHaveBeenCalled();
  });


  it('cancels a short hold released before the threshold', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" holdMs={1000} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'CONFIRM' });
    fireEvent.pointerDown(button, { pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button, { pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(900));
    await act(async () => Promise.resolve());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('cancels touch hold when movement exceeds the safety threshold', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" holdMs={1000} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'CONFIRM' });
    fireEvent.pointerDown(button, { pointerId: 4, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(260));
    fireEvent.pointerMove(button, { pointerId: 4, pointerType: 'touch', clientX: 48, clientY: 20 });
    act(() => vi.advanceTimersByTime(1200));
    await act(async () => Promise.resolve());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('cancels on scroll, pointercancel and lost pointer capture', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" holdMs={1000} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'CONFIRM' });

    fireEvent.pointerDown(button, { pointerId: 5, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(260));
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(1200));
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.pointerDown(button, { pointerId: 6, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(260));
    fireEvent.pointerCancel(button, { pointerId: 6, pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(1200));
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.pointerDown(button, { pointerId: 7, pointerType: 'touch', clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(260));
    fireEvent.lostPointerCapture(button, { pointerId: 7, pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(1200));
    await act(async () => Promise.resolve());
    expect(confirm).not.toHaveBeenCalled();
  });

  it('commits once only after touch hold reaches the threshold', async () => {
    const confirm = vi.fn();
    render(<HoldConfirmButton label="CONFIRM" holdMs={1000} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'CONFIRM' });
    fireEvent.pointerDown(button, { pointerId: 2, pointerType: 'touch', clientX: 10, clientY: 10 });
    await act(async () => {
      vi.advanceTimersByTime(1120);
      await Promise.resolve();
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button, { pointerId: 2, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.click(button, { detail: 1 });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
