import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "convex/react";
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
import { useAuth } from "@/data/context";
import { api } from "../../convex/_generated/api";

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "cache" | "all";
}

export function ClearDataDialog({ open, onOpenChange, mode }: ClearDataDialogProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [clearCloud, setClearCloud] = useState(false);
  const [loading, setLoading] = useState(false);
  const clearCloudData = useMutation(api.library.clearAll);

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
      if (mode === "cache") {
        // Delete cache DB - reload immediately to kill workers holding connections
        indexedDB.deleteDatabase("nemu-cache");
        location.reload();
        return;
      }

      // Clear cloud first if requested (before we nuke local auth state)
      if (clearCloud && isAuthenticated) {
        await clearCloudData();
      }

      // Clear all local data
      localStorage.clear();
      sessionStorage.clear();

      // Clear cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie =
          c.trim().split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });

      // Delete all IndexedDB databases - reload will complete the deletion
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        indexedDB.deleteDatabase(db.name!);
      }

      location.reload();
    } catch (e) {
      console.error("Failed to clear data:", e);
      setLoading(false);
    }
  };

  const isCacheMode = mode === "cache";

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent showCloseButton={!loading}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{isCacheMode ? t("clearData.clearCache") : t("clearData.clearAll")}</ResponsiveDialogTitle>
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
              <Label htmlFor="clear-cloud" className="cursor-pointer font-medium">
                {t("clearData.alsoDeleteCloud")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("clearData.alsoDeleteCloudDescription")}
              </p>
            </div>
          </div>
        )}

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={handleClear} disabled={loading}>
            {loading ? t("clearData.clearing") : isCacheMode ? t("clearData.clearCache") : t("clearData.clearAll")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

