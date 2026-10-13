import { useCallback, useEffect, useState } from "react";
import { useMobileDataStore } from "./mobileDataContext";
import { emitMobileDataChanged, useMobileDataRevision } from "./mobileDataEvents";
import {
  addMobileSourceDirectory,
  isMobileSourceAutoUpdateEnabled,
  loadMobileSourceDirectories,
  removeMobileSourceDirectory,
  setMobileSourceDirectoryEnabled,
  type SourceDirectory,
} from "./mobileSourceDirectories";

/**
 * Directory list + actions for whichever screen ends up hosting directory
 * management. Every mutation emits the `registries` change, which makes
 * `useAvailableSources` reload the catalog from the new list.
 */
export function useMobileSourceDirectories(): {
  directories: SourceDirectory[];
  loading: boolean;
  autoUpdateSources: boolean;
  addDirectory: (url: string, name?: string) => Promise<SourceDirectory>;
  removeDirectory: (id: string) => Promise<void>;
  setDirectoryEnabled: (id: string, enabled: boolean) => Promise<void>;
  setAutoUpdateSources: (enabled: boolean) => Promise<void>;
} {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["registries", "settings"]);
  const [directories, setDirectories] = useState<SourceDirectory[]>([]);
  const [autoUpdateSources, setAutoUpdate] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [next, settings] = await Promise.all([
          loadMobileSourceDirectories(store),
          store.getSettings(),
        ]);
        if (cancelled) return;
        setDirectories(next);
        setAutoUpdate(isMobileSourceAutoUpdateEnabled(settings));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, revision]);

  const addDirectory = useCallback(
    async (url: string, name?: string) => {
      const directory = await addMobileSourceDirectory(store, { url, name });
      emitMobileDataChanged("registries");
      return directory;
    },
    [store],
  );
  const removeDirectory = useCallback(
    async (id: string) => {
      await removeMobileSourceDirectory(store, id);
      emitMobileDataChanged("registries");
    },
    [store],
  );
  const setDirectoryEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      await setMobileSourceDirectoryEnabled(store, id, enabled);
      emitMobileDataChanged("registries");
    },
    [store],
  );
  const setAutoUpdateSources = useCallback(
    async (enabled: boolean) => {
      await store.updateSettings((current) => ({
        ...current,
        autoUpdateSources: enabled,
      }));
      emitMobileDataChanged("settings");
    },
    [store],
  );

  return {
    directories,
    loading,
    autoUpdateSources,
    addDirectory,
    removeDirectory,
    setDirectoryEnabled,
    setAutoUpdateSources,
  };
}
