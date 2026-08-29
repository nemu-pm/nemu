export const MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT = 500;

export function shouldReserveMobileFloatingTabBarSpace(
  viewportHeight: number,
) {
  return viewportHeight < MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT;
}
