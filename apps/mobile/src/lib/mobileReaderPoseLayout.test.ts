import { describe, expect, test } from "bun:test";
import {
  mobileReaderStableTopInset,
  mobileReaderScrollStableTopInset,
  mobileReaderFrameInsets,
  mobileReaderPopoverPlacement,
  mobileReaderPoseLayout,
  mobileReaderSafePadding,
  mobileReaderTapExcluded,
  mobileReaderCapsuleActionSlots,
  mobileReaderBookSheetSide,
  mobileReaderLayoutWithoutFold,
  mobileReaderCapsuleActionsWidth,
  mobileReaderAnticipatedWindowLayout,
  mobileReaderHingeHintKey,
  mobileReaderNextSideInsetLatch,
  mobileReaderSideInsetLatchKey,
  mobileReaderTitleCapsuleWidthRange,
  mobileReaderVerticalBarPolicy,
  mobileReaderWindowControlInsets,
  MOBILE_READER_ANTICIPATED_FOLD_WIDTH,
  MOBILE_READER_HINGE_HINT_TIMEOUT_MS,
  READER_CAPSULE_EDGE,
  READER_CAPSULE_TITLE_FULL_MIN_WIDTH,
  READER_TITLE_CAPSULE_MIN_WIDTH,
  READER_POPOVER_GAP,
  READER_SCRUBBER_CAPSULE_HEIGHT,
  READER_SCRUBBER_CAPSULE_MAX_WIDTH,
  READER_SCRUBBER_MIN_WIDTH,
  mobileReaderActionsRow,
  mobileReaderBottomRowLayout,
  type MobileReaderPoseLayout,
  type MobileReaderPoseLayoutInput,
} from "./mobileReaderPoseLayout";
import type { MobileWindowLayout, WindowReservedRegion } from "./mobileWindowLayout";
import { classifyReaderWindowShape } from "./mobileReaderWindowShape";

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
    ...overrides,
  });
}

describe("reader pose: auto spreads follow the stage the pages sit in", () => {
  const tablet = (width: number, height: number): MobileWindowLayout => ({ width, height, supported: false, divisions: [], occlusions: [] });

  test("iPad: landscape shows a spread, portrait stays single, with the same setting", () => {
    expect(pose(tablet(1180, 820), { spreadMode: "auto" }).spread).toBe(true);
    expect(pose(tablet(820, 1180), { spreadMode: "auto" }).spread).toBe(false);
    expect(pose(tablet(820, 1180), { spreadMode: "auto" }).twoPageAvailable).toBe(false);
  });

  test("phones never auto-spread, landscape included; double still can", () => {
    expect(pose(phoneLandscape, { spreadMode: "auto" }).spread).toBe(false);
    expect(pose(phonePortrait, { spreadMode: "auto" }).spread).toBe(false);
    expect(pose(phoneLandscape, { spreadMode: "double" }).spread).toBe(true);
    expect(pose(phoneLandscape, { spreadMode: "single" }).spread).toBe(false);
  });

  test("Duo inner: landscape auto-spreads (flat and across the fold), portrait does not", () => {
    expect(pose(innerLandscapeNoBar(), { spreadMode: "auto" }).spread).toBe(true);
    const book = pose(innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]), { spreadMode: "auto" });
    expect(book.posture).toBe("book");
    expect(book.spread).toBe(true);
    expect(book.spreadSlots).toHaveLength(2);
    expect(pose(innerPortrait(), { spreadMode: "auto" }).spread).toBe(false);
  });

  test("Duo closed landscape beside the vertical bar stays single", () => {
    const closedLandscape: MobileWindowLayout = {
      width: 678, height: 466, supported: true, divisions: [], occlusions: [],
      verticalBarEdge: "trailing", layoutDirection: "ltr",
      safeAreaInsets: { top: 0, left: 84, bottom: 20, right: 0 },
    };
    expect(pose(closedLandscape, { spreadMode: "auto", sideBar: true }).spread).toBe(false);
  });

  test("half-folded Duo (laptop) reads as the open display: the portrait window stays single", () => {
    const result = pose(innerPortrait([hinge(0, 465, 669, 21)]), { spreadMode: "auto" });
    expect(result.posture).toBe("flat");
    expect(result.spread).toBe(false);
  });

  test("spreadMode replaces the older boolean", () => {
    expect(pose(tablet(1180, 820), { twoPage: true, spreadMode: "single" }).spread).toBe(false);
    expect(pose(tablet(1180, 820), { twoPage: false, spreadMode: "double" }).spread).toBe(true);
  });

  test("a single-page chapter never spreads", () => {
    expect(pose(tablet(1180, 820), { spreadMode: "auto", pageCount: 1 }).spread).toBe(false);
  });
});

describe("reader pose: flat without vertical bars", () => {
  test("phone portrait: full-bleed stage, compact capsule chrome (actions within thumb reach)", () => {
    const insets = { top: 62, left: 0, bottom: 34, right: 0 };
    const result = pose(phonePortrait, { fallbackInsets: insets, twoPage: true });
    expect(result.posture).toBe("flat");
    expect(result.stage).toEqual({ x: 0, y: 0, width: 402, height: 874 });
    expect(result.constrained).toBe(false);
    const chrome = capsules(result);
    // Back + title below the status bar; the actions beside the scrubber.
    expect(chrome.back.y).toBe(62 + 8);
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.scrubber.y + chrome.scrubber.height).toBe(874 - 26);
    expect(chrome.actions.y + chrome.actions.height / 2).toBe(chrome.scrubber.y + chrome.scrubber.height / 2);
    expect(chrome.title!.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
    // 44pt targets.
    for (const piece of [chrome.back, chrome.actions]) expect(piece.height).toBeGreaterThanOrEqual(44);
    expect(result.twoPageAvailable).toBe(false);
    expect(result.spread).toBe(false);
  });

  test("phone landscape keeps seamless spreads", () => {
    const result = pose(phoneLandscape, { fallbackInsets: { top: 0, left: 62, bottom: 21, right: 62 }, twoPage: true });
    expect(result.spread).toBe(true);
    // Seamless: no synthetic slots or gutter when nothing is folded.
    expect(result.spreadSlots).toBeUndefined();
    expect(result.foldGap).toBeNull();
    // Short and wide: Back · title · ⋯ on top clear of the side cut-outs,
    // the scrubber and the actions centred together at the bottom.
    const chrome = capsules(result);
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.back.x).toBe(62);
    expect(chrome.more!.x + chrome.more!.width).toBe(874 - 62);
    expect(groupCentre(chrome)).toBe(874 / 2);
    expect(chrome.content.height).toBeGreaterThan(200);
  });

  test("Duo inner portrait: the whole display is the page", () => {
    const result = pose(innerPortrait());
    expect(result.chrome.kind).toBe("capsules");
    expect(result.stage.width).toBe(669);
  });

  test("tablet landscape: full-bleed spread, capsule row and a centred scrubber", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const result = pose(tablet, { twoPage: true, fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } });
    expect(result.spread).toBe(true);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 1366, height: 1024 });
    expect(result.constrained).toBe(false);
    const chrome = capsules(result);
    // The scrubber and the actions beside it, centred as one group.
    expect(chrome.actionsRow).toBe("bottom");
    expect(Math.abs(groupCentre(chrome) - 683)).toBeLessThanOrEqual(1);
  });

  test("an active camera occlusion leaves the page full-bleed; the capsules route around it", () => {
    const layout: MobileWindowLayout = { width: 900, height: 400, supported: true, divisions: [], occlusions: [hinge(420, 0, 60, 40)] };
    const result = pose(layout);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 900, height: 400 });
    const chrome = capsules(result);
    for (const piece of [chrome.back, chrome.actions, chrome.scrubber, ...(chrome.title ? [chrome.title] : [])]) {
      expect(overlapsBox(piece, layout.occlusions[0])).toBe(false);
    }
  });
});

// Measured on the Duo inner display with the reader's vertical bar disabled
// (UIVerticalBarBehavior.disabled, observer log 2026-09-28): horizontal status
// bar island 134×82 at (817,0), top inset 82, no side inset, and no
// vertical-bar edge (the trait resolves to unspecified once disabled).
const innerLandscapeNoBar = (divisions: WindowReservedRegion[] = [], occlusions: WindowReservedRegion[] = []): MobileWindowLayout => ({
  width: 951, height: 669, supported: true, divisions,
  occlusions: [{ id: "status", x: 817, y: 0, width: 134, height: 82, active: true }, ...occlusions],
  verticalBarEdge: null, layoutDirection: "ltr",
  safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
});

function capsules(result: MobileReaderPoseLayout) {
  if (result.chrome.kind !== "capsules") throw new Error(`expected capsules, got ${result.chrome.kind}`);
  return result.chrome;
}

/** Centre of the bottom row's scrubber + gap + actions group (actions on the bottom row). */
function groupCentre(chrome: ReturnType<typeof capsules>): number {
  const left = Math.min(chrome.scrubber.x, chrome.actions.x);
  const right = Math.max(chrome.scrubber.x + chrome.scrubber.width, chrome.actions.x + chrome.actions.width);
  return (left + right) / 2;
}

