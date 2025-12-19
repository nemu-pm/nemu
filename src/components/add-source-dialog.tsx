import { useState, useRef } from "react";
import { useSourcesStore, type SourceInfo } from "@/stores/sources";
import { Keys } from "@/data/keys";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CloudDownloadIcon,
  File02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

type Mode = "select" | "registry" | "custom";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSourceDialog({ open, onOpenChange }: AddSourceDialogProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [installing, setInstalling] = useState<string | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    // Reset mode after animation
    setTimeout(() => setMode("select"), 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Source</DialogTitle>
          <DialogDescription>
            {mode === "select" && "Choose how to add a manga source"}
            {mode === "registry" && "Select a source from available registries"}
            {mode === "custom" && "Upload a custom .aix source file"}
          </DialogDescription>
        </DialogHeader>

        {mode === "select" && <ModeSelection onSelectMode={setMode} />}

        {mode === "registry" && (
          <RegistrySourceList
            installing={installing}
            onInstall={setInstalling}
            onBack={() => setMode("select")}
            onDone={handleClose}
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
      </DialogContent>
    </Dialog>
  );
}

function ModeSelection({
  onSelectMode,
}: {
  onSelectMode: (mode: Mode) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        onClick={() => onSelectMode("registry")}
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:bg-muted"
      >
        <div className="rounded-full bg-primary/10 p-3">
          <HugeiconsIcon
            icon={CloudDownloadIcon}
            className="size-6 text-primary"
          />
        </div>
        <div>
          <p className="font-medium">From Registry</p>
          <p className="text-sm text-muted-foreground">
            Browse available sources
          </p>
        </div>
      </button>

      <button
        onClick={() => onSelectMode("custom")}
        className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center transition-colors hover:bg-muted"
      >
        <div className="rounded-full bg-primary/10 p-3">
          <HugeiconsIcon icon={File02Icon} className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-medium">Custom .aix File</p>
          <p className="text-sm text-muted-foreground">Upload your own source</p>
        </div>
      </button>
    </div>
  );
}

function RegistrySourceList({
  installing,
  onInstall,
  onBack,
  onDone,
}: {
  installing: string | null;
  onInstall: (id: string | null) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { availableSources, installSource } = useSourcesStore();

  // Group sources by registry
  const grouped = availableSources.reduce(
    (acc, source) => {
      const key = source.registryId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(source);
      return acc;
    },
    {} as Record<string, SourceInfo[]>
  );

  const handleInstall = async (registryId: string, sourceId: string) => {
    const key = Keys.source(registryId, sourceId);
    onInstall(key);
    try {
      await installSource(registryId, sourceId);
    } finally {
      onInstall(null);
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
                    onInstall={() => handleInstall(source.registryId, source.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between border-t pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onDone}>Done</Button>
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
          <p className="text-sm font-medium">{source.name}</p>
          <p className="text-xs text-muted-foreground">v{source.version}</p>
        </div>
      </div>

      {source.installed ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-4 text-green-500"
          />
          Installed
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? <Spinner className="size-4" /> : "Install"}
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
  const { installFromAix } = useSourcesStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".aix")) {
      setError("Please select a .aix file");
      return;
    }

    setError(null);
    onInstall("custom");

    try {
      await installFromAix(file);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install source");
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
          <p className="font-medium">Source installed successfully!</p>
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
              {installing ? "Installing..." : "Click to select .aix file"}
            </p>
            <p className="text-sm text-muted-foreground">
              Or drag and drop here
            </p>
          </div>
        </button>
      )}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-between border-t pt-4">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onDone}>{success ? "Done" : "Cancel"}</Button>
      </div>
    </div>
  );
}
