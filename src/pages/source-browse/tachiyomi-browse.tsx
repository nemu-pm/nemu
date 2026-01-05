/**
 * Tachiyomi-specific browse page implementation.
 * Supports: Listings (Popular/Latest), Search with filters
 * NO home layouts (Tachiyomi extensions don't have this concept)
 */
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { SourceBrowseSearch } from "@/router";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import type { TachiyomiBrowsableSource } from "@/lib/sources/tachiyomi/adapter";
import type { FilterState } from "@nemu.pm/tachiyomi-runtime";
import type { GenericListing } from "@/components/browse";
import type { Manga, SearchResult } from "@/lib/sources/types";
import { MangaCardGallery } from "@/components/manga-card-gallery";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { TachiyomiFilterDrawer, TachiyomiFilterHeaderBar } from "@/components/filters/tachiyomi";
import { BrowseSearchBar, BrowseListingTabs } from "@/components/browse";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { SourceImageProvider } from "@/hooks/use-source-image";
import { handleSourceError } from "@/lib/sources/error-handler";

export interface TachiyomiBrowseData {
  source: TachiyomiBrowsableSource;
  listings: GenericListing[];
  filters: FilterState[];
}

interface TachiyomiBrowseProps {
  data: TachiyomiBrowseData;
}

export function TachiyomiBrowse({ data }: TachiyomiBrowseProps) {
  const { t } = useTranslation();
  const { registryId, sourceId } = useParams({
    strict: false,
  }) as { registryId: string; sourceId: string };
  
  const { tab, q } = useSearch({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseSearch;
  const navigate = useNavigate();

  const { source, listings, filters: initialFilters } = data;

  // Get source info from settings store
  const { useSettingsStore } = useStores();
  const sourceInfo = useSettingsStore((s) =>
    s.availableSources.find((src) => src.registryId === registryId && src.id === sourceId)
  );
  const sourceName = sourceInfo?.name ?? source.name ?? sourceId;
  const sourceIcon = sourceInfo?.icon ?? source.icon;

  // URL-derived state
  const selectedListingIndex = tab ?? 0;
  const searchQuery = q ?? "";
  const searchActive = !!q;

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
  const [filters, setFilters] = useState<FilterState[]>(initialFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [listingRefreshKey, setListingRefreshKey] = useState(0);
  
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Build filter key for query cache invalidation
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  // Current listing
  const currentListing = listings[selectedListingIndex];

  // Listing query
  const listingQuery = useInfiniteQuery({
    queryKey: ["tachi-listing", source.sourceKey, currentListing?.id, listingRefreshKey],
    queryFn: async ({ pageParam }) => {
      if (!currentListing) throw new Error("No listing");
      if (typeof pageParam === "function") {
        return pageParam();
      }
      return source.getMangaForListing(currentListing, pageParam as number);
    },
    initialPageParam: 1 as number | (() => Promise<SearchResult<Manga>>),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.loadMore : undefined,
    enabled: !!currentListing && !searchActive,
    staleTime: 5 * 60 * 1000,
  });

  // Search query
  const searchQueryResult = useInfiniteQuery({
    queryKey: ["tachi-search", source.sourceKey, searchQuery, filterKey],
    queryFn: async ({ pageParam }) => {
      if (typeof pageParam === "function") {
        return pageParam();
      }
      return source.searchWithFilters(searchQuery || null, pageParam as number, filters);
    },
    initialPageParam: 1 as number | (() => Promise<SearchResult<Manga>>),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.loadMore : undefined,
    enabled: searchActive,
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

  const scrollKey = `${source.sourceKey}:${searchActive ? 'search' : selectedListingIndex}`;
  useScrollRestoration(scrollKey, manga.length > 0);

  // Handle query errors
  useEffect(() => {
    if (activeQuery.error) {
      handleSourceError(activeQuery.error, searchActive ? "Search" : "Listing");
    }
  }, [activeQuery.error, searchActive]);

  // Handlers
  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput);
  }, [searchInput, setSearchQuery]);

  const handleCancelSearch = useCallback(() => {
    setSearchQuery("");
    setSearchInput("");
    // Reset filters to initial state
    setFilters(initialFilters);
  }, [setSearchQuery, initialFilters]);

  const handleListingChange = useCallback((index: number) => {
    navigate({ 
      to: "/browse/$registryId/$sourceId",
      params: { registryId, sourceId },
      search: { tab: index === 0 ? undefined : index, q: undefined },
      replace: true,
    });
    setSearchInput("");
    setFilters(initialFilters);
  }, [navigate, registryId, sourceId, initialFilters]);

  const handleFilterChange = useCallback((newFilters: FilterState[]) => {
    setFilters(newFilters);
    // If filters changed and not already in search mode, enter search mode
    if (!searchActive) {
      setSearchQuery(searchInput || " ");
    }
  }, [searchActive, searchInput, setSearchQuery]);

  const handleFilterReset = useCallback(async () => {
    // Reset to initial filters from source
    await source.resetFilters();
    const freshFilters = await source.getFilters();
    setFilters(freshFilters);
  }, [source]);

  const handleLoadMore = useCallback(() => {
    if (activeQuery.isFetchingNextPage || !activeQuery.hasNextPage) return;
    activeQuery.fetchNextPage();
  }, [activeQuery]);

  const handleEnterSearch = useCallback(() => {
    setSearchQuery(" ");
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [setSearchQuery]);

  const handleRefresh = useCallback(() => {
    if (searchActive) {
      searchQueryResult.refetch();
    } else {
      setListingRefreshKey((k) => k + 1);
    }
  }, [searchActive, searchQueryResult]);

  const sourceKey = `${registryId}:${sourceId}`;

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <div className="space-y-4">
        <PageHeader
          title={sourceName}
          icon={sourceIcon}
          actions={
            !searchActive
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
        {searchActive && (
          <BrowseSearchBar
            ref={searchInputRef}
            value={searchInput}
            onChange={setSearchInput}
            onSubmit={handleSearch}
            onCancel={handleCancelSearch}
            showCancel={true}
            autoFocus={true}
          />
        )}

        {/* Filter Header Bar */}
        {searchActive && filters.length > 0 && (
          <TachiyomiFilterHeaderBar
            filters={filters}
            onChange={handleFilterChange}
            onOpenFullFilters={() => setFilterOpen(true)}
          />
        )}

        {/* Listings Header - always show when not searching */}
        {!searchActive && listings.length > 0 && (
          <BrowseListingTabs
            listings={listings}
            selectedIndex={selectedListingIndex}
            onSelect={handleListingChange}
            showHomeTab={false}
          />
        )}

        {/* Content */}
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

        {/* Filter Dialog */}
        <TachiyomiFilterDrawer
          open={filterOpen}
          onOpenChange={setFilterOpen}
          filters={filters}
          onApply={handleFilterChange}
          onReset={handleFilterReset}
        />
      </div>
    </SourceImageProvider>
  );
}

