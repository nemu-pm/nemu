/**
 * Source Add Drawer
 *
 * Flow:
 * 1. Mode selection (Search Sources / Merge from Library)
 * 2. Smart Match to get title pool from MU/AL/MAL
 * 3. Search all installed sources with best query per source language
 * 4. Show results grouped by source with pagination
 * 5. User selects manga to link
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useStores, useAllMangaProgress } from "@/data/context";
import { parseSourceKey } from "@/data/keys";
import { makeMangaProgressId, type LocalMangaProgress } from "@/data/schema";
import { languageStore } from "@/stores/language";
import {
  ResponsiveDialog,
  ResponsiveDialogNested,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CoverImage } from "@/components/cover-image";
import { SourceImageProvider } from "@/hooks/use-source-image";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  LayersIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  useSmartMatchStore,
  searchAllProviders,
  searchProviders,
  findExactMatches,
  type Provider,
} from "@/lib/metadata";
import {
  buildTitlePool,
  getSearchQueryForSource,
  getBestSimilarityScore,
  type TitlePool,
} from "@/lib/sources/title-pool";
import {
  sortSourcesByLanguagePriority,
  getPrimaryLanguage,
} from "@/lib/sources/language-priority";
import type { Manga } from "@/lib/sources/types";
import {
  type LibraryEntry,
  entryHasAnyUpdate,
  getEntryMostRecentSource,
} from "@/data/view";

// =============================================================================
// Types
// =============================================================================

interface SourceAddDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: LibraryEntry;
  onSourceAdded?: () => void;
  /** Use nested dialog variant (when opened from another dialog) */
  nested?: boolean;
}

type ViewMode = "select" | "matching" | "search" | "merge" | "merge-confirm";

/** Manga with similarity score for sorting */
interface ScoredManga extends Manga {
  /** Similarity score to title pool (0.0 to 1.0) */
  similarityScore: number;
}

interface SourceSearchResult {
  registryId: string;
  sourceId: string;
  sourceName: string;
  sourceIcon?: string;
  sourceLanguages?: string[];
  items: ScoredManga[];
  loading: boolean;
  error: string | null;
  /** Best similarity score among all items (for source sorting) */
  bestSimilarity: number;
}

// =============================================================================
// Helpers
// =============================================================================

/** Build progress map from manga progress index for a library entry */
function buildProgressMapForEntry(
  entry: LibraryEntry,
  progressIndex: Map<string, LocalMangaProgress>
): Map<string, LocalMangaProgress> {
  const progress = new Map<string, LocalMangaProgress>();
  for (const source of entry.sources) {
    const key = makeMangaProgressId(source.registryId, source.sourceId, source.sourceMangaId);
    const p = progressIndex.get(key);
    if (p) {
      progress.set(source.id, p);
    }
  }
  return progress;
}

// =============================================================================
// Mode Selection Component
// =============================================================================

function ModeSelection({
  onSelectMode,
  t,
}: {
  onSelectMode: (mode: "search" | "merge") => void;
  t: (key: string) => string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        onClick={() => onSelectMode("search")}
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:bg-muted"
      >
        <div className="rounded-full bg-primary/10 p-3">
          <HugeiconsIcon icon={Search01Icon} className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-medium">{t("sources.searchInSources")}</p>
          <p className="text-sm text-muted-foreground">
            {t("sources.searchInSourcesDesc")}
          </p>
        </div>
      </button>

      <button
        onClick={() => onSelectMode("merge")}
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:bg-muted"
      >
        <div className="rounded-full bg-primary/10 p-3">
          <HugeiconsIcon icon={LayersIcon} className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-medium">{t("sources.mergeFromLibrary")}</p>
          <p className="text-sm text-muted-foreground">{t("sources.mergeFromLibraryDesc")}</p>
        </div>
      </button>
    </div>
  );
}

// =============================================================================
// Manga Result Card (matches SourceItem style from add-source-dialog)
// =============================================================================

interface MangaResultCardProps {
  manga: Manga;
  isAdded: boolean;
  isAdding: boolean;
  onAdd: () => void;
  t: (key: string) => string;
  /** Disable button without showing spinner (another manga from source is being added) */
  disabled?: boolean;
}

