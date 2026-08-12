import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMobileDataStore } from "./mobileDataContext";
import type {
  AppLanguage,
  InstalledSource,
  LibraryEntry,
  LocalChapterProgress,
  LocalCollection,
  LocalLibraryItem,
  LocalMangaProgress,
  MetadataLanguagePreference,
  PagePairingMode,
  ReadingMode,
  SourcePackageSetting,
  SourceRegistry,
} from "./schema";
import type { MobileDataStore } from "./storeTypes";
import {
  AIDOKU_REGISTRIES,
  fetchAllAidokuRegistrySources,
  makeSourceKey,
  type MobileRegistrySource,
} from "@/sources/aidokuRegistry";
import {
  cacheSourcePackage,
  clearCachedSourcePackage,
  clearCachedSourcePackages,
} from "@/sources/sourcePackageCache";
import { getSourcePackageKind } from "@/sources/sourcePackageCacheTypes";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
  resolveMobileSourcePackageCacheKey,
} from "@/sources/mobileSourceRuntime";
import { defaultMobileSourceSessionCache } from "@/sources/mobileSourceExecutorCache";
import {
  clearMobileAidokuSandboxDataForProfile,
  clearMobileAidokuSandboxDataForSource,
} from "@/sources/mobileAidokuSandboxData";
import { clearMobileSourceImageRequestCache } from "@/sources/mobileSourceImages";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";
import { clearMobileImageCache } from "@/lib/mobileImageCache";
import { clearMobileJapaneseLearningTtsCache } from "@/lib/mobileJapaneseLearningTts";
import { clearMobileDualReaderDhashCache } from "@/lib/mobileDualReaderDhashCache";
import { findMobileInstalledSourceForRegistrySource } from "@/lib/mobileBrowseSources";
import {
  buildCollectionMembership,
  buildRenamedCollection,
  sortCollections,
} from "@/lib/mobileCollections";
import {
  clampReaderScrollWidthPct,
  DEFAULT_READER_PAGE_PAIRING_MODE,
  DEFAULT_READER_PROCESS_PAGE_IMAGES,
  DEFAULT_READER_SCROLL_WIDTH_PCT,
  DEFAULT_READER_TWO_PAGE_MODE,
  normalizeReaderPagePairingMode,
  normalizeReaderProcessPageImages,
  normalizeReaderTwoPageMode,
} from "@/lib/mobileReaderSettings";
import {
  DEFAULT_APP_LANGUAGE,
  DEFAULT_METADATA_LANGUAGE_PREFERENCE,
  getEffectiveMetadataLanguage,
  normalizeAppLanguage,
  normalizeMetadataLanguagePreference,
} from "@/lib/mobileLanguageSettings";
import { findMobileSourceUpdates } from "@/lib/mobileSourceUpdates";
import {
  markMobilePerformance,
  measureMobilePerformance,
  runAfterMobileInteractions,
} from "@/lib/mobilePerformance";
import {
  getMobileReaderPluginStates,
  setMobileReaderPluginEnabled,
  setMobileReaderPluginValue,
  resetMobileReaderPluginValues,
  type MobileReaderPluginId,
  type MobileReaderPluginState,
} from "@/lib/mobileReaderPlugins";
import { getMobileStrings } from "@/lib/mobileI18n";
import { finalizeMobileDataResetAuthProfile } from "@/lib/mobileDataManagement";
import { unregisterMobileBackgroundSyncAsync } from "@/sync/mobileBackgroundSync";
import {
  applyMobileSourceSettingsPatch,
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
  normalizeMobileSourceSettingsKeys,
} from "@/lib/mobileSourceSettings";
import {
  emitMobileDataChanged,
  emitMobileSettingsDataChanged,
  useMobileDataRevision,
} from "./mobileDataEvents";
import {
  isMobileSourceSettingsLoadPending,
  makeMobileSourceSettingsLoadSignature,
} from "./mobileSourceSettingsLoad";
import {
  clearMobileCloudData,
  mobileIsAuthenticatedRef,
  runWithMobileSyncSuspended,
} from "@/sync/mobileSyncRuntime";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { clearRetainedMobileDataProfile } from "./mobileDataProfile";
import { nextSyncTimestamp } from "@nemu/core";

type LoadState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const EMPTY_SOURCE_SETTINGS_KEYS: Array<string | null | undefined> = [];

export type MobileDataClearMode = "cache" | "all";

