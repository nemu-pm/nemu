import { mobileAdaptiveLayout, type MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import { resolveReaderSpreadWanted, type ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
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
 * | pose                                  | stage                         | chrome                           |
 * |---------------------------------------|-------------------------------|----------------------------------|
 * | flat, compact width or short (phones) | full bleed                    | Back · title · more (⋯) on top, scrubber + actions on the bottom row |
 * | flat with the system vertical bar (Duo outer display, a Split View half) | beside the bar | Back + actions in the system bar; our title capsule top-leading + the scrubber centred on the window |
 * | flat, regular width, no vertical bar (tablets, unfolded Android, Duo inner display full-screen) | full bleed | capsule row on the status-bar row + scrubber centred on the display |
 * | book (vertical fold)                  | one page per pane / reading-start pane | capsules snapped per pane: Back + title leading, actions trailing (or Back + actions in the system bar), scrubber in the reading-start pane |
 * | notebook (horizontal fold), paged     | top pane                      | capsule row over the top pane + the bottom pane (trackpad / filmstrip) |
 * | notebook, scroll / long strip         | the whole display (the fold is a band the strip passes under) | capsule row + scrubber, like flat |
 *
 * Japanese Learning tools are never part of this layout: in every pose they
 * are the same system sheets as on a phone, which the system itself moves off
 * the fold (HIG: "alerts, context menus, and sheets automatically move to
 * account for the fold").
 *
 * Vertical bar (`mobileReaderVerticalBarPolicy`): the Duo outer display and
 * a window that does not fill its screen (Split View) keep the system
 * vertical bar, which carries Back and the actions (`sideBar`); the inner
 * display full-screen opts out in every posture and uses the capsule row,
 * like the Android foldable reader.
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
/** Gap under a status island when the row cannot share its band (compact outer display). */
export const READER_CAPSULE_ROW_TIGHT_GAP = 4;
/** The row only shares the status band when the title capsule keeps at least this width there. */
export const READER_CAPSULE_SHARED_ROW_MIN_TITLE = 200;
/** The top scrim fades out this far below the lower of the top inset and the capsule row. */
export const READER_TOP_SCRIM_FEATHER = 24;
/** Bottom scrubber capsule: the slider keeps its 48pt touch target. */
export const READER_SCRUBBER_CAPSULE_HEIGHT = 48;
export const READER_SCRUBBER_CAPSULE_MAX_WIDTH = 480;
/** Scrubber sits this far above the bottom safe-area edge (home indicator band), never closer than the edge gap. */
export const READER_SCRUBBER_CAPSULE_BOTTOM_LIFT = 8;
/** Gap between the settings popover and the edge of the region it sits in. */
export const READER_POPOVER_GAP = 8;
/** A fold pane narrower/shorter than this cannot hold a readable page. */
export const READER_BOOK_MIN_PANE = 160;

export type MobileReaderChromeLayout =
  | {
      /**
       * Liquid Glass capsule chrome, on every device (Safari / Photos on
       * iPhone Duo): separate glass pieces on the top row plus a scrubber
       * capsule at the bottom. Compact width moves the actions beside the
       * scrubber, within thumb reach. In book posture the pieces snap per
       * pane and nothing sits on the fold.
       */
      kind: "capsules";
      frame: Rect;
      padding: Insets;
      /** Leading circular Back button. */
      back: Rect;
      /** Title / chapter / n-of-N capsule; null when the row has no room for it. */
      title: Rect | null;
      /**
       * Trailing circular "more" (⋯) button mirroring Back, so the title sits
       * between two equal pieces. Only when the actions ride the bottom row
       * (compact width): everywhere else the actions capsule already holds
       * the top row's trailing end. Null otherwise.
       */
      more: Rect | null;
      /** Trailing actions capsule (plugins, dual read, settings). */
      actions: Rect;
      /**
       * Which row carries the actions capsule: the status-bar row (regular
       * width, Safari), or the bottom row beside the scrubber (compact width
       * with a hardware corner — iPhone Duo outer display — where the top
       * row only has room for Back and the title clear of the camera).
       */
      actionsRow: "top" | "bottom";
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
       * Notebook, paged: the bottom pane is always there (trackpad or
       * filmstrip) and the top pane gets the flat capsule row (Back · title ·
       * actions) when the chrome is shown.
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
  /**
   * The three-way page layout choice. When given it replaces `twoPage`;
   * `auto` is decided here from the stage the pages actually sit in (the
   * top pane in the notebook pose, the whole window across a book fold).
   */
  spreadMode?: ReaderSpreadMode;
  /** Right-to-left reading order. */
  rtl: boolean;
  /**
   * Notebook posture: what the bottom pane holds (`resolveMobileReaderNotebookPane`).
   * Omitted: the trackpad (paged) or the continuous strip (scroll).
   */
  notebookPane?: MobileReaderNotebookPaneState;
  /** Icon buttons in the trailing actions capsule (capsule chrome). Default 3. */
  actionCount?: number;
  /**
   * The system vertical bar is in use (`mobileReaderVerticalBarPolicy`): it
   * carries Back and the actions, and pages keep clear of its side inset
   * (they sit beside the bar, not under it).
   */
  sideBar?: boolean;
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
  /** The pose can show a spread: drives the two-page setting. */
  twoPageAvailable: boolean;
  /** A spread is rendered right now. */
  spread: boolean;
  /** Stage-local x interval (the fold) that must never be a tap target. */
  foldGap: { start: number; end: number } | null;
  /** Notebook continuous strip: the fold band drawn over the strip (reader-local). */
  foldBand: Rect | null;
  chrome: MobileReaderChromeLayout;
  /** Chrome is always visible (notebook console). */
  chromePinned: boolean;
  /** Where reader-owned cards (end of chapter) are centred. */
  modalFrame: Rect;
  /** Reader settings popover: the region it may occupy and its gap to that region's bottom edge. */
  popover: { frame: Rect; bottomGap: number };
  /** Stage-local rectangles owned by chrome: taps there never turn pages. */
  tapExclusions: Rect[];
  /**
   * Side insets a full-bleed (unconstrained) page must keep clear: the safe
   * area minus what only the status bar island explains, so showing or
   * hiding the chrome (and the status bar with it) never resizes the page.
   */
  pageSideInsets: { left: number; right: number };
};

const EPSILON = 0.5;
const NO_SIDE_INSETS: { left: number; right: number } = { left: 0, right: 0 };

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
 * Safari's, its bottom 12pt above the safe-area edge; a band too short for
 * those margins (the outer display) centres the row on it. Otherwise (a
 * status bar spanning the top, or none) it sits just below the top inset.
 * `mobileReaderCapsuleRowTops` gives both candidates; `capsuleChrome` only
 * shares the band when the title capsule keeps a useful width there.
 */
export function mobileReaderCapsuleRowTop(bounds: Rect, insets: Insets, occlusions: Rect[], height = READER_CAPSULE_HEIGHT): number {
  const rows = mobileReaderCapsuleRowTops(bounds, insets, occlusions, height);
  return rows.shared ?? rows.below;
}

/** The two places the capsule row can sit: in the status band beside an island (if any), or below the top inset. */
export function mobileReaderCapsuleRowTops(
  bounds: Rect,
  insets: Insets,
  occlusions: Rect[],
  height = READER_CAPSULE_HEIGHT,
): { shared: number | null; below: number } {
  const island = statusIsland(bounds, insets, occlusions);
  const top = Math.max(insets.top, 0);
  if (!island) return { shared: null, below: bounds.y + top + READER_CAPSULE_ROW_TOP_GAP };
  const band = top;
  const shared = band >= height + READER_CAPSULE_ROW_BOTTOM_GAP + READER_CAPSULE_ROW_TOP_GAP
    ? bounds.y + band - READER_CAPSULE_ROW_BOTTOM_GAP - height
    : bounds.y + Math.max(READER_CAPSULE_ROW_TIGHT_GAP, Math.round((band - height) / 2));
  // Below an island the row tucks right under it: no empty band.
  return { shared, below: bounds.y + band + READER_CAPSULE_ROW_TIGHT_GAP };
}

/**
 * The status bar island that can share the capsule row: an occlusion hanging
 * from the top edge, narrower than most of the window, whose bottom is the
 * top safe-area edge (a vertical bar column is not: it has no top inset).
 */
function statusIsland(bounds: Rect, insets: Insets, occlusions: Rect[]): Rect | null {
  return topOcclusions(bounds, occlusions).find((rect) =>
    rect.width < bounds.width * 0.6
    && insets.top > 0.5
    && Math.abs(rect.y + rect.height - (bounds.y + insets.top)) <= 2) ?? null;
}

/**
 * Icon buttons in the actions capsule: Japanese Learning contributes two
 * (detect text, nemu chat), every other enabled plugin one, plus the bilingual
 * toggle when shown and settings.
 */
export function mobileReaderCapsuleActionSlots(input: {
  enabledPluginIds: readonly string[];
  bilingualToggle: boolean;
}): number {
  const pluginSlots = input.enabledPluginIds.reduce(
    (count, id) => count + (id === "japanese-learning" ? 2 : 1),
    0,
  );
  return pluginSlots + (input.bilingualToggle ? 1 : 0) + 1;
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
type CapsuleChromeInput = {
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
  /** Put the actions capsule beside the scrubber instead of on the top row (compact width). */
  actionsRow?: "top" | "bottom";
  /**
   * The system vertical bar carries Back and the actions (Duo outer display):
   * only the title capsule (top-leading) and the scrubber are ours.
   */
  titleOnly?: boolean;
};

function capsuleChrome(input: CapsuleChromeInput): Extract<MobileReaderChromeLayout, { kind: "capsules" }> {
  const rows = mobileReaderCapsuleRowTops(input.bounds, input.insets, input.occlusions, READER_CAPSULE_HEIGHT);
  if (rows.shared !== null) {
    const shared = capsuleChromeAt(input, rows.shared);
    // Regular width (Safari on the inner display) always shares the band.
    // Compact (the outer display) only when the title keeps a useful width;
    // otherwise the row moves up right under the island instead of
    // squeezing the title.
    if (input.actionsRow !== "bottom") return shared;
    if (shared.title && shared.title.width >= READER_CAPSULE_SHARED_ROW_MIN_TITLE) return shared;
  }
  return capsuleChromeAt(input, rows.below);
}

function capsuleChromeAt(input: CapsuleChromeInput, rowTop: number): Extract<MobileReaderChromeLayout, { kind: "capsules" }> {
  const { bounds, insets, occlusions, leading, trailing, leadingSide } = input;
  const h = READER_CAPSULE_HEIGHT;
  const pad = (rect: Rect) => mobileReaderSafePadding(rect, bounds, insets);
  const ltr = leadingSide === "left";
  const leadPad = pad(leading);
  const trailPad = pad(trailing);
  // Leading pieces start at the region's leading edge; the actions capsule
  // hugs the trailing edge (left of the status bar island when it shares the row).
  const actionsWidth = mobileReaderCapsuleActionsWidth(input.actionCount);
  const titleOnly = input.titleOnly === true;
  const backWidth = titleOnly ? 0 : h;
  const back: Rect = ltr
    ? { x: rowLeadingLimit(leading, rowTop, h, occlusions, leadPad.left), y: rowTop, width: backWidth, height: h }
    : { x: rowTrailingLimit(leading, rowTop, h, occlusions, leadPad.right) - backWidth, y: rowTop, width: backWidth, height: h };
  const bottomActions = input.actionsRow === "bottom" && !titleOnly;
  const actionsSize = titleOnly ? 0 : actionsWidth;
  const actions: Rect = ltr
    ? { x: rowTrailingLimit(trailing, rowTop, h, occlusions, trailPad.right) - actionsSize, y: rowTop, width: actionsSize, height: h }
    : { x: rowLeadingLimit(trailing, rowTop, h, occlusions, trailPad.left), y: rowTop, width: actionsSize, height: h };
  // An occlusion inside the region (the inner camera while it runs) can still
  // sit where the actions landed: slide them past it, toward the leading side.
  const bandOcclusions = occlusions.filter((rect) => intersects({ x: bounds.x, y: rowTop, width: bounds.width, height: h }, rect));
  for (let guard = 0; !bottomActions && guard < bandOcclusions.length; guard += 1) {
    const hit = bandOcclusions.find((rect) => intersects(actions, rect));
    if (!hit) break;
    actions.x = ltr ? hit.x - READER_CAPSULE_GAP / 2 - actions.width : hit.x + hit.width + READER_CAPSULE_GAP / 2;
  }
  // Title: centred on `titleCenterX`, clamped between Back and the actions
  // (or the leading region's inner edge when the actions live in another pane,
  // or the row's trailing limit when they sit in the bottom row).
  const sameRow = sameRect(leading, trailing) && !bottomActions;
  const rowEnd = ltr
    ? rowTrailingLimit(leading, rowTop, h, occlusions, leadPad.right)
    : rowLeadingLimit(leading, rowTop, h, occlusions, leadPad.left);
  // With the actions in the bottom row, the "more" circle takes the top row's
  // trailing end (clear of a camera, like Back is on its side) and the title
  // ends a gap before it.
  const more: Rect | null = bottomActions
    ? { x: ltr ? rowEnd - h : rowEnd, y: rowTop, width: h, height: h }
    : null;
  const titleEnd = more ? (ltr ? more.x - READER_CAPSULE_GAP : more.x + h + READER_CAPSULE_GAP) : rowEnd;
  let minX = ltr
    ? back.x + (titleOnly ? 0 : h + READER_CAPSULE_GAP)
    : sameRow ? actions.x + actions.width + READER_CAPSULE_GAP : bottomActions ? titleEnd : leading.x + READER_CAPSULE_EDGE;
  let maxX = ltr
    ? (sameRow ? actions.x - READER_CAPSULE_GAP : bottomActions ? titleEnd : leading.x + leading.width - READER_CAPSULE_EDGE)
    : back.x - (titleOnly ? 0 : READER_CAPSULE_GAP);
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
    const width = titleOnly
      ? Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, available)
      : centredWidth >= READER_CAPSULE_TITLE_FULL_MIN_WIDTH
        ? centredWidth
        : Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, available);
    const centred = input.titleCenterX - width / 2;
    // Title only (the bar carries Back): top-leading, like a navigation title.
    const x = titleOnly
      ? ltr ? minX : maxX - width
      : Math.max(minX, Math.min(maxX - width, centred));
    title = { x: Math.round(x), y: rowTop, width: Math.round(width), height: h };
  }
  return capsuleChromeFinish(input, rowTop, back, title, more, actions, bottomActions);
}

function capsuleChromeFinish(
  input: CapsuleChromeInput,
  rowTop: number,
  back: Rect,
  title: Rect | null,
  more: Rect | null,
  actions: Rect,
  bottomActions: boolean,
): Extract<MobileReaderChromeLayout, { kind: "capsules" }> {
  const { bounds, insets, occlusions } = input;
  const h = READER_CAPSULE_HEIGHT;
  const pad = (rect: Rect) => mobileReaderSafePadding(rect, bounds, insets);
  const ltr = input.leadingSide === "left";
  const actionsWidth = actions.width;
  // Scrubber: centred in its region above the home-indicator band.
  const region = input.scrubberRegion;
  const regionPad = pad(region);
  const sh = READER_SCRUBBER_CAPSULE_HEIGHT;
  const bottomGap = Math.max(READER_CAPSULE_EDGE, regionPad.bottom - READER_SCRUBBER_CAPSULE_BOTTOM_LIFT);
  const scrubberY = region.y + region.height - bottomGap - sh;
  let scrubber: Rect;
  if (bottomActions) {
    // Compact: scrubber from the leading edge, the actions capsule at the
    // trailing end of the same row (vertically centred on it), both clear of
    // a camera in a bottom corner.
    const start = rowLeadingLimit(region, scrubberY, sh, occlusions, regionPad.left);
    const end = rowTrailingLimit(region, scrubberY, sh, occlusions, regionPad.right);
    actions.y = scrubberY + (sh - h) / 2;
    actions.x = ltr ? end - actionsWidth : start;
    const scrubberStart = ltr ? start : start + actionsWidth + READER_CAPSULE_GAP;
    const scrubberEnd = ltr ? end - actionsWidth - READER_CAPSULE_GAP : end;
    scrubber = {
      x: Math.round(scrubberStart),
      y: scrubberY,
      width: Math.round(Math.max(0, Math.min(READER_SCRUBBER_CAPSULE_MAX_WIDTH, scrubberEnd - scrubberStart))),
      height: sh,
    };
  } else {
    const sideRoom = Math.max(READER_CAPSULE_EDGE, regionPad.left) + Math.max(READER_CAPSULE_EDGE, regionPad.right);
    const scrubberWidth = Math.max(0, Math.min(READER_SCRUBBER_CAPSULE_MAX_WIDTH, region.width - sideRoom));
    // Centre on the region itself, not on its padded span: the iPhone Duo
    // reports its top-corner status column as a one-sided inset, which would
    // push a padded-span centre off the display's middle. Only slide off
    // centre when a real side inset would otherwise be overlapped.
    const minLeft = region.x + Math.max(READER_CAPSULE_EDGE, regionPad.left);
    const maxLeft = region.x + region.width - Math.max(READER_CAPSULE_EDGE, regionPad.right) - scrubberWidth;
    const centredLeft = region.x + (region.width - scrubberWidth) / 2;
    scrubber = {
      x: Math.round(Math.max(minLeft, Math.min(maxLeft, centredLeft))),
      y: scrubberY,
      width: Math.round(scrubberWidth),
      height: sh,
    };
    // A running camera near the bottom edge (inner landscape-right): lift the
    // scrubber above it rather than under it.
    for (const rect of occlusions) {
      if (intersects(scrubber, rect)) scrubber.y = Math.min(scrubber.y, rect.y - READER_CAPSULE_GAP / 2 - sh);
    }
  }
  const contentTop = rowTop + h + READER_CAPSULE_GAP;
  const contentBottom = bottomActions ? Math.min(scrubber.y, actions.y) : scrubber.y;
  // Cards, notices and the FAB stay inside the side safe area too.
  const content: Rect = {
    x: region.x + regionPad.left,
    y: contentTop,
    width: Math.max(0, region.width - regionPad.left - regionPad.right),
    height: Math.max(0, contentBottom - READER_CAPSULE_GAP - contentTop),
  };
  const topScrim: Rect = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: Math.max(insets.top, rowTop + h - bounds.y) + READER_TOP_SCRIM_FEATHER,
  };
  return {
    kind: "capsules",
    frame: input.frame,
    padding: pad(input.frame),
    back,
    title,
    more,
    actions,
    actionsRow: bottomActions ? "bottom" : "top",
    scrubber,
    content,
    topScrim,
  };
}

