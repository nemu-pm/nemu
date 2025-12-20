import { useContext } from "react";
import { SyncContext } from "./context";
import type { DataServices, StoreHooks, SyncContextValue } from "./types";

export function useSyncContext(): SyncContextValue {
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

export function useSyncStatus() {
  const { syncStatus, pendingCount, isAuthenticated } = useSyncContext();
  return {
    status: syncStatus,
    pendingCount,
    isOnline: syncStatus !== "offline",
    isSyncing: syncStatus === "syncing",
    isSynced: syncStatus === "synced",
    isPending: syncStatus === "pending",
    isAuthenticated,
  };
}

export function useSignOut() {
  const { signOut } = useSyncContext();
  return signOut;
}
