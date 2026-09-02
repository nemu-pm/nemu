import { useEffect, useState } from "react";

export type MobileDataChangeScope =
  | "all"
  | "collections"
  | "library"
  | "progress"
  | "registries"
  | "settings"
  // The installed-source list. Deliberately separate from "settings": every
  // settings write used to wake installed-source consumers (and through them
  // screen load effects), so a reading-mode change reloaded the reader.
  | "sources"
  | "syncStatus"
  | "sourceSettings";

type MobileDataChangeListener = (scope: MobileDataChangeScope) => void;

const listeners = new Set<MobileDataChangeListener>();

export function emitMobileDataChanged(scope: MobileDataChangeScope): void {
  for (const listener of listeners) {
    listener(scope);
  }
}

export function emitMobileLibraryDataChanged(options?: {
  collectionsChanged?: boolean;
}): void {
  emitMobileDataChanged("library");
  if (options?.collectionsChanged) {
    emitMobileDataChanged("collections");
  }
}

export function emitMobileSettingsDataChanged(options?: {
  sourceSettingsChanged?: boolean;
  installedSourcesChanged?: boolean;
}): void {
  emitMobileDataChanged("settings");
  if (options?.sourceSettingsChanged) {
    emitMobileDataChanged("sourceSettings");
  }
  if (options?.installedSourcesChanged) {
    emitMobileDataChanged("sources");
  }
}

export function subscribeMobileDataChanges(listener: MobileDataChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function shouldReload(scope: MobileDataChangeScope, watchedScopes: MobileDataChangeScope[]): boolean {
  return scope === "all" || watchedScopes.includes("all") || watchedScopes.includes(scope);
}

export function useMobileDataRevision(watchedScopes: MobileDataChangeScope[]): number {
  const [revision, setRevision] = useState(0);
  const scopeKey = watchedScopes.join("|");

  useEffect(() => {
    const scopes = scopeKey.split("|") as MobileDataChangeScope[];
    return subscribeMobileDataChanges((scope) => {
      if (shouldReload(scope, scopes)) {
        setRevision((current) => current + 1);
      }
    });
  }, [scopeKey]);

  return revision;
}
