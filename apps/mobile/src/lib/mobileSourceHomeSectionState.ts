/**
 * Placeholder selection for a source-home section.
 *
 * `SourceHomeView` is handed an already-resolved `HomeLayout`, so a section
 * with zero entries is ambiguous on its own: it is either still being filled
 * in by a partial layout, or it genuinely resolved empty (a region-blocked
 * rail, a legacy listing the runtime could not expand). Rendering skeleton
 * cards for both leaves a permanent grey row that a pull-to-refresh only
 * repaints. Threading the fetch status down disambiguates the two.
 */

export type MobileSourceHomeSectionStatus = "loading" | "ready";

export type MobileSourceHomeSectionPlaceholder = "none" | "skeleton" | "empty";

export function resolveMobileSourceHomeSectionPlaceholder({
  status,
  itemCount,
}: {
  status: MobileSourceHomeSectionStatus;
  itemCount: number;
}): MobileSourceHomeSectionPlaceholder {
  if (itemCount > 0) return "none";
  return status === "loading" ? "skeleton" : "empty";
}

/**
 * Collapses the browse screen's five-way home state to what a section can act
 * on. Only an in-flight fetch keeps skeletons alive; `blocked` and `error`
 * are surfaced by the screen's own banner, so any layout still on screen
 * underneath them is final.
 */
export function resolveMobileSourceHomeSectionStatus(
  homeStatus: "idle" | "loading" | "ready" | "blocked" | "error",
): MobileSourceHomeSectionStatus {
  return homeStatus === "idle" || homeStatus === "loading"
    ? "loading"
    : "ready";
}
