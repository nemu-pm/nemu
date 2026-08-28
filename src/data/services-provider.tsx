/* eslint-disable react-refresh/only-export-components -- the provider and its profile-scoped hooks intentionally share one private context */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { DataServices, StoreHooks } from "@/sync/types";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import {
  createServicesContainer,
  effectiveProfileIdRef,
  lastProfileIdRef,
  makeProfileId,
  retryPendingSignOutCleanups,
  type ProfileId,
  type ServicesContainer,
} from "@/sync/services";
import { resolvePendingSignOutCleanupRetryIdentity } from "@/sync/pending-signout-retry-identity";
import { safeErrorCategory } from "@/lib/error-diagnostic";

const LAST_PROFILE_ID_KEY = "nemu:last-profile-id";

type ServicesContextValue = {
  profileId: ProfileId;
  /**
   * Optional override for debugging or future "profile switcher" UI.
   * Pass null to revert back to auto-selected profile.
   */
  setProfileId: (profileId: ProfileId | null) => void;
  container: ServicesContainer;
};

const ServicesContext = createContext<ServicesContextValue | null>(null);

export function DataServicesProvider(props: { children: ReactNode }) {
  const { children } = props;
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [profileOverride, setProfileOverride] = useState<ProfileId | null>(
    null,
  );

  const sessionProfileId = makeProfileId(session?.user?.id);
  const autoProfileId =
    sessionProfileId ??
    (isAuthenticated || isLoading ? lastProfileIdRef.current : undefined);
  const profileId = profileOverride ?? autoProfileId;
  const pendingCleanupRetryIdentity = resolvePendingSignOutCleanupRetryIdentity(
    {
      convexLoading: isLoading,
      sessionPending,
      convexAuthenticated: isAuthenticated,
      sessionUserId: session?.user?.id,
    },
  );

  // A remote-confirmed sign-out may have crashed between server logout and
  // local profile removal. Resume only after both auth layers are settled and
  // agree. Passing an exact active user makes that user's old marker
  // self-cancel; signed-out or different-user markers safely resume cleanup.
  useEffect(() => {
    if (pendingCleanupRetryIdentity === null) return;
    void retryPendingSignOutCleanups(pendingCleanupRetryIdentity).catch(
      (error) => {
        console.error(
          "[sync] Pending sign-out recovery failed:",
          safeErrorCategory(error),
        );
      },
    );
  }, [pendingCleanupRetryIdentity]);

  // Keep global debug refs in sync (used by diagnostics / signOut helpers).
  useLayoutEffect(() => {
    effectiveProfileIdRef.current = autoProfileId;
  }, [autoProfileId]);

  // Persist last signed-in profile.
  useEffect(() => {
    if (!sessionProfileId) return;
    lastProfileIdRef.current = sessionProfileId;
    try {
      localStorage.setItem(LAST_PROFILE_ID_KEY, sessionProfileId);
    } catch {
      /* storage unavailable */
    }
  }, [sessionProfileId]);

  // Clear persisted profile on logout.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    lastProfileIdRef.current = undefined;
    try {
      localStorage.removeItem(LAST_PROFILE_ID_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [isAuthenticated, isLoading]);

  const container = useMemo(
    () => createServicesContainer(profileId),
    [profileId],
  );

  // NOTE: signing in must not touch the anonymous source-settings database.
  // Configuring source logins while signed out is a supported flow, and those
  // credentials belong to the anonymous profile: `migrateFromLocalStorage` only
  // runs there precisely so legacy unowned values are not leaked into the first
  // account that happens to sign in. Anonymous *user* data is likewise never
  // auto-merged into an account — it is offered through the explicit import
  // dialog (see `src/sync/import-offer.ts`). Signing in therefore starts a
  // fresh, empty per-account source-settings namespace and leaves the anonymous
  // one intact for the next signed-out session.

  // Dispose the previous container when profile changes (and on unmount).
  useEffect(() => {
    return () => {
      try {
        container.dispose();
      } catch {
        /* ignore */
      }
    };
  }, [container]);

  const setProfileId = useCallback((next: ProfileId | null) => {
    setProfileOverride(next);
  }, []);

  const value = useMemo<ServicesContextValue>(
    () => ({ profileId, setProfileId, container }),
    [profileId, setProfileId, container],
  );

  return (
    <ServicesContext.Provider value={value}>
      {children}
    </ServicesContext.Provider>
  );
}

function useServicesContext(): ServicesContextValue {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error(
      "DataServicesProvider missing (wrap app root with <DataServicesProvider />)",
    );
  }
  return ctx;
}

export function useSetProfileId(): (profileId: ProfileId) => void {
  const set = useServicesContext().setProfileId;
  return useCallback((profileId: ProfileId) => set(profileId), [set]);
}

export function useProfileId(): ProfileId {
  return useServicesContext().profileId;
}

export function useDataServices(): DataServices {
  const { container } = useServicesContext();
  return {
    localStore: container.localStore,
  };
}

export function useStores(): StoreHooks {
  return useServicesContext().container.stores;
}

// For internal code that needs getState()/setState() access (SyncSetup).
export function useProgressStoreApi() {
  return useServicesContext().container.useProgressStore;
}

export function useSourceSettingsStoreApi() {
  return useServicesContext().container.sourceSettingsStore;
}
