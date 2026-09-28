/**
 * Bilingual book (对照书) — iPhone Duo / foldable signature feature.
 *
 * When the reader's window offers two usable side-by-side panes — book posture
 * (an active vertical fold) or a regular-width flat landscape window — and the
 * dual reader is configured, the primary page sits in the reading-start pane
 * and the aligned secondary page (translation / raw) in the other. Page turns,
 * chapter mapping and alignment all come from the existing dual-reader store,
 * so the two panes move in lockstep.
 *
 * Everything here is pure geometry / state so it is unit-testable:
 * - `mobileDuoBilingualEligibility` decides whether side-by-side is possible
 *   and returns the pane rects (reader-window coordinates, i.e. the same
 *   coordinates as `mobileWindowReaderLayout`).
 * - `mobileDuoBilingualAssignPanes` maps reading direction to panes
 *   (RTL → primary on the right, the Japanese reading-start side).
 * - `resolveMobileDuoBilingualMode` combines eligibility with the "Spread" /
 *   "Side by side" toggle.
 * - A tiny session store keeps the toggle for the app session only. It is
 *   never persisted or synced: the HIG asks that a pose never rewrite user
 *   settings, so the choice lives as long as the process and a fold/unfold
 *   simply re-derives the effective layout from it.
 *
 * Web parity: the web dual-reader (`src/lib/plugins/builtin/dual-reader`) has
 * no side-by-side view — on every width it replaces each page in place
 * (`activeSide`) with hold-to-peek. "Spread" is exactly that behaviour; "Side
 * by side" is a foldable-only superset that shows both sides at once, so the
 * same `activeSide`/peek state is simply not consulted while it is active.
 */
import { useSyncExternalStore } from "react";
import { MOBILE_MEDIUM_WIDTH } from "@/lib/mobileAdaptiveLayout";
import {
  mobileWindowPanels,
  mobileWindowUnoccludedRect,
  type MobileWindowLayout,
  type WindowLayoutRect,
} from "@/lib/mobileWindowLayout";

export type MobileDuoBilingualMode = "spread" | "sideBySide";

export type MobileDuoBilingualIneligibleReason =
  /** Dual reader is off or has no secondary source / chapter pair yet. */
  | "notConfigured"
  /** Long-strip / scrolling presentation: a strip has no page to pair. */
  | "notPaged"
  /** Horizontal fold (notebook / tabletop): that pose belongs to the study desk. */
  | "notebook"
  /** Flat window narrower than a regular width or compact in height (outer display, phones). */
  | "compact"
  /** Flat window taller than wide: halves would be too narrow for a page. */
  | "portrait"
  /** A pane is smaller than a readable page after occlusions. */
  | "panesTooSmall"
  /** Something else (e.g. a docked learning panel) owns the second pane. */
  | "blocked";

export type MobileDuoBilingualLayout = {
  posture: "book" | "flat";
  /** Both panes in physical order (left, right). */
  panes: [WindowLayoutRect, WindowLayoutRect];
  /** Pane holding the reader's own (primary) page — the reading-start side. */
  primary: WindowLayoutRect;
  /** Pane holding the aligned secondary page. */
  secondary: WindowLayoutRect;
  primarySide: "left" | "right";
  secondarySide: "left" | "right";
  /**
   * Physical spine interval along x: the fold region in book posture, a
   * zero-width seam at the centre when flat.
   */
  spine: { start: number; end: number };
  /** Bounding box of both panes (the area the two pages occupy together). */
  stage: WindowLayoutRect;
};

export type MobileDuoBilingualEligibility =
  | { eligible: true; layout: MobileDuoBilingualLayout }
  | { eligible: false; reason: MobileDuoBilingualIneligibleReason };

export const MOBILE_DUO_BILINGUAL_MIN_PANE_WIDTH = 280;
export const MOBILE_DUO_BILINGUAL_MIN_PANE_HEIGHT = 360;
/**
 * A flat window must also not be compact in height (Material's 480dp break):
 * phone landscape and the Duo outer display in landscape keep today's
 * single page + hold-to-peek (HIG: compact layout on the outer display).
 */
export const MOBILE_DUO_BILINGUAL_MIN_FLAT_HEIGHT = 480;