describe("reader pose: capsule chrome (regular width)", () => {
  test("open landscape matches the native bars' geometry: 48pt pieces on the status-bar row, title centred, actions beside the scrubber", () => {
    const result = pose(innerLandscapeNoBar(), { actionCount: 3 });
    expect(result.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
    const chrome = capsules(result);
    // The app's native stack bars at 3x: back 20pt from the edge, centred 48pt down, 48pt tall.
    expect(chrome.back).toEqual({ x: 20, y: 24, width: 48, height: 48 });
    // The ⋯ ends exactly where the status bar island starts (Safari: 818).
    expect(chrome.more).toEqual({ x: 817 - 48, y: 24, width: 48, height: 48 });
    // 360pt title centred on the window (Safari: 296…657).
    expect(chrome.title).toEqual({ x: 296, y: 24, width: 360, height: 48 });
    expect(chrome.back.x).toBeLessThan(chrome.title!.x);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThan(chrome.more!.x);
    // Bottom row: the width-capped scrubber, then the actions, centred as
    // one group above the home indicator band.
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.actions.width).toBe(mobileReaderCapsuleActionsWidth(3));
    expect(chrome.scrubber.width).toBe(READER_SCRUBBER_CAPSULE_MAX_WIDTH);
    expect(chrome.actions.x).toBeGreaterThanOrEqual(chrome.scrubber.x + chrome.scrubber.width + 9.5);
    expect(chrome.actions.y + chrome.actions.height / 2).toBe(chrome.scrubber.y + chrome.scrubber.height / 2);
    expect(Math.abs(groupCentre(chrome) - 951 / 2)).toBeLessThanOrEqual(1);
    expect(chrome.scrubber.y + READER_SCRUBBER_CAPSULE_HEIGHT).toBe(669 - 26);
    // Edgeless top scrim: full width, down past the 82pt inset by the feather.
    expect(chrome.topScrim).toEqual({ x: 0, y: 0, width: 951, height: 82 + 24 });
    // Cards and notices live between the rows.
    expect(chrome.content.y).toBe(24 + 48 + 10);
    expect(chrome.content.y + chrome.content.height).toBe(chrome.scrubber.y - 10);
    // Capsule taps never turn pages; the page between them does.
    expect(mobileReaderTapExcluded({ x: 30, y: 40 }, result.tapExclusions, result.foldGap)).toBe(true);
    expect(mobileReaderTapExcluded({ x: 475, y: 300 }, result.tapExclusions, result.foldGap)).toBe(false);
    expect(result.popover.frame).toEqual(chrome.content);
  });

  test("more actions stay on the bottom row; the title keeps its centred slot and Back never moves", () => {
    const chrome = capsules(pose(innerLandscapeNoBar(), { actionCount: 6 }));
    expect(chrome.back.x).toBe(20);
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.actions.width).toBe(mobileReaderCapsuleActionsWidth(6));
    expect(chrome.title).toEqual({ x: 296, y: 24, width: 360, height: 48 });
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.more!.x - 10);
  });

  test("an active inner camera in the row pushes the ⋯ left of it; Back stays top-leading", () => {
    const result = pose(innerLandscapeNoBar([], [{ id: "camera", x: 677, y: 21, width: 58, height: 37, active: true }]));
    const chrome = capsules(result);
    expect(chrome.back.x).toBe(20);
    expect(chrome.more!.x + chrome.more!.width).toBeLessThanOrEqual(677);
  });

  test("the row sits below the status bar when it spans the top (tablets)", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const chrome = capsules(pose(tablet, { fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } }));
    expect(chrome.back.y).toBe(24 + 8);
    // Below the row when the status bar spans the top.
    expect(chrome.topScrim.height).toBe(32 + 48 + 24);
  });

  test("a binary without the vertical-bar opt-out still keeps the capsules out of the side inset", () => {
    const result = pose(innerLandscape());
    const chrome = capsules(result);
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(951 - 40);
    expect(chrome.back.y).toBe(8);
  });

  test("RTL layout mirrors the row: Back on the right, ⋯ on the left", () => {
    const layout = { ...innerLandscapeNoBar(), occlusions: [{ id: "status", x: 0, y: 0, width: 134, height: 82, active: true }], layoutDirection: "rtl" as const };
    const chrome = capsules(pose(layout));
    expect(chrome.back.x).toBe(951 - 20 - 48);
    expect(chrome.more!.x).toBe(134);
    expect(chrome.more!.x + chrome.more!.width).toBeLessThan(chrome.title!.x);
    // The actions lead the bottom row's group, the scrubber after them.
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(chrome.scrubber.x - 9.5);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThan(chrome.back.x);
  });

  test("tablets keep the same top row: Back leading, ⋯ trailing", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const chrome = capsules(pose(tablet, { fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } }));
    expect(chrome.back.x).toBe(20);
    expect(chrome.more!.x + chrome.more!.width).toBe(1366 - 20);
  });

  test("inner portrait keeps the full title capsule, centred on the window between Back and the ⋯", () => {
    // Measured with the vertical bar disabled: 669×951, status island 134×82 at (535,0), top inset 82.
    const portrait: MobileWindowLayout = {
      width: 669, height: 951, supported: true, divisions: [],
      occlusions: [{ id: "status", x: 535, y: 0, width: 134, height: 82, active: true }],
      verticalBarEdge: null, layoutDirection: "ltr",
      safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
    };
    for (const actionCount of [3, 4, 5]) {
      const chrome = capsules(pose(portrait, { actionCount }));
      expect(chrome.actionsRow).toBe("bottom");
      const more = chrome.more!;
      expect(more.x + more.width).toBe(535);
      expect(chrome.title).not.toBeNull();
      expect(chrome.title!.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
      expect(chrome.title!.x).toBeGreaterThanOrEqual(chrome.back.x + 48 + 10);
      expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(more.x - 10);
      // Centred on the window although the ⋯ sits in past the status island:
      // the same width is reserved on both sides of the centre.
      expect(Math.abs(chrome.title!.x + chrome.title!.width / 2 - 669 / 2)).toBeLessThanOrEqual(1);
      // 2 × min(334.5 − (68 + 10), (487 − 10) − 334.5) = 285.
      expect(chrome.title!.width).toBe(285);
    }
    expect(capsules(pose(portrait)).back.x).toBe(20);
    // Landscape stays centred like Safari's URL capsule.
    expect(capsules(pose(innerLandscapeNoBar(), { actionCount: 3 })).title).toEqual({ x: 296, y: 24, width: 360, height: 48 });
  });

  test("every flat window uses the capsule chrome: phones, the Duo outer display, tablets", () => {
    expect(pose(phoneLandscape).chrome.kind).toBe("capsules");
    expect(pose(phonePortrait).chrome.kind).toBe("capsules");
    expect(pose(outer).chrome.kind).toBe("capsules");
    expect(pose({ width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] }).chrome.kind).toBe("capsules");
  });
});

