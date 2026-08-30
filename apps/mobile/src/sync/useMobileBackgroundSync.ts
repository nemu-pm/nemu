import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  registerMobileBackgroundSyncAsync,
  setMobileBackgroundSyncStore,
} from "./mobileBackgroundSync";
import { getMobileBackgroundRegistrationAction } from "./mobileBackgroundSyncLifecycle";

// Registers native background sync once the user is authenticated and
// the per-profile `MobileDataStore` is mounted, and unregisters on sign-out so
// a signed-out app doesn't burn OS scheduling budget trying to sync. Safe to
// mount anywhere inside `MobileSyncProvider` + `MobileDataProvider` (the root
// layout places it there). Registration is idempotent. An unauthenticated auth
// observation is intentionally a no-op because it is indistinguishable from an
// offline validation failure; explicit sign-out owns unregistration instead.
export function useMobileBackgroundSync(): void {
  const store = useMobileDataStore();
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    setMobileBackgroundSyncStore(store);
    return () => {
      setMobileBackgroundSyncStore(null);
    };
  }, [store]);

  useEffect(() => {
    const action = getMobileBackgroundRegistrationAction({
      isAuthenticated,
      isLoading,
    });
    if (action === "register") {
      void registerMobileBackgroundSyncAsync();
    }
  }, [isAuthenticated, isLoading]);
}