/** Dual reader has everything needed to resolve a secondary page. */
export function isMobileDuoDualReaderConfigured(input: {
  enabled: boolean;
  secondarySource: unknown;
  seedPair: unknown;
}): boolean {
  return input.enabled && Boolean(input.secondarySource) && Boolean(input.seedPair);
}

/** RTL reads right → left, so the primary (reading-start) page is the right pane. */
export function mobileDuoBilingualAssignPanes(
  panes: [WindowLayoutRect, WindowLayoutRect],
  rtl: boolean,
): Pick<MobileDuoBilingualLayout, "primary" | "secondary" | "primarySide" | "secondarySide"> {
  const [left, right] = panes;
  return rtl
    ? { primary: right, secondary: left, primarySide: "right", secondarySide: "left" }
    : { primary: left, secondary: right, primarySide: "left", secondarySide: "right" };
}

function boundingRect(a: WindowLayoutRect, b: WindowLayoutRect): WindowLayoutRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** Trim the safe-area inset only on an edge that touches the window's left/right edge. */
function horizontalSafe(
  rect: WindowLayoutRect,
  windowWidth: number,
  insets: { left: number; right: number } | undefined,
): WindowLayoutRect {
  const left = rect.x <= 0.5 ? Math.max(0, insets?.left ?? 0) : 0;
  const right = rect.x + rect.width >= windowWidth - 0.5 ? Math.max(0, insets?.right ?? 0) : 0;
  return { ...rect, x: rect.x + left, width: Math.max(0, rect.width - left - right) };
}

function finiteRect(rect: WindowLayoutRect | undefined): rect is WindowLayoutRect {
  return !!rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0;
}

/**
 * Whether the bilingual side-by-side view is possible, and where its panes go.
 *
 * `layout` is the reader's own observed window layout (`readerWindowLayout` in
 * ReaderScreen), so the returned rects share coordinates with
 * `mobileWindowReaderLayout(...).stage` / `.spreadSlots`.
 *
 * - Book posture: one page per physical half, each half already clear of the
 *   fold and of active occlusions (HIG: keep content off the folding region).
 * - Flat: only a regular-width landscape window (≥ 600pt wide, ≥ 480pt
 *   tall, wider than tall) whose halves each hold a readable page; the halves meet at the
 *   centre with no synthetic gutter, like the existing flat two-page spread.
 *   `available` narrows the flat area (e.g. to the stage left beside a docked
 *   side panel); it defaults to the full bounds inside the horizontal safe
 *   area, matching `readerSafeContentWidth`.
 */
