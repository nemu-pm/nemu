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
} as const;

/**
 * The selected bubble popout floats over the sentence sheet, and over Nemu
 * chat only when that chat was opened from the sentence (Ask), web's
 * `openChatAndSend` drawer stacked on the sentence drawer. A chat opened from
 * the capsule has nothing to do with the last bubble, so no popout there.
 * The backdrop itself follows either sheet.
 */
export function japaneseLearningBubblePopoutProgress(
  ocrProgress: number,
  chatProgress: number,
  chatOpenedFromSentence: boolean,
): number {
  "worklet";
  return Math.max(ocrProgress, chatOpenedFromSentence ? chatProgress : 0);
}

/** The JS-side twin of the progress rule: whether screen readers may reach the popout. */
export function isJapaneseLearningBubblePopoutPresented({
  ocrSheetVisible,
  chatVisible,
  chatOpenedFromSentence,
}: {
  ocrSheetVisible: boolean;
  chatVisible: boolean;
  chatOpenedFromSentence: boolean;
}): boolean {
  return ocrSheetVisible || (chatVisible && chatOpenedFromSentence);
}
