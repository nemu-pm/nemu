import { useCallback, useMemo, useSyncExternalStore, forwardRef } from "react";
import { VirtuosoGrid, type GridComponents } from "react-virtuoso";
import { MangaCard } from "@/components/manga-card";
import { Spinner } from "@/components/ui/spinner";
import type { Manga } from "@/lib/sources/types";

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

// Responsive breakpoints matching Tailwind defaults
// cols: 3 (default) -> 4 (sm:640px) -> 5 (md:768px) -> 6 (lg:1024px)
function getColumnCount(width: number): number {
  if (width >= 1024) return 6;
  if (width >= 768) return 5;
  if (width >= 640) return 4;
  return 3;
}

function subscribeToResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

function getWindowWidth() {
  return window.innerWidth;
}

// Context type for passing dynamic styles to grid components
interface GridContext {
  listStyle: React.CSSProperties;
  itemStyle: React.CSSProperties;
}

// Define stable component references outside render
const gridComponents: GridComponents<GridContext> = {
  List: forwardRef(({ style, children, context, ...props }, ref) => (
    <div ref={ref} {...props} style={{ ...style, ...context?.listStyle }}>
      {children}
    </div>
  )),
  Item: ({ children, context, ...props }) => (
    <div {...props} style={context?.itemStyle}>
      {children}
    </div>
  ),
};

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
  // Track window width for responsive columns
  const windowWidth = useSyncExternalStore(subscribeToResize, getWindowWidth, () => 1024);
  const columns = getColumnCount(windowWidth);

  // Calculate item width percentage based on column count
  // Gap is 12px (gap-3) on mobile, 16px (gap-4) on sm+
  const gap = windowWidth >= 640 ? 16 : 12;
  const itemWidthPercent = 100 / columns;

  // Memoized context with dynamic styles
  const context = useMemo<GridContext>(
    () => ({
      listStyle: {
        display: "flex",
        flexWrap: "wrap" as const,
        gap: `${gap}px`,
      },
      itemStyle: {
        width: `calc(${itemWidthPercent}% - ${(gap * (columns - 1)) / columns}px)`,
      },
    }),
    [gap, itemWidthPercent, columns]
  );

  // Load more when reaching end
  const handleEndReached = useCallback(() => {
    if (hasMore && !loading && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);

  // Stable itemContent callback
  const itemContent = useCallback(
    (index: number, m: Manga) => (
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
    (index: number) => manga[index]?.id ?? index,
    [manga]
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
        context={context}
        endReached={handleEndReached}
        overscan={{ main: 400, reverse: 400 }}
        components={gridComponents}
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