/** The user's spread choice, resolved for the stage the pages sit in. */
function wantsSpread(input: Pick<MobileReaderPoseLayoutInput, "twoPage" | "spreadMode">, stage: Rect): boolean {
  return resolveReaderSpreadWanted(input.spreadMode ?? (input.twoPage ? "double" : "single"), stage);
}

/** Two readable pages fit side by side only in a wider-than-tall stage. */
function stageHoldsSpread(stage: Rect): boolean {
  return stage.width / Math.max(1, stage.height) > 1;
}

/**
 * The reader settings popover's region and its gap above that region's
 * bottom edge: between the capsule rows, or inside the console for notebook.
 */
export function mobileReaderPopoverPlacement(chrome: MobileReaderChromeLayout): { frame: Rect; bottomGap: number } {
  // Notebook: inside the bottom pane, the half the hands rest on.
  if (chrome.kind === "console") return { frame: chrome.pane, bottomGap: READER_POPOVER_GAP };
  return { frame: chrome.content, bottomGap: READER_POPOVER_GAP };
}

/**
 * The reader's iPhone Duo vertical-bar policy (owner decision 2026-09-29,
 * which overrides the HIG's "controls remain on the side when the device
 * opens in landscape"):
 *
 * - The OUTER display (folded, portrait and landscape) and any window that
 *   does not fill its screen (either half of Split View, Slide Over, a
 *   resizable window) keep the system vertical bar: vertical status bar,
 *   Back on top of the vertical axis, then the actions (`sideBar`). HIG:
 *   "When two apps share the inner display with Split View multitasking,
 *   each one places controls along its outer edge."
 * - The INNER display full-screen, in every posture (flat, book, notebook,
 *   portrait and landscape), opts out (`optOut`,
 *   `UIVerticalBarBehavior.disabled`) and looks like the Android foldable
 *   reader: horizontal status bar, Back / title / actions capsules on the top
 *   row, the scrubber centred on the whole display. The opt-out is a stable
 *   per-window choice (the window's display and size), never a function of
 *   the reader's own state, as `preferredVerticalBarBehavior` asks.
 *
 * "Inner display" is read from the window, not a device model: a full-screen
 * window whose display has a fold reports a division region (active or not —
 * the observer includes inactive regions), the outer display never does.
 * Android foldables report their fold too and have no vertical bar, so the
 * opt-out is a no-op there. Before the first observer event there is no
 * window information: no opt-out, no side bar (the edge decides).
 */
