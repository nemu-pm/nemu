/**
 * DuoBilingualSpread — the bilingual book (对照书): primary page in the
 * reading-start pane, the aligned secondary page in the other, in lockstep.
 *
 * Mount it as an absolute-fill layer over the reader root (the same view the
 * reader's `WindowLayoutObserver` measures), so `layout` rects need no
 * conversion. It draws:
 * 1. `primary` (optional) inside `layout.primary`. Omit it when the reader's
 *    own gallery already renders the primary page in that rect (the
 *    recommended integration: the gallery keeps paging, zoom, tap zones and
 *    progress; this layer only adds the other pane).
 * 2. The secondary page inside `layout.secondary` (`DuoBilingualSecondaryPane`).
 * 3. Optionally the real-book spine shading at both inner edges.
 *
 * Props:
 * - `layout`: from `mobileDuoBilingualEligibility(...).layout`.
 * - `origin`: the mount view's top-left in `layout` coordinates (default 0,0).
 * - `chapterId`, `localIndex`: primary chapter id + the displayed primary
 *   page's chapter-local index (`currentDisplayedPage.index`).
 * - `primaryNaturalSize`: intrinsic size of the displayed primary page.
 * - `backgroundColor`: reader stage colour (fills the secondary pane).
 * - `strings`: mobile strings.
 * - `spineShade`: draw the spine gradient (default: book posture only).
 *
 * Page turns need no wiring: the pane re-resolves whenever `localIndex` /
 * `chapterId` change, and chapter pairing / drift / render plans / alignment
 * come from the dual-reader store the aligner already fills.
 */
import { memo, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileDuoBilingualLayout } from "@/lib/mobileDuoBilingual";
import { mobileDuoSpreadPageRects } from "@/lib/mobileDuoSpine";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { DuoBilingualSecondaryPane } from "./DuoBilingualSecondaryPane";
import { DuoBookSpineShade } from "./DuoBookSpineShade";

export type DuoBilingualSpreadProps = {
  layout: MobileDuoBilingualLayout;
  origin?: { x: number; y: number };
  primary?: ReactNode;
  chapterId: string | null;
  localIndex: number | null;
  primaryNaturalSize: { width: number; height: number } | null;
  backgroundColor: string;
  strings: MobileStrings;
  spineShade?: boolean;
};

const ZERO = { x: 0, y: 0 };

function local(rect: WindowLayoutRect, origin: { x: number; y: number }): WindowLayoutRect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

export const DuoBilingualSpread = memo(function DuoBilingualSpread({
  layout,
  origin = ZERO,
  primary,
  chapterId,
  localIndex,
  primaryNaturalSize,
  backgroundColor,
  strings,
  spineShade,
}: DuoBilingualSpreadProps) {
  const primaryRect = local(layout.primary, origin);
  const secondaryRect = local(layout.secondary, origin);
  const showSpine = spineShade ?? layout.posture === "book";
  const spine = useMemo(
    () => ({ start: layout.spine.start - origin.x, end: layout.spine.end - origin.x }),
    [layout.spine.start, layout.spine.end, origin.x],
  );
  // The aligned secondary mirrors the primary's fitted frame, so the primary's
  // natural size places both pages for the spine bands.
  const pageRects = useMemo(() => {
    if (!showSpine || !primaryNaturalSize) return null;
    const [left, right] = mobileDuoSpreadPageRects({
      panes: [local(layout.panes[0], origin), local(layout.panes[1], origin)],
      naturalSizes: [primaryNaturalSize, primaryNaturalSize],
      align: "center",
    });
    return { left, right };
  }, [showSpine, primaryNaturalSize, layout.panes, origin]);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {primary ? (
        <View
          pointerEvents="box-none"
          style={[styles.pane, { left: primaryRect.x, top: primaryRect.y, width: primaryRect.width, height: primaryRect.height }]}
        >
          {primary}
        </View>
      ) : null}
      <DuoBilingualSecondaryPane
        backgroundColor={backgroundColor}
        chapterId={chapterId}
        height={secondaryRect.height}
        localIndex={localIndex}
        primaryNaturalSize={primaryNaturalSize}
        strings={strings}
        style={[styles.pane, { left: secondaryRect.x, top: secondaryRect.y }]}
        width={secondaryRect.width}
      />
      {pageRects ? (
        <DuoBookSpineShade leftPage={pageRects.left} rightPage={pageRects.right} spine={spine} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  pane: {
    position: "absolute",
    overflow: "hidden",
  },
});