describe("reader pose: book", () => {
  const book = innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]);

  test("a sheet beside the fold: the page moves to the free half, one page fitted there", () => {
    for (const rtl of [false, true]) {
      const result = pose(book, { twoPage: true, rtl, sheetSide: mobileReaderBookSheetSide("ltr") });
      expect(result.spread).toBe(false);
      expect(result.spreadSlots).toBeUndefined();
      expect(result.foldGap).toBeNull();
      // The sheet covers the leading (left) half: the page takes the right one.
      expect(result.stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
      expect(result.modalFrame).toEqual(result.stage);
      // The setting itself stays available; only this render gives way.
      expect(result.twoPageAvailable).toBe(true);
    }
    // A right-to-left interface puts the sheet on the right: the page goes left.
    expect(mobileReaderBookSheetSide("rtl")).toBe("right");
    expect(pose(book, { sheetSide: "right" }).stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    // Closed again: the spread comes back as it was.
    expect(pose(book, { twoPage: true, sheetSide: null })).toEqual(pose(book, { twoPage: true }));
  });

  test("two-page: one page per half, fold is never a tap target, capsules snap per pane", () => {
    const result = pose(book, { twoPage: true });
    expect(result.posture).toBe("book");
    expect(result.spread).toBe(true);
    expect(result.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
    // A centred fold: the flat spread's halves, split at the centre line
    // (pages never move when the display folds); the fold is for taps only.
    expect(result.spreadSlots).toEqual([
      { x: 0, y: 0, width: 475.5, height: 669 },
      { x: 475.5, y: 0, width: 475.5, height: 669 },
    ]);
    expect(result.constrained).toBe(false);
    expect(result.foldGap).toEqual({ start: 455.5, end: 495.5 });
    expect(mobileReaderTapExcluded({ x: 475, y: 300 }, result.tapExclusions, result.foldGap)).toBe(true);
    const chrome = capsules(result);
    const fold = { x: 455.5, y: 0, width: 40, height: 669 };
    for (const piece of [chrome.back, chrome.title!, chrome.actions, chrome.scrubber]) {
      expect(overlapsBox(piece, fold)).toBe(false);
    }
    // Leading pane: Back · title · ⋯; the actions beside the scrubber in the
    // reading-start pane (the scrubber keeps ≥ 200pt there).
    expect(chrome.back.x).toBe(20);
    expect(chrome.title!.x).toBeGreaterThan(chrome.back.x);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(455.5 - 16);
    expect(chrome.more!.x + chrome.more!.width).toBe(455.5 - 20);
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(455.5 - 20);
    expect(chrome.scrubber.width).toBeGreaterThanOrEqual(200);
    // The scrim is a gradient, not a control: it spans both panes.
    expect(chrome.topScrim.width).toBe(951);
    // LTR: the scrubber + actions group is centred in the reading-start (left) pane.
    expect(Math.abs(groupCentre(chrome) - 455.5 / 2)).toBeLessThanOrEqual(1);
    expect(result.modalFrame).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
  });

  test("RTL reading puts the scrubber in the right (reading-start) pane", () => {
    const chrome = capsules(pose(book, { twoPage: true, rtl: true }));
    expect(chrome.scrubber.x).toBeGreaterThanOrEqual(495.5);
    // Reading direction never moves Back: it stays top-leading.
    expect(chrome.back.x).toBe(20);
  });

  test("single page sits in the reading-start half: left for LTR, right for RTL", () => {
    expect(pose(book).stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    expect(pose(book, { rtl: true }).stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
    expect(pose(book).spreadSlots).toBeUndefined();
  });

  test("single page: the page keeps its pane; the controls still snap per pane, never on the fold", () => {
    const ltr = capsules(pose(book, { twoPage: false }));
    expect(ltr.back.x).toBe(20);
    expect(ltr.actions.x + ltr.actions.width).toBeLessThanOrEqual(455.5);
    expect(ltr.scrubber.x + ltr.scrubber.width).toBeLessThanOrEqual(455.5);
    const rtl = capsules(pose(book, { twoPage: false, rtl: true }));
    expect(rtl.scrubber.x).toBeGreaterThanOrEqual(495.5);
    expect(rtl.actions.x).toBeGreaterThanOrEqual(495.5);
    expect(rtl.actions.x + rtl.actions.width).toBeLessThanOrEqual(951 - 20);
    // Too many actions for a ≥ 200pt scrubber beside them: they stay on top,
    // in the trailing pane beside the status bar.
    const crowded = capsules(pose(book, { twoPage: false, actionCount: 5 }));
    expect(crowded.actionsRow).toBe("top");
    expect(crowded.more).toBeNull();
    expect(crowded.actions.x).toBeGreaterThanOrEqual(495.5);
    expect(crowded.actions.x + crowded.actions.width).toBe(817);
  });

  test("Android book (no insets, no occlusions) uses the same capsule chrome", () => {
    const android = { ...book, verticalBarEdge: null, occlusions: [], safeAreaInsets: noInsets };
    const chrome = capsules(pose(android, { twoPage: true }));
    expect(chrome.more!.x + chrome.more!.width).toBe(455.5 - 20);
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(455.5 - 20);
    expect(chrome.back.y).toBe(8);
  });

  test("long strip uses one half-width column in the reading-start pane", () => {
    const result = pose(book, { paged: false, twoPage: true, rtl: true });
    expect(result.spread).toBe(false);
    expect(result.twoPageAvailable).toBe(false);
    expect(result.stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
  });
});

describe("reader pose: book, scroll reading", () => {
  const book = innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]);
  const scroll = (overrides: Partial<MobileReaderPoseLayoutInput> = {}) =>
    pose(book, { paged: false, scrollReading: true, ...overrides });

  test("the strip reads across the whole window, exactly as flat", () => {
    for (const rtl of [false, true]) {
      for (const actionCount of [3, 5]) {
        const result = scroll({ rtl, actionCount });
        expect(result).toEqual(pose(mobileReaderLayoutWithoutFold(book), { paged: false, scrollReading: true, rtl, actionCount }));
        expect(result.posture).toBe("flat");
        expect(result.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
        expect(result.foldGap).toBeNull();
        expect(result.chrome.kind).toBe("capsules");
      }
    }
  });

  test("a reader sheet never moves the strip", () => {
    const closed = scroll();
    for (const sheetSide of ["left", "right"] as const) {
      expect(scroll({ sheetSide })).toEqual(closed);
    }
  });

  test("paged reading and a paged chapter shown as a strip keep their book layout", () => {
    expect(pose(book).posture).toBe("book");
    expect(pose(book, { scrollReading: true }).posture).toBe("book");
    expect(pose(book, { paged: false }).posture).toBe("book");
  });
});

function overlapsBox(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 && a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;
}

describe("reader pose: laptop (notebook) reads as the open display", () => {
  // The Duo inner display half folded in portrait (measured): fold 455.5–495.5,
  // status island 134×82 top-right while the status bar shows.
  const laptop: MobileWindowLayout = {
    width: 669, height: 951, supported: true,
    divisions: [hinge(0, 455.5, 669, 40)],
    occlusions: [{ id: "status", x: 535, y: 0, width: 134, height: 82, active: true }],
    verticalBarEdge: null, layoutDirection: "ltr",
    safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
  };

  test("paged and scroll: the whole window, exactly as flat; no fold band, no pane split", () => {
    for (const paged of [true, false]) {
      for (const actionCount of [3, 5]) {
        const result = pose(laptop, { paged, scrollReading: !paged, actionCount, twoPage: true });
        expect(result).toEqual(pose(mobileReaderLayoutWithoutFold(laptop), { paged, scrollReading: !paged, actionCount, twoPage: true }));
        expect(result.posture).toBe("flat");
        expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 951 });
        expect(result.foldGap).toBeNull();
        expect(result.chrome.kind).toBe("capsules");
      }
    }
  });

  test("measured Duo fixtures (half folded, portrait and upside down): the same layout as open", () => {
    for (const m of fixture.measurements.filter((entry) => entry.pose === "partially-folded" && entry.bounds.height > entry.bounds.width)) {
      const layout = duoLayout(m);
      for (const paged of [true, false]) {
        const result = pose(layout, { paged, scrollReading: !paged });
        expect(result.posture).toBe("flat");
        expect(result.stage).toEqual({ x: 0, y: 0, width: m.bounds.width, height: m.bounds.height });
        expect(result).toEqual(pose(mobileReaderLayoutWithoutFold(layout), { paged, scrollReading: !paged }));
      }
    }
  });
});

describe("reader pose helpers", () => {
  test("safe padding only applies on edges that touch the window", () => {
    const bounds = { x: 0, y: 0, width: 951, height: 669 };
    const insets = { top: 10, left: 20, bottom: 30, right: 40 };
    expect(mobileReaderSafePadding({ x: 486, y: 0, width: 465, height: 669 }, bounds, insets)).toEqual({ top: 10, left: 0, bottom: 30, right: 40 });
    expect(mobileReaderSafePadding({ x: 0, y: 0, width: 465, height: 669 }, bounds, insets)).toEqual({ top: 10, left: 20, bottom: 30, right: 0 });
  });
  test("observer insets win over React Native fallbacks and invalid values are ignored", () => {
    const result = pose({ ...outer, safeAreaInsets: { top: Number.NaN, left: -4, bottom: 20, right: 44 } }, { fallbackInsets: { top: 99, left: 99, bottom: 99, right: 99 } });
    expect(result.safeInsets).toEqual({ top: 0, left: 0, bottom: 20, right: 44 });
  });
  test("popover sits between the capsule rows on phones and half folded like a laptop", () => {
    const insets = { top: 62, left: 0, bottom: 34, right: 0 };
    const phone = pose(phonePortrait, { fallbackInsets: insets });
    const chrome = capsules(phone);
    expect(mobileReaderPopoverPlacement(phone.chrome)).toEqual({ frame: chrome.content, bottomGap: READER_POPOVER_GAP });
    expect(chrome.content.y).toBe(chrome.back.y + 48 + 10);
    expect(chrome.content.y + chrome.content.height).toBe(Math.min(chrome.scrubber.y, chrome.actions.y) - 10);
    const notebook = pose(innerPortrait([hinge(0, 465, 669, 21)]));
    expect(notebook.popover).toEqual(pose(innerPortrait()).popover);
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
        ["long strip", { paged: false }],
      ] as const) {
        test(`${m.screen} ${m.pose} ${m.orientation}${camera ? " camera" : ""} · ${label}: pages avoid the fold; chrome avoids the fold and occlusions`, () => {
          const layout = duoLayout(m, { camera });
          const result = pose(layout, overrides);
          const fold = activeFold(layout);
          const blocked = [...activeOcclusions(layout), ...(fold ? [fold] : [])];
          for (const page of pageBoxes(result)) {
            // Immersive pages are full-bleed like phones (status bar hidden
            // while reading, pages may pass under camera cut-outs): they only
            // stay off the fold and inside the window. Half folded like a
            // laptop is the exception: the reader reads as on the open
            // display, the page across the fold.
            const laptopFold = fold !== null && fold.width > fold.height;
            // A spread across a centred book fold keeps the flat halves (its
            // pages meet at the spine, on the fold's centre line).
            const centredSpread = result.posture === "book" && result.spread && !result.constrained;
            if (fold && centredSpread) {
              expect(page.x === 0 || Math.abs(page.x - (fold.x + fold.width / 2)) <= 1).toBe(true);
            } else if (fold && !laptopFold) expect(overlaps(page, fold)).toBe(false);
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

  test("inner landscape (open and book, both orientations): Back top-leading, then the title, the ⋯ trailing; the actions beside the scrubber", () => {
    for (const posture of ["open", "partially-folded"]) {
      for (const orientation of ["landscape-left", "landscape-right"]) {
        const m = find("iphone-duo-inner", posture, orientation);
        const measured = duoLayout(m);
        // Also with the bar opted out, as the reader runs (the trait reports
        // no edge then): the status bar turns horizontal, a 134×82 island
        // top-right and an 82pt top inset (observer log, 2026-09-28).
        const optedOut: MobileWindowLayout = {
          ...measured,
          verticalBarEdge: null,
          occlusions: [
            ...measured.occlusions.filter((r) => r.y > 0),
            { id: "status", x: 817, y: 0, width: 134, height: 82, active: true },
          ],
          safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
        };
        for (const layout of [measured, optedOut]) {
          const insets = layout.safeAreaInsets!;
          for (const twoPage of [false, true]) {
            const chrome = capsules(pose(layout, { twoPage }));
            expect(chrome.title).not.toBeNull();
            // Back at the leading edge (16pt past the side safe area).
            expect(chrome.back.x).toBe(insets.left + READER_CAPSULE_EDGE);
            expect(chrome.back.x + chrome.back.width).toBeLessThan(chrome.title!.x);
            const more = chrome.more!;
            expect(chrome.actionsRow).toBe("bottom");
            expect(chrome.title!.x + chrome.title!.width).toBeLessThan(more.x);
            if (posture === "partially-folded") {
              // Book: Back · title · ⋯ in the leading pane, the scrubber and
              // the actions in the reading-start (left) pane.
              expect(more.x + more.width).toBe(455.5 - READER_CAPSULE_EDGE);
              expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(455.5);
            } else {
              // The ⋯ at the trailing end, clear of the side safe area.
              expect(more.x + more.width).toBeLessThanOrEqual(951 - insets.right);
              expect(more.x + more.width).toBeGreaterThan(951 - insets.right - 200);
              expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(951 - insets.right);
            }
          }
        }
      }
    }
    // Right-to-left layout mirrors it: Back top-right, the ⋯ on the left.
    const open = duoLayout(find("iphone-duo-inner", "open", "landscape-left"));
    const rtl: MobileWindowLayout = {
      ...open,
      verticalBarEdge: null,
      layoutDirection: "rtl",
      occlusions: [{ id: "status", x: 0, y: 0, width: 134, height: 82, active: true }],
      safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
    };
    const mirrored = capsules(pose(rtl));
    expect(mirrored.back.x + mirrored.back.width).toBe(951 - READER_CAPSULE_EDGE);
    expect(mirrored.title!.x + mirrored.title!.width).toBeLessThan(mirrored.back.x);
    expect(mirrored.more!.x + mirrored.more!.width).toBeLessThan(mirrored.title!.x);
    expect(mirrored.more!.x).toBe(134);
    const rtlBook = capsules(pose({ ...rtl, divisions: [hinge(455.5, 0, 40, 669)] }, { twoPage: true }));
    expect(rtlBook.back.x).toBeGreaterThanOrEqual(495.5);
    expect(rtlBook.title!.x).toBeGreaterThanOrEqual(495.5);
    expect(rtlBook.more!.x).toBeGreaterThanOrEqual(495.5);
    // RTL layout, LTR reading: the scrubber and the actions sit in the
    // reading-start (left) pane, the actions leading the row.
    expect(rtlBook.actions.x + rtlBook.actions.width).toBeLessThanOrEqual(rtlBook.scrubber.x - 9.5);
    expect(rtlBook.scrubber.x + rtlBook.scrubber.width).toBeLessThanOrEqual(455.5);
  });

  test("closed: the outer display's camera corner gets the compact capsule chrome, clear of the bar column and camera", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      const m = find("iphone-duo-outer", "closed", orientation);
      const layout = duoLayout(m);
      const result = pose(layout);
      expect(result.stage.x).toBe(0);
      const chrome = capsules(result);
      // Back + title on top, the actions beside the scrubber (landscape has
      // room for both on the bottom row too).
      expect(chrome.actionsRow).toBe("bottom");
      if (chrome.actionsRow === "bottom") {
        expect(Math.abs(chrome.actions.y + chrome.actions.height / 2 - (chrome.scrubber.y + chrome.scrubber.height / 2))).toBeLessThan(0.5);
      }
      expect(overlaps(chrome.actions, chrome.scrubber)).toBe(false);
      for (const piece of [chrome.back, chrome.actions, chrome.scrubber, ...(chrome.title ? [chrome.title] : [])]) {
        for (const region of activeOcclusions(layout)) expect(overlaps(piece, region)).toBe(false);
        expect(piece.x).toBeGreaterThanOrEqual(m.insets.left);
        expect(piece.x + piece.width).toBeLessThanOrEqual(m.bounds.width - m.insets.right + 0.01);
      }
      expect(result.chrome.kind === "capsules" && result.chrome.topScrim.y).toBe(0);
    }
  });

  test("closed, scroll reading, camera avoidance off: the strip fills the display; Split View stays beside the bar", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      const m = find("iphone-duo-outer", "closed", orientation);
      const layout: MobileWindowLayout = { ...duoLayout(m), hinge: "closed", fillsScreen: true };
      const result = pose(layout, { paged: false, sideBar: true, avoidCamera: false });
      expect(result.stage).toEqual(result.bounds);
      expect(result.pageSideInsets).toEqual({ left: 0, right: 0 });
      // The toolbar keeps its safe column, whatever the page does.
      expect(result.chrome).toEqual(pose(layout, { paged: false, sideBar: true }).chrome);
      const splitView = pose({ ...layout, fillsScreen: false }, { paged: false, sideBar: true, avoidCamera: false });
      expect(splitView.stage.width).toBeCloseTo(m.bounds.width - m.insets.left - m.insets.right, 6);
    }
  });

  test("closed, scroll reading, avoiding the camera: the strip keeps to the safe column, clear of the bar column and the camera", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      const m = find("iphone-duo-outer", "closed", orientation);
      const layout: MobileWindowLayout = { ...duoLayout(m), hinge: "closed", fillsScreen: true };
      const result = pose(layout, { paged: false, sideBar: true });
      expect(result.stage.x).toBe(m.insets.left);
      expect(result.stage.x + result.stage.width).toBeCloseTo(m.bounds.width - m.insets.right, 6);
      for (const region of activeOcclusions(layout)) expect(overlaps(result.stage, region)).toBe(false);
      // Paged reading (camera avoidance off) full-bleeds behind the bar column.
      expect(pose(layout, { paged: true, sideBar: true, avoidCamera: false }).stage.width).toBe(m.bounds.width);
    }
  });

  test("book: measured 40pt fold at 455.5–495.5 is the spread's tap gap; its slots split at the centre line", () => {
    const result = pose(duoLayout(find("iphone-duo-inner", "partially-folded", "landscape-left")), { twoPage: true });
    expect(result.posture).toBe("book");
    expect(result.foldGap).toEqual({ start: 455.5, end: 495.5 });
    expect(result.spreadSlots?.[1]).toEqual({ x: 475.5, y: 0, width: 951 - 475.5, height: 669 });
  });

  test("half folded like a laptop: the whole window, upright and upside-down, as when open", () => {
    for (const orientation of ["portrait", "upside-down"]) {
      const layout = duoLayout(find("iphone-duo-inner", "partially-folded", orientation));
      const result = pose(layout, { twoPage: true });
      expect(result.posture).toBe("flat");
      expect(result.stage).toEqual({ x: 0, y: 0, width: 669, height: 951 });
      expect(result.chrome.kind).toBe("capsules");
      // A portrait window: no spread, whatever the setting.
      expect(result.spread).toBe(false);
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
      // Spread: the right half, split at the centre line (the fold is centred).
      expect(pose(layout, { twoPage: true }).spreadSlots?.[1]).toEqual({ x: 475.5, y: 0, width: 951 - 475.5, height: 669 });
      // The top row in that pane sits left of the status occlusion, not below it.
      const chrome = rtl.chrome;
      if (chrome.kind === "capsules") {
        expect(chrome.back.y).toBeLessThan(120);
        expect((chrome.more ?? chrome.actions).y).toBeLessThan(120);
      }
    }
  });
});

