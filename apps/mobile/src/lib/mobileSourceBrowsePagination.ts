export type MobileSourceBrowseLoadMoreState = {
  hasMore: boolean;
  loading: boolean;
  inFlight: boolean;
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
