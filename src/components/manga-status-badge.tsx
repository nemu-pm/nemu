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
    dotColor: "bg-emerald-400",
    bgColor: "bg-emerald-500/10 dark:bg-emerald-500/15",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-500/20 dark:border-emerald-400/20",
    glowColor: "shadow-emerald-500/25",
    pulse: true,
  },
  [MangaStatus.Completed]: {
    labelKey: "status.completed",
    dotColor: "bg-sky-400",
    bgColor: "bg-sky-500/10 dark:bg-sky-500/15",
    textColor: "text-sky-700 dark:text-sky-300",
    borderColor: "border-sky-500/20 dark:border-sky-400/20",
    glowColor: "shadow-sky-500/25",
    pulse: false,
  },
  [MangaStatus.Hiatus]: {
    labelKey: "status.hiatus",
    dotColor: "bg-amber-400",
    bgColor: "bg-amber-500/10 dark:bg-amber-500/15",
    textColor: "text-amber-700 dark:text-amber-300",
    borderColor: "border-amber-500/20 dark:border-amber-400/20",
    glowColor: "shadow-amber-500/25",
    pulse: false,
  },
  [MangaStatus.Cancelled]: {
    labelKey: "status.cancelled",
    dotColor: "bg-rose-400",
    bgColor: "bg-rose-500/10 dark:bg-rose-500/15",
    textColor: "text-rose-700 dark:text-rose-300",
    borderColor: "border-rose-500/20 dark:border-rose-400/20",
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