describe("reader pose: page size never follows the chrome", () => {
  // Inner landscape with the vertical bar disabled: while the status bar is
  // shown, UIKit reports its 84×120 corner island as an 84pt trailing inset;
  // while reading (status bar hidden) there is neither.
  const hidden: MobileWindowLayout = {
    width: 951, height: 669, supported: true, divisions: [], occlusions: [],
    layoutDirection: "ltr", safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 0 },
  };
  const shown: MobileWindowLayout = {
    ...hidden,
    occlusions: [{ id: "status", x: 867, y: 0, width: 84, height: 120, active: true }],
    safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 84 },
  };

  test("a side inset explained by the status island is dropped: same page width with and without the status bar", () => {
    expect(pose(hidden, { twoPage: true }).pageSideInsets).toEqual({ left: 0, right: 0 });
    expect(pose(shown, { twoPage: true }).pageSideInsets).toEqual({ left: 0, right: 0 });
    expect(pose(shown).stage).toEqual(pose(hidden).stage);
  });

  test("a landscape phone's side cut-out (centred on the edge) is kept", () => {
    const phone: MobileWindowLayout = {
      width: 874, height: 402, supported: true, divisions: [],
      occlusions: [{ id: "island", x: 0, y: 140, width: 37, height: 122, active: true }],
      safeAreaInsets: { top: 0, left: 62, bottom: 21, right: 62 },
    };
    expect(pose(phone).pageSideInsets).toEqual({ left: 62, right: 62 });
    expect(pose(phoneLandscape, { fallbackInsets: { top: 0, left: 62, bottom: 21, right: 62 } }).pageSideInsets)
      .toEqual({ left: 62, right: 62 });
  });

  test("folded stages are sized exactly: no page insets", () => {
    expect(pose(innerLandscape([hinge(455.5, 0, 40, 669)]), { twoPage: true }).pageSideInsets).toEqual({ left: 0, right: 0 });
  });
});

describe("reader pose: the hinge leads the fold", () => {
  const inactive = hinge(455.5, 0, 40, 669, false);

  test("partially open with only the inactive division: the division is taken as active (book at once)", () => {
    const layout: MobileWindowLayout = { ...innerLandscape([inactive]), hinge: "partiallyOpen" };
    const anticipated = mobileReaderAnticipatedWindowLayout(layout);
    expect(anticipated.divisions[0].active).toBe(true);
    expect(pose(anticipated, { twoPage: true }).posture).toBe("book");
    // The real region update later is the same layout: no second change.
    expect(pose(innerLandscape([hinge(455.5, 0, 40, 669)]), { twoPage: true }).spreadSlots)
      .toEqual(pose(anticipated, { twoPage: true }).spreadSlots);
  });

  test("fully open, closed, unknown hinge, or an already active division pass through unchanged", () => {
    for (const status of ["fullyOpen", "closed", null] as const) {
      const layout: MobileWindowLayout = { ...innerLandscape([inactive]), hinge: status };
      expect(mobileReaderAnticipatedWindowLayout(layout)).toBe(layout);
    }
    const active: MobileWindowLayout = { ...innerLandscape([hinge(455.5, 0, 40, 669)]), hinge: "partiallyOpen" };
    expect(mobileReaderAnticipatedWindowLayout(active)).toBe(active);
  });

  test("a region that does not split the window (a camera) is never promoted", () => {
    const layout: MobileWindowLayout = { ...innerLandscape([hinge(600, 20, 40, 40, false)]), hinge: "partiallyOpen" };
    expect(mobileReaderAnticipatedWindowLayout(layout)).toBe(layout);
  });

  test("the anticipated fold never depends on the inactive width (Apple: zero when flat; the simulator: 40pt)", () => {
    const zeroWidth: MobileWindowLayout = { ...innerLandscape([hinge(475.5, 0, 0, 669, false)]), hinge: "partiallyOpen" };
    const simulator: MobileWindowLayout = { ...innerLandscape([inactive]), hinge: "partiallyOpen" };
    const expected = { x: 455.5, width: MOBILE_READER_ANTICIPATED_FOLD_WIDTH };
    expect(mobileReaderAnticipatedWindowLayout(zeroWidth).divisions[0]).toMatchObject({ ...expected, active: true });
    expect(mobileReaderAnticipatedWindowLayout(simulator).divisions[0]).toMatchObject({ ...expected, active: true });
    // Notebook: the same rule on the horizontal fold.
    const notebook: MobileWindowLayout = { ...innerPortrait([hinge(0, 475.5, 669, 0, false)]), hinge: "partiallyOpen" };
    expect(mobileReaderAnticipatedWindowLayout(notebook).divisions[0]).toMatchObject({ y: 455.5, height: 40, active: true });
  });

  test("the region stays authoritative: an expired hint (no active region in time) falls back to flat", () => {
    const layout: MobileWindowLayout = { ...innerLandscape([inactive]), hinge: "partiallyOpen" };
    expect(MOBILE_READER_HINGE_HINT_TIMEOUT_MS).toBeLessThanOrEqual(400);
    expect(pose(mobileReaderAnticipatedWindowLayout(layout)).posture).toBe("book");
    expect(mobileReaderAnticipatedWindowLayout(layout, { hintExpired: true })).toBe(layout);
    expect(pose(mobileReaderAnticipatedWindowLayout(layout, { hintExpired: true })).posture).toBe("flat");
    // Once the region turns active its own frame is used, expired or not.
    const active: MobileWindowLayout = { ...innerLandscape([hinge(455.5, 0, 40, 669)]), hinge: "partiallyOpen" };
    expect(pose(mobileReaderAnticipatedWindowLayout(active, { hintExpired: true })).posture).toBe("book");
  });

  test("the hint key identifies one pending episode and clears when the region answers", () => {
    const pending: MobileWindowLayout = { ...innerLandscape([inactive]), hinge: "partiallyOpen" };
    expect(mobileReaderHingeHintKey(pending)).toBe("951x669:hinge:v");
    expect(mobileReaderHingeHintKey({ ...pending, hinge: "fullyOpen" })).toBeNull();
    expect(mobileReaderHingeHintKey(innerLandscape([hinge(455.5, 0, 40, 669)]))).toBeNull();
    expect(mobileReaderHingeHintKey({ ...innerLandscape([hinge(455.5, 0, 40, 669)]), hinge: "partiallyOpen" })).toBeNull();
  });
});

describe("reader pose: the outer display's side-inset latch never outlives its configuration", () => {
  const closed: MobileWindowLayout = { ...outer, safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 84 } };
  const key = mobileReaderSideInsetLatchKey(closed, true)!;

  test("keeps the widest inset while the chrome toggles (the page never resizes)", () => {
    const shown = mobileReaderNextSideInsetLatch(null, key, { left: 0, right: 84 });
    const hidden = mobileReaderNextSideInsetLatch(shown, key, { left: 0, right: 0 });
    expect(hidden).toBe(shown);
    expect(hidden).toEqual({ key, left: 0, right: 84 });
  });

  test("drops it when the bar is disabled, and starts fresh when it comes back", () => {
    const shown = mobileReaderNextSideInsetLatch(null, key, { left: 0, right: 84 });
    expect(mobileReaderSideInsetLatchKey(closed, false)).toBeNull();
    const disabled = mobileReaderNextSideInsetLatch(shown, null, { left: 0, right: 0 });
    expect(disabled).toBeNull();
    expect(mobileReaderNextSideInsetLatch(disabled, key, { left: 0, right: 0 })).toEqual({ key, left: 0, right: 0 });
  });

  test("drops it on a display / size / Split View change", () => {
    const shown = mobileReaderNextSideInsetLatch(null, key, { left: 0, right: 84 });
    const splitKey = mobileReaderSideInsetLatchKey({ ...closed, width: 320 }, true)!;
    expect(splitKey).not.toBe(key);
    expect(mobileReaderNextSideInsetLatch(shown, splitKey, { left: 0, right: 0 })).toEqual({ key: splitKey, left: 0, right: 0 });
    expect(mobileReaderNextSideInsetLatch(shown, mobileReaderSideInsetLatchKey(null, true), { left: 0, right: 84 })).toBeNull();
  });

  test("drops it when the column moves to the other side at the same size (landscape-left ↔ right)", () => {
    const landscape = { ...closed, width: 678, height: 466 };
    const lkey = mobileReaderSideInsetLatchKey(landscape, true)!;
    const left = mobileReaderNextSideInsetLatch(null, lkey, { left: 0, right: 84 });
    const rotated = mobileReaderNextSideInsetLatch(left, lkey, { left: 84, right: 0 });
    // Never both sides inset.
    expect(rotated).toEqual({ key: lkey, left: 84, right: 0 });
  });
});

