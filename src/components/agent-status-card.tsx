import { ExternalLink, RefreshCcw, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AGENT_DOWNLOAD_URL } from "@/config";
import { hapticPress } from "@/lib/haptics";
import { useAgentStore } from "@/stores/agent";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AgentStatusCard() {
  const { t } = useTranslation();
  const { status, checking, checkStatus } = useAgentStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-5" aria-hidden="true" />
          {t("settings.agent")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <span
              aria-hidden="true"
              className={`mt-2 size-2.5 shrink-0 rounded-full sm:mt-0 ${
                status.available ? "bg-green-500" : "bg-muted-foreground/40"
              }`}
            />
            <div className="min-w-0" aria-live="polite" aria-atomic="true">
              <p className="font-medium">
                {status.available
                  ? t("settings.agentConnected")
                  : t("settings.agentNotRunning")}
                {status.available && status.version && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {t("settings.agentVersion", { version: status.version })}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("settings.agentDescription")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            {!status.available && (
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={AGENT_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={hapticPress}
              >
                {t("settings.agentDownload")}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void checkStatus()}
              disabled={checking}
              aria-label={t("settings.agentRefresh")}
              title={t("settings.agentRefresh")}
              aria-busy={checking}
            >
              <RefreshCcw
                className={`size-4 ${checking ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
