import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * Notebook posture (iPhone Duo half-folded portrait, Android tabletop): the
 * page sits in the top pane and the bottom pane — the half resting on the
 * table, where the hands are — is one surface with three states.
 *
 * - `trackpad` (B): a calm dark pad for turning pages, large previous / next
 *   halves in reading order, a quiet page indicator and a hairline progress
 *   line; a small glass handle expands it.
 * - `filmstrip` (A): the expanded console — title, spoiler-safe thumbnails
 *   (only pages already read and the current page render images), the
 *   scrubber with chapter skips and the capsule actions.
 * - `continuous` (C): scroll / long-strip reading — the strip flows through
 *   both panes and the fold is a thin dark band the content passes under.
 *
 * Japanese Learning tools are not part of the pane: they open in the same
 * system sheets as everywhere else, which the system moves off the fold.
 *
 * Pure decisions only; `ReaderScreen` owns the state and
 * `ReaderNotebookPane.tsx` draws it.
 */

export type MobileReaderNotebookPanePreference = "automatic" | "trackpad" | "filmstrip";
export type MobileReaderNotebookPaneState = "trackpad" | "filmstrip" | "continuous";
/** A choice made in this reading session (expand, collapse). Never persisted. */
export type MobileReaderNotebookPaneOverride = Exclude<MobileReaderNotebookPaneState, "continuous"> | null;

export const MOBILE_READER_NOTEBOOK_PANE_PREFERENCES: readonly MobileReaderNotebookPanePreference[] = [
  "automatic",
  "trackpad",
  "filmstrip",
];
export const DEFAULT_MOBILE_READER_NOTEBOOK_PANE: MobileReaderNotebookPanePreference = "automatic";

export function isMobileReaderNotebookPanePreference(value: unknown): value is MobileReaderNotebookPanePreference {
  return typeof value === "string" && (MOBILE_READER_NOTEBOOK_PANE_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeMobileReaderNotebookPanePreference(value: unknown): MobileReaderNotebookPanePreference {
  return isMobileReaderNotebookPanePreference(value) ? value : DEFAULT_MOBILE_READER_NOTEBOOK_PANE;
}

/**
 * The paged state a preference asks for: Automatic is the trackpad. A value
 * saved by an older build ("studyDesk") normalizes to Automatic.
 */
export function mobileReaderNotebookPaneBase(
  preference: MobileReaderNotebookPanePreference,
): Exclude<MobileReaderNotebookPaneState, "continuous"> {
  return preference === "automatic" ? "trackpad" : preference;
}

export function resolveMobileReaderNotebookPane(input: {
  preference: MobileReaderNotebookPanePreference;
  /** Paged gallery; false = scroll / long strip. */
  paged: boolean;
  override: MobileReaderNotebookPaneOverride;
}): MobileReaderNotebookPaneState {
  if (!input.paged) return "continuous";
  return input.override ?? mobileReaderNotebookPaneBase(input.preference);
}

// --- Trackpad (B) ----------------------------------------------------------

export type MobileReaderTrackpadSide = "left" | "right";

/** A half of the pad turns the page the way the page itself would: in right-to-left books the left half goes forward. */
export function mobileReaderTrackpadStep(side: MobileReaderTrackpadSide, rtl: boolean): "previous" | "next" {
  if (rtl) return side === "left" ? "next" : "previous";
  return side === "left" ? "previous" : "next";
}

/** A swipe must travel this far (pt) before it counts; shorter drags stay taps. */
export const READER_NOTEBOOK_SWIPE_MIN = 32;

/**
 * A swipe across the pad drags the page the way the pager would: in a
 * left-to-right book a leftward swipe goes forward, in a right-to-left book a
 * rightward one does. An upward swipe expands the pad into the filmstrip.
 */
export function mobileReaderTrackpadSwipe(input: { dx: number; dy: number; rtl: boolean }): "previous" | "next" | "expand" | null {
  const { dx, dy } = input;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < READER_NOTEBOOK_SWIPE_MIN) return null;
    const leftward = dx < 0;
    return leftward === !input.rtl ? "next" : "previous";
  }
  return dy <= -READER_NOTEBOOK_SWIPE_MIN ? "expand" : null;
}

