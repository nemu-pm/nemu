export function normalizeMobileSourceBrowseRouteQuery(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Keep the native search surface mounted while a user edits or resets source
 * filters. A single space is the route-level sentinel for an intentionally
 * active search whose visible query is empty. */
export function makeMobileSourceBrowseSearchRouteQuery(query: string): string {
  return normalizeMobileSourceBrowseRouteQuery(query) || " ";
}

export function canClearMobileSourceBrowseTextInput(query: string): boolean {
  return query.length > 0;
}

export function shouldRunMobileSourceBrowseSearchSubmitFeedback({
  query,
  routeQuery,
  routeSearchActive,
  activeFilterCount,
}: {
  query: string;
  routeQuery: string;
  routeSearchActive: boolean;
  activeFilterCount: number;
}): boolean {
  const nextQuery = normalizeMobileSourceBrowseRouteQuery(query);
  if (!nextQuery && activeFilterCount <= 0) return false;
  if (nextQuery !== routeQuery) return true;
  return !routeSearchActive;
}

export function hasMobileSourceBrowseRouteQuery(
  value: string | string[] | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.length > 0;
}

export function makeMobileSourceHomeGenerationKey({
  sourceRuntimeKey,
  packageUri,
  packageCacheKey,
  sourceVersion,
  downloadUrl,
  settingsSignature,
  runtimeRefreshKey,
}: {
  sourceRuntimeKey: string | null;
  packageUri?: string | null;
  packageCacheKey?: string | null;
  sourceVersion?: number | null;
  downloadUrl?: string | null;
  settingsSignature?: string | null;
  runtimeRefreshKey: number;
}): string | null {
  if (!sourceRuntimeKey) return null;
  return [
    sourceRuntimeKey,
    packageUri ?? "",
    packageCacheKey ?? "",
    sourceVersion ?? "",
    downloadUrl ?? "",
    settingsSignature ?? "",
    runtimeRefreshKey,
  ].join(":");
}

export function shouldFetchMobileSourceHome({
  completedGenerationKey,
  nextGenerationKey,
}: {
  completedGenerationKey: string | null;
  nextGenerationKey: string | null;
}): boolean {
  return nextGenerationKey !== null && completedGenerationKey !== nextGenerationKey;
}

type SourceBrowseRouteListing = {
  id: string;
};

export function normalizeMobileSourceBrowseRouteTab(
  value: string | string[] | undefined,
): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const tab = Number(trimmed);
  return Number.isInteger(tab) && tab >= 0 ? tab : null;
}

export function getMobileSourceBrowseListingIdForRouteTab(
  tab: number | null,
  listings: SourceBrowseRouteListing[],
  hasHomeProvider: boolean,
): string | null {
  if (tab === null) return null;
  const listingIndex = tab - (hasHomeProvider ? 1 : 0);
  if (listingIndex < 0) return null;
  return listings[listingIndex]?.id ?? null;
}

export function getMobileSourceBrowseRouteTabForListingId(
  listingId: string,
  listings: SourceBrowseRouteListing[],
  hasHomeProvider: boolean,
): number | null {
  const listingIndex = listings.findIndex((listing) => listing.id === listingId);
  if (listingIndex < 0) return null;
  return listingIndex + (hasHomeProvider ? 1 : 0);
}

export function getDefaultMobileSourceBrowseListingId(
  listings: SourceBrowseRouteListing[],
  hasHomeProvider: boolean,
): string | null {
  if (hasHomeProvider) return null;
  return listings[0]?.id ?? null;
}

export function getMobileSourceBrowseListingTabCount(
  hasHomeProvider: boolean,
  listingCount: number,
): number {
  return (hasHomeProvider ? 1 : 0) + listingCount;
}

export function shouldShowMobileSourceBrowseListingTabBar({
  listingTabCount,
  sourceHomeProviderKnown,
  onlySearch,
}: {
  listingTabCount: number;
  sourceHomeProviderKnown: boolean;
  onlySearch: boolean;
}): boolean {
  return sourceHomeProviderKnown && !onlySearch && listingTabCount > 1;
}

export function isMobileSourceBrowseHomeTabPending({
  onlySearch,
  sourceHomeProviderKnown,
  metadataStatus,
  homeStatus,
}: {
  onlySearch: boolean;
  sourceHomeProviderKnown: boolean;
  metadataStatus: "idle" | "loading" | "ready" | "error" | string;
  homeStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
}): boolean {
  if (onlySearch || sourceHomeProviderKnown) return false;
  return (
    metadataStatus === "idle" ||
    metadataStatus === "loading" ||
    homeStatus === "idle" ||
    homeStatus === "loading"
  );
}

export function shouldRenderMobileSourceBrowseSearchHeader({
  showControls,
  filterCount,
  filterCountKnown,
  filtersBlocked,
  filtersErrored,
}: {
  showControls: boolean;
  filterCount: number;
  filterCountKnown: boolean;
  filtersBlocked: boolean;
  filtersErrored: boolean;
}): boolean {
  return (
    showControls ||
    filterCount > 0 ||
    filterCountKnown ||
    filtersBlocked ||
    filtersErrored
  );
}

