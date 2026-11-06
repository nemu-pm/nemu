import { mobileAdaptiveLayout, type MobileWindowPosture } from "@/lib/mobileAdaptiveLayout";
import { mobileWindowOnInnerDisplay } from "@/lib/mobileOrientationPolicy";
import { resolveReaderSpreadWanted, type ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import { READER_NOTEBOOK_SHEET_INSET, type MobileReaderNotebookPaneState } from "@/lib/mobileReaderNotebookPane";
import {
  mobileWindowUnoccludedRect,
  mobileWindowUnoccludedRects,
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
 * | flat with the system vertical bar (Duo outer display, a Split View half) | full bleed on the outer display; beside the bar in Split View | Back + actions in the system bar; our title capsule top-leading + the scrubber centred on the window |
 * | flat, regular width, no vertical bar (tablets, unfolded Android, Duo inner display full-screen) | full bleed | capsule row on the status-bar row + scrubber centred on the display |
 * | book (vertical fold)                  | one page per pane / reading-start pane | capsules snapped per pane: Back + title leading, actions trailing (or Back + actions in the system bar), scrubber in the reading-start pane |
 * | book, scroll reading                  | the strip in the reading-start pane | the flat capsule rows inside that pane; the other pane is the side pane (Laptop Mode: thumbnails / page controls) |
 * | notebook (horizontal fold), paged     | top pane                      | capsule row over the top pane + the bottom pane (trackpad / filmstrip) |
 * | notebook, scroll reading              | the strip in the top pane, 20pt clear of the crease | the capsule rows inside the top pane (title centred on it, actions top trailing); the bottom pane is the side pane (Laptop Mode: thumbnail row / page controls) |
 * | notebook, a paged chapter as a long strip | flat: the strip flows through the fold, as on the open display | as flat |
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
 * Capsule chrome geometry, matched to the app's own native stack bars on the
 * iPhone Duo inner display at 3x (iOS 26+ Liquid Glass bar items): 48pt glass
 * circles and capsules, 20pt from the window edge, the row centred 48pt from
 * the top with the Duo's 82pt top inset (its bottom 10pt above the top
 * safe-area edge, the status bar on the same row); ~10pt between separate
 * pieces and the title capsule at most ~360pt wide, centred.
 */
export const READER_CAPSULE_HEIGHT = 48;
export const READER_CAPSULE_EDGE = 20;
export const READER_CAPSULE_GAP = 10;
/** One icon slot in the actions capsule (a 44pt circle inside the 48pt capsule). */
export const READER_CAPSULE_ACTION_WIDTH = 44;
/** Inner padding at each end of the actions capsule (its slots sit concentric in it). */
export const READER_CAPSULE_ACTIONS_PADDING = 2;
export const READER_CAPSULE_TITLE_MAX_WIDTH = 360;
/** At or above this the title capsule shows the title + "Chapter · n/N"; below it only n/N. */
export const READER_CAPSULE_TITLE_FULL_MIN_WIDTH = 160;
/** Below this the title capsule is dropped rather than squeezed. */
export const READER_CAPSULE_TITLE_MIN_WIDTH = 96;
/**
 * The title capsule itself (inside its slot) hugs its two label lines: an
 * elongated capsule, never narrower than this...
 */
export const READER_TITLE_CAPSULE_MIN_WIDTH = 160;
/** ...nor wider than this share of the window (a bit over half), so it never runs edge to edge. */
export const READER_TITLE_CAPSULE_MAX_WINDOW_SHARE = 0.58;

/**
 * The width range of the title capsule drawn in a `title` slot of
 * `slotWidth` (it is centred in the slot and hugs its labels within the
 * range); long titles truncate inside it.
 */
export function mobileReaderTitleCapsuleWidthRange(
  slotWidth: number,
  windowWidth: number,
): { minWidth: number; maxWidth: number } {
  const maxWidth = Math.max(
    0,
    Math.min(slotWidth, READER_CAPSULE_TITLE_MAX_WIDTH, Math.round(windowWidth * READER_TITLE_CAPSULE_MAX_WINDOW_SHARE)),
  );
  return { minWidth: Math.min(READER_TITLE_CAPSULE_MIN_WIDTH, maxWidth), maxWidth };
}
/** Gap between the row's bottom and the top safe-area edge when the status bar shares the row. */
export const READER_CAPSULE_ROW_BOTTOM_GAP = 10;
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
       * (`actionsRow`): everywhere else the actions capsule already holds
       * the top row's trailing end. Null otherwise.
       */
      more: Rect | null;
      /** Trailing actions capsule (plugins, dual read, settings). */
      actions: Rect;
      /**
       * Which row carries the actions capsule: the bottom row beside the
       * scrubber wherever the scrubber keeps its minimum width there
       * (`mobileReaderActionsRow`: phones, the Duo inner display, tablets),
       * else the status-bar row (a narrow book pane with several actions).
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
  /** Natural width / height of the current page, for camera-aware contain fitting. */
  pageAspectRatio?: number;
  /** Keep the outer hardware camera clear; immersive mode explicitly opts out. */
  avoidCamera?: boolean;
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
   * Half folded like a laptop, whatever the reader lays out (the console, or
   * the flat window once the panel is closed or in scroll mode): the actions
   * stay in the top row's trailing group, never beside the scrubber.
   */
  notebookFold?: boolean;
  /**
   * The system vertical bar is in use (`mobileReaderVerticalBarPolicy`): it
   * carries Back and the actions. Full-screen outer-display pages may extend
   * behind the controls, while still avoiding the physical camera.
   */
  sideBar?: boolean;
  /**
   * A reader sheet is open in the book posture and covers this half (the
   * system places it beside the fold, `mobileReaderBookSheetSide`): the page
   * moves to the other half for as long as it is open, one page fitted there.
   */
  sheetSide?: Side | null;
  /**
   * Scroll reading (the reading mode, not a paged chapter shown as a strip):
   * in the book posture the strip keeps its half with a flat toolbar there,
   * and the other half shows the Laptop Mode content (`sidePane`); in the
   * notebook (laptop) posture the strip keeps the top half and the bottom
   * half shows it.
   */
  scrollSidePane?: boolean;
  /**
   * Book posture, scroll reading: the top safe-area inset the side pane lays
   * its title out under. The status bar (and its inset) comes and goes with
   * the toolbar; the reader passes the widest seen
   * (`mobileReaderNextTopInsetLatch`) so toggling the toolbar never moves the
   * pane. The live inset when absent.
   */
  sidePaneTopInset?: number | null;
};

