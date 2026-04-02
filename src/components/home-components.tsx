/**
 * Home layout components for source browse pages
 * Uses MangaCard variants for consistent design across all sections
 */
import { useState, useCallback, memo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  MangaCardCompact,
  MangaCardFeatured,
  MangaCardList,
  MangaCardChapter,
  MangaCardBanner,
} from "@/components/manga-card";
import type {
  HomeLayout,
  HomeComponent,
  HomeScroller,
  HomeBigScroller,
  HomeMangaList,
  HomeMangaChapterList,
  HomeImageScroller,
  HomeLink,
  Listing,
} from "@nemu.pm/aidoku-runtime";

// ============================================================================
// Constants
// ============================================================================

const COVER_HEIGHT = 180;
const COVER_WIDTH = COVER_HEIGHT * (2 / 3);

// ============================================================================
// Main HomeView
// ============================================================================

interface HomeViewProps {
  home: HomeLayout;
  registryId: string;
  sourceId: string;
  onListingClick?: (listing: Listing) => void;
}

export function HomeView({ home, registryId, sourceId, onListingClick }: HomeViewProps) {
  return (
    <div className="space-y-10 pb-8">
      {home.components.map((component, index) => (
        <HomeComponentView
          key={`${component.title ?? "component"}-${index}`}
          component={component}
          registryId={registryId}
          sourceId={sourceId}
          onListingClick={onListingClick}
        />
      ))}
    </div>
  );
}

interface HomeComponentViewProps {
  component: HomeComponent;
  registryId: string;
  sourceId: string;
  onListingClick?: (listing: Listing) => void;
}

const HomeComponentView = memo(function HomeComponentView({ component, registryId, sourceId, onListingClick }: HomeComponentViewProps) {
  const { value } = component;

  switch (value.type) {
    case "scroller":
      return (
        <ScrollerSection
          component={component}
          value={value}
          registryId={registryId}
          sourceId={sourceId}
          onListingClick={onListingClick}
        />
      );
    case "bigScroller":
      return (
        <BigScrollerSection
          component={component}
          value={value}
          registryId={registryId}
          sourceId={sourceId}
        />
      );
    case "mangaList":
      return (
        <MangaListSection
          component={component}
          value={value}
          registryId={registryId}
          sourceId={sourceId}
          onListingClick={onListingClick}
        />
      );
    case "mangaChapterList":
      return (
        <MangaChapterListSection
          component={component}
          value={value}
          registryId={registryId}
          sourceId={sourceId}
          onListingClick={onListingClick}
        />
      );
    case "imageScroller":
      return (
        <ImageScrollerSection
          component={component}
          value={value}
          registryId={registryId}
          sourceId={sourceId}
        />
      );
    case "filters":
    case "links":
      return component.title ? (
        <SectionHeader title={component.title} subtitle={component.subtitle} />
      ) : null;
    default:
      return null;
  }
})

// ============================================================================
// Section Header
// ============================================================================

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  listing?: Listing;
  onListingClick?: (listing: Listing) => void;
}