/**
 * Search mode always issues a request: an empty query with no filters still
 * asks the source for its default page. So an `idle` search state while search
 * mode is active is never "your turn to type" — it is "the debounced first
 * request has not fired yet", which is also the window the browse metadata
 * that carries the filters is fetched in (that fetch leaves the filters state
 * `idle`, not `loading`). Treating it as a user prompt is what flashed
 * "search this source or choose filters" over what is really a loading screen
 * on every source open.
 */
export function isMobileSourceBrowseSearchRequestPending({
  sourceSearchActive,
  hasSource,
  searchStatus,
}: {
  sourceSearchActive: boolean;
  hasSource: boolean;
  searchStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
}): boolean {
  if (!sourceSearchActive || !hasSource) return false;
  return searchStatus === "idle" || searchStatus === "loading";
}

export function shouldShowCenterSourceBrowseSearchProgress({
  sourceSearchActive,
  listingItemCount,
  searchStatus,
  filtersStatus,
  searchRequestPending,
}: {
  sourceSearchActive: boolean;
  listingItemCount: number;
  searchStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  filtersStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  searchRequestPending: boolean;
}): boolean {
  if (!sourceSearchActive || listingItemCount > 0) return false;
  if (searchStatus === "loading" || filtersStatus === "loading") return true;
  return searchRequestPending;
}

export function shouldShowSourceBrowseBootstrapping({
  sourceSearchActive,
  showExecutableSourceSections,
  hasSource,
  metadataStatus,
  sourceHomeTabPending,
  showSourceHomeSection,
  homeStatus,
  sourceHomeHasComponents,
}: {
  sourceSearchActive: boolean;
  showExecutableSourceSections: boolean;
  hasSource: boolean;
  metadataStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  sourceHomeTabPending: boolean;
  showSourceHomeSection: boolean;
  homeStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  sourceHomeHasComponents: boolean;
}): boolean {
  if (sourceSearchActive || !showExecutableSourceSections || !hasSource) {
    return false;
  }
  if (metadataStatus === "idle" || metadataStatus === "loading") {
    return true;
  }
  if (sourceHomeTabPending) return true;
  if (
    showSourceHomeSection &&
    !sourceHomeHasComponents &&
    (homeStatus === "idle" || homeStatus === "loading")
  ) {
    return true;
  }
  return false;
}

export function shouldPreserveSourceBrowseSearchItemsOnDeactivate({
  sourceExpectsHomeTab,
}: {
  sourceExpectsHomeTab: boolean;
}): boolean {
  return sourceExpectsHomeTab;
}

export function shouldShowSourceBrowseHomeSkeleton({
  showSourceHomeSection,
  sourceHasHomeProvider,
  sourceHomeProviderKnown,
  homeStatus,
  sourceHomeHasComponents,
}: {
  showSourceHomeSection: boolean;
  sourceHasHomeProvider: boolean;
  sourceHomeProviderKnown: boolean;
  homeStatus: "idle" | "loading" | "ready" | "blocked" | "error" | string;
  sourceHomeHasComponents: boolean;
}): boolean {
  if (!showSourceHomeSection || sourceHomeHasComponents) return false;
  if (homeStatus === "loading") return true;
  if (homeStatus !== "idle") return false;
  // Before the browse metadata lands, `sourceHasHomeProvider` reads `false`
  // because nothing has answered yet, not because the source has no home. The
  // section is on screen either way, so an unknown provider is still a loading
  // state — reporting it as "no home page" flashed that empty state over the
  // skeleton for the frames before the home request started.
  return sourceHasHomeProvider || !sourceHomeProviderKnown;
}

export function canSelectMobileSourceBrowseTab({
  selected,
}: {
  selected: boolean;
}): boolean {
  return !selected;
}

export function shouldShowMobileSourceBrowseLoadError({
  loading,
  hasSource,
  hasError,
}: {
  loading: boolean;
  hasSource: boolean;
  hasError: boolean;
}): boolean {
  return !loading && !hasSource && hasError;
}

/**
 * "No matches" is a claim about a search that ran and came back empty. An
 * `idle` state (the request was never started, or an in-flight attempt was
 * cancelled and never restarted) and a `loading` state are not that, and
 * labelling them "no matches" is how a failed source operation used to reach
 * the user as an empty result instead of an error with a retry.
 */
export function shouldShowMobileSourceBrowseNoMatches(
  searchStatus: "idle" | "loading" | "ready" | "blocked" | "error",
): boolean {
  return searchStatus === "ready";
}

export function shouldShowMobileSourceBrowseNotInstalled({
  loading,
  hasSource,
  hasError,
}: {
  loading: boolean;
  hasSource: boolean;
  hasError: boolean;
}): boolean {
  return !loading && !hasSource && !hasError;
}
