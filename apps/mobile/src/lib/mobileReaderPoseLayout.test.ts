import { describe, expect, test } from "bun:test";
import {
  mobileReaderDockWidth,
  mobileReaderFrameInsets,
  mobileReaderPopoverPlacement,
  mobileReaderDockedLearningSurface,
  mobileReaderPoseLayout,
  mobileReaderSafePadding,
  mobileReaderTapExcluded,
  mobileReaderCapsuleActionsWidth,
  mobileReaderCapsuleRowTop,
  READER_CAPSULE_EDGE,
  READER_CAPSULE_TITLE_FULL_MIN_WIDTH,
  READER_DOCK_GAP,
  READER_SCRUBBER_CAPSULE_HEIGHT,
  READER_SCRUBBER_CAPSULE_MAX_WIDTH,
  type MobileReaderPoseLayout,
  type MobileReaderPoseLayoutInput,
} from "./mobileReaderPoseLayout";
import type { MobileWindowLayout, WindowReservedRegion } from "./mobileWindowLayout";

const hinge = (x: number, y: number, width: number, height: number, active = true): WindowReservedRegion => ({ id: "hinge", x, y, width, height, active });
const noInsets = { top: 0, left: 0, bottom: 0, right: 0 };

// Geometry from the HIG ("Designing for iPhone Duo"): outer 466×678, inner 951×669 / 669×951.
const outer: MobileWindowLayout = {
  width: 466, height: 678, supported: true, divisions: [], occlusions: [],
  verticalBarEdge: "trailing", layoutDirection: "ltr",
  safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 44 },
};
const innerLandscape = (divisions: WindowReservedRegion[] = [], occlusions: WindowReservedRegion[] = []): MobileWindowLayout => ({
  width: 951, height: 669, supported: true, divisions, occlusions,
  verticalBarEdge: "trailing", layoutDirection: "ltr",
  safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 40 },
});
const innerPortrait = (divisions: WindowReservedRegion[] = []): MobileWindowLayout => ({
  width: 669, height: 951, supported: true, divisions, occlusions: [],
  verticalBarEdge: null, layoutDirection: "ltr",
  safeAreaInsets: { top: 44, left: 0, bottom: 20, right: 0 },
});
const phonePortrait: MobileWindowLayout = { width: 402, height: 874, supported: false, divisions: [], occlusions: [] };
const phoneLandscape: MobileWindowLayout = { width: 874, height: 402, supported: false, divisions: [], occlusions: [] };

function pose(layout: MobileWindowLayout, overrides: Partial<MobileReaderPoseLayoutInput> = {}) {
  return mobileReaderPoseLayout({
    layout,
    fallbackInsets: noInsets,
    paged: true,
    pageCount: 20,
    twoPage: false,
    rtl: false,
    learningOpen: false,
    ...overrides,
  });
}

