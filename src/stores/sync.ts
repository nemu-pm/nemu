import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { SyncStatus } from "@/sync/types";

type OAuthProvider = "google" | "apple";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface SyncState {
  // Sync status
  syncStatus: SyncStatus;
  pendingCount: number;

  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;

  // User info
  user: User | null;
  oauthProvider: OAuthProvider | null;

  // Actions
  setSyncStatus: (status: SyncStatus) => void;
  setPendingCount: (count: number) => void;
  setAuthState: (isAuthenticated: boolean, isLoading: boolean) => void;
  setUser: (user: User | null) => void;
  setOAuthProvider: (provider: OAuthProvider | null) => void;
  reset: () => void;
}

export type SyncStore = UseBoundStore<StoreApi<SyncState>>;

export function createSyncStore(): SyncStore {
  return create<SyncState>((set) => ({
    syncStatus: "offline",
    pendingCount: 0,
    isAuthenticated: false,
    isLoading: true,
    user: null,
    oauthProvider: null,

    setSyncStatus: (status) => set({ syncStatus: status }),
    setPendingCount: (count) => set({ pendingCount: count }),
    setAuthState: (isAuthenticated, isLoading) =>
      set({ isAuthenticated, isLoading }),
    setUser: (user) => set({ user }),
    setOAuthProvider: (provider) => set({ oauthProvider: provider }),
    reset: () =>
      set({
        syncStatus: "offline",
        pendingCount: 0,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        oauthProvider: null,
      }),
  }));
}

// Singleton
let _store: SyncStore | null = null;

export function getSyncStore(): SyncStore {
  if (!_store) {
    _store = createSyncStore();
  }
  return _store;
}