export function mobileReaderVerticalBarPolicy(
  layout: Partial<Pick<MobileWindowLayout, "verticalBarEdge" | "divisions" | "fillsScreen" | "hinge">>,
): {
  optOut: boolean;
  sideBar: boolean;
} {
  const innerFullScreen = layout.fillsScreen !== false
    && (layout.divisions?.length ?? 0) > 0
    // A closed hinge means the outer display, whatever regions are reported.
    && layout.hinge !== "closed";
  if (innerFullScreen) return { optOut: true, sideBar: false };
  const edge = layout.verticalBarEdge === "leading" || layout.verticalBarEdge === "trailing";
  return { optOut: false, sideBar: edge };
}

/**
 * Side insets for a full-bleed page. A side inset that only exists because
 * of a status bar island in a top corner (the iPhone Duo reports its status
 * column as a trailing inset while the status bar is shown) is dropped: the
 * island floats over the page like the chrome does, and keeping it would
 * resize the page every time the controls toggle. Real side cut-outs (a
 * landscape phone's Dynamic Island) are centred on the edge and are kept.
 */
export function mobileReaderPageSideInsets(bounds: Rect, insets: Insets, occlusions: Rect[]): { left: number; right: number } {
  const explained = (side: Side, inset: number) => occlusions.some((rect) => {
    if (!(rect.width > 0 && rect.height > 0) || rect.height >= bounds.height / 2) return false;
    if (rect.y > bounds.y + EPSILON) return false;
    const touches = side === "left"
      ? rect.x <= bounds.x + EPSILON
      : rect.x + rect.width >= bounds.x + bounds.width - EPSILON;
    return touches && rect.width >= inset - 1;
  });
  return {
    left: insets.left > 0 && !explained("left", insets.left) ? insets.left : 0,
    right: insets.right > 0 && !explained("right", insets.right) ? insets.right : 0,
  };
}