/** Book posture, scroll reading: the half beside the strip. */
export const READER_BOOK_SIDE_PANE_INSET = 16;
/** Book posture: the chapter title line's distance below the top safe area. */
export const READER_BOOK_SIDE_PANE_TOP_GAP = 8;
/** Gap between the chapter title line and the thumbnail list. */
export const READER_BOOK_SIDE_PANE_HEADER_GAP = 8;
/** The chapter title line (15pt semibold). */
export const READER_BOOK_SIDE_PANE_HEADER_HEIGHT = 20;
/** Page controls: two circles, this size, this far apart, centred in the half. */
export const READER_BOOK_PAGE_CONTROL_SIZE = 64;
export const READER_BOOK_PAGE_CONTROL_GAP = 24;
/**
 * Notebook (laptop) posture, scroll reading: no artwork within this distance
 * of the crease, on either side — measured from the fold region's edges
 * (the Duo's region is 40pt tall: from its centre line the clearance was all
 * inside the region, and the strip ran down to its top edge).
 */
export const READER_LAPTOP_CREASE_CLEARANCE = 20;

export type MobileReaderBookSidePane = {
  /**
   * `vertical`: the book posture's half beside the strip (one column of
   * thumbnails, the page controls stacked). `horizontal`: the laptop
   * posture's bottom half (one row of thumbnails, the controls side by side).
   */
  orientation: "vertical" | "horizontal";
  /** The whole half (reader-local): reader black, and every empty spot toggles the toolbar. */
  frame: Rect;
  /**
   * Chapter title line, 16pt in from the half's edges and clear of the status
   * island (vertical). Zero height in the horizontal row, whose thumbnails
   * take the half's whole height less 16pt above and below.
   */
  header: Rect;
  /** Thumbnail list viewport (reader-local); its items are inset 16pt either side across the list. */
  list: Rect;
  /** Thumbnail size across the list: the column's width or the row's height, less 16pt either side. */
  thumbnailSize: number;
  /** Page controls (Laptop Mode "Page Controls"): one screen up, one screen down. */
  pageUp: Rect;
  pageDown: Rect;
};

/**
 * The half a system sheet takes in the book posture. Measured on the iPhone
 * Duo (iOS 27.1, automatic placement): the leading half, so it follows the
 * layout direction.
 */
/** A system sheet's presentation slide: the page leaves the sheet's half once it is covered. */
export const MOBILE_READER_BOOK_SHEET_COVER_MS = 380;

export function mobileReaderBookSheetSide(layoutDirection: "ltr" | "rtl" | undefined): Side {
  return layoutDirection === "rtl" ? "right" : "left";
}

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
  chrome: MobileReaderChromeLayout;
  /** Chrome is always visible (notebook console). */
  chromePinned: boolean;
  /** Where reader-owned cards (end of chapter) are centred. */
  modalFrame: Rect;
  /** Reader settings popover: the region it may occupy and its gap to that region's bottom edge. */
  popover: { frame: Rect; bottomGap: number };
  /** Stage-local rectangles owned by chrome: taps there never turn pages. */
  tapExclusions: Rect[];
  /** Book posture, scroll reading: the other half (`scrollSidePane`); absent otherwise. */
  sidePane?: MobileReaderBookSidePane;
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
 * Candidate tops of the capsule row. When the status bar is an island sharing the
 * top band with app content (iPhone Duo inner display: a 134×82 occlusion in
 * the trailing corner and an 82pt top inset), the row sits in that band like
 * Safari's, its bottom 12pt above the safe-area edge; a band too short for
 * those margins (the outer display) centres the row on it. Otherwise (a
 * status bar spanning the top, or none) it sits just below the top inset.
 * This gives both candidates; `capsuleChrome` only shares the band when the
 * title capsule keeps a useful width there.
 */