describe("reader pose: flat without vertical bars", () => {
  test("phone portrait keeps today's full-bleed stage, horizontal chrome and sheets", () => {
    const insets = { top: 62, left: 0, bottom: 34, right: 0 };
    const result = pose(phonePortrait, { fallbackInsets: insets, learningOpen: true, twoPage: true });
    expect(result.posture).toBe("flat");
    expect(result.stage).toEqual({ x: 0, y: 0, width: 402, height: 874 });
    expect(result.constrained).toBe(false);
    expect(result.chrome).toEqual({ kind: "horizontal", frame: result.bounds, padding: insets });
    expect(result.learning).toEqual({ presentation: "sheet" });
    expect(result.twoPageAvailable).toBe(false);
    expect(result.spread).toBe(false);
    expect(result.chromePinned).toBe(false);
  });

  test("phone landscape is too short for a dock but keeps seamless spreads", () => {
    const result = pose(phoneLandscape, { fallbackInsets: { top: 0, left: 62, bottom: 21, right: 62 }, learningOpen: true, twoPage: true });
    expect(result.learning.presentation).toBe("sheet");
    expect(result.spread).toBe(true);
    // Seamless: no synthetic slots or gutter when nothing is folded.
    expect(result.spreadSlots).toBeUndefined();
    expect(result.foldGap).toBeNull();
    expect(result.chrome.kind).toBe("horizontal");
  });

  test("Duo inner portrait keeps the bottom sheet: a side dock would leave the page unreadably narrow", () => {
    const result = pose(innerPortrait(), { learningOpen: true });
    expect(result.chrome.kind).toBe("capsules");
    expect(result.learning.presentation).toBe("sheet");
    expect(result.stage.width).toBe(669);
  });

  test("tablet landscape docks a trailing 40% panel (clamped) and shrinks the stage without touching the preference", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const closed = pose(tablet, { twoPage: true, fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } });
    expect(closed.spread).toBe(true);
    const open = pose(tablet, { twoPage: true, learningOpen: true, fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } });
    expect(open.learning).toEqual({
      presentation: "docked",
      region: "side",
      frame: { x: 1366 - 440 + READER_DOCK_GAP, y: 24 + READER_DOCK_GAP, width: 440 - READER_DOCK_GAP * 2, height: 1024 - 44 - READER_DOCK_GAP * 2 },
    });
    expect(open.stage).toEqual({ x: 0, y: 0, width: 926, height: 1024 });
    expect(open.constrained).toBe(true);
    // Spread falls back to one page only while the panel is open.
    expect(open.spread).toBe(false);
    expect(open.spreadFallback).toBe(true);
    expect(open.twoPageAvailable).toBe(true);
    // Chrome follows the page, never covering the panel.
    expect(open.chrome).toMatchObject({ kind: "capsules", frame: open.stage });
    if (open.chrome.kind !== "capsules") throw new Error("expected capsules");
    expect(open.chrome.actions.x + open.chrome.actions.width).toBeLessThanOrEqual(926 - READER_CAPSULE_EDGE);
  });

  test("right-to-left layout docks on the left (trailing) edge", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: true, divisions: [], occlusions: [], layoutDirection: "rtl" };
    const open = pose(tablet, { learningOpen: true });
    expect(open.learning.presentation === "docked" && open.learning.frame.x).toBe(READER_DOCK_GAP);
    expect(open.stage.x).toBe(440);
  });

  test("an active camera occlusion leaves the page full-bleed but shrinks the phone chrome frame", () => {
    const layout: MobileWindowLayout = { width: 900, height: 400, supported: true, divisions: [], occlusions: [hinge(420, 0, 60, 40)] };
    const result = pose(layout);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 900, height: 400 });
    expect(result.chrome.kind === "horizontal" && result.chrome.frame).toEqual({ x: 0, y: 40, width: 900, height: 360 });
  });
});

// Measured on the Duo inner display with the reader's vertical bar disabled
// (UIVerticalBarBehavior.disabled): horizontal status bar island 134×82 at
// (817,0), top inset 82, no side inset.
const innerLandscapeNoBar = (divisions: WindowReservedRegion[] = [], occlusions: WindowReservedRegion[] = []): MobileWindowLayout => ({
  width: 951, height: 669, supported: true, divisions,
  occlusions: [{ id: "status", x: 817, y: 0, width: 134, height: 82, active: true }, ...occlusions],
  verticalBarEdge: "trailing", layoutDirection: "ltr",
  safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
});

function capsules(result: MobileReaderPoseLayout) {
  if (result.chrome.kind !== "capsules") throw new Error(`expected capsules, got ${result.chrome.kind}`);
  return result.chrome;
}

