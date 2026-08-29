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
