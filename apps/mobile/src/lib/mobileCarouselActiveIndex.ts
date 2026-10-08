/**
 * Which card of a snapping carousel is the active one while it scrolls.
 *
 * The active card is the one nearest its resting place, so it changes the
 * moment the finger carries the row across the midpoint between two cards —
 * not when the scroll settles. A small hysteresis keeps a finger wobbling
 * around a midpoint from switching back and forth: leaving the current card
 * takes a little more than half an interval, so coming back to it needs the
 * row to move back by twice the hysteresis first.
 *
 * Worklets: these run on the UI thread inside the scroll handler.
 */

/** Share of an interval past the midpoint before the active card changes. */
export const MOBILE_CAROUSEL_SWITCH_HYSTERESIS = 0.08;

/**
 * The active index for a scroll offset, given the index that is active now.
 * At rest on any snap point the result is that snap point's card, whatever
 * `current` was.
 */
export function getMobileCarouselActiveIndex(
  offset: number,
  interval: number,
  count: number,
  current: number,
  hysteresis: number = MOBILE_CAROUSEL_SWITCH_HYSTERESIS,
): number {
  "worklet";
  if (count <= 1 || !(interval > 0) || !Number.isFinite(offset)) return 0;
  const last = count - 1;
  const held = Math.max(0, Math.min(last, Math.round(current)));
  const position = offset / interval;
  if (Math.abs(position - held) <= 0.5 + hysteresis) return held;
  // Overscroll past either end rounds outside the range and stays on the end card.
  return Math.max(0, Math.min(last, Math.round(position)));
}

type MobileCarouselSwitchState = {
  /** The active card. */
  index: number;
  /** The scroll comes from the user's finger (a drag or the fling after it). */
  userDriven: boolean;
};

/**
 * One scroll frame: the next active index and whether crossing to it ticks
 * (a selection haptic). Cards are crossed one frame apart even in a fast
 * fling (a frame would have to cover a whole card to skip one), so this is
 * one tick per card crossed. Nothing ticks for scrolls the user did not
 * start — first layout, a re-anchor after the window changed — or while the
 * index stays put.
 */
export function stepMobileCarouselSwitch(
  state: MobileCarouselSwitchState,
  offset: number,
  interval: number,
  count: number,
): { index: number; tick: boolean } {
  "worklet";
  const index = getMobileCarouselActiveIndex(offset, interval, count, state.index);
  return { index, tick: state.userDriven && index !== state.index };
}
