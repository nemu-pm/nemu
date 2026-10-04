/**
 * DuoBookSpineShade — non-interactive "real book" shading at the inner edges
 * of a two-page spread, next to the fold.
 *
 * Props (all rects in the overlay's own local coordinates — mount it as an
 * absolute-fill sibling above the spread, e.g. inside the gallery's spread
 * frame or over the reader stage):
 * - `leftPage` / `rightPage`: the visible fitted page images (null = no page
 *   on that side, or size unknown). Compute them with
 *   `mobileDuoSpreadPageRects` from the pane rects and the pages' natural
 *   sizes (`align: "center"` in book posture, `"spine"` for a flat spread).
 * - `spine`: the spine interval along x (fold region, or a zero-width seam).
 * - `tone`: defaults to the app appearance (`useNemuTheme().scheme`); pass it
 *   explicitly when the stage colour differs from the app theme.
 * - `widthRatio`: band width as a fraction of the page width (clamped 6–10%).
 * - `visible`: hide without unmounting (e.g. while a page is zoomed).
 *
 * Cost: at most two static gradients; no animation, no per-frame work. A page
 * whose inner edge does not reach the spine gets no band.
 */
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNemuTheme } from "@/design-system";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { mobileDuoSpineShadeRects, type MobileDuoSpineTone } from "@/lib/mobileDuoSpine";

export type DuoBookSpineShadeProps = {
  leftPage: WindowLayoutRect | null;
  rightPage: WindowLayoutRect | null;
  spine: { start: number; end: number };
  tone?: MobileDuoSpineTone;
  widthRatio?: number;
  visible?: boolean;
};

export const DuoBookSpineShade = memo(function DuoBookSpineShade({
  leftPage,
  rightPage,
  spine,
  tone,
  widthRatio,
  visible = true,
}: DuoBookSpineShadeProps) {
  const { scheme } = useNemuTheme();
  const resolvedTone = tone ?? scheme;
  const bands = useMemo(
    () => mobileDuoSpineShadeRects({ leftPage, rightPage, spine, tone: resolvedTone, widthRatio }),
    [leftPage, rightPage, spine, resolvedTone, widthRatio],
  );
  if (!visible || bands.length === 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {bands.map((band) => (
        <LinearGradient
          key={band.side}
          colors={band.gradient.colors}
          locations={band.gradient.locations}
          start={band.gradient.start}
          end={band.gradient.end}
          pointerEvents="none"
          style={[
            styles.band,
            { left: band.rect.x, top: band.rect.y, width: band.rect.width, height: band.rect.height },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  band: {
    position: "absolute",
  },
});
