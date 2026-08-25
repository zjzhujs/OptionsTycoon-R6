import { describe, expect, it, vi } from 'vitest';
import { closeThemeStudioAndRestoreMenu } from './menuOverlayState';

describe('main-menu appearance overlay regression', () => {
  it('restores the main menu when Theme Studio closes', () => {
    const setThemeStudioOpen = vi.fn();
    const setMainMenuOpen = vi.fn();

    closeThemeStudioAndRestoreMenu(setThemeStudioOpen, setMainMenuOpen);

    expect(setThemeStudioOpen).toHaveBeenCalledWith(false);
    expect(setMainMenuOpen).toHaveBeenCalledWith(true);
  });
});
