import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutModeForWidth, useLayoutMode } from './useLayoutMode';

const originalWidth = window.innerWidth;

function resizeTo(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => resizeTo(originalWidth));

describe('responsive layout mode', () => {
  it('uses the exact 767/768 and 1279/1280 boundaries', () => {
    expect(layoutModeForWidth(375)).toBe('mobile');
    expect(layoutModeForWidth(767)).toBe('mobile');
    expect(layoutModeForWidth(768)).toBe('tablet');
    expect(layoutModeForWidth(1279)).toBe('tablet');
    expect(layoutModeForWidth(1280)).toBe('desktop');
    expect(layoutModeForWidth(1920)).toBe('desktop');
  });

  it('switches shells immediately when the viewport is resized', () => {
    resizeTo(767);
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('mobile');

    act(() => resizeTo(768));
    expect(result.current).toBe('tablet');

    act(() => resizeTo(1280));
    expect(result.current).toBe('desktop');

    act(() => resizeTo(430));
    expect(result.current).toBe('mobile');
  });
});
