/**
 * Native search-bar events can omit `text` while closing or being recreated.
 * Keep those platform lifecycle events from putting `undefined` into React
 * state or reaching string-only search/query helpers.
 */
export function coerceMobileNativeSearchText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Native search can blur immediately after the search-button event. React
 * state may still contain the previous render's query at that point, so blur
 * submissions must fall back to the synchronously updated input ref.
 */
export function resolveMobileNativeSearchSubmitText(
  eventText: unknown,
  latestText: string,
): string {
  return typeof eventText === "string" ? eventText : latestText;
}

export type MobileSearchFieldTrailingAccessory = "loading" | "clear";

/**
 * A clear action keeps a native-sized hit target, but text-field containers
 * commonly add their own horizontal inset. Negating that inset lets the hit
 * target reach the field edge while the glyph remains naturally centered
 * inside its 44pt/48dp target.
 */
export function getMobileTextFieldTrailingAccessoryMargin(
  trailingInset: number | undefined,
): number {
  if (
    trailingInset === undefined ||
    !Number.isFinite(trailingInset) ||
    trailingInset <= 0
  ) {
    return 0;
  }
  return -trailingInset;
}

/**
 * Keep the native-style clear glyph pinned to the trailing edge. Transient
 * progress belongs immediately before it so loading never makes the X jump
 * away from the edge a user has learned to target.
 */
export function getMobileSearchFieldTrailingAccessories({
  loading,
  canClear,
}: {
  loading: boolean;
  canClear: boolean;
}): MobileSearchFieldTrailingAccessory[] {
  const accessories: MobileSearchFieldTrailingAccessory[] = [];
  if (loading) accessories.push("loading");
  if (canClear) accessories.push("clear");
  return accessories;
}