export type MobileSourceUpdateNotice = {
  id: number;
  names: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ignoreReloadError(reload: () => Promise<void>) {
  void reload().catch(() => undefined);
}

function makeLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function saveMobileRegistrySourceInstall(
  store: MobileDataStore,
  source: MobileRegistrySource,
) {
  const key = makeSourceKey(source.registryId, source.id);
  const existing = (await store.getSyncSettings()).installedSources.find(
    (item) => item.id === key,
  );
  const packageResult = await cacheSourcePackage(source);
  const packageKind = getSourcePackageKind(source);
  const packageMetadata =
    packageResult.metadata ?? source.packageMetadata ?? null;
  await store.saveRegistry(
    packageKind === "tachiyomi-extension"
      ? {
          id: source.registryId,
          name: source.registryName,
          type: "builtin",
        }
      : {
          id: source.registryId,
          name: source.registryName,
          type: "url",
          url:
            AIDOKU_REGISTRIES.find(
              (registry) => registry.id === source.registryId,
            )?.indexUrl ?? "",
        },
  );
  await store.saveInstalledSource({
    id: key,
    registryId: source.registryId,
    sourceKind: packageKind === "tachiyomi-extension" ? "tachiyomi" : "aidoku",
    sourceId: packageMetadata?.sourceId ?? source.id,
    name: packageMetadata?.name ?? source.name,
    icon: source.icon,
    languages: packageMetadata?.languages ?? source.languages,
    contentRating: packageMetadata?.contentRating ?? source.contentRating,
    ...(source.hasAuthentication == null
      ? {}
      : { hasAuthentication: source.hasAuthentication }),
    ...(source.hasCloudflare == null
      ? {}
      : { hasCloudflare: source.hasCloudflare }),
    downloadUrl: source.downloadUrl,
    packageUri: packageResult.packageUri,
    packageCacheKey: packageResult.packageCacheKey,
    packageMetadata,
    version: packageMetadata?.version ?? source.version,
    updatedAt: nextSyncTimestamp(existing?.updatedAt),
    removed: false,
  });
  // A live cached session would keep executing the previous version's WASM —
  // session-cache hits bypass the package loader's version check entirely.
  defaultMobileSourceSessionCache.remove(key);
  const runtimeSourceId = packageMetadata?.sourceId ?? source.id;
  if (runtimeSourceId !== source.id) {
    defaultMobileSourceSessionCache.remove(
      makeSourceKey(source.registryId, runtimeSourceId),
    );
  }
}

export function useLibraryEntries(): LoadState<LibraryEntry[]> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["library"]);
  const [data, setData] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const entries = await store.getLibraryEntries();
      setData(entries);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useMangaProgress(): LoadState<LocalMangaProgress[]> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["progress"]);
  const [data, setData] = useState<LocalMangaProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const progress = await store.getMangaProgress();
      setData(progress);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useInstalledSources(): LoadState<InstalledSource[]> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [data, setData] = useState<InstalledSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const sources = await store.getInstalledSources();
      setData(sources);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useInstalledSource(
  sourceId: string | null | undefined,
): LoadState<InstalledSource | null> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const normalizedSourceId = sourceId?.trim() || null;
  const [data, setData] = useState<InstalledSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(
        normalizedSourceId
          ? await store.getInstalledSource(normalizedSourceId)
          : null,
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [normalizedSourceId, store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useLibraryItem(
  libraryItemId: string | null | undefined,
): LoadState<LocalLibraryItem | null> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["library"]);
  const normalizedLibraryItemId = libraryItemId?.trim() || null;
  const [data, setData] = useState<LocalLibraryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(
        normalizedLibraryItemId
          ? await store.getLibraryItem(normalizedLibraryItemId)
          : null,
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [normalizedLibraryItemId, store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useMangaChapterProgress(
  registryId: string | null | undefined,
  sourceId: string | null | undefined,
  mangaId: string | null | undefined,
): LoadState<Record<string, LocalChapterProgress>> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["progress"]);
  const normalizedRegistryId = registryId?.trim() || null;
  const normalizedSourceId = sourceId?.trim() || null;
  const normalizedMangaId = mangaId?.trim() || null;
  const [data, setData] = useState<Record<string, LocalChapterProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(
        normalizedRegistryId && normalizedSourceId && normalizedMangaId
          ? await store.getMangaChapterProgress(
              normalizedRegistryId,
              normalizedSourceId,
              normalizedMangaId,
            )
          : {},
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [normalizedMangaId, normalizedRegistryId, normalizedSourceId, store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useSourceSettings(
  sourceKey: string | null | undefined,
  schema: SourcePackageSetting[],
  sourceKeys: Iterable<string | null | undefined> = EMPTY_SOURCE_SETTINGS_KEYS,
): LoadState<Record<string, unknown>> & {
  setSetting: (key: string, value: unknown) => Promise<void>;
  setSettings: (
    patch: Record<string, unknown>,
    deleteKeys?: string[],
  ) => Promise<void>;
  resetSettings: () => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["sourceSettings"]);
  const [data, setData] = useState<Record<string, unknown>>(() =>
    mergeSourceSettingValues(schema, null),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mutationRun = useRef(0);
  const dataRef = useRef<Record<string, unknown>>(
    mergeSourceSettingValues(schema, null),
  );
  const savedData = useRef<Record<string, unknown>>(
    mergeSourceSettingValues(schema, null),
  );
  const userDataRef = useRef<Record<string, unknown>>({});
  const savedUserData = useRef<Record<string, unknown>>({});
  const mutationQueue = useRef(Promise.resolve());
  const activeSourceKey = useRef<string | null>(sourceKey ?? null);
  const loadRun = useRef(0);
  const sourceSettingsKeys = useMemo(
    () => normalizeMobileSourceSettingsKeys(sourceKey, sourceKeys),
    [sourceKey, sourceKeys],
  );
  const sourceSettingsLoadSignature = useMemo(
    () =>
      makeMobileSourceSettingsLoadSignature({
        sourceKey,
        sourceKeys: sourceSettingsKeys,
        schema,
      }),
    [schema, sourceKey, sourceSettingsKeys],
  );
  const loadedSourceSettingsSignature = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const currentSourceKey = sourceKey ?? null;
    const run = loadRun.current + 1;
    const sourceChanged = activeSourceKey.current !== currentSourceKey;
    loadRun.current = run;
    activeSourceKey.current = currentSourceKey;
    if (sourceChanged) {
      mutationRun.current += 1;
      const defaults = mergeSourceSettingValues(schema, null);
      dataRef.current = defaults;
      savedData.current = defaults;
      userDataRef.current = {};
      savedUserData.current = {};
      setData(defaults);
    }
    setLoading(true);
    try {
      setError(null);
      if (!currentSourceKey) {
        const defaults = mergeSourceSettingValues(schema, null);
        if (
          activeSourceKey.current === currentSourceKey &&
          loadRun.current === run
        ) {
          dataRef.current = defaults;
          savedData.current = defaults;
          userDataRef.current = {};
          savedUserData.current = {};
          setData(defaults);
        }
        return;
      }
      const settings = await loadMobileSourceSettingsByKeys(
        store,
        sourceSettingsKeys,
      );
      const userValues = settings?.values ?? {};
      const values = mergeSourceSettingValues(schema, userValues);
      if (
        activeSourceKey.current === currentSourceKey &&
        loadRun.current === run &&
        dataRef.current === savedData.current
      ) {
        dataRef.current = values;
        savedData.current = values;
        userDataRef.current = userValues;
        savedUserData.current = userValues;
        setData(values);
      }
    } catch (nextError) {
      if (
        activeSourceKey.current === currentSourceKey &&
        loadRun.current === run
      ) {
        setError(errorMessage(nextError));
        throw nextError;
      }
    } finally {
      if (
        activeSourceKey.current === currentSourceKey &&
        loadRun.current === run
      ) {
        loadedSourceSettingsSignature.current = sourceSettingsLoadSignature;
        setLoading(false);
      }
    }
  }, [schema, sourceKey, sourceSettingsKeys, sourceSettingsLoadSignature, store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  const setSettings = useCallback(
    async (
      patch: Record<string, unknown>,
      deleteKeys: string[] = [],
    ) => {
      if (!sourceKey) return;
      const operationSourceKey = sourceKey;
      const { values, userValues } = applyMobileSourceSettingsPatch(
        schema,
        userDataRef.current,
        patch,
        deleteKeys,
      );
      const run = mutationRun.current + 1;
      mutationRun.current = run;
      setError(null);
      dataRef.current = values;
      userDataRef.current = userValues;
      setData(values);
      const operation = mutationQueue.current
        .catch(() => undefined)
        .then(async () => {
          await store.saveSourceSettings({
            sourceKey: operationSourceKey,
            values: userValues,
            updatedAt: Date.now(),
          });
          if (activeSourceKey.current === operationSourceKey) {
            savedData.current = values;
            savedUserData.current = userValues;
          }
          emitMobileDataChanged("sourceSettings");
        });
      mutationQueue.current = operation.catch(() => undefined);
      try {
        await operation;
        if (mutationRun.current === run) {
          setError(null);
        }
      } catch (nextError) {
        if (
          activeSourceKey.current === operationSourceKey &&
          mutationRun.current === run
        ) {
          dataRef.current = savedData.current;
          userDataRef.current = savedUserData.current;
          setData(savedData.current);
          setError(errorMessage(nextError));
        }
        throw nextError;
      }
    },
    [schema, sourceKey, store],
  );

  const setSetting = useCallback(
    (key: string, value: unknown) => setSettings({ [key]: value }),
    [setSettings],
  );

  const resetSettings = useCallback(async () => {
    if (!sourceKey) return;
    const operationSourceKey = sourceKey;
    const operationSourceKeys = sourceSettingsKeys;
    const run = mutationRun.current + 1;
    mutationRun.current = run;
    const values = mergeSourceSettingValues(schema, null);
    setError(null);
    dataRef.current = values;
    userDataRef.current = {};
    setData(values);
    const operation = mutationQueue.current
      .catch(() => undefined)
      .then(async () => {
        await Promise.all(
          operationSourceKeys.map((key) => store.resetSourceSettings(key)),
        );
        if (activeSourceKey.current === operationSourceKey) {
          savedData.current = values;
          savedUserData.current = {};
        }
        emitMobileDataChanged("sourceSettings");
      });
    mutationQueue.current = operation.catch(() => undefined);
    try {
      await operation;
      if (mutationRun.current === run) {
        setError(null);
      }
    } catch (nextError) {
      if (
        activeSourceKey.current === operationSourceKey &&
        mutationRun.current === run
      ) {
        dataRef.current = savedData.current;
        userDataRef.current = savedUserData.current;
        setData(savedData.current);
        setError(errorMessage(nextError));
      }
      throw nextError;
    }
  }, [schema, sourceKey, sourceSettingsKeys, store]);

  return {
    data,
    loading: isMobileSourceSettingsLoadPending({
      loading,
      loadedSignature: loadedSourceSettingsSignature.current,
      currentSignature: sourceSettingsLoadSignature,
    }),
    error,
    reload,
    setSetting,
    setSettings,
    resetSettings,
  };
}

export function useCollections(): LoadState<LocalCollection[]> & {
  membership: Map<string, Set<string>>;
  createCollection: (name: string) => Promise<LocalCollection>;
  renameCollection: (
    collectionId: string,
    name: string,
  ) => Promise<LocalCollection | null>;
  removeCollection: (collectionId: string) => Promise<void>;
  addBooksToCollection: (
    collectionId: string,
    libraryItemIds: string[],
  ) => Promise<void>;
  removeBooksFromCollection: (
    collectionId: string,
    libraryItemIds: string[],
  ) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["collections"]);
  const [data, setData] = useState<LocalCollection[]>([]);
  const [membership, setMembership] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const [collections, collectionItems] = await Promise.all([
        store.getCollections(),
        store.getCollectionItems(),
      ]);
      setData(
        sortCollections(
          collections.filter((collection) => !collection.removed),
        ),
      );
      setMembership(buildCollectionMembership(collectionItems));
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  const createCollection = useCallback(
    async (name: string) => {
      const now = nextSyncTimestamp();
      const collection: LocalCollection = {
        collectionId: makeLocalId(),
        name,
        createdAt: now,
        updatedAt: now,
      };
      await store.saveCollection(collection);
      emitMobileDataChanged("collections");
      await reload();
      return collection;
    },
    [reload, store],
  );

  const removeCollection = useCallback(
    async (collectionId: string) => {
      await store.removeCollection(collectionId);
      emitMobileDataChanged("collections");
      await reload();
    },
    [reload, store],
  );

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      const existing = data.find(
        (collection) => collection.collectionId === collectionId,
      );
      if (!existing) return null;

      const updated = buildRenamedCollection(
        existing,
        name,
        nextSyncTimestamp(existing.updatedAt),
      );
      if (!updated) return null;

      await store.saveCollection(updated);
      emitMobileDataChanged("collections");
      await reload();
      return updated;
    },
    [data, reload, store],
  );

  const addBooksToCollection = useCallback(
    async (collectionId: string, libraryItemIds: string[]) => {
      await store.addCollectionItems(collectionId, [
        ...new Set(libraryItemIds),
      ]);
      emitMobileDataChanged("collections");
      await reload();
    },
    [reload, store],
  );

  const removeBooksFromCollection = useCallback(
    async (collectionId: string, libraryItemIds: string[]) => {
      await store.removeCollectionItems(collectionId, [
        ...new Set(libraryItemIds),
      ]);
      emitMobileDataChanged("collections");
      await reload();
    },
    [reload, store],
  );

  return {
    data,
    membership,
    loading,
    error,
    reload,
    createCollection,
    renameCollection,
    removeCollection,
    addBooksToCollection,
    removeBooksFromCollection,
  };
}

export function useSourceRegistries(): LoadState<SourceRegistry[]> {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["registries"]);
  const [data, setData] = useState<SourceRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const registries = await store.getRegistries();
      setData(registries);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  return { data, loading, error, reload };
}

