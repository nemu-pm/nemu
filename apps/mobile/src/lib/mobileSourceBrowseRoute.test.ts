import { describe, expect, test } from "bun:test";
import {
  canSelectMobileSourceBrowseTab,
  canClearMobileSourceBrowseTextInput,
  getDefaultMobileSourceBrowseListingId,
  getMobileSourceBrowseListingIdForRouteTab,
  getMobileSourceBrowseListingTabCount,
  getMobileSourceBrowseRouteTabForListingId,
  hasMobileSourceBrowseRouteQuery,
  isMobileSourceBrowseHomeTabPending,
  makeMobileSourceHomeGenerationKey,
  normalizeMobileSourceBrowseRouteQuery,
  normalizeMobileSourceBrowseRouteTab,
  shouldRenderMobileSourceBrowseSearchHeader,
  shouldRunMobileSourceBrowseSearchSubmitFeedback,
  shouldShowCenterSourceBrowseSearchProgress,
  shouldShowMobileSourceBrowseListingTabBar,
  shouldShowMobileSourceBrowseLoadError,
  shouldShowMobileSourceBrowseNotInstalled,
  shouldShowSourceBrowseBootstrapping,
  shouldShowSourceBrowseHomeSkeleton,
  shouldFetchMobileSourceHome,
  shouldPreserveSourceBrowseSearchItemsOnDeactivate,
} from "./mobileSourceBrowseRoute";

const listings = [
  { id: "popular" },
  { id: "latest" },
  { id: "seasonal" },
];

