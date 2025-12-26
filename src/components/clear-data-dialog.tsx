import { useMemo, useState } from "react";
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
import { useAuth, useDataServices } from "@/data/context";
import { api } from "../../convex/_generated/api";

interface ClearDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "cache" | "all";
}

export function ClearDataDialog({ open, onOpenChange, mode }: ClearDataDialogProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { localStore } = useDataServices();
  const [clearCloud, setClearCloud] = useState(false);
  const [loading, setLoading] = useState(false);
  const clearCloudData = useMutation(api.library.clearAll);

  const profileId = localStore?.profileId ?? "";
  const knownDbNames = useMemo(() => {
    // Minimal set to cover the most important DBs even when indexedDB.databases() isn't available.
    const names = new Set<string>();
    names.add("nemu-cache");
    if (localStore?.dbName) names.add(localStore.dbName);
    names.add(profileId ? `nemu-sync::${profileId}` : "nemu-sync");
    return names;
  }, [localStore?.dbName, profileId]);

  const handleOpenChange = (newOpen: boolean) => {
    // Prevent closing while loading
    if (loading) return;
    if (!newOpen) {
      setClearCloud(false);
    }
    onOpenChange(newOpen);
  };

  const clearAllObjectStores = async (dbName: string): Promise<void> => {
    // Open without version to avoid versionchange blocked issues; abort creation if DB doesn't exist.
    await new Promise<void>((resolve, reject) => {
      let sawCreateAttempt = false;
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(dbName);
      } catch (e) {
        reject(e);
        return;
      }

      request.onupgradeneeded = (event) => {
        // DB didn't exist; abort so we don't create a brand-new empty DB just to clear it.
        sawCreateAttempt = true;
        try {
          (event.target as IDBOpenDBRequest).transaction?.abort();
        } catch {
          // ignore
        }
      };
      request.onerror = () => {
        // If we intentionally aborted a create attempt, treat as "nothing to clear".
        if (sawCreateAttempt) {
          resolve();
          return;
        }
        reject(request.error);
      };
      request.onsuccess = () => {
        const db = request.result;
        const storeNames = Array.from(db.objectStoreNames);
        if (storeNames.length === 0) {
          try { db.close(); } catch { /* ignore */ }
          resolve();
          return;
        }
        const tx = db.transaction(storeNames, "readwrite");
        tx.oncomplete = () => {
          try { db.close(); } catch { /* ignore */ }
          resolve();
        };
        tx.onerror = () => {
          try { db.close(); } catch { /* ignore */ }
          reject(tx.error);
        };
        for (const s of storeNames) {
          try {
            tx.objectStore(s).clear();
          } catch {
            // ignore (store may be in weird state)
          }
        }
      };
    });
  };

  const handleClear = async () => {
    setLoading(true);
    try {
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
        await clearCloudData();
      }

      // Clear IndexedDB data first to avoid partial-wipe states (e.g. clearing nemu-user but leaving nemu-sync),
      // which can strand sync cursors and make the app appear "synced" with an empty library.
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

      // Clear all object stores for every DB name we can discover.
      // This is much less likely to be "blocked" than deleteDatabase(), and prevents sync/user DB divergence.
      for (const name of dbNames) {
        try {
          await clearAllObjectStores(name);
        } catch {
          // ignore - we'll still clear other storage and reload
        }
      }

      // Clear all local data
      localStorage.clear();
      sessionStorage.clear();

      // Clear cookies
      document.cookie.split(";").forEach((c) => {
        document.cookie =
          c.trim().split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      });

      // Best-effort delete (may be blocked by other tabs/workers). Reload ensures in-memory state is reset.
      for (const name of dbNames) {
        try {
          indexedDB.deleteDatabase(name);
        } catch {
          // ignore
        }
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

