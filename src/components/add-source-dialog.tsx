import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStores } from "@/data/context";
import { type SourceInfo } from "@/stores/settings";
import { Keys } from "@/data/keys";
import { TACHIYOMI_LOCAL_REGISTRY_ID } from "@/lib/sources/tachiyomi/local-registry";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CloudDownloadIcon,
  File02Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { hapticPress } from "@/lib/haptics";

type Mode = "select" | "registry" | "custom" | "dev";

interface PendingInstall {
  source: SourceInfo;
  onConfirm: () => Promise<void>;
}

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSourceDialog({ open, onOpenChange }: AddSourceDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("select");
  const [installing, setInstalling] = useState<string | null>(null);
  const [pendingInstall, setPendingInstall] = useState<PendingInstall | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    // Reset mode after animation
    setTimeout(() => setMode("select"), 200);
  };

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={handleClose}>
        <ResponsiveDialogContent className="sm:max-w-lg" showCloseButton={false}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("addSource.title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {mode === "select" && t("addSource.selectMethod")}
              {mode === "registry" && t("addSource.fromRegistry")}
              {mode === "custom" && t("addSource.customFile")}
              {mode === "dev" && "Load locally built Tachiyomi extensions"}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          {mode === "select" && (
            <>
              <ModeSelection onSelectMode={setMode} />
              <ResponsiveDialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  {t("common.cancel")}
                </Button>
              </ResponsiveDialogFooter>
            </>
          )}

          {mode === "registry" && (
            <RegistrySourceList
              installing={installing}
              onInstall={setInstalling}
              onBack={() => setMode("select")}
              onDone={handleClose}
              onPendingInstall={setPendingInstall}
            />
          )}

          {mode === "custom" && (
            <CustomSourceUpload
              installing={installing !== null}
              onInstall={setInstalling}
              onBack={() => setMode("select")}
              onDone={handleClose}
            />
          )}

          {mode === "dev" && (
            <DevSourceList
              installing={installing}
              onInstall={setInstalling}
              onBack={() => setMode("select")}
              onDone={handleClose}
              onPendingInstall={setPendingInstall}
            />
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      
      <SourceWarningDialog
        source={pendingInstall?.source ?? null}
        onClose={() => setPendingInstall(null)}
        onConfirm={async () => {
          if (pendingInstall) {
            await pendingInstall.onConfirm();
            setPendingInstall(null);
          }
        }}
      />
    </>
  );
}

function SourceWarningDialog({
  source,
  onClose,
  onConfirm,
}: {
  source: SourceInfo | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);

  const handleConfirm = async () => {
    setInstalling(true);
    try {
      await onConfirm();
    } finally {
      setInstalling(false);
    }
  };

  const hasAuthentication = source?.hasAuthentication;
  const hasCloudflare = source?.hasCloudflare;

  return (
    <ResponsiveDialog open={!!source} onOpenChange={(open) => !open && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md" showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} className="size-5 text-amber-500" />
            {t("addSource.warningTitle")}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        
        <div className="space-y-3">
          {hasAuthentication && (
            <p className="text-sm text-muted-foreground">
              {t("addSource.warningAuthentication")}
            </p>
          )}
          {hasCloudflare && (
            <p className="text-sm text-muted-foreground">
              {t("addSource.warningCloudflare")}
            </p>
          )}
        </div>
        
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={installing}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={installing}>
            {installing ? <Spinner className="size-4" /> : t("addSource.installAnyway")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ModeSelection({
  onSelectMode,
}: {
  onSelectMode: (mode: Mode) => void;
}) {
  const { t } = useTranslation();
  const isDev = import.meta.env.DEV;
  
  return (
    <div className={cn("grid gap-3", isDev ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      <button
        onClick={() => {
          hapticPress()
          onSelectMode("registry")
        }}
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:bg-muted"
      >
        <div className="rounded-full bg-primary/10 p-3">
          <HugeiconsIcon
            icon={CloudDownloadIcon}
            className="size-6 text-primary"
          />
        </div>
        <div>
          <p className="font-medium">{t("addSource.fromRegistryTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("addSource.fromRegistryDescription")}
          </p>
        </div>
      </button>

      <div
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center opacity-50 cursor-not-allowed"
      >
        <div className="rounded-full bg-muted p-3">
          <HugeiconsIcon icon={File02Icon} className="size-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">{t("addSource.customTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("addSource.customComingSoon")}</p>
        </div>
      </div>

      {isDev && (
        <button
          onClick={() => {
            hapticPress()
            onSelectMode("dev")
          }}
          className="flex flex-col items-center gap-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-6 text-center transition-colors hover:bg-orange-500/10"
        >
          <div className="rounded-full bg-orange-500/10 p-3">
            <HugeiconsIcon icon={CodeIcon} className="size-6 text-orange-500" />
          </div>
          <div>
            <p className="font-medium">Dev Extensions</p>
            <p className="text-sm text-muted-foreground">
              Locally built Tachiyomi
            </p>
          </div>
        </button>
      )}
    </div>
  );
}

function RegistrySourceList({
  installing,
  onInstall,
  onBack,
  onDone,
  onPendingInstall,
}: {
  installing: string | null;
  onInstall: (id: string | null) => void;
  onBack: () => void;
  onDone: () => void;
  onPendingInstall: (pending: PendingInstall | null) => void;
}) {
  const { t } = useTranslation();
  const { useSettingsStore } = useStores();
  const { availableSources, installSource } = useSettingsStore();

  // Group sources by registry (exclude dev registry)
  const grouped = availableSources
    .filter(s => s.registryId !== TACHIYOMI_LOCAL_REGISTRY_ID)
    .reduce(
      (acc, source) => {
        const key = source.registryId;
        if (!acc[key]) acc[key] = [];
        acc[key].push(source);
        return acc;
      },
      {} as Record<string, SourceInfo[]>
    );

  // Sort sources within each registry by name
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => a.name.localeCompare(b.name));
  });

  const doInstall = async (registryId: string, sourceId: string) => {
    const key = Keys.source(registryId, sourceId);
    onInstall(key);
    try {
      await installSource(registryId, sourceId);
    } finally {
      onInstall(null);
    }
  };

  const handleInstall = (source: SourceInfo) => {
    // Show warning dialog if source has WebView or Cloudflare requirements
    if (source.hasAuthentication || source.hasCloudflare) {
      onPendingInstall({
        source,
        onConfirm: () => doInstall(source.registryId, source.id),
      });
    } else {
      doInstall(source.registryId, source.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-h-80 space-y-4 overflow-y-auto pr-2">
        {Object.entries(grouped).map(([registryId, sources]) => (
          <div key={registryId}>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
              {registryId.replace("aidoku-", "")}
            </p>
            <div className="space-y-1">
              {sources.map((source) => {
                const key = Keys.source(source.registryId, source.id);
                return (
                  <SourceItem
                    key={key}
                    source={source}
                    installing={installing === key}
                    onInstall={() => handleInstall(source)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button onClick={onDone}>{t("common.done")}</Button>
      </div>
    </div>
  );
}

function DevSourceList({
  installing,
  onInstall,
  onBack,
  onDone,
  onPendingInstall,
}: {
  installing: string | null;
  onInstall: (id: string | null) => void;
  onBack: () => void;
  onDone: () => void;
  onPendingInstall: (pending: PendingInstall | null) => void;
}) {
  const { t } = useTranslation();
  const { useSettingsStore } = useStores();
  const { availableSources, installSource } = useSettingsStore();

  // Filter to only show dev sources
  const devSources = availableSources.filter(
    s => s.registryId === TACHIYOMI_LOCAL_REGISTRY_ID
  );

  const doInstall = async (sourceId: string) => {
    const key = Keys.source(TACHIYOMI_LOCAL_REGISTRY_ID, sourceId);
    onInstall(key);
    try {
      await installSource(TACHIYOMI_LOCAL_REGISTRY_ID, sourceId);
    } finally {
      onInstall(null);
    }
  };

  const handleInstall = (source: SourceInfo) => {
    // Show warning dialog if source has WebView or Cloudflare requirements
    if (source.hasAuthentication || source.hasCloudflare) {
      onPendingInstall({
        source,
        onConfirm: () => doInstall(source.id),
      });
    } else {
      doInstall(source.id);
    }
  };

  return (
    <div className="space-y-4">
      {devSources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No dev extensions found.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Build an extension:
          </p>
          <pre className="mt-2 rounded bg-muted p-2 text-left text-xs">
{`# In tachiyomi-js repo:
bun scripts/scan-extensions.ts en/mangadex
cd compiler && ./gradlew devBuild -Pextension=en/mangadex`}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Then refresh this dialog.
          </p>
        </div>
      ) : (
        <div className="max-h-80 space-y-1 overflow-y-auto pr-2">
          {devSources.map((source) => {
            const key = Keys.source(source.registryId, source.id);
            return (
              <SourceItem
                key={key}
                source={source}
                installing={installing === key}
                onInstall={() => handleInstall(source)}
              />
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button onClick={onDone}>{t("common.done")}</Button>
      </div>
    </div>
  );
}

function SourceItem({
  source,
  installing,
  onInstall,
}: {
  source: SourceInfo;
  installing: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const hasWarnings = source.hasAuthentication || source.hasCloudflare;
  
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        source.installed && "bg-muted/50"
      )}
    >
      <div className="flex items-center gap-3">
        {source.icon ? (
          <img
            src={source.icon}
            alt=""
            className="size-8 rounded-md object-cover"
          />
        ) : (
          <div className="size-8 rounded-md bg-muted" />
        )}
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{source.name}</p>
            {hasWarnings && (
              <HugeiconsIcon icon={Alert02Icon} className="size-3.5 text-amber-500" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">v{source.version}</p>
        </div>
      </div>

      {source.installed ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-4 text-green-500"
          />
          {t("common.installed")}
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? <Spinner className="size-4" /> : t("common.install")}
        </Button>
      )}
    </div>
  );
}

function CustomSourceUpload({
  installing,
  onInstall,
  onBack,
  onDone,
}: {
  installing: boolean;
  onInstall: (id: string | null) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { useSettingsStore } = useStores();
  const { installFromAix } = useSettingsStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".aix")) {
      setError(t("addSource.invalidFile"));
      return;
    }

    setError(null);
    onInstall("custom");

    try {
      await installFromAix(file);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("addSource.installFailed"));
    } finally {
      onInstall(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".aix"
        onChange={handleFileChange}
        className="hidden"
      />

      {success ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-6 text-center">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-10 text-green-500"
          />
          <p className="font-medium">{t("addSource.installSuccess")}</p>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={installing}
          className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center transition-colors hover:bg-muted disabled:opacity-50"
        >
          {installing ? (
            <Spinner className="size-8" />
          ) : (
            <HugeiconsIcon
              icon={File02Icon}
              className="size-8 text-muted-foreground"
            />
          )}
          <div>
            <p className="font-medium">
              {installing ? t("addSource.installing") : t("addSource.selectFile")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("addSource.dragDropHint")}
            </p>
          </div>
        </button>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button onClick={onDone}>{success ? t("common.done") : t("common.cancel")}</Button>
      </div>
    </div>
  );
}