/**
 * The widest vertical-bar side inset seen in ONE bar configuration, so pages
 * beside the outer display's system bar keep their size while the column's
 * inset comes and goes with the chrome (status bar shown/hidden).
 *
 * Xcode's App Resizability guidance: "Never store a safe area inset. An inset
 * read once describes one configuration." So the latch only lives while the
 * configuration is unchanged and is dropped the moment it changes:
 * - the bar is disabled or not in use (`key` null) — re-enabling starts fresh;
 * - the window size changes (display switch, Split View, size class);
 * - the reported bar edge changes;
 * - the bar column moves to the other side at the same size (closed
 *   landscape-left ↔ landscape-right, Split View left ↔ right app).
 */
export type MobileReaderSideInsetLatch = { key: string; left: number; right: number };

/** Configuration key for the side-inset latch; null when the reader does not keep the system bar. */
export function mobileReaderSideInsetLatchKey(layout: MobileWindowLayout | null, sideBar: boolean): string | null {
  if (!layout || !sideBar) return null;
  return `${Math.round(finite(layout.width))}x${Math.round(finite(layout.height))}:${layout.verticalBarEdge ?? ""}`;
}

/** One-sided horizontal inset (a bar column), or null when symmetric. */
function insetColumnSide(insets: { left: number; right: number }): Side | null {
  if (Math.abs(insets.left - insets.right) < 20) return null;
  return insets.left > insets.right ? "left" : "right";
}

