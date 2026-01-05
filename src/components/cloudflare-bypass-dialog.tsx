/**
 * Cloudflare Bypass Dialog
 * 
 * Shows UI for Cloudflare challenge bypass via Nemu Agent:
 * - Agent running: Show bypass progress
 * - Agent not running: Prompt to download agent
 */
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Loading03Icon, CheckmarkCircle02Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { setAgentCfProgressCallback } from "@/lib/agent";
import { useAgentStore } from "@/stores/agent";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogClose,
} from "@/components/ui/responsive-dialog";

// Agent download URL
const AGENT_DOWNLOAD_URL = "https://github.com/nemu-pm/nemu-agent/releases";

export type BypassStatus = 
  | "idle"
  | "opening"      // Opening bypass window
  | "waiting"      // Waiting for user to solve captcha
  | "success"      // Bypass successful
  | "failed";      // Bypass failed

interface CloudflareBypassState {
  open: boolean;
  status: BypassStatus;
  url: string | null;
  
  // Actions
  show: (url?: string) => void;
  hide: () => void;
  setStatus: (status: BypassStatus) => void;
}

export const useCloudflareBypassStore = create<CloudflareBypassState>((set) => ({
  open: false,
  status: "idle",
  url: null,
  
  show: (url) => set({ open: true, status: "idle", url: url ?? null }),
  hide: () => set({ open: false, status: "idle", url: null }),
  setStatus: (status) => set({ status }),
}));

export function CloudflareBypassDialog() {
  const { t } = useTranslation();
  const { open, status, hide } = useCloudflareBypassStore();
  
  const agentAvailable = useAgentStore((s) => s.status.available);
  
  // Listen for CF bypass progress from agent
  useEffect(() => {
    const { show, setStatus: updateStatus, hide: closeDialog } = useCloudflareBypassStore.getState();
    
    const handleProgress = (progressStatus: string, url: string) => {
      console.log('[CF Dialog] Progress update:', progressStatus, url);
      
      if (progressStatus === 'opening') {
        show(url);
        updateStatus('opening');
      } else if (progressStatus === 'waiting' || progressStatus === 'success' || progressStatus === 'failed') {
        updateStatus(progressStatus as BypassStatus);
        
        // Auto-close on success after a delay
        if (progressStatus === 'success') {
          setTimeout(() => closeDialog(), 1500);
        }
      }
    };
    
    setAgentCfProgressCallback(handleProgress);
    
    return () => {
      setAgentCfProgressCallback(null);
    };
  }, []);
  
  const handleInstallClick = useCallback(() => {
    window.open(AGENT_DOWNLOAD_URL, "_blank", "noopener");
  }, []);

  // Get title based on state
  const getTitle = () => {
    if (agentAvailable) {
      if (status === "success") return t("cloudflare.successTitle");
      if (status === "failed") return t("cloudflare.failedTitle");
      return t("cloudflare.bypassingTitle");
    }
    return t("cloudflare.installTitle");
  };

  // Get description based on state
  const getDescription = () => {
    if (agentAvailable) {
      if (status === "opening") return t("cloudflare.agentOpening");
      if (status === "waiting") return t("cloudflare.agentWaiting");
      if (status === "success") return t("cloudflare.statusSuccess");
      if (status === "failed") return t("cloudflare.statusFailed");
      return t("cloudflare.statusIdle");
    }
    return t("cloudflare.installDescription");
  };
  
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && hide()}>
      <ResponsiveDialogContent showCloseButton={false}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{getTitle()}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{getDescription()}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Content area with icon/progress */}
        {agentAvailable ? (
          <div className="space-y-2">
            <ProgressStep 
              done={status !== "idle"} 
              active={status === "opening"}
              label={t("cloudflare.agentStepOpening")}
            />
            <ProgressStep 
              done={status === "success" || status === "failed"} 
              active={status === "waiting"}
              label={t("cloudflare.stepWaiting")}
            />
            <ProgressStep 
              done={status === "success"} 
              active={false}
              failed={status === "failed"}
              label={status === "failed" ? t("cloudflare.stepFailed") : t("cloudflare.stepDone")}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <HugeiconsIcon icon={Alert02Icon} className="size-8 text-primary" />
            </div>
          </div>
        )}

        {/* Instruction when waiting for user verification */}
        {agentAvailable && status === "waiting" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-center text-sm font-medium text-amber-600 dark:text-amber-400">
              {t("cloudflare.waitingInstruction")}
            </p>
          </div>
        )}

        {/* Hint text for install */}
        {!agentAvailable && (
          <p className="text-center text-sm text-muted-foreground">
            {t("cloudflare.installHint")}
          </p>
        )}

        <ResponsiveDialogFooter>
          {agentAvailable ? (
            <ResponsiveDialogClose render={<Button variant="outline" />}>
              {status === "success" || status === "failed" ? t("common.close") : t("common.cancel")}
            </ResponsiveDialogClose>
          ) : (
            <>
              <ResponsiveDialogClose render={<Button variant="outline" />}>
                {t("common.cancel")}
              </ResponsiveDialogClose>
              <Button onClick={handleInstallClick}>
                {t("cloudflare.downloadAgent")}
              </Button>
            </>
          )}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

interface ProgressStepProps {
  done: boolean;
  active: boolean;
  failed?: boolean;
  label: string;
}

function ProgressStep({ done, active, failed, label }: ProgressStepProps) {
  return (
    <div className={`flex items-center gap-3 rounded-lg p-3 transition-colors ${
      active ? "bg-primary/5" : done ? "bg-muted/30" : "bg-transparent"
    }`}>
      <div className={`flex size-6 items-center justify-center rounded-full transition-colors ${
        failed ? "bg-red-500/10" :
        done ? "bg-green-500/10" : 
        active ? "bg-primary/10" : 
        "bg-muted"
      }`}>
        {failed ? (
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-red-500" />
        ) : done ? (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-green-500" />
        ) : active ? (
          <HugeiconsIcon icon={Loading03Icon} className="size-3.5 text-primary animate-spin" />
        ) : (
          <div className="size-2 rounded-full bg-muted-foreground/30" />
        )}
      </div>
      <span className={`text-sm ${
        failed ? "text-red-500" :
        done ? "text-muted-foreground" : 
        active ? "text-foreground font-medium" : 
        "text-muted-foreground/50"
      }`}>
        {label}
      </span>
    </div>
  );
}
