import { describe, expect, test } from "bun:test";
import {
  mobileReaderLatchedWindowLayout,
  mobileReaderLayoutInsetLatchKey,
  mobileReaderNextLayoutInsetLatch,
  mobileReaderPoseLayout,
  mobileReaderScrollStableTopInset,
  type MobileReaderLayoutInsetLatch,
  type MobileReaderPoseLayout,
  type MobileReaderPoseLayoutInput,
} from "./mobileReaderPoseLayout";
import { getMobileReaderSpreadSheetFrames } from "./mobileReaderSpreads";
import type { MobileWindowLayout, WindowReservedRegion } from "./mobileWindowLayout";

// Toggling the reader controls shows / hides the status bar. The reading
// area is laid out from the latched safe area, so the pose (stage, slots,
// page side insets) and the page frames are the same in both states.

const island: WindowReservedRegion = { id: "status", x: 817, y: 0, width: 134, height: 82, active: true };
const inactiveFold: WindowReservedRegion = { id: "hinge", x: 455.5, y: 0, width: 40, height: 669, active: false };
const activeFold: WindowReservedRegion = { ...inactiveFold, active: true };

/** Duo inner display, status bar shown: the island, its 82pt top inset and (optionally) its trailing column. */
const duoShown = (divisions: WindowReservedRegion[] = [inactiveFold], rightColumn = 0): MobileWindowLayout => ({
  width: 951, height: 669, supported: true, divisions, occlusions: [island],
  verticalBarEdge: null, layoutDirection: "ltr", hinge: "fullyOpen",
  safeAreaInsets: { top: 82, left: 0, bottom: 34, right: rightColumn },
});
/** The same window with the status bar hidden: no island, no top inset. */
const duoHidden = (divisions: WindowReservedRegion[] = [inactiveFold]): MobileWindowLayout => ({
  ...duoShown(divisions), occlusions: [], safeAreaInsets: { top: 0, left: 0, bottom: 34, right: 0 },
});
/** A notch-less iPhone in portrait: the status bar is a 20pt top inset only while shown. */
const phone = (top: number): MobileWindowLayout => ({
  width: 375, height: 667, supported: true, divisions: [], occlusions: [],
  verticalBarEdge: null, layoutDirection: "ltr", safeAreaInsets: { top, left: 0, bottom: 0, right: 0 },
});

/** Feed samples to the latch in order, as the reader does on every observer event. */
function latchThrough(samples: MobileWindowLayout[]): Array<{ sample: MobileWindowLayout; latch: MobileReaderLayoutInsetLatch }> {
  let latch: MobileReaderLayoutInsetLatch | null = null;
  return samples.map((sample) => {
    latch = mobileReaderNextLayoutInsetLatch(latch, mobileReaderLayoutInsetLatchKey(sample), sample.safeAreaInsets, sample.occlusions);
    return { sample, latch };
  });
}

const zero = { top: 0, left: 0, bottom: 0, right: 0 };

function poseFor(sample: MobileWindowLayout, latch: MobileReaderLayoutInsetLatch, input: Partial<MobileReaderPoseLayoutInput>) {
  const full: MobileReaderPoseLayoutInput = {
    layout: mobileReaderLatchedWindowLayout(sample, latch),
    fallbackInsets: latch.insets,
    paged: input.paged ?? true,
    pageCount: 12,
    twoPage: false,
    spreadMode: "single",
    rtl: false,
    actionCount: 3,
  };
  return mobileReaderPoseLayout({ ...full, ...input, paged: full.paged });
}

