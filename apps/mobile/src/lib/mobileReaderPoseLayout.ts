import { mobileAdaptiveLayout, type MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import type { MobileReaderNotebookPaneState } from "@/lib/mobileReaderNotebookPane";
import {
  mobileWindowUnoccludedRect,
  type MobileWindowLayout,
  type WindowLayoutEdgeInsets,
  type WindowLayoutRect,
} from "@/lib/mobileWindowLayout";

/**
 * Reader pose matrix (iPhone Duo / foldables / tablets / phones).
 *
 * Every decision is derived from the reader container's geometry, its
 * reserved regions (fold, camera) and the system's `verticalBarEdge` trait —
 * never from a device model or interface orientation. All rectangles are in
 * the reader root's local coordinates (the reader fills its window) unless a
 * field says "stage-local".
 *
 * | pose                                  | stage                         | chrome                           | learning             |
 * |---------------------------------------|-------------------------------|----------------------------------|----------------------|
 * | flat, compact width or short (phones, Duo outer display) | full bleed | horizontal title pill + bottom bar (the approved phone design) | sheet |
 * | flat, regular width (Duo inner, tablets, unfolded Android) | full bleed | capsule row on the status-bar row + bottom scrubber capsule | sheet, or trailing side dock when tall enough |
 * | book (vertical fold)                  | one page per pane / reading-start pane | capsules snapped per pane: Back + title leading, actions trailing, scrubber in the reading-start pane | the pane without the page |
 * | notebook (horizontal fold), paged     | top pane                      | capsule row over the top pane + the bottom pane (trackpad / filmstrip / study desk) | the study desk |
 * | notebook, scroll / long strip         | the whole display (the fold is a band the strip passes under) | capsule row + scrubber, like flat | the study desk |
 *
 * The reader opts out of the iPhone Duo vertical bar (`VerticalBarBehavior`,
 * `UIVerticalBarBehavior.disabled`), so there is no vertical-bar column to
 * reserve: the status bar is horizontal and the side safe-area inset is gone.
 * `verticalBarEdge` is still reported by the trait when the bar is disabled,
 * so it never selects a layout here; only the measured insets and occlusions
 * are honoured (a binary without the opt-out keeps its side inset clear).
 */

type Rect = WindowLayoutRect;
type Insets = WindowLayoutEdgeInsets;
type Side = "left" | "right";

/**
 * Capsule chrome geometry, measured from Safari on the iPhone Duo inner
 * display at 3x: 44pt circular buttons and capsules, 16pt from the window
 * edge, ~10pt between separate capsules, the URL capsule ~360pt wide and
 * centred, the row's bottom 12pt above the top safe-area edge (status bar on
 * the same row) — 26pt from the top with the Duo's 82pt top inset.
 */
export const READER_CAPSULE_HEIGHT = 44;
export const READER_CAPSULE_EDGE = 16;
export const READER_CAPSULE_GAP = 10;
/** One icon slot in the actions capsule (a 44pt circle's width). */
export const READER_CAPSULE_ACTION_WIDTH = 44;
/** Inner padding at each end of the actions capsule. */
export const READER_CAPSULE_ACTIONS_PADDING = 2;
export const READER_CAPSULE_TITLE_MAX_WIDTH = 360;
/** At or above this the title capsule shows the title + "Chapter · n/N"; below it only n/N. */
export const READER_CAPSULE_TITLE_FULL_MIN_WIDTH = 160;
/** Below this the title capsule is dropped rather than squeezed. */
export const READER_CAPSULE_TITLE_MIN_WIDTH = 96;
/** Gap between the row's bottom and the top safe-area edge when the status bar shares the row. */
export const READER_CAPSULE_ROW_BOTTOM_GAP = 12;
/** Gap below the top safe-area edge when the status bar spans the top (no shared row). */
export const READER_CAPSULE_ROW_TOP_GAP = 8;
/** The top scrim fades out this far below the lower of the top inset and the capsule row. */
export const READER_TOP_SCRIM_FEATHER = 24;
/** Bottom scrubber capsule: the slider keeps its 48pt touch target. */
export const READER_SCRUBBER_CAPSULE_HEIGHT = 48;
export const READER_SCRUBBER_CAPSULE_MAX_WIDTH = 480;
/** Scrubber sits this far above the bottom safe-area edge (home indicator band), never closer than the edge gap. */
export const READER_SCRUBBER_CAPSULE_BOTTOM_LIFT = 8;
/** Docked learning panel: trailing ~40% of the window, clamped. */
export const READER_DOCK_FRACTION = 0.4;
export const READER_DOCK_MIN_WIDTH = 320;
export const READER_DOCK_MAX_WIDTH = 440;
/** The page stage must stay at least this wide beside a flat side dock. */
export const READER_DOCK_MIN_STAGE_WIDTH = 440;
/** Below this height (phone landscape) tools stay in a sheet and the phone chrome stays. */
export const READER_DOCK_MIN_HEIGHT = 480;
/** Visual gap around a docked panel card. */
export const READER_DOCK_GAP = 8;
/** A fold pane narrower/shorter than this cannot hold a readable page. */
export const READER_BOOK_MIN_PANE = 160;
/** A book pane must be at least this wide to host learning tools. */
export const READER_BOOK_DOCK_MIN_WIDTH = 280;
/** A notebook bottom pane (or a book pane) must be at least this tall to host learning tools. */
export const READER_CONSOLE_DOCK_MIN_HEIGHT = 200;

export type MobileReaderChromeLayout =
  | {
      /** Title pill at the top of `frame`, scrubber toolbar at its bottom. */
      kind: "horizontal";
      frame: Rect;
      /** Safe-area insets that apply inside `frame` (only on edges touching the window edge). */
      padding: Insets;
    }
  | {
      /**
       * Regular-width capsule chrome (Safari on iPhone Duo): separate glass
       * pieces on the status-bar row plus one centred scrubber capsule. In
       * book posture the pieces snap per pane and nothing sits on the fold.
       */
      kind: "capsules";
      frame: Rect;
      padding: Insets;
      /** Leading circular Back button. */
      back: Rect;
      /** Title / chapter / n-of-N capsule; null when the row has no room for it. */
      title: Rect | null;
      /** Trailing actions capsule (plugins, dual read, settings). */
      actions: Rect;
      /** Bottom scrubber capsule (previous chapter · slider · next chapter). */
      scrubber: Rect;
      /** Page region between the two rows: reader cards, notices, the FAB. */
      content: Rect;
      /**
       * Shape-less top-edge scrim (Photos / video players): a full-width
       * dark-to-clear gradient under the status bar and the capsule row while
       * the chrome is shown. With the vertical bar disabled the iPhone Duo
       * status bar has no system blur, and a shaped backing can never track
       * the system element (it grows, and the Control Center pull-down
       * reveals its edges); a gradient has no edges. Spans both book panes.
       */
      topScrim: Rect;
    }
  | {
      /**
       * Notebook, paged: the bottom pane is always there (trackpad, filmstrip
       * or study desk) and the top pane gets the flat capsule row (Back ·
       * title · actions) when the chrome is shown.
       */
      kind: "console";
      /** The bottom pane. */
      frame: Rect;
      padding: Insets;
      /** The bottom pane inside its safe area and occlusions: where its content goes. */
      pane: Rect;
      state: Exclude<MobileReaderNotebookPaneState, "continuous">;
      /** Capsule row over the top pane. */
      back: Rect;
      title: Rect | null;
      actions: Rect;
    };

export type MobileReaderLearningLayout =
  | { presentation: "sheet" }
  | { presentation: "docked"; frame: Rect; region: "side" | "pane" | "console" };

export type MobileReaderPoseLayoutInput = {
  /** The reader container's own observer layout (local coordinates). */
  layout: MobileWindowLayout;
  /** Safe-area insets from React Native, used when the observer reports none. */
  fallbackInsets: Insets;
  /** Paged gallery (false = continuous strip / long-strip presentation). */
  paged: boolean;
  pageCount: number;
  /** The user's two-page preference. Never rewritten by this function. */
  twoPage: boolean;
  /** Right-to-left reading order. */
  rtl: boolean;
  /** A dockable learning surface (transcript / OCR result / chat) is open. */
  learningOpen: boolean;
  /**
   * Notebook posture: what the bottom pane holds (`resolveMobileReaderNotebookPane`).
   * Omitted: the study desk when learning is open, otherwise the trackpad
   * (paged) or the continuous strip (scroll).
   */
  notebookPane?: MobileReaderNotebookPaneState;
  /** Icon buttons in the trailing actions capsule (capsule chrome). Default 3. */
  actionCount?: number;
};

export type MobileReaderPoseLayout = {
  posture: MobileWindowPosture;
  bounds: Rect;
  safeInsets: Insets;
  /** Gallery rectangle. */
  stage: Rect;
  /** The stage must be sized exactly (no minimum-width clamp, no extra safe-area math downstream). */
  constrained: boolean;
  /** Stage-local page slots when a spread straddles an active fold. */
  spreadSlots?: Rect[];
  /** The pose can show a spread (ignoring a temporary learning dock): drives the two-page setting. */
  twoPageAvailable: boolean;
  /** A spread is rendered right now. */
  spread: boolean;
  /** The user wants spreads and the pose allows them, but the docked panel forces one page. Temporary, never persisted. */
  spreadFallback: boolean;
  /** Stage-local x interval (the fold) that must never be a tap target. */
  foldGap: { start: number; end: number } | null;
  /** Notebook continuous strip: the fold band drawn over the strip (reader-local). */
  foldBand: Rect | null;
  chrome: MobileReaderChromeLayout;
  /** Chrome is always visible (notebook console). */
  chromePinned: boolean;
  learning: MobileReaderLearningLayout;
  /** Where reader-owned cards (end of chapter) are centred. */
  modalFrame: Rect;
  /** Reader settings popover: the region it may occupy and its gap to that region's bottom edge. */
  popover: { frame: Rect; bottomGap: number };
  /** Stage-local rectangles owned by chrome: taps there never turn pages. */
  tapExclusions: Rect[];
};

const EPSILON = 0.5;

function finite(value: number | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function sanitizeInsets(insets: Partial<Insets> | null | undefined): Insets {
  return {
    top: finite(insets?.top),
    left: finite(insets?.left),
    bottom: finite(insets?.bottom),
    right: finite(insets?.right),
  };
}

/** Safe-area padding that applies inside `rect`: only edges that touch the window edge inherit an inset. */
export function mobileReaderSafePadding(rect: Rect, bounds: Rect, insets: Insets): Insets {
  return {
    top: rect.y <= bounds.y + EPSILON ? insets.top : 0,
    left: rect.x <= bounds.x + EPSILON ? insets.left : 0,
    bottom: rect.y + rect.height >= bounds.y + bounds.height - EPSILON ? insets.bottom : 0,
    right: rect.x + rect.width >= bounds.x + bounds.width - EPSILON ? insets.right : 0,
  };
}

function shrink(rect: Rect, pad: Partial<Insets>): Rect {
  const left = pad.left ?? 0;
  const right = pad.right ?? 0;
  const top = pad.top ?? 0;
  const bottom = pad.bottom ?? 0;
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
}

function horizontalSafe(rect: Rect, bounds: Rect, insets: Insets): Rect {
  const pad = mobileReaderSafePadding(rect, bounds, insets);
  return shrink(rect, { left: pad.left, right: pad.right });
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON
    && Math.abs(a.width - b.width) < EPSILON && Math.abs(a.height - b.height) < EPSILON;
}

function toLocal(rect: Rect, origin: Rect): Rect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Occlusions that reach the top edge of `bounds` (status bar island, camera). */
function topOcclusions(bounds: Rect, occlusions: Rect[]): Rect[] {
  return occlusions.filter((rect) => rect.y <= bounds.y + EPSILON && rect.height > 0 && rect.width > 0);
}

/**
 * Top of the capsule row. When the status bar is an island that shares the
 * top band with app content (iPhone Duo inner display: a 134×82 occlusion in
 * the trailing corner and an 82pt top inset), the row sits in that band like
 * Safari's, its bottom 12pt above the safe-area edge. Otherwise (a status bar
 * spanning the top, or none) it sits just below the top inset.
 */
export function mobileReaderCapsuleRowTop(bounds: Rect, insets: Insets, occlusions: Rect[], height = READER_CAPSULE_HEIGHT): number {
  const island = statusIsland(bounds, insets, occlusions) !== null;
  const shared = island && insets.top >= height + READER_CAPSULE_ROW_BOTTOM_GAP + READER_CAPSULE_ROW_TOP_GAP;
  return shared
    ? bounds.y + insets.top - READER_CAPSULE_ROW_BOTTOM_GAP - height
    : bounds.y + Math.max(insets.top, 0) + READER_CAPSULE_ROW_TOP_GAP;
}

/** The status bar island that shares the capsule row, if any. */
function statusIsland(bounds: Rect, insets: Insets, occlusions: Rect[]): Rect | null {
  return topOcclusions(bounds, occlusions).find((rect) =>
    rect.width < bounds.width / 3 && Math.abs(rect.y + rect.height - (bounds.y + insets.top)) <= 2) ?? null;
}

/** Width of the actions capsule for `count` icon buttons. */
export function mobileReaderCapsuleActionsWidth(count: number): number {
  const slots = Math.max(1, Math.round(finite(count, 3)));
  return slots * READER_CAPSULE_ACTION_WIDTH + READER_CAPSULE_ACTIONS_PADDING * 2;
}

/** Right edge available to the row inside `region`, left of any occlusion the row would hit. */
function rowTrailingLimit(region: Rect, rowTop: number, height: number, occlusions: Rect[], padRight: number): number {
  let limit = region.x + region.width - Math.max(READER_CAPSULE_EDGE, padRight);
  const band: Rect = { x: region.x, y: rowTop, width: region.width, height };
  for (const occlusion of occlusions) {
    if (!intersects(band, occlusion)) continue;
    // Only an occlusion in the trailing half pushes the row's trailing end.
    // The status bar island carries its own margin (Safari's tabs capsule
    // ends exactly where it starts); a camera keeps half a gap.
    if (occlusion.x + occlusion.width / 2 >= region.x + region.width / 2) {
      limit = Math.min(limit, occlusion.x - (occlusion.y <= EPSILON ? 0 : READER_CAPSULE_GAP / 2));
    }
  }
  return limit;
}

function rowLeadingLimit(region: Rect, rowTop: number, height: number, occlusions: Rect[], padLeft: number): number {
  let limit = region.x + Math.max(READER_CAPSULE_EDGE, padLeft);
  const band: Rect = { x: region.x, y: rowTop, width: region.width, height };
  for (const occlusion of occlusions) {
    if (!intersects(band, occlusion)) continue;
    if (occlusion.x + occlusion.width / 2 < region.x + region.width / 2) {
      limit = Math.max(limit, occlusion.x + occlusion.width + (occlusion.y <= EPSILON ? 0 : READER_CAPSULE_GAP / 2));
    }
  }
  return limit;
}

/**
 * Capsule chrome for one or two regions: `leading` holds Back + title,
 * `trailing` the actions capsule (the same rect when flat), `scrubberRegion`
 * the bottom capsule. Physical sides follow the layout direction.
 */
function capsuleChrome(input: {
  frame: Rect;
  bounds: Rect;
  insets: Insets;
  occlusions: Rect[];
  leading: Rect;
  trailing: Rect;
  scrubberRegion: Rect;
  leadingSide: Side;
  actionCount: number;
  /** Centre the title on this x (Safari centres the URL capsule on the window). */
  titleCenterX: number;
}): Extract<MobileReaderChromeLayout, { kind: "capsules" }> {
  const { bounds, insets, occlusions, leading, trailing, leadingSide } = input;
  const h = READER_CAPSULE_HEIGHT;
  const rowTop = mobileReaderCapsuleRowTop(bounds, insets, occlusions, h);
  const pad = (rect: Rect) => mobileReaderSafePadding(rect, bounds, insets);
  const ltr = leadingSide === "left";
  const leadPad = pad(leading);
  const trailPad = pad(trailing);
  // Leading pieces start at the region's leading edge; the actions capsule
  // hugs the trailing edge (left of the status bar island when it shares the row).
  const actionsWidth = mobileReaderCapsuleActionsWidth(input.actionCount);
  const back: Rect = ltr
    ? { x: rowLeadingLimit(leading, rowTop, h, occlusions, leadPad.left), y: rowTop, width: h, height: h }
    : { x: rowTrailingLimit(leading, rowTop, h, occlusions, leadPad.right) - h, y: rowTop, width: h, height: h };
  const actions: Rect = ltr
    ? { x: rowTrailingLimit(trailing, rowTop, h, occlusions, trailPad.right) - actionsWidth, y: rowTop, width: actionsWidth, height: h }
    : { x: rowLeadingLimit(trailing, rowTop, h, occlusions, trailPad.left), y: rowTop, width: actionsWidth, height: h };
  // An occlusion inside the region (the inner camera while it runs) can still
  // sit where the actions landed: slide them past it, toward the leading side.
  const bandOcclusions = occlusions.filter((rect) => intersects({ x: bounds.x, y: rowTop, width: bounds.width, height: h }, rect));
  for (let guard = 0; guard < bandOcclusions.length; guard += 1) {
    const hit = bandOcclusions.find((rect) => intersects(actions, rect));
    if (!hit) break;
    actions.x = ltr ? hit.x - READER_CAPSULE_GAP / 2 - actions.width : hit.x + hit.width + READER_CAPSULE_GAP / 2;
  }
  // Title: centred on `titleCenterX`, clamped between Back and the actions
  // (or the leading region's inner edge when the actions live in another pane).
  const sameRow = sameRect(leading, trailing);
  let minX = ltr ? back.x + h + READER_CAPSULE_GAP : sameRow ? actions.x + actions.width + READER_CAPSULE_GAP : leading.x + READER_CAPSULE_EDGE;
  let maxX = ltr ? (sameRow ? actions.x - READER_CAPSULE_GAP : leading.x + leading.width - READER_CAPSULE_EDGE) : back.x - READER_CAPSULE_GAP;
  for (const rect of bandOcclusions) {
    if (rect.x + rect.width <= minX || rect.x >= maxX) continue;
    if (rect.x + rect.width / 2 >= input.titleCenterX) maxX = Math.min(maxX, rect.x - READER_CAPSULE_GAP / 2);
    else minX = Math.max(minX, rect.x + rect.width + READER_CAPSULE_GAP / 2);
  }
  const available = maxX - minX;
  let title: Rect | null = null;
  if (available >= READER_CAPSULE_TITLE_MIN_WIDTH) {
    // Centred when a centred capsule still holds the full title (Safari's URL
    // capsule); otherwise take the whole gap off-centre rather than shrink to
    // a page count (inner portrait: the actions and status island crowd the
    // centre).
    const half = Math.min(input.titleCenterX - minX, maxX - input.titleCenterX);
    const centredWidth = Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, Math.max(0, half * 2));
    const width = centredWidth >= READER_CAPSULE_TITLE_FULL_MIN_WIDTH
      ? centredWidth
      : Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, available);
    const centred = input.titleCenterX - width / 2;
    const x = Math.max(minX, Math.min(maxX - width, centred));
    title = { x: Math.round(x), y: rowTop, width: Math.round(width), height: h };
  }
  // Scrubber: centred in its region above the home-indicator band.
  const region = input.scrubberRegion;
  const regionPad = pad(region);
  const sh = READER_SCRUBBER_CAPSULE_HEIGHT;
  const sideRoom = Math.max(READER_CAPSULE_EDGE, regionPad.left) + Math.max(READER_CAPSULE_EDGE, regionPad.right);
  const scrubberWidth = Math.max(0, Math.min(READER_SCRUBBER_CAPSULE_MAX_WIDTH, region.width - sideRoom));
  const bottomGap = Math.max(READER_CAPSULE_EDGE, regionPad.bottom - READER_SCRUBBER_CAPSULE_BOTTOM_LIFT);
  const scrubberLeft = region.x + Math.max(READER_CAPSULE_EDGE, regionPad.left);
  const scrubber: Rect = {
    x: Math.round(scrubberLeft + (region.width - sideRoom - scrubberWidth) / 2),
    y: region.y + region.height - bottomGap - sh,
    width: Math.round(scrubberWidth),
    height: sh,
  };
  // A running camera near the bottom edge (inner landscape-right): lift the
  // scrubber above it rather than under it.
  for (const rect of occlusions) {
    if (intersects(scrubber, rect)) scrubber.y = Math.min(scrubber.y, rect.y - READER_CAPSULE_GAP / 2 - sh);
  }
  const contentTop = rowTop + h + READER_CAPSULE_GAP;
  const content: Rect = {
    x: region.x,
    y: contentTop,
    width: region.width,
    height: Math.max(0, scrubber.y - READER_CAPSULE_GAP - contentTop),
  };
  const topScrim: Rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.max(insets.top, rowTop + h - bounds.y) + READER_TOP_SCRIM_FEATHER,
  };
  return { kind: "capsules", frame: input.frame, padding: pad(input.frame), back, title, actions, scrubber, content, topScrim };
}

