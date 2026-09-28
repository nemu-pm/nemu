import type {
  MobileWindowLayout,
  WindowHingeStatus,
  WindowLayoutEdgeInsets,
  WindowLayoutRect,
  WindowReservedRegion,
} from "../../modules/nemu-window-layout";

export type MobileWindowPanels = {
  axis: "none" | "horizontal" | "vertical";
  /** Physical left-to-right or top-to-bottom order; never reading-order reversed. */
  panels: WindowLayoutRect[];
  /** Active hardware occlusions, clipped to the content container. */
  occlusions: WindowLayoutRect[];
};

function validRect(rect: WindowLayoutRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width >= 0 && rect.height >= 0;
}

function intersection(a: WindowLayoutRect, b: WindowLayoutRect): WindowLayoutRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width < 0 || height < 0 ? null : { x, y, width, height };
}

/**
 * Narrowest folding region content may treat as a fold, in points. iOS
 * reports the iPhone Duo division with its interaction margins (40pt);
 * Android's `FoldingFeature` is physical and a Pixel Fold hinge is a
 * zero-width line. An active division narrower than this is widened
 * symmetrically around its centre so every consumer (grids, pagers, split
 * panes, placeholders, the reader) keeps a real gutter on both platforms
 * instead of treating a zero-width fold as flat. 20pt is Apple's
 * per-side interaction margin and wider than every ordinary content gap
 * (12pt grids, 16pt list columns), so a fold never reads as a tight seam.
 */
export const MOBILE_FOLD_MIN_GUTTER = 20;

/** Widen a narrow division along its split axis, centred, clamped to the bounds. */
function withMinimumFoldGutter(
  r: WindowLayoutRect,
  axis: "horizontal" | "vertical",
  bounds: { width: number; height: number },
): WindowLayoutRect {
  const extent = axis === "horizontal" ? r.width : r.height;
  if (extent >= MOBILE_FOLD_MIN_GUTTER) return r;
  const limit = axis === "horizontal" ? bounds.width : bounds.height;
  const origin = axis === "horizontal" ? r.x : r.y;
  const center = origin + extent / 2;
  const start = Math.max(0, center - MOBILE_FOLD_MIN_GUTTER / 2);
  const end = Math.min(limit, center + MOBILE_FOLD_MIN_GUTTER / 2);
  return axis === "horizontal"
    ? { ...r, x: start, width: end - start }
    : { ...r, y: start, height: end - start };
}

/** Split only on actual active division geometry crossing the content bounds. */
export function mobileWindowPanels(layout: MobileWindowLayout): MobileWindowPanels {
  const width = Number.isFinite(layout.width) ? Math.max(0, layout.width) : 0;
  const height = Number.isFinite(layout.height) ? Math.max(0, layout.height) : 0;
  const bounds = { x: 0, y: 0, width, height };
  const occlusions = layout.occlusions.filter((r) => r.active && validRect(r))
    .map((r) => intersection(bounds, r))
    .filter((r): r is WindowLayoutRect => !!r && r.width > 0 && r.height > 0);
  let panels = [bounds];
  let axis: MobileWindowPanels["axis"] = "none";
  // A region must span the perpendicular dimension: a local camera rectangle
  // cannot be misidentified as a hinge. Zero-width division lines are supported.
  for (const region of layout.divisions) {
    if (!region.active || !validRect(region)) continue;
    const measured = intersection(bounds, region);
    if (!measured) continue;
    const horizontal = measured.y === 0 && measured.height === height && measured.x > 0 && measured.x + measured.width < width;
    const vertical = measured.x === 0 && measured.width === width && measured.y > 0 && measured.y + measured.height < height;
    if (!horizontal && !vertical) continue;
    const nextAxis = horizontal ? "horizontal" : "vertical";
    // Conflicting axes require a richer layout than a two-sided reader.
    if (axis !== "none" && axis !== nextAxis) continue;
    axis = nextAxis;
    const r = withMinimumFoldGutter(measured, nextAxis, bounds);
    panels = panels.flatMap((p) => {
      if (horizontal && r.x >= p.x && r.x + r.width <= p.x + p.width) {
        return [{ ...p, width: r.x - p.x },
          { ...p, x: r.x + r.width, width: p.x + p.width - r.x - r.width }];
      }
      if (vertical && r.y >= p.y && r.y + r.height <= p.y + p.height) {
        return [{ ...p, height: r.y - p.y },
          { ...p, y: r.y + r.height, height: p.y + p.height - r.y - r.height }];
      }
      return [p];
    }).filter((p) => p.width > 0 && p.height > 0);
  }
  return { axis, panels, occlusions };
}

