import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useLoaderData, useSearch, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SourceBrowseSearch } from "@/router";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { hasHomeBeenRefreshed, markHomeRefreshed } from "@/lib/sources/aidoku/adapter";
import type { Manga, SearchResult } from "@/lib/sources/types";
import type { FilterValue, HomeLayout } from "@/lib/sources/aidoku/types";
import { MangaCardGallery } from "@/components/manga-card-gallery";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { HomeView, HomeSkeletonView } from "@/components/home-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { FilterDrawer, FilterHeaderBar } from "@/components/filter-drawer";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Home11Icon, Cancel01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import type { SourceBrowseLoaderData } from "@/router";
import { SourceImageProvider } from "@/hooks/use-source-image";

/**
 * Swift-aligned browse modes:
 * - Case 1: providesHome=true, hasListings=true → "home" mode with listings header
 * - Case 2: providesHome=false, hasListings=true → first listing, no home button
 * - Case 3: onlySearch=true (no home, no listings) → search UI directly
 */

export function SourceBrowsePage() {
  const { t } = useTranslation();
  const { registryId, sourceId } = useParams({
    strict: false,
  }) as { registryId: string; sourceId: string };
  
  // URL search params (persisted across navigation for scroll restoration)
  const { tab, q } = useSearch({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseSearch;
  const navigate = useNavigate();

  // Get cached loader data (source, listings, filters, capabilities, initial home)
  const {
    source,
    listings,
    filters,
    hasHomeProvider,
    onlySearch,
    initialHome,
  } = useLoaderData({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseLoaderData;

  // Get source info (name, icon) from settings store - works on direct page load
  const { useSettingsStore } = useStores();
  const sourceInfo = useSettingsStore((s) =>
    s.availableSources.find((src) => src.registryId === registryId && src.id === sourceId)
  );
  const sourceName = sourceInfo?.name ?? sourceId;
  const sourceIcon = sourceInfo?.icon;
  const hasListings = listings.length > 0;

  // URL-derived state (with defaults)
  const selectedListingIndex = tab ?? 0;
  const searchQuery = q ?? "";
  const searchActive = onlySearch || !!q;

  // URL state setters (update URL search params)
  const setSearchQuery = useCallback((query: string) => {
    navigate({ 
      to: "/browse/$registryId/$sourceId",
      params: { registryId, sourceId },
      search: { tab, q: query || undefined },
      replace: true,
    });
  }, [navigate, registryId, sourceId, tab]);

  // Local UI state (not persisted)
  const [filterValues, setFilterValues] = useState<FilterValue[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  
  // Sync searchInput when URL changes (e.g., browser back)
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);
  

  // Home state - initialize with loader data for instant render (critical for scroll restoration)
  const [home, setHome] = useState<HomeLayout | null>(initialHome);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeRefreshing, setHomeRefreshing] = useState(false);

  // Listing refresh trigger (increment to force re-fetch)
  const [listingRefreshKey, setListingRefreshKey] = useState(0);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Stable key for filterValues (for query key)
  const filterKey = useMemo(() => JSON.stringify(filterValues), [filterValues]);

  // Computed: is home tab selected?
  const isHomeSelected = hasHomeProvider && selectedListingIndex === 0;
  // Computed: current listing (accounting for home offset)
  const currentListing = hasHomeProvider
    ? listings[selectedListingIndex - 1]
    : listings[selectedListingIndex];

  // Ref to track which source we've loaded home for (prevents re-loading on state changes)
  const homeLoadedForSourceRef = useRef<string | null>(null);

  // Load/refresh home when home tab is selected
  // On first visit this session, auto-refresh to get fresh data
  useEffect(() => {
    if (!source || !isHomeSelected || searchActive) return;
    
    // If we have initialHome from loader, mark as loaded and check for refresh
    if (initialHome && homeLoadedForSourceRef.current !== source.sourceKey && !homeRefreshing) {
      homeLoadedForSourceRef.current = source.sourceKey;
      // Check if we should refresh in background (first visit this session)
      const isFirstVisit = !hasHomeBeenRefreshed(source.sourceKey);
      if (!isFirstVisit) return; // Don't refresh, we have cached data
    }
    
    // Skip if already loaded for this source (unless manually refreshing)
    if (homeLoadedForSourceRef.current === source.sourceKey && !homeRefreshing) return;

    const currentSource = source;
    const abortController = new AbortController();

    async function loadHome() {
      // Check if this is first visit this session
      const isFirstVisit = !hasHomeBeenRefreshed(currentSource.sourceKey);

      // Only show loading if we don't have initial data
      if (!initialHome) {
        setHomeLoading(true);
      }

      try {
        // Force refresh on first visit or when homeRefreshing is true
        const forceRefresh = isFirstVisit || homeRefreshing;
        
        let result: HomeLayout | null;
        if (forceRefresh) {
          // Use progressive loading for fresh fetches (Swift partialHomePublisher pattern)
          // onPartial callback updates UI as each section loads
          result = await currentSource.getHomeWithPartials((partialHome) => {
            if (!abortController.signal.aborted) {
              setHome(partialHome);
              setHomeLoading(false); // Hide loading as soon as first partial arrives
            }
          });
        } else {
          // Use cached data for instant load
          result = await currentSource.getHome(false);
        }
        
        if (abortController.signal.aborted) return;
        setHome(result);
        // Mark that we've loaded home for this source (prevents re-loading on state changes)
        homeLoadedForSourceRef.current = currentSource.sourceKey;

        // Mark as refreshed for this session
        if (forceRefresh) {
          markHomeRefreshed(currentSource.sourceKey);
        }
      } catch (e) {
        if (!abortController.signal.aborted) {
          console.error("Failed to load home:", e);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setHomeLoading(false);
          setHomeRefreshing(false);
        }
      }
    }

    loadHome();
    return () => {
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, isHomeSelected, searchActive, homeRefreshing]);

  // TanStack Query for listing results (cached across navigation for scroll restoration)
  const listingQuery = useInfiniteQuery({
    queryKey: ["listing", source?.sourceKey, currentListing?.id, listingRefreshKey],
    queryFn: async ({ pageParam }) => {
      if (!source || !currentListing) throw new Error("No source or listing");
      // pageParam is either page number (1) or the loadMore function from previous page
      if (typeof pageParam === "function") {
        return pageParam();
      }
      return source.getMangaForListing(currentListing, pageParam as number);
    },
    initialPageParam: 1 as number | (() => Promise<SearchResult<Manga>>),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.loadMore : undefined,
    enabled: !!source && !!currentListing && !isHomeSelected && !searchActive,
    staleTime: 5 * 60 * 1000,
  });

  // TanStack Query for search results (cached across navigation for scroll restoration)
  const searchQueryResult = useInfiniteQuery({
    queryKey: ["search", source?.sourceKey, searchQuery, filterKey],
    queryFn: async ({ pageParam }) => {
      if (!source) throw new Error("No source");
      // pageParam is either page number (1) or the loadMore function from previous page
      if (typeof pageParam === "function") {
        return pageParam();
      }
      return source.searchWithFilters(searchQuery || null, pageParam as number, filterValues);
    },
    initialPageParam: 1 as number | (() => Promise<SearchResult<Manga>>),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.loadMore : undefined,
    enabled: !!source && searchActive,
    staleTime: 5 * 60 * 1000,
  });

  // Derived state from queries
  const activeQuery = searchActive ? searchQueryResult : listingQuery;
  const manga = useMemo(
    () => activeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activeQuery.data]
  );
  const hasMore = activeQuery.hasNextPage ?? false;
  // Show loading when fetching OR when query is pending (initial load)
  const loadingMore = activeQuery.isFetching || activeQuery.isPending;

  // Scroll restoration for virtualized content
  const scrollKey = `${source?.sourceKey}:${searchActive ? 'search' : selectedListingIndex}`;
  useScrollRestoration(scrollKey, manga.length > 0);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearchQuery(searchInput); // Setting q activates search mode automatically
    },
    [searchInput, setSearchQuery]
  );

  const handleCancelSearch = useCallback(() => {
    if (onlySearch) return; // Can't cancel in onlySearch mode
    setSearchQuery(""); // Clearing q deactivates search mode automatically
    setSearchInput("");
    setFilterValues([]);
  }, [onlySearch, setSearchQuery]);

  const handleListingChange = useCallback((index: number) => {
    // Single navigate to update both tab and clear search
    navigate({ 
      to: "/browse/$registryId/$sourceId",
      params: { registryId, sourceId },
      search: { tab: index === 0 ? undefined : index, q: undefined },
      replace: true,
    });
    setSearchInput("");
    setFilterValues([]);
  }, [navigate, registryId, sourceId]);

  // Handle filter changes
  const handleFilterChange = useCallback(
    (values: FilterValue[]) => {
      setFilterValues(values);
      // If filters are applied, activate search mode with current input
      if (values.length > 0 && !searchActive) {
        setSearchQuery(searchInput || " "); // Use space to activate search mode if no query
      }
    },
    [searchInput, searchActive, setSearchQuery]
  );

  const handleApplyFilters = useCallback(
    (values: FilterValue[]) => {
      handleFilterChange(values);
    },
    [handleFilterChange]
  );

  const handleLoadMore = useCallback(() => {
    if (activeQuery.isFetchingNextPage || !activeQuery.hasNextPage) return;
    activeQuery.fetchNextPage();
  }, [activeQuery]);

  // Handle clicking a listing from home components
  const handleHomeListingClick = useCallback((listing: { id: string }) => {
    const index = listings.findIndex(l => l.id === listing.id);
    if (index !== -1) {
      // Account for home offset
      handleListingChange(hasHomeProvider ? index + 1 : index);
    }
  }, [listings, hasHomeProvider, handleListingChange]);

  // Enter search mode (set empty query to activate search UI)
  const handleEnterSearch = useCallback(() => {
    setSearchQuery(" "); // Use space to activate search mode
    // Focus input after state update
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [setSearchQuery]);

  // Refresh current view (home, listing, or search)
  const handleRefresh = useCallback(() => {
    if (isHomeSelected) {
      setHomeRefreshing(true);
    } else if (searchActive) {
      searchQueryResult.refetch();
    } else {
      setListingRefreshKey((k) => k + 1);
    }
  }, [isHomeSelected, searchActive, searchQueryResult]);

  // Determine what to show in content area
  const showHome = isHomeSelected && !searchActive;
  // Note: showListing would be !showHome && !searchActive && currentListing
  // but we just use else case for listing/results in the JSX

  const sourceKey = `${registryId}:${sourceId}`;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
    <div className="space-y-4">
      <PageHeader
        title={sourceName}
        icon={sourceIcon}
        actions={
          !searchActive && !onlySearch
            ? [
                {
                  label: t("browse.refresh"),
                  icon: <HugeiconsIcon icon={Refresh01Icon} className="size-4" />,
                  onClick: handleRefresh,
                },
                {
                  label: t("browse.search"),
                  icon: <HugeiconsIcon icon={Search01Icon} className="size-4" />,
                  onClick: handleEnterSearch,
                },
              ]
            : undefined
        }
      />

      {/* Search bar - show when search is active OR onlySearch mode */}
      {(searchActive || onlySearch) && (
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder={t("browse.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
              autoFocus={searchActive && !onlySearch}
            />
          </div>
          {!onlySearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCancelSearch}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </Button>
          )}
        </form>
      )}

      {/* Filter Header Bar - show in search mode */}
      {(searchActive || onlySearch) && filters.length > 0 && (
        <FilterHeaderBar
          filters={filters}
          values={filterValues}
          onChange={handleFilterChange}
          onOpenFullFilters={() => setFilterOpen(true)}
        />
      )}

      {/* Listings Header - only show when NOT in onlySearch mode and NOT searching */}
      {!onlySearch && !searchActive && (hasHomeProvider || hasListings) && (
        <div className="flex flex-wrap gap-2">
          {/* Home button (only if source provides home) */}
          {hasHomeProvider && (
            <Button
              variant={isHomeSelected ? "default" : "outline"}
              size="sm"
              onClick={() => handleListingChange(0)}
            >
              <HugeiconsIcon icon={Home11Icon} className="mr-1.5 size-4" />
              {t("browse.home")}
            </Button>
          )}
          {/* Listing buttons */}
          {listings.map((listing, index) => {
            const buttonIndex = hasHomeProvider ? index + 1 : index;
            const isSelected = selectedListingIndex === buttonIndex;
            return (
              <Button
                key={listing.id}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => handleListingChange(buttonIndex)}
              >
                {listing.name}
              </Button>
            );
          })}
        </div>
      )}

      {/* Content based on state */}
      {showHome ? (
        homeLoading ? (
          <HomeSkeletonView />
        ) : home ? (
          <HomeView
            home={home}
            registryId={registryId}
            sourceId={sourceId}
            onListingClick={handleHomeListingClick}
          />
        ) : (
          <PageEmpty
            icon={Home11Icon}
            title={t("browse.noHomeContent")}
            variant="inline"
          />
        )
      ) : (
        <MangaCardGallery
          manga={manga}
          registryId={registryId}
          sourceId={sourceId}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={handleLoadMore}
          emptyState={
            <PageEmpty
              icon={Search01Icon}
              title={loadingMore ? t("browse.loading") : t("browse.noResults")}
              variant="inline"
            />
          }
        />
      )}

      {/* Full Filter Dialog */}
      <FilterDrawer
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={filters}
        values={filterValues}
        onApply={handleApplyFilters}
      />
    </div>
    </SourceImageProvider>
  );
}
