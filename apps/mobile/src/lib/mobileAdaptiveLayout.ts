import {
  mobileWindowPanels,
  type MobileWindowLayout,
  type WindowHingeStatus,
  type WindowLayoutEdgeInsets,
  type WindowLayoutRect,
} from "@/lib/mobileWindowLayout";

/**
 * App-wide adaptive layout contract (iPhone Duo, Android foldables, tablets,
 * iPhone Mirroring / resizable scenes). Everything is derived from the actual
 * window geometry and reserved regions — never from a device model, idiom or
 * interface orientation (Apple "Preparing your app for iPhone Duo").
 *
 * Coordinates are window coordinates: the provider's observer fills the root
 * view, which is the window. Convert to a container with
 * `mobileFoldSplitForContainer` after `measureInWindow`.
 */

/** Material window size classes, which also match iOS compact/regular breaks well. */
export type MobileWidthClass = "compact" | "medium" | "expanded";

/**
 * - `flat`: no active division (outer display, fully open inner display, phones, tablets).
 * - `book`: partially folded with a vertical fold — left and right panes (HIG "book").
 * - `notebook`: partially folded with a horizontal fold — top and bottom panes
 *   (HIG laptop-like pose; Android "tabletop").
 */
export type MobileWindowPosture = "flat" | "book" | "notebook";

export type MobileAdaptiveLayout = {
  width: number;
  height: number;
  widthClass: MobileWidthClass;
  /** Width is at least 600 — room for a second level of hierarchy (split view). */
  regularWidth: boolean;
  posture: MobileWindowPosture;
  /** Active folding region in window coordinates (already includes interaction margins). */
  fold: WindowLayoutRect | null;
  /** Usable panes in physical order (left→right or top→bottom); one pane when flat. */
  panels: WindowLayoutRect[];
  /** Active hardware occlusions (e.g. the inner camera while it is in use). */
  occlusions: WindowLayoutRect[];
  /** Native geometry is reported by the platform (false = bounds-only fallback). */
  supported: boolean;
  /**
   * HIG "vertical controls": the edge where the system presents its bars
   * vertically (outer display and inner landscape on iPhone Duo), relative to
   * the layout direction; null when bars stay horizontal (inner portrait,
   * every other device, Android, web). Screens use it to stack their own
   * chrome along that edge — Back/Close at the top of the axis, then the
   * prominent action — and to keep content clear of it on both edges.
   */
  verticalBarEdge: "leading" | "trailing" | null;
  /** The same edge resolved to a physical side for absolute layout. */
  verticalBarSide: "left" | "right" | null;
  /** Safe-area insets of the observed view (already include a vertical bar); null = not reported. */
  safeAreaInsets: WindowLayoutEdgeInsets | null;
  /** Hinge state when the platform reports one; do not split on it — use `posture`/`fold`. */
  hinge: WindowHingeStatus | null;
};

export const MOBILE_MEDIUM_WIDTH = 600;
export const MOBILE_EXPANDED_WIDTH = 840;

export function mobileWidthClass(width: number): MobileWidthClass {
  if (width >= MOBILE_EXPANDED_WIDTH) return "expanded";
  if (width >= MOBILE_MEDIUM_WIDTH) return "medium";
  return "compact";
}