function SectionHeader({ title, subtitle, listing, onListingClick }: SectionHeaderProps) {
  const hasAction = listing && onListingClick;

  const content = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {hasAction && (
        <motion.div
          className="shrink-0"
          whileHover={{ x: 2 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-5 text-muted-foreground/60"
          />
        </motion.div>
      )}
    </div>
  );

  if (hasAction) {
    return (
      <button
        onClick={() => onListingClick(listing)}
        className="block w-full px-4 py-1 text-left transition-colors hover:bg-accent/30"
      >
        {content}
      </button>
    );
  }

  return <div className="px-4 py-1">{content}</div>;
}

// ============================================================================
// Scroller Section - Horizontal manga cards
// ============================================================================

interface ScrollerSectionProps {
  component: HomeComponent;
  value: HomeScroller;
  registryId: string;
  sourceId: string;
  onListingClick?: (listing: Listing) => void;
}

/** Ref callback that resets horizontal scroll to start (fixes browser scroll restoration) */
const resetScrollRef = (node: HTMLDivElement | null) => {
  if (node) node.scrollLeft = 0;
};

function ScrollerSection({ component, value, registryId, sourceId, onListingClick }: ScrollerSectionProps) {
  const isEmpty = value.entries.length === 0;

  return (
    <section className="space-y-4">
      {component.title && (
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          listing={value.listing}
          onListingClick={onListingClick}
        />
      )}

      <div key={isEmpty ? "empty" : "loaded"} ref={resetScrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [&>*:first-child]:ml-4 [&>*:last-child]:mr-4">
        {isEmpty
          ? Array.from({ length: 6 }).map((_, i) => (
              <ScrollerCardSkeleton key={i} />
            ))
          : value.entries.map((entry, index) => (
              <ScrollerCard
                key={entry.title + index}
                link={entry}
                registryId={registryId}
                sourceId={sourceId}
              />
            ))}
      </div>
    </section>
  );
}

interface ScrollerCardProps {
  link: HomeLink;
  registryId: string;
  sourceId: string;
}

function ScrollerCard({ link, registryId, sourceId }: ScrollerCardProps) {
  const manga = link.value?.type === "manga" ? link.value.manga : null;

  if (manga) {
    return (
      <MangaCardCompact
        to="/sources/$registryId/$sourceId/$mangaId"
        params={{ registryId, sourceId, mangaId: manga.id ?? manga.key }}
        cover={link.imageUrl}
        title={link.title}
        subtitle={link.subtitle}
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
      />
    );
  }

  // Fallback for non-manga links (URL links)
  return (
    <ExternalLinkCard
      link={link}
      width={COVER_WIDTH}
      height={COVER_HEIGHT}
    />
  );
}

function ScrollerCardSkeleton() {
  return (
    <div className="shrink-0" style={{ width: COVER_WIDTH }}>
      <Skeleton
        className="rounded-lg"
        style={{ width: COVER_WIDTH, height: COVER_HEIGHT }}
      />
      <div className="mt-2 space-y-1.5 px-0.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

// ============================================================================
// Big Scroller Section - Featured carousel
// ============================================================================

interface BigScrollerSectionProps {
  component: HomeComponent;
  value: HomeBigScroller;
  registryId: string;
  sourceId: string;
}

function BigScrollerSection({ component, value, registryId, sourceId }: BigScrollerSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const isEmpty = value.entries.length === 0;
  const currentManga = value.entries[currentIndex];

  return (
    <section className="space-y-4">
      {component.title && (
        <SectionHeader title={component.title} subtitle={component.subtitle} />
      )}

      <div className="px-4">
        {isEmpty ? (
          <BigScrollerSkeleton />
        ) : (
          <>
            <AnimatePresence mode="wait">
              {currentManga && (
                <motion.div
                  key={currentManga.key}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <MangaCardFeatured
                    to="/sources/$registryId/$sourceId/$mangaId"
                    params={{ registryId, sourceId, mangaId: currentManga.id ?? currentManga.key }}
                    cover={currentManga.cover}
                    title={currentManga.title ?? ""}
                    authors={currentManga.authors}
                    description={currentManga.description}
                    tags={currentManga.tags}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination dots */}
            {value.entries.length > 1 && (
              <div className="mt-5 flex justify-center gap-2">
                {value.entries.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentIndex(i)}
                    className={cn(
                      "h-2 rounded-full transition-all duration-200",
                      i === currentIndex
                        ? "w-5 bg-primary"
                        : "w-2 bg-muted-foreground/25 hover:bg-muted-foreground/40"
                    )}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function BigScrollerSkeleton() {
  return (
    <>
      <div className="flex gap-4 rounded-xl p-3">
        <Skeleton className="size-[110px] shrink-0 rounded-lg" style={{ height: 165 }} />
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="mt-auto flex gap-1.5 pt-2">
            <Skeleton className="h-5 w-14 rounded-md" />
            <Skeleton className="h-5 w-12 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
        </div>
      </div>
      <div className="mt-5 flex justify-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-2 rounded-full", i === 0 ? "w-5" : "w-2")}
          />
        ))}
      </div>
    </>
  );
}

// ============================================================================
// Manga List Section - Vertical list with rankings
// ============================================================================

interface MangaListSectionProps {
  component: HomeComponent;
  value: HomeMangaList;
  registryId: string;
  sourceId: string;
  onListingClick?: (listing: Listing) => void;
}

function MangaListSection({ component, value, registryId, sourceId, onListingClick }: MangaListSectionProps) {
  const displayedEntries = value.pageSize
    ? value.entries.slice(0, value.pageSize)
    : value.entries;
  const isEmpty = displayedEntries.length === 0;
  const skeletonCount = value.pageSize ?? 5;

  return (
    <section className="space-y-3">
      {component.title && (
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          listing={value.listing}
          onListingClick={onListingClick}
        />
      )}

      <div className="space-y-1 px-4">
        {isEmpty
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <MangaListItemSkeleton key={i} showRank={value.ranking} />
            ))
          : displayedEntries.map((entry, index) => (
              <MangaListItem
                key={entry.title + index}
                link={entry}
                registryId={registryId}
                sourceId={sourceId}
                rank={value.ranking ? index + 1 : undefined}
              />
            ))}
      </div>
    </section>
  );
}

interface MangaListItemProps {
  link: HomeLink;
  registryId: string;
  sourceId: string;
  rank?: number;
}

function MangaListItem({ link, registryId, sourceId, rank }: MangaListItemProps) {
  const manga = link.value?.type === "manga" ? link.value.manga : null;

  const handleClick = useCallback(() => {
    if (link.value?.type === "url") {
      window.open(link.value.url, "_blank");
    }
  }, [link]);

  if (manga) {
    return (
      <MangaCardList
        to="/sources/$registryId/$sourceId/$mangaId"
        params={{ registryId, sourceId, mangaId: manga.id ?? manga.key }}
        cover={link.imageUrl}
        title={link.title}
        subtitle={link.subtitle}
        tags={manga.tags}
        rank={rank}
      />
    );
  }

  // Fallback for URL links
  return (
    <button
      onClick={handleClick}
      className="flex w-full items-start gap-3 rounded-lg py-2 text-left transition-colors hover:bg-accent/40"
    >
      <div
        className="shrink-0 overflow-hidden rounded-lg bg-muted shadow-sm"
        style={{ width: 64, height: 96 }}
      >
        {link.imageUrl && (
          <img src={link.imageUrl} alt={link.title} className="size-full object-cover" />
        )}
      </div>
      {rank !== undefined && (
        <span className="min-w-[1.75rem] pt-1 text-lg font-bold tabular-nums text-muted-foreground/70">
          {rank}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <h4 className="line-clamp-2 text-sm font-medium">{link.title}</h4>
        {link.subtitle && (
          <p className="text-xs text-muted-foreground">{link.subtitle}</p>
        )}
      </div>
    </button>
  );
}

function MangaListItemSkeleton({ showRank }: { showRank?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-lg py-2">
      <Skeleton className="shrink-0 rounded-lg" style={{ width: 64, height: 96 }} />
      {showRank && <Skeleton className="h-6 w-6" />}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
        <div className="flex gap-1 pt-0.5">
          <Skeleton className="h-4 w-10 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Manga Chapter List Section - Recent updates
// ============================================================================

interface MangaChapterListSectionProps {
  component: HomeComponent;
  value: HomeMangaChapterList;
  registryId: string;
  sourceId: string;
  onListingClick?: (listing: Listing) => void;
}

function MangaChapterListSection({
  component,
  value,
  registryId,
  sourceId,
  onListingClick,
}: MangaChapterListSectionProps) {
  const displayedEntries = value.pageSize
    ? value.entries.slice(0, value.pageSize)
    : value.entries;
  const isEmpty = displayedEntries.length === 0;
  const skeletonCount = value.pageSize ?? 5;

  return (
    <section className="space-y-3">
      {component.title && (
        <SectionHeader
          title={component.title}
          subtitle={component.subtitle}
          listing={value.listing}
          onListingClick={onListingClick}
        />
      )}

      <div className="space-y-1 px-4">
        {isEmpty
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <MangaChapterItemSkeleton key={i} />
            ))
          : displayedEntries.map((entry, index) => (
              <MangaCardChapter
                key={entry.manga.key + entry.chapter.key + index}
                to="/sources/$registryId/$sourceId/$mangaId"
                params={{ registryId, sourceId, mangaId: entry.manga.id ?? entry.manga.key }}
                cover={entry.manga.cover}
                title={entry.manga.title ?? ""}
                chapterTitle={entry.chapter.title}
                chapterNumber={entry.chapter.chapterNumber}
                dateUploaded={entry.chapter.dateUploaded}
              />
            ))}
      </div>
    </section>
  );
}

function MangaChapterItemSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg py-2">
      <Skeleton className="shrink-0 rounded-lg" style={{ width: 64, height: 96 }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

// ============================================================================
// Image Scroller Section - Banner images
// ============================================================================

interface ImageScrollerSectionProps {
  component: HomeComponent;
  value: HomeImageScroller;
  registryId: string;
  sourceId: string;
}

function ImageScrollerSection({ component, value, registryId, sourceId }: ImageScrollerSectionProps) {
  const imageHeight = value.height ?? 160;
  const imageWidth = value.width ?? imageHeight * 1.75;
  const isEmpty = value.links.length === 0;

  return (
    <section className="space-y-4">
      {component.title && (
        <SectionHeader title={component.title} subtitle={component.subtitle} />
      )}

      <div key={isEmpty ? "empty" : "loaded"} ref={resetScrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [&>*:first-child]:ml-4 [&>*:last-child]:mr-4">
        {isEmpty
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                key={i}
                className="shrink-0 rounded-xl"
                style={{ width: imageWidth, height: imageHeight }}
              />
            ))
          : value.links.map((link, index) => (
              <ImageScrollerItem
                key={link.title + index}
                link={link}
                registryId={registryId}
                sourceId={sourceId}
                width={imageWidth}
                height={imageHeight}
              />
            ))}
      </div>
    </section>
  );
}

interface ImageScrollerItemProps {
  link: HomeLink;
  registryId: string;
  sourceId: string;
  width: number;
  height: number;
}

function ImageScrollerItem({ link, registryId, sourceId, width, height }: ImageScrollerItemProps) {
  const navigate = useNavigate();
  const manga = link.value?.type === "manga" ? link.value.manga : null;

  const handleClick = useCallback(() => {
    if (link.value?.type === "manga") {
      navigate({
        to: "/sources/$registryId/$sourceId/$mangaId",
        params: { registryId, sourceId, mangaId: manga!.id ?? manga!.key },
      });
    } else if (link.value?.type === "url") {
      window.open(link.value.url, "_blank");
    }
  }, [link, navigate, registryId, sourceId, manga]);

  if (manga) {
    return (
      <MangaCardBanner
        to="/sources/$registryId/$sourceId/$mangaId"
        params={{ registryId, sourceId, mangaId: manga.id ?? manga.key }}
        imageUrl={link.imageUrl}
        title={link.title}
        width={width}
        height={height}
      />
    );
  }

  return (
    <MangaCardBanner
      imageUrl={link.imageUrl}
      title={link.title}
      width={width}
      height={height}
      onClick={handleClick}
    />
  );
}

// ============================================================================
// External Link Card - For non-manga URL links
// ============================================================================

interface ExternalLinkCardProps {
  link: HomeLink;
  width: number;
  height: number;
}

function ExternalLinkCard({ link, width, height }: ExternalLinkCardProps) {
  const handleClick = useCallback(() => {
    if (link.value?.type === "url") {
      window.open(link.value.url, "_blank");
    }
  }, [link]);

  return (
    <button
      onClick={handleClick}
      className="group block shrink-0 text-left"
      style={{ width }}
    >
      <motion.div
        className="overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-black/5 dark:ring-white/10"
        style={{ height }}
        whileHover={{ y: -6, scale: 1.02 }}
        whileTap={{ y: -1, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {link.imageUrl && (
          <img
            src={link.imageUrl}
            alt={link.title}
            className="size-full object-cover"
          />
        )}
      </motion.div>
      <div className="mt-2 space-y-0.5 px-0.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-tight tracking-tight">
          {link.title}
        </p>
        {link.subtitle && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {link.subtitle}
          </p>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Loading Skeletons - Exported for use in parent components
// ============================================================================

export function ScrollerSectionSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="space-y-4">
      <div className="px-4 py-1">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex gap-4 overflow-hidden [&>*:first-child]:ml-4">
        {Array.from({ length: count }).map((_, i) => (
          <ScrollerCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function BigScrollerSectionSkeleton() {
  return (
    <section className="space-y-4">
      <div className="px-4 py-1">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="px-4">
        <BigScrollerSkeleton />
      </div>
    </section>
  );
}

export function MangaListSectionSkeleton({ count = 5, ranking = false }: { count?: number; ranking?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="px-4 py-1">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="space-y-1 px-4">
        {Array.from({ length: count }).map((_, i) => (
          <MangaListItemSkeleton key={i} showRank={ranking} />
        ))}
      </div>
    </section>
  );
}

export function MangaChapterListSectionSkeleton({ count = 5 }: { count?: number }) {
  return (
    <section className="space-y-3">
      <div className="px-4 py-1">
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="space-y-1 px-4">
        {Array.from({ length: count }).map((_, i) => (
          <MangaChapterItemSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function ImageScrollerSectionSkeleton({
  count = 4,
  width = 280,
  height = 160,
}: {
  count?: number;
  width?: number;
  height?: number;
}) {
  return (
    <section className="space-y-4">
      <div className="px-4 py-1">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex gap-4 overflow-hidden [&>*:first-child]:ml-4">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton
            key={i}
            className="shrink-0 rounded-xl"
            style={{ width, height }}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeSkeletonView() {
  return (
    <div className="space-y-10 pb-8">
      <ScrollerSectionSkeleton />
      <MangaListSectionSkeleton />
    </div>
  );
}