export function mobileReaderNextSideInsetLatch(
  previous: MobileReaderSideInsetLatch | null,
  key: string | null,
  insets: { left: number; right: number } | null | undefined,
): MobileReaderSideInsetLatch | null {
  if (!key) return null;
  const current = previous?.key === key ? previous : null;
  if (!insets) return current;
  const left = finite(insets.left);
  const right = finite(insets.right);
  if (!current) return { key, left, right };
  const latchedSide = insetColumnSide(current);
  const seenSide = insetColumnSide({ left, right });
  if (latchedSide && seenSide && latchedSide !== seenSide) return { key, left, right };
  const next = { key, left: Math.max(current.left, left), right: Math.max(current.right, right) };
  return next.left === current.left && next.right === current.right ? current : next;
}

/**
 * How long a "partially open" hinge may lead the fold region before the
 * reader stops anticipating it and falls back to the flat layout. The region
 * normally follows within a layout pass or two; if it has not turned active
 * by then the region (not the hinge) is right.
 */
export const MOBILE_READER_HINGE_HINT_TIMEOUT_MS = 400;

/**
 * Width the anticipated fold takes: centred on the inactive region's centre
 * line, 20pt either side — the frame iOS reports for an ACTIVE division on
 * iPhone Duo (Apple's interaction margins, measured 455.5–495.5). The inactive
 * region's own width is never used: Apple says it is zero while flat, the
 * 27.1 simulator reports 40pt.
 */