/** Docked side-panel width for an available horizontal extent. */
export function mobileReaderDockWidth(availableWidth: number): number {
  const width = Math.round(finite(availableWidth) * READER_DOCK_FRACTION);
  return Math.max(READER_DOCK_MIN_WIDTH, Math.min(READER_DOCK_MAX_WIDTH, width));
}

/** Two readable pages fit side by side only in a wider-than-tall stage. */
function stageHoldsSpread(stage: Rect): boolean {
  return stage.width / Math.max(1, stage.height) > 1;
}

/** Toolbar height used for popover clearance (READER_CHROME_PANEL_MIN_HEIGHT). */
const READER_TOOLBAR_HEIGHT = 60;
/** Edge gap + toolbar + popover gap, as readerChromeSettingsPopoverBottomOffset. */
const READER_TOOLBAR_CLEARANCE = 16 + READER_TOOLBAR_HEIGHT + 2;

/**
 * The reader settings popover's region (top/side safe areas already removed)
 * and its gap above that region's bottom edge: above the scrubber toolbar for
 * horizontal chrome, between the capsule rows for capsule chrome, inside the
 * console for notebook.
 */
export function mobileReaderPopoverPlacement(chrome: MobileReaderChromeLayout): { frame: Rect; bottomGap: number } {
  if (chrome.kind === "capsules") return { frame: chrome.content, bottomGap: READER_DOCK_GAP };
  // Notebook: inside the bottom pane, the half the hands rest on.
  if (chrome.kind === "console") return { frame: chrome.pane, bottomGap: READER_DOCK_GAP };
  const { padding } = chrome;
  const frame = shrink(chrome.frame, { top: padding.top, left: padding.left, right: padding.right });
  return { frame, bottomGap: padding.bottom + READER_TOOLBAR_CLEARANCE };
}

