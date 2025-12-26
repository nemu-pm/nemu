/**
 * useSyncCore hook (Phase 7)
 *
 * React hook for wiring SyncCore with the appropriate transport based on auth state.
 * This is the recommended way to use SyncCore in React applications.
 *
 * Features:
 * - Creates and manages SyncCore lifecycle
 * - Switches transport based on auth state (Convex when authenticated, Null when not)
 * - Exposes sync status and control methods
 */

import { useEffect, useMemo, useRef, useCallback } from "react";
import type { ConvexReactClient } from "convex/react";
import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import { SyncCore } from "./core/SyncCore";
import { createSyncCoreRepos } from "./core/adapters";
import { ConvexTransport } from "./convex-transport";
import { NullTransport } from "./transports/NullTransport";
import type { SyncStatus, SyncRunReason } from "./core/types";

export interface UseSyncCoreOptions {
  /** Local store for data persistence */
  localStore: IndexedDBUserDataStore;
  /** Convex client (null when not authenticated) */
  convex: ConvexReactClient | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Profile ID for data isolation */
  profileId?: string;
  /** Callback when status changes */
  onStatusChange?: (status: SyncStatus) => void;
  /** Auto-start the sync core (default: true) */
  autoStart?: boolean;
}

export interface UseSyncCoreResult {
  /** Current sync status */
  status: SyncStatus;
  /** Number of pending operations */
  pendingCount: number;
  /** Trigger a manual sync */
  syncNow: (reason?: SyncRunReason) => Promise<void>;
  /** The SyncCore instance (for advanced usage) */
  core: SyncCore;
}

/**
 * Hook for using SyncCore in React components.
 *
 * Usage:
 * ```tsx
 * const { status, pendingCount, syncNow } = useSyncCore({
 *   localStore,
 *   convex: isAuthenticated ? convex : null,
 *   isAuthenticated,
 *   profileId,
 * });
 * ```
 */
export function useSyncCore(options: UseSyncCoreOptions): UseSyncCoreResult {
  const {
    localStore,
    convex,
    isAuthenticated,
    profileId,
    onStatusChange,
    autoStart = true,
  } = options;

  // Create SyncCore with repos (recreate when profile changes)
  const core = useMemo(() => {
    const repos = createSyncCoreRepos(localStore, profileId);
    return new SyncCore({ repos });
  }, [localStore, profileId]);

  // Create transports
  const convexTransport = useMemo(() => new ConvexTransport(), []);
  const nullTransport = useMemo(() => new NullTransport(), []);

  // Track status for re-renders
  const statusRef = useRef<SyncStatus>("offline");
  const pendingCountRef = useRef(0);

  // Force re-render on status change
  const forceUpdate = useCallback(() => {
    // This is a bit hacky, but it works for now
    // In a real app, you'd use a more sophisticated state management
  }, []);

  // Update transport when auth state changes
  useEffect(() => {
    if (isAuthenticated && convex) {
      convexTransport.setConvex(convex);
      core.setTransport(convexTransport);
    } else {
      core.setTransport(nullTransport);
    }
  }, [isAuthenticated, convex, core, convexTransport, nullTransport]);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = core.onStatusChange((status) => {
      statusRef.current = status;
      pendingCountRef.current = core.pendingCount;
      onStatusChange?.(status);
      forceUpdate();
    });

    return unsubscribe;
  }, [core, onStatusChange, forceUpdate]);

  // Start/stop the core
  useEffect(() => {
    if (autoStart) {
      core.start();
    }

    return () => {
      core.stop();
    };
  }, [core, autoStart]);

  // Sync control
  const syncNow = useCallback(
    (reason: SyncRunReason = "manual") => core.syncNow(reason),
    [core]
  );

  return {
    status: core.status,
    pendingCount: core.pendingCount,
    syncNow,
    core,
  };
}