export function useReadingMode(): {
  mode: ReadingMode;
  setMode: (mode: ReadingMode) => Promise<void>;
  scrollWidthPct: number;
  setScrollWidthPct: (value: number) => Promise<void>;
  twoPageMode: boolean;
  setTwoPageMode: (enabled: boolean) => Promise<void>;
  pagePairingMode: PagePairingMode;
  setPagePairingMode: (mode: PagePairingMode) => Promise<void>;
  processPageImages: boolean;
  setProcessPageImages: (enabled: boolean) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [mode, setModeState] = useState<ReadingMode>("rtl");
  const [scrollWidthPct, setScrollWidthPctState] = useState(
    DEFAULT_READER_SCROLL_WIDTH_PCT,
  );
  const [twoPageMode, setTwoPageModeState] = useState(
    DEFAULT_READER_TWO_PAGE_MODE,
  );
  const [pagePairingMode, setPagePairingModeState] = useState<PagePairingMode>(
    DEFAULT_READER_PAGE_PAIRING_MODE,
  );
  const [processPageImages, setProcessPageImagesState] = useState(
    DEFAULT_READER_PROCESS_PAGE_IMAGES,
  );
  const modeRun = useRef(0);
  const scrollWidthRun = useRef(0);
  const twoPageRun = useRef(0);
  const pagePairingRun = useRef(0);
  const pageImageProcessingRun = useRef(0);
  const savedMode = useRef<ReadingMode>("rtl");
  const savedScrollWidthPct = useRef(DEFAULT_READER_SCROLL_WIDTH_PCT);
  const savedTwoPageMode = useRef(DEFAULT_READER_TWO_PAGE_MODE);
  const savedPagePairingMode = useRef<PagePairingMode>(
    DEFAULT_READER_PAGE_PAIRING_MODE,
  );
  const savedProcessPageImages = useRef(DEFAULT_READER_PROCESS_PAGE_IMAGES);

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        const storedMode = settings.readingMode;
        if (
          storedMode === "rtl" ||
          storedMode === "ltr" ||
          storedMode === "scrolling"
        ) {
          setModeState(storedMode);
          savedMode.current = storedMode;
        }
        const nextScrollWidthPct = clampReaderScrollWidthPct(
          settings.readerScrollWidthPct,
        );
        setScrollWidthPctState(nextScrollWidthPct);
        savedScrollWidthPct.current = nextScrollWidthPct;
        const nextTwoPageMode = normalizeReaderTwoPageMode(
          settings.readerTwoPageMode,
        );
        setTwoPageModeState(nextTwoPageMode);
        savedTwoPageMode.current = nextTwoPageMode;
        const nextPagePairingMode = normalizeReaderPagePairingMode(
          settings.readerPagePairingMode,
        );
        setPagePairingModeState(nextPagePairingMode);
        savedPagePairingMode.current = nextPagePairingMode;
        const nextProcessPageImages = normalizeReaderProcessPageImages(
          settings.readerProcessPageImages,
        );
        setProcessPageImagesState(nextProcessPageImages);
        savedProcessPageImages.current = nextProcessPageImages;
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [revision, store]);

  const setMode = useCallback(
    async (nextMode: ReadingMode) => {
      if (nextMode === mode) return;
      const run = modeRun.current + 1;
      modeRun.current = run;
      setModeState(nextMode);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({ ...settings, readingMode: nextMode });
        savedMode.current = nextMode;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (modeRun.current === run) {
          setModeState(savedMode.current);
        }
        throw error;
      }
    },
    [mode, store],
  );

  const setScrollWidthPct = useCallback(
    async (value: number) => {
      const nextValue = clampReaderScrollWidthPct(value);
      if (nextValue === scrollWidthPct) return;
      const run = scrollWidthRun.current + 1;
      scrollWidthRun.current = run;
      setScrollWidthPctState(nextValue);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({
          ...settings,
          readerScrollWidthPct: nextValue,
        });
        savedScrollWidthPct.current = nextValue;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (scrollWidthRun.current === run) {
          setScrollWidthPctState(savedScrollWidthPct.current);
        }
        throw error;
      }
    },
    [scrollWidthPct, store],
  );

  const setTwoPageMode = useCallback(
    async (enabled: boolean) => {
      if (enabled === twoPageMode) return;
      const run = twoPageRun.current + 1;
      twoPageRun.current = run;
      setTwoPageModeState(enabled);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({ ...settings, readerTwoPageMode: enabled });
        savedTwoPageMode.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (twoPageRun.current === run) {
          setTwoPageModeState(savedTwoPageMode.current);
        }
        throw error;
      }
    },
    [store, twoPageMode],
  );

  const setPagePairingMode = useCallback(
    async (nextMode: PagePairingMode) => {
      if (nextMode === pagePairingMode) return;
      const run = pagePairingRun.current + 1;
      pagePairingRun.current = run;
      setPagePairingModeState(nextMode);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({
          ...settings,
          readerPagePairingMode: nextMode,
        });
        savedPagePairingMode.current = nextMode;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (pagePairingRun.current === run) {
          setPagePairingModeState(savedPagePairingMode.current);
        }
        throw error;
      }
    },
    [pagePairingMode, store],
  );

  const setProcessPageImages = useCallback(
    async (enabled: boolean) => {
      if (enabled === processPageImages) return;
      const run = pageImageProcessingRun.current + 1;
      pageImageProcessingRun.current = run;
      setProcessPageImagesState(enabled);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({
          ...settings,
          readerProcessPageImages: enabled,
        });
        savedProcessPageImages.current = enabled;
        emitMobileDataChanged("settings");
      } catch (error) {
        if (pageImageProcessingRun.current === run) {
          setProcessPageImagesState(savedProcessPageImages.current);
        }
        throw error;
      }
    },
    [processPageImages, store],
  );

  return {
    mode,
    setMode,
    scrollWidthPct,
    setScrollWidthPct,
    twoPageMode,
    setTwoPageMode,
    pagePairingMode,
    setPagePairingMode,
    processPageImages,
    setProcessPageImages,
  };
}

