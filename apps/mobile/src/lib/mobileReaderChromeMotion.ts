/**
 * Which enter/exit treatment the reader chrome should use. Kept apart from
 * `mobileReaderChromeAnimations` so the policy can be unit-tested without
 * pulling Reanimated (and therefore React Native) into the test runtime.
 */
export type ReaderChromeMotionVariant = "slide" | "fade";

/**
 * Reduce Motion drops the 8px translate and leaves a plain cross-fade. The
 * unknown (`null`) read is treated as "reduce", matching the theme provider's
 * motion-safe default, so chrome never slides before the setting resolves.
 */
export function readerChromeMotionVariant(
  reduceMotion: boolean | null,
): ReaderChromeMotionVariant {
  return reduceMotion === false ? "slide" : "fade";
}
