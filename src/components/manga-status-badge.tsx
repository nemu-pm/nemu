import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MangaStatus } from "@/lib/sources/types";

interface MangaStatusBadgeProps {
  status: number | undefined;
  className?: string;
}

const statusConfig = {
  [MangaStatus.Ongoing]: {
    labelKey: "status.ongoing",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-600/40 dark:bg-emerald-500/15",
    textColor: "text-white dark:text-emerald-300",
    borderColor: "border-emerald-500/30 dark:border-emerald-400/20",
    glowColor: "shadow-emerald-500/25",
    pulse: true,
  },
  [MangaStatus.Completed]: {
    labelKey: "status.completed",
    dotColor: "bg-sky-500",
    bgColor: "bg-sky-600/40 dark:bg-sky-500/15",
    textColor: "text-white dark:text-sky-300",
    borderColor: "border-sky-500/30 dark:border-sky-400/20",
    glowColor: "shadow-sky-500/25",
    pulse: false,
  },
  [MangaStatus.Hiatus]: {
    labelKey: "status.hiatus",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-600/40 dark:bg-amber-500/15",
    textColor: "text-white dark:text-amber-300",
    borderColor: "border-amber-500/30 dark:border-amber-400/20",
    glowColor: "shadow-amber-500/25",
    pulse: false,
  },
  [MangaStatus.Cancelled]: {
    labelKey: "status.cancelled",
    dotColor: "bg-rose-500",
    bgColor: "bg-rose-600/40 dark:bg-rose-500/15",
    textColor: "text-white dark:text-rose-300",
    borderColor: "border-rose-500/30 dark:border-rose-400/20",
    glowColor: "shadow-rose-500/25",
    pulse: false,
  },
} as const;

export function MangaStatusBadge({ status, className }: MangaStatusBadgeProps) {
  const { t } = useTranslation();

  if (status === undefined || status === MangaStatus.Unknown) {
    return null;
  }

  const config = statusConfig[status as keyof typeof statusConfig];
  if (!config) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        "backdrop-blur-sm shadow-sm",
        config.bgColor,
        config.borderColor,
        config.textColor,
        className
      )}
    >
      {/* Status indicator dot */}
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              config.dotColor
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            config.dotColor,
            config.pulse && ["shadow-lg", config.glowColor]
          )}
        />
      </span>
      
      {/* Status label */}
      <span className="text-xs font-semibold tracking-wide uppercase">
        {t(config.labelKey)}
      </span>
    </div>
  );
}