describe("reader pose: compact capsule chrome (hardware corner)", () => {
  // Outer display with the reader's vertical bar disabled: horizontal status
  // bar, the always-active camera cut-out in the top-right corner.
  const closedNoBar: MobileWindowLayout = {
    width: 466, height: 678, supported: true, divisions: [],
    occlusions: [{ id: "camera", x: 399.67, y: 29.33, width: 37, height: 37, active: true }],
    layoutDirection: "ltr", safeAreaInsets: { top: 54, left: 0, bottom: 34, right: 0 },
  };

  test("closed portrait: Back + title on top clear of the camera, scrubber + actions on the bottom row", () => {
    for (const actionCount of [2, 3, 4]) {
      const chrome = capsules(pose(closedNoBar, { actionCount }));
      const camera = closedNoBar.occlusions[0];
      expect(chrome.actionsRow).toBe("bottom");
      expect(chrome.back.x).toBe(READER_CAPSULE_EDGE);
      expect(chrome.title).not.toBeNull();
      expect(overlaps(chrome.title!, camera)).toBe(false);
      expect(chrome.title!.x).toBeGreaterThan(chrome.back.x + chrome.back.width);
      // Bottom row: scrubber from the leading edge, actions at the trailing edge.
      expect(chrome.scrubber.x).toBe(READER_CAPSULE_EDGE);
      expect(chrome.actions.x + chrome.actions.width).toBe(466 - READER_CAPSULE_EDGE);
      expect(chrome.scrubber.x + chrome.scrubber.width).toBeLessThanOrEqual(chrome.actions.x - 9.5);
      expect(chrome.scrubber.y + chrome.scrubber.height).toBeLessThanOrEqual(678 - 16);
      // Cards and popovers stay between the two rows.
      expect(chrome.content.y).toBeGreaterThanOrEqual(chrome.back.y + chrome.back.height);
      expect(chrome.content.y + chrome.content.height).toBeLessThanOrEqual(chrome.scrubber.y);
      // The top scrim covers the status bar and the row.
      expect(chrome.topScrim.height).toBeGreaterThanOrEqual(chrome.back.y + chrome.back.height);
    }
  });

  test("RTL mirrors both rows", () => {
    const rtl: MobileWindowLayout = {
      ...closedNoBar,
      layoutDirection: "rtl",
      occlusions: [{ id: "camera", x: 29.33, y: 29.33, width: 37, height: 37, active: true }],
    };
    const chrome = capsules(pose(rtl));
    expect(chrome.back.x + chrome.back.width).toBe(466 - READER_CAPSULE_EDGE);
    expect(chrome.actions.x).toBe(READER_CAPSULE_EDGE);
    expect(chrome.scrubber.x).toBeGreaterThan(chrome.actions.x + chrome.actions.width);
    expect(overlaps(chrome.title!, rtl.occlusions[0])).toBe(false);
  });

  test("a camera in a bottom corner (closed landscape-left) keeps the bottom row clear of it", () => {
    const layout: MobileWindowLayout = {
      width: 678, height: 466, supported: true, divisions: [],
      occlusions: [{ id: "camera", x: 612, y: 400, width: 37, height: 37, active: true }],
      layoutDirection: "ltr", safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 0 },
    };
    const chrome = capsules(pose(layout));
    for (const piece of [chrome.actions, chrome.scrubber]) expect(overlaps(piece, layout.occlusions[0])).toBe(false);
  });

  test("phones: the Dynamic Island (portrait, centred) and the side cut-out (landscape) stay clear", () => {
    const portraitIsland: MobileWindowLayout = {
      ...phonePortrait, supported: true,
      occlusions: [{ id: "island", x: 138, y: 11, width: 126, height: 37, active: true }],
      safeAreaInsets: { top: 62, left: 0, bottom: 34, right: 0 },
    };
    const landscapeIsland: MobileWindowLayout = {
      ...phoneLandscape, supported: true,
      occlusions: [{ id: "island", x: 11, y: 138, width: 37, height: 126, active: true }],
      safeAreaInsets: { top: 0, left: 62, bottom: 21, right: 62 },
    };
    for (const layout of [portraitIsland, landscapeIsland]) {
      const chrome = capsules(pose(layout));
      for (const piece of [chrome.back, chrome.actions, chrome.scrubber, ...(chrome.title ? [chrome.title] : [])]) {
        expect(overlaps(piece, layout.occlusions[0])).toBe(false);
        expect(piece.x).toBeGreaterThanOrEqual(layout.safeAreaInsets!.left);
        expect(piece.x + piece.width).toBeLessThanOrEqual(layout.width - layout.safeAreaInsets!.right + 0.01);
      }
    }
    // Portrait: the row sits below the status bar, never beside the island.
    expect(capsules(pose(portraitIsland)).back.y).toBe(62 + 8);
  });

  test("closed display: the row shares the status band only when the title keeps ≥ 200pt, else tucks right under it", () => {
    const withIsland = (width: number): MobileWindowLayout => ({
      ...closedNoBar,
      occlusions: [...closedNoBar.occlusions, { id: "status", x: 466 - width, y: 0, width, height: 54, active: true }],
    });
    // The title shares the band's row with Back and the trailing ⋯.
    const roomy = capsules(pose(withIsland(120)));
    expect(roomy.back.y).toBeLessThan(54);
    expect(roomy.title!.width).toBeGreaterThanOrEqual(200);
    expect(roomy.title!.x + roomy.title!.width).toBeLessThanOrEqual(roomy.more!.x - 10);
    expect(roomy.more!.x + roomy.more!.width).toBeLessThanOrEqual(466 - 120);
    const tight = capsules(pose(withIsland(240)));
    expect(tight.back.y).toBe(54 + 4);
    expect(tight.title!.width).toBeGreaterThanOrEqual(200);
    for (const chrome of [roomy, tight]) expect(chrome.topScrim.height).toBeGreaterThanOrEqual(chrome.back.y + chrome.back.height);
  });

  test("regular width puts the actions beside the scrubber; the system bar keeps them on top", () => {
    expect(capsules(pose(innerLandscapeNoBar())).actionsRow).toBe("bottom");
    expect(capsules(pose(innerLandscape(), { sideBar: true })).actionsRow).toBe("top");
  });
});

describe("reader pose: the iPhone Duo vertical bar", () => {
  test("outer display keeps the system bar; the inner display full-screen opts out in every posture", () => {
    // Owner decision (2026-09-29): the outer display keeps the vertical
    // status bar + Back/actions in the system bar; the inner display looks
    // like the Android foldable reader (horizontal status bar, capsule row).
    for (const m of fixture.measurements) {
      const layout = { ...duoLayout(m), fillsScreen: true };
      const policy = mobileReaderVerticalBarPolicy(layout);
      const outer = m.screen === "iphone-duo-outer";
      expect(policy).toEqual(outer ? { optOut: false, sideBar: true } : { optOut: true, sideBar: false });
    }
  });

  test("the inner display is recognised by its fold region, active or not", () => {
    // Flat (inactive division) and book (active division) both opt out.
    for (const active of [false, true]) {
      const layout: MobileWindowLayout = {
        ...innerLandscape([hinge(455.5, 0, 40, 669, active)]),
        verticalBarEdge: "trailing",
      };
      expect(mobileReaderVerticalBarPolicy(layout)).toEqual({ optOut: true, sideBar: false });
    }
  });

  test("a fully open hinge is the inner display even when its flat fold is not reported", () => {
    const layout: MobileWindowLayout = { ...innerLandscape([]), verticalBarEdge: "trailing", hinge: "fullyOpen" };
    expect(mobileReaderVerticalBarPolicy(layout)).toEqual({ optOut: true, sideBar: false });
    // Folding, before the fold region reports: still the inner display.
    expect(mobileReaderVerticalBarPolicy({ ...layout, hinge: "partiallyOpen" })).toEqual({ optOut: true, sideBar: false });
    // Tent (the outer display, partly open) keeps the system bar.
    expect(
      mobileReaderVerticalBarPolicy({ ...layout, width: 678, height: 466, hinge: "partiallyOpen" }),
    ).toEqual({ optOut: false, sideBar: true });
  });

  test("a closed hinge is the outer display even if a fold region is reported", () => {
    const layout: MobileWindowLayout = {
      ...innerLandscape([hinge(455.5, 0, 40, 669, false)]),
      verticalBarEdge: "trailing",
      hinge: "closed",
    };
    expect(mobileReaderVerticalBarPolicy(layout)).toEqual({ optOut: false, sideBar: true });
    expect(mobileReaderVerticalBarPolicy({ ...layout, hinge: "fullyOpen" })).toEqual({ optOut: true, sideBar: false });
  });

  test("no window information yet: the edge decides, never an opt-out", () => {
    expect(mobileReaderVerticalBarPolicy({ verticalBarEdge: null })).toEqual({ optOut: false, sideBar: false });
    expect(mobileReaderVerticalBarPolicy({})).toEqual({ optOut: false, sideBar: false });
    expect(mobileReaderVerticalBarPolicy({ verticalBarEdge: "trailing" })).toEqual({ optOut: false, sideBar: true });
  });

  test("Split View on the inner display: either half behaves like the outer display, bar on its own outer edge", () => {
    // HIG: "When two apps share the inner display with Split View
    // multitasking, each one places controls along its outer edge."
    for (const edge of ["leading", "trailing"] as const) {
      expect(mobileReaderVerticalBarPolicy({ verticalBarEdge: edge })).toEqual({ optOut: false, sideBar: true });
      // A Split View half does not fill the screen, even with the fold in it.
      const half: MobileWindowLayout = {
        ...innerLandscape([hinge(455.5, 0, 40, 669, false)]),
        verticalBarEdge: edge,
        fillsScreen: false,
      };
      expect(mobileReaderVerticalBarPolicy(half)).toEqual({ optOut: false, sideBar: true });
    }
  });

  test("a window with the bar kept at inner-landscape size: pages beside the column, capsules centred on the reading stage", () => {
    const layout: MobileWindowLayout = {
      ...innerLandscape([hinge(455.5, 0, 40, 669, false)]),
      verticalBarEdge: "trailing",
      safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 84 },
    };
    const result = pose(layout, { sideBar: true, twoPage: true });
    expect(result.posture).toBe("flat");
    expect(result.stage.x + result.stage.width).toBeLessThanOrEqual(951 - 84 + 0.01);
    const chrome = capsules(result);
    expect(chrome.back.width).toBe(0);
    expect(chrome.actions.width).toBe(0);
    const stageCentre = result.stage.x + result.stage.width / 2;
    expect(Math.abs(chrome.scrubber.x + chrome.scrubber.width / 2 - stageCentre)).toBeLessThanOrEqual(1);
    expect(Math.abs(chrome.title!.x + chrome.title!.width / 2 - stageCentre)).toBeLessThanOrEqual(1);
    expect(chrome.scrubber.x + chrome.scrubber.width).toBeLessThanOrEqual(951 - 84);
  });

  test("inner landscape, book: Back + actions in the bar, nothing of ours on the fold", () => {
    const layout: MobileWindowLayout = {
      ...innerLandscape([hinge(455.5, 0, 40, 669, true)]),
      verticalBarEdge: "trailing",
      safeAreaInsets: { top: 0, left: 0, bottom: 20, right: 84 },
    };
    const result = pose(layout, { sideBar: true, twoPage: true });
    expect(result.posture).toBe("book");
    const chrome = capsules(result);
    expect(chrome.back.width).toBe(0);
    expect(chrome.actions.width).toBe(0);
    for (const rect of [chrome.title!, chrome.scrubber]) {
      expect(rect.x + rect.width <= 455.5 || rect.x >= 495.5).toBe(true);
    }
  });

  test("phones, tablets and Android: no vertical-bar edge, never a side bar", () => {
    expect(mobileReaderVerticalBarPolicy(phonePortrait)).toEqual({ optOut: false, sideBar: false });
    expect(mobileReaderVerticalBarPolicy(phoneLandscape)).toEqual({ optOut: false, sideBar: false });
    // An unfolded Android foldable reports its fold: the opt-out is a no-op there.
    expect(mobileReaderVerticalBarPolicy(innerLandscape([hinge(455.5, 0, 40, 669, false)])).sideBar).toBe(false);
    expect(mobileReaderVerticalBarPolicy({ verticalBarEdge: null }).sideBar).toBe(false);
  });

  test("a left Split View half keeps its bar on the left: pages sit right of the column", () => {
    const layout: MobileWindowLayout = {
      width: 471, height: 669, supported: true, divisions: [], occlusions: [],
      verticalBarEdge: "leading", layoutDirection: "ltr", fillsScreen: false,
      safeAreaInsets: { top: 0, left: 84, bottom: 34, right: 0 },
    };
    const result = pose(layout, { sideBar: true });
    expect(result.stage.x).toBe(84);
    expect(result.stage.x + result.stage.width).toBe(471);
    const chrome = capsules(result);
    expect(chrome.title!.x).toBeGreaterThanOrEqual(84 + READER_CAPSULE_EDGE);
    expect(chrome.scrubber.x).toBeGreaterThanOrEqual(84);
  });

  test("with the bar kept: pages sit beside its column, only a top-leading title capsule and the scrubber are ours", () => {
    const m = fixture.measurements.find((entry) => entry.screen === "iphone-duo-outer" && entry.orientation === "portrait")!;
    const layout = duoLayout(m);
    const result = pose(layout, { sideBar: true });
    expect(result.stage.x + result.stage.width).toBeLessThanOrEqual(466 - 84 + 0.01);
    expect(result.constrained).toBe(true);
    const chrome = capsules(result);
    expect(chrome.back.width).toBe(0);
    expect(chrome.actions.width).toBe(0);
    expect(chrome.title).not.toBeNull();
    expect(chrome.title!.x).toBe(chrome.scrubber.x);
    expect(chrome.title!.width).toBe(chrome.scrubber.width);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(466 - 84 + 0.01);
    expect(chrome.actionsRow).toBe("top");
    for (const region of activeOcclusions(layout)) {
      expect(overlaps(chrome.title!, region)).toBe(false);
      expect(overlaps(chrome.scrubber, region)).toBe(false);
    }
  });
});

