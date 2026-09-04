// First-sync progress toast.
//
// Renders nothing itself: it subscribes to the mobileSyncProgress external
// store (written by ConfiguredMobileSyncBridge, which lives above the toast
// provider in the tree) and translates its transitions into toast updates.
// One stable toast id means progress updates replace the visible toast
// instead of stacking.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useConvexAuth } from "convex/react";
import { useMobileToast } from "@/components/MobileToastContext";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import {
  getMobileSyncProgress,
  subscribeMobileSyncProgress,
} from "@/sync/mobileSyncProgress";
import {
  formatMobileSyncProgressCompleted,
  getMobileStrings,
} from "@/lib/mobileI18n";
import { useMobileLanguageSettings } from "@/data/mobileHooks";

const MOBILE_SYNC_PROGRESS_TOAST_ID = "mobile-sync-progress";

/**
 * The toast host shows one toast at a time, so a sticky progress toast holds
 * the only slot in the app for as long as it is visible. A first sync that
 * never reports a domain (a cloud query that never resolves, an apply the
 * account-alignment guard keeps skipping) would hold it forever and mute
 * every other toast, so the sticky state always expires. The Settings
 * cloud-sync card keeps showing the durable state after that.
 */
const MOBILE_SYNC_PROGRESS_STICKY_MAX_MS = 60_000;

function MobileConfiguredSyncProgressToast() {
  const toast = useMobileToast();
  const progress = useSyncExternalStore(
    subscribeMobileSyncProgress,
    getMobileSyncProgress,
    getMobileSyncProgress,
  );
  const { data: session } = mobileAuthClient.useSession();
  const { isAuthenticated: convexAuthenticated, isLoading: convexAuthLoading } =
    useConvexAuth();
  const { appLanguage } = useMobileLanguageSettings();
  const allStrings = getMobileStrings(appLanguage);
  const strings = allStrings.settings;
  const lastToastKeyRef = useRef<string | null>(null);
  const [expiredRunId, setExpiredRunId] = useState<number | null>(null);

  const accountMatches =
    progress.accountUserId !== null &&
    session?.user?.id === progress.accountUserId;
  const runId = accountMatches ? progress.runId : null;
  const isSyncing = accountMatches && progress.status === "syncing";

  // Arm the sticky watchdog while the syncing state is the one on screen.
  // Keyed on the run id, so expiry is scoped to the run it timed out — a
  // later run (even for the same account) starts un-expired without needing
  // a reset here.
  useEffect(() => {
    if (!isSyncing || runId === null) return;
    const timer = setTimeout(
      () => setExpiredRunId(runId),
      MOBILE_SYNC_PROGRESS_STICKY_MAX_MS,
    );
    return () => clearTimeout(timer);
  }, [isSyncing, runId]);

  const stickyExpired = runId !== null && expiredRunId === runId;

  useEffect(() => {
    if (!accountMatches) {
      if (lastToastKeyRef.current !== null) {
        toast.dismiss(MOBILE_SYNC_PROGRESS_TOAST_ID);
        lastToastKeyRef.current = null;
      }
      return;
    }
    // A settled Better Auth session with dead Convex auth means the transport
    // is being re-armed (see mobileConvexAuth.tsx); say so instead of
    // presenting an indeterminate spinner through the outage.
    const stalled =
      progress.status === "syncing" &&
      !convexAuthLoading &&
      !convexAuthenticated;
    const toastKey = `${progress.status}:${stalled}:${stickyExpired}:${
      progress.libraryCount ?? ""
    }:${progress.sourceCount ?? ""}`;
    if (lastToastKeyRef.current === toastKey) return;
    lastToastKeyRef.current = toastKey;

    if (progress.status === "syncing") {
      if (stickyExpired) {
        toast.dismiss(MOBILE_SYNC_PROGRESS_TOAST_ID);
        return;
      }
      if (stalled) {
        toast.show({
          id: MOBILE_SYNC_PROGRESS_TOAST_ID,
          tone: "warning",
          title: strings.cloudSyncTransportStalled,
          detail: strings.cloudSyncTransportStalledDetail,
          duration: "sticky",
        });
      } else {
        toast.show({
          id: MOBILE_SYNC_PROGRESS_TOAST_ID,
          tone: "info",
          title: strings.syncProgressTitle,
          loading: true,
          duration: "sticky",
        });
      }
      return;
    }

    if (progress.status === "completed") {
      const libraryCount = progress.libraryCount ?? 0;
      const sourceCount = progress.sourceCount ?? 0;
      if (libraryCount === 0 && sourceCount === 0) {
        // Nothing arrived — "Synced 0 titles" is noise, not a result.
        toast.dismiss(MOBILE_SYNC_PROGRESS_TOAST_ID);
        return;
      }
      toast.show({
        id: MOBILE_SYNC_PROGRESS_TOAST_ID,
        tone: "success",
        title: formatMobileSyncProgressCompleted(
          libraryCount,
          sourceCount,
          allStrings,
        ),
        duration: "long",
      });
      return;
    }

    if (progress.status === "paused") {
      toast.show({
        id: MOBILE_SYNC_PROGRESS_TOAST_ID,
        tone: "warning",
        title: strings.cloudSyncPaused,
        detail: strings.cloudSyncPausedDetail,
        duration: "long",
      });
    }
  }, [
    accountMatches,
    allStrings,
    convexAuthenticated,
    convexAuthLoading,
    progress,
    stickyExpired,
    strings,
    toast,
  ]);

  useEffect(
    () => () => {
      toast.dismiss(MOBILE_SYNC_PROGRESS_TOAST_ID);
    },
    [toast],
  );

  return null;
}

export function MobileSyncProgressToast() {
  // useConvexAuth throws unless MobileSyncProvider mounted a Convex provider —
  // it renders bare children when sync is unconfigured (e.g. a build without
  // EXPO_PUBLIC_CONVEX_URL), and the app must still boot local-only.
  if (!mobileSyncConfig.configured) return null;
  return <MobileConfiguredSyncProgressToast />;
}
