/**
 * The cold-launch reveal (owner's pick, variant E): once the launch screen
 * hides on the Library's first local snapshot, the window scales 0.97 → 1
 * (native, with the bars' fade) while the page's content groups fade in and
 * rise 12pt in order. Reduce Motion and launches into another screen get a
 * plain cross-fade; a warm return or a JS reload gets nothing.
 */
export const MOBILE_LAUNCH_REVEAL = {
  groupDurationMs: 520,
  groupFirstDelayMs: 40,
  groupStepMs: 70,
  groupRise: 12,
  /** cubic-bezier(.2, .8, .2, 1) */
  groupEasing: [0.2, 0.8, 0.2, 1] as const,
} as const;

/** The Library's content groups, in reveal order. */
export const MOBILE_LAUNCH_REVEAL_GROUPS = ["header", "collections", "titlesHeader", "titles"] as const;
export type MobileLaunchRevealGroup = (typeof MOBILE_LAUNCH_REVEAL_GROUPS)[number];

export function getMobileLaunchRevealGroupDelay(group: MobileLaunchRevealGroup): number {
  return (
    MOBILE_LAUNCH_REVEAL.groupFirstDelayMs +
    MOBILE_LAUNCH_REVEAL_GROUPS.indexOf(group) * MOBILE_LAUNCH_REVEAL.groupStepMs
  );
}

export type MobileLaunchRevealMode = "full" | "fade";

export function resolveMobileLaunchRevealMode({
  pending,
  libraryRoute,
  reduceMotion,
}: {
  /** A cold launch whose window has not been revealed yet. */
  pending: boolean;
  libraryRoute: boolean;
  reduceMotion: boolean;
}): MobileLaunchRevealMode | null {
  if (!pending) return null;
  return libraryRoute && !reduceMotion ? "full" : "fade";
}
