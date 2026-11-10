import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { NetworkStateType, useNetworkState } from "expo-network";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { formatChapterTitle } from "@/lib/formatChapter";
import { formatMobileString, getMobileStrings, type MobileStrings } from "@/lib/mobileI18n";
import { getMobileSourceMangaHref } from "@/lib/mobileSourceRoutes";
import { mobileDownloads, useMobileDownloadState } from "./mobileDownloads";
import { getMobileDownloadedBytes, listMobileDownloadedManga } from "./mobileDownloadQueue";
import type { MobileDownloadJob, MobileDownloadedManga } from "./mobileDownloadTypes";

export function formatMobileDownloadBytes(bytes: number, strings: MobileStrings): string {
  if (bytes < 1024) return formatMobileString(strings.settings.storageUnitBytes, { value: bytes });
  if (bytes < 1024 * 1024) {
    return formatMobileString(strings.settings.storageUnitKilobytes, { value: (bytes / 1024).toFixed(1) });
  }
  if (bytes < 1024 * 1024 * 1024) {
    return formatMobileString(strings.settings.storageUnitMegabytes, { value: (bytes / (1024 * 1024)).toFixed(1) });
  }
  return formatMobileString(strings.downloads.storageUnitGigabytes, {
    value: (bytes / (1024 * 1024 * 1024)).toFixed(2),
  });
}

export type MobileDownloadQueueRow = {
  key: string;
  title: string;
  detail: string;
  /** 0–1 while downloading; null otherwise. */
  progress: number | null;
  status: MobileDownloadJob["status"];
};

/** Settings > Downloads: the queue, the downloaded titles and their storage. */
export function useMobileDownloadsPage() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const state = useMobileDownloadState();
  const network = useNetworkState();
  const manga = useMemo(() => listMobileDownloadedManga(state), [state]);
  const totalBytes = useMemo(() => getMobileDownloadedBytes(state), [state]);
  const queue = useMemo<MobileDownloadQueueRow[]>(
    () =>
      state.jobs.map((job) => {
        const chapter = formatChapterTitle(job.chapter, strings);
        const status =
          job.status === "downloading"
            ? job.pageCount > 0
              ? formatMobileString(strings.downloads.jobProgress, { done: job.pagesDone, total: job.pageCount })
              : strings.downloads.jobDownloading
            : job.status === "paused"
              ? strings.downloads.jobPaused
              : job.status === "failed"
                ? strings.downloads.jobFailed
                : strings.downloads.jobQueued;
        return {
          key: job.key,
          title: job.mangaTitle || chapter,
          detail: `${chapter} · ${status}`,
          progress: job.status === "downloading" && job.pageCount > 0 ? job.pagesDone / job.pageCount : null,
          status: job.status,
        };
      }),
    [state.jobs, strings],
  );
  const hasRunnable = state.jobs.some((job) => job.status === "queued" || job.status === "downloading");
  const hasPaused = state.jobs.some((job) => job.status === "paused" || job.status === "failed");
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const onWifi = network.type === NetworkStateType.WIFI || network.type === NetworkStateType.ETHERNET;
  const waiting = !hasRunnable
    ? null
    : offline
      ? strings.downloads.waitingForNetwork
      : state.wifiOnly && network.type != null && network.type !== NetworkStateType.UNKNOWN && !onWifi
        ? strings.downloads.waitingForWifi
        : null;

  const confirmDeleteAll = useCallback(() => {
    Alert.alert(
      strings.downloads.deleteAllTitle,
      formatMobileString(strings.downloads.deleteAllMessage, { size: formatMobileDownloadBytes(totalBytes, strings) }),
      [
        { text: strings.common.cancel, style: "cancel" },
        { text: strings.downloads.delete, style: "destructive", onPress: () => void mobileDownloads.deleteAll() },
      ],
    );
  }, [strings, totalBytes]);

  return {
    strings,
    wifiOnly: state.wifiOnly,
    setWifiOnly: useCallback((value: boolean) => mobileDownloads.setWifiOnly(value), []),
    totalBytes,
    totalLabel: formatMobileDownloadBytes(totalBytes, strings),
    manga,
    queue,
    waiting,
    hasRunnable,
    hasPaused,
    empty: manga.length === 0 && queue.length === 0,
    pauseAll: useCallback(() => mobileDownloads.pause(null), []),
    resumeAll: useCallback(() => mobileDownloads.resume(null), []),
    cancelAll: useCallback(() => mobileDownloads.cancel(null), []),
    toggleJob: useCallback((row: MobileDownloadQueueRow) => {
      const keys = new Set([row.key]);
      if (row.status === "queued" || row.status === "downloading") mobileDownloads.pause(keys);
      else mobileDownloads.resume(keys);
    }, []),
    cancelJob: useCallback((key: string) => mobileDownloads.cancel(new Set([key])), []),
    deleteManga: useCallback((item: MobileDownloadedManga) => void mobileDownloads.deleteManga(item.key), []),
    openManga: useCallback((item: MobileDownloadedManga) => {
      router.push(
        getMobileSourceMangaHref({
          registryId: item.registryId,
          sourceId: item.sourceId,
          mangaId: item.mangaId,
          mangaTitle: item.title,
        }),
      );
    }, []),
    formatChapterCount: (count: number) =>
      count === 1
        ? strings.downloads.chapterCountOne
        : formatMobileString(strings.downloads.chapterCountOther, { count }),
    formatBytes: (bytes: number) => formatMobileDownloadBytes(bytes, strings),
    confirmDeleteAll,
  };
}