export function mobileAdaptiveLayout(layout: MobileWindowLayout): MobileAdaptiveLayout {
  const { axis, panels, occlusions } = mobileWindowPanels(layout);
  const split = axis !== "none" && panels.length === 2;
  const fold = split
    ? axis === "horizontal"
      ? { x: panels[0].x + panels[0].width, y: 0, width: panels[1].x - panels[0].x - panels[0].width, height: layout.height }
      : { x: 0, y: panels[0].y + panels[0].height, width: layout.width, height: panels[1].y - panels[0].y - panels[0].height }
    : null;
  const verticalBarEdge = layout.verticalBarEdge === "leading" || layout.verticalBarEdge === "trailing"
    ? layout.verticalBarEdge
    : null;
  return {
    width: layout.width,
    height: layout.height,
    widthClass: mobileWidthClass(layout.width),
    regularWidth: layout.width >= MOBILE_MEDIUM_WIDTH,
    posture: !split ? "flat" : axis === "horizontal" ? "book" : "notebook",
    fold,
    panels,
    occlusions,
    supported: layout.supported,
    verticalBarEdge,
    verticalBarSide: mobileVerticalBarSide(verticalBarEdge, layout.layoutDirection ?? "ltr", layout.safeAreaInsets ?? null),
    safeAreaInsets: layout.safeAreaInsets ?? null,
    hinge: layout.hinge ?? null,
  };
}

/**
 * Physical side of the system's vertical bar column. The column is
 * hardware-aligned (closed landscape-right puts it on the LEFT, measured
 * insets L84), so a one-sided horizontal safe-area inset is the ground truth;
 * the leading/trailing trait only decides when the insets are symmetric.
 */
export function mobileVerticalBarSide(
  edge: MobileAdaptiveLayout["verticalBarEdge"],
  layoutDirection: "ltr" | "rtl",
  insets: { left: number; right: number } | null = null,
): MobileAdaptiveLayout["verticalBarSide"] {
  if (!edge) return null;
  if (insets && Math.abs(insets.left - insets.right) >= 20) {
    return insets.left > insets.right ? "left" : "right";
  }
  return (edge === "leading") === (layoutDirection === "ltr") ? "left" : "right";
}

export type MobileContainerFoldSplit = {
  axis: "horizontal" | "vertical";
  /** Pane rectangles in the container's local coordinates, physical order. */
  first: WindowLayoutRect;
  second: WindowLayoutRect;
  /** The fold interval along the split axis, container-local (start < end). */
  gutter: { start: number; end: number };
};

/**
 * Where the active fold crosses a container that was measured in window
 * coordinates. Returns null when flat or when the fold does not cut through
 * the container with room on both sides (e.g. a sheet already on one half).
 */
export function mobileFoldSplitForContainer(
  adaptive: Pick<MobileAdaptiveLayout, "fold" | "posture">,
  container: WindowLayoutRect,
  minPane = 120,
): MobileContainerFoldSplit | null {
  const fold = adaptive.fold;
  if (!fold || adaptive.posture === "flat") return null;
  if (adaptive.posture === "book") {
    const start = fold.x - container.x;
    const end = fold.x + fold.width - container.x;
    if (start < minPane || container.width - end < minPane) return null;
    return {
      axis: "horizontal",
      first: { x: 0, y: 0, width: start, height: container.height },
      second: { x: end, y: 0, width: container.width - end, height: container.height },
      gutter: { start, end },
    };
  }
  const start = fold.y - container.y;
  const end = fold.y + fold.height - container.y;
  if (start < minPane || container.height - end < minPane) return null;
  return {
    axis: "vertical",
    first: { x: 0, y: 0, width: container.width, height: start },
    second: { x: 0, y: end, width: container.width, height: container.height - end },
    gutter: { start, end },
  };
}

/**
 * Grid columns for a content width. On regular widths the HIG asks for an even
 * number of columns so content divides cleanly when the device folds.
 */
export function mobileAdaptiveGridColumns({
  contentWidth,
  minItemWidth,
  gap,
  maxColumns = 12,
  preferEven,
}: {
  contentWidth: number;
  minItemWidth: number;
  gap: number;
  maxColumns?: number;
  preferEven: boolean;
}): { columns: number; itemWidth: number } {
  const fit = Math.max(1, Math.min(maxColumns, Math.floor((contentWidth + gap) / (minItemWidth + gap))));
  const columns = preferEven && fit > 2 && fit % 2 === 1 ? fit - 1 : fit;
  return { columns, itemWidth: Math.max(0, (contentWidth - gap * (columns - 1)) / columns) };
}
