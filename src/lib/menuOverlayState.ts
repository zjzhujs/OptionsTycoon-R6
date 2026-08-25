export type VisibilitySetter = (open: boolean) => void;

/** Close the menu-owned appearance overlay and return to the menu that opened it. */
export function closeThemeStudioAndRestoreMenu(
  setThemeStudioOpen: VisibilitySetter,
  setMainMenuOpen: VisibilitySetter,
): void {
  setThemeStudioOpen(false);
  setMainMenuOpen(true);
}
