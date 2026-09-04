export type NemuTextDensity = "default" | "compact";

/**
 * Sheets and the tab bar sit on measured native surfaces; keep their headroom
 * slightly tighter than the app-wide cap.
 */
export const NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER = 1.5;

/**
 * Resolves the effective `maxFontSizeMultiplier`. An explicit prop always wins
 * so a caller can opt a single node out of the bounded default; otherwise the
 * density picks between the app-wide cap and the compact cap.
 *
 * Pure and free of `react-native` runtime imports so it stays unit-testable.
 */
export function resolveNemuTextMaxFontSizeMultiplier(options: {
  density?: NemuTextDensity;
  defaultMultiplier: number;
  override?: number | null;
}): number {
  const { density = "default", defaultMultiplier, override } = options;

  if (typeof override === "number" && Number.isFinite(override)) {
    return override;
  }

  return density === "compact"
    ? NEMU_TEXT_COMPACT_MAX_FONT_SIZE_MULTIPLIER
    : defaultMultiplier;
}
