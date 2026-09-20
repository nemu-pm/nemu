// The wordmark is typography, not artwork: the web app sets the app name in
// Noto Serif JP at weight 500 with `letter-spacing: -0.02em`. React Native
// takes letter spacing in absolute points, so derive it from the size the
// wordmark is rendered at instead of hardcoding a value per call site.
export const NEMU_BRAND_LETTER_SPACING_RATIO = -0.02;

export function nemuBrandLetterSpacing(fontSize: number): number {
  return fontSize * NEMU_BRAND_LETTER_SPACING_RATIO;
}