function mobileReaderCapsuleRowTops(
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
 * The top inset the scroll list is padded by: one that does not change when
 * the status bar shows or hides with the chrome. The iPhone Duo reports its
 * status island as a top inset only while the status bar is shown (82pt, then
 * 0), and a list padding that follows it is shifted by the native scroll
 * anchoring when the chrome hides. Its island shares the capsule row, so the
 * stable top there is 0 in both states. Elsewhere (a status bar spanning the
 * top, the Dynamic Island) the inset does not change with the status bar and
 * is used as is.
 */
export function mobileReaderStableTopInset(
  layout: Pick<MobileWindowLayout, "width" | "height" | "occlusions">,
  insets: Pick<Insets, "top">,
): number {
  const top = Math.max(0, insets.top);
  const bounds: Rect = { x: 0, y: 0, width: layout.width, height: layout.height };
  const occlusions = layout.occlusions.filter((rect) => rect.active);
  return statusIsland(bounds, { top, left: 0, right: 0, bottom: 0 }, occlusions) ? 0 : top;
}

/**
 * `mobileReaderStableTopInset` from one native sample, so the island and the
 * inset never disagree: the reader's own window layout report, or — before
 * that report (the reader's observer publishes after mount) — the app-wide
 * observer's, when it describes the same window. Mixing a layout without its
 * island with the live 82pt inset padded the Duo's list 162pt at mount, then
 * 80pt once the reader reported. The live inset only when no native sample
 * reports insets (bounds-only hosts), as before.
 */
export function mobileReaderScrollStableTopInset(input: {
  /** The reader's own report (folded/anticipated), null before its first one. */
  reader: Pick<MobileWindowLayout, "width" | "height" | "occlusions" | "safeAreaInsets" | "verticalBarEdge"> | null;
  /** The app-wide observer's report, null before its first one. */
  app: Pick<MobileWindowLayout, "width" | "height" | "occlusions" | "safeAreaInsets" | "verticalBarEdge"> | null;
  window: { width: number; height: number };
  insets: Pick<Insets, "top">;
}): number {
  const { app, window } = input;
  const sample = input.reader
    ?? (app && Math.abs(app.width - window.width) <= 1 && Math.abs(app.height - window.height) <= 1 ? app : null);
  if (!sample) {
    return mobileReaderStableTopInset({ width: window.width, height: window.height, occlusions: [] }, input.insets);
  }
  // A system vertical bar (the Duo outer display) carries the status bar in
  // its column: no status bar across the top to clear. The reader's view
  // still reports a 24pt top there, which padded the outer display's list
  // 104pt instead of 80 (the live inset the list used before read 0).
  if (sample.verticalBarEdge === "leading" || sample.verticalBarEdge === "trailing") return 0;
  return mobileReaderStableTopInset(sample, { top: sample.safeAreaInsets?.top ?? input.insets.top });
}

/**
 * Icon buttons in the actions capsule: Japanese Learning contributes two
 * (detect text, nemu chat), every other enabled plugin one, plus the bilingual
 * toggle when shown and settings.
 */
export function mobileReaderCapsuleActionSlots(input: {
  enabledPluginIds: readonly string[];
  bilingualToggle: boolean;
  /** The notebook sheet is closed on a folded window: the row carries "show the controls panel". */
  notebookPanel?: boolean;
}): number {
  const pluginSlots = input.enabledPluginIds.reduce(
    (count, id) => count + (id === "japanese-learning" ? 2 : 1),
    0,
  );
  return pluginSlots + (input.bilingualToggle ? 1 : 0) + (input.notebookPanel ? 1 : 0) + 1;
}

/** Width of the actions capsule for `count` icon buttons. */
export function mobileReaderCapsuleActionsWidth(count: number): number {
  const slots = Math.max(1, Math.round(finite(count, 3)));
  return slots * READER_CAPSULE_ACTION_WIDTH + READER_CAPSULE_ACTIONS_PADDING * 2;
}

/** The narrowest scrubber the bottom row gives up its width to: beside it, the actions capsule. */
export const READER_SCRUBBER_MIN_WIDTH = 200;

/**
 * Which row carries the actions capsule, from the room in the scrubber's
 * region: the bottom row (beside the scrubber, as on phones) whenever the
 * scrubber keeps `READER_SCRUBBER_MIN_WIDTH` there next to the capsule and
 * its gap, the status-bar row otherwise (a narrow book pane with several
 * actions). The room is the region less its side margins, each the safe
 * area or the capsule edge, whichever is larger.
 */
export function mobileReaderActionsRow(
  region: Rect,
  padding: Pick<Insets, "left" | "right">,
  actionCount: number,
): "top" | "bottom" {
  const room = region.width
    - Math.max(READER_CAPSULE_EDGE, finite(padding.left))
    - Math.max(READER_CAPSULE_EDGE, finite(padding.right));
  const scrubberRoom = room - mobileReaderCapsuleActionsWidth(actionCount) - READER_CAPSULE_GAP;
  return scrubberRoom >= READER_SCRUBBER_MIN_WIDTH ? "bottom" : "top";
}

/**
 * The bottom row with the actions beside the scrubber: the scrubber takes the
 * room the capsule leaves (at most `READER_SCRUBBER_CAPSULE_MAX_WIDTH`), and
 * the group (scrubber, gap, actions; the actions trailing) is centred in the
 * region, kept between `start` and `end` (its safe, unoccluded span). Where
 * the group fills that span (phones) this is the scrubber from the leading
 * edge and the actions at the trailing one.
 */
export function mobileReaderBottomRowLayout(input: {
  region: Rect;
  start: number;
  end: number;
  actionsWidth: number;
  ltr: boolean;
}): { scrubberX: number; scrubberWidth: number; actionsX: number } {
  const room = Math.max(0, input.end - input.start);
  const scrubberWidth = Math.max(0, Math.min(READER_SCRUBBER_CAPSULE_MAX_WIDTH, room - input.actionsWidth - READER_CAPSULE_GAP));
  const group = scrubberWidth + READER_CAPSULE_GAP + input.actionsWidth;
  const centred = input.region.x + (input.region.width - group) / 2;
  const groupX = Math.max(input.start, Math.min(input.end - group, centred));
  return input.ltr
    ? { scrubberX: groupX, scrubberWidth, actionsX: groupX + scrubberWidth + READER_CAPSULE_GAP }
    : { scrubberX: groupX + input.actionsWidth + READER_CAPSULE_GAP, scrubberWidth, actionsX: groupX };
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
  /**
   * Keep the title on `titleCenterX` (narrowed to the room either side of it)
   * whenever that leaves a full-label capsule, with the actions on the same
   * row too — not only beside the ⋯ circle.
   */
  centreTitle?: boolean;
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
    // Centred on `titleCenterX` (a native bar's centred title) when the
    // whole slot fits there; otherwise centred in the gap between Back and
    // the trailing piece (the actions, the ⋯ circle or the pane's inner
    // edge), so neither side crowds it. The capsule drawn in this slot hugs
    // its labels within `mobileReaderTitleCapsuleWidthRange`, centred in it.
    let width = Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, available);
    const centred = input.titleCenterX - width / 2;
    const fitsCentred = centred >= minX && centred + width <= maxX;
    // Between Back and the ⋯: the same width reserved on both sides of
    // `titleCenterX` (the window's centre) keeps the title on it even where
    // the ⋯ moves in past a camera or the status island, as long as that
    // leaves a full-label capsule.
    const symmetric = Math.min(
      READER_CAPSULE_TITLE_MAX_WIDTH,
      2 * Math.min(input.titleCenterX - minX, maxX - input.titleCenterX),
    );
    const keepsCentre = (more !== null || input.centreTitle === true) && !titleOnly && !fitsCentred
      && symmetric >= READER_CAPSULE_TITLE_FULL_MIN_WIDTH;
    if (keepsCentre) width = symmetric;
    // Title only (the bar carries Back): top-leading, like a navigation title.
    const x = titleOnly
      ? ltr ? minX : maxX - width
      : fitsCentred || keepsCentre ? input.titleCenterX - width / 2 : minX + (available - width) / 2;
    // Whole points, still inside [minX, maxX] after rounding.
    const roundedWidth = Math.floor(width);
    const roundedX = Math.max(Math.ceil(minX), Math.min(Math.round(x), Math.floor(maxX - roundedWidth)));
    title = { x: roundedX, y: rowTop, width: roundedWidth, height: h };
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
    // Scrubber and the actions capsule on one row (the actions trailing,
    // vertically centred on it), the pair centred in the region, both clear
    // of a camera in a bottom corner (`mobileReaderBottomRowLayout`).
    const start = rowLeadingLimit(region, scrubberY, sh, occlusions, regionPad.left);
    const end = rowTrailingLimit(region, scrubberY, sh, occlusions, regionPad.right);
    const clear = mobileReaderBottomRowLayout({ region, start, end, actionsWidth, ltr });
    // Where dodging a running camera sideways would starve the scrubber (a
    // book pane, inner landscape-right), keep the full row and lift it above
    // the camera instead, as the scrubber alone does.
    const lift = clear.scrubberWidth < READER_SCRUBBER_MIN_WIDTH;
    const row = lift
      ? mobileReaderBottomRowLayout({
          region,
          start: region.x + Math.max(READER_CAPSULE_EDGE, regionPad.left),
          end: region.x + region.width - Math.max(READER_CAPSULE_EDGE, regionPad.right),
          actionsWidth,
          ltr,
        })
      : clear;
    let rowY = scrubberY;
    if (lift) {
      const band: Rect = { x: region.x, y: scrubberY, width: region.width, height: sh };
      for (const rect of occlusions) {
        if (intersects(band, rect)) rowY = Math.min(rowY, rect.y - READER_CAPSULE_GAP / 2 - sh);
      }
    }
    actions.y = rowY + (sh - h) / 2;
    actions.x = row.actionsX;
    scrubber = {
      x: Math.round(row.scrubberX),
      y: rowY,
      width: Math.round(row.scrubberWidth),
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
  layout: Partial<Pick<MobileWindowLayout, "verticalBarEdge" | "divisions" | "fillsScreen" | "hinge" | "width" | "height">>,
): {
  optOut: boolean;
  sideBar: boolean;
} {
  const innerFullScreen = layout.fillsScreen !== false && mobileWindowOnInnerDisplay(layout);
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

export type MobileReaderTopInsetLatch = { key: string; top: number };

/** Configuration key for the top-inset latch: the window's size; null when not latching. */
export function mobileReaderTopInsetLatchKey(
  layout: Pick<MobileWindowLayout, "width" | "height"> | null | undefined,
  active: boolean,
): string | null {
  if (!layout || !active) return null;
  return `${Math.round(finite(layout.width))}x${Math.round(finite(layout.height))}`;
}

/**
 * The widest top safe-area inset seen for this configuration (the status bar
 * shown), so a layout under it does not move when the status bar hides with
 * the toolbar. A new key starts over; the previous latch is returned
 * unchanged when nothing grew.
 */
export function mobileReaderNextTopInsetLatch(
  previous: MobileReaderTopInsetLatch | null,
  key: string | null,
  top: number | null | undefined,
): MobileReaderTopInsetLatch | null {
  if (!key) return null;
  const current = previous?.key === key ? previous : null;
  const seen = typeof top === "number" && Number.isFinite(top) ? Math.max(0, top) : null;
  if (seen === null) return current;
  if (!current) return { key, top: seen };
  return seen > current.top ? { key, top: seen } : current;
}

/**
 * The reading area's safe area, latched for one window configuration, so it
 * never changes with the status bar. Showing / hiding the controls shows /
 * hides the status bar, and iOS reports a different safe area for each state
 * (the iPhone Duo's status island is an 82pt top inset, a trailing column and
 * a 134×82 occlusion only while it shows; an iPhone without a notch loses its
 * 20pt top). The insets and occlusions can also arrive in separate samples.
 * The pose, the page side insets and the scroll list's stable top all read
 * this latch: per edge the widest inset seen (the status bar shown), plus
 * every occlusion seen in the same configuration (the island that explains
 * it). Live insets only place the chrome that fades with the status bar.
 *
 * Like the side-bar latch it never outlives its configuration: a new window
 * size, vertical-bar edge or fold line (`mobileReaderLayoutInsetLatchKey`)
 * starts over, as does a bar column moving to the other side.
 */
export type MobileReaderLayoutInsetLatch = {
  key: string;
  insets: Insets;
  occlusions: MobileWindowLayout["occlusions"];
};

/**
 * Configuration key of the layout inset latch: the window size, the vertical
 * bar edge, and where its divisions are (their centre lines, not their
 * active flag or width, so the same display flat or half folded is one
 * configuration: its safe area does not change with the posture).
 */
export function mobileReaderLayoutInsetLatchKey(
  layout: Pick<MobileWindowLayout, "width" | "height" | "divisions" | "verticalBarEdge">,
): string {
  const divisions = layout.divisions
    .map((region) => `${Math.round(finite(region.x) + finite(region.width) / 2)},${Math.round(finite(region.y) + finite(region.height) / 2)}`)
    .sort()
    .join(";");
  return `${Math.round(finite(layout.width))}x${Math.round(finite(layout.height))}:${layout.verticalBarEdge ?? ""}:${divisions}`;
}

export function mobileReaderNextLayoutInsetLatch(
  previous: MobileReaderLayoutInsetLatch | null,
  key: string,
  insets: Partial<Insets> | null | undefined,
  occlusions: MobileWindowLayout["occlusions"],
): MobileReaderLayoutInsetLatch {
  const seen = sanitizeInsets(insets);
  const seenOcclusions = occlusions.filter((rect) => rect.active && rect.width > 0 && rect.height > 0);
  const current = previous?.key === key ? previous : null;
  if (!current) return { key, insets: seen, occlusions: seenOcclusions };
  // A bar column that moved to the other side is a new configuration.
  const latchedSide = insetColumnSide(current.insets);
  const seenSide = insetColumnSide(seen);
  if (latchedSide && seenSide && latchedSide !== seenSide) return { key, insets: seen, occlusions: seenOcclusions };
  const merged: Insets = {
    top: Math.max(current.insets.top, seen.top),
    left: Math.max(current.insets.left, seen.left),
    bottom: Math.max(current.insets.bottom, seen.bottom),
    right: Math.max(current.insets.right, seen.right),
  };
  const added = seenOcclusions.filter((rect) => !current.occlusions.some((known) => sameRect(known, rect)));
  const grew = merged.top !== current.insets.top || merged.left !== current.insets.left
    || merged.bottom !== current.insets.bottom || merged.right !== current.insets.right;
  if (!grew && added.length === 0) return current;
  return { key, insets: merged, occlusions: added.length > 0 ? [...current.occlusions, ...added] : current.occlusions };
}

/**
 * The latch of each window configuration, for this session: a reader that
 * opens (a reopen, the next chapter) starts from what an earlier one saw in
 * the same configuration — the status bar's inset and its island, seen while
 * the chrome (and so the status bar) was shown — instead of learning them a
 * moment after it landed, which moved the shown chrome (the top row dropped
 * under the island's band, then rose into it with ⋯ gliding left of the
 * clock, 0.45–0.55 s after the landing; build 9).
 */
const MOBILE_READER_LAYOUT_INSET_MEMORY_LIMIT = 8;
const rememberedLayoutInsetLatches = new Map<string, MobileReaderLayoutInsetLatch>();

/** Where a latch for `key` starts: the current one when it is that configuration's, else the remembered one. */
export function mobileReaderLayoutInsetLatchBase(
  current: MobileReaderLayoutInsetLatch | null,
  key: string,
): MobileReaderLayoutInsetLatch | null {
  if (current?.key === key) return current;
  return rememberedLayoutInsetLatches.get(key) ?? current;
}

export function rememberMobileReaderLayoutInsetLatch(latch: MobileReaderLayoutInsetLatch): void {
  rememberedLayoutInsetLatches.delete(latch.key);
  rememberedLayoutInsetLatches.set(latch.key, latch);
  while (rememberedLayoutInsetLatches.size > MOBILE_READER_LAYOUT_INSET_MEMORY_LIMIT) {
    const oldest = rememberedLayoutInsetLatches.keys().next().value;
    if (oldest === undefined) break;
    rememberedLayoutInsetLatches.delete(oldest);
  }
}

/**
 * The reader window's last observed layout, this session. A reader mounts at
 * its zoom's landing and its own observer reports a moment later: until then
 * it laid out a bare window (no vertical-bar edge, no divisions, no
 * occlusions), a configuration of its own, so the latch above started over
 * and the shown chrome moved when the report came in. A reader opening in
 * the same window (same size, same division and hinge state as the app's
 * live observer reports) starts from the last layout instead.
 */
let rememberedReaderWindowLayout: MobileWindowLayout | null = null;

export function rememberMobileReaderWindowLayout(layout: MobileWindowLayout | null): void {
  if (layout) rememberedReaderWindowLayout = layout;
}

function divisionSignature(layout: Pick<MobileWindowLayout, "divisions">): string {
  return layout.divisions
    .map((region) => `${Math.round(finite(region.x) + finite(region.width) / 2)},${Math.round(finite(region.y) + finite(region.height) / 2)},${region.active ? 1 : 0}`)
    .sort()
    .join(";");
}

/** The remembered reader layout when it is this window's (see above), else null. */
export function peekMobileReaderWindowLayout(
  window: { width: number; height: number },
  app: MobileWindowLayout | null | undefined,
): MobileWindowLayout | null {
  const layout = rememberedReaderWindowLayout;
  if (!layout) return null;
  if (Math.abs(layout.width - window.width) > 0.5 || Math.abs(layout.height - window.height) > 0.5) return null;
  if (app) {
    if (Math.abs(app.width - layout.width) > 0.5 || Math.abs(app.height - layout.height) > 0.5) return null;
    if (divisionSignature(app) !== divisionSignature(layout)) return null;
    if ((app.hinge ?? null) !== (layout.hinge ?? null)) return null;
  }
  return layout;
}

/**
 * The horizontal status bar's island on a display whose reader opts out of
 * the vertical bar while the app keeps it (the iPhone Duo inner display in
 * landscape): measured with the reader's bar disabled (observer log
 * 2026-09-28) as a 134×82 occlusion in the trailing top corner, its bottom
 * the 82pt top inset, no side inset, no vertical-bar edge.
 */
export const MOBILE_READER_OPT_OUT_STATUS_ISLAND = { width: 134, height: 82 } as const;

/**
 * The reader window's layout computed from the app's (same window, before
 * the reader's own observer reports), for a reader with no remembered layout
 * (the first open after a cold launch). The window's geometry — size, fold
 * divisions and hinge, whether it fills its screen, direction, margins — is
 * the app's. The insets follow the reader's own bar rules
 * (`mobileReaderVerticalBarPolicy`), not the app's tab safe area:
 * - the bar kept (`sideBar`: the outer display, a Split View half) or no bar
 *   at all: the reader's screen has the same system bars as the app's root,
 *   so its insets and occlusions are the app's;
 * - opted out (the inner display full-screen) while the app has a bar column:
 *   no column (both side insets 0, no vertical-bar edge, the trait resolves
 *   to unspecified once disabled) and the status bar is the horizontal one —
 *   the app's own top island when it reports one (its status bar already
 *   horizontal), else the opt-out island above in the trailing top corner,
 *   whose height is the top inset. Top-hanging occlusions of the column's
 *   status bar are dropped; other occlusions (cameras) are kept.
 * Null when the app's layout is not this window's (size) or not reported.
 */
export function mobileReaderDerivedWindowLayout(
  window: { width: number; height: number },
  app: MobileWindowLayout | null | undefined,
): MobileWindowLayout | null {
  if (!app) return null;
  if (Math.abs(app.width - window.width) > 0.5 || Math.abs(app.height - window.height) > 0.5) return null;
  const policy = mobileReaderVerticalBarPolicy(app);
  const appHasColumn = app.verticalBarEdge === "leading" || app.verticalBarEdge === "trailing";
  if (!policy.optOut || !appHasColumn) return app;
  const insets = sanitizeInsets(app.safeAreaInsets);
  const bounds: Rect = { x: 0, y: 0, width: app.width, height: app.height };
  const active = app.occlusions.filter((rect) => rect.active && rect.width > 0 && rect.height > 0);
  const appIsland = statusIsland(bounds, insets, active);
  const kept = app.occlusions.filter((rect) => rect === appIsland || !(rect.y <= EPSILON && rect.height > 0 && rect.width > 0));
  let top = insets.top;
  let occlusions = kept;
  if (!appIsland) {
    const { width, height } = MOBILE_READER_OPT_OUT_STATUS_ISLAND;
    const x = app.layoutDirection === "rtl" ? 0 : Math.max(0, app.width - width);
    top = height;
    occlusions = [{ id: "status", x, y: 0, width: Math.min(width, app.width), height, active: true }, ...kept];
  }
  return {
    ...app,
    verticalBarEdge: null,
    occlusions,
    safeAreaInsets: { top, left: 0, bottom: insets.bottom, right: 0 },
  };
}

/** Exposed for tests. */
export function resetMobileReaderLayoutInsetLatchMemoryForTesting(): void {
  rememberedLayoutInsetLatches.clear();
  rememberedReaderWindowLayout = null;
}

/** `layout` with the latched safe area and every latched occlusion (active). */
export function mobileReaderLatchedWindowLayout(
  layout: MobileWindowLayout,
  latch: MobileReaderLayoutInsetLatch | null,
): MobileWindowLayout {
  if (!latch) return layout;
  const live = layout.occlusions.filter((rect) => rect.active);
  const missing = latch.occlusions.filter((rect) => !live.some((known) => sameRect(known, rect)));
  return {
    ...layout,
    safeAreaInsets: latch.insets,
    occlusions: missing.length > 0 ? [...layout.occlusions, ...missing] : layout.occlusions,
  };
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
 *
 * `keepsSpread`: the reader shows a two-page spread across the window. A fold
 * on the window's centre line lays that spread out exactly as flat
 * (`mobileReaderSpreadHalves`), so anticipating it changes no page: the hint
 * (and its expiry) would be layout passes with nothing to lay out, and only
 * the chrome follows the fold, once the region reports it.
 */
export function mobileReaderAnticipatedWindowLayout(
  layout: MobileWindowLayout,
  { hintExpired = false, keepsSpread = false }: { hintExpired?: boolean; keepsSpread?: boolean } = {},
): MobileWindowLayout {
  if (hintExpired) return layout;
  const division = pendingHingeDivision(layout);
  if (!division) return layout;
  const half = MOBILE_READER_ANTICIPATED_FOLD_WIDTH / 2;
  const vertical = Math.abs(division.y) <= EPSILON;
  if (keepsSpread && vertical && Math.abs(division.x + division.width / 2 - finite(layout.width) / 2) <= 1) {
    return layout;
  }
  const anticipated = vertical
    ? { ...division, active: true, x: division.x + division.width / 2 - half, width: MOBILE_READER_ANTICIPATED_FOLD_WIDTH }
    : { ...division, active: true, y: division.y + division.height / 2 - half, height: MOBILE_READER_ANTICIPATED_FOLD_WIDTH };
  return {
    ...layout,
    divisions: layout.divisions.map((region) => (region === division ? anticipated : region)),
  };
}

/**
 * A spread's two slots split at the stage's centre line (stage-local): the
 * halves a flat spread lays its pages in, and the slots of a spread across a
 * centred fold, so both postures place the pages identically.
 */
export function mobileReaderSpreadHalves(stage: Pick<Rect, "width" | "height">): Rect[] {
  const width = finite(stage.width);
  const height = finite(stage.height);
  const centre = width / 2;
  return [
    { x: 0, y: 0, width: centre, height },
    { x: centre, y: 0, width: width - centre, height },
  ];
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

  if (adaptive.posture === "notebook" && adaptive.panels.length === 2 && !input.paged && input.scrollSidePane) {
    return mobileReaderLaptopScrollPose(input, adaptive.panels, adaptive.fold, { bounds, insets, occlusions, leadingSide });
  }

  if (adaptive.posture === "notebook" && adaptive.panels.length === 2) {
    const [topPane, bottomPane] = adaptive.panels;
    const paneState: MobileReaderNotebookPaneState = input.notebookPane
      ?? (input.paged ? "filmstrip" : "continuous");
    if (paneState === "continuous") {
      // Scroll / long strip reads exactly as on the open display: the fold
      // is not a pane boundary for a strip that flows through it.
      return mobileReaderPoseLayout({ ...input, layout: mobileReaderLayoutWithoutFold(input.layout) });
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
    const pane = mobileWindowUnoccludedRect(shrink(bottomPane, {
      ...padding,
      left: Math.max(padding.left, READER_NOTEBOOK_SHEET_INSET),
      right: Math.max(padding.right, READER_NOTEBOOK_SHEET_INSET),
      bottom: Math.max(padding.bottom, READER_NOTEBOOK_SHEET_INSET),
    }), occlusions);
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

  if (adaptive.posture === "book" && adaptive.panels.length === 2 && !input.paged && input.scrollSidePane) {
    return mobileReaderBookScrollPose(input, adaptive.panels, { bounds, insets, occlusions, leadingSide });
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
    // A sheet open over one half: the page takes the other (its reading
    // start otherwise).
    const sheetIndex = input.sheetSide === "left" ? 0 : input.sheetSide === "right" ? 1 : null;
    const startIndex = sheetIndex !== null ? 1 - sheetIndex : input.rtl ? 1 : 0;
    const usablePair = input.paged && pagePanes.every(
      (pane) => pane.width >= READER_BOOK_MIN_PANE && pane.height >= READER_BOOK_MIN_PANE,
    );
    const twoPageAvailable = usablePair && multiPage;
    const spread = wantsSpread(input, bounds) && twoPageAvailable && sheetIndex === null;
    const stage = spread ? bounds : pagePanes[startIndex];
    // A fold on the window's centre line (the iPhone Duo's open display): the
    // spread keeps the flat spread's geometry, its halves split at the centre
    // line, so fully open ⇄ half folded never moves a page (the spine stays
    // put). The fold's interaction margins are kept for taps only
    // (`foldGap`). An off-centre fold, a bar column, and a single page keep
    // the panes.
    const centreLine = bounds.width / 2;
    const foldCentre = (pagePanes[0].x + pagePanes[0].width + pagePanes[1].x) / 2;
    const centredSpread = spread && !input.sideBar && Math.abs(foldCentre - centreLine) <= 1;
    const spreadSlots = spread
      ? centredSpread
        ? mobileReaderSpreadHalves(bounds)
        : pagePanes.map((pane) => toLocal(pane, stage))
      : undefined;
    const foldGap = spread
      ? { start: pagePanes[0].x + pagePanes[0].width - stage.x, end: pagePanes[1].x - stage.x }
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
      // With room beside the scrubber the actions join it in the
      // reading-start pane and the ⋯ ends the leading pane's row.
      actionsRow: input.sideBar
        ? undefined
        : mobileReaderActionsRow(panes[startIndex], mobileReaderSafePadding(panes[startIndex], bounds, insets), input.actionCount ?? 3),
      titleOnly: input.sideBar === true,
    });
    return {
      posture: "book",
      bounds,
      safeInsets: insets,
      stage,
      // The centred spread fills the window like a flat one: the same flag.
      constrained: !centredSpread,
      spreadSlots,
      twoPageAvailable,
      spread,
      foldGap,
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
  // shown, so toggling the controls never resizes it). On the full-screen
  // outer display, keep the original rail controls but let the page extend
  // behind them. Chrome still uses the safe column; Split View stays inset.
  const unoccluded = mobileWindowUnoccludedRect(bounds, occlusions);
  const chromeStage = input.sideBar ? horizontalSafe(bounds, bounds, insets) : bounds;
  const fullBleedBehindRail = input.sideBar && input.layout.hinge === "closed" && input.layout.fillsScreen !== false;
  // The closed display reports both an interior camera rect and an
  // edge-attached status-bar rect. Only the former is a permanent obstacle;
  // excluding the status bar here would resize pages when controls hide.
  const cameraOcclusions = occlusions.filter((rect) =>
    rect.x > bounds.x && rect.y > bounds.y
    && rect.x + rect.width < bounds.x + bounds.width
    && rect.y + rect.height < bounds.y + bounds.height);
  // Avoiding the camera, scroll reading keeps the strip in the safe column: its
  // first screen (and every screen after) would otherwise run under the bar
  // column and the camera, which a page fitted around the camera (below) never
  // does. Full screen (camera avoidance off) it fills the display like a page.
  let stage = fullBleedBehindRail && (input.paged || input.avoidCamera === false) ? bounds : chromeStage;
  if (fullBleedBehindRail && input.paged && input.avoidCamera !== false && cameraOcclusions.length > 0) {
    const aspect = input.pageAspectRatio && Number.isFinite(input.pageAspectRatio) && input.pageAspectRatio > 0
      ? input.pageAspectRatio : 1 / 1.45;
    const fittedArea = (rect: Rect) => {
      const spread = multiPage && stageHoldsSpread(rect) && wantsSpread(input, rect);
      const pageAspect = aspect * (spread ? 2 : 1);
      const width = Math.min(rect.width, rect.height * pageAspect);
      return width * width / pageAspect;
    };
    // Maximise fitted manga area, not empty rectangle area. A tall page may
    // fit best beside the camera; an ordinary page may fit best below it.
    stage = mobileWindowUnoccludedRects(bounds, cameraOcclusions)
      .sort((a, b) => fittedArea(b) - fittedArea(a))[0] ?? bounds;
  }
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
    frame: chromeStage,
    bounds,
    insets,
    occlusions,
    leading: chromeStage,
    trailing: chromeStage,
    // With the bar column both capsules belong to the reading stage beside
    // it, so they share one centre line (and, on the narrow outer display,
    // one pair of edges) with the page instead of hugging the column.
    scrubberRegion: chromeStage,
    leadingSide,
    actionCount: input.actionCount ?? 3,
    titleCenterX: chromeStage.x + chromeStage.width / 2,
    // Compact width keeps the actions on the bottom row. Regular width puts
    // them there too wherever the scrubber keeps its minimum width beside
    // them (the Duo inner display, tablets). The system bar (outer display)
    // carries them itself: its row choice is unchanged.
    // Laptop pose keeps them on top with the panel closed too.
    actionsRow: input.notebookFold
      ? "top"
      : adaptive.widthClass === "compact"
        ? "bottom"
        : input.sideBar
          ? "top"
          : mobileReaderActionsRow(chromeStage, mobileReaderSafePadding(chromeStage, bounds, insets), input.actionCount ?? 3),
    titleOnly: input.sideBar === true,
  });
  if (input.sideBar && chrome.title) {
    // The title is the only top capsule here: centre it on the stage like the
    // scrubber (the title-only path otherwise keeps room for an absent
    // actions capsule and ends short of the scrubber's trailing edge).
    const width = Math.min(READER_CAPSULE_TITLE_MAX_WIDTH, chromeStage.width - 2 * READER_CAPSULE_EDGE);
    chrome.title = { ...chrome.title, x: Math.round(chromeStage.x + (chromeStage.width - width) / 2), width };
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
    chrome,
    chromePinned: false,
    modalFrame: unoccluded,
    popover: mobileReaderPopoverPlacement(chrome),
    tapExclusions: capsuleExclusions(chrome, stage),
    pageSideInsets: constrained || fullBleedBehindRail ? NO_SIDE_INSETS : mobileReaderPageSideInsets(bounds, insets, occlusions),
  };
}

/**
 * Book posture, scroll reading. The strip keeps one half (the reading-start
 * half: left unless a sheet covers it), never crossing the fold, with the
 * toolbar laid out there as on a flat window (title capsule on top, the
 * scrubber and actions on the bottom row). The other half is the side pane:
 * the Laptop Mode content (thumbnails or page controls) on reader black.
 */
function mobileReaderBookScrollPose(
  input: MobileReaderPoseLayoutInput,
  panes: Rect[],
  context: { bounds: Rect; insets: Insets; occlusions: Rect[]; leadingSide: Side },
): MobileReaderPoseLayout {
  const { bounds, insets, occlusions, leadingSide } = context;
  // The strip never moves: a reader sheet presents over the side pane and,
  // once it closes, reveals the pane unchanged (`sheetSide` is ignored here;
  // following it swapped the strip and the pane while the sheet was open).
  const stripIndex = input.rtl ? 1 : 0;
  const pane = panes[stripIndex];
  // Same immersive rule as the paged book: the strip is full-bleed in its
  // half; only a kept system bar column trims it.
  const stage = input.sideBar ? horizontalSafe(pane, bounds, insets) : pane;
  const actionCount = input.actionCount ?? 3;
  const chrome = capsuleChrome({
    frame: stage,
    bounds,
    insets,
    occlusions,
    leading: stage,
    trailing: stage,
    scrubberRegion: stage,
    leadingSide,
    actionCount,
    titleCenterX: stage.x + stage.width / 2,
    actionsRow: input.sideBar
      ? "top"
      : mobileReaderActionsRow(stage, mobileReaderSafePadding(stage, bounds, insets), actionCount),
    titleOnly: input.sideBar === true,
  });
  const sidePane = mobileReaderBookSidePaneLayout(panes[1 - stripIndex], bounds, insets, occlusions, input.sidePaneTopInset);
  // The toolbar's top scrim darkens the strip's half only: over the pane it
  // dimmed the chapter title whenever the toolbar showed.
  if (chrome.kind === "capsules") {
    chrome.topScrim = { ...chrome.topScrim, x: pane.x, width: pane.width };
  }
  return {
    posture: "book",
    bounds,
    safeInsets: insets,
    stage,
    constrained: true,
    twoPageAvailable: false,
    spread: false,
    foldGap: null,
    chrome,
    chromePinned: false,
    modalFrame: stage,
    // Reader settings present over the pane, never over the strip.
    popover: { frame: shrink(sidePane.frame, mobileReaderSafePadding(sidePane.frame, bounds, insets)), bottomGap: READER_POPOVER_GAP },
    tapExclusions: capsuleExclusions(chrome, stage),
    pageSideInsets: NO_SIDE_INSETS,
    sidePane,
  };
}

/**
 * Notebook (laptop) posture, scroll reading. The strip keeps the top half and
 * never comes within `READER_LAPTOP_CREASE_CLEARANCE` of the crease; the
 * toolbar lives inside that half (the title capsule centred on it, the
 * actions at its top trailing end, the scrubber along its bottom). The bottom
 * half is the side pane laid out as a row: the Laptop Mode content
 * (thumbnails or page controls) on reader black.
 */
function mobileReaderLaptopScrollPose(
  input: MobileReaderPoseLayoutInput,
  panes: Rect[],
  fold: Rect | null,
  context: { bounds: Rect; insets: Insets; occlusions: Rect[]; leadingSide: Side },
): MobileReaderPoseLayout {
  const { bounds, insets, occlusions, leadingSide } = context;
  const [topPane, bottomPane] = panes;
  const crease = mobileReaderLaptopCreaseClearance(topPane, bottomPane, fold);
  // Immersive like the flat strip (full bleed, the status bar hides while
  // reading); only the crease is kept clear. A kept system bar column
  // (Split View) trims the sides as elsewhere.
  const pane: Rect = { ...topPane, height: Math.max(0, crease.stripBottom - topPane.y) };
  const stage = input.sideBar ? horizontalSafe(pane, bounds, insets) : pane;
  const actionCount = input.actionCount ?? 3;
  const chromeInput: CapsuleChromeInput = {
    frame: stage,
    bounds,
    insets,
    occlusions,
    leading: stage,
    trailing: stage,
    scrubberRegion: stage,
    leadingSide,
    actionCount,
    titleCenterX: stage.x + stage.width / 2,
    actionsRow: "top",
    titleOnly: input.sideBar === true,
    centreTitle: true,
  };
  const chrome = mobileReaderCentredTitleChrome(chromeInput);
  const sideFrame: Rect = {
    ...bottomPane,
    y: crease.paneTop,
    height: Math.max(0, bottomPane.y + bottomPane.height - crease.paneTop),
  };
  const sidePane = mobileReaderLaptopSidePaneLayout(sideFrame, bounds, insets, occlusions);
  return {
    posture: "notebook",
    bounds,
    safeInsets: insets,
    stage,
    constrained: true,
    twoPageAvailable: false,
    spread: false,
    foldGap: null,
    chrome,
    chromePinned: false,
    modalFrame: stage,
    popover: mobileReaderPopoverPlacement(chrome),
    tapExclusions: capsuleExclusions(chrome, stage),
    pageSideInsets: NO_SIDE_INSETS,
    sidePane,
  };
}

/**
 * Where the strip must end and the bottom pane may start in the laptop
 * posture: the panes as the fold leaves them, never closer than
 * `READER_LAPTOP_CREASE_CLEARANCE` to the crease — the fold region's top and
 * bottom edges (the gap between the panes when no region is known).
 * `crease` is the region's centre line.
 */
export function mobileReaderLaptopCreaseClearance(
  topPane: Rect,
  bottomPane: Rect,
  fold: Rect | null,
): { crease: number; stripBottom: number; paneTop: number } {
  const topEnd = topPane.y + topPane.height;
  const region = fold && fold.height >= 0
    ? fold
    : { y: Math.min(topEnd, bottomPane.y), height: Math.abs(bottomPane.y - topEnd) };
  return {
    crease: region.y + region.height / 2,
    stripBottom: Math.min(topEnd, region.y) - READER_LAPTOP_CREASE_CLEARANCE,
    paneTop: Math.max(bottomPane.y, region.y + region.height) + READER_LAPTOP_CREASE_CLEARANCE,
  };
}

/**
 * Capsule chrome whose title capsule sits on `titleCenterX` with its full
 * label: the status-bar row when the title fits there centred, else the row
 * right under the status island (a Duo inner portrait island leaves too
 * little room between it and the centre for the actions and a full title).
 */
function mobileReaderCentredTitleChrome(input: CapsuleChromeInput): Extract<MobileReaderChromeLayout, { kind: "capsules" }> {
  const centred = (chrome: Extract<MobileReaderChromeLayout, { kind: "capsules" }>) =>
    chrome.title !== null
    && chrome.title.width >= READER_CAPSULE_TITLE_FULL_MIN_WIDTH
    && Math.abs(chrome.title.x + chrome.title.width / 2 - input.titleCenterX) <= 1;
  const rows = mobileReaderCapsuleRowTops(input.bounds, input.insets, input.occlusions, READER_CAPSULE_HEIGHT);
  if (rows.shared !== null) {
    const shared = capsuleChromeAt(input, rows.shared);
    if (input.titleOnly || centred(shared)) return shared;
  }
  return capsuleChromeAt(input, rows.below);
}

/** The laptop posture's bottom half: a row of thumbnails, or the page controls side by side. */
export function mobileReaderLaptopSidePaneLayout(
  frame: Rect,
  bounds: Rect,
  insets: Insets,
  occlusions: Rect[],
): MobileReaderBookSidePane {
  // Side insets the status island alone explains are not real edges.
  const side = mobileReaderPageSideInsets(bounds, insets, occlusions);
  const left = frame.x <= bounds.x + EPSILON ? side.left : 0;
  const right = frame.x + frame.width >= bounds.x + bounds.width - EPSILON ? side.right : 0;
  const inset = READER_BOOK_SIDE_PANE_INSET;
  const list: Rect = {
    x: frame.x + left,
    y: frame.y,
    width: Math.max(0, frame.width - left - right),
    height: frame.height,
  };
  const size = READER_BOOK_PAGE_CONTROL_SIZE;
  const centreX = frame.x + left + (frame.width - left - right) / 2;
  const centreY = frame.y + frame.height / 2;
  return {
    orientation: "horizontal",
    frame,
    header: { x: frame.x + left + inset, y: frame.y + inset, width: Math.max(0, frame.width - left - right - inset * 2), height: 0 },
    list,
    thumbnailSize: Math.max(0, frame.height - inset * 2),
    pageUp: { x: centreX - READER_BOOK_PAGE_CONTROL_GAP / 2 - size, y: centreY - size / 2, width: size, height: size },
    pageDown: { x: centreX + READER_BOOK_PAGE_CONTROL_GAP / 2, y: centreY - size / 2, width: size, height: size },
  };
}

/** The side pane's pieces inside its half (reader-local). */
export function mobileReaderBookSidePaneLayout(
  frame: Rect,
  bounds: Rect,
  insets: Insets,
  occlusions: Rect[],
  /** The top safe-area inset with the status bar shown (`sidePaneTopInset`); the live one when absent. */
  stableTopInset?: number | null,
): MobileReaderBookSidePane {
  const pad = mobileReaderSafePadding(frame, bounds, insets);
  const topInset = frame.y <= bounds.y + EPSILON
    ? Math.max(pad.top, Number.isFinite(stableTopInset) ? Math.max(0, stableTopInset!) : 0)
    : 0;
  // Side insets the status island alone explains are not real edges.
  const side = mobileReaderPageSideInsets(bounds, insets, occlusions);
  const left = frame.x <= bounds.x + EPSILON ? side.left : 0;
  const right = frame.x + frame.width >= bounds.x + bounds.width - EPSILON ? side.right : 0;
  const inset = READER_BOOK_SIDE_PANE_INSET;
  const headerHeight = READER_BOOK_SIDE_PANE_HEADER_HEIGHT;
  // The title line sits 8pt below the top safe area (under the status bar,
  // never beside its clock); the thumbnails start 8pt below it.
  let header: Rect = {
    x: frame.x + left + inset,
    y: frame.y + topInset + READER_BOOK_SIDE_PANE_TOP_GAP,
    width: Math.max(0, frame.width - left - right - inset * 2),
    height: headerHeight,
  };
  // The status island (top trailing corner) keeps the title line clear of it:
  // the line ends before it, or moves below it when too little would be left.
  for (const rect of occlusions) {
    if (!intersects(header, rect)) continue;
    const trailingHalf = rect.x + rect.width / 2 >= header.x + header.width / 2;
    const end = trailingHalf ? rect.x - READER_CAPSULE_GAP : header.x + header.width;
    const start = trailingHalf ? header.x : rect.x + rect.width + READER_CAPSULE_GAP;
    if (end - start >= READER_CAPSULE_TITLE_MIN_WIDTH) {
      header = { ...header, x: start, width: end - start };
    } else {
      header = { ...header, y: rect.y + rect.height + READER_CAPSULE_GAP };
    }
  }
  const listTop = header.y + header.height + READER_BOOK_SIDE_PANE_HEADER_GAP;
  const list: Rect = {
    x: frame.x + left,
    y: listTop,
    width: Math.max(0, frame.width - left - right),
    height: Math.max(0, frame.y + frame.height - pad.bottom - listTop),
  };
  const size = READER_BOOK_PAGE_CONTROL_SIZE;
  const centreX = frame.x + left + (frame.width - left - right) / 2;
  const centreY = frame.y + frame.height / 2;
  return {
    frame,
    header,
    list,
    orientation: "vertical",
    thumbnailSize: Math.max(0, list.width - inset * 2),
    pageUp: { x: centreX - size / 2, y: centreY - READER_BOOK_PAGE_CONTROL_GAP / 2 - size, width: size, height: size },
    pageDown: { x: centreX - size / 2, y: centreY + READER_BOOK_PAGE_CONTROL_GAP / 2, width: size, height: size },
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

/**
 * The window as the reader lays it out once the notebook sheet is closed: the
 * fold is not a split line any more, so the reader is the ordinary flat one for
 * this window (page across the whole display, the usual capsule rows).
 */
export function mobileReaderLayoutWithoutFold(layout: MobileWindowLayout): MobileWindowLayout {
  return layout.divisions.length === 0 ? layout : { ...layout, divisions: [] };
}