export function useMobileLanguageSettings(): {
  appLanguage: AppLanguage;
  metadataLanguagePreference: MetadataLanguagePreference;
  effectiveMetadataLanguage: AppLanguage;
  setAppLanguage: (language: AppLanguage) => Promise<void>;
  setMetadataLanguagePreference: (
    preference: MetadataLanguagePreference,
  ) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["settings"]);
  const [appLanguage, setAppLanguageState] =
    useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [metadataLanguagePreference, setMetadataLanguagePreferenceState] =
    useState<MetadataLanguagePreference>(DEFAULT_METADATA_LANGUAGE_PREFERENCE);

  useEffect(() => {
    let mounted = true;
    store
      .getSettings()
      .then((settings) => {
        if (!mounted) return;
        setAppLanguageState(normalizeAppLanguage(settings.appLanguage));
        setMetadataLanguagePreferenceState(
          normalizeMetadataLanguagePreference(
            settings.metadataLanguagePreference,
          ),
        );
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [revision, store]);

  const setAppLanguage = useCallback(
    async (language: AppLanguage) => {
      const nextLanguage = normalizeAppLanguage(language);
      if (nextLanguage === appLanguage) return;
      setAppLanguageState(nextLanguage);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({ ...settings, appLanguage: nextLanguage });
        emitMobileDataChanged("settings");
      } catch (error) {
        setAppLanguageState(appLanguage);
        throw error;
      }
    },
    [appLanguage, store],
  );

  const setMetadataLanguagePreference = useCallback(
    async (preference: MetadataLanguagePreference) => {
      const nextPreference = normalizeMetadataLanguagePreference(preference);
      if (nextPreference === metadataLanguagePreference) return;
      setMetadataLanguagePreferenceState(nextPreference);
      try {
        const settings = await store.getSettings();
        await store.saveSettings({
          ...settings,
          metadataLanguagePreference: nextPreference,
        });
        emitMobileDataChanged("settings");
      } catch (error) {
        setMetadataLanguagePreferenceState(metadataLanguagePreference);
        throw error;
      }
    },
    [metadataLanguagePreference, store],
  );

  return {
    appLanguage,
    metadataLanguagePreference,
    effectiveMetadataLanguage: getEffectiveMetadataLanguage(
      metadataLanguagePreference,
      appLanguage,
    ),
    setAppLanguage,
    setMetadataLanguagePreference,
  };
}

export function useMobileDataManagement(): {
  clearingMode: MobileDataClearMode | null;
  clearCache: () => Promise<void>;
  clearAllData: (options?: { clearCloud?: boolean }) => Promise<void>;
} {
  const store = useMobileDataStore();
  const [clearingMode, setClearingMode] = useState<MobileDataClearMode | null>(
    null,
  );

  const clearCache = useCallback(async () => {
    setClearingMode("cache");
    try {
      await clearCachedSourcePackages();
      await defaultMobileSourceSessionCache.clear();
      await clearMobileImageCache();
      await clearMobileJapaneseLearningTtsCache();
      await clearMobileDualReaderDhashCache();
      clearMobileSourceImageRequestCache();
      await store.clearPackageCacheReferences();
      emitMobileSettingsDataChanged({ sourceSettingsChanged: true });
    } finally {
      setClearingMode(null);
    }
  }, [store]);

  const clearAllData = useCallback(
    async (options?: { clearCloud?: boolean }) => {
      setClearingMode("all");
      try {
        await runWithMobileSyncSuspended(async () => {
          if (options?.clearCloud) {
            await clearMobileCloudData(store);
          }
          await clearCachedSourcePackages();
          await defaultMobileSourceSessionCache.clear();
          await clearMobileAidokuSandboxDataForProfile();
          await clearMobileImageCache();
          await clearMobileJapaneseLearningTtsCache();
          await clearMobileDualReaderDhashCache();
          clearMobileSourceImageRequestCache();
          await store.clearAllUserData();
          await finalizeMobileDataResetAuthProfile({
            isAuthenticated: () => mobileIsAuthenticatedRef.current,
            signOut: () => mobileAuthClient.signOut(),
            unregisterBackgroundSync: unregisterMobileBackgroundSyncAsync,
            clearRetainedProfile: clearRetainedMobileDataProfile,
          });
          emitMobileDataChanged("all");
        });
      } finally {
        setClearingMode(null);
      }
    },
    [store],
  );

  return { clearingMode, clearCache, clearAllData };
}

export function useMobileReaderPlugins(): LoadState<
  MobileReaderPluginState[]
> & {
  setPluginEnabled: (
    pluginId: MobileReaderPluginId,
    enabled: boolean,
  ) => Promise<void>;
  setPluginValue: (
    pluginId: MobileReaderPluginId,
    key: string,
    value: unknown,
  ) => Promise<void>;
  resetPluginValues: (pluginId: MobileReaderPluginId) => Promise<void>;
} {
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const revision = useMobileDataRevision(["settings"]);
  const [data, setData] = useState<MobileReaderPluginState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mutationRun = useRef(0);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const settings = await store.getSettings();
      setData(getMobileReaderPluginStates(settings, strings));
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store, strings]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload, revision]);

  const setPluginEnabled = useCallback(
    async (pluginId: MobileReaderPluginId, enabled: boolean) => {
      const run = mutationRun.current + 1;
      mutationRun.current = run;
      setError(null);
      setData((current) =>
        current.map((plugin) =>
          plugin.id === pluginId ? { ...plugin, enabled } : plugin,
        ),
      );
      try {
        const settings = await store.getSettings();
        const nextSettings = setMobileReaderPluginEnabled(
          settings,
          pluginId,
          enabled,
        );
        await store.saveSettings(nextSettings);
        emitMobileDataChanged("settings");
      } catch (nextError) {
        const message = errorMessage(nextError);
        await reload().catch(() => undefined);
        if (mutationRun.current === run) {
          setError(message);
        }
        throw nextError;
      }
    },
    [reload, store],
  );

  const setPluginValue = useCallback(
    async (pluginId: MobileReaderPluginId, key: string, value: unknown) => {
      const run = mutationRun.current + 1;
      mutationRun.current = run;
      setError(null);
      setData((current) =>
        current.map((plugin) =>
          plugin.id === pluginId
            ? { ...plugin, values: { ...plugin.values, [key]: value } }
            : plugin,
        ),
      );
      try {
        const settings = await store.getSettings();
        const nextSettings = setMobileReaderPluginValue(
          settings,
          pluginId,
          key,
          value,
        );
        await store.saveSettings(nextSettings);
        emitMobileDataChanged("settings");
      } catch (nextError) {
        const message = errorMessage(nextError);
        await reload().catch(() => undefined);
        if (mutationRun.current === run) {
          setError(message);
        }
        throw nextError;
      }
    },
    [reload, store],
  );

  const resetPluginValues = useCallback(
    async (pluginId: MobileReaderPluginId) => {
      const run = mutationRun.current + 1;
      mutationRun.current = run;
      setError(null);
      try {
        const settings = await store.getSettings();
        const nextSettings = resetMobileReaderPluginValues(settings, pluginId);
        await store.saveSettings(nextSettings);
        emitMobileDataChanged("settings");
        setData(getMobileReaderPluginStates(nextSettings, strings));
      } catch (nextError) {
        const message = errorMessage(nextError);
        await reload().catch(() => undefined);
        if (mutationRun.current === run) {
          setError(message);
        }
        throw nextError;
      }
    },
    [reload, store, strings],
  );

  return {
    data,
    loading,
    error,
    reload,
    setPluginEnabled,
    setPluginValue,
    resetPluginValues,
  };
}

