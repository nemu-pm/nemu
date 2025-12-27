import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DataServices, StoreHooks } from "@/sync/types";
import { useConvexAuth } from "convex/react";
import { authClient } from "@/lib/auth-client";
import {
  createServicesContainer,
  effectiveProfileIdRef,
  lastProfileIdRef,
  makeProfileId,
  type ProfileId,
  type ServicesContainer,
} from "@/sync/services";

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
  const { data: session } = authClient.useSession();
  const [profileOverride, setProfileOverride] = useState<ProfileId | null>(null);

  const sessionProfileId = makeProfileId(session?.user?.id);
  const autoProfileId =
    sessionProfileId ?? ((isAuthenticated || isLoading) ? lastProfileIdRef.current : undefined);
  const profileId = profileOverride ?? autoProfileId;

  // Keep global debug refs in sync (used by diagnostics / signOut helpers).
  useEffect(() => {
    effectiveProfileIdRef.current = autoProfileId;
  }, [autoProfileId]);

  // Persist last signed-in profile.
  useEffect(() => {
    if (!sessionProfileId) return;
    lastProfileIdRef.current = sessionProfileId;
    try { localStorage.setItem(LAST_PROFILE_ID_KEY, sessionProfileId); } catch {}
  }, [sessionProfileId]);

  // Clear persisted profile on logout.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    lastProfileIdRef.current = undefined;
    try { localStorage.removeItem(LAST_PROFILE_ID_KEY); } catch {}
  }, [isAuthenticated, isLoading]);

  const container = useMemo(() => createServicesContainer(profileId), [profileId]);

  // Dispose the previous container when profile changes (and on unmount).
  useEffect(() => {
    return () => {
      try { container.dispose(); } catch { /* ignore */ }
    };
  }, [container]);

  const setProfileId = useCallback((next: ProfileId | null) => {
    setProfileOverride(next);
  }, []);

  const value = useMemo<ServicesContextValue>(
    () => ({ profileId, setProfileId, container }),
    [profileId, setProfileId, container]
  );

  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

function useServicesContext(): ServicesContextValue {
  const ctx = useContext(ServicesContext);
  if (!ctx) {
    throw new Error("DataServicesProvider missing (wrap app root with <DataServicesProvider />)");
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