describe("reader pose: capsule chrome (regular width)", () => {
  test("open landscape matches Safari's geometry: 44pt pieces on the status-bar row, title centred", () => {
    const result = pose(innerLandscapeNoBar(), { actionCount: 3 });
    expect(result.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
    const chrome = capsules(result);
    // Safari at 3x: back 16pt from the edge, top 26pt, 44pt tall.
    expect(chrome.back).toEqual({ x: 16, y: 26, width: 44, height: 44 });
    // Actions end exactly where the status bar island starts (Safari: 818).
    expect(chrome.actions).toEqual({ x: 817 - mobileReaderCapsuleActionsWidth(3), y: 26, width: mobileReaderCapsuleActionsWidth(3), height: 44 });
    // 360pt title centred on the window (Safari: 296…657).
    expect(chrome.title).toEqual({ x: 296, y: 26, width: 360, height: 44 });
    // Scrubber: centred, width-capped, above the home indicator band.
    expect(chrome.scrubber.width).toBe(READER_SCRUBBER_CAPSULE_MAX_WIDTH);
    expect(Math.abs(chrome.scrubber.x + chrome.scrubber.width / 2 - 951 / 2)).toBeLessThanOrEqual(1);
    expect(chrome.scrubber.y + READER_SCRUBBER_CAPSULE_HEIGHT).toBe(669 - 26);
    // Edgeless top scrim: full width, down past the 82pt inset by the feather.
    expect(chrome.topScrim).toEqual({ x: 0, y: 0, width: 951, height: 82 + 24 });
    // Cards and notices live between the rows.
    expect(chrome.content.y).toBe(26 + 44 + 10);
    expect(chrome.content.y + chrome.content.height).toBe(chrome.scrubber.y - 10);
    // Capsule taps never turn pages; the page between them does.
    expect(mobileReaderTapExcluded({ x: 30, y: 40 }, result.tapExclusions, result.foldGap)).toBe(true);
    expect(mobileReaderTapExcluded({ x: 475, y: 300 }, result.tapExclusions, result.foldGap)).toBe(false);
    expect(result.popover.frame).toEqual(chrome.content);
  });

  test("more actions push the title off-centre instead of overlapping it", () => {
    const chrome = capsules(pose(innerLandscapeNoBar(), { actionCount: 6 }));
    expect(chrome.title).not.toBeNull();
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.actions.x - 10);
    expect(chrome.title!.x).toBeGreaterThanOrEqual(chrome.back.x + 44 + 10);
  });

  test("an active inner camera in the row pushes the actions left of it", () => {
    const result = pose(innerLandscapeNoBar([], [{ id: "camera", x: 677, y: 21, width: 58, height: 37, active: true }]));
    const chrome = capsules(result);
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(677);
  });

  test("the row sits below the status bar when it spans the top (tablets)", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const chrome = capsules(pose(tablet, { fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } }));
    expect(chrome.back.y).toBe(24 + 8);
    // Below the row when the status bar spans the top.
    expect(chrome.topScrim.height).toBe(32 + 44 + 24);
    expect(mobileReaderCapsuleRowTop({ x: 0, y: 0, width: 1366, height: 1024 }, { top: 24, left: 0, bottom: 20, right: 0 }, [])).toBe(32);
  });

  test("a binary without the vertical-bar opt-out still keeps the capsules out of the side inset", () => {
    const result = pose(innerLandscape());
    const chrome = capsules(result);
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(951 - 40);
    expect(chrome.back.y).toBe(8);
  });

  test("RTL layout mirrors the row: Back on the right, actions on the left", () => {
    const layout = { ...innerLandscapeNoBar(), occlusions: [{ id: "status", x: 0, y: 0, width: 134, height: 82, active: true }], layoutDirection: "rtl" as const };
    const chrome = capsules(pose(layout));
    expect(chrome.back.x).toBe(951 - 16 - 44);
    expect(chrome.actions.x).toBe(134);
  });

  test("inner portrait keeps the full title capsule: it takes the gap between Back and the actions", () => {
    // Measured with the vertical bar disabled: 669×951, status island 134×82 at (535,0), top inset 82.
    const portrait: MobileWindowLayout = {
      width: 669, height: 951, supported: true, divisions: [],
      occlusions: [{ id: "status", x: 535, y: 0, width: 134, height: 82, active: true }],
      verticalBarEdge: null, layoutDirection: "ltr",
      safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
    };
    for (const actionCount of [3, 4, 5]) {
      const chrome = capsules(pose(portrait, { actionCount }));
      expect(chrome.actions.x + chrome.actions.width).toBe(535);
      expect(chrome.title).not.toBeNull();
      expect(chrome.title!.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
      expect(chrome.title!.x).toBeGreaterThanOrEqual(chrome.back.x + 44 + 10);
      expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.actions.x - 10);
    }
    // Landscape stays centred like Safari's URL capsule.
    expect(capsules(pose(innerLandscapeNoBar(), { actionCount: 3 })).title).toEqual({ x: 296, y: 26, width: 360, height: 44 });
  });

  test("notebook: the capsule row over the top pane keeps the full title", () => {
    const notebook: MobileWindowLayout = {
      width: 669, height: 951, supported: true,
      divisions: [{ id: "fold", x: 0, y: 455.5, width: 669, height: 40, active: true }],
      occlusions: [{ id: "status", x: 535, y: 0, width: 134, height: 82, active: true }],
      verticalBarEdge: null, layoutDirection: "ltr",
      safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
    };
    for (const actionCount of [3, 5]) {
      const result = pose(notebook, { actionCount });
      expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 455.5 });
      if (result.chrome.kind !== "console") throw new Error("expected console");
      expect(result.chrome.title).not.toBeNull();
      expect(result.chrome.title!.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
    }
  });

  test("phone landscape and the Duo outer display keep the approved phone chrome", () => {
    expect(pose(phoneLandscape).chrome.kind).toBe("horizontal");
    expect(pose(outer).chrome.kind).toBe("horizontal");
    expect(pose(outer, { learningOpen: true }).learning.presentation).toBe("sheet");
  });
});

