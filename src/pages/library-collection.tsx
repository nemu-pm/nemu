import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useAllMangaProgress, useStores } from "@/data/context";
import { getEntryAddedAt, getEntryCover, getEntryEffectiveMetadata, getEntryMostRecentSource, entryHasAnyUpdate } from "@/data/view";
import type { LibraryEntry } from "@/data/view";
import type { LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import { formatChapterShort } from "@/lib/format-chapter";
import { PageHeader } from "@/components/page-header";
import { PageEmpty } from "@/components/page-empty";
import { LibraryPageSkeleton } from "@/components/page-skeletons";
import { MangaCard } from "@/components/manga-card";
import { SourceImageProvider } from "@/hooks/use-source-image";
import { AddBooksSheet } from "@/components/collections/add-books-sheet";
import { CollectionsManagerDialog } from "@/components/collections/collections-manager-dialog";
import { useLibraryTitleMenu } from "@/components/collections/library-title-menu";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons";

function buildProgressMap(
  entry: LibraryEntry,
  progressIndex: Map<string, LocalMangaProgress>
): Map<string, LocalMangaProgress> {
  const progress = new Map<string, LocalMangaProgress>();
  for (const source of entry.sources) {
    const key = makeMangaProgressId(source.registryId, source.sourceId, source.sourceMangaId);
    const item = progressIndex.get(key);
    if (item) {
      progress.set(source.id, item);
    }
  }
  return progress;
}

function useProgressInfo(
  entry: LibraryEntry,
  progressIndex: Map<string, LocalMangaProgress>,
  t: (key: string) => string
) {
  return useMemo(() => {
    const progress = buildProgressMap(entry, progressIndex);
    const recentSource = getEntryMostRecentSource(entry, progress);
    if (!recentSource) {
      return { badge: undefined, subtitle: t("library.unread") };
    }

    const sourceProgress = progress.get(recentSource.id);
    const lastReadChapter = sourceProgress?.lastReadSourceChapterId
      ? {
          id: sourceProgress.lastReadSourceChapterId,
          chapterNumber: sourceProgress.lastReadChapterNumber,
          volumeNumber: sourceProgress.lastReadVolumeNumber,
          title: sourceProgress.lastReadChapterTitle,
        }
      : undefined;
    const latestChapter = recentSource.latestChapter;
    const isCaughtUp =
      sourceProgress?.lastReadSourceChapterId != null &&
      latestChapter != null &&
      sourceProgress.lastReadSourceChapterId === latestChapter.id;

    let subtitle = t("library.unread");
    if (isCaughtUp) {
      subtitle = t("library.caughtUp");
    } else if (lastReadChapter && latestChapter) {
      subtitle = `${formatChapterShort(lastReadChapter)} / ${formatChapterShort(latestChapter)}`;
    } else if (lastReadChapter) {
      subtitle = formatChapterShort(lastReadChapter);
    }

    return {
      badge: entryHasAnyUpdate(entry) ? t("library.updated") : undefined,
      subtitle,
    };
  }, [entry, progressIndex, t]);
}

function CollectionEntryCard({
  entry,
  progressIndex,
}: {
  entry: LibraryEntry;
  progressIndex: Map<string, LocalMangaProgress>;
}) {
  const { t } = useTranslation();
  const { badge, subtitle } = useProgressInfo(entry, progressIndex, t);
  const progress = buildProgressMap(entry, progressIndex);
  const recentSource = getEntryMostRecentSource(entry, progress) ?? entry.sources[0];
  const sourceKey = recentSource ? `${recentSource.registryId}:${recentSource.sourceId}` : "";
  const metadata = getEntryEffectiveMetadata(entry);
  const cover = getEntryCover(entry);

  return (
    <SourceImageProvider sourceKey={sourceKey}>
      <MangaCard
        to="/library/$id"
        params={{ id: entry.item.libraryItemId }}
        cover={cover}
        title={metadata.title}
        subtitle={subtitle}
        badge={badge}
      />
    </SourceImageProvider>
  );
}

export function CollectionDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { useLibraryStore, useCollectionsStore } = useStores();
  const progressIndex = useAllMangaProgress();
  const { entries, loading: libraryLoading } = useLibraryStore();
  const {
    collections,
    membership,
    loading,
  } = useCollectionsStore();
  const [collectionsManagerOpen, setCollectionsManagerOpen] = useState(false);
  const [addBooksOpen, setAddBooksOpen] = useState(false);

  const collection = collections.find((item) => item.collectionId === id);
  const collectionItemIds = useMemo(() => new Set(membership.get(id) ?? []), [id, membership]);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => collectionItemIds.has(entry.item.libraryItemId)),
    [collectionItemIds, entries]
  );

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      const aUpdated = entryHasAnyUpdate(a);
      const bUpdated = entryHasAnyUpdate(b);
      if (aUpdated !== bUpdated) return aUpdated ? -1 : 1;

      const aProgress = buildProgressMap(a, progressIndex);
      const bProgress = buildProgressMap(b, progressIndex);
      const aSource = getEntryMostRecentSource(a, aProgress);
      const bSource = getEntryMostRecentSource(b, bProgress);
      const aReadTime = aSource ? (aProgress.get(aSource.id)?.lastReadAt ?? 0) : 0;
      const bReadTime = bSource ? (bProgress.get(bSource.id)?.lastReadAt ?? 0) : 0;
      return Math.max(bReadTime, getEntryAddedAt(b)) - Math.max(aReadTime, getEntryAddedAt(a));
    });
  }, [filteredEntries, progressIndex]);

  const titleMenu = useLibraryTitleMenu({
    collections,
    currentCollectionId: id,
    onManage: () => setCollectionsManagerOpen(true),
  });

  if (loading || libraryLoading) {
    return <LibraryPageSkeleton />;
  }

  if (!collection) {
    return (
      <PageEmpty
        icon={Alert02Icon}
        title={t("collections.notFoundTitle")}
        description={t("collections.notFoundDescription")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={collection.name}
        titleMenu={titleMenu}
        actions={[
          {
            label: t("collections.addBooksAction"),
            icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />,
            onClick: () => setAddBooksOpen(true),
          },
        ]}
      />

      {sortedEntries.length === 0 ? (
        <PageEmpty
          icon={Add01Icon}
          title={t("collections.emptyCollectionTitle")}
          description={t("collections.emptyCollectionDescription")}
          action={
            <Button size="lg" onClick={() => setAddBooksOpen(true)}>
              {t("collections.addBooksAction")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
          {sortedEntries.map((entry) => (
            <CollectionEntryCard key={entry.item.libraryItemId} entry={entry} progressIndex={progressIndex} />
          ))}
        </div>
      )}

      <CollectionsManagerDialog
        open={collectionsManagerOpen}
        onOpenChange={setCollectionsManagerOpen}
        onCollectionRemoved={(collectionId) => {
          if (collectionId === id) {
            navigate({ to: "/" });
          }
        }}
      />

      <AddBooksSheet open={addBooksOpen} onOpenChange={setAddBooksOpen} collectionId={id} />
    </div>
  );
}
