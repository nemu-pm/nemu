import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLibraryStore } from "@/stores/library";
import { useSourcesStore } from "@/stores/sources";
import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Book01Icon } from "@hugeicons/core-free-icons";

export function LibraryPage() {
  const { mangas, loading: libraryLoading } = useLibraryStore();
  const { installedSources, loading: sourcesLoading } = useSourcesStore();
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  const loading = libraryLoading || sourcesLoading;
  const hasNoSources = installedSources.length === 0;
  const hasNoMangas = mangas.length === 0;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <Spinner className="mx-auto mb-4 size-8" />
          <p className="text-muted-foreground">Loading library...</p>
        </div>
      </div>
    );
  }

  // Empty state: no sources installed
  if (hasNoSources) {
    return (
      <>
        <div className="flex h-[60vh] flex-col items-center justify-center">
          <div className="mb-6 rounded-full bg-muted p-6">
            <HugeiconsIcon icon={Book01Icon} className="size-12 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-semibold">No sources installed</h2>
          <p className="mb-6 max-w-sm text-center text-muted-foreground">
            Add a source to start discovering and reading manga
          </p>
          <Button onClick={() => setAddSourceOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} />
            Add Source
          </Button>
        </div>
        <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      </>
    );
  }

  // Empty state: no mangas in library
  if (hasNoMangas) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center">
        <div className="mb-6 rounded-full bg-muted p-6">
          <HugeiconsIcon icon={Book01Icon} className="size-12 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">Your library is empty</h2>
        <p className="mb-6 max-w-sm text-center text-muted-foreground">
          Search for manga and add them to your library
        </p>
        <Link to="/search" search={{ q: "" }}>
          <Button>Start Searching</Button>
        </Link>
      </div>
    );
  }

  // Library grid
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <span className="text-sm text-muted-foreground">
          {mangas.length} {mangas.length === 1 ? "manga" : "mangas"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {mangas.map((manga) => {
          const activeSource = manga.sources.find(
            (s) =>
              s.registryId === manga.activeRegistryId &&
              s.sourceId === manga.activeSourceId
          );
          return (
            <Link
              key={manga.id}
              to="/sources/$registryId/$sourceId/$mangaId"
              params={{
                registryId: manga.activeRegistryId,
                sourceId: manga.activeSourceId,
                mangaId: activeSource?.mangaId ?? "",
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
          );
        })}
      </div>
    </div>
  );
}
