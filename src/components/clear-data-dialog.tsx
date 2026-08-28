import { useState } from "react";
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
} from "@/sync/services";
import { clearAllObjectStores } from "@/data/device-data-clear";
import { startDeviceDataWipe } from "@/data/device-data-wipe";
import { readPendingDeviceDataWipe } from "@/data/device-data-wipe-journal";
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
        // Clear store contents in place; deleting the database can remain
        // blocked indefinitely by another tab and is not needed for success.
        await clearAllObjectStores("nemu-cache");
        location.reload();
        return;
      }

      // Clear cloud first if requested (before we nuke local auth state)
      if (clearCloud && isAuthenticated) {
        await clearCloudData(localStore);
      }

      const result = await startDeviceDataWipe({
        activeStore: localStore,
        initiatingProfileId: isAuthenticated
          ? localStore.profileId || undefined
          : undefined,
        // A previously interrupted operation may still need durable remote
        // confirmation even after the auth hooks have observed signed-out
        // state, so keep the idempotent callback available on every retry.
        confirmRemoteSignOut: async () => {
          const result = await authClient.signOut();
          if (result.error) throw result.error;
        },
      });
      if (result.status !== "completed") {
        throw new Error("Device-data cleanup still requires remote confirmation.");
      }
      location.reload();
    } catch (e) {
      console.error("Failed to clear data:", e);
      toast.error(t("clearData.failed"));
      // Once remote sign-out is durably confirmed, keep sync stopped until the
      // guarded recovery finishes. Before that boundary, the original session
      // and profile remain valid and normal sync may safely resume.
      let remoteSignOutConfirmed = false;
      try {
        remoteSignOutConfirmed =
          readPendingDeviceDataWipe()?.remoteSignOutConfirmed === true;
      } catch {
        // Unreadable recovery state fails closed.
        remoteSignOutConfirmed = true;
      }
      if (!remoteSignOutConfirmed) setSyncSubscriptionsStopped(false);
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
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
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