/** Inset of the pad inside the pane, and its corner radius. */
export const READER_NOTEBOOK_PAD_INSET = 12;
export const READER_NOTEBOOK_PAD_RADIUS = 28;
export const READER_NOTEBOOK_HANDLE_WIDTH = 64;
export const READER_NOTEBOOK_HANDLE_HEIGHT = 28;
/** The handle's touch target is the full capsule row height. */
export const READER_NOTEBOOK_HANDLE_HIT = 44;
export const READER_NOTEBOOK_PROGRESS_HEIGHT = 3;

export type MobileReaderTrackpadLayout = {
  pad: WindowLayoutRect;
  handle: WindowLayoutRect;
  /** Touch target around the handle (≥ 44pt tall). */
  handleHit: WindowLayoutRect;
  halves: { left: WindowLayoutRect; right: WindowLayoutRect };
  /** Page indicator label box, centred above the progress line. */
  indicator: WindowLayoutRect;
  progress: WindowLayoutRect;
};

/** Trackpad geometry inside the pane (pane-local coordinates). */
export function mobileReaderTrackpadLayout(pane: { width: number; height: number }): MobileReaderTrackpadLayout {
  const width = Math.max(0, pane.width);
  const height = Math.max(0, pane.height);
  const inset = Math.min(READER_NOTEBOOK_PAD_INSET, width / 4, height / 4);
  const pad = { x: inset, y: inset, width: Math.max(0, width - inset * 2), height: Math.max(0, height - inset * 2) };
  const handle = {
    x: Math.round(pad.x + (pad.width - READER_NOTEBOOK_HANDLE_WIDTH) / 2),
    y: pad.y + 10,
    width: READER_NOTEBOOK_HANDLE_WIDTH,
    height: READER_NOTEBOOK_HANDLE_HEIGHT,
  };
  const hitWidth = READER_NOTEBOOK_HANDLE_WIDTH + 40;
  const handleHit = {
    x: Math.round(pad.x + (pad.width - hitWidth) / 2),
    y: handle.y - (READER_NOTEBOOK_HANDLE_HIT - READER_NOTEBOOK_HANDLE_HEIGHT) / 2,
    width: hitWidth,
    height: READER_NOTEBOOK_HANDLE_HIT,
  };
  const half = pad.width / 2;
  const sideRoom = Math.min(28, pad.width / 8);
  const progress = {
    x: pad.x + sideRoom,
    y: pad.y + pad.height - 22 - READER_NOTEBOOK_PROGRESS_HEIGHT,
    width: Math.max(0, pad.width - sideRoom * 2),
    height: READER_NOTEBOOK_PROGRESS_HEIGHT,
  };
  const indicator = { x: pad.x + sideRoom, y: progress.y - 28, width: progress.width, height: 18 };
  return {
    pad,
    handle,
    handleHit,
    halves: {
      left: { x: pad.x, y: pad.y, width: half, height: pad.height },
      right: { x: pad.x + half, y: pad.y, width: pad.width - half, height: pad.height },
    },
    indicator,
    progress,
  };
}

/**
 * Progress fill as a fraction and the edge it grows from: a right-to-left
 * book fills from the right, like its scrubber.
 */
export function mobileReaderTrackpadProgress(input: { pageIndex: number; pageCount: number; rtl: boolean }): {
  fraction: number;
  from: "left" | "right";
} {
  const count = Math.max(0, Math.floor(input.pageCount));
  const fraction = count <= 1 ? (count === 1 ? 1 : 0) : Math.max(0, Math.min(1, (input.pageIndex + 1) / count));
  return { fraction, from: input.rtl ? "right" : "left" };
}

// --- Filmstrip (A) ---------------------------------------------------------

/**
 * Which pages may show their image in the filmstrip or a scrub preview:
 * everything up to where the reader was when the chapter opened (earlier
 * sessions; a completed chapter is read through), every page actually shown
 * in this session, and the current page. A page reached only by jumping past
 * it is still unread. Everything else is a spoiler and stays a numbered
 * placeholder — its image is never requested or decoded.
 */
export type MobileReaderNotebookReveal = {
  /** Pages 0…through are read (−1: none). */
  through: number;
  /** Pages shown in this session, the current one included. */
  visited: ReadonlySet<number>;
};

