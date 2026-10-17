import type { ReadingMode } from "@/data/schema";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import { visualPageIndexesForMobileReaderSpread } from "@/lib/mobileReaderSpreads";

/**
 * The curl page turn (翻页 › 卷页) lays the pager out as a row of slots in
 * visual order, left to right, as the native `UIPageViewController` sees it
 * ("before" is the slot on the left, "after" the one on the right):
 *
 * - single pages: one slot per page, the binding on the reading-start edge
 *   (`min` for left-to-right, `max` for right-to-left manga);
 * - spreads: two slots per spread around a middle spine, the turning leaf's
 *   back being the next spread's facing page, as in a book.
 *
 * Frames are the gallery's visual frames (pages, or spreads, RTL reversed),
 * so a frame index is the same number the slide pager scrolls to.
 */
export type MobileReaderPageTurn = "curl" | "slide";

export const DEFAULT_MOBILE_READER_PAGE_TURN: MobileReaderPageTurn = "curl";

/** The 翻页 menu, in Apple's order. */
export const MOBILE_READER_PAGE_TURNS: readonly MobileReaderPageTurn[] = ["curl", "slide"];

export function normalizeMobileReaderPageTurn(value: unknown): MobileReaderPageTurn {
  return value === "slide" ? "slide" : DEFAULT_MOBILE_READER_PAGE_TURN;
}

export type MobileReaderCurlSpine = "min" | "max" | "mid";

export type MobileReaderCurlSlot =
  /** A page on its own leaf (single page, or one side of a spread). */
  | { kind: "page"; frame: number; pageIndex: number; part: "whole" }
  /** One half of a wide page laid across the spine. */
  | { kind: "page"; frame: number; pageIndex: number; part: "left" | "right" }
  /** The empty side of a page that stands alone in a spread. */
  | { kind: "blank"; frame: number };

/**
 * The curl replaces the slide only where it can turn real pages: a paged
 * gallery of whole pages (no long strip, no tiled image), motion allowed.
 * Reduce Motion keeps the slide.
 */
export function isMobileReaderPageCurlActive(input: {
  pageTurn: MobileReaderPageTurn;
  pagedMode: boolean;
  reduceMotion: boolean | null;
  longStrip: boolean;
  segmented: boolean;
  available: boolean;
}): boolean {
  return (
    input.available &&
    input.pageTurn === "curl" &&
    input.pagedMode &&
    input.reduceMotion === false &&
    !input.longStrip &&
    !input.segmented
  );
}

export function mobileReaderCurlSpine(spreadMode: boolean, mode: ReadingMode): MobileReaderCurlSpine {
  if (spreadMode) return "mid";
  return mode === "rtl" ? "max" : "min";
}

/**
 * Which side a page standing alone in a spread rests on. A book opens on a
 * recto (right in left-to-right books, left in manga): a lone page that
 * starts a run (a cover, the page after a wide page) is a recto; one that
 * closes the chapter or comes just before a wide page is a verso.
 */
export function mobileReaderCurlLoneSide(input: {
  mode: ReadingMode;
  /** The next spread in reading order; null at the end of the chapter. */
  nextSpread: number[] | null;
  isWide: (pageIndex: number) => boolean;
}): "left" | "right" {
  const nextIsWide = input.nextSpread?.length === 1 && input.isWide(input.nextSpread[0]!);
  const recto = input.nextSpread !== null && !nextIsWide;
  const rectoSide = input.mode === "rtl" ? "left" : "right";
  const versoSide = input.mode === "rtl" ? "right" : "left";
  return recto ? rectoSide : versoSide;
}

/**
 * Slots for the gallery's visual frames. `frames` are the visual frames: page
 * indexes (single) or spreads (each in reading order, the frames themselves
 * RTL reversed, as the slide pager lays them out).
 */
export function buildMobileReaderCurlSlots(input: {
  frames: readonly (readonly number[])[];
  spreadMode: boolean;
  mode: ReadingMode;
  /** A lone wide page is laid across the spine (flat spreads only). */
  splitWide: boolean;
  isWide: (pageIndex: number) => boolean;
}): MobileReaderCurlSlot[] {
  const slots: MobileReaderCurlSlot[] = [];
  const { frames, mode } = input;
  frames.forEach((spread, frame) => {
    if (!input.spreadMode) {
      slots.push({ kind: "page", frame, pageIndex: spread[0]!, part: "whole" });
      return;
    }
    if (spread.length === 2) {
      const [left, right] = visualPageIndexesForMobileReaderSpread([...spread], mode);
      slots.push({ kind: "page", frame, pageIndex: left!, part: "whole" });
      slots.push({ kind: "page", frame, pageIndex: right!, part: "whole" });
      return;
    }
    const pageIndex = spread[0]!;
    if (input.splitWide && input.isWide(pageIndex)) {
      slots.push({ kind: "page", frame, pageIndex, part: "left" });
      slots.push({ kind: "page", frame, pageIndex, part: "right" });
      return;
    }
    // Reading order runs right to left across RTL visual frames.
    const nextFrame = mode === "rtl" ? frame - 1 : frame + 1;
    const side = mobileReaderCurlLoneSide({
      mode,
      nextSpread: frames[nextFrame] ? [...frames[nextFrame]!] : null,
      isWide: input.isWide,
    });
    const page: MobileReaderCurlSlot = { kind: "page", frame, pageIndex, part: "whole" };
    const blank: MobileReaderCurlSlot = { kind: "blank", frame };
    slots.push(...(side === "left" ? [page, blank] : [blank, page]));
  });
  return slots;
}