export const MOBILE_READER_ANTICIPATED_FOLD_WIDTH = 40;

/** The single inactive division that would split the window, when the hinge leads it. */
function pendingHingeDivision(layout: MobileWindowLayout) {
  if (layout.hinge !== "partiallyOpen") return null;
  if (layout.divisions.some((region) => region.active)) return null;
  const width = finite(layout.width);
  const height = finite(layout.height);
  const spanning = layout.divisions.filter((region) =>
    (Math.abs(region.y) <= EPSILON && Math.abs(region.height - height) <= EPSILON && region.x > 0 && region.x + region.width < width)
    || (Math.abs(region.x) <= EPSILON && Math.abs(region.width - width) <= EPSILON && region.y > 0 && region.y + region.height < height));
  return spanning.length === 1 ? spanning[0] : null;
}

/**
 * Identity of a pending hinge hint (the hinge says partially open, the region
 * is still inactive), or null when there is none. The reader starts a
 * `MOBILE_READER_HINGE_HINT_TIMEOUT_MS` timer per key; a new fold (or a
 * different window size) gets a new key.
 */
export function mobileReaderHingeHintKey(layout: MobileWindowLayout): string | null {
  const division = pendingHingeDivision(layout);
  if (!division) return null;
  const vertical = Math.abs(division.y) <= EPSILON;
  return `${Math.round(finite(layout.width))}x${Math.round(finite(layout.height))}:${division.id}:${vertical ? "v" : "h"}`;
}

