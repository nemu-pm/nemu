import { useEffect } from "react";
import { AppState } from "react-native";
import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType, type NetworkState } from "expo-network";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import type { MobileDataStore } from "@/data/storeTypes";
import { mobileDownloads } from "@/lib/downloads/mobileDownloads";
import type { MobileDownloadSourceAccess } from "@/lib/downloads/mobileDownloadManager";
import { classifyMobileNetworkState } from "@/lib/mobileConnectivity";
import { downloadMobileReaderPageToTemporaryFile } from "@/lib/mobileImageCache";
import {
  getMobileInstalledSourceSettingsKeys,
  mobileInstalledSourceMatchesRoute,
} from "@/lib/mobileInstalledSourceKeys";
import { normalizeReaderProcessPageImages } from "@/lib/mobileReaderSettings";
import { loadMobileSourceSettingsByKeys, mergeSourceSettingValues } from "@/lib/mobileSourceSettings";
import { applyMobileSourcePackageHydration } from "@/sources/mobileSourcePackageLoader";
import { refreshMobileReaderPages } from "@/sources/mobileSourcePages";
import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";

/**
 * The page list a chapter download works from: the reader's own request
 * (same source settings, same image-processing choice), at background
 * priority so a chapter someone is reading always goes first.
 */
function createSourceAccess(store: MobileDataStore): MobileDownloadSourceAccess {
  return {
    async loadPages(job) {
      const installed = (await store.getInstalledSources()).find((source) =>
        mobileInstalledSourceMatchesRoute(source, job.registryId, job.sourceId),
      );
      if (!installed) throw new Error("The chapter's source is not installed.");
      const settings = await store.getSettings();
      const refreshed = await refreshMobileReaderPages(installed, job.mangaId, job.chapter, {
        processPageImages: normalizeReaderProcessPageImages(settings.readerProcessPageImages),
        priority: "background",
        getSourceSettings: async (_sourceKey, source) => {
          const saved = await loadMobileSourceSettingsByKeys(store, [
            makeMobileRuntimeSourceKey(normalizeInstalledSource(source)),
            ...getMobileInstalledSourceSettingsKeys(source),
          ]);
          return mergeSourceSettingValues(source.packageMetadata?.settings ?? [], saved?.values);
        },
        onSourcePackageHydrated: async (source, hydration) => {
          const hydrated = applyMobileSourcePackageHydration(source, hydration);
          if (hydrated === source) return;
          if (await store.saveInstalledSourceIfCurrent?.(hydrated, source.updatedAt)) {
            emitMobileDataChanged("sources");
          }
        },
      });
      if (refreshed.status === "blocked") throw new Error(refreshed.detail);
      const processor = refreshed.pageProcessor;
      return {
        pages: refreshed.pages,
        chapter: refreshed.chapter,
        chapters: refreshed.chapterIndexStatus === "ready" ? refreshed.chapters : null,
        resolvePage: async (index, signal) =>
          (await processor?.resolvePage?.(index, { signal, priority: "background" })) ?? null,
        dispose: () => processor?.dispose(),
      };
    },
    fetchImage: (request, signal) => downloadMobileReaderPageToTemporaryFile(request, signal),
  };
}

function networkFor(state: NetworkState) {
  const status = classifyMobileNetworkState(state);
  return {
    connected: status === "unknown" ? null : status === "online",
    unmetered:
      state.type == null || state.type === NetworkStateType.UNKNOWN
        ? null
        : state.type === NetworkStateType.WIFI || state.type === NetworkStateType.ETHERNET,
  };
}

/**
 * Runs the download queue for the signed-in profile: source access from the
 * data store, the network (and the Wi-Fi-only choice), and the state saved
 * when the app leaves the foreground. Mounted once at the app root; renders
 * nothing.
 */
export function MobileDownloadsBridge() {
  const store = useMobileDataStore();

  useEffect(() => {
    void mobileDownloads.switchProfileScope(getActiveMobileSourceProfileScope());
    return registerMobileSourceProfileTransitionHandler("mobile-downloads", ({ toScope }) =>
      mobileDownloads.switchProfileScope(toScope),
    );
  }, []);

  useEffect(() => {
    mobileDownloads.setSourceAccess(createSourceAccess(store));
    return () => mobileDownloads.setSourceAccess(null);
  }, [store]);

  useEffect(() => {
    let mounted = true;
    void getNetworkStateAsync()
      .then((state) => {
        if (mounted) mobileDownloads.setNetwork(networkFor(state));
      })
      .catch(() => undefined);
    const subscription = addNetworkStateListener((state) => mobileDownloads.setNetwork(networkFor(state)));
    const appState = AppState.addEventListener("change", (next) => {
      if (next !== "active") void mobileDownloads.flush();
    });
    return () => {
      mounted = false;
      subscription.remove();
      appState.remove();
    };
  }, []);

  return null;
}