/** Capsule chrome needs a regular-width window tall enough for two rows around a page (not phone landscape). */
function usesCapsules(regularWidth: boolean, bounds: Rect): boolean {
  return regularWidth && bounds.height >= READER_DOCK_MIN_HEIGHT;
}

/** Stage-local tap exclusions for the capsules that float over the page. */
function capsuleExclusions(chrome: MobileReaderChromeLayout, stage: Rect): Rect[] {
  if (chrome.kind !== "capsules") return [];
  const pieces = [chrome.back, chrome.title, chrome.actions, chrome.scrubber].filter((rect): rect is Rect => rect !== null);
  return pieces
    .map((rect) => shrink(rect, uniform(-READER_CAPSULE_GAP / 2)))
    .filter((rect) => intersects(rect, stage))
    .map((rect) => toLocal(rect, stage));
}

export function mobileReaderPoseLayout(input: MobileReaderPoseLayoutInput): MobileReaderPoseLayout {
  const adaptive = mobileAdaptiveLayout(input.layout);
  const width = finite(input.layout.width);
  const height = finite(input.layout.height);
  const bounds: Rect = { x: 0, y: 0, width, height };
  const insets = sanitizeInsets(input.layout.safeAreaInsets ?? input.fallbackInsets);
  const occlusions = adaptive.occlusions;
  const multiPage = input.pageCount > 1;
  const trailingSide: Side = (input.layout.layoutDirection ?? "ltr") === "rtl" ? "left" : "right";
  const leadingSide: Side = trailingSide === "right" ? "left" : "right";

  if (adaptive.posture === "notebook" && adaptive.panels.length === 2) {
    const [topPane, bottomPane] = adaptive.panels;
    const paneState: MobileReaderNotebookPaneState = input.notebookPane
      ?? (input.learningOpen ? "studyDesk" : input.paged ? "trackpad" : "continuous");
    if (paneState === "continuous") {
      // Scroll / long strip: one viewport through both panes, the fold a thin
      // band the strip passes under. The capsule row sits atop the top pane
      // and the scrubber at the bottom of the bottom pane (HIG: a pane's
      // controls sit on that pane; nothing on the fold).
      const chrome = capsuleChrome({
        frame: bounds,
        bounds,
        insets,
        occlusions,
        leading: topPane,
        trailing: topPane,
        scrubberRegion: bottomPane,
        leadingSide,
        actionCount: input.actionCount ?? 3,
        titleCenterX: topPane.x + topPane.width / 2,
      });
      return {
        posture: "notebook",
        bounds,
        safeInsets: insets,
        stage: bounds,
        constrained: false,
        twoPageAvailable: false,
        spread: false,
        spreadFallback: false,
        foldGap: null,
        foldBand: adaptive.fold,
        chrome,
        chromePinned: false,
        learning: { presentation: "sheet" },
        modalFrame: topPane,
        // The settings popover stays in the bottom pane, above the scrubber,
        // never across the fold.
        popover: {
          frame: mobileWindowUnoccludedRect(shrink(bottomPane, mobileReaderSafePadding(bottomPane, bounds, insets)), occlusions),
          bottomGap: Math.max(
            READER_DOCK_GAP,
            bottomPane.y + bottomPane.height - mobileReaderSafePadding(bottomPane, bounds, insets).bottom - chrome.scrubber.y + READER_DOCK_GAP,
          ),
        },
        tapExclusions: capsuleExclusions(chrome, bounds),
      };
    }
    // Paged: immersive, full-bleed page in the top pane (the reader hides the
    // status bar while reading); only the fold is avoided. The bottom pane
    // keeps the safe area.
    const stage = topPane;
    // The top pane is landscape-shaped (Duo 669×455.5): two portrait pages fit
    // at the same height as one, so the user's two-page setting applies there
    // like a flat spread (seamless, same pairing/RTL rules). The bottom pane
    // steps by spread.
    const twoPageAvailable = input.paged
      && multiPage
      && stageHoldsSpread(topPane)
      && topPane.width / 2 >= READER_BOOK_MIN_PANE
      && topPane.height >= READER_BOOK_MIN_PANE;
    const spread = input.twoPage && twoPageAvailable;
    const padding = mobileReaderSafePadding(bottomPane, bounds, insets);
    const pane = mobileWindowUnoccludedRect(shrink(bottomPane, padding), occlusions);
    const docked = paneState === "studyDesk" && pane.height >= READER_CONSOLE_DOCK_MIN_HEIGHT;
    const state = paneState === "studyDesk" && !docked ? "trackpad" : paneState;
    const row = capsuleChrome({
      frame: topPane,
      bounds,
      insets,
      occlusions,
      leading: topPane,
      trailing: topPane,
      scrubberRegion: topPane,
      leadingSide,
      actionCount: input.actionCount ?? 3,
      titleCenterX: topPane.x + topPane.width / 2,
    });
    const chrome: MobileReaderChromeLayout = {
      kind: "console",
      frame: bottomPane,
      padding,
      pane,
      state,
      back: row.back,
      title: row.title,
      actions: row.actions,
    };
    return {
      posture: "notebook",
      bounds,
      safeInsets: insets,
      stage,
      constrained: true,
      twoPageAvailable,
      spread,
      spreadFallback: false,
      foldGap: null,
      foldBand: null,
      chrome,
      chromePinned: true,
      learning: docked
        ? { presentation: "docked", frame: shrink(pane, uniform(READER_DOCK_GAP)), region: "console" }
        : { presentation: "sheet" },
      modalFrame: bottomPane,
      popover: mobileReaderPopoverPlacement(chrome),
      // The capsule row over the page (only while the chrome is shown).
      tapExclusions: [row.back, row.title, row.actions]
        .filter((rect): rect is Rect => rect !== null)
        .map((rect) => toLocal(shrink(rect, uniform(-READER_CAPSULE_GAP / 2)), stage)),
    };
  }

  if (adaptive.posture === "book" && adaptive.panels.length === 2) {
    const panes = adaptive.panels;
    // Pages are immersive and full-bleed per pane, exactly like phones: the
    // reader hides the status bar while reading, so the vertical bar column is
    // empty and trimming it (84pt) made both pages fit a narrower pane with
    // tall black bands. Only the fold is avoided; controls keep the safe area.
    const pagePanes = panes;
    const startIndex = input.rtl ? 1 : 0;
    const otherIndex = 1 - startIndex;
    const usablePair = input.paged && pagePanes.every(
      (pane) => pane.width >= READER_BOOK_MIN_PANE && pane.height >= READER_BOOK_MIN_PANE,
    );
    const twoPageAvailable = usablePair && multiPage;
    const otherPane = mobileWindowUnoccludedRect(
      shrink(panes[otherIndex], mobileReaderSafePadding(panes[otherIndex], bounds, insets)),
      occlusions,
    );
    const docked = input.learningOpen
      && otherPane.width >= READER_BOOK_DOCK_MIN_WIDTH
      && otherPane.height >= READER_CONSOLE_DOCK_MIN_HEIGHT;
    const spread = !docked && input.twoPage && twoPageAvailable;
    const stage = spread ? bounds : pagePanes[startIndex];
    const spreadSlots = spread ? pagePanes.map((pane) => toLocal(pane, stage)) : undefined;
    const foldGap = spreadSlots
      ? { start: spreadSlots[0].x + spreadSlots[0].width, end: spreadSlots[1].x }
      : null;
    // Capsules snap per pane, nothing on the fold (HIG: a pane's controls sit
    // atop that pane): Back + title in the leading pane, actions in the
    // trailing pane beside the status bar, the scrubber centred in the
    // reading-start pane. A docked panel owns the other pane, so then every
    // piece stays in the page's pane.
    const leadingIndex = leadingSide === "left" ? 0 : 1;
    const trailingIndex = 1 - leadingIndex;
    const chromeFrame = docked ? panes[startIndex] : bounds;
    const chrome = capsuleChrome({
      frame: chromeFrame,
      bounds,
      insets,
      occlusions,
      leading: docked ? panes[startIndex] : panes[leadingIndex],
      trailing: docked ? panes[startIndex] : panes[trailingIndex],
      scrubberRegion: panes[startIndex],
      leadingSide,
      actionCount: input.actionCount ?? 3,
      titleCenterX: docked
        ? panes[startIndex].x + panes[startIndex].width / 2
        : panes[leadingIndex].x + panes[leadingIndex].width / 2,
    });
    return {
      posture: "book",
      bounds,
      safeInsets: insets,
      stage,
      constrained: true,
      spreadSlots,
      twoPageAvailable,
      spread,
      spreadFallback: docked && input.twoPage && twoPageAvailable,
      foldGap,
      foldBand: null,
      chrome,
      chromePinned: false,
      learning: docked
        ? { presentation: "docked", frame: shrink(otherPane, uniform(READER_DOCK_GAP)), region: "pane" }
        : { presentation: "sheet" },
      // Reader-owned cards centre in the page's pane, between the capsule rows.
      modalFrame: panes[startIndex],
      popover: mobileReaderPopoverPlacement(chrome),
      tapExclusions: capsuleExclusions(chrome, stage),
    };
  }

  // Flat: no active fold.
  const unoccluded = mobileWindowUnoccludedRect(bounds, occlusions);
  // Side safe area first, then occlusions (a camera in the corner must not shorten the page region).
  const safeHorizontal = mobileWindowUnoccludedRect(horizontalSafe(bounds, bounds, insets), occlusions);
  // Immersive page: full-bleed like phones (status bar hidden while reading;
  // chrome and the status bar float over the page when shown, so toggling the
  // controls never resizes it). Dock and cards keep the safe area.
  const baseStage = bounds;
  const verticalPadding = mobileReaderSafePadding(safeHorizontal, bounds, insets);
  const dockSide = trailingSide;
  const dockWidth = mobileReaderDockWidth(safeHorizontal.width);
  const dockable = input.learningOpen
    && adaptive.regularWidth
    && safeHorizontal.height >= READER_DOCK_MIN_HEIGHT
    && safeHorizontal.width - dockWidth >= READER_DOCK_MIN_STAGE_WIDTH;
  let stage = baseStage;
  let dockFrame: Rect | null = null;
  if (dockable) {
    const dockX = dockSide === "right"
      ? safeHorizontal.x + safeHorizontal.width - dockWidth
      : safeHorizontal.x;
    dockFrame = shrink(
      { x: dockX, y: safeHorizontal.y + verticalPadding.top, width: dockWidth, height: safeHorizontal.height - verticalPadding.top - verticalPadding.bottom },
      uniform(READER_DOCK_GAP),
    );
    stage = dockSide === "right"
      ? { ...baseStage, width: Math.max(1, dockX - baseStage.x) }
      : { ...baseStage, x: dockX + dockWidth, width: Math.max(1, baseStage.x + baseStage.width - dockX - dockWidth) };
  }
  const twoPageAvailable = input.paged && multiPage && stageHoldsSpread(baseStage);
  const spread = input.twoPage && input.paged && multiPage && stageHoldsSpread(stage);
  const constrained = !sameRect(stage, bounds);

  let chrome: MobileReaderChromeLayout;
  if (usesCapsules(adaptive.regularWidth, bounds)) {
    // Safari on the Duo inner display: one row of separate capsules on the
    // status-bar row, the title centred on the page it describes. With a
    // dock the row stays over the page, never over the panel.
    chrome = capsuleChrome({
      frame: stage,
      bounds,
      insets,
      occlusions,
      leading: stage,
      trailing: stage,
      scrubberRegion: stage,
      leadingSide,
      actionCount: input.actionCount ?? 3,
      titleCenterX: stage.x + stage.width / 2,
    });
  } else {
    const frame = dockFrame ? stage : unoccluded;
    chrome = { kind: "horizontal", frame, padding: mobileReaderSafePadding(frame, bounds, insets) };
  }
  return {
    posture: "flat",
    bounds,
    safeInsets: insets,
    stage,
    constrained,
    twoPageAvailable,
    spread,
    spreadFallback: Boolean(dockFrame) && input.twoPage && twoPageAvailable && !spread,
    foldGap: null,
    foldBand: null,
    chrome,
    chromePinned: false,
    learning: dockFrame ? { presentation: "docked", frame: dockFrame, region: "side" } : { presentation: "sheet" },
    modalFrame: dockFrame ? stage : unoccluded,
    popover: mobileReaderPopoverPlacement(chrome),
    tapExclusions: capsuleExclusions(chrome, stage),
  };
}

