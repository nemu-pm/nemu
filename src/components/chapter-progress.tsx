import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface ChapterProgressProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total pages */
  total: number;
  /** Whether chapter is completed */
  completed: boolean;
  /** Whether chapter is locked (paywall/login required) */
  locked?: boolean;
  className?: string;
}

/** Filled lock icon */
function LockFilledIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2C9.24 2 7 4.24 7 7v2H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.65 0 3 1.35 3 3v2H9V7c0-1.65 1.35-3 3-3zm0 10a2 2 0 110 4 2 2 0 010-4z" />
    </svg>
  );
}

/**
 * Elegant chapter reading progress indicator.
 * - Locked: filled lock icon
 * - Completed: filled checkmark circle
 * - In-progress: circular progress ring with page count
 * - Unread: nothing rendered
 */
export function ChapterProgress({
  page,
  total,
  completed,
  locked,
  className,
}: ChapterProgressProps) {
  // Locked takes precedence (unless completed, which means it was read before lock)
  if (locked && !completed) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <LockFilledIcon className="size-4 text-muted-foreground" />
      </div>
    );
  }

  if (completed) {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          className="size-5 text-emerald-500"
        />
      </div>
    );
  }

  // Not started
  if (page <= 0 || total <= 0) {
    return null;
  }

  // In progress - show ring + page count
  const progress = Math.min(page / total, 1);
  const circumference = 2 * Math.PI * 8; // radius = 8
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Page count */}
      <span className="text-xs tabular-nums text-muted-foreground">
        {page}/{total}
      </span>

      {/* Circular progress ring */}
      <div className="relative size-5">
        <svg className="size-5 -rotate-90" viewBox="0 0 20 20">
          {/* Background ring - visible track */}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary/20"
          />
          {/* Progress ring */}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="text-primary transition-all duration-300"
          />
        </svg>
      </div>
    </div>
  );
}