export function mobileReaderCurlSlotForFrame(frame: number, spreadMode: boolean): number {
  const clamped = Math.max(0, Math.round(Number.isFinite(frame) ? frame : 0));
  return spreadMode ? clamped * 2 : clamped;
}

export function mobileReaderCurlFrameForSlot(slot: number, spreadMode: boolean): number {
  const clamped = Math.max(0, Math.round(Number.isFinite(slot) ? slot : 0));
  return spreadMode ? Math.floor(clamped / 2) : clamped;
}

/** The slots kept mounted (and so decoded) around the one on screen: ±`radius` frames. */
export function mobileReaderCurlSlotWindow(input: {
  frame: number;
  frameCount: number;
  spreadMode: boolean;
  radius?: number;
}): { start: number; end: number } {
  const radius = input.radius ?? MOBILE_READER_CURL_PRELOAD_FRAMES;
  if (input.frameCount <= 0) return { start: 0, end: -1 };
  const first = Math.max(0, input.frame - radius);
  const last = Math.min(input.frameCount - 1, input.frame + radius);
  const per = input.spreadMode ? 2 : 1;
  return { start: first * per, end: last * per + per - 1 };
}

/** Frames on either side of the current one that stay mounted: the turn never reveals an unloaded leaf. */
export const MOBILE_READER_CURL_PRELOAD_FRAMES = 2;

/**
 * Where a drag past either end of the row leads in reading order: "after" is
 * the slot on the right, the next page in a left-to-right book and the
 * previous one in manga.
 */
export function mobileReaderCurlEdgeIntent(side: "before" | "after", mode: ReadingMode): "next" | "previous" {
  const towardRight = side === "after";
  return towardRight === (mode !== "rtl") ? "next" : "previous";
}

export type MobileReaderCurlLayout = {
  /** The curl's frame in the stage: centred on the spine for spreads. */
  frame: WindowLayoutRect;
  /** One leaf (a slot's child): the frame, or half of it around a middle spine. */
  leaf: { width: number; height: number };
  /**
   * Leaf-local boxes the pages rest in: [left leaf, right leaf] for spreads
   * (each page leans on the spine side of its box), one box for a single page.
   */
  boxes: WindowLayoutRect[];
};

/**
 * Curl geometry in stage coordinates. Single pages curl across the whole
 * stage. A spread turns about its spine: the stage centre where the pages
 * meet, or the middle of the fold in the book posture, where each page rests
 * in its own pane and the crease stays clear (the leaves are symmetric about
 * the fold, so the spine sits exactly on it).
 */
export function mobileReaderCurlLayout(input: {
  stage: { width: number; height: number };
  spreadMode: boolean;
  spreadSlots?: readonly WindowLayoutRect[] | null;
  foldGap?: { start: number; end: number } | null;
}): MobileReaderCurlLayout {
  const width = Math.max(1, input.stage.width);
  const height = Math.max(1, input.stage.height);
  if (!input.spreadMode) {
    return {
      frame: { x: 0, y: 0, width, height },
      leaf: { width, height },
      boxes: [{ x: 0, y: 0, width, height }],
    };
  }
  const slots = input.spreadSlots && input.spreadSlots.length === 2 ? input.spreadSlots : null;
  if (!slots) {
    const half = width / 2;
    return {
      frame: { x: 0, y: 0, width, height },
      leaf: { width: half, height },
      boxes: [
        { x: 0, y: 0, width: half, height },
        { x: 0, y: 0, width: half, height },
      ],
    };
  }
  const [left, right] = slots as [WindowLayoutRect, WindowLayoutRect];
  const spine = input.foldGap
    ? (input.foldGap.start + input.foldGap.end) / 2
    : (left.x + left.width + right.x) / 2;
  const half = Math.max(1, spine - left.x, right.x + right.width - spine);
  const top = Math.min(left.y, right.y);
  const bottom = Math.max(left.y + left.height, right.y + right.height);
  const frame = { x: spine - half, y: top, width: half * 2, height: Math.max(1, bottom - top) };
  return {
    frame,
    leaf: { width: half, height: frame.height },
    boxes: [
      { x: left.x - frame.x, y: left.y - top, width: left.width, height: left.height },
      { x: right.x - spine, y: right.y - top, width: right.width, height: right.height },
    ],
  };
}

/**
 * Native slot request: a token per request (the same slot asked twice is two
 * requests). A one-frame step curls; anything further jumps.
 */
export type MobileReaderCurlNavigation = { slot: number; token: number; animated: boolean };

export function nextMobileReaderCurlNavigation(
  current: MobileReaderCurlNavigation,
  slot: number,
  animated: boolean,
): MobileReaderCurlNavigation {
  return { slot, token: current.token + 1, animated };
}
