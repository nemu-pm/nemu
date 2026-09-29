import { describe, expect, test } from "bun:test";
import {
  mobileReaderFrameInsets,
  mobileReaderPopoverPlacement,
  mobileReaderPoseLayout,
  mobileReaderSafePadding,
  mobileReaderTapExcluded,
  mobileReaderCapsuleActionSlots,
  mobileReaderCapsuleActionsWidth,
  mobileReaderCapsuleRowTop,
  mobileReaderAnticipatedWindowLayout,
  mobileReaderHingeHintKey,
  mobileReaderNextSideInsetLatch,
  mobileReaderSideInsetLatchKey,
  mobileReaderVerticalBarPolicy,
  MOBILE_READER_ANTICIPATED_FOLD_WIDTH,
  MOBILE_READER_HINGE_HINT_TIMEOUT_MS,
  READER_CAPSULE_EDGE,
  READER_CAPSULE_TITLE_FULL_MIN_WIDTH,
  READER_POPOVER_GAP,
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
    ...overrides,
  });
}

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
    expect(result.chromePinned).toBe(false);
  });

  test("phone landscape keeps seamless spreads", () => {
    const result = pose(phoneLandscape, { fallbackInsets: { top: 0, left: 62, bottom: 21, right: 62 }, twoPage: true });
    expect(result.spread).toBe(true);
    // Seamless: no synthetic slots or gutter when nothing is folded.
    expect(result.spreadSlots).toBeUndefined();
    expect(result.foldGap).toBeNull();
    // Short and wide: one top row (Back · title · actions) clear of the side
    // cut-outs, the scrubber at the bottom.
    const chrome = capsules(result);
    expect(chrome.actionsRow).toBe("top");
    expect(chrome.back.x).toBe(62);
    expect(chrome.actions.x + chrome.actions.width).toBe(874 - 62);
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
    expect(chrome.scrubber.x + chrome.scrubber.width / 2).toBe(683);
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
    expect(chrome.back.x).toBeLessThan(chrome.title!.x);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThan(chrome.actions.x);
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

  test("more actions push the title off-centre instead of overlapping it; Back never moves", () => {
    const chrome = capsules(pose(innerLandscapeNoBar(), { actionCount: 6 }));
    expect(chrome.back.x).toBe(16);
    expect(chrome.actions.x + chrome.actions.width).toBe(817);
    expect(chrome.title).not.toBeNull();
    expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(chrome.actions.x - 10);
    expect(chrome.title!.x).toBeGreaterThanOrEqual(chrome.back.x + 44 + 10);
  });

  test("an active inner camera in the row pushes the actions left of it; Back stays top-leading", () => {
    const result = pose(innerLandscapeNoBar([], [{ id: "camera", x: 677, y: 21, width: 58, height: 37, active: true }]));
    const chrome = capsules(result);
    expect(chrome.back.x).toBe(16);
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
    expect(chrome.actions.x + chrome.actions.width).toBeLessThan(chrome.title!.x);
    expect(chrome.title!.x + chrome.title!.width).toBeLessThan(chrome.back.x);
  });

  test("tablets keep the same row: Back leading, actions trailing", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    const chrome = capsules(pose(tablet, { fallbackInsets: { top: 24, left: 0, bottom: 20, right: 0 } }));
    expect(chrome.back.x).toBe(16);
    expect(chrome.actions.x + chrome.actions.width).toBe(1366 - 16);
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
    expect(capsules(pose(portrait)).back.x).toBe(16);
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

  test("every flat window uses the capsule chrome: phones, the Duo outer display, tablets", () => {
    expect(pose(phoneLandscape).chrome.kind).toBe("capsules");
    expect(pose(phonePortrait).chrome.kind).toBe("capsules");
    expect(pose(outer).chrome.kind).toBe("capsules");
    expect(pose({ width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] }).chrome.kind).toBe("capsules");
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
    expect(chrome.title!.x).toBeGreaterThan(chrome.back.x);
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
    // Reading direction never moves Back: it stays top-leading.
    expect(chrome.back.x).toBe(16);
  });

  test("single page sits in the reading-start half: left for LTR, right for RTL", () => {
    expect(pose(book).stage).toEqual({ x: 0, y: 0, width: 455.5, height: 669 });
    expect(pose(book, { rtl: true }).stage).toEqual({ x: 495.5, y: 0, width: 455.5, height: 669 });
    expect(pose(book).spreadSlots).toBeUndefined();
  });

  test("single page: the page keeps its pane; the controls still snap per pane, never on the fold", () => {
    const ltr = capsules(pose(book, { twoPage: false }));
    expect(ltr.back.x).toBe(16);
    expect(ltr.actions.x).toBeGreaterThanOrEqual(495.5);
    expect(ltr.scrubber.x + ltr.scrubber.width).toBeLessThanOrEqual(455.5);
    const rtl = capsules(pose(book, { twoPage: false, rtl: true }));
    expect(rtl.scrubber.x).toBeGreaterThanOrEqual(495.5);
    expect(rtl.actions.x + rtl.actions.width).toBe(817);
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

  test("filmstrip state", () => {
    const filmstrip = pose(notebook, { notebookPane: "filmstrip" });
    expect(filmstrip.chrome.kind === "console" && filmstrip.chrome.state).toBe("filmstrip");
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
  test("observer insets win over React Native fallbacks and invalid values are ignored", () => {
    const result = pose({ ...outer, safeAreaInsets: { top: Number.NaN, left: -4, bottom: 20, right: 44 } }, { fallbackInsets: { top: 99, left: 99, bottom: 99, right: 99 } });
    expect(result.safeInsets).toEqual({ top: 0, left: 0, bottom: 20, right: 44 });
  });
  test("popover sits between the capsule rows on phones; inside the console in notebook", () => {
    const insets = { top: 62, left: 0, bottom: 34, right: 0 };
    const phone = pose(phonePortrait, { fallbackInsets: insets });
    const chrome = capsules(phone);
    expect(mobileReaderPopoverPlacement(phone.chrome)).toEqual({ frame: chrome.content, bottomGap: READER_POPOVER_GAP });
    expect(chrome.content.y).toBe(chrome.back.y + 44 + 10);
    expect(chrome.content.y + chrome.content.height).toBe(Math.min(chrome.scrubber.y, chrome.actions.y) - 10);
    const notebook = pose(innerPortrait([hinge(0, 465, 669, 21)]));
    expect(notebook.popover).toEqual({ frame: { x: 0, y: 486, width: 669, height: 465 - 20 }, bottomGap: READER_POPOVER_GAP });
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
            // stay off the fold and inside the window. A notebook long strip
            // is the exception: it flows under the fold band (continuous
            // content does not displace).
            if (fold && !result.foldBand) expect(overlaps(page, fold)).toBe(false);
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

  test("inner landscape (open and book, both orientations): Back top-leading, then the title, the actions trailing", () => {
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
            expect(chrome.title!.x + chrome.title!.width).toBeLessThan(chrome.actions.x);
            // Actions at the trailing end, clear of the side safe area.
            expect(chrome.actions.x + chrome.actions.width).toBeLessThanOrEqual(951 - insets.right);
            expect(chrome.actions.x + chrome.actions.width).toBeGreaterThan(951 - insets.right - 200);
            if (posture === "partially-folded") {
              // Book: Back + title in the leading pane, the actions in the trailing pane.
              expect(chrome.title!.x + chrome.title!.width).toBeLessThanOrEqual(455.5);
              expect(chrome.actions.x).toBeGreaterThanOrEqual(495.5);
            }
          }
        }
      }
    }
    // Right-to-left layout mirrors it: Back top-right, the actions on the left.
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
    expect(mirrored.actions.x + mirrored.actions.width).toBeLessThan(mirrored.title!.x);
    expect(mirrored.actions.x).toBe(134);
    const rtlBook = capsules(pose({ ...rtl, divisions: [hinge(455.5, 0, 40, 669)] }, { twoPage: true }));
    expect(rtlBook.back.x).toBeGreaterThanOrEqual(495.5);
    expect(rtlBook.title!.x).toBeGreaterThanOrEqual(495.5);
    expect(rtlBook.actions.x + rtlBook.actions.width).toBeLessThanOrEqual(455.5);
  });

  test("closed: the outer display's camera corner gets the compact capsule chrome, clear of the bar column and camera", () => {
    for (const orientation of ["portrait", "landscape-left", "landscape-right"]) {
      const m = find("iphone-duo-outer", "closed", orientation);
      const layout = duoLayout(m);
      const result = pose(layout);
      expect(result.stage.x).toBe(0);
      const chrome = capsules(result);
      // Compact portrait: Back + title on top, the actions beside the scrubber.
      expect(chrome.actionsRow).toBe(orientation === "portrait" ? "bottom" : "top");
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
      // Capsules in that pane sit left of the status occlusion, not below it.
      const chrome = rtl.chrome;
      if (chrome.kind === "capsules") expect(chrome.actions.y).toBeLessThan(120);
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
    const roomy = capsules(pose(withIsland(170)));
    expect(roomy.back.y).toBeLessThan(54);
    expect(roomy.title!.width).toBeGreaterThanOrEqual(200);
    expect(roomy.title!.x + roomy.title!.width).toBeLessThanOrEqual(466 - 170);
    const tight = capsules(pose(withIsland(240)));
    expect(tight.back.y).toBe(54 + 4);
    expect(tight.title!.width).toBeGreaterThanOrEqual(200);
    for (const chrome of [roomy, tight]) expect(chrome.topScrim.height).toBeGreaterThanOrEqual(chrome.back.y + chrome.back.height);
  });

  test("regular width keeps the actions on the status-bar row", () => {
    expect(capsules(pose(innerLandscapeNoBar())).actionsRow).toBe("top");
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

describe("flat on a foldable: the scrubber centres on the whole display", () => {
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
        expect(Math.abs(chrome.scrubber.x + chrome.scrubber.width / 2 - 951 / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(chrome.title!.x + chrome.title!.width / 2 - 951 / 2)).toBeLessThanOrEqual(1);
      });
    }
  }

  test("the status column's one-sided trailing inset does not pull the scrubber off the display's centre", () => {
    const layout = { ...duo(false), safeAreaInsets: { top: 24, left: 0, bottom: 20, right: 68 } };
    const chrome = capsules(pose(layout, { twoPage: true }));
    expect(Math.abs(chrome.scrubber.x + chrome.scrubber.width / 2 - 951 / 2)).toBeLessThanOrEqual(1);
    expect(chrome.scrubber.x + chrome.scrubber.width).toBeLessThanOrEqual(951 - 68);
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
  test("Japanese Learning takes two slots, other plugins one, plus settings and the bilingual toggle", () => {
    expect(mobileReaderCapsuleActionSlots({ enabledPluginIds: [], bilingualToggle: false })).toBe(1);
    expect(
      mobileReaderCapsuleActionSlots({ enabledPluginIds: ["japanese-learning"], bilingualToggle: false }),
    ).toBe(3);
    expect(
      mobileReaderCapsuleActionSlots({ enabledPluginIds: ["japanese-learning", "other"], bilingualToggle: true }),
    ).toBe(5);
  });

  test("the reader derives the count in the same render as the pose (no one-frame lag)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"), "utf8");
    expect(screen).not.toContain("setReaderActionCount");
    expect(screen).toContain("buildReaderPose(readerActionSlots, twoPageMode)");
    expect(screen).toContain("buildReaderPose(readerBaseActionSlots, twoPageMode)");
  });
});
