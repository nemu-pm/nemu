/**
 * Web `DrawerOverlay` (src/components/ui/drawer.tsx) behind the learning
 * sheets: `bg-black/10 backdrop-blur-xs` (4px) over the reader, with the
 * reader chrome underneath it and the bubble popout above it.
 */
export const JAPANESE_LEARNING_SHEET_BACKDROP = {
  /** `bg-black/10`. */
  dimOpacity: 0.1,
  /** Reduce Transparency: no blur, so a denser dim keeps the page recessive. */
  reducedTransparencyDimOpacity: 0.35,
  /** expo-blur intensity closest to CSS `blur(4px)` at phone scale. */
  blurIntensity: 14,
  /** Web `fade-in-0` / `fade-out-0` (tw-animate default 150ms). */
  fadeMs: 150,
} as const;

/**
 * The backdrop (and the bubble popout above it) belongs to the sheet
 * presentation of the sentence view and Nemu chat — web's drawers. The
 * transcript is a popover on web (no overlay).
 */
export function shouldShowJapaneseLearningSheetBackdrop({
  ocrSheetVisible,
  chatVisible,
  chatHandoffPending,
}: {
  ocrSheetVisible: boolean;
  chatVisible: boolean;
  /** Sentence → chat hand-off: the sentence sheet is dismissing before the chat presents. */
  chatHandoffPending: boolean;
}): boolean {
  return ocrSheetVisible || chatVisible || chatHandoffPending;
}