function MangaResultCard({ manga, isAdded, isAdding, onAdd, t, disabled }: MangaResultCardProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        isAdded && "bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        <CoverImage
          src={manga.cover}
          alt={manga.title}
          className="h-14 w-auto aspect-[2/3] rounded-md object-cover shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium line-clamp-1">{manga.title}</p>
          {manga.authors && manga.authors.length > 0 && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {manga.authors.join(", ")}
            </p>
          )}
        </div>
      </div>

      {isAdded ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-green-500" />
          {t("sources.added")}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onAdd}
          disabled={isAdding || disabled}
          className="shrink-0"
        >
          {isAdding ? <Spinner className="size-4" /> : t("common.add")}
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Source Section with Pagination
// =============================================================================

interface SourceSectionProps {
  result: SourceSearchResult;
  addedMangaIds: Set<string>;
  /** The specific manga key being added (for spinner) */
  addingKey: string | null;
  /** Whether any manga from this source is being added (disable all buttons) */
  isSourceAdding: boolean;
  onAdd: (manga: Manga) => void;
  t: (key: string) => string;
}

const ITEMS_PER_PAGE = 3;

function SourceSection({ result, addedMangaIds, addingKey, isSourceAdding, onAdd, t }: SourceSectionProps) {
  const [page, setPage] = useState(0);
  const sourceKey = `${result.registryId}:${result.sourceId}`;

  // Reset page when items change
  useEffect(() => {
    setPage(0);
  }, [result.items]);

  if (result.loading) {
    return (
      <div className="space-y-2">
        <SourceSectionHeader result={result} />
        <div className="py-6 flex justify-center">
          <Spinner className="size-5" />
        </div>
      </div>
    );
  }

  if (result.items.length === 0) {
    return null; // Don't show sources with no results
  }

  // Check if any manga from this source is added - if so, collapse to show only the added one
  const addedManga = result.items.find((m) =>
    addedMangaIds.has(`${sourceKey}:${m.id}`)
  );

  // When source has an added manga, collapse to show only that manga
  if (addedManga) {
    const mangaKey = `${sourceKey}:${addedManga.id}`;
    return (
      <div className="space-y-2">
        <SourceSectionHeader result={result} />
        <SourceImageProvider sourceKey={sourceKey}>
          <MangaResultCard
            manga={addedManga}
            isAdded={true}
            isAdding={addingKey === mangaKey}
            onAdd={() => {}}
            t={t}
          />
        </SourceImageProvider>
      </div>
    );
  }

  const totalPages = Math.ceil(result.items.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const visibleItems = result.items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SourceSectionHeader result={result} />
        
        {/* Pagination arrows */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </Button>
          </div>
        )}
      </div>
      
      <SourceImageProvider sourceKey={sourceKey}>
        <div className="space-y-1">
          {visibleItems.map((manga) => {
            const mangaKey = `${sourceKey}:${manga.id}`;
            const isThisMangaAdding = addingKey === mangaKey;
            return (
              <MangaResultCard
                key={manga.id}
                manga={manga}
                isAdded={addedMangaIds.has(mangaKey)}
                // Show spinner for the specific manga, but disable ALL buttons when any is adding
                isAdding={isThisMangaAdding}
                onAdd={() => onAdd(manga)}
                t={t}
                disabled={isSourceAdding && !isThisMangaAdding}
              />
            );
          })}
        </div>
      </SourceImageProvider>
    </div>
  );
}

// =============================================================================
// Source Section Header
// =============================================================================

function SourceSectionHeader({ result }: { result: SourceSearchResult }) {
  return (
    <div className="flex items-center gap-2">
      {result.sourceIcon && (
        <img src={result.sourceIcon} alt="" className="size-5 rounded" />
      )}
      <h3 className="font-medium text-sm">{result.sourceName}</h3>
    </div>
  );
}

// =============================================================================
// Source Results List
// =============================================================================

interface SourceResultsListProps {
  results: SourceSearchResult[];
  addedMangaIds: Set<string>;
  addingKey: string | null;
  onAdd: (registryId: string, sourceId: string, manga: Manga) => void;
  t: (key: string) => string;
}

