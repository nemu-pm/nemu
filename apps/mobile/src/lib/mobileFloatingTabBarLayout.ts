export const MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT = 500;
export const MOBILE_FLOATING_TAB_BAR_MAX_VISUAL_HEIGHT = 76;

export function shouldReserveMobileFloatingTabBarSpace(
  viewportHeight: number,
) {
  return viewportHeight < MOBILE_FLOATING_TAB_BAR_COMPACT_HEIGHT;
}

export function getMobileFloatingTabBarContentInset({
  viewportHeight,
  bottomInset,
  tabBottom,
}: {
  viewportHeight: number;
  bottomInset: number;
  tabBottom: number;
}) {
  if (!shouldReserveMobileFloatingTabBarSpace(viewportHeight)) return 0;
  const safeBottomInset = Number.isFinite(bottomInset)
    ? Math.max(0, bottomInset)
    : 0;
  const safeTabBottom = Number.isFinite(tabBottom) ? Math.max(0, tabBottom) : 0;
  return (
    MOBILE_FLOATING_TAB_BAR_MAX_VISUAL_HEIGHT +
    safeBottomInset +
    safeTabBottom
  );
}