function uniform(value: number): Insets {
  return { top: value, left: value, bottom: value, right: value };
}

/** True when the touch point (stage-local) must not act as a page tap. */
export function mobileReaderTapExcluded(
  point: { x: number; y: number },
  exclusions: readonly Rect[] | undefined,
  foldGap: { start: number; end: number } | null | undefined,
): boolean {
  if (foldGap && point.x > foldGap.start && point.x < foldGap.end) return true;
  return (exclusions ?? []).some((rect) =>
    point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height);
}

/**
 * Which learning surface owns a docked panel when several report visible
 * (the native hand-offs can briefly overlap). The detail view wins, then the
 * conversation, then the transcript list.
 */
export function mobileReaderDockedLearningSurface(visible: {
  transcript: boolean;
  ocr: boolean;
  chat: boolean;
}): "ocr" | "chat" | "transcript" | null {
  if (visible.ocr) return "ocr";
  if (visible.chat) return "chat";
  if (visible.transcript) return "transcript";
  return null;
}

/** Rect → absolute style for a view inside the reader root. */
export function mobileReaderAbsoluteRect(rect: Rect) {
  return { position: "absolute" as const, left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

/**
 * Distances from the reader edges to `frame`, with the safe area added on the
 * edges where the frame meets the window — for overlays that keep a
 * full-reader scrim but centre their card inside one pane. Null when the
 * frame is the whole reader (the overlay's own safe-area handling applies).
 */
export function mobileReaderFrameInsets(
  frame: Rect,
  bounds: Rect,
  safeInsets: Insets,
): Insets | null {
  if (sameRect(frame, bounds)) return null;
  const pad = mobileReaderSafePadding(frame, bounds, safeInsets);
  return {
    top: frame.y - bounds.y + pad.top,
    left: frame.x - bounds.x + pad.left,
    bottom: bounds.y + bounds.height - frame.y - frame.height + pad.bottom,
    right: bounds.x + bounds.width - frame.x - frame.width + pad.right,
  };
}