/** Window rects of the page images, as the reader fits them (`getReaderImageFrameSize` + the gallery's slots). */
function pageRects(pose: MobileReaderPoseLayout, page = { width: 1132, height: 1600 }) {
  const width = pose.stage.width - (pose.constrained ? 0 : pose.pageSideInsets.left + pose.pageSideInsets.right);
  if (pose.spread) {
    const half = { width: width / 2, height: pose.stage.height };
    const slots = pose.spreadSlots && pose.spreadSlots.length === 2
      ? [pose.spreadSlots[0]!, pose.spreadSlots[1]!]
      : [{ x: 0, y: 0, ...half }, { x: pose.stage.width / 2, y: 0, ...half }];
    const frames = getMobileReaderSpreadSheetFrames({ slots: [slots[0]!, slots[1]!], sizes: [page, page] });
    return slots.map((slot, index) => {
      const frame = frames[index]!;
      const x = index === 0 ? slot.x + slot.width - frame.width : slot.x;
      return { x: pose.stage.x + x, y: pose.stage.y + slot.y + (slot.height - frame.height) / 2, ...frame };
    });
  }
  const scale = Math.min(width / page.width, pose.stage.height / page.height);
  const frame = { width: page.width * scale, height: page.height * scale };
  return [{
    x: pose.stage.x + (pose.stage.width - frame.width) / 2,
    y: pose.stage.y + (pose.stage.height - frame.height) / 2,
    ...frame,
  }];
}

function expectRectsWithin(a: ReturnType<typeof pageRects>, b: ReturnType<typeof pageRects>, tolerance = 1) {
  expect(a.length).toBe(b.length);
  a.forEach((rect, index) => {
    const other = b[index]!;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(rect[key] - other[key])).toBeLessThanOrEqual(tolerance);
    }
  });
}

const readingModes: Array<[string, Partial<MobileReaderPoseLayoutInput>]> = [
  ["paged, one page", { paged: true, twoPage: false, spreadMode: "single" }],
  ["paged, two pages", { paged: true, twoPage: true, spreadMode: "double" }],
  ["scroll", { paged: false, twoPage: false, spreadMode: "single" }],
];

describe("reader layout: the controls never move the page (latched safe area)", () => {
  const cases: Array<[string, MobileWindowLayout[]]> = [
    ["Duo status island, shown then hidden", [duoShown(), duoHidden(), duoShown(), duoHidden()]],
    ["Duo status island, opened hidden", [duoHidden(), duoShown(), duoHidden(), duoShown()]],
    ["Duo status island with its trailing column", [duoShown([inactiveFold], 134), duoHidden(), duoShown([inactiveFold], 134)]],
    [
      "Duo status island: inset and island in separate samples",
      [duoShown(), { ...duoShown(), occlusions: [] }, duoHidden(), { ...duoHidden(), occlusions: [island] }, duoShown()],
    ],
    ["notch-less iPhone (20pt status bar)", [phone(20), phone(0), phone(20), phone(0)]],
  ];
  for (const [label, samples] of cases) {
    for (const [mode, input] of readingModes) {
      test(`${label} — ${mode}`, () => {
        const latched = latchThrough(samples);
        // Once the status bar has been seen both ways, every later sample lays out the same.
        const settled = latched.slice(2);
        const reference = poseFor(settled[0]!.sample, settled[0]!.latch, input);
        for (const { sample, latch } of settled) {
          const pose = poseFor(sample, latch, input);
          expect(pose.stage).toEqual(reference.stage);
          expect(pose.constrained).toBe(reference.constrained);
          expect(pose.spread).toBe(reference.spread);
          expect(pose.spreadSlots).toEqual(reference.spreadSlots);
          expect(pose.pageSideInsets).toEqual(reference.pageSideInsets);
          expect(pose.safeInsets).toEqual(reference.safeInsets);
          // The chrome too: it fades out where it was shown.
          expect(pose).toEqual(reference);
          if (input.paged) expectRectsWithin(pageRects(pose), pageRects(reference));
          // Scroll mode pads its list by the stable top: the same in both states.
          const top = (l: MobileWindowLayout) => mobileReaderScrollStableTopInset({
            reader: mobileReaderLatchedWindowLayout(l, latch),
            app: null,
            window: { width: l.width, height: l.height },
            insets: latch.insets,
          });
          expect(top(sample)).toBe(top(settled[0]!.sample));
        }
      });
    }
  }

  test("Duo: the page keeps the full width with the island's trailing column shown and hidden", () => {
    const [shown, hidden] = latchThrough([duoShown([inactiveFold], 134), duoHidden()]);
    const shownPose = poseFor(shown!.sample, shown!.latch, {});
    const hiddenPose = poseFor(hidden!.sample, hidden!.latch, {});
    // The column is explained by the island: no side inset in either state.
    expect(shownPose.pageSideInsets).toEqual({ left: 0, right: 0 });
    expect(hiddenPose.pageSideInsets).toEqual({ left: 0, right: 0 });
    expectRectsWithin(pageRects(shownPose), pageRects(hiddenPose), 0);
    // The island still shares the capsule row in both states.
    expect(mobileReaderScrollStableTopInset({ reader: mobileReaderLatchedWindowLayout(hidden!.sample, hidden!.latch), app: null, window: { width: 951, height: 669 }, insets: zero })).toBe(0);
  });

  test("Duo half folded (book), paged and scroll: identical with the status bar shown and hidden", () => {
    for (const [, input] of readingModes) {
      const [shown, hidden] = latchThrough([duoShown([activeFold]), duoHidden([activeFold])]);
      const a = poseFor(shown!.sample, shown!.latch, { ...input, scrollSidePane: true });
      const b = poseFor(hidden!.sample, hidden!.latch, { ...input, scrollSidePane: true });
      expect(a.posture).toBe("book");
      expect(b).toEqual(a);
    }
  });
});