function SourceResultsList({
  results,
  addedMangaIds,
  addingKey,
  onAdd,
  t,
}: SourceResultsListProps) {
  // Extract source key from addingKey (format: "registryId:sourceId:mangaId")
  const addingSourceKey = addingKey
    ? addingKey.split(":").slice(0, 2).join(":")
    : null;

  // Filter to sources with results or still loading
  const activeSources = results.filter((r) => r.loading || r.items.length > 0);
  const loadingSources = results.filter((r) => r.loading);
  const sourcesWithResults = results.filter((r) => !r.loading && r.items.length > 0);

  if (loadingSources.length > 0 && sourcesWithResults.length === 0) {
    return (
      <div className="py-8 text-center">
        <Spinner className="size-8 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t("sources.searchingSources")}</p>
      </div>
    );
  }

  if (activeSources.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>{t("sources.noSourceResults")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeSources.map((result) => {
        const sourceKey = `${result.registryId}:${result.sourceId}`;
        const isSourceAdding = sourceKey === addingSourceKey;

        return (
          <SourceSection
            key={sourceKey}
            result={result}
            addedMangaIds={addedMangaIds}
            addingKey={addingKey}
            isSourceAdding={isSourceAdding}
            onAdd={(manga) => onAdd(result.registryId, result.sourceId, manga)}
            t={t}
          />
        );
      })}
    </div>
  );
}

// =============================================================================
// Library Merge Picker
// =============================================================================

interface LibraryMergePickerProps {
  currentEntry: LibraryEntry;
  libraryEntries: LibraryEntry[];
  progressIndex: Map<string, LocalMangaProgress>;
  onSelect: (entry: LibraryEntry) => void;
  t: (key: string) => string;
}

function LibraryMergePicker({
  currentEntry,
  libraryEntries,
  progressIndex,
  onSelect,
  t,
}: LibraryMergePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter out current entry and sort: matching titles first, then by library order
  const sortedEntries = useMemo(() => {
    const currentTitle = currentEntry.item.metadata.title.toLowerCase();
    const filtered = libraryEntries.filter(
      (e) => e.item.libraryItemId !== currentEntry.item.libraryItemId
    );

    // Calculate similarity scores and library sort data
    const withScores = filtered.map((entry) => {
      const entryTitle = entry.item.metadata.title.toLowerCase();
      // Simple similarity: check if titles share significant words
      const currentWords = new Set(currentTitle.split(/\s+/).filter((w) => w.length > 2));
      const entryWords = entryTitle.split(/\s+/).filter((w) => w.length > 2);
      const matchingWords = entryWords.filter((w) => currentWords.has(w)).length;
      const similarity = matchingWords / Math.max(currentWords.size, 1);
      
      // Check if entry has updates (same logic as library.tsx)
      const hasUpdate = entryHasAnyUpdate(entry);
      
      // Get most recent activity time (same logic as library.tsx)
      const progress = buildProgressMapForEntry(entry, progressIndex);
      const recentSource = getEntryMostRecentSource(entry, progress);
      const readTime = recentSource ? (progress.get(recentSource.id)?.lastReadAt ?? 0) : 0;
      const activityTime = Math.max(readTime, entry.item.createdAt);
      
      return { entry, similarity, hasUpdate, activityTime };
    });

    // Sort: matching titles first, then by library order (updated first, then by activity)
    return withScores.sort((a, b) => {
      // 1. Matching titles first
      if (a.similarity > 0.3 && b.similarity <= 0.3) return -1;
      if (b.similarity > 0.3 && a.similarity <= 0.3) return 1;
      
      // 2. Within same group, sort by library order
      // Updated entries first
      if (a.hasUpdate !== b.hasUpdate) return a.hasUpdate ? -1 : 1;
      
      // Then by most recent activity
      return b.activityTime - a.activityTime;
    });
  }, [libraryEntries, currentEntry, progressIndex]);

  // Filter by search query
  const displayEntries = useMemo(() => {
    if (!searchQuery.trim()) return sortedEntries;
    const query = searchQuery.toLowerCase();
    return sortedEntries.filter(({ entry }) =>
      entry.item.metadata.title.toLowerCase().includes(query)
    );
  }, [sortedEntries, searchQuery]);

  // Split into matching and others
  const matchingEntries = displayEntries.filter(({ similarity }) => similarity > 0.3);
  const otherEntries = displayEntries.filter(({ similarity }) => similarity <= 0.3);

  if (sortedEntries.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <p>{t("sources.merge.emptyLibrary")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Search input */}
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("sources.merge.searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 mt-4 space-y-4">
        {matchingEntries.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("sources.merge.matchingTitles")}
            </h3>
            {matchingEntries.map(({ entry }) => (
              <LibraryMergeCard
                key={entry.item.libraryItemId}
                entry={entry}
                onSelect={() => onSelect(entry)}
              />
            ))}
          </div>
        )}

        {otherEntries.length > 0 && (
          <div className="space-y-2">
            {matchingEntries.length > 0 && (
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("sources.merge.otherManga")}
              </h3>
            )}
            {otherEntries.map(({ entry }) => (
              <LibraryMergeCard
                key={entry.item.libraryItemId}
                entry={entry}
                onSelect={() => onSelect(entry)}
              />
            ))}
          </div>
        )}

        {displayEntries.length === 0 && searchQuery && (
          <div className="py-8 text-center text-muted-foreground">
            <p>{t("metadata.noResults")}</p>
          </div>
        )}
      </div>
    </>
  );
}

