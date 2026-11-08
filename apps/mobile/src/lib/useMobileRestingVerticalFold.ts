import { useMemo } from "react";
import { Platform } from "react-native";
import { useMobileWindowLayout } from "@/lib/MobileWindowLayoutContext";
import {
  mobileRestingFoldMinGutter,
  mobileVerticalFoldBand,
  mobileVerticalFoldGutterForContainer,
} from "@/lib/mobileRestingFold";
import type { MobileFoldInterval } from "@/lib/mobileFoldAwareGrid";

/**
 * The vertical fold band crossing a container, in its local x coordinates,
 * folded (book) or fully open alike (`mobileVerticalFoldBand`): one
 * geometry for both states, so a surface laid out on it does not move when
 * the Duo folds — only the hinge angle changes. Null when the window has no
 * vertical fold (phones, tablets, the Duo outer display, inner portrait) or
 * the container is not measured / not crossed by it with room on both sides.
 *
 * `container` is the container's window-coordinate frame (`measureInWindow`,
 * e.g. `useMobileContainerFold().rect`).
 */
export function useMobileRestingVerticalFold(
  container: { x: number; width: number } | null,
): MobileFoldInterval | null {
  const windowLayout = useMobileWindowLayout();
  const band = useMemo(
    () => mobileVerticalFoldBand(windowLayout, mobileRestingFoldMinGutter(Platform.OS)),
    [windowLayout],
  );
  const x = container?.x ?? null;
  const width = container?.width ?? null;
  const gutter = x !== null && width !== null ? mobileVerticalFoldGutterForContainer(band, { x, width }) : null;
  const start = gutter?.start ?? null;
  const end = gutter?.end ?? null;
  // Stable identity while the numbers hold (consumers memoize on it).
  return useMemo(() => (start !== null && end !== null ? { start, end } : null), [end, start]);
}
