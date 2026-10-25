/** Where the Account page shows: a pushed page, or the Settings split's detail column. */
export type MobileAccountPresentation = "page" | "detail-pane";

export type MobileAccountScreenProps = {
  presentation?: MobileAccountPresentation;
  /** After a sign-out / deletion left the page (see `useMobileAccountPage`). */
  onLeft?: () => void;
};

/** Widest the Account Form's sections get in a single column (pt). */
export const MOBILE_ACCOUNT_FORM_MAX_WIDTH = 600;
/** The inset grouped list's own side margin, which a cap never goes below. */
const SYSTEM_SECTION_MARGIN = 20;

/**
 * The Form's horizontal section margin, or null for the system's: a single
 * column wider than the cap centres its sections at 600pt (the Form still
 * scrolls, and its soft edges run, across the whole window); the split's
 * detail column is filled, with the system margins.
 */
export function resolveMobileAccountFormSideMargin({
  presentation,
  width,
}: {
  presentation: MobileAccountPresentation;
  width: number;
}): number | null {
  if (presentation !== "page" || !Number.isFinite(width)) return null;
  const margin = Math.floor((width - MOBILE_ACCOUNT_FORM_MAX_WIDTH) / 2);
  return margin > SYSTEM_SECTION_MARGIN ? margin : null;
}
