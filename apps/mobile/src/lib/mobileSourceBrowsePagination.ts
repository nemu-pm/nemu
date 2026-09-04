export type MobileSourceBrowseLoadMoreState = {
  hasMore: boolean;
  loading: boolean;
  inFlight: boolean;
};

export type MobileSourceBrowsePagination = {
  hasMore: boolean;
  loading: boolean;
};

export function isMobileSourceBrowseLoadMoreBusy(
  state: Pick<MobileSourceBrowseLoadMoreState, "loading" | "inFlight">,
): boolean {
  return state.loading || state.inFlight;
}

export function canLoadMoreMobileSourceBrowseResults(
  state: MobileSourceBrowseLoadMoreState,
): boolean {
  return (
    state.hasMore &&
    !isMobileSourceBrowseLoadMoreBusy({
      loading: state.loading,
      inFlight: state.inFlight,
    })
  );
}

/**
 * Fold a browse-list state transition into the pagination guard ref.
 *
 * `readyHasMore` is only set when a fresh "ready" result just landed; every
 * other transition (loading, blocked, error, idle) keeps the last-known
 * `hasMore`. Collapsing `hasMore` to `false` while a load-more is in flight
 * used to make the `onEndReached` guard silently drop the next trigger (no
 * fetch, no loading footer) until a later scroll event after the ref
 * re-synced — the "footer never shows, then content pops in" report.
 */
export function resolveMobileSourceBrowsePagination(
  current: MobileSourceBrowsePagination,
  next: {
    loading: boolean;
    /** `undefined` when no fresh ready result lands in this transition. */
    readyHasMore?: boolean;
  },
): MobileSourceBrowsePagination {
  return {
    hasMore: next.readyHasMore ?? current.hasMore,
    loading: next.loading,
  };
}
