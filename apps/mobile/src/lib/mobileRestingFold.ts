import {
  mobileAdaptiveLayout,
  mobileFoldSplitForContainer,
  type MobileContainerFoldSplit,
} from "@/lib/mobileAdaptiveLayout";
import type { MobileWindowLayout, WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * Where the device's fold crosses a container while the window is FLAT.
 *
 * A fully open iPhone Duo still reports its division, only inactive (iOS
 * `reservedRegions(kind: .division, options: .includeInactive)`; Android a
 * FLAT, non-separating `FoldingFeature`). Surfaces that already use a
 * side-by-side arrangement when flat can split on that same line, so folding
 * into book pose and back moves nothing (HIG: "favor small adjustments over
 * rearrangement", "avoid extreme layout changes"). Content may still cross it
 * — it is not a reserved region while inactive — this is only a split line.
 *
 * Returns null while an active fold is present (use the active split) or when
 * the resting division does not cut through the container with room on both
 * sides. The geometry is the exact one `mobileFoldSplitForContainer` returns
 * for the same division when it is active (including the minimum gutter for a
 * zero-width Android hinge), so the two poses produce identical panes.
 */
export function mobileRestingFoldSplitForContainer(
  layout: MobileWindowLayout,
  container: WindowLayoutRect,
  minPane = 120,
): MobileContainerFoldSplit | null {
  if (!layout.divisions.some((division) => !division.active)) return null;
  if (mobileAdaptiveLayout(layout).posture !== "flat") return null;
  const resting = mobileAdaptiveLayout({
    ...layout,
    divisions: layout.divisions.map((division) => ({ ...division, active: true })),
  });
  return mobileFoldSplitForContainer(resting, container, minPane);
}