export function mobileDuoBilingualEligibility(input: {
  layout: MobileWindowLayout;
  rtl: boolean;
  paged: boolean;
  dualReaderConfigured: boolean;
  available?: WindowLayoutRect;
  secondPaneOccupied?: boolean;
  /** React Native safe-area insets, used when the observer reports none. */
  fallbackInsets?: { top: number; left: number; bottom: number; right: number };
  minPaneWidth?: number;
  minPaneHeight?: number;
}): MobileDuoBilingualEligibility {
  const {
    layout,
    rtl,
    paged,
    dualReaderConfigured,
    secondPaneOccupied = false,
    minPaneWidth = MOBILE_DUO_BILINGUAL_MIN_PANE_WIDTH,
    minPaneHeight = MOBILE_DUO_BILINGUAL_MIN_PANE_HEIGHT,
  } = input;
  if (!dualReaderConfigured) return { eligible: false, reason: "notConfigured" };
  if (!paged) return { eligible: false, reason: "notPaged" };
  if (secondPaneOccupied) return { eligible: false, reason: "blocked" };

  const width = Number.isFinite(layout.width) ? Math.max(0, layout.width) : 0;
  const height = Number.isFinite(layout.height) ? Math.max(0, layout.height) : 0;
  const { axis, panels, occlusions } = mobileWindowPanels(layout);
  const fits = (rect: WindowLayoutRect) => rect.width >= minPaneWidth && rect.height >= minPaneHeight;

  if (axis === "vertical" && panels.length === 2) return { eligible: false, reason: "notebook" };

  if (axis === "horizontal" && panels.length === 2) {
    // Inside the horizontal safe area on edges that touch the window edge
    // (never at the fold), then clear of active occlusions. Safe area first:
    // on the Duo the 84pt bar column carries an always-active status
    // occlusion, and trimming the column first keeps the pane full height.
    const insets = layout.safeAreaInsets ?? input.fallbackInsets;
    const left = mobileWindowUnoccludedRect(horizontalSafe(panels[0], width, insets), occlusions);
    const right = mobileWindowUnoccludedRect(horizontalSafe(panels[1], width, insets), occlusions);
    if (!fits(left) || !fits(right)) return { eligible: false, reason: "panesTooSmall" };
    const panes: [WindowLayoutRect, WindowLayoutRect] = [left, right];
    return {
      eligible: true,
      layout: {
        posture: "book",
        panes,
        ...mobileDuoBilingualAssignPanes(panes, rtl),
        spine: { start: panels[0].x + panels[0].width, end: panels[1].x },
        stage: boundingRect(left, right),
      },
    };
  }

  if (width < MOBILE_MEDIUM_WIDTH || height < MOBILE_DUO_BILINGUAL_MIN_FLAT_HEIGHT) {
    return { eligible: false, reason: "compact" };
  }
  if (width <= height) return { eligible: false, reason: "portrait" };

  const insets = layout.safeAreaInsets ?? input.fallbackInsets;
  const defaultArea = {
    x: insets?.left ?? 0,
    y: 0,
    width: Math.max(0, width - (insets?.left ?? 0) - (insets?.right ?? 0)),
    height,
  };
  const requested = finiteRect(input.available) ? input.available : defaultArea;
  const area = mobileWindowUnoccludedRect(requested, occlusions);
  const half = Math.floor(area.width / 2);
  const left = { x: area.x, y: area.y, width: half, height: area.height };
  const right = { x: area.x + half, y: area.y, width: area.width - half, height: area.height };
  if (!fits(left) || !fits(right)) return { eligible: false, reason: "panesTooSmall" };
  const panes: [WindowLayoutRect, WindowLayoutRect] = [left, right];
  return {
    eligible: true,
    layout: {
      posture: "flat",
      panes,
      ...mobileDuoBilingualAssignPanes(panes, rtl),
      spine: { start: right.x, end: right.x },
      stage: area,
    },
  };
}

/**
 * The same decision taken from the reader's pose layout
 * (`mobileReaderPoseLayout`), so the bilingual panes are exactly the pages'
 * slots of a spread in that pose — including rails, safe areas and a docked
 * learning panel. Pass the pose computed with `twoPage: true` (the user's own
 * setting stays untouched; this is only "where would a spread go").
 *
 * Structural input (no import of the pose module): `posture`, `bounds`,
 * `stage`, `spread`, stage-local `spreadSlots`, `learning.presentation`.
 */
export function mobileDuoBilingualFromReaderPose(input: {
  pose: {
    posture: "flat" | "book" | "notebook";
    bounds: WindowLayoutRect;
    stage: WindowLayoutRect;
    spread: boolean;
    spreadSlots?: WindowLayoutRect[];
    learning: { presentation: string };
  };
  rtl: boolean;
  paged: boolean;
  dualReaderConfigured: boolean;
  minPaneWidth?: number;
  minPaneHeight?: number;
}): MobileDuoBilingualEligibility {
  const {
    pose,
    rtl,
    paged,
    dualReaderConfigured,
    minPaneWidth = MOBILE_DUO_BILINGUAL_MIN_PANE_WIDTH,
    minPaneHeight = MOBILE_DUO_BILINGUAL_MIN_PANE_HEIGHT,
  } = input;
  if (!dualReaderConfigured) return { eligible: false, reason: "notConfigured" };
  if (!paged) return { eligible: false, reason: "notPaged" };
  if (pose.posture === "notebook") return { eligible: false, reason: "notebook" };
  if (pose.posture === "flat") {
    if (pose.bounds.width < MOBILE_MEDIUM_WIDTH || pose.bounds.height < MOBILE_DUO_BILINGUAL_MIN_FLAT_HEIGHT) {
      return { eligible: false, reason: "compact" };
    }
    if (pose.bounds.width <= pose.bounds.height) return { eligible: false, reason: "portrait" };
  }
  if (!pose.spread) {
    return { eligible: false, reason: pose.learning.presentation === "docked" ? "blocked" : "panesTooSmall" };
  }
  const { stage } = pose;
  let panes: [WindowLayoutRect, WindowLayoutRect];
  let spine: { start: number; end: number };
  if (pose.spreadSlots && pose.spreadSlots.length === 2) {
    const [a, b] = pose.spreadSlots.map((slot) => ({ ...slot, x: slot.x + stage.x, y: slot.y + stage.y }));
    panes = [a, b];
    spine = { start: a.x + a.width, end: b.x };
  } else {
    const half = Math.floor(stage.width / 2);
    panes = [
      { x: stage.x, y: stage.y, width: half, height: stage.height },
      { x: stage.x + half, y: stage.y, width: stage.width - half, height: stage.height },
    ];
    spine = { start: stage.x + half, end: stage.x + half };
  }
  const fits = (rect: WindowLayoutRect) => rect.width >= minPaneWidth && rect.height >= minPaneHeight;
  if (!fits(panes[0]) || !fits(panes[1])) return { eligible: false, reason: "panesTooSmall" };
  return {
    eligible: true,
    layout: {
      posture: pose.posture === "book" ? "book" : "flat",
      panes,
      ...mobileDuoBilingualAssignPanes(panes, rtl),
      spine,
      stage: boundingRect(panes[0], panes[1]),
    },
  };
}

