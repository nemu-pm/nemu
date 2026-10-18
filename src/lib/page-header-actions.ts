/**
 * How the page header shows an action. On a phone the right-hand group sits on
 * the title's row, and three labelled buttons ("Edit Info", "Manage Sources",
 * "Remove") are wider than the row at 390px: they ran into the title and off
 * the screen edge. An action that has an icon is icon-only there (its label is
 * its accessible name and tooltip); one without an icon keeps its text. From
 * the tablet breakpoint up the label stays.
 */
export interface PageHeaderActionShape {
  label?: string;
  icon?: unknown;
}

export function isPageHeaderActionIconOnly(action: PageHeaderActionShape, isMobile: boolean): boolean {
  return isMobile && Boolean(action.icon);
}

/** Width (rem) the inline title leaves free on its right for the actions that overlay its row. */
export function getPageHeaderActionReserveRem(actions: readonly PageHeaderActionShape[], isMobile: boolean): number {
  if (!actions.length) return 0;
  const iconSlot = 2.5;
  const labelledSlot = 6;
  const gap = 0.5;
  const total = actions.reduce(
    (sum, action) => sum + (isPageHeaderActionIconOnly(action, isMobile) || !action.label ? iconSlot : labelledSlot),
    0,
  );
  return total + gap * Math.max(0, actions.length - 1) + 0.5;
}