/**
 * The layout the reader should lay out for *now*. iOS reports the hinge
 * status before the fold division turns active (the region query can trail
 * it by a layout pass or more), and during that gap the system shows a
 * blurred snapshot until the app redraws. So when a partially open hinge
 * arrives first, the known inactive division is taken as active at once and
 * the reader commits its book / notebook layout in the same frame.
 *
 * This deliberately departs from Apple's guidance ("Hinge data… is ideal for
 * driving interactions or effects. For layout, use the arrangement and region
 * APIs"; nothing guarantees the hinge and the region agree), so the hint is
 * only an early start for the transition and the region stays authoritative:
 * - the anticipated fold's geometry comes from the region's centre line and
 *   `MOBILE_READER_ANTICIPATED_FOLD_WIDTH`, never the inactive width;
 * - once the region turns active, its own frame is used;
 * - `hintExpired` (the region did not turn active within
 *   `MOBILE_READER_HINGE_HINT_TIMEOUT_MS`) returns the region's answer — flat.
 */
export function mobileReaderAnticipatedWindowLayout(
  layout: MobileWindowLayout,
  { hintExpired = false }: { hintExpired?: boolean } = {},
): MobileWindowLayout {
  if (hintExpired) return layout;
  const division = pendingHingeDivision(layout);
  if (!division) return layout;
  const half = MOBILE_READER_ANTICIPATED_FOLD_WIDTH / 2;
  const vertical = Math.abs(division.y) <= EPSILON;
  const anticipated = vertical
    ? { ...division, active: true, x: division.x + division.width / 2 - half, width: MOBILE_READER_ANTICIPATED_FOLD_WIDTH }
    : { ...division, active: true, y: division.y + division.height / 2 - half, height: MOBILE_READER_ANTICIPATED_FOLD_WIDTH };
  return {
    ...layout,
    divisions: layout.divisions.map((region) => (region === division ? anticipated : region)),
  };
}

