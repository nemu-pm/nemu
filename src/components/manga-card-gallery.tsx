import { useCallback } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { MangaCard } from "@/components/manga-card";
import { Spinner } from "@/components/ui/spinner";
import type { Manga } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

interface MangaCardGalleryProps {
  /** List of manga to display */
  manga: Manga[];
  /** Registry ID for constructing links */
  registryId: string;
  /** Source ID for constructing links */
  sourceId: string;
  /** Whether more items can be loaded */
  hasMore?: boolean;
  /** Whether currently loading more items */
  loading?: boolean;
  /** Callback to load more items */
  onLoadMore?: () => void;
  /** Empty state component */
  emptyState?: React.ReactNode;
  /** Class name for the grid container */
  className?: string;
}

const listClassName = cn(
  // Drive columns purely via CSS variables to avoid resize/scroll feedback loops.
  // VirtuosoGrid infers columns from measured itemWidth; keep that consistent with the DOM layout.
  "flex w-full flex-wrap box-border",
  "[--cols:3] sm:[--cols:4] md:[--cols:5] lg:[--cols:6]",
  "[--gap:12px] sm:[--gap:16px]",
  "gap-[var(--gap)]"
);

const itemClassName = cn(
  "shrink-0 box-border",
  "w-[calc((100%-(var(--gap)*(var(--cols)-1)))/var(--cols))]"
);

/**
 * A responsive grid gallery for displaying manga cards with infinite scroll support.
 * Uses virtualization for performance with large lists.
 */
export function MangaCardGallery({
  manga,
  registryId,
  sourceId,
  hasMore = false,
  loading = false,
  onLoadMore,
  emptyState,
  className,
}: MangaCardGalleryProps) {
  // Load more when reaching end
  const handleEndReached = useCallback(() => {
    if (hasMore && !loading && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);

  // Stable itemContent callback
  const itemContent = useCallback(
    (_index: number, m: Manga) => (
      <MangaCard
        to="/sources/$registryId/$sourceId/$mangaId"
        params={{
          registryId,
          sourceId,
          mangaId: m.id,
        }}
        cover={m.cover}
        title={m.title}
      />
    ),
    [registryId, sourceId]
  );

  // Stable key computation
  const computeItemKey = useCallback(
    (index: number, m: Manga) => m?.id ?? index,
    []
  );

  // Empty state
  if (manga.length === 0 && !loading) {
    return emptyState ?? null;
  }

  return (
    <div className={className}>
      <VirtuosoGrid
        useWindowScroll
        data={manga}
        endReached={handleEndReached}
        overscan={{ main: 400, reverse: 400 }}
        listClassName={listClassName}
        itemClassName={itemClassName}
        computeItemKey={computeItemKey}
        itemContent={itemContent}
      />

      {loading && (
        <div className="flex justify-center py-8">
          <Spinner className="size-6" />
        </div>
      )}
    </div>
  );
}
