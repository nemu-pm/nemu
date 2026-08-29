export const MOBILE_PAGE_EMPTY_COMPACT_HEIGHT = 500;

export function shouldUseCompactMobilePageEmptyLayout(viewportHeight: number) {
  return viewportHeight < MOBILE_PAGE_EMPTY_COMPACT_HEIGHT;
}