describe("flat on a foldable: the scrubber + actions group centres on the whole display", () => {
  const duo = (active: boolean): MobileWindowLayout => ({
    ...innerLandscape([hinge(455.5, 0, 40, 669, active)]),
    verticalBarEdge: null,
    safeAreaInsets: { top: 24, left: 0, bottom: 20, right: 0 },
  });
  for (const rtl of [false, true]) {
    for (const twoPage of [false, true]) {
      test(`${rtl ? "RTL" : "LTR"} ${twoPage ? "spread" : "single page"}: the resting fold is not a pane boundary`, () => {
        const flat = pose(duo(false), { twoPage, rtl });
        expect(flat.posture).toBe("flat");
        const chrome = capsules(flat);
        expect(chrome.actionsRow).toBe("bottom");
        expect(Math.abs(groupCentre(chrome) - 951 / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(chrome.title!.x + chrome.title!.width / 2 - 951 / 2)).toBeLessThanOrEqual(1);
      });
    }
  }

  test("the status column's one-sided trailing inset does not pull the scrubber + actions group off the display's centre", () => {
    const layout = { ...duo(false), safeAreaInsets: { top: 24, left: 0, bottom: 20, right: 68 } };
    const chrome = capsules(pose(layout, { twoPage: true }));
    expect(Math.abs(groupCentre(chrome) - 951 / 2)).toBeLessThanOrEqual(1);
    expect(chrome.scrubber.x + chrome.scrubber.width).toBeLessThanOrEqual(951 - 68);
    expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(951 - 68);
  });

  test("folding into book moves the scrubber into the reading-start pane (it may not sit on the fold)", () => {
    const book = capsules(pose(duo(true), { twoPage: true }));
    expect(book.scrubber.x + book.scrubber.width).toBeLessThanOrEqual(455.5);
  });
});


describe("persistent side bar capsule alignment", () => {
  for (const edge of ["left", "right"] as const) {
    test(`outer portrait with the bar on ${edge}`, () => {
      const result = pose({
        ...outer,
        safeAreaInsets: { top: 0, bottom: 20, left: edge === "left" ? 84 : 0, right: edge === "right" ? 84 : 0 },
      }, { sideBar: true });
      const chrome = capsules(result);
      expect(chrome.title!.x).toBe(chrome.scrubber.x);
      expect(chrome.title!.width).toBe(chrome.scrubber.width);
      expect(chrome.scrubber.x).toBeGreaterThanOrEqual(result.stage.x + READER_CAPSULE_EDGE);
      expect(chrome.scrubber.x + chrome.scrubber.width).toBeLessThanOrEqual(result.stage.x + result.stage.width - READER_CAPSULE_EDGE);
    });
  }
});

describe("capsule action slots", () => {
  test("Japanese Learning takes two slots, other plugins one, plus chapters, settings and the bilingual toggle", () => {
    expect(mobileReaderCapsuleActionSlots({ enabledPluginIds: [], bilingualToggle: false })).toBe(2);
    expect(
      mobileReaderCapsuleActionSlots({ enabledPluginIds: ["japanese-learning"], bilingualToggle: false }),
    ).toBe(4);
    expect(
      mobileReaderCapsuleActionSlots({ enabledPluginIds: ["japanese-learning", "other"], bilingualToggle: true }),
    ).toBe(6);
  });

  test("the reader derives the count in the same render as the pose (no one-frame lag)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"), "utf8");
    expect(screen).not.toContain("setReaderActionCount");
    expect(screen).toContain("buildReaderPose(readerActionSlots, readerSpreadMode)");
    expect(screen).toContain("buildReaderPose(readerBaseActionSlots, readerSpreadMode)");
  });
});

describe("reader pose: the trailing more (⋯) button", () => {
  // iPhone Air 420×912 and iPhone 17 Pro 402×874 in portrait: Dynamic Island
  // centred in the status band, the row below it.
  const phone = (width: number, height: number, top: number): MobileWindowLayout => ({
    width, height, supported: true, divisions: [],
    occlusions: [{ id: "island", x: (width - 126) / 2, y: 11, width: 126, height: 37, active: true }],
    layoutDirection: "ltr",
    safeAreaInsets: { top, left: 0, bottom: 34, right: 0 },
  });
  const air = phone(420, 912, 68);
  const pro = phone(402, 874, 62);

  test("phone portrait: a 48pt circle mirrors Back, the title centred between them", () => {
    for (const layout of [air, pro]) {
      const result = pose(layout);
      const chrome = capsules(result);
      const more = chrome.more!;
      expect(more).not.toBeNull();
      expect(more.width).toBe(48);
      expect(more.height).toBe(48);
      expect(more.y).toBe(chrome.back.y);
      // Mirror image of Back across the window's centre line.
      expect(more.x + more.width).toBe(layout.width - READER_CAPSULE_EDGE);
      expect(layout.width - (more.x + more.width)).toBe(chrome.back.x);
      // Title: centred on the window, a capsule gap from both circles, full labels.
      const title = chrome.title!;
      expect(title.x + title.width / 2).toBe(layout.width / 2);
      expect(title.x).toBeGreaterThanOrEqual(chrome.back.x + chrome.back.width + 10);
      expect(title.x + title.width).toBeLessThanOrEqual(more.x - 10);
      expect(title.width).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
      expect(overlapsBox(more, layout.occlusions[0])).toBe(false);
      // Its taps never turn a page.
      expect(mobileReaderTapExcluded({ x: more.x + 22, y: more.y + 22 }, result.tapExclusions, result.foldGap)).toBe(true);
    }
  });

  test("the actions stay on the bottom row; the ⋯ never duplicates them on top", () => {
    const chrome = capsules(pose(air));
    expect(chrome.actionsRow).toBe("bottom");
    expect(chrome.actions.y).toBeGreaterThan(chrome.more!.y + 44);
  });

  test("RTL mirrors it: Back on the right, ⋯ on the left", () => {
    const chrome = capsules(pose({ ...air, layoutDirection: "rtl" }));
    expect(chrome.back.x + chrome.back.width).toBe(420 - READER_CAPSULE_EDGE);
    expect(chrome.more!.x).toBe(READER_CAPSULE_EDGE);
    expect(chrome.title!.x).toBeGreaterThanOrEqual(chrome.more!.x + 44 + 10);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.back.x - 10);
  });

  test("a camera in the trailing top corner (outer display, no bar) keeps the ⋯ and the title clear of it", () => {
    const closedNoBar: MobileWindowLayout = {
      width: 466, height: 678, supported: true, divisions: [],
      occlusions: [{ id: "camera", x: 399.67, y: 29.33, width: 37, height: 37, active: true }],
      layoutDirection: "ltr", safeAreaInsets: { top: 54, left: 0, bottom: 34, right: 0 },
    };
    const chrome = capsules(pose(closedNoBar));
    expect(chrome.more).not.toBeNull();
    expect(overlapsBox(chrome.more!, closedNoBar.occlusions[0])).toBe(false);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.more!.x - 10);
  });

  test("a ⋯ wherever the actions ride the bottom row; none where they hold the top row's trailing end, or the system bar carries them", () => {
    // Tablets and the Duo inner display: the actions beside the scrubber.
    expect(capsules(pose(phoneLandscape, { fallbackInsets: { top: 0, left: 62, bottom: 21, right: 62 } })).more).not.toBeNull();
    expect(capsules(pose({ width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] })).more).not.toBeNull();
    expect(capsules(pose(innerLandscapeNoBar())).more).not.toBeNull();
    expect(capsules(pose(innerPortrait())).more).not.toBeNull();
    expect(capsules(pose(innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]), { twoPage: true })).more).not.toBeNull();
    // Book with too many actions for the pane's bottom row: atop the trailing pane.
    expect(capsules(pose(innerLandscapeNoBar([hinge(455.5, 0, 40, 669)]), { twoPage: true, actionCount: 5 })).more).toBeNull();
    // The vertical bar (outer display, Split View) carries Back and the actions.
    expect(capsules(pose(outer, { sideBar: true })).more).toBeNull();
    // Half folded like a laptop: the open display's bottom row.
    expect(capsules(pose(innerPortrait([hinge(0, 465, 669, 21)]))).actionsRow).toBe("bottom");
  });
});