/** Stage-local tap exclusions for the capsules that float over the page. */
function capsuleExclusions(chrome: MobileReaderChromeLayout, stage: Rect): Rect[] {
  if (chrome.kind !== "capsules") return [];
  const pieces = [chrome.back, chrome.title, chrome.more, chrome.actions, chrome.scrubber].filter((rect): rect is Rect => rect !== null);
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
      ?? (input.paged ? "filmstrip" : "continuous");
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
        foldGap: null,
        foldBand: adaptive.fold,
        chrome,
        chromePinned: false,
        modalFrame: topPane,
        // The settings popover stays in the bottom pane, above the scrubber,
        // never across the fold.
        popover: {
          frame: mobileWindowUnoccludedRect(shrink(bottomPane, mobileReaderSafePadding(bottomPane, bounds, insets)), occlusions),
          bottomGap: Math.max(
            READER_POPOVER_GAP,
            bottomPane.y + bottomPane.height - mobileReaderSafePadding(bottomPane, bounds, insets).bottom - chrome.scrubber.y + READER_POPOVER_GAP,
          ),
        },
        tapExclusions: capsuleExclusions(chrome, bounds),
        pageSideInsets: mobileReaderPageSideInsets(bounds, insets, occlusions),
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
    const spread = wantsSpread(input, topPane) && twoPageAvailable;
    const padding = mobileReaderSafePadding(bottomPane, bounds, insets);
    const pane = mobileWindowUnoccludedRect(shrink(bottomPane, padding), occlusions);
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
      state: paneState,
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
      foldGap: null,
      foldBand: null,
      chrome,
      chromePinned: true,
      modalFrame: bottomPane,
      popover: mobileReaderPopoverPlacement(chrome),
      // The capsule row over the page (only while the chrome is shown).
      tapExclusions: [row.back, row.title, row.actions]
        .filter((rect): rect is Rect => rect !== null)
        .map((rect) => toLocal(shrink(rect, uniform(-READER_CAPSULE_GAP / 2)), stage)),
      pageSideInsets: NO_SIDE_INSETS,
    };
  }

  if (adaptive.posture === "book" && adaptive.panels.length === 2) {
    const panes = adaptive.panels;
    // Pages are immersive and full-bleed per pane, exactly like phones: the
    // reader hides the status bar while reading, so the vertical bar column is
    // empty and trimming it (84pt) made both pages fit a narrower pane with
    // tall black bands. Only the fold is avoided; controls keep the safe area.
    const pagePanes = input.sideBar
      ? panes.map((pane) => horizontalSafe(pane, bounds, insets))
      : panes;
    const startIndex = input.rtl ? 1 : 0;
    const usablePair = input.paged && pagePanes.every(
      (pane) => pane.width >= READER_BOOK_MIN_PANE && pane.height >= READER_BOOK_MIN_PANE,
    );
    const twoPageAvailable = usablePair && multiPage;
    const spread = wantsSpread(input, bounds) && twoPageAvailable;
    const stage = spread ? bounds : pagePanes[startIndex];
    const spreadSlots = spread ? pagePanes.map((pane) => toLocal(pane, stage)) : undefined;
    const foldGap = spreadSlots
      ? { start: spreadSlots[0].x + spreadSlots[0].width, end: spreadSlots[1].x }
      : null;
    // Capsules snap per pane, nothing on the fold (HIG: a pane's controls sit
    // atop that pane): Back + title in the leading pane, actions in the
    // trailing pane beside the status bar, the scrubber centred in the
    // reading-start pane.
    const leadingIndex = leadingSide === "left" ? 0 : 1;
    const trailingIndex = 1 - leadingIndex;
    const chrome = capsuleChrome({
      frame: bounds,
      bounds,
      insets,
      occlusions,
      leading: panes[leadingIndex],
      trailing: panes[trailingIndex],
      scrubberRegion: panes[startIndex],
      leadingSide,
      actionCount: input.actionCount ?? 3,
      titleCenterX: panes[leadingIndex].x + panes[leadingIndex].width / 2,
      titleOnly: input.sideBar === true,
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
      foldGap,
      foldBand: null,
      chrome,
      chromePinned: false,
      // Reader-owned cards centre in the page's pane, between the capsule rows.
      modalFrame: panes[startIndex],
      popover: mobileReaderPopoverPlacement(chrome),
      tapExclusions: capsuleExclusions(chrome, stage),
      pageSideInsets: NO_SIDE_INSETS,
    };
  }

  // Flat: no active fold. Immersive page: full-bleed like phones (status bar
  // hidden while reading; chrome and the status bar float over the page when
  // shown, so toggling the controls never resizes it). With the system
  // vertical bar kept, the page sits beside its column.
  const unoccluded = mobileWindowUnoccludedRect(bounds, occlusions);
  const stage = input.sideBar ? horizontalSafe(bounds, bounds, insets) : bounds;
  const twoPageAvailable = input.paged && multiPage && stageHoldsSpread(stage);
  const spread = wantsSpread(input, stage) && twoPageAvailable;
  const constrained = !sameRect(stage, bounds);
  // One capsule row over the page, the title centred on the page it
  // describes, and the scrubber centred on the whole display — a flat
  // spread on a foldable included (HIG: "Some UI should still center on the
  // full display though, no offset"): the resting fold is not a pane
  // boundary until the device actually folds. Compact width (phones in
  // portrait, the Duo outer display): Back + title on top, clear of the
  // status bar / island / camera; the actions ride the bottom row beside the
  // scrubber, within thumb reach — or live in the system vertical bar.
  const chrome = capsuleChrome({
    frame: stage,
    bounds,
    insets,
    occlusions,
    leading: stage,
    trailing: stage,
    // With the bar column both capsules belong to the reading stage beside
    // it, so they share one centre line (and, on the narrow outer display,
    // one pair of edges) with the page instead of hugging the column.
    scrubberRegion: stage,
    leadingSide,
    actionCount: input.actionCount ?? 3,
    titleCenterX: stage.x + stage.width / 2,
    actionsRow: adaptive.widthClass === "compact" ? "bottom" : "top",
    titleOnly: input.sideBar === true,
  });
  if (input.sideBar && chrome.title) {
    // The title is the only top capsule here: centre it on the stage like the
    // scrubber (the title-only path otherwise keeps room for an absent
    // actions capsule and ends short of the scrubber's trailing edge).
    const width = Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, stage.width - 2 * READER_CAPSULE_EDGE);
    chrome.title = { ...chrome.title, x: Math.round(stage.x + (stage.width - width) / 2), width };
  }
  return {
    posture: "flat",
    bounds,
    safeInsets: insets,
    stage,
    constrained,
    twoPageAvailable,
    spread,
    foldGap: null,
    foldBand: null,
    chrome,
    chromePinned: false,
    modalFrame: unoccluded,
    popover: mobileReaderPopoverPlacement(chrome),
    tapExclusions: capsuleExclusions(chrome, stage),
    pageSideInsets: constrained ? NO_SIDE_INSETS : mobileReaderPageSideInsets(bounds, insets, occlusions),
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