/**
 * What the reader changes while side-by-side is on screen — effective values
 * only, never written back to settings: the gallery stage becomes the primary
 * pane (a single page, no spread slots, no fold gap inside it), and chrome
 * tap exclusions (stage-local rects, e.g. the vertical rail) are re-based
 * from the pose stage onto that pane and clipped to it.
 */
export function mobileDuoBilingualStageOverrides(input: {
  layout: MobileDuoBilingualLayout;
  poseStage: WindowLayoutRect;
  tapExclusions?: readonly WindowLayoutRect[];
}): {
  stage: WindowLayoutRect;
  twoPage: false;
  spreadSlots: undefined;
  foldGap: null;
  tapExclusions: WindowLayoutRect[];
} {
  const { layout, poseStage } = input;
  const stage = layout.primary;
  const tapExclusions: WindowLayoutRect[] = [];
  for (const rect of input.tapExclusions ?? []) {
    // pose-stage-local → reader → primary-pane-local, clipped to the pane.
    const x = rect.x + poseStage.x - stage.x;
    const y = rect.y + poseStage.y - stage.y;
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(stage.width, x + rect.width);
    const bottom = Math.min(stage.height, y + rect.height);
    if (right > left && bottom > top) {
      tapExclusions.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  return { stage, twoPage: false, spreadSlots: undefined, foldGap: null, tapExclusions };
}

export type MobileDuoBilingualResolvedMode = {
  /** The toggle's value (what the user chose, or the default). */
  mode: MobileDuoBilingualMode;
  /** Side-by-side is on screen right now. */
  sideBySide: boolean;
  /** The "Spread" ↔ "Side by side" toggle belongs in the chrome. */
  showToggle: boolean;
};

/**
 * Configuring the dual reader is the user's opt-in, so on an eligible window
 * the default is side by side; the session choice overrides it. Ineligible
 * windows (flat compact, notebook, scrolling) fall back to today's overlay +
 * hold-to-peek and hide the toggle, without forgetting the choice.
 */
export function resolveMobileDuoBilingualMode(input: {
  eligible: boolean;
  choice: MobileDuoBilingualMode | null;
}): MobileDuoBilingualResolvedMode {
  const mode = input.choice ?? "sideBySide";
  return {
    mode,
    sideBySide: input.eligible && mode === "sideBySide",
    showToggle: input.eligible,
  };
}

// --- Session-only toggle store --------------------------------------------

let sessionChoice: MobileDuoBilingualMode | null = null;
const listeners = new Set<() => void>();

export function getMobileDuoBilingualChoice(): MobileDuoBilingualMode | null {
  return sessionChoice;
}

/** Explicit user choice from the chrome toggle; kept for the app session only. */
export function setMobileDuoBilingualChoice(choice: MobileDuoBilingualMode | null): void {
  if (sessionChoice === choice) return;
  sessionChoice = choice;
  listeners.forEach((listener) => listener());
}

export function subscribeMobileDuoBilingualChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMobileDuoBilingualChoice(): MobileDuoBilingualMode | null {
  return useSyncExternalStore(
    subscribeMobileDuoBilingualChoice,
    getMobileDuoBilingualChoice,
    getMobileDuoBilingualChoice,
  );
}
