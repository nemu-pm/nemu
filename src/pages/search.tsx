import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import type { Manga } from "@/lib/sources";
import { MangaCard } from "@/components/manga-card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import { NoSourcesEmpty } from "@/components/no-sources-empty";
import { PageEmpty } from "@/components/page-empty";
import { PageHeader } from "@/components/page-header";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { SourceImageProvider } from "@/hooks/use-source-image";

const SELECTED_SOURCES_KEY = "search-selected-sources";

interface SourceResults {
  registryId: string;
  sourceId: string; // composite key for matching
  rawSourceId: string; // raw source ID for URL params
  sourceName: string;
  sourceIcon?: string;
  items: Manga[];
  loading: boolean;
  error: string | null;
}

interface SourceDisplayInfo {
  id: string; // composite key
  rawId: string;
  registryId: string;
  name: string;
  icon?: string;
}

export function SearchPage() {
  const { t } = useTranslation();
  const { q } = useSearch({ strict: false }) as { q: string };
  const navigate = useNavigate();
  const { useSettingsStore } = useStores();
  const { installedSources, availableSources, getSource } = useSettingsStore();

  const [query, setQuery] = useState(q ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Selected sources from localStorage (null = all selected)
  const [selectedSources, setSelectedSources] = useState<Set<string> | null>(
    () => {
      try {
        const stored = localStorage.getItem(SELECTED_SOURCES_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as string[];
          return new Set(parsed);
        }
      } catch {
        // ignore
      }
      return null; // null means all selected
    }
  );

  // Build display info for all installed sources
  const sourceDisplayInfo = useMemo<SourceDisplayInfo[]>(() => {
    return installedSources.map((source) => {
      const { registryId, sourceId: rawSourceId } = parseSourceKey(source.id);
      const info = availableSources.find(
        (a) => a.id === rawSourceId && a.registryId === registryId
      );
      return {
        id: source.id,
        rawId: rawSourceId,
        registryId,
        name: info?.name ?? rawSourceId,
        icon: info?.icon,
      };
    });
  }, [installedSources, availableSources]);

  // Save to localStorage when selection changes
  useEffect(() => {
    if (selectedSources === null) {
      localStorage.removeItem(SELECTED_SOURCES_KEY);
    } else {
      localStorage.setItem(
        SELECTED_SOURCES_KEY,
        JSON.stringify([...selectedSources])
      );
    }
  }, [selectedSources]);

  // Filter installed sources by selection
  const filteredSources = useMemo(() => {
    if (selectedSources === null) return installedSources;
    return installedSources.filter((s) => selectedSources.has(s.id));
  }, [installedSources, selectedSources]);

  const toggleSource = useCallback(
    (sourceId: string) => {
      setSelectedSources((prev) => {
        if (prev === null) {
          // First toggle: select all except this one
          const allIds = new Set(installedSources.map((s) => s.id));
          allIds.delete(sourceId);
          return allIds;
        }
        const next = new Set(prev);
        if (next.has(sourceId)) {
          next.delete(sourceId);
        } else {
          next.add(sourceId);
        }
        // If all selected, reset to null
        if (next.size === installedSources.length) {
          return null;
        }
        return next;
      });
    },
    [installedSources]
  );

  // Select only this source (for double-click)
  const selectOnlySource = useCallback((sourceId: string) => {
    setSelectedSources(new Set([sourceId]));
  }, []);

  // Toggle all: if all selected, deselect all; otherwise select all
  const toggleAll = useCallback(() => {
    setSelectedSources((prev) => (prev === null ? new Set() : null));
  }, []);

  const isAllSelected = selectedSources === null;

  const isSourceSelected = useCallback(
    (sourceId: string) => selectedSources === null || selectedSources.has(sourceId),
    [selectedSources]
  );

  // Sync URL query to local state
  useEffect(() => {
    setQuery(q ?? "");
  }, [q]);

  // Search all sources in parallel with TanStack Query (cached!)
  const searchQueries = useQueries({
    queries: filteredSources.map((installed) => {
      const { registryId, sourceId: rawSourceId } = parseSourceKey(installed.id);
      const info = availableSources.find(
        (a) => a.id === rawSourceId && a.registryId === registryId
      );
      return {
        queryKey: ["search", installed.id, q] as const,
        queryFn: async () => {
          if (!q?.trim()) return { items: [] as Manga[] };
          const source = await getSource(installed.registryId, rawSourceId);
          if (!source) throw new Error(t("search.sourceNotFound"));
          return source.search(q);
        },
        enabled: !!q?.trim(),
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        meta: {
          registryId: installed.registryId,
          sourceId: installed.id,
          rawSourceId,
          sourceName: info?.name ?? rawSourceId,
          sourceIcon: info?.icon,
        },
      };
    }),
  });

  // Transform query results into SourceResults format
  const results = useMemo<SourceResults[]>(() => {
    return searchQueries.map((query, index) => {
      const meta = filteredSources[index];
      const { registryId, sourceId: rawSourceId } = parseSourceKey(meta.id);
      const info = availableSources.find(
        (a) => a.id === rawSourceId && a.registryId === registryId
      );
      return {
        registryId: meta.registryId,
        sourceId: meta.id,
        rawSourceId,
        sourceName: info?.name ?? rawSourceId,
        sourceIcon: info?.icon,
        items: query.data?.items ?? [],
        loading: query.isLoading,
        error: query.error ? (query.error as Error).message : null,
      };
    });
  }, [searchQueries, filteredSources, availableSources]);


  // Execute search - navigate to update URL
  const executeSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed && trimmed !== q) {
      navigate({ to: "/search", search: { q: trimmed } });
    }
  }, [query, q, navigate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeSearch();
        inputRef.current?.blur();
      }
    },
    [executeSearch]
  );

  const handleBlur = useCallback(() => {
    executeSearch();
  }, [executeSearch]);

  const totalResults = results.reduce((sum, r) => sum + r.items.length, 0);
  const isSearching = results.some((r) => r.loading);

  // Count of selected sources (for badge)
  const selectedCount = selectedSources?.size ?? installedSources.length;
  const showBadge = selectedSources !== null && selectedCount < installedSources.length;

  // No sources installed
  if (installedSources.length === 0) {
    return (
      <NoSourcesEmpty
        icon={Search01Icon}
        titleKey="search.noSources"
        descriptionKey="search.noSourcesDescription"
        buttonKey="search.addSource"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.search")} />
      {/* Search input */}
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          type="search"
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="pl-10"
        />
      </div>

      {/* Inline source filter bar */}
      <SourceFilterBar
        sources={sourceDisplayInfo}
        isAllSelected={isAllSelected}
        isSourceSelected={isSourceSelected}
        onToggleAll={toggleAll}
        onToggleSource={toggleSource}
        onSelectOnly={selectOnlySource}
        showBadge={showBadge}
        selectedCount={selectedCount}
        totalCount={installedSources.length}
      />

      {/* No sources selected */}
      {filteredSources.length === 0 && (
        <PageEmpty
          icon={Globe02Icon}
          title={t("search.noSourcesSelected")}
          description={t("search.noSourcesSelectedDescription")}
          variant="inline"
        />
      )}

      {/* No query */}
      {filteredSources.length > 0 && !q?.trim() && (
        <PageEmpty
          icon={Search01Icon}
          title={t("search.searchForManga")}
          description={t("search.enterSearchTerm")}
          variant="inline"
        />
      )}

      {/* Results grouped by source */}
      {q?.trim() && results.length > 0 && (
        <div className="space-y-8">
          {results.map((sourceResult) => (
            <SourceResultSection
              key={`${sourceResult.registryId}:${sourceResult.sourceId}`}
              result={sourceResult}
            />
          ))}

          {/* No results from any source */}
          {!isSearching && totalResults === 0 && (
            <Empty className="h-[40vh]">
              <EmptyHeader>
                <EmptyMedia>
                  <HugeiconsIcon
                    icon={Search01Icon}
                    className="size-12 text-muted-foreground"
                  />
                </EmptyMedia>
                <EmptyTitle>{t("search.noResults")}</EmptyTitle>
                <EmptyDescription>
                  {t("search.noResultsForQuery", { query: q })}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Source Filter Bar
// ============================================================================

interface SourceFilterBarProps {
  sources: SourceDisplayInfo[];
  isAllSelected: boolean;
  isSourceSelected: (id: string) => boolean;
  onToggleAll: () => void;
  onToggleSource: (id: string) => void;
  onSelectOnly: (id: string) => void;
  showBadge: boolean;
  selectedCount: number;
  totalCount: number;
}

function SourceFilterBar({
  sources,
  isAllSelected,
  isSourceSelected,
  onToggleAll,
  onToggleSource,
  onSelectOnly,
}: SourceFilterBarProps) {
  const { t } = useTranslation();
  // Double-click timer for "select only" behavior
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const handleSourceClick = useCallback(
    (id: string) => {
      const now = Date.now();
      const last = lastClickRef.current;

      // Check for double-click (within 300ms on same source)
      if (last && last.id === id && now - last.time < 300) {
        onSelectOnly(id);
        lastClickRef.current = null;
      } else {
        onToggleSource(id);
        lastClickRef.current = { id, time: now };
      }
    },
    [onToggleSource, onSelectOnly]
  );

  return (
    <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-1 sm:-mx-6 sm:px-6">
      {/* "All" pill - toggles between all selected and none selected */}
      <button
        onClick={onToggleAll}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
          isAllSelected
            ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
            : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        title={isAllSelected ? t("search.deselectAll") : t("search.selectAll")}
      >
        {t("search.all")}
      </button>

      {/* Divider */}
      <div className="mx-1 h-6 w-px shrink-0 self-center bg-border/50" />

      {/* Source pills */}
      {sources.map((source) => {
        const selected = isSourceSelected(source.id);
        return (
          <button
            key={source.id}
            onClick={() => handleSourceClick(source.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all",
              selected
                ? "border-primary/50 bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={t("search.toggleHint")}
          >
            {/* Source icon */}
            {source.icon ? (
              <img
                src={source.icon}
                alt=""
                className="size-4 shrink-0 rounded-sm object-cover"
              />
            ) : (
              <HugeiconsIcon
                icon={Globe02Icon}
                className="size-4 shrink-0 opacity-60"
              />
            )}
            <span className="max-w-24 truncate">{source.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Source Result Section
// ============================================================================

function SourceResultSection({ result }: { result: SourceResults }) {
  const { t } = useTranslation();
  if (result.loading) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          {result.sourceIcon ? (
            <img
              src={result.sourceIcon}
              alt=""
              className="size-5 rounded-sm object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={Globe02Icon}
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-lg font-semibold">{result.sourceName}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t("search.searching")}
        </div>
      </section>
    );
  }

  if (result.error) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          {result.sourceIcon ? (
            <img
              src={result.sourceIcon}
              alt=""
              className="size-5 rounded-sm object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={Globe02Icon}
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-lg font-semibold">{result.sourceName}</h2>
        </div>
        <p className="text-sm text-destructive">{t("search.error")}: {result.error}</p>
      </section>
    );
  }

  if (result.items.length === 0) {
    return (
      <section>
        <div className="mb-4 flex items-center gap-2">
          {result.sourceIcon ? (
            <img
              src={result.sourceIcon}
              alt=""
              className="size-5 rounded-sm object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={Globe02Icon}
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-lg font-semibold">{result.sourceName}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("search.noResults")}</p>
      </section>
    );
  }

  const sourceKey = `${result.registryId}:${result.rawSourceId}`;
  
  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <section>
        <div className="mb-4 flex items-center gap-2">
          {result.sourceIcon ? (
            <img
              src={result.sourceIcon}
              alt=""
              className="size-5 rounded-sm object-cover"
            />
          ) : (
            <HugeiconsIcon
              icon={Globe02Icon}
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-lg font-semibold">
            {result.sourceName}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({result.items.length})
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
          {result.items.map((manga) => (
            <MangaCard
              key={manga.id}
              to="/sources/$registryId/$sourceId/$mangaId"
              params={{
                registryId: result.registryId,
                sourceId: result.rawSourceId,
                mangaId: manga.id,
              }}
              cover={manga.cover}
              title={manga.title}
            />
          ))}
        </div>
      </section>
    </SourceImageProvider>
  );
}

