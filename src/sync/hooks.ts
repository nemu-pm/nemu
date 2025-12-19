import { useContext } from "react";
import { SyncContext } from "./context";
import type { DataServices, StoreHooks } from "./types";

export function useSyncContext() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSyncContext must be used within SyncProvider");
  }
  return ctx;
}

export function useDataServices(): DataServices {
  return useSyncContext().services;
}

export function useStores(): StoreHooks {
  return useSyncContext().stores;
}

export function useAuth() {
  const { isAuthenticated, isLoading } = useSyncContext();
  return { isAuthenticated, isLoading };
}