describe("reader pose: book", () => {
  const book = innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]);

  test("two-page: one page per half, fold is never a tap target, capsules snap per pane", () => {
    const result = pose(book, { twoPage: true });
    expect(result.posture).toBe("book");
    expect(result.spread).toBe(true);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
    expect(result.spreadSlots).toEqual([
      { x: 0, y: 0, width: 455.5, height: 669 },
      { x: 495.5, y: 0, width: 455.5, height: 669 },
    ]);
    expect(result.foldGap).toEqual({ start: 455.5, end: 495.5 });
    expect(mobileReaderTapExcluded({ x: 475, y: 300 }, result.tapExclusions, result.foldGap)).toBe(true);
    const chrome = capsules(result);
    const fold = { x: 455.5, y: 0, width: 40, height: 669 };
    for (const piece of [chrome.back, chrome.title!, chrome.actions, chrome.scrubber]) {
      expect(overlapsBox(piece, fold)).toBe(false);
    }
    // Leading pane: Back + title; trailing pane: actions beside the status bar.
    expect(chrome.back.x).toBe(16);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(455.5 - 16);
    expect(chrome.actions.x).toBeGreaterThanOrEqual(495.5);
    expect(chrome.actions.x + chrome.actions.width).toBe(817);
    // The scrim is a gradient, not a control: it spans both panes.
    expect(chrome.topScrim.width).toBe(951);
    // LTR: the scrubber is centred in the reading-start (left) pane.
    expect(Math.abs(chrome.scrubber.x + chrome.scrubber.width / 2 - 455.5 / 2)).toBeLessThanOrEqual(1);
    expect(result.modalFrame).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
  });

  test("RTL reading puts the scrubber in the right (reading-start) pane", () => {
    const chrome = capsules(pose(book, { twoPage: true, rtl: true }));
    expect(chrome.scrubber.x).toBeGreaterThanOrEqual(495.5);
    expect(chrome.back.x).toBe(16);
  });

  test("single page sits in the reading-start half: left for LTR, right for RTL", () => {
    expect(pose(book).stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    expect(pose(book, { rtl: true }).stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
    expect(pose(book).spreadSlots).toBeUndefined();
  });

  test("learning docks in the pane without the page; every capsule stays in the page's pane", () => {
    const ltr = pose(book, { twoPage: true, learningOpen: true });
    expect(ltr.spread).toBe(false);
    expect(ltr.spreadFallback).toBe(true);
    expect(ltr.twoPageAvailable).toBe(true);
    expect(ltr.stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    expect(ltr.learning.presentation).toBe("docked");
    const chrome = capsules(ltr);
    expect(chrome.frame).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(455.5 - 16);
    if (ltr.learning.presentation === "docked") {
      for (const piece of [chrome.back, chrome.actions, chrome.scrubber]) expect(overlapsBox(piece, ltr.learning.frame)).toBe(false);
    }

    const rtl = pose(book, { twoPage: true, learningOpen: true, rtl: true });
    expect(rtl.stage.x).toBe(495.5);
    expect(rtl.learning.presentation === "docked" && rtl.learning.frame.x).toBe(READER_DOCK_GAP);
    expect(capsules(rtl).back.x).toBeGreaterThanOrEqual(495.5);
    expect(capsules(rtl).actions.x + capsules(rtl).actions.width).toBe(817);
  });

  test("Android book (no insets, no occlusions) uses the same capsule chrome", () => {
    const android = { ...book, verticalBarEdge: null, occlusions: [], safeAreaInsets: noInsets };
    const chrome = capsules(pose(android, { twoPage: true }));
    expect(chrome.actions.x + chrome.actions.width).toBe(951 - 16);
    expect(chrome.back.y).toBe(8);
  });

  test("long strip uses one half-width column in the reading-start pane", () => {
    const result = pose(book, { paged: false, twoPage: true, rtl: true });
    expect(result.spread).toBe(false);
    expect(result.twoPageAvailable).toBe(false);
    expect(result.stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
  });
});

function overlapsBox(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;
}

describe("reader pose: notebook", () => {
  const notebook = innerPortrait([hinge(0, 465, 669, 21)]);

  test("paged: page in the top pane, the trackpad in the bottom pane", () => {
    const result = pose(notebook, { twoPage: true });
    expect(result.posture).toBe("notebook");
    expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 465 });
    // The landscape-shaped top pane holds a seamless spread at single-page height.
    expect(result.twoPageAvailable).toBe(true);
    expect(result.spread).toBe(true);
    expect(result.spreadSlots).toBeUndefined();
    expect(pose(notebook, { twoPage: false }).spread).toBe(false);
    expect(pose(notebook, { twoPage: true, pageCount: 1 }).twoPageAvailable).toBe(false);
    expect(result.chromePinned).toBe(true);
    expect(result.foldBand).toBeNull();
    if (result.chrome.kind !== "console") throw new Error("expected console");
    expect(result.chrome.state).toBe("trackpad");
    expect(result.chrome.frame).toEqual({ x: 0, y: 486, width: 669, height: 465 });
    expect(result.chrome.pane).toEqual({ x: 0, y: 486, width: 669, height: 465 - 20 });
    expect(result.learning.presentation).toBe("sheet");
  });

  test("the capsule row sits over the top pane, clear of the fold, and owns its taps", () => {
    const result = pose(notebook);
    if (result.chrome.kind !== "console") throw new Error("expected console");
    const { back, title, actions } = result.chrome;
    for (const rect of [back, title, actions]) {
      if (!rect) continue;
      expect(rect.y + rect.height).toBeLessThanOrEqual(465);
    }
    expect(result.tapExclusions.length).toBe(title ? 3 : 2);
    expect(result.tapExclusions.every((rect) => rect.y + rect.height <= 465)).toBe(true);
  });

  test("filmstrip and study desk states; the desk docks in the whole pane", () => {
    const filmstrip = pose(notebook, { notebookPane: "filmstrip" });
    expect(filmstrip.chrome.kind === "console" && filmstrip.chrome.state).toBe("filmstrip");
    const desk = pose(notebook, { learningOpen: true });
    if (desk.chrome.kind !== "console") throw new Error("expected console");
    expect(desk.chrome.state).toBe("studyDesk");
    const { pane } = desk.chrome;
    expect(desk.learning).toEqual({
      presentation: "docked",
      region: "console",
      frame: { x: pane.x + READER_DOCK_GAP, y: pane.y + READER_DOCK_GAP, width: pane.width - READER_DOCK_GAP * 2, height: pane.height - READER_DOCK_GAP * 2 },
    });
    // The desk can also be the resting state (Automatic with Japanese Learning on).
    const resting = pose(notebook, { notebookPane: "studyDesk" });
    expect(resting.learning.presentation).toBe("docked");
  });

  test("scroll mode: one viewport through both panes, the fold drawn as a band", () => {
    const result = pose(notebook, { paged: false });
    expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 951 });
    expect(result.constrained).toBe(false);
    expect(result.chromePinned).toBe(false);
    expect(result.foldBand).toEqual({ x: 0, y: 465, width: 669, height: 21 });
    if (result.chrome.kind !== "capsules") throw new Error("expected capsules");
    // Row atop the top pane, scrubber at the bottom of the bottom pane.
    expect(result.chrome.back.y + result.chrome.back.height).toBeLessThanOrEqual(465);
    expect(result.chrome.scrubber.y).toBeGreaterThan(486);
    expect(result.chrome.scrubber.y + result.chrome.scrubber.height).toBeLessThanOrEqual(951 - 20 + 8);
  });

  test("scroll mode keeps the settings popover in the bottom pane, above the scrubber", () => {
    const result = pose(notebook, { paged: false });
    if (result.chrome.kind !== "capsules") throw new Error("expected capsules");
    expect(result.popover.frame.y).toBeGreaterThanOrEqual(486);
    const popoverBottom = result.popover.frame.y + result.popover.frame.height - result.popover.bottomGap;
    expect(popoverBottom).toBeLessThanOrEqual(result.chrome.scrubber.y);
  });

  test("scroll mode with a learning tool open docks the desk under a top-pane strip", () => {
    const result = pose(notebook, { paged: false, learningOpen: true });
    expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 465 });
    expect(result.chrome.kind === "console" && result.chrome.state).toBe("studyDesk");
  });

  test("the settings popover stays in the bottom pane", () => {
    const result = pose(notebook);
    if (result.chrome.kind !== "console") throw new Error("expected console");
    expect(result.popover.frame).toEqual(result.chrome.pane);
  });
});