describe("layout inset latch", () => {
  test("keeps the widest inset per edge and every occlusion seen in one configuration", () => {
    const [, hidden] = latchThrough([duoShown([inactiveFold], 134), duoHidden()]);
    expect(hidden!.latch.insets).toEqual({ top: 82, left: 0, bottom: 34, right: 134 });
    expect(hidden!.latch.occlusions).toEqual([island]);
    const latchedLayout = mobileReaderLatchedWindowLayout(hidden!.sample, hidden!.latch);
    expect(latchedLayout.safeAreaInsets).toEqual({ top: 82, left: 0, bottom: 34, right: 134 });
    expect(latchedLayout.occlusions).toEqual([island]);
  });

  test("returns the same latch when nothing grew (no re-render churn)", () => {
    const [first, second] = latchThrough([duoShown(), duoHidden()]);
    expect(second!.latch).toBe(first!.latch);
  });

  test("the same display flat and half folded is one configuration; a new size or bar edge starts over", () => {
    const flat = mobileReaderLayoutInsetLatchKey(duoShown([inactiveFold]));
    expect(mobileReaderLayoutInsetLatchKey(duoShown([activeFold]))).toBe(flat);
    expect(mobileReaderLayoutInsetLatchKey({ ...duoShown(), width: 669, height: 951 })).not.toBe(flat);
    expect(mobileReaderLayoutInsetLatchKey({ ...duoShown(), verticalBarEdge: "trailing" })).not.toBe(flat);
    const [, rotated] = latchThrough([duoShown(), { ...duoHidden(), width: 669, height: 951 }]);
    expect(rotated!.latch.insets.top).toBe(0);
    expect(rotated!.latch.occlusions).toEqual([]);
  });

  test("a bar column that moves to the other side is not merged with the old one", () => {
    const outer = (left: number, right: number): MobileWindowLayout => ({
      width: 400, height: 900, supported: true, divisions: [], occlusions: [], verticalBarEdge: "trailing",
      safeAreaInsets: { top: 24, left, bottom: 20, right },
    });
    const [, moved] = latchThrough([outer(0, 84), outer(84, 0)]);
    expect(moved!.latch.insets).toEqual({ top: 24, left: 84, bottom: 20, right: 0 });
  });
});