describe("mobile source browse route helpers", () => {
  test("keys source-home work by stable package and explicit refresh generations", () => {
    const generation = makeMobileSourceHomeGenerationKey({
      sourceRuntimeKey: "registry:source",
      packageUri: "file:///source.aix",
      packageCacheKey: "aix:source",
      sourceVersion: 4,
      downloadUrl: "https://example.test/source.aix",
      settingsSignature: "2:123",
      runtimeRefreshKey: 0,
    });
    const sameGenerationAfterMetadataIdentityChange =
      makeMobileSourceHomeGenerationKey({
        sourceRuntimeKey: "registry:source",
        packageUri: "file:///source.aix",
        packageCacheKey: "aix:source",
        sourceVersion: 4,
        downloadUrl: "https://example.test/source.aix",
        settingsSignature: "2:123",
        runtimeRefreshKey: 0,
      });
    const refreshedGeneration = makeMobileSourceHomeGenerationKey({
      sourceRuntimeKey: "registry:source",
      packageUri: "file:///source.aix",
      packageCacheKey: "aix:source",
      sourceVersion: 4,
      downloadUrl: "https://example.test/source.aix",
      settingsSignature: "2:123",
      runtimeRefreshKey: 1,
    });
    const settingsGeneration = makeMobileSourceHomeGenerationKey({
      sourceRuntimeKey: "registry:source",
      packageUri: "file:///source.aix",
      packageCacheKey: "aix:source",
      sourceVersion: 4,
      downloadUrl: "https://example.test/source.aix",
      settingsSignature: "2:456",
      runtimeRefreshKey: 0,
    });

    expect(generation).toBe(sameGenerationAfterMetadataIdentityChange);
    expect(
      shouldFetchMobileSourceHome({
        completedGenerationKey: generation,
        nextGenerationKey: sameGenerationAfterMetadataIdentityChange,
      }),
    ).toBe(false);
    expect(
      shouldFetchMobileSourceHome({
        completedGenerationKey: generation,
        nextGenerationKey: refreshedGeneration,
      }),
    ).toBe(true);
    expect(
      shouldFetchMobileSourceHome({
        completedGenerationKey: generation,
        nextGenerationKey: settingsGeneration,
      }),
    ).toBe(true);
    expect(
      shouldFetchMobileSourceHome({
        completedGenerationKey: null,
        nextGenerationKey: null,
      }),
    ).toBe(false);
  });

  test("normalizes source search query params", () => {
    expect(normalizeMobileSourceBrowseRouteQuery(undefined)).toBe("");
    expect(normalizeMobileSourceBrowseRouteQuery("  seasonal  ")).toBe(
      "seasonal",
    );
    expect(normalizeMobileSourceBrowseRouteQuery([" featured ", "latest"])).toBe(
      "featured",
    );
  });

  test("detects route-backed source search mode before trimming", () => {
    expect(hasMobileSourceBrowseRouteQuery(undefined)).toBe(false);
    expect(hasMobileSourceBrowseRouteQuery("")).toBe(false);
    expect(hasMobileSourceBrowseRouteQuery(" ")).toBe(true);
    expect(hasMobileSourceBrowseRouteQuery([" ", "latest"])).toBe(true);
  });

  test("enables source browse text clearing only while input has content", () => {
    expect(canClearMobileSourceBrowseTextInput("")).toBe(false);
    expect(canClearMobileSourceBrowseTextInput(" ")).toBe(true);
    expect(canClearMobileSourceBrowseTextInput("one piece")).toBe(true);
  });

  test("matches source search submit feedback to actionable route changes", () => {
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "",
        routeQuery: "",
        routeSearchActive: false,
        activeFilterCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "   ",
        routeQuery: "",
        routeSearchActive: false,
        activeFilterCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "one piece",
        routeQuery: "one piece",
        routeSearchActive: true,
        activeFilterCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "  one piece  ",
        routeQuery: "one piece",
        routeSearchActive: true,
        activeFilterCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "",
        routeQuery: "",
        routeSearchActive: true,
        activeFilterCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "one punch",
        routeQuery: "one piece",
        routeSearchActive: true,
        activeFilterCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "one piece",
        routeQuery: "",
        routeSearchActive: false,
        activeFilterCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldRunMobileSourceBrowseSearchSubmitFeedback({
        query: "",
        routeQuery: "",
        routeSearchActive: false,
        activeFilterCount: 1,
      }),
    ).toBe(true);
  });

  test("normalizes source listing tab params", () => {
    expect(normalizeMobileSourceBrowseRouteTab(undefined)).toBeNull();
    expect(normalizeMobileSourceBrowseRouteTab("")).toBeNull();
    expect(normalizeMobileSourceBrowseRouteTab(" 2 ")).toBe(2);
    expect(normalizeMobileSourceBrowseRouteTab(["1", "2"])).toBe(1);
    expect(normalizeMobileSourceBrowseRouteTab("-1")).toBeNull();
    expect(normalizeMobileSourceBrowseRouteTab("1.5")).toBeNull();
    expect(normalizeMobileSourceBrowseRouteTab("latest")).toBeNull();
  });

  test("maps route tabs to listing ids without a home provider", () => {
    expect(
      getMobileSourceBrowseListingIdForRouteTab(0, listings, false),
    ).toBe("popular");
    expect(
      getMobileSourceBrowseListingIdForRouteTab(2, listings, false),
    ).toBe("seasonal");
    expect(
      getMobileSourceBrowseListingIdForRouteTab(3, listings, false),
    ).toBeNull();
  });

  test("maps route tabs to listing ids with a home provider offset", () => {
    expect(
      getMobileSourceBrowseListingIdForRouteTab(0, listings, true),
    ).toBeNull();
    expect(
      getMobileSourceBrowseListingIdForRouteTab(1, listings, true),
    ).toBe("popular");
    expect(
      getMobileSourceBrowseListingIdForRouteTab(3, listings, true),
    ).toBe("seasonal");
  });

  test("maps listing ids back to route tabs", () => {
    expect(
      getMobileSourceBrowseRouteTabForListingId("popular", listings, false),
    ).toBe(0);
    expect(
      getMobileSourceBrowseRouteTabForListingId("popular", listings, true),
    ).toBe(1);
    expect(
      getMobileSourceBrowseRouteTabForListingId("seasonal", listings, true),
    ).toBe(3);
    expect(
      getMobileSourceBrowseRouteTabForListingId("missing", listings, true),
    ).toBeNull();
  });

  test("defaults to home for sources with a home provider", () => {
    expect(getDefaultMobileSourceBrowseListingId(listings, true)).toBeNull();
    expect(getDefaultMobileSourceBrowseListingId(listings, false)).toBe(
      "popular",
    );
    expect(getDefaultMobileSourceBrowseListingId([], false)).toBeNull();
  });

  test("counts listing tabs and hides single-tab chrome", () => {
    expect(getMobileSourceBrowseListingTabCount(true, 2)).toBe(3);
    expect(getMobileSourceBrowseListingTabCount(false, 1)).toBe(1);
    expect(
      shouldShowMobileSourceBrowseListingTabBar({
        listingTabCount: 2,
        sourceHomeProviderKnown: true,
        onlySearch: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSourceBrowseListingTabBar({
        listingTabCount: 1,
        sourceHomeProviderKnown: true,
        onlySearch: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseListingTabBar({
        listingTabCount: 3,
        sourceHomeProviderKnown: false,
        onlySearch: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseListingTabBar({
        listingTabCount: 2,
        sourceHomeProviderKnown: true,
        onlySearch: true,
      }),
    ).toBe(false);
  });

  test("waits for home resolution before defaulting to a listing tab", () => {
    expect(
      isMobileSourceBrowseHomeTabPending({
        onlySearch: false,
        sourceHomeProviderKnown: false,
        metadataStatus: "idle",
        homeStatus: "idle",
      }),
    ).toBe(true);
    expect(
      isMobileSourceBrowseHomeTabPending({
        onlySearch: false,
        sourceHomeProviderKnown: false,
        metadataStatus: "loading",
        homeStatus: "idle",
      }),
    ).toBe(true);
    expect(
      isMobileSourceBrowseHomeTabPending({
        onlySearch: true,
        sourceHomeProviderKnown: false,
        metadataStatus: "idle",
        homeStatus: "idle",
      }),
    ).toBe(false);
    expect(
      isMobileSourceBrowseHomeTabPending({
        onlySearch: false,
        sourceHomeProviderKnown: true,
        metadataStatus: "ready",
        homeStatus: "ready",
      }),
    ).toBe(false);
  });

  test("renders search header chrome only when it has content", () => {
    expect(
      shouldRenderMobileSourceBrowseSearchHeader({
        showControls: false,
        filterCount: 0,
        filterCountKnown: false,
        filtersBlocked: false,
        filtersErrored: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSourceBrowseSearchHeader({
        showControls: true,
        filterCount: 0,
        filterCountKnown: false,
        filtersBlocked: false,
        filtersErrored: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSourceBrowseSearchHeader({
        showControls: false,
        filterCount: 0,
        filterCountKnown: true,
        filtersBlocked: false,
        filtersErrored: false,
      }),
    ).toBe(true);
  });

  test("uses a single centered progress state for source search loading", () => {
    expect(
      shouldShowCenterSourceBrowseSearchProgress({
        sourceSearchActive: true,
        listingItemCount: 0,
        searchStatus: "loading",
        filtersStatus: "ready",
      }),
    ).toBe(true);
    expect(
      shouldShowCenterSourceBrowseSearchProgress({
        sourceSearchActive: true,
        listingItemCount: 0,
        searchStatus: "idle",
        filtersStatus: "loading",
      }),
    ).toBe(true);
    expect(
      shouldShowCenterSourceBrowseSearchProgress({
        sourceSearchActive: true,
        listingItemCount: 3,
        searchStatus: "loading",
        filtersStatus: "loading",
      }),
    ).toBe(false);
  });

  test("bootstraps browse chrome while metadata or home is still resolving", () => {
    expect(
      shouldShowSourceBrowseBootstrapping({
        sourceSearchActive: false,
        showExecutableSourceSections: true,
        hasSource: true,
        metadataStatus: "loading",
        sourceHomeTabPending: false,
        showSourceHomeSection: false,
        homeStatus: "idle",
        sourceHomeHasComponents: false,
      }),
    ).toBe(true);
    expect(
      shouldShowSourceBrowseBootstrapping({
        sourceSearchActive: false,
        showExecutableSourceSections: true,
        hasSource: true,
        metadataStatus: "ready",
        sourceHomeTabPending: true,
        showSourceHomeSection: false,
        homeStatus: "idle",
        sourceHomeHasComponents: false,
      }),
    ).toBe(true);
    expect(
      shouldShowSourceBrowseBootstrapping({
        sourceSearchActive: true,
        showExecutableSourceSections: true,
        hasSource: true,
        metadataStatus: "loading",
        sourceHomeTabPending: true,
        showSourceHomeSection: false,
        homeStatus: "idle",
        sourceHomeHasComponents: false,
      }),
    ).toBe(false);
  });

  test("preserves search rows while transitioning back to home browse", () => {
    expect(
      shouldPreserveSourceBrowseSearchItemsOnDeactivate({
        sourceExpectsHomeTab: true,
      }),
    ).toBe(true);
    expect(
      shouldPreserveSourceBrowseSearchItemsOnDeactivate({
        sourceExpectsHomeTab: false,
      }),
    ).toBe(false);
  });

  test("shows home skeleton while home content is still resolving", () => {
    expect(
      shouldShowSourceBrowseHomeSkeleton({
        showSourceHomeSection: true,
        sourceHasHomeProvider: true,
        homeStatus: "idle",
        sourceHomeHasComponents: false,
      }),
    ).toBe(true);
    expect(
      shouldShowSourceBrowseHomeSkeleton({
        showSourceHomeSection: true,
        sourceHasHomeProvider: true,
        homeStatus: "ready",
        sourceHomeHasComponents: true,
      }),
    ).toBe(false);
  });

  test("gates the selected source browse tab as a no-op selection", () => {
    expect(canSelectMobileSourceBrowseTab({ selected: false })).toBe(true);
    expect(canSelectMobileSourceBrowseTab({ selected: true })).toBe(false);
  });

  test("keeps source browse load errors retryable before not-installed fallback", () => {
    expect(
      shouldShowMobileSourceBrowseLoadError({
        loading: false,
        hasSource: false,
        hasError: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSourceBrowseLoadError({
        loading: true,
        hasSource: false,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseLoadError({
        loading: false,
        hasSource: true,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseLoadError({
        loading: false,
        hasSource: false,
        hasError: false,
      }),
    ).toBe(false);

    expect(
      shouldShowMobileSourceBrowseNotInstalled({
        loading: false,
        hasSource: false,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileSourceBrowseNotInstalled({
        loading: false,
        hasSource: false,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseNotInstalled({
        loading: true,
        hasSource: false,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileSourceBrowseNotInstalled({
        loading: false,
        hasSource: true,
        hasError: false,
      }),
    ).toBe(false);
  });
});