describe("reader pose helpers", () => {
  test("safe padding only applies on edges that touch the window", () => {
    const bounds = { x: 0, y: 0, width: 951, height: 669 };
    const insets = { top: 10, left: 20, bottom: 30, right: 40 };
    expect(mobileReaderSafePadding({ x: 486, y: 0, width: 465, height: 669 }, bounds, insets)).toEqual({ top: 10, left: 0, bottom: 30, right: 40 });
    expect(mobileReaderSafePadding({ x: 0, y: 0, width: 465, height: 669 }, bounds, insets)).toEqual({ top: 10, left: 20, bottom: 30, right: 0 });
  });
  test("dock width is 40% clamped to 320…440", () => {
    expect(mobileReaderDockWidth(600)).toBe(320);
    expect(mobileReaderDockWidth(1000)).toBe(400);
    expect(mobileReaderDockWidth(2000)).toBe(440);
    expect(mobileReaderDockWidth(Number.NaN)).toBe(320);
  });
  test("docked surface priority follows the hand-off order", () => {
    expect(mobileReaderDockedLearningSurface({ transcript: true, ocr: true, chat: false })).toBe("ocr");
    expect(mobileReaderDockedLearningSurface({ transcript: true, ocr: false, chat: true })).toBe("chat");
    expect(mobileReaderDockedLearningSurface({ transcript: true, ocr: false, chat: false })).toBe("transcript");
    expect(mobileReaderDockedLearningSurface({ transcript: false, ocr: false, chat: false })).toBeNull();
  });
  test("observer insets win over React Native fallbacks and invalid values are ignored", () => {
    const result = pose({ ...outer, safeAreaInsets: { top: Number.NaN, left: -4, bottom: 20, right: 44 } }, { fallbackInsets: { top: 99, left: 99, bottom: 99, right: 99 } });
    expect(result.safeInsets).toEqual({ top: 0, left: 0, bottom: 20, right: 44 });
  });
  test("popover clears the toolbar and the top safe area in horizontal chrome; sits inside the console in notebook", () => {
    const insets = { top: 62, left: 0, bottom: 34, right: 0 };
    const phone = pose(phonePortrait, { fallbackInsets: insets });
    expect(mobileReaderPopoverPlacement(phone.chrome)).toEqual({
      frame: { x: 0, y: 62, width: 402, height: 812 },
      bottomGap: 34 + 16 + 60 + 2,
    });
    const notebook = pose(innerPortrait([hinge(0, 465, 669, 21)]));
    expect(notebook.popover).toEqual({ frame: { x: 0, y: 486, width: 669, height: 465 - 20 }, bottomGap: READER_DOCK_GAP });
  });
  test("overlay insets centre a card in its pane, safe area included; none for the whole reader", () => {
    const bounds = { x: 0, y: 0, width: 951, height: 669 };
    const insets = { top: 0, left: 0, bottom: 20, right: 40 };
    expect(mobileReaderFrameInsets(bounds, bounds, insets)).toBeNull();
    expect(mobileReaderFrameInsets({ x: 486, y: 0, width: 465, height: 669 }, bounds, insets)).toEqual({ top: 0, left: 486, bottom: 20, right: 40 });
  });
});