export function useAvailableSources(): LoadState<MobileRegistrySource[]> & {
  sourceUpdateNotice: MobileSourceUpdateNotice | null;
} {
  const store = useMobileDataStore();
  const [data, setData] = useState<MobileRegistrySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceUpdateNotice, setSourceUpdateNotice] =
    useState<MobileSourceUpdateNotice | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSourceUpdateNotice(null);
      const sources = await fetchAllAidokuRegistrySources();
      await Promise.all(
        AIDOKU_REGISTRIES.map((registry) =>
          store.saveRegistry({
            id: registry.id,
            name: registry.name,
            type: "url" as const,
            url: registry.indexUrl,
          }),
        ),
      );
      emitMobileDataChanged("registries");
      const installedSources = await store.getInstalledSources();
      const updateSources = findMobileSourceUpdates(installedSources, sources);
      const updatedNames: string[] = [];
      for (const source of updateSources) {
        try {
          await saveMobileRegistrySourceInstall(store, source);
          updatedNames.push(source.name);
        } catch (nextError) {
          console.warn(
            `[MobileSources] Failed to update ${source.registryId}:${source.id}:`,
            nextError,
          );
        }
      }
      if (updatedNames.length > 0) {
        emitMobileDataChanged("settings");
        setSourceUpdateNotice({ id: Date.now(), names: updatedNames });
      } else {
        setSourceUpdateNotice(null);
      }
      setData(sources);
    } catch (nextError) {
      setError(errorMessage(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    ignoreReloadError(reload);
  }, [reload]);

  return { data, loading, error, reload, sourceUpdateNotice };
}

