/**
 * Aidoku-specific browse page implementation.
 * Supports: Home layouts, Listings, Search with filters
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SourceBrowseSearch } from "@/router";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { hasHomeBeenRefreshed, markHomeRefreshed } from "@/lib/sources/aidoku/adapter";
import type { BrowsableSource } from "@/lib/sources/aidoku/adapter";
import type { Manga, SearchResult } from "@/lib/sources/types";
import type { FilterValue, HomeLayout, Listing, Filter } from "@/lib/sources/aidoku/types";
import { MangaCardGallery } from "@/components/manga-card-gallery";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { HomeView, HomeSkeletonView } from "@/components/home-components";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { FilterDrawer, FilterHeaderBar } from "@/components/filters/aidoku";
import { BrowseSearchBar, BrowseListingTabs } from "@/components/browse";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Home11Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { SourceImageProvider } from "@/hooks/use-source-image";

export interface AidokuBrowseData {
  source: BrowsableSource;
  listings: Listing[];
  filters: Filter[];
  hasHomeProvider: boolean;
  onlySearch: boolean;
  initialHome: HomeLayout | null;
}

interface AidokuBrowseProps {
  data: AidokuBrowseData;
}

export function AidokuBrowse({ data }: AidokuBrowseProps) {
  const { t } = useTranslation();
  const { registryId, sourceId } = useParams({
    strict: false,
  }) as { registryId: string; sourceId: string };
  
  const { tab, q } = useSearch({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseSearch;
  const navigate = useNavigate();

  const {
    source,
    listings,
    filters,
    hasHomeProvider,
    onlySearch,
    initialHome,
  } = data;

  // Get source info from settings store
  const { useSettingsStore } = useStores();
  const sourceInfo = useSettingsStore((s) =>
    s.availableSources.find((src) => src.registryId === registryId && src.id === sourceId)
  );
  const sourceName = sourceInfo?.name ?? sourceId;
  const sourceIcon = sourceInfo?.icon;
  const hasListings = listings.length > 0;

  // URL-derived state
  const selectedListingIndex = tab ?? 0;
  const searchQuery = q ?? "";
  const searchActive = onlySearch || !!q;

  // URL state setters
  const setSearchQuery = useCallback((query: string) => {
    navigate({ 
      to: "/browse/$registryId/$sourceId",
      params: { registryId, sourceId },
      search: { tab, q: query || undefined },
      replace: true,
    });
  }, [navigate, registryId, sourceId, tab]);

  // Local UI state
  const [filterValues, setFilterValues] = useState<FilterValue[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Home state
  const [home, setHome] = useState<HomeLayout | null>(initialHome);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [listingRefreshKey, setListingRefreshKey] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterKey = useMemo(() => JSON.stringify(filterValues), [filterValues]);

  // Computed states
  const isHomeSelected = hasHomeProvider && selectedListingIndex === 0;
  const currentListing = hasHomeProvider
    ? listings[selectedListingIndex - 1]
    : listings[selectedListingIndex];

  const homeLoadedForSourceRef = useRef<string | null>(null);

  // Home loading effect
  useEffect(() => {
    if (!source || !isHomeSelected || searchActive) return;
    
    if (initialHome && homeLoadedForSourceRef.current !== source.sourceKey && !homeRefreshing) {
      homeLoadedForSourceRef.current = source.sourceKey;
      const isFirstVisit = !hasHomeBeenRefreshed(source.sourceKey);
      if (!isFirstVisit) return;
    }
    
    if (homeLoadedForSourceRef.current === source.sourceKey && !homeRefreshing) return;

    const currentSource = source;
    const abortController = new AbortController();

    async function loadHome() {
      const isFirstVisit = !hasHomeBeenRefreshed(currentSource.sourceKey);

      if (!initialHome) {
        setHomeLoading(true);
      }

      try {
        const forceRefresh = isFirstVisit || homeRefreshing;
        
        let result: HomeLayout | null;
        if (forceRefresh) {
          result = await currentSource.getHomeWithPartials((partialHome) => {
            if (!abortController.signal.aborted) {
              setHome(partialHome);
              setHomeLoading(false);
            }
          });
        } else {
          result = await currentSource.getHome(false);
        }
        
        if (abortController.signal.aborted) return;
        setHome(result);
        homeLoadedForSourceRef.current = currentSource.sourceKey;

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

  // Listing query
  const listingQuery = useInfiniteQuery({
    queryKey: ["listing", source?.sourceKey, currentListing?.id, listingRefreshKey],
    queryFn: async ({ pageParam }) => {
      if (!source || !currentListing) throw new Error("No source or listing");
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

  // Search query
  const searchQueryResult = useInfiniteQuery({
    queryKey: ["search", source?.sourceKey, searchQuery, filterKey],
    queryFn: async ({ pageParam }) => {
      if (!source) throw new Error("No source");
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

  // Derived state
  const activeQuery = searchActive ? searchQueryResult : listingQuery;
  const manga = useMemo(
    () => activeQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [activeQuery.data]
  );
  const hasMore = activeQuery.hasNextPage ?? false;
  const loadingMore = activeQuery.isFetching || activeQuery.isPending;

  const scrollKey = `${source?.sourceKey}:${searchActive ? 'search' : selectedListingIndex}`;
  useScrollRestoration(scrollKey, manga.length > 0);

  // Handlers
  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput, setSearchQuery]);

  const handleCancelSearch = useCallback(() => {
    if (onlySearch) return;
    setSearchQuery("");
    setSearchInput("");
    setFilterValues([]);
  }, [onlySearch, setSearchQuery]);

  const handleListingChange = useCallback((index: number) => {
    navigate({ 
      to: "/browse/$registryId/$sourceId",
      params: { registryId, sourceId },
      search: { tab: index === 0 ? undefined : index, q: undefined },
      replace: true,
    });
    setSearchInput("");
    setFilterValues([]);
  }, [navigate, registryId, sourceId]);

  const handleFilterChange = useCallback(
    (values: FilterValue[]) => {
      setFilterValues(values);
      if (values.length > 0 && !searchActive) {
        setSearchQuery(searchInput || " ");
      }
    },
    [searchInput, searchActive, setSearchQuery]
  );

  const handleLoadMore = useCallback(() => {
    if (activeQuery.isFetchingNextPage || !activeQuery.hasNextPage) return;
    activeQuery.fetchNextPage();
  }, [activeQuery]);

  const handleHomeListingClick = useCallback((listing: { id: string }) => {
    const index = listings.findIndex(l => l.id === listing.id);
    if (index !== -1) {
      handleListingChange(hasHomeProvider ? index + 1 : index);
    }
  }, [listings, hasHomeProvider, handleListingChange]);

  const handleEnterSearch = useCallback(() => {
    setSearchQuery(" ");
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [setSearchQuery]);

  const handleRefresh = useCallback(() => {
    if (isHomeSelected) {
      setHomeRefreshing(true);
    } else if (searchActive) {
      searchQueryResult.refetch();
    } else {
      setListingRefreshKey((k) => k + 1);
    }
  }, [isHomeSelected, searchActive, searchQueryResult]);

  const showHome = isHomeSelected && !searchActive;
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

        {/* Search bar */}
        {(searchActive || onlySearch) && (
          <BrowseSearchBar
            ref={searchInputRef}
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={handleSearch}
            onCancel={onlySearch ? undefined : handleCancelSearch}
            showCancel={!onlySearch}
            autoFocus={searchActive && !onlySearch}
          />
        )}

        {/* Filter Header Bar */}
        {(searchActive || onlySearch) && filters.length > 0 && (
          <FilterHeaderBar
            filters={filters}
            values={filterValues}
            onChange={handleFilterChange}
            onOpenFullFilters={() => setFilterOpen(true)}
          />
        )}

        {/* Listings Header */}
        {!onlySearch && !searchActive && (hasHomeProvider || hasListings) && (
          <BrowseListingTabs
            listings={listings}
            selectedIndex={selectedListingIndex}
            onSelect={handleListingChange}
            showHomeTab={hasHomeProvider}
          />
        )}

        {/* Content */}
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

        {/* Filter Dialog */}
        <FilterDrawer
          open={filterOpen}
          onOpenChange={setFilterOpen}
          filters={filters}
          values={filterValues}
          onApply={handleFilterChange}
        />
      </div>
    </SourceImageProvider>
  );
}

