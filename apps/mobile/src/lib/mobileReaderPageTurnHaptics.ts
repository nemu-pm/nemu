/**
 * Page Turn Haptics (reader settings, More): the tap a page turn plays — a
 * tap, swipe, slide or curl turn, a chapter crossed, the slider passing a
 * page, a pull past the end of the strip. Off unless chosen (`undefined` in
 * storage is off). Other haptics (buttons, toggles, errors) follow only the
 * app's haptics switch.
 *
 * Module-level, as `mobileHapticsGate`: the reader pushes the saved choice in,
 * and the scrubber and the gallery read it without a prop through each.
 */
export const DEFAULT_READER_PAGE_TURN_HAPTICS = false;

let pageTurnHapticsEnabled = DEFAULT_READER_PAGE_TURN_HAPTICS;

export function setMobileReaderPageTurnHapticsEnabled(enabled: boolean): void {
  pageTurnHapticsEnabled = enabled;
}

/** Whether a page turn plays its haptic now. */
export function mobileReaderPageTurnHapticsEnabled(): boolean {
  return pageTurnHapticsEnabled;
}

/** The saved value, or the default (off) when there is none. */
export function normalizeReaderPageTurnHaptics(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_READER_PAGE_TURN_HAPTICS;
}