export function useSourceInstaller(): {
  installingKey: string | null;
  installSource: (source: MobileRegistrySource) => Promise<void>;
  uninstallSource: (source: MobileRegistrySource) => Promise<void>;
} {
  const store = useMobileDataStore();
  const [installingKey, setInstallingKey] = useState<string | null>(null);

  const installSource = useCallback(
    async (source: MobileRegistrySource) => {
      const key = makeSourceKey(source.registryId, source.id);
      const startedAt = markMobilePerformance("source.install.action.start", {
        key,
      });
      setInstallingKey(key);
      try {
        await runAfterMobileInteractions(() =>
          saveMobileRegistrySourceInstall(store, source),
        );
        emitMobileDataChanged("settings");
        measureMobilePerformance("source.install.action.complete", startedAt, {
          key,
        });
      } finally {
        setInstallingKey(null);
      }
    },
    [store],
  );

  const uninstallSource = useCallback(
    async (source: MobileRegistrySource) => {
      const key = makeSourceKey(source.registryId, source.id);
      const startedAt = markMobilePerformance("source.uninstall.action.start", {
        key,
      });
      setInstallingKey(key);
      try {
        await runAfterMobileInteractions(async () => {
          const installedSources = await store.getInstalledSources();
          const existing =
            findMobileInstalledSourceForRegistrySource(
              installedSources,
              source,
            ) ?? (await store.getInstalledSource(key));
          const removeId = existing?.id ?? key;
          await clearCachedSourcePackage(
            resolveMobileSourcePackageCacheKey(
              existing ? normalizeInstalledSource(existing) : null,
            ),
          );
          // Evict the live session too — an uninstalled source must not stay
          // runnable from the session cache until its idle TTL expires.
          defaultMobileSourceSessionCache.remove(
            existing
              ? makeMobileRuntimeSourceKey(normalizeInstalledSource(existing))
              : key,
          );
          await clearMobileAidokuSandboxDataForSource(
            existing
              ? makeMobileRuntimeSourceKey(normalizeInstalledSource(existing))
              : key,
          );
          clearMobileSourceImageRequestCache();
          await store.removeInstalledSource(
            removeId,
            existing?.registryId ?? source.registryId,
          );
          const settingsKeys = existing
            ? getMobileInstalledSourceSettingsKeys(existing)
            : [key];
          await Promise.all(
            settingsKeys.map((settingsKey) =>
              store.resetSourceSettings(settingsKey),
            ),
          );
        });
        emitMobileSettingsDataChanged({ sourceSettingsChanged: true });
        measureMobilePerformance(
          "source.uninstall.action.complete",
          startedAt,
          {
            key,
          },
        );
      } finally {
        setInstallingKey(null);
      }
    },
    [store],
  );

  return { installingKey, installSource, uninstallSource };
}
