/**
 * The iPhone Duo outer display's system vertical bar, from the top: Back, the
 * cover toggle (in its own glass), the actions pill, then ⋯ in its own glass.
 * The system lays the items out; these are its positions, measured on the
 * outer display at 3x (466 × 678pt): Back at 179, each separate glass 60
 * below the one before, the pill's items 52 apart, every item 38 tall in a
 * glass that reaches 7 past it.
 */
const BAR_FIRST_ITEM_Y = 179;
const BAR_GROUP_STEP = 60;
const BAR_PILL_STEP = 52;
const BAR_ITEM_SIZE = 38;
const BAR_GLASS_OVERHANG = 7;
const BAR_BOTTOM_EDGE = 20;

/** The most actions the pill takes the chapter list's button up to, as on the bottom bar. */
export const READER_VERTICAL_BAR_MAX_ACTIONS = 4;

/**
 * Whether the chapter list's button joins `otherActions` in the pill: at most
 * the cap, and ⋯ still below the pill within the window. Otherwise it is a ⋯
 * row; nothing else ever leaves the pill.
 */
export function mobileReaderVerticalBarChapterListFits(
  otherActions: number,
  input: { height: number; bottomInset: number; coverToggle: boolean },
): boolean {
  if (otherActions + 1 > READER_VERTICAL_BAR_MAX_ACTIONS) return false;
  const firstPillItem = BAR_FIRST_ITEM_Y + BAR_GROUP_STEP * (input.coverToggle ? 2 : 1);
  const lastPillItem = firstPillItem + BAR_PILL_STEP * otherActions;
  const moreBottom = lastPillItem + BAR_GROUP_STEP + BAR_ITEM_SIZE + BAR_GLASS_OVERHANG;
  const bottomInset = Number.isFinite(input.bottomInset) ? input.bottomInset : 0;
  return moreBottom <= input.height - Math.max(BAR_BOTTOM_EDGE, bottomInset);
}
