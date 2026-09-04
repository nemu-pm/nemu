type MobileListFooterInput = {
  /** Rendered item count; footers only exist once the list has content. */
  itemCount: number;
  /** The next page request is in flight. */
  loadingNextPage: boolean;
  /** The next page request failed while earlier items are still visible. */
  nextPageFailed: boolean;
  /**
   * Whether more pages exist. `undefined` when the source cannot answer yet
   * (list not ready), in which case the footer stays hidden.
   */
  hasMore: boolean | undefined;
};

type MobileListFooterViewState = "loading" | "end" | "error";

/**
 * The single mock footer has three states — loading page N, exhausted (with
 * total), and failed-with-retry — and renders nothing while the list is idle.
 * Failures outrank loading so an in-flight retry keeps the retry row visible.
 */
export function resolveMobileListFooterState(
  input: MobileListFooterInput,
): MobileListFooterViewState | null {
  if (input.itemCount <= 0) return null;
  if (input.nextPageFailed) return "error";
  if (input.loadingNextPage) return "loading";
  if (input.hasMore === false) return "end";
  return null;
}