export function mobileReaderNotebookReveal(input: {
  pageCount: number;
  currentIndex: number;
  /** Saved position when the chapter opened; null when never read. */
  openedAtIndex: number | null;
  completed: boolean;
  visited: ReadonlySet<number>;
}): MobileReaderNotebookReveal {
  const count = Math.max(0, Math.floor(input.pageCount));
  if (count === 0) return { through: -1, visited: new Set() };
  const through = input.completed
    ? count - 1
    : input.openedAtIndex == null || !Number.isFinite(input.openedAtIndex)
      ? -1
      : Math.max(-1, Math.min(count - 1, Math.floor(input.openedAtIndex)));
  const current = Math.max(0, Math.min(count - 1, Math.floor(input.currentIndex)));
  const visited = input.visited.has(current) ? input.visited : new Set([...input.visited, current]);
  return { through, visited };
}

export function mobileReaderPageRevealed(index: number, reveal: MobileReaderNotebookReveal): boolean {
  if (!Number.isFinite(index) || index < 0) return false;
  return index <= reveal.through || reveal.visited.has(index);
}

export const READER_FILMSTRIP_GAP = 8;
/** Thumbnails keep a manga page's ~0.7 aspect. */
export const READER_FILMSTRIP_ASPECT = 0.7;
export const READER_FILMSTRIP_MIN_HEIGHT = 72;
export const READER_FILMSTRIP_MAX_HEIGHT = 168;
/** Page number caption under each thumbnail. */
export const READER_FILMSTRIP_CAPTION = 18;

export function mobileReaderFilmstripItemSize(availableHeight: number): { width: number; height: number; stride: number } {
  const thumb = Math.max(
    READER_FILMSTRIP_MIN_HEIGHT,
    Math.min(READER_FILMSTRIP_MAX_HEIGHT, Math.floor((Number.isFinite(availableHeight) ? availableHeight : 0) - READER_FILMSTRIP_CAPTION)),
  );
  const width = Math.round(thumb * READER_FILMSTRIP_ASPECT);
  return { width, height: thumb, stride: width + READER_FILMSTRIP_GAP };
}

/**
 * Horizontal offset that centres page `index` in the strip. Right-to-left
 * strips list the pages reversed (first page on the right), so the position
 * is counted from the other end.
 */
export function mobileReaderFilmstripOffset(input: {
  index: number;
  count: number;
  stride: number;
  itemWidth: number;
  viewportWidth: number;
  padding: number;
  rtl: boolean;
}): number {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0 || !(input.viewportWidth > 0)) return 0;
  const clamped = Math.max(0, Math.min(count - 1, Math.floor(input.index)));
  const slot = input.rtl ? count - 1 - clamped : clamped;
  const content = input.padding * 2 + count * input.stride - READER_FILMSTRIP_GAP;
  const centre = input.padding + slot * input.stride + input.itemWidth / 2;
  const max = Math.max(0, content - input.viewportWidth);
  return Math.max(0, Math.min(max, Math.round(centre - input.viewportWidth / 2)));
}

/** List order for the strip: reading order, reversed for right-to-left books. */
export function mobileReaderFilmstripOrder(count: number, rtl: boolean): number[] {
  const pages = Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => index);
  return rtl ? pages.reverse() : pages;
}

// --- Motion ------------------------------------------------------------------

export type MobileReaderNotebookPaneMotion =
  | { kind: "none" }
  | { kind: "fade"; durationMs: number }
  /** The incoming state rises (dy > 0) or settles down (dy < 0) into place with the settle spring while it fades in. */
  | { kind: "spring"; dy: number; fadeInMs: number; fadeOutMs: number };

const STATE_DEPTH: Record<MobileReaderNotebookPaneState, number> = {
  trackpad: 0,
  continuous: 0,
  filmstrip: 1,
};

/** B → A rises from the hinge side (the expanded states sit "higher"); collapsing settles back down. */
export function mobileReaderNotebookPaneMotion(input: {
  from: MobileReaderNotebookPaneState | null;
  to: MobileReaderNotebookPaneState;
  reduceMotion: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  reduceMotionFadeMs: number;
}): MobileReaderNotebookPaneMotion {
  if (input.from === null || input.from === input.to) return { kind: "none" };
  if (input.reduceMotion) return { kind: "fade", durationMs: input.reduceMotionFadeMs };
  const rising = STATE_DEPTH[input.to] >= STATE_DEPTH[input.from];
  return { kind: "spring", dy: rising ? 18 : -10, fadeInMs: input.fadeInMs, fadeOutMs: input.fadeOutMs };
}
