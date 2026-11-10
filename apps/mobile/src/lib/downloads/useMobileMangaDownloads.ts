import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import type { MobileToastController } from "@/components/MobileToastContext";
import { hapticConfirm, hapticSelection } from "@/lib/haptics";
import { LOCAL_ARCHIVE_REGISTRY_ID } from "@/lib/localArchives/policy";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { mobileDownloads } from "./mobileDownloads";
import { mobileDownloadChapterKey, mobileDownloadMangaKey } from "./mobileDownloadPaths";
import { selectMobileChaptersToDownload, type MobileDownloadSelectionScope } from "./mobileDownloadSelection";
import type { MobileDownloadMangaRef } from "./mobileDownloadTypes";

export const MOBILE_DOWNLOADS_SETTINGS_HREF = "/settings/downloads";

export type MobileChapterDownloadAction = "download" | "cancelDownload" | "removeDownload";

/**
 * A title page's downloads: the chapter rows' actions, the bar menu's bulk
 * downloads, and selection mode (pick chapters, then download them). The
 * source link is the reader route's own identity, so what the page queues is
 * exactly what the reader later finds.
 */
export function useMobileMangaDownloads({
  source,
  chapters,
  progressById,
  title,
  strings,
  toast,
}: {
  source: { registryId: string; sourceId: string; sourceMangaId: string } | null | undefined;
  /** The source's chapter list in its own order (newest first). */
  chapters: readonly ChapterSummary[];
  progressById: Record<string, Pick<LocalChapterProgress, "completed" | "progress"> | undefined>;
  title: string;
  strings: MobileStrings;
  toast: MobileToastController;
}) {
  const registryId = source?.registryId;
  const sourceId = source?.sourceId;
  const mangaId = source?.sourceMangaId;
  // Imported archives are already files on this device.
  const manga = useMemo<MobileDownloadMangaRef | null>(
    () =>
      registryId && sourceId && mangaId && registryId !== LOCAL_ARCHIVE_REGISTRY_ID
        ? { registryId, sourceId, mangaId }
        : null,
    [mangaId, registryId, sourceId],
  );
  const mangaKey = manga ? mobileDownloadMangaKey(manga) : null;
  // Only whether this title has downloads: never a re-render per page saved.
  const encodedPresence = useSyncExternalStore(
    mobileDownloads.subscribe,
    () => {
      if (!mangaKey) return "0:0";
      const state = mobileDownloads.getState();
      let downloaded = 0;
      for (const chapter of Object.values(state.chapters)) {
        if (mobileDownloadMangaKey(chapter) === mangaKey) downloaded += 1;
      }
      const queued = state.jobs.filter((job) => mobileDownloadMangaKey(job) === mangaKey).length;
      // Present or not: the page re-renders when a title gains or loses
      // downloads, not each time a chapter finishes.
      return `${Math.min(downloaded, 1)}:${Math.min(queued, 1)}`;
    },
    () => "0:0",
  );
  const hasDownloaded = encodedPresence.startsWith("1");
  const hasQueued = encodedPresence.endsWith("1");

  const enqueue = useCallback(
    (picked: readonly ChapterSummary[]) => {
      if (!manga) return;
      const before = mobileDownloads.getState();
      const fresh = picked.filter((chapter) => {
        const key = mobileDownloadChapterKey({ ...manga, chapterId: chapter.id });
        return !before.chapters[key] && !before.jobs.some((job) => job.key === key && job.status !== "failed");
      });
      if (fresh.length === 0) {
        toast.show({ id: "manga-downloads", tone: "info", title: strings.downloads.nothingToDownload });
        return;
      }
      mobileDownloads.enqueue(fresh.map((chapter) => ({ ...manga, chapter, mangaTitle: title })));
      void hapticConfirm();
      toast.show({
        id: "manga-downloads",
        tone: "success",
        title:
          fresh.length === 1
            ? strings.downloads.queuedOne
            : formatMobileString(strings.downloads.queuedOther, { count: fresh.length }),
        action: { label: strings.downloads.title, onPress: () => router.push(MOBILE_DOWNLOADS_SETTINGS_HREF) },
      });
    },
    [manga, strings, title, toast],
  );

  const downloadScope = useCallback(
    (scope: MobileDownloadSelectionScope) => enqueue(selectMobileChaptersToDownload(chapters, progressById, scope)),
    [chapters, enqueue, progressById],
  );

  const chapterAction = useCallback(
    (chapter: ChapterSummary, action: MobileChapterDownloadAction) => {
      if (!manga) return;
      const key = mobileDownloadChapterKey({ ...manga, chapterId: chapter.id });
      if (action === "download") enqueue([chapter]);
      else if (action === "cancelDownload") mobileDownloads.cancel(new Set([key]));
      else void mobileDownloads.deleteChapters(new Set([key]));
    },
    [enqueue, manga],
  );

  const cancelAll = useCallback(() => {
    if (!mangaKey) return;
    const keys = mobileDownloads.getState().jobs.filter((job) => mobileDownloadMangaKey(job) === mangaKey);
    mobileDownloads.cancel(new Set(keys.map((job) => job.key)));
  }, [mangaKey]);

  const confirmRemoveAll = useCallback(() => {
    if (!mangaKey) return;
    Alert.alert(strings.downloads.removeDownloads, title, [
      { text: strings.common.cancel, style: "cancel" },
      {
        text: strings.downloads.delete,
        style: "destructive",
        onPress: () => void mobileDownloads.deleteManga(mangaKey),
      },
    ]);
  }, [mangaKey, strings, title]);

  // Selection mode: null when off.
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const selectable = useMemo(() => chapters.filter((chapter) => !chapter.locked), [chapters]);
  const startSelecting = useCallback(() => setSelected(new Set()), []);
  const stopSelecting = useCallback(() => setSelected(null), []);
  const toggleSelected = useCallback((chapter: ChapterSummary) => {
    void hapticSelection();
    setSelected((current) => {
      if (!current) return current;
      const next = new Set(current);
      if (next.has(chapter.id)) next.delete(chapter.id);
      else next.add(chapter.id);
      return next;
    });
  }, []);
  const allSelected = selected !== null && selectable.length > 0 && selected.size >= selectable.length;
  const toggleAll = useCallback(() => {
    setSelected((current) =>
      current && current.size >= selectable.length ? new Set() : new Set(selectable.map((chapter) => chapter.id)),
    );
  }, [selectable]);
  const downloadSelected = useCallback(() => {
    if (!selected?.size) return;
    // Reading order, as the bulk downloads queue them.
    enqueue(chapters.filter((chapter) => selected.has(chapter.id)).reverse());
    setSelected(null);
  }, [chapters, enqueue, selected]);

  return {
    manga,
    hasDownloaded,
    hasQueued,
    downloadScope,
    chapterAction,
    cancelAll,
    confirmRemoveAll,
    openManager: useCallback(() => router.push(MOBILE_DOWNLOADS_SETTINGS_HREF), []),
    selection: {
      selected,
      allSelected,
      startSelecting,
      stopSelecting,
      toggleSelected,
      toggleAll,
      downloadSelected,
    },
  };
}

export type MobileMangaDownloads = ReturnType<typeof useMobileMangaDownloads>;
