/**
 * Native search-bar events can omit `text` while closing or being recreated.
 * Keep those platform lifecycle events from putting `undefined` into React
 * state or reaching string-only search/query helpers.
 */
export function coerceMobileNativeSearchText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