// =============================================================================
// Library Merge Card
// =============================================================================

interface LibraryMergeCardProps {
  entry: LibraryEntry;
  onSelect: () => void;
}

function LibraryMergeCard({ entry, onSelect }: LibraryMergeCardProps) {
  const { t } = useTranslation();
  const cover =
    entry.item.overrides?.coverUrl ??
    entry.item.overrides?.metadata?.cover ??
    entry.item.metadata.cover;
  const title =
    entry.item.overrides?.metadata?.title ?? entry.item.metadata.title;
  const sourceCount = entry.sources.length;

  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-3 w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted"
    >
      {cover ? (
        <img
          src={cover}
          alt={title}
          className="h-14 w-auto aspect-[2/3] rounded-md object-cover shrink-0"
        />
      ) : (
        <div className="h-14 aspect-[2/3] rounded-md bg-muted shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium line-clamp-1">{title}</p>
        <p className="text-sm text-muted-foreground">
          {t("sources.merge.sourcesCount", { count: sourceCount })}
        </p>
      </div>
    </button>
  );
}

// =============================================================================
// Merge Confirmation
// =============================================================================

interface MergeConfirmationProps {
  targetEntry: LibraryEntry;
  sourceEntry: LibraryEntry;
  onConfirm: () => void;
  onCancel: () => void;
  isMerging: boolean;
}

function MergeConfirmation({
  targetEntry,
  sourceEntry,
  onConfirm,
  onCancel,
  isMerging,
}: MergeConfirmationProps) {
  const { t } = useTranslation();
  const targetTitle =
    targetEntry.item.overrides?.metadata?.title ?? targetEntry.item.metadata.title;
  const targetCover =
    targetEntry.item.overrides?.coverUrl ??
    targetEntry.item.overrides?.metadata?.cover ??
    targetEntry.item.metadata.cover;
  const sourceTitle =
    sourceEntry.item.overrides?.metadata?.title ?? sourceEntry.item.metadata.title;
  const sourceCover =
    sourceEntry.item.overrides?.coverUrl ??
    sourceEntry.item.overrides?.metadata?.cover ??
    sourceEntry.item.metadata.cover;

  return (
    <div className="space-y-4">
      {/* Target manga (keeping) */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
        {targetCover ? (
          <img
            src={targetCover}
            alt={targetTitle}
            className="h-16 w-auto aspect-[2/3] rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-16 aspect-[2/3] rounded-md bg-muted shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("common.current")}
          </p>
          <p className="font-medium line-clamp-1">{targetTitle}</p>
          <p className="text-sm text-muted-foreground">
            {t("sources.merge.sourcesCount", { count: targetEntry.sources.length })}
          </p>
        </div>
      </div>

      {/* Arrow/plus indicator */}
      <div className="flex justify-center">
        <div className="flex items-center justify-center size-8 rounded-full bg-primary/10 text-primary">
          +
        </div>
      </div>

      {/* Source manga (merging from) */}
      <div className="flex items-center gap-3 p-3 rounded-lg border">
        {sourceCover ? (
          <img
            src={sourceCover}
            alt={sourceTitle}
            className="h-16 w-auto aspect-[2/3] rounded-md object-cover shrink-0"
          />
        ) : (
          <div className="h-16 aspect-[2/3] rounded-md bg-muted shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("sources.mergeFromLibrary")}
          </p>
          <p className="font-medium line-clamp-1">{sourceTitle}</p>
          <p className="text-sm text-muted-foreground">
            {t("sources.merge.sourcesCount", { count: sourceEntry.sources.length })}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">{t("sources.merge.mergeInfo")}</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>{t("sources.merge.mergeInfoAddSources", { source: sourceTitle })}</li>
          <li>{t("sources.merge.mergeInfoRemove", { source: sourceTitle })}</li>
          <li>{t("sources.merge.mergeInfoKeepMetadata")}</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isMerging} className="flex-1">
          {t("common.cancel")}
        </Button>
        <Button onClick={onConfirm} disabled={isMerging} className="flex-1">
          {isMerging ? (
            <>
              <Spinner className="size-4 mr-2" />
              {t("sources.merge.merging")}
            </>
          ) : (
            t("sources.merge.title")
          )}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function SourceAddDrawer({
  open,
  onOpenChange,
  entry,
  onSourceAdded,
  nested = false,
}: SourceAddDrawerProps) {
  const { t } = useTranslation();
  const { useSettingsStore, useLibraryStore } = useStores();
  const { installedSources, availableSources, getSource } = useSettingsStore();
  const { addSource, entries: libraryEntries, mergeManga } = useLibraryStore();
  const progressIndex = useAllMangaProgress();
  const appLanguage = languageStore?.((s) => s.language) ?? "en";

  // AI action for fallback
  const findJapaneseTitle = useAction(api.ai_metadata.findJapaneseTitle);

  // Store actions
  const storeReset = useSmartMatchStore((s) => s.reset);
  const storeSetPhase = useSmartMatchStore((s) => s.setPhase);
  const storeSetLastSearchQuery = useSmartMatchStore((s) => s.setLastSearchQuery);
  const phaseMessage = useSmartMatchStore((s) => s.phaseMessage);

  // Local state - search mode
  const [viewMode, setViewMode] = useState<ViewMode>("select");
  const [sourceResults, setSourceResults] = useState<SourceSearchResult[]>([]);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedMangaIds, setAddedMangaIds] = useState<Set<string>>(new Set());
  const [manualQuery, setManualQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const hasSearchedRef = useRef(false);

  // Local state - merge mode
  const [mergeTarget, setMergeTarget] = useState<LibraryEntry | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  // Initial query from entry title
  const initialQuery = entry.item.metadata.title;

  // Build source info with language data, sorted by language priority
  // Exclude already linked sources
  const sortedSourceInfos = useMemo(() => {
    const linkedSourceIds = new Set(
      entry.sources.map((s) => `${s.registryId}:${s.sourceId}`)
    );

    const sourceInfos = installedSources
      .map((installed) => {
        const { registryId, sourceId: rawSourceId } = parseSourceKey(installed.id);
        const info = availableSources.find(
          (a) => a.id === rawSourceId && a.registryId === registryId
        );
        return {
          registryId: installed.registryId,
          sourceId: rawSourceId,
          sourceName: info?.name ?? rawSourceId,
          sourceIcon: info?.icon,
          languages: info?.languages,
        };
      })
      .filter((s) => !linkedSourceIds.has(`${s.registryId}:${s.sourceId}`));

    return sortSourcesByLanguagePriority(sourceInfos, appLanguage);
  }, [installedSources, availableSources, appLanguage, entry.sources]);

  // Reset on open
  useEffect(() => {
    if (open) {
      storeReset();
      setViewMode("select");
      setSourceResults([]);
      setAddedMangaIds(new Set());
      setManualQuery(initialQuery);
      hasSearchedRef.current = false;
      setMergeTarget(null);
      setIsMerging(false);
    }
  }, [open, initialQuery, storeReset]);

  // AI search wrapper
  const aiSearch = useCallback(
    async (title: string, authorsHint?: string[]): Promise<string | null> => {
      try {
        return await findJapaneseTitle({ title, authors: authorsHint });
      } catch (e) {
        console.error("[SourceAdd] AI search error:", e);
        return null;
      }
    },
    [findJapaneseTitle]
  );

  // Run Smart Match to build title pool
  const runSmartMatch = useCallback(async (): Promise<TitlePool | null> => {
    setViewMode("matching");
    storeSetPhase("searching", t("metadata.smartMatch.searching"));
    const ALL_PROVIDERS: Provider[] = ["mangaupdates", "anilist", "mal"];

    try {
      // Search all providers with initial query
      await searchAllProviders(initialQuery, useSmartMatchStore.getState());

      // Check for exact matches
      let matches = findExactMatches(initialQuery, useSmartMatchStore.getState());

      // If we found some matches, use canonical title to search missing providers
      if (matches.length > 0 && matches.length < ALL_PROVIDERS.length) {
        const priorityOrder: Provider[] = ["mangaupdates", "anilist", "mal"];
        const sortedMatches = [...matches].sort(
          (a, b) => priorityOrder.indexOf(a.provider) - priorityOrder.indexOf(b.provider)
        );
        const canonicalTitle = sortedMatches[0].metadata.title;

        if (canonicalTitle && canonicalTitle !== initialQuery) {
          storeSetLastSearchQuery(canonicalTitle);

          const matchedProviders = new Set(matches.map((m) => m.provider));
          const missingProviders = ALL_PROVIDERS.filter((p) => !matchedProviders.has(p));

          if (missingProviders.length > 0) {
            await searchProviders(canonicalTitle, missingProviders, useSmartMatchStore.getState());
            matches = findExactMatches(canonicalTitle, useSmartMatchStore.getState());
          }
        }
      }

      // If still no matches, try AI fallback
      if (matches.length === 0) {
        storeSetPhase("ai-fallback", t("metadata.smartMatch.aiLookup"));
        const aiTitle = await aiSearch(initialQuery, entry.item.metadata.authors);

        if (aiTitle && aiTitle !== initialQuery) {
          storeSetLastSearchQuery(aiTitle);
          storeSetPhase("ai-retry", t("metadata.smartMatch.aiRetry"));

          await searchAllProviders(aiTitle, useSmartMatchStore.getState());
          matches = findExactMatches(aiTitle, useSmartMatchStore.getState());

          // Search missing providers
          if (matches.length > 0 && matches.length < ALL_PROVIDERS.length) {
            const matchedProviders = new Set(matches.map((m) => m.provider));
            const missingProviders = ALL_PROVIDERS.filter((p) => !matchedProviders.has(p));

            if (missingProviders.length > 0) {
              const canonicalTitle = matches[0].metadata.title;
              if (canonicalTitle && canonicalTitle !== aiTitle) {
                await searchProviders(
                  canonicalTitle,
                  missingProviders,
                  useSmartMatchStore.getState()
                );
                matches = findExactMatches(canonicalTitle, useSmartMatchStore.getState());
              }
            }
          }
        }
      }

      if (matches.length > 0) {
        // Build title pool from matches
        const pool = buildTitlePool(matches);
        setManualQuery(pool.en[0] || pool.all[0] || initialQuery);
        return pool;
      }

      // No matches - return null
      return null;
    } catch (e) {
      console.error("[SourceAdd] Smart Match error:", e);
      return null;
    }
  }, [initialQuery, entry.item.metadata.authors, aiSearch, storeSetPhase, storeSetLastSearchQuery, t]);

  // Search installed sources with title pool
  const searchSources = useCallback(
    async (pool: TitlePool | null, customQuery?: string) => {
      setIsSearching(true);

      // Titles to compare against for similarity scoring
      const compareTitles = pool?.all ?? (customQuery ? [customQuery] : [initialQuery]);

      // Initialize results for all installed sources (sorted by language priority)
      const initialResults: SourceSearchResult[] = sortedSourceInfos.map((info) => ({
        ...info,
        sourceLanguages: info.languages,
        items: [],
        loading: true,
        error: null,
        bestSimilarity: 0,
      }));
      setSourceResults(initialResults);

      // Search each source in parallel
      const searches = initialResults.map(async (result, index) => {
        try {
          const source = await getSource(result.registryId, result.sourceId);
          if (!source) {
            return { index, items: [] as ScoredManga[], bestSimilarity: 0, error: "Source not found" };
          }

          // Determine search query
          let query: string | null | undefined = customQuery;
          if (!query && pool) {
            const sourceLang = getPrimaryLanguage(result.sourceLanguages);
            query = getSearchQueryForSource(pool, sourceLang);
          }
          const searchQuery = query || initialQuery;

          const searchResult = await source.search(searchQuery);

          // Calculate similarity for each manga and sort
          const scoredItems: ScoredManga[] = searchResult.items.map((manga) => ({
            ...manga,
            similarityScore: getBestSimilarityScore(manga.title, compareTitles),
          }));

          // Sort by similarity (best first)
          scoredItems.sort((a, b) => b.similarityScore - a.similarityScore);

          // Best similarity is the first item's score (or 0 if empty)
          const bestSimilarity = scoredItems[0]?.similarityScore ?? 0;

          return { index, items: scoredItems, bestSimilarity, error: null };
        } catch (e) {
          console.error(`[SourceAdd] Search error for ${result.sourceName}:`, e);
          return { index, items: [] as ScoredManga[], bestSimilarity: 0, error: e instanceof Error ? e.message : String(e) };
        }
      });

      // Update results as they complete
      for (const promise of searches) {
        promise.then(({ index, items, bestSimilarity, error }) => {
          setSourceResults((prev) =>
            prev.map((r, i) =>
              i === index ? { ...r, items, loading: false, error, bestSimilarity } : r
            )
          );
        });
      }

      // Wait for all to complete, then sort by best similarity
      await Promise.allSettled(searches);

      // Final sort: sources with better matches first
      setSourceResults((prev) => {
        const sorted = [...prev].sort((a, b) => {
          // Loading sources stay at their language-priority position
          if (a.loading || b.loading) return 0;
          // Sort by best similarity descending
          return b.bestSimilarity - a.bestSimilarity;
        });
        return sorted;
      });

      setIsSearching(false);
    },
    [sortedSourceInfos, getSource, initialQuery]
  );

  // Handle search mode selected
  const handleSearchMode = useCallback(async () => {
    const pool = await runSmartMatch();
    setViewMode("search");
    await searchSources(pool);
  }, [runSmartMatch, searchSources]);

  // Handle manual search
  const handleManualSearch = useCallback(async () => {
    if (!manualQuery.trim()) return;
    setIsSearching(true);
    await searchSources(null, manualQuery);
  }, [manualQuery, searchSources]);

  // Handle add source - don't close dialog, show added state
  const handleAddSource = useCallback(
    async (registryId: string, sourceId: string, manga: Manga) => {
      const key = `${registryId}:${sourceId}:${manga.id}`;
      setAddingKey(key);

      try {
        await addSource(entry.item.libraryItemId, {
          registryId,
          sourceId,
          sourceMangaId: manga.id,
        });
        // Mark as added (don't close dialog)
        setAddedMangaIds((prev) => new Set(prev).add(key));
        onSourceAdded?.();

        // Cache manga details (title, etc.) for source manage dialog
        getSource(registryId, sourceId).then((source) => {
          if (source) {
            source.getManga(manga.id).catch(() => {});
          }
        });
      } catch (e) {
        console.error("[SourceAdd] Add source error:", e);
      } finally {
        setAddingKey(null);
      }
    },
    [entry.item.libraryItemId, addSource, onSourceAdded, getSource]
  );

  // Handle merge mode selected
  const handleMergeMode = useCallback(() => {
    setViewMode("merge");
  }, []);

  // Handle merge target selected
  const handleMergeSelect = useCallback((targetEntry: LibraryEntry) => {
    setMergeTarget(targetEntry);
    setViewMode("merge-confirm");
  }, []);

  // Handle merge confirmation
  const handleMergeConfirm = useCallback(async () => {
    if (!mergeTarget) return;
    setIsMerging(true);

    try {
      // Merge the source entry into the current entry
      await mergeManga(entry.item.libraryItemId, mergeTarget.item.libraryItemId);
      onSourceAdded?.();
      onOpenChange(false);
    } catch (e) {
      console.error("[SourceAdd] Merge error:", e);
    } finally {
      setIsMerging(false);
    }
  }, [mergeTarget, entry.item.libraryItemId, mergeManga, onSourceAdded, onOpenChange]);

  const handleClose = () => {
    onOpenChange(false);
  };

  // Dialog content (shared between normal and nested variants)
  const dialogContent = (
    <>
      {/* Mode Selection */}
      {viewMode === "select" && (
        <ModeSelection
          onSelectMode={(mode) => {
            if (mode === "search") {
              handleSearchMode();
            } else if (mode === "merge") {
              handleMergeMode();
            }
          }}
          t={t}
        />
      )}

      {/* Smart Match Progress */}
      {viewMode === "matching" && (
        <div className="flex-1 flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            <Spinner className="size-10 text-primary relative" />
          </div>
          <p className="font-medium text-center">
            {phaseMessage || t("metadata.smartMatch.searching")}
          </p>
        </div>
      )}

      {/* Search Results */}
      {viewMode === "search" && (
        <>
          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <HugeiconsIcon
                icon={Search01Icon}
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              />
              <Input
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                placeholder={t("sources.searchPlaceholder")}
                className="pl-9"
              />
            </div>
            <Button onClick={handleManualSearch} disabled={!manualQuery.trim() || isSearching}>
              {isSearching ? <Spinner className="size-4" /> : t("common.search")}
            </Button>
          </div>

          {/* Results */}
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 mt-4">
            <SourceResultsList
              results={sourceResults}
              addedMangaIds={addedMangaIds}
              addingKey={addingKey}
              onAdd={handleAddSource}
              t={t}
            />
          </div>
        </>
      )}

      {/* Library Merge Picker */}
      {viewMode === "merge" && (
        <LibraryMergePicker
          currentEntry={entry}
          libraryEntries={libraryEntries}
          progressIndex={progressIndex}
          onSelect={handleMergeSelect}
          t={t}
        />
      )}

      {/* Merge Confirmation */}
      {viewMode === "merge-confirm" && mergeTarget && (
        <MergeConfirmation
          targetEntry={entry}
          sourceEntry={mergeTarget}
          onConfirm={handleMergeConfirm}
          onCancel={() => setViewMode("merge")}
          isMerging={isMerging}
        />
      )}
    </>
  );

  // Footer logic - returns array of buttons (direct children for ResponsiveDialogFooter)
  const getFooterContent = () => {
    if (viewMode === "select") {
      return (
        <Button variant="outline" onClick={handleClose}>
          {t("common.cancel")}
        </Button>
      );
    }
    if (viewMode === "merge-confirm") return null; // Confirmation has its own buttons
    if (viewMode === "merge") {
      // Merge picker: back + cancel
      return (
        <>
          <Button variant="ghost" onClick={() => setViewMode("select")}>
            {t("common.back")}
          </Button>
          <Button variant="outline" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
        </>
      );
    }

    // Search mode: back + done
    return (
      <>
        <Button variant="ghost" onClick={() => setViewMode("select")}>
          {t("common.back")}
        </Button>
        <Button onClick={handleClose}>{t("common.done")}</Button>
      </>
    );
  };

  const footerContent = getFooterContent();

  // Get dialog title based on mode
  const getDialogTitle = () => {
    if (viewMode === "merge" || viewMode === "merge-confirm") {
      return t("sources.merge.title");
    }
    return t("sources.addSource");
  };

  const getDialogDescription = () => {
    if (viewMode === "select") return t("sources.addSourceDesc");
    return null;
  };

  // Use nested dialog variant when opened from another dialog
  if (nested) {
    return (
      <ResponsiveDialogNested open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{getDialogTitle()}</ResponsiveDialogTitle>
            {getDialogDescription() && (
              <ResponsiveDialogDescription>
                {getDialogDescription()}
              </ResponsiveDialogDescription>
            )}
          </ResponsiveDialogHeader>

          {dialogContent}

          {footerContent && (
            <ResponsiveDialogFooter>
              {footerContent}
            </ResponsiveDialogFooter>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col" showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{getDialogTitle()}</ResponsiveDialogTitle>
          {getDialogDescription() && (
            <ResponsiveDialogDescription>
              {getDialogDescription()}
            </ResponsiveDialogDescription>
          )}
        </ResponsiveDialogHeader>

        {dialogContent}

        {footerContent && (
          <ResponsiveDialogFooter>
            {footerContent}
          </ResponsiveDialogFooter>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
