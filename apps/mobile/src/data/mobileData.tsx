import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { MobileDataContext } from "./mobileDataContext";
import { MOBILE_DATABASE_NAME, migrateNativeDatabase } from "./nativeDatabase";
import { NativeUserDataStore } from "./nativeStore";
import { createMobileSyncDataStore } from "@/sync/mobileSyncDataStore";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import {
  getMobileDataProfileRuntimeScope,
  getMobileDataProfileSnapshot,
  loadMobileDataProfile,
  makeMobileProfileId,
  resolveMobileDataProfileSelection,
  retainMobileDataProfile,
  subscribeMobileDataProfile,
} from "./mobileDataProfile";
import {
  getActiveMobileSourceProfileScope,
  isMobileSourceProfileTransitionPending,
  transitionMobileSourceProfile,
} from "@/sources/mobileSourceProfileScope";
import {
  MOBILE_PERFORMANCE_MARKS,
  markMobilePerformance,
} from "@/lib/mobilePerformance";
// Registers the native Cookie/WebView auth-state reset before the first
// account-scoped provider transition. The base twin is a no-op in Bun/web.
import "@/sources/mobileSourceProfileNative";

function MobileSourceProfileBoundary({
  children,
  profileId,
}: {
  children: ReactNode;
  profileId: string | null;
}) {
  const desiredScope = getMobileDataProfileRuntimeScope(profileId);
  const [transitionState, setTransitionState] = useState<{
    readyScope: string | null;
    failedScope: string | null;
    error: Error | null;
  }>(() => ({
    readyScope:
      getActiveMobileSourceProfileScope() === desiredScope
        ? desiredScope
        : null,
    failedScope: null,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    if (
      getActiveMobileSourceProfileScope() === desiredScope &&
      !isMobileSourceProfileTransitionPending()
    ) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setTransitionState({
            readyScope: desiredScope,
            failedScope: null,
            error: null,
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    // Unmount the previous profile immediately; cleanup/native cookie reset
    // must finish before SQLite or any source-facing child mounts again.
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setTransitionState({ readyScope: null, failedScope: null, error: null });
      }
    });
    // Even when the current value already equals desiredScope, enqueue this
    // request behind an older pending transition. This closes rapid A -> B -> A
    // where B would otherwise publish after A had remounted.
    void transitionMobileSourceProfile(desiredScope)
      .then(() => {
        if (!cancelled) {
          setTransitionState({
            readyScope: desiredScope,
            failedScope: null,
            error: null,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTransitionState({
            readyScope: null,
            failedScope: desiredScope,
            error:
              error instanceof Error
                ? error
                : new Error("Failed to isolate the mobile source profile."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desiredScope]);

  if (
    transitionState.failedScope === desiredScope &&
    transitionState.error
  ) {
    throw transitionState.error;
  }
  if (
    transitionState.readyScope !== desiredScope ||
    getActiveMobileSourceProfileScope() !== desiredScope ||
    isMobileSourceProfileTransitionPending()
  ) {
    return null;
  }
  return children;
}

function MobileDataStoreProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const baseStore = useMemo(() => new NativeUserDataStore(db), [db]);
  const store = useMemo(() => createMobileSyncDataStore(baseStore), [baseStore]);
  const databaseMarkedRef = useRef(false);

  useEffect(() => {
    if (databaseMarkedRef.current) return;
    databaseMarkedRef.current = true;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootDatabaseReady);
  }, []);

  return (
    <MobileDataContext.Provider value={{ store }}>
      {children}
    </MobileDataContext.Provider>
  );
}

function MobileSQLiteDataProvider({
  children,
  databaseName,
}: {
  children: ReactNode;
  databaseName: string;
}) {
  return (
    <SQLiteProvider
      key={databaseName}
      databaseName={databaseName}
      onInit={migrateNativeDatabase}
    >
      <MobileDataStoreProvider>{children}</MobileDataStoreProvider>
    </SQLiteProvider>
  );
}

function ProfiledMobileDataProvider({ children }: { children: ReactNode }) {
  const { data: session } = mobileAuthClient.useSession();
  const profileState = useSyncExternalStore(
    subscribeMobileDataProfile,
    getMobileDataProfileSnapshot,
    getMobileDataProfileSnapshot,
  );
  const sessionProfileId = makeMobileProfileId(session?.user?.id);
  const [profilePersistenceError, setProfilePersistenceError] = useState<{
    profileId: string;
    error: Error;
  } | null>(null);
  const [profileLoadError, setProfileLoadError] = useState<Error | null>(null);
  const [profileRequestProfileId, setProfileRequestProfileId] = useState(
    sessionProfileId,
  );
  const lastMarkedProfileRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadMobileDataProfile()
      .then(() => {
        if (!cancelled) setProfileLoadError(null);
      })
      .catch((error) => {
        console.error("[MobileData] Failed to load the active data profile:", error);
        if (!cancelled) {
          setProfileLoadError(
            error instanceof Error
              ? error
              : new Error("Failed to load the active mobile data profile."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Defer the reset so React never observes an old error as belonging to a
    // newly-started attempt for the same profile after an A -> B -> A switch.
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setProfilePersistenceError(null);
        setProfileRequestProfileId(sessionProfileId);
      }
    });
    if (!sessionProfileId) return () => {
      cancelled = true;
    };

    void retainMobileDataProfile(sessionProfileId)
      .then(() => {
        if (!cancelled) {
          setProfileLoadError(null);
          setProfilePersistenceError(null);
        }
      })
      .catch((error) => {
        console.error("[MobileData] Failed to retain the active data profile:", error);
        if (!cancelled) {
          setProfilePersistenceError({
            profileId: sessionProfileId,
            error:
              error instanceof Error
                ? error
                : new Error("Failed to persist the active mobile data profile."),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionProfileId]);

  const selection = resolveMobileDataProfileSelection(
    profileState,
    sessionProfileId,
  );
  const selectedProfileId = selection?.profileId;
  const hasSelection = selection != null;

  useEffect(() => {
    if (
      !profileState.loaded ||
      !hasSelection ||
      lastMarkedProfileRef.current === selectedProfileId
    ) {
      return;
    }
    lastMarkedProfileRef.current = selectedProfileId;
    markMobilePerformance(MOBILE_PERFORMANCE_MARKS.bootProfileReady, {
      profile: selectedProfileId ? "authenticated" : "anonymous",
    });
  }, [hasSelection, profileState.loaded, selectedProfileId]);

  if (profileLoadError) throw profileLoadError;
  if (!profileState.loaded) return null;
  if (
    profilePersistenceError?.profileId === sessionProfileId &&
    profileRequestProfileId === sessionProfileId
  ) {
    throw profilePersistenceError.error;
  }
  // This opens durable local state without waiting for a network session, but
  // still returns null when auth resolves to an account that has not yet been
  // durably retained.
  if (!selection) return null;
  return (
    <MobileSourceProfileBoundary profileId={selection.profileId}>
      <MobileSQLiteDataProvider databaseName={selection.databaseName}>
        {children}
      </MobileSQLiteDataProvider>
    </MobileSourceProfileBoundary>
  );
}

export function MobileDataProvider({ children }: { children: ReactNode }) {
  if (!mobileSyncConfig.configured) {
    return (
      <MobileSourceProfileBoundary profileId={null}>
        <MobileSQLiteDataProvider databaseName={MOBILE_DATABASE_NAME}>
          {children}
        </MobileSQLiteDataProvider>
      </MobileSourceProfileBoundary>
    );
  }
  return <ProfiledMobileDataProvider>{children}</ProfiledMobileDataProvider>;
}
