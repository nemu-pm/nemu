import type { MobileReaderScrollLayout } from "@/lib/mobileReaderScrollLayout";
import { mobileReaderPageBackgroundIsLight } from "@/lib/mobileReaderPageBackground";

/**
 * A page without its image yet: the reader background, and a small native
 * spinner that appears only after a short wait (a cached page never flashes
 * one). A failed page shows its icon and text in the same colour.
 */

/** The spinner appears this long after the page starts waiting. */
export const MOBILE_READER_PAGE_SPINNER_DELAY_MS = 150;
/** UIActivityIndicatorView `.medium` (RN "small"). */
export const MOBILE_READER_PAGE_SPINNER_SIZE = 20;
/** On a light page background: iOS systemGray. */
export const MOBILE_READER_PAGE_STATUS_COLOR_LIGHT = "#8e8e93";
/** On a dark page background: iOS secondaryLabel (dark). */
export const MOBILE_READER_PAGE_STATUS_COLOR_DARK = "rgba(235,235,245,0.6)";

/**
 * How long a page that was waiting keeps its frame painted once its image
 * arrives: the image's 240 ms fade from transparent, with room for the native
 * animation to start. A frame cleared at once showed the stage's black through
 * the still-transparent image (a black flash where a white page was coming).
 */
export const MOBILE_READER_PAGE_ARRIVAL_PAINT_MS = 400;

/**
 * Whether a page's frame paints the page background under its image: while
 * there is no image to show (waiting, failed), in scroll reading always, and
 * while an image that was waited for fades in. Otherwise transparent, so a
 * remounted page that is already decoded lets the previous one show through.
 */
export function mobileReaderPageFramePaintsBackground(state: {
  loading: boolean;
  failed: boolean;
  quietLoading: boolean;
  arriving: boolean;
}): boolean {
  return state.loading || state.failed || state.quietLoading || state.arriving;
}

/** The spinner's (and a failed page's icon and text) colour over `backgroundColor`. */
export function mobileReaderPageStatusColor(backgroundColor: string): string {
  return mobileReaderPageBackgroundIsLight(backgroundColor)
    ? MOBILE_READER_PAGE_STATUS_COLOR_LIGHT
    : MOBILE_READER_PAGE_STATUS_COLOR_DARK;
}

/**
 * Scroll reading: where a waiting page's spinner sits, as the distance of
 * its centre from the page's top — the middle of the part of the page on
 * screen (so a page taller than the screen keeps it in view), kept inside
 * the page. Null when no part of the page is on screen: no spinner mounts.
 *
 * `pageTop` is in the scroll layout's terms (the content offset that puts
 * the page's top right below `topPadding`).
 */
export function mobileReaderPageSpinnerCentre(input: {
  pageTop: number;
  pageHeight: number;
  contentOffset: number;
  viewportHeight: number;
  topPadding: number;
  spinnerSize?: number;
}): number | null {
  const { pageTop, pageHeight, contentOffset, viewportHeight } = input;
  if (
    !Number.isFinite(pageTop) ||
    !Number.isFinite(pageHeight) ||
    !Number.isFinite(contentOffset) ||
    !(pageHeight > 0) ||
    !(viewportHeight > 0)
  ) {
    return null;
  }
  const padding = Number.isFinite(input.topPadding) ? Math.max(0, input.topPadding) : 0;
  // The page's top on screen.
  const top = pageTop + padding - contentOffset;
  const visibleTop = Math.max(top, 0);
  const visibleBottom = Math.min(top + pageHeight, viewportHeight);
  if (visibleBottom <= visibleTop) return null;
  const half = Math.min((input.spinnerSize ?? MOBILE_READER_PAGE_SPINNER_SIZE) / 2, pageHeight / 2);
  const centre = (visibleTop + visibleBottom) / 2 - top;
  return Math.round(Math.max(half, Math.min(pageHeight - half, centre)));
}

/** A cell of the scroll list, for its waiting page's spinner. */
export type MobileReaderScrollCellRef = { kind: "page" | "segment"; index: number };

export type MobileReaderScrollViewportStore = {
  /** Recorded while rendering (no one told); `notify` tells the spinners. */
  setGeometry(input: {
    layout: MobileReaderScrollLayout | null;
    segments: readonly { offset: number; height: number }[] | null;
    topPadding: number;
    fallbackViewportHeight: number;
  }): void;
  setScroll(contentOffset: number, viewportHeight: number): void;
  notify(): void;
  subscribe(listener: () => void): () => void;
  /** `mobileReaderPageSpinnerCentre` for a cell, or null (off screen or unknown). */
  spinnerCentre(cell: MobileReaderScrollCellRef): number | null;
};

/**
 * The scroll list's viewport, outside React state: each waiting page's
 * spinner subscribes to its own placement, so a scroll re-renders only the
 * spinners that move, appear or go — and only pages on screen have one.
 */
export function createMobileReaderScrollViewportStore(initialOffset = 0): MobileReaderScrollViewportStore {
  let layout: MobileReaderScrollLayout | null = null;
  let segments: readonly { offset: number; height: number }[] | null = null;
  let topPadding = 0;
  let fallbackViewportHeight = 0;
  let offset = Number.isFinite(initialOffset) ? initialOffset : 0;
  let viewportHeight = 0;
  let dirty = false;
  const listeners = new Set<() => void>();
  return {
    setGeometry(input) {
      if (
        layout === input.layout &&
        segments === input.segments &&
        topPadding === input.topPadding &&
        fallbackViewportHeight === input.fallbackViewportHeight
      ) {
        return;
      }
      layout = input.layout;
      segments = input.segments;
      topPadding = input.topPadding;
      fallbackViewportHeight = input.fallbackViewportHeight;
      dirty = true;
    },
    setScroll(nextOffset, nextViewportHeight) {
      if (!Number.isFinite(nextOffset)) return;
      if (nextOffset === offset && nextViewportHeight === viewportHeight) return;
      offset = nextOffset;
      if (nextViewportHeight > 0) viewportHeight = nextViewportHeight;
      dirty = true;
    },
    notify() {
      if (!dirty) return;
      dirty = false;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    spinnerCentre(cell) {
      let pageTop: number | undefined;
      let pageHeight: number | undefined;
      if (cell.kind === "segment") {
        const frame = segments?.[cell.index];
        pageTop = frame?.offset;
        pageHeight = frame?.height;
      } else if (layout && cell.index >= 0 && cell.index < layout.heights.length) {
        pageTop = layout.starts[cell.index]! + layout.gaps[cell.index]!;
        pageHeight = layout.heights[cell.index];
      }
      if (pageTop === undefined || pageHeight === undefined) return null;
      return mobileReaderPageSpinnerCentre({
        pageTop,
        pageHeight,
        contentOffset: offset,
        viewportHeight: viewportHeight > 0 ? viewportHeight : fallbackViewportHeight,
        topPadding,
      });
    },
  };
}
