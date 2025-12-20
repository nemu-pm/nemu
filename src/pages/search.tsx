import { useCallback, useEffect, useState, useMemo } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useStores } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import type { Manga } from "@/lib/sources";
import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Add01Icon, FilterIcon } from "@hugeicons/core-free-icons";
import { AddSourceDialog } from "@/components/add-source-dialog";

const SELECTED_SOURCES_KEY = "search-selected-sources";

interface SourceResults {
  registryId: string;
  sourceId: string; // composite key for matching
  rawSourceId: string; // raw source ID for URL params
  sourceName: string;
  items: Manga[];
  loading: boolean;
  error: string | null;
}

export function SearchPage() {
  const { q } = useSearch({ strict: false }) as { q: string };
  const navigate = useNavigate();
  const { useSettingsStore } = useStores();
  const { installedSources, availableSources, getSource } = useSettingsStore();

  const [query, setQuery] = useState(q);
  const [results, setResults] = useState<SourceResults[]>([]);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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

  const toggleSource = (sourceId: string) => {
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
  };

  const selectAll = () => setSelectedSources(null);

  const isSourceSelected = (sourceId: string) =>
    selectedSources === null || selectedSources.has(sourceId);

  // Sync URL query to local state
  useEffect(() => {
    setQuery(q);
  }, [q]);

  // Perform aggregated search when query changes
  useEffect(() => {
    if (!q.trim() || filteredSources.length === 0) {
      setResults([]);
      return;
    }

    // Initialize results for each filtered source
    const initial: SourceResults[] = filteredSources.map((s) => {
      const { registryId, sourceId: rawSourceId } = parseSourceKey(s.id);
      const info = availableSources.find(
        (a) => a.id === rawSourceId && a.registryId === registryId
      );
      return {
        registryId: s.registryId,
        sourceId: s.id, // composite key
        rawSourceId,
        sourceName: info?.name ?? rawSourceId,
        items: [],
        loading: true,
        error: null,
      };
    });
    setResults(initial);

    // Search each source in parallel
    filteredSources.forEach(async (installed) => {
      const { sourceId: rawSourceId } = parseSourceKey(installed.id);
      const key = installed.id; // composite key
      try {
        const source = await getSource(installed.registryId, rawSourceId);
        if (!source) {
          setResults((prev) =>
            prev.map((r) =>
              r.sourceId === key
                ? { ...r, loading: false, error: "Source not found" }
                : r
            )
          );
          return;
        }

        const result = await source.search(q);
        setResults((prev) =>
          prev.map((r) =>
            r.sourceId === key
              ? { ...r, items: result.items, loading: false }
              : r
          )
        );
      } catch (e) {
        setResults((prev) =>
          prev.map((r) =>
            r.sourceId === key
              ? {
                  ...r,
                  loading: false,
                  error: e instanceof Error ? e.message : String(e),
                }
              : r
          )
        );
      }
    });
  }, [q, filteredSources, availableSources, getSource]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        navigate({ to: "/search", search: { q: query.trim() } });
      }
    },
    [query, navigate]
  );

  const totalResults = results.reduce((sum, r) => sum + r.items.length, 0);
  const isSearching = results.some((r) => r.loading);

  // No sources installed
  if (installedSources.length === 0) {
    return (
      <>
        <Empty className="h-[60vh]">
          <EmptyHeader>
            <EmptyMedia>
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-12 text-muted-foreground"
              />
            </EmptyMedia>
            <EmptyTitle>No sources installed</EmptyTitle>
            <EmptyDescription>
              Add a source to start searching for manga
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setAddSourceOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} />
            Add Source
          </Button>
        </Empty>
        <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search input */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Search across all sources..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters((v) => !v)}
          className="relative"
        >
          <HugeiconsIcon icon={FilterIcon} />
          {selectedSources !== null && (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {selectedSources.size}
            </span>
          )}
        </Button>
        <Button type="submit" disabled={!query.trim()}>
          Search
        </Button>
      </form>

      {/* Source filters */}
      {showFilters && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">Sources to search</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={selectedSources === null}
            >
              Select all
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {installedSources.map((source) => {
              const { registryId, sourceId: rawSourceId } = parseSourceKey(
                source.id
              );
              const info = availableSources.find(
                (a) => a.id === rawSourceId && a.registryId === registryId
              );
              const name = info?.name ?? rawSourceId;
              return (
                <label
                  key={source.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md p-2 hover:bg-muted"
                >
                  <Checkbox
                    checked={isSourceSelected(source.id)}
                    onCheckedChange={() => toggleSource(source.id)}
                  />
                  <span className="text-sm">{name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* No query */}
      {!q.trim() && (
        <Empty className="h-[50vh]">
          <EmptyHeader>
            <EmptyMedia>
              <HugeiconsIcon
                icon={Search01Icon}
                className="size-12 text-muted-foreground"
              />
            </EmptyMedia>
            <EmptyTitle>Search for manga</EmptyTitle>
            <EmptyDescription>
              Enter a search term to find manga across all installed sources
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* Results grouped by source */}
      {q.trim() && results.length > 0 && (
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
                <EmptyTitle>No results</EmptyTitle>
                <EmptyDescription>
                  No manga found for "{q}" in any source
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
    </div>
  );
}

function SourceResultSection({ result }: { result: SourceResults }) {
  if (result.loading) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">{result.sourceName}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Searching...
        </div>
      </section>
    );
  }

  if (result.error) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">{result.sourceName}</h2>
        <p className="text-sm text-destructive">Error: {result.error}</p>
      </section>
    );
  }

  if (result.items.length === 0) {
    return (
      <section>
        <h2 className="mb-4 text-lg font-semibold">{result.sourceName}</h2>
        <p className="text-sm text-muted-foreground">No results</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">
        {result.sourceName}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({result.items.length})
        </span>
      </h2>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {result.items.map((manga) => (
          <Link
            key={manga.id}
            to="/sources/$registryId/$sourceId/$mangaId"
            params={{
              registryId: result.registryId,
              sourceId: result.rawSourceId,
              mangaId: manga.id,
            }}
            className="group"
          >
            <div className="space-y-2">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                <CoverImage
                  src={manga.cover}
                  alt={manga.title}
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <p className="line-clamp-2 text-sm font-medium leading-tight">
                {manga.title}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