import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";

type DuoMeasurement = (typeof fixture.measurements)[number];
type Box = { x: number; y: number; width: number; height: number };

/** Measured geometry → observer layout. The fixture predates the bar-edge trait: per the HIG, closed and inner-landscape windows use vertical bars on the trailing edge; inner portrait keeps horizontal bars. */
function duoLayout(m: DuoMeasurement, options: { camera?: boolean } = {}): MobileWindowLayout {
  const regions = m.regions.map((r, index) => ({
    id: `${r.kind}-${index}`,
    // The inner camera is the only occlusion reported inactive; simulate it running.
    active: r.active || (options.camera === true && r.kind === "occlusion"),
    ...r.frame,
  }));
  const vertical = m.screen === "iphone-duo-outer" || m.bounds.width > m.bounds.height;
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
    verticalBarEdge: vertical ? "trailing" : null,
    layoutDirection: "ltr",
    safeAreaInsets: m.insets,
  };
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;

function activeOcclusions(layout: MobileWindowLayout): Box[] {
  return layout.occlusions.filter((r) => r.active);
}

function activeFold(layout: MobileWindowLayout): Box | null {
  return layout.divisions.find((r) => r.active) ?? null;
}

/** Page rectangles in reader coordinates (spread slots are stage-local). */
function pageBoxes(result: ReturnType<typeof mobileReaderPoseLayout>): Box[] {
  return result.spreadSlots
    ? result.spreadSlots.map((slot) => ({ ...slot, x: slot.x + result.stage.x, y: slot.y + result.stage.y }))
    : [result.stage];
}