describe("reader pose: measured Duo states checked on the simulator round (open portrait, rotation, half-folded)", () => {
  const measured = (screen: string, posture: string, orientation: string) => {
    const m = fixture.measurements.find((x) => x.screen === screen && x.pose === posture && x.orientation === orientation);
    if (!m) throw new Error(`missing measurement ${screen} ${posture} ${orientation}`);
    return duoLayout(m);
  };

  test("open portrait, flat: one page (auto), full-bleed, capsule row with the actions on top, large window shape", () => {
    const layout = measured("iphone-duo-inner", "open", "portrait");
    const result = pose(layout, { spreadMode: "auto" });
    expect(result.posture).toBe("flat");
    expect(result.spread).toBe(false);
    expect(result.twoPageAvailable).toBe(false);
    expect(result.foldGap).toBeNull();
    expect(result.chrome.kind).toBe("capsules");
    if (result.chrome.kind !== "capsules") return;
    expect(result.chrome.actionsRow).toBe("bottom");
    expect(result.chrome.more).not.toBeNull();
    expect(classifyReaderWindowShape(result.stage)).toBe("large");
  });

  test("land → port → land settles exactly like the first landscape (pose and side-inset latch)", () => {
    const land = measured("iphone-duo-inner", "open", "landscape-left");
    const port = measured("iphone-duo-inner", "open", "portrait");
    const first = pose(land, { spreadMode: "auto", sideBar: true });
    const latchFor = (layout: MobileWindowLayout, previous: ReturnType<typeof mobileReaderNextSideInsetLatch>) =>
      mobileReaderNextSideInsetLatch(previous, mobileReaderSideInsetLatchKey(layout, true), layout.safeAreaInsets);
    const latch1 = latchFor(land, null);
    const latchPort = latchFor(port, latch1);
    const latch2 = latchFor(land, latchPort);
    expect(latch2).toEqual(latch1);
    pose(port, { spreadMode: "auto", sideBar: true });
    const second = pose(land, { spreadMode: "auto", sideBar: true });
    expect(second).toEqual(first);
    expect(second.spread).toBe(first.spread);
  });

  test("half-folded (laptop): the same layout as open portrait", () => {
    const folded = pose(measured("iphone-duo-inner", "partially-folded", "portrait"), { spreadMode: "auto" });
    const open = pose(measured("iphone-duo-inner", "open", "portrait"), { spreadMode: "auto" });
    expect(folded.posture).toBe("flat");
    expect(folded.stage).toEqual(open.stage);
    expect(folded.spread).toBe(open.spread);
    expect(folded.chrome.kind).toBe("capsules");
    if (folded.chrome.kind !== "capsules" || open.chrome.kind !== "capsules") return;
    expect(folded.chrome.actionsRow).toBe(open.chrome.actionsRow);
  });
});



describe("outer reader: page behind the original rail", () => {
  test("uses the full page width while preserving the controls and their safe column", () => {
    for (const edge of ["leading", "trailing"] as const) {
      const layout: MobileWindowLayout = {
        ...outer, hinge: "closed", fillsScreen: true, verticalBarEdge: edge,
        safeAreaInsets: { top: 0, bottom: 34, left: edge === "leading" ? 84 : 0, right: edge === "trailing" ? 84 : 0 },
      };
      const before = pose({ ...layout, hinge: undefined }, { sideBar: true });
      const after = pose(layout, { sideBar: true });
      expect(after.stage).toEqual(after.bounds);
      expect(after.pageSideInsets).toEqual({ left: 0, right: 0 });
      expect(after.chrome).toEqual(before.chrome);
      expect(mobileReaderVerticalBarPolicy(layout)).toEqual({ optOut: false, sideBar: true });
      // A narrow shared window still reserves the system rail.
      expect(pose({ ...layout, fillsScreen: false }, { sideBar: true }).stage).toEqual(before.stage);
    }
  });
});


describe("outer camera-aware page fitting", () => {
  for (const measurement of fixture.measurements.filter((m) => m.screen === "iphone-duo-outer")) {
    test(`${measurement.orientation}: avoids the camera without reserving the whole status rail`, () => {
      const layout: MobileWindowLayout = { ...duoLayout(measurement), hinge: "closed", fillsScreen: true };
      const camera = layout.occlusions.find((r) => r.x > 0 && r.y > 0)!;
      const visible = pose(layout, { sideBar: true, pageAspectRatio: 1 / 1.45 });
      const hidden = pose({ ...layout, occlusions: [camera] }, { sideBar: true, pageAspectRatio: 1 / 1.45 });
      expect(overlaps(visible.stage, camera)).toBe(false);
      expect(hidden.stage).toEqual(visible.stage);
      expect(visible.stage.x).toBeGreaterThanOrEqual(0);
      expect(visible.stage.y).toBeGreaterThanOrEqual(0);
      expect(visible.stage.x + visible.stage.width).toBeLessThanOrEqual(layout.width);
      expect(visible.stage.y + visible.stage.height).toBeLessThanOrEqual(layout.height);
    });
  }

  test("uses the full left edge below a top-right camera for a normal portrait page", () => {
    const m = fixture.measurements.find((m) => m.screen === "iphone-duo-outer" && m.orientation === "portrait")!;
    const layout: MobileWindowLayout = { ...duoLayout(m), hinge: "closed", fillsScreen: true };
    const result = pose(layout, { sideBar: true, pageAspectRatio: 1 / 1.45 });
    expect(result.stage.x).toBe(0);
    expect(result.stage.width).toBe(layout.width);
    expect(result.stage.y).toBeCloseTo(66.333333);
    // A very tall page gets more image area beside the camera instead.
    const tall = pose(layout, { sideBar: true, pageAspectRatio: 0.3 });
    expect(tall.stage.y).toBe(0);
    expect(tall.stage.height).toBe(layout.height);
    expect(tall.stage.x).toBe(0);
  });
});


describe("Duo full-screen canvas choices", () => {
  test("outer immersion uses every edge while controls retain their camera-safe placement", () => {
    const m = fixture.measurements.find((m) => m.screen === "iphone-duo-outer" && m.orientation === "portrait")!;
    const layout: MobileWindowLayout = { ...duoLayout(m), hinge: "closed", fillsScreen: true };
    const safe = pose(layout, { sideBar: true, pageAspectRatio: 1 / 1.45 });
    const immersive = pose(layout, { sideBar: true, avoidCamera: false, pageAspectRatio: 1 / 1.45 });
    expect(immersive.stage).toEqual(immersive.bounds);
    expect(immersive.stage.height).toBeGreaterThan(safe.stage.height);
    expect(immersive.pageSideInsets).toEqual({ left: 0, right: 0 });
    expect(immersive.chrome).toEqual(safe.chrome);
  });

  test("flat inner portrait stays one full-size page, even with Double saved, and restores spreads after rotation", () => {
    for (const spreadMode of ["auto", "double"] as const) {
      const portrait = pose(innerPortrait(), { spreadMode });
      expect(portrait.stage).toEqual(portrait.bounds);
      expect(portrait.spread).toBe(false);
      expect(portrait.pageSideInsets).toEqual({ left: 0, right: 0 });
      const landscape = pose(innerLandscapeNoBar(), { spreadMode });
      expect(landscape.spread).toBe(true);
    }
  });
});

describe("reader title capsule width", () => {
  test("hugs its labels between a minimum and a bit over half the window, never edge to edge", () => {
    // Duo outer display: the slot beside the vertical bar is ~350pt, the capsule stops at 58% of the window.
    expect(mobileReaderTitleCapsuleWidthRange(350, 466)).toEqual({ minWidth: READER_TITLE_CAPSULE_MIN_WIDTH, maxWidth: 270 });
    // Wide windows keep the slot's own cap.
    expect(mobileReaderTitleCapsuleWidthRange(360, 951).maxWidth).toBe(360);
    // A narrow slot wins over the window share, and the minimum never exceeds it.
    expect(mobileReaderTitleCapsuleWidthRange(120, 466)).toEqual({ minWidth: 120, maxWidth: 120 });
    expect(mobileReaderTitleCapsuleWidthRange(0, 466)).toEqual({ minWidth: 0, maxWidth: 0 });
  });
});

describe("reader pose: iPad bottom row (actions beside the scrubber)", () => {
  // iPad widths in points, portrait and landscape (mini 744, Air 820, Pro 11" 834,
  // 10th-gen landscape 1180, Pro 13" 1032 / 1366), status bar 24, home indicator 20.
  const tablet = (width: number, height: number): MobileWindowLayout => ({ width, height, supported: false, divisions: [], occlusions: [] });
  const sizes: [number, number][] = [[744, 1133], [820, 1180], [834, 1194], [1024, 1366], [1032, 1376], [1180, 820], [1366, 1024]];
  for (const [width, height] of sizes) {
    for (const actionCount of [1, 3]) {
      test(`${width}pt, ${actionCount} button${actionCount === 1 ? "" : "s"}: actions on the bottom row, the group centred, scrubber ≤ ${READER_SCRUBBER_CAPSULE_MAX_WIDTH}`, () => {
        const result = pose(tablet(width, height), { actionCount, fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } });
        const chrome = capsules(result);
        expect(chrome.actionsRow).toBe("bottom");
        expect(chrome.more).not.toBeNull();
        expect(chrome.actions.width).toBe(mobileReaderCapsuleActionsWidth(actionCount));
        expect(chrome.scrubber.width).toBeLessThanOrEqual(READER_SCRUBBER_CAPSULE_MAX_WIDTH);
        expect(chrome.scrubber.width).toBeGreaterThanOrEqual(READER_SCRUBBER_MIN_WIDTH);
        expect(Math.abs(groupCentre(chrome) - width / 2)).toBeLessThanOrEqual(1);
        // Scrubber leading, the actions trailing, one gap apart, on one row.
        expect(chrome.actions.x).toBeGreaterThanOrEqual(chrome.scrubber.x + chrome.scrubber.width + 9.5);
        expect(chrome.actions.y + chrome.actions.height / 2).toBe(chrome.scrubber.y + chrome.scrubber.height / 2);
        expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(width - READER_CAPSULE_EDGE);
      });
    }
  }

  test("the row choice: bottom while the scrubber keeps its minimum beside the actions", () => {
    const pane = { x: 0, y: 0, width: 455.5, height: 669 };
    expect(mobileReaderActionsRow(pane, { left: 0, right: 0 }, 3)).toBe("bottom");
    expect(mobileReaderActionsRow(pane, { left: 0, right: 0 }, 5)).toBe("top");
    expect(mobileReaderActionsRow({ x: 0, y: 0, width: 744, height: 1133 }, { left: 0, right: 0 }, 3)).toBe("bottom");
  });

  test("the group layout: centred, the scrubber capped, mirrored in RTL", () => {
    const region = { x: 0, y: 0, width: 1366, height: 1024 };
    const ltr = mobileReaderBottomRowLayout({ region, start: 20, end: 1346, actionsWidth: 136, ltr: true });
    expect(ltr.scrubberWidth).toBe(READER_SCRUBBER_CAPSULE_MAX_WIDTH);
    expect(ltr.scrubberX).toBe((1366 - (480 + 10 + 136)) / 2);
    expect(ltr.actionsX).toBe(ltr.scrubberX + 480 + 10);
    const rtl = mobileReaderBottomRowLayout({ region, start: 20, end: 1346, actionsWidth: 136, ltr: false });
    expect(rtl.actionsX).toBe(ltr.scrubberX);
    expect(rtl.scrubberX).toBe(rtl.actionsX + 136 + 10);
    // A narrow span: the group fills it, scrubber leading, actions trailing.
    const phone = mobileReaderBottomRowLayout({ region: { x: 0, y: 0, width: 402, height: 874 }, start: 20, end: 382, actionsWidth: 136, ltr: true });
    expect(phone).toEqual({ scrubberX: 20, scrubberWidth: 362 - 146, actionsX: 382 - 136 });
  });
});

