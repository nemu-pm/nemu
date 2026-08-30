import { useEffect, useState } from "react";

export type MobileDataChangeScope =
  | "all"
  | "collections"
  | "library"
  | "progress"
  | "registries"
  | "settings"
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
}): void {
  emitMobileDataChanged("settings");
  if (options?.sourceSettingsChanged) {
    emitMobileDataChanged("sourceSettings");
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