describe("reader pose on measured iPhone Duo geometry", () => {
  for (const m of fixture.measurements) {
    for (const camera of [false, true]) {
      for (const [label, overrides] of [
        ["single", {}],
        ["two-page", { twoPage: true }],
        ["two-page + learning", { twoPage: true, learningOpen: true }],
        ["long strip + learning", { paged: false, learningOpen: true }],
      ] as const) {
        test(`${m.screen} ${m.pose} ${m.orientation}${camera ? " camera" : ""} · ${label}: pages avoid the fold; chrome and tools avoid the fold and occlusions`, () => {
          const layout = duoLayout(m, { camera });
          const result = pose(layout, overrides);
          const fold = activeFold(layout);
          const blocked = [...activeOcclusions(layout), ...(fold ? [fold] : [])];
          for (const page of pageBoxes(result)) {
            // Immersive pages are full-bleed like phones (status bar hidden
            // while reading, pages may pass under camera cut-outs): they only
            // stay off the fold and inside the window.
            if (fold) expect(overlaps(page, fold)).toBe(false);
            expect(page.x).toBeGreaterThanOrEqual(0);
            expect(page.x + page.width).toBeLessThanOrEqual(m.bounds.width + 0.01);
          }
          const chrome = result.chrome;
          if (chrome.kind === "capsules") {
            const pieces = [chrome.back, chrome.actions, chrome.scrubber, ...(chrome.title ? [chrome.title] : [])];
            for (const piece of pieces) {
              for (const region of blocked) expect(overlaps(piece, region)).toBe(false);
              expect(piece.x).toBeGreaterThanOrEqual(m.insets.left);
              expect(piece.x + piece.width).toBeLessThanOrEqual(m.bounds.width - m.insets.right + 0.01);
            }
          } else if (fold) {
            expect(overlaps(chrome.frame, fold)).toBe(false);
          }
          if (result.learning.presentation === "docked") {
            const dock = result.learning.frame;
            for (const region of blocked) expect(overlaps(dock, region)).toBe(false);
            for (const page of pageBoxes(result)) expect(overlaps(dock, page)).toBe(false);
            if (chrome.kind === "capsules") {
              for (const piece of [chrome.back, chrome.actions, chrome.scrubber]) expect(overlaps(dock, piece)).toBe(false);
            }
          }
        });
      }
    }
  }

  test("every measured regular-width pose keeps a full title capsule (≥ 160pt)", () => {
    for (const m of fixture.measurements) {
      for (const actionCount of [3, 5]) {
        const result = pose(duoLayout(m), { actionCount });
        if (result.chrome.kind !== "capsules") continue;
        expect(result.chrome.title).not.toBeNull();
        expect(result.chrome.title!.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
      }
    }
  });

  const find = (screen: string, posture: string, orientation: string) => {
    const m = fixture.measurements.find((entry) => entry.screen === screen && entry.pose === posture && entry.orientation === orientation);
    if (!m) throw new Error(`missing fixture ${screen} ${posture} ${orientation}`);
    return m;
  };

  test("closed: the compact outer display keeps the phone chrome clear of the bar column", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      const m = find("iphone-duo-outer", "closed", orientation);
      const result = pose(duoLayout(m));
      expect(result.stage.x).toBe(0);
      expect(result.chrome.kind).toBe("horizontal");
      if (result.chrome.kind === "horizontal") {
        const { frame, padding } = result.chrome;
        expect(frame.x + padding.left).toBeGreaterThanOrEqual(m.insets.left);
        expect(frame.x + frame.width - padding.right).toBeLessThanOrEqual(m.bounds.width - m.insets.right + 0.01);
      }
    }
  });

  test("closed display keeps learning tools in sheets (compact width or too short)", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      expect(pose(duoLayout(find("iphone-duo-outer", "closed", orientation)), { learningOpen: true }).learning.presentation).toBe("sheet");
    }
  });

  test("open landscape docks beside the page, inner portrait keeps the sheet", () => {
    expect(pose(duoLayout(find("iphone-duo-inner", "open", "landscape-left")), { learningOpen: true }).learning.presentation).toBe("docked");
    expect(pose(duoLayout(find("iphone-duo-inner", "open", "portrait")), { learningOpen: true }).learning.presentation).toBe("sheet");
  });

  test("book: measured 40pt fold at 455.5–495.5 separates the two page slots", () => {
    const result = pose(duoLayout(find("iphone-duo-inner", "partially-folded", "landscape-left")), { twoPage: true });
    expect(result.posture).toBe("book");
    expect(result.foldGap).toEqual({ start: 455.5, end: 495.5 });
    expect(result.spreadSlots?.[1]).toEqual({ x: 495.5, y: 0, width: 951 - 495.5, height: 669 });
  });

  test("notebook: page above the measured fold, console below it, both upright and upside-down", () => {
    for (const orientation of ["portrait", "upside-down"]) {
      const result = pose(duoLayout(find("iphone-duo-inner", "partially-folded", orientation)));
      expect(result.posture).toBe("notebook");
      expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 455.5 });
      expect(result.chrome.kind === "console" && result.chrome.frame.y).toBe(495.5);
      // 669×455.5 is wider than tall: two 334pt pages fit the pane height.
      const spread = pose(duoLayout(find("iphone-duo-inner", "partially-folded", orientation)), { twoPage: true });
      expect(spread.twoPageAvailable).toBe(true);
      expect(spread.spread).toBe(true);
      expect(spread.spreadSlots).toBeUndefined();
    }
  });

  // Regression: the always-active 84×120 status occlusion at (867,0) lives in
  // the trailing bar column. Subtracting it before trimming the safe-area inset
  // cut the right book pane to 371.5×549 starting at y=120.
  test("book: each page is full-bleed in its pane — both halves 455.5 wide, full height", () => {
    for (const orientation of ["landscape-left", "landscape-right"]) {
      const layout = duoLayout(find("iphone-duo-inner", "partially-folded", orientation));
      const expected = { x: 495.5, y: 0, width: 951 - 495.5, height: 669 };
      // RTL single page lives in the right (reading-start) pane.
      const rtl = pose(layout, { rtl: true });
      expect(rtl.stage).toEqual(expected);
      // Spread: the right slot too.
      expect(pose(layout, { twoPage: true }).spreadSlots?.[1]).toEqual(expected);
      // LTR + learning: the dock owns the right pane, trimmed only by the dock gap.
      const docked = pose(layout, { learningOpen: true });
      expect(docked.learning.presentation).toBe("docked");
      if (docked.learning.presentation === "docked") {
        expect(docked.learning.frame.y).toBe(READER_DOCK_GAP);
        expect(docked.learning.frame.height).toBe(669 - 34 - READER_DOCK_GAP * 2);
      }
      // Capsules in that pane sit left of the status occlusion, not below it.
      const chrome = rtl.chrome;
      if (chrome.kind === "capsules") expect(chrome.actions.y).toBeLessThan(120);
    }
  });
});