describe("reader pose: the title stays on the window's centre between Back and the ⋯", () => {
  // A trailing obstacle in the top row (status island, camera) pushes the ⋯ inward.
  const window = (islandWidth: number): MobileWindowLayout => ({
    width: 669, height: 951, supported: true, divisions: [],
    occlusions: [{ id: "status", x: 669 - islandWidth, y: 0, width: islandWidth, height: 82, active: true }],
    verticalBarEdge: null, layoutDirection: "ltr",
    safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
  });
  const centreRule = (chrome: ReturnType<typeof capsules>, width: number) =>
    2 * Math.min(width / 2 - (chrome.back.x + chrome.back.width + 10), chrome.more!.x - 10 - width / 2);

  test("width = 2 × min(centre − (Back + 10), (⋯ − 10) − centre), centred within 1pt, 10pt clear of both", () => {
    for (const islandWidth of [0, 60, 134, 160]) {
      const chrome = capsules(pose(window(islandWidth)));
      const title = chrome.title!;
      const expected = Math.min(360, centreRule(chrome, 669));
      expect(expected).toBeGreaterThanOrEqual(READER_CAPSULE_TITLE_FULL_MIN_WIDTH);
      expect(Math.abs(title.x + title.width / 2 - 669 / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(title.width - expected)).toBeLessThanOrEqual(1);
      expect(title.x).toBeGreaterThanOrEqual(chrome.back.x + chrome.back.width + 10);
      expect(title.x + title.width).toBeLessThanOrEqual(chrome.more!.x - 10);
    }
  });

  test("RTL mirrors it: Back on the right, the ⋯ past an island on the left", () => {
    const layout: MobileWindowLayout = {
      ...window(0),
      occlusions: [{ id: "status", x: 0, y: 0, width: 134, height: 82, active: true }],
      layoutDirection: "rtl",
    };
    const chrome = capsules(pose(layout));
    const title = chrome.title!;
    expect(Math.abs(title.x + title.width / 2 - 669 / 2)).toBeLessThanOrEqual(1);
    expect(title.x).toBeGreaterThanOrEqual(chrome.more!.x + chrome.more!.width + 10);
    expect(title.x + title.width).toBeLessThanOrEqual(chrome.back.x - 10);
  });

  test("below 160pt the title falls back to centring between Back and the ⋯", () => {
    // A 300pt island: the ⋯ ends at 369, so 2 × min(256.5, 311 − 334.5) < 160.
    const chrome = capsules(pose(window(300)));
    if (chrome.back.y < 82) {
      const title = chrome.title!;
      const leftGap = title.x - (chrome.back.x + chrome.back.width);
      const rightGap = chrome.more!.x - (title.x + title.width);
      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
    }
  });
});

describe("reader scroll: stable top inset", () => {
  // Duo inner display: the 134×82 status island and its 82pt top inset come
  // and go with the status bar (the chrome).
  const island = { id: "status", x: 817, y: 0, width: 134, height: 82, active: true };
  const shown: MobileWindowLayout = {
    width: 951, height: 669, supported: true, divisions: [], occlusions: [island],
    safeAreaInsets: { top: 82, left: 0, bottom: 34, right: 0 },
  };
  const hidden: MobileWindowLayout = { ...shown, occlusions: [], safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 0 } };

  test("the Duo's status island never moves the list: 0 with the status bar shown and hidden", () => {
    expect(mobileReaderStableTopInset(shown, { top: 82 })).toBe(0);
    expect(mobileReaderStableTopInset(hidden, { top: 0 })).toBe(0);
    // The island still reported while the inset is already gone (or the reverse).
    expect(mobileReaderStableTopInset(shown, { top: 0 })).toBe(0);
    expect(mobileReaderStableTopInset(hidden, { top: 82 })).toBe(82);
  });

  test("an inactive island is not one", () => {
    expect(mobileReaderStableTopInset({ ...shown, occlusions: [{ ...island, active: false }] }, { top: 82 })).toBe(82);
  });

  test("phones (Dynamic Island, notch, no reported occlusions) keep the live inset", () => {
    const proMax: MobileWindowLayout = { width: 440, height: 956, supported: false, divisions: [], occlusions: [] };
    expect(mobileReaderStableTopInset(proMax, { top: 62 })).toBe(62);
    expect(mobileReaderStableTopInset(proMax, { top: 0 })).toBe(0);
  });

  test("a status bar spanning the top (wider than most of the window) keeps the inset", () => {
    const wide = { ...shown, occlusions: [{ ...island, x: 0, width: 951 }] };
    expect(mobileReaderStableTopInset(wide, { top: 82 })).toBe(82);
  });

  describe("from one native sample", () => {
    const window = { width: 951, height: 669 };

    test("before the reader's report, the app observer's sample: 80pt at mount, not 82 + 80 (SPY p1 band)", () => {
      // The live inset is 82 (chrome and status bar shown at open).
      expect(mobileReaderScrollStableTopInset({ reader: null, app: shown, window, insets: { top: 82 } }) + 80).toBe(80);
      // The reader's own report then agrees: no flip, nothing for the list to anchor.
      expect(mobileReaderScrollStableTopInset({ reader: shown, app: shown, window, insets: { top: 82 } })).toBe(0);
      // Chrome hidden: the island and the inset leave together.
      expect(mobileReaderScrollStableTopInset({ reader: hidden, app: shown, window, insets: { top: 0 } })).toBe(0);
    });

    test("the reader's report pairs its island with its own inset, not the live one", () => {
      // The live inset lags the report (or leads it): the old mix gave 82.
      expect(mobileReaderScrollStableTopInset({ reader: hidden, app: null, window, insets: { top: 82 } })).toBe(0);
      expect(mobileReaderScrollStableTopInset({ reader: shown, app: null, window, insets: { top: 0 } })).toBe(0);
    });

    test("an app sample of another window is not used", () => {
      const other = { ...shown, width: 669, height: 951 };
      expect(mobileReaderScrollStableTopInset({ reader: null, app: other, window, insets: { top: 82 } })).toBe(82);
    });

    test("Pro Max (Dynamic Island): the same inset before and after the report, chrome shown or hidden", () => {
      const phone = { width: 440, height: 956 };
      const proMax: MobileWindowLayout = {
        ...phone, supported: false, divisions: [], occlusions: [],
        safeAreaInsets: { top: 62, left: 0, bottom: 34, right: 0 },
      };
      expect(mobileReaderScrollStableTopInset({ reader: null, app: null, window: phone, insets: { top: 62 } })).toBe(62);
      expect(mobileReaderScrollStableTopInset({ reader: null, app: proMax, window: phone, insets: { top: 62 } })).toBe(62);
      expect(mobileReaderScrollStableTopInset({ reader: proMax, app: proMax, window: phone, insets: { top: 62 } })).toBe(62);
    });

    test("Duo outer display: 0 throughout", () => {
      const outer = { width: 375, height: 667 };
      const layout: MobileWindowLayout = {
        ...outer, supported: true, divisions: [], occlusions: [],
        safeAreaInsets: { top: 0, left: 0, bottom: 0, right: 0 },
      };
      expect(mobileReaderScrollStableTopInset({ reader: null, app: layout, window: outer, insets: { top: 0 } })).toBe(0);
      expect(mobileReaderScrollStableTopInset({ reader: layout, app: layout, window: outer, insets: { top: 0 } })).toBe(0);
    });

    test("Duo outer display with its vertical bar: 0 (80pt band, not 104) though the reader's view reports a 24pt top", () => {
      const outerWindow = { width: 466, height: 678 };
      const barred: MobileWindowLayout = {
        ...outerWindow, supported: true, divisions: [],
        occlusions: [{ id: "camera", x: 399.67, y: 29.33, width: 37, height: 37, active: true }],
        verticalBarEdge: "trailing", layoutDirection: "ltr",
        safeAreaInsets: { top: 24, left: 0, bottom: 20, right: 84 },
      };
      for (const insets of [{ top: 0 }, { top: 24 }]) {
        expect(mobileReaderScrollStableTopInset({ reader: null, app: barred, window: outerWindow, insets }) + 80).toBe(80);
        expect(mobileReaderScrollStableTopInset({ reader: barred, app: barred, window: outerWindow, insets }) + 80).toBe(80);
      }
      // RTL: the bar on the leading edge, same.
      expect(mobileReaderScrollStableTopInset({ reader: { ...barred, verticalBarEdge: "leading" }, app: null, window: outerWindow, insets: { top: 24 } })).toBe(0);
      // Without the bar (the opted-out inner display) the inset is kept as before.
      expect(mobileReaderScrollStableTopInset({ reader: { ...barred, verticalBarEdge: null }, app: null, window: outerWindow, insets: { top: 0 } })).toBe(24);
    });

    test("no native sample, or one without insets (bounds-only hosts): the live inset, as before", () => {
      expect(mobileReaderScrollStableTopInset({ reader: null, app: null, window, insets: { top: 24 } })).toBe(24);
      const boundsOnly: MobileWindowLayout = { ...window, supported: false, divisions: [], occlusions: [] };
      expect(mobileReaderScrollStableTopInset({ reader: boundsOnly, app: boundsOnly, window, insets: { top: 24 } })).toBe(24);
    });
  });
});

describe("reader pose: a resizable iPad window's controls", () => {
  // iPadOS 26 windowed app, compact width: the close / minimise / resize
  // controls sit in the top-leading corner, inside the plain safe area.
  const windowed = (overrides: Partial<MobileWindowLayout> = {}): MobileWindowLayout => ({
    width: 560,
    height: 880,
    supported: false,
    divisions: [],
    occlusions: [],
    safeAreaInsets: { top: 24, left: 0, bottom: 20, right: 0 },
    cornerSafeAreaInsets: { top: 24, left: 88, bottom: 20, right: 0 },
    fillsScreen: false,
    horizontalSizeClass: "compact",
    verticalSizeClass: "regular",
    layoutDirection: "ltr",
    ...overrides,
  });

  test("Back starts past the controls; the scrubber row is not under them", () => {
    const plain = capsules(pose(windowed({ cornerSafeAreaInsets: undefined })));
    const chrome = capsules(pose(windowed()));
    expect(chrome.back.x).toBeGreaterThanOrEqual(88);
    expect(chrome.back.y).toBe(plain.back.y);
    expect(chrome.scrubber).toEqual(plain.scrubber);
    if (chrome.title) expect(chrome.title.x).toBeGreaterThanOrEqual(chrome.back.x + chrome.back.width);
  });

  test("a window that fills its screen has no controls: the plain safe area stands", () => {
    expect(mobileReaderWindowControlInsets({ fillsScreen: true, cornerSafeAreaInsets: { top: 24, left: 88, bottom: 0, right: 0 } })).toBeNull();
    expect(mobileReaderWindowControlInsets({ cornerSafeAreaInsets: { top: 24, left: 88, bottom: 0, right: 0 } })).toBeNull();
    const full = capsules(pose(windowed({ fillsScreen: true })));
    const plain = capsules(pose(windowed({ fillsScreen: true, cornerSafeAreaInsets: undefined })));
    expect(full.back).toEqual(plain.back);
  });

  test("right-to-left: the controls' side follows the reported insets", () => {
    expect(
      mobileReaderWindowControlInsets({ fillsScreen: false, cornerSafeAreaInsets: { top: 24, left: 0, bottom: 0, right: 88 } }),
    ).toEqual({ left: 0, right: 88 });
    const chrome = capsules(pose(windowed({
      layoutDirection: "rtl",
      cornerSafeAreaInsets: { top: 24, left: 0, bottom: 20, right: 88 },
    })));
    expect(chrome.back.x + chrome.back.width).toBeLessThanOrEqual(560 - 88);
  });
});