/** Largest rectangle inside a panel avoiding active occlusions, for controls/images. */
export function mobileWindowUnoccludedRect(panel: WindowLayoutRect, occlusions: WindowLayoutRect[]): WindowLayoutRect {
  let candidates = [panel];
  for (const occlusion of occlusions) {
    if (!validRect(occlusion)) continue;
    candidates = candidates.flatMap((p) => {
      const r = intersection(p, occlusion);
      if (!r || r.width === 0 || r.height === 0) return [p];
      return [
        { ...p, width: r.x - p.x },
        { ...p, x: r.x + r.width, width: p.x + p.width - r.x - r.width },
        { ...p, height: r.y - p.y },
        { ...p, y: r.y + r.height, height: p.y + p.height - r.y - r.height },
      ].filter((rect) => rect.width > 0 && rect.height > 0);
    });
  }
  return candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    ?? { ...panel, width: 0, height: 0 };
}

export type { MobileWindowLayout, WindowHingeStatus, WindowLayoutEdgeInsets, WindowLayoutRect, WindowReservedRegion };

/** Reader geometry is physical; source reading order only chooses the single-page side. */
export function mobileWindowReaderLayout(
  layout: MobileWindowLayout,
  options: { twoPage: boolean; paged: boolean; rtl: boolean },
) {
  const { axis, panels, occlusions } = mobileWindowPanels(layout);
  const full = { x: 0, y: 0, width: layout.width, height: layout.height };
  const split = panels.length === 2 && axis !== "none";
  const safe = panels.map((panel) => mobileWindowUnoccludedRect(panel, occlusions));
  const usablePair = split && axis === "horizontal" && options.paged
    && safe.every((panel) => panel.width >= 160 && panel.height >= 160);
  const spread = usablePair && options.twoPage;
  const first = options.rtl ? 1 : 0;
  const stage = !options.paged ? mobileWindowUnoccludedRect(full, occlusions) : !split ? (safe[0] ?? full) : axis === "vertical" ? safe[0] : spread ? full : safe[first];
  const controls = !split ? (safe[0] ?? full) : axis === "vertical" ? safe[1] : safe[first];
  return {
    split, constrained: split || stage.x !== full.x || stage.y !== full.y || stage.width !== full.width || stage.height !== full.height,
    axis, stage, controls, usablePair,
    spreadSlots: spread ? safe : undefined,
  };
}

/** Convert a stage-local interval to the window coordinates used by RNGH absoluteX. */
export function mobileWindowAbsoluteBand(band: { start: number; end: number } | null, originX: number) {
  if (!band) return null;
  return { start: band.start + originX, end: band.end + originX };
}

/** A custom modal panel stays inside its own measured container's safe region. */
export function mobileWindowPopoverFrame(
  bounds: { width: number; height: number },
  available: WindowLayoutRect,
  bottomGap: number,
  edgeGap = 12,
) {
  const inset = Math.max(0, Math.min(edgeGap, available.width / 4, available.height / 4));
  const gap = Math.max(inset, Math.min(bottomGap, available.height / 2));
  return {
    left: available.x + inset,
    right: Math.max(0, bounds.width - available.x - available.width) + inset,
    bottom: Math.max(0, bounds.height - available.y - available.height) + gap,
    maxHeight: Math.max(1, available.height - gap - inset),
  };
}
