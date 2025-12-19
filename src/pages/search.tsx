import { useCallback, useEffect, useState } from "react";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useStores } from "@/data/context";
import type { Manga } from "@/lib/sources";
import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
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
import { Search01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import { AddSourceDialog } from "@/components/add-source-dialog";

interface SourceResults {
  registryId: string;
  sourceId: string;
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

  // Sync URL query to local state
  useEffect(() => {
    setQuery(q);
  }, [q]);

  // Perform aggregated search when query changes
  useEffect(() => {
    if (!q.trim() || installedSources.length === 0) {
      setResults([]);
      return;
    }

    // Initialize results for each installed source
    const initial: SourceResults[] = installedSources.map((s) => {
      const info = availableSources.find(
        (a) => a.id === s.id && a.registryId === s.registryId
      );
      return {
        registryId: s.registryId,
        sourceId: s.id,
        sourceName: info?.name ?? s.id,
        items: [],
        loading: true,
        error: null,
      };
    });
    setResults(initial);

    // Search each source in parallel
    installedSources.forEach(async (installed) => {
      const key = `${installed.registryId}:${installed.id}`;
      try {
        const source = await getSource(installed.registryId, installed.id);
        if (!source) {
          setResults((prev) =>
            prev.map((r) =>
              `${r.registryId}:${r.sourceId}` === key
                ? { ...r, loading: false, error: "Source not found" }
                : r
            )
          );
          return;
        }

        const result = await source.search(q);
        setResults((prev) =>
          prev.map((r) =>
            `${r.registryId}:${r.sourceId}` === key
              ? { ...r, items: result.items, loading: false }
              : r
          )
        );
      } catch (e) {
        setResults((prev) =>
          prev.map((r) =>
            `${r.registryId}:${r.sourceId}` === key
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
  }, [q, installedSources, availableSources, getSource]);

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
        <Button type="submit" disabled={!query.trim()}>
          Search
        </Button>
      </form>

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

      {/* Searching */}
      {q.trim() && isSearching && totalResults === 0 && (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="text-center">
            <Spinner className="mx-auto mb-4 size-8" />
            <p className="text-muted-foreground">Searching for "{q}"...</p>
          </div>
        </div>
      )}

      {/* Results grouped by source */}
      {q.trim() && (totalResults > 0 || !isSearching) && (
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
              sourceId: result.sourceId,
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
