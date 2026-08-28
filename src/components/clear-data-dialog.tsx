import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth, useDataServices } from "@/data/context";
import {
  clearCloudData,
  setSyncSubscriptionsStopped,
  signOut,
} from "@/sync/services";
import {
  addPendingCleanupProfileDatabaseNames,
  clearAllObjectStores,
  clearAndRetireDeviceProfiles,
  getKnownDeviceDatabaseNames,
  getNonProfileDeviceDatabaseNames,
} from "@/data/device-data-clear";
import { clearLocalStoragePreservingProfileWriteFences } from "@/data/profile-write-fence";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "cache" | "all";
}

export function ClearDataDialog({
  open,
  onOpenChange,
  mode,
}: ClearDataDialogProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { localStore } = useDataServices();
  const [clearCloud, setClearCloud] = useState(false);
  const [loading, setLoading] = useState(false);

  const knownDbNames = useMemo(
    () => getKnownDeviceDatabaseNames(localStore),
    [localStore],
  );

  const handleOpenChange = (newOpen: boolean) => {
    // Prevent closing while loading
    if (loading) return;
    if (!newOpen) {
      setClearCloud(false);
    }
    onOpenChange(newOpen);
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      // Stop any active subscriptions before clearing storage
      setSyncSubscriptionsStopped(true);

      if (mode === "cache") {
        // Clear cache store contents first (more reliable than deleteDatabase when connections are open),
        // then best-effort delete the DB and reload to drop any workers holding connections.
        try {
          await clearAllObjectStores("nemu-cache");
        } catch {
          // ignore - cache is best-effort
        }
        try {
          indexedDB.deleteDatabase("nemu-cache");
        } catch {
          // ignore
        }
        location.reload();
        return;
      }

      // Clear cloud first if requested (before we nuke local auth state)
      if (clearCloud && isAuthenticated) {
        await clearCloudData(localStore);
      }

      // Capture every visible database before ending the remote session. The
      // provider can switch to the anonymous profile as soon as sign-out is
      // observed, but this destructive operation must retain its exact scope.
      const dbNames = new Set<string>(knownDbNames);
      if (typeof indexedDB.databases === "function") {
        try {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) dbNames.add(db.name);
          }
        } catch {
          // ignore and fall back to knownDbNames
        }
      }
      // Recovery markers can name a signed-out profile that browser database
      // enumeration did not return. Include those exact stores before the
      // security-state database containing the markers is removed.
      await addPendingCleanupProfileDatabaseNames(dbNames);

      // End the server session before erasing local auth and account state.
      // Otherwise an HttpOnly Better Auth cookie can immediately repopulate
      // data the user explicitly asked to remove from this device. Reuse the
      // durable remote-confirmed sign-out path so a crash or local storage
      // failure after server confirmation remains recoverable on startup.
      if (isAuthenticated) {
        await signOut(localStore, false, async () => {
          const result = await authClient.signOut();
          if (result.error) throw result.error;
        });
      }

      const retiredProfiles = await clearAndRetireDeviceProfiles(
        dbNames,
        localStore,
      );
      const nonProfileDbNames = getNonProfileDeviceDatabaseNames(
        dbNames,
        retiredProfiles,
      );

      // Profile databases were cleared under their cross-tab retirement
      // fences. Clear remaining app-owned databases (cache, plugins, security
      // recovery state, and any legacy database discovered by the browser).
      for (const name of nonProfileDbNames) {
        await clearAllObjectStores(name);
      }

      // Keep lifetime barriers so suspended tabs cannot write into a profile
      // that this tab just erased. Everything else is removed.
      clearLocalStoragePreservingProfileWriteFences();
      sessionStorage.clear();

      // Clear cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie =
          c.trim().split("=")[0] +
          "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });

      // Best-effort delete (may be blocked by other tabs/workers). Reload ensures in-memory state is reset.
      for (const name of nonProfileDbNames) {
        try {
          indexedDB.deleteDatabase(name);
        } catch {
          // ignore
        }
      }

      location.reload();
    } catch (e) {
      console.error("Failed to clear data:", e);
      toast.error(t("clearData.failed"));
      // The app remains mounted when a destructive operation fails. Restore
      // normal subscriptions instead of leaving this session permanently
      // offline until a full reload.
      setSyncSubscriptionsStopped(false);
      setLoading(false);
    }
  };

  const isCacheMode = mode === "cache";

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {isCacheMode ? t("clearData.clearCache") : t("clearData.clearAll")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {isCacheMode
              ? t("clearData.clearCacheDescription")
              : t("clearData.clearAllDescription")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {!isCacheMode && isAuthenticated && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
            <Checkbox
              id="clear-cloud"
              checked={clearCloud}
              onCheckedChange={(c) => setClearCloud(c === true)}
              className="mt-0.5"
            />
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="clear-cloud"
                className="cursor-pointer font-medium"
              >
                {t("clearData.alsoDeleteCloud")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("clearData.alsoDeleteCloudDescription")}
              </p>
            </div>
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleClear}
            disabled={loading}
          >
            {loading
              ? t("clearData.clearing")
              : isCacheMode
                ? t("clearData.clearCache")
                : t("clearData.clearAll")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
