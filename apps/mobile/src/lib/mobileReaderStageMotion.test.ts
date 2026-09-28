import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_CHROME_ARRANGEMENT_SLIDE,
  MOBILE_READER_DOCK_SLIDE,
  mobileReaderApplyFlip,
  mobileReaderChromeArrangementMotion,
  mobileReaderContainBox,
  mobileReaderDockMotion,
  mobileReaderGalleryRelayout,
  mobileReaderGalleryRemountMotion,
  mobileReaderStageFlipTransform,
  mobileReaderStageHorizontalInsets,
  mobileReaderStageMotion,
  mobileReaderStripRelayoutOffset,
  type MobileReaderStageSnapshot,
} from "./mobileReaderStageMotion";
import { mobileReaderPoseLayout } from "./mobileReaderPoseLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";

const snapshot = (overrides: Partial<MobileReaderStageSnapshot> = {}): MobileReaderStageSnapshot => ({
  bounds: { width: 951, height: 669 },
  stage: { x: 0, y: 0, width: 867, height: 669 },
  presentation: "single",
  spread: false,
  contentKey: "ch1",
  ...overrides,
});

describe("stage motion decision", () => {
  test("first layout and a new chapter never animate", () => {
    expect(mobileReaderStageMotion(null, snapshot(), { reduceMotion: false }).kind).toBe("none");
    expect(mobileReaderStageMotion(snapshot(), snapshot({ contentKey: "ch2", stage: { x: 0, y: 0, width: 455, height: 669 } }), { reduceMotion: false }).kind).toBe("none");
  });

  test("a window resize jumps under the pose veil", () => {
    expect(mobileReaderStageMotion(snapshot(), snapshot({ bounds: { width: 466, height: 678 } }), { reduceMotion: false }).kind).toBe("jump");
  });

  test("fold / dock at the same window size glides the page; a spread only translates (its halves slide)", () => {
    const folded = snapshot({ stage: { x: 0, y: 0, width: 455.5, height: 669 } });
    expect(mobileReaderStageMotion(snapshot(), folded, { reduceMotion: false })).toEqual({ kind: "glide", flip: "page" });
    const spreadA = snapshot({ presentation: "spread:manga", spread: true });
    const spreadB = snapshot({ presentation: "spread:manga", spread: true, stage: { x: 0, y: 0, width: 951, height: 669 } });
    expect(mobileReaderStageMotion(spreadA, spreadB, { reduceMotion: false })).toEqual({ kind: "glide", flip: "translate" });
  });

  test("spread ⇄ single cross-fades; Reduce Motion fades only", () => {
    const single = snapshot({ stage: { x: 0, y: 0, width: 455.5, height: 669 } });
    const spread = snapshot({ presentation: "spread:manga", stage: { x: 0, y: 0, width: 951, height: 669 } });
    expect(mobileReaderStageMotion(spread, single, { reduceMotion: false })).toEqual({ kind: "crossfade", durationMs: 200 });
    expect(mobileReaderStageMotion(spread, single, { reduceMotion: true })).toEqual({ kind: "crossfade", durationMs: 150 });
    expect(mobileReaderStageMotion(snapshot(), single, { reduceMotion: true })).toEqual({ kind: "fade", durationMs: 150 });
  });

  test("an unchanged stage does nothing", () => {
    expect(mobileReaderStageMotion(snapshot(), snapshot(), { reduceMotion: false }).kind).toBe("none");
  });
});

describe("stage FLIP transform", () => {
  const flat = { x: 0, y: 0, width: 867, height: 669 };
  const pane = { x: 0, y: 0, width: 455.5, height: 669 };

  test("contain box fits by height in a wide stage and by width in a narrow one", () => {
    const wide = mobileReaderContainBox(flat, 0.7);
    expect(wide.width).toBeCloseTo(468.3, 5);
    expect(wide.height).toBe(669);
    expect(wide.x).toBeCloseTo((867 - 468.3) / 2, 5);
    const narrow = mobileReaderContainBox(pane, 0.7);
    expect(narrow.width).toBe(455.5);
    expect(narrow.height).toBeCloseTo(650.71, 1);
  });

  test("the new page box maps exactly onto the old one at the start of the glide", () => {
    for (const aspect of [0.7, 1.4, null]) {
      const flip = mobileReaderStageFlipTransform({ from: flat, to: pane, aspect, mode: "page" });
      const toBox = mobileReaderContainBox(pane, aspect);
      const fromBox = mobileReaderContainBox(flat, aspect);
      const topLeft = mobileReaderApplyFlip({ x: toBox.x, y: toBox.y }, pane, flip);
      const bottomRight = mobileReaderApplyFlip({ x: toBox.x + toBox.width, y: toBox.y + toBox.height }, pane, flip);
      if (aspect) {
        expect(topLeft.x).toBeCloseTo(fromBox.x, 3);
        expect(topLeft.y).toBeCloseTo(fromBox.y, 3);
        expect(bottomRight.x).toBeCloseTo(fromBox.x + fromBox.width, 3);
        expect(bottomRight.y).toBeCloseTo(fromBox.y + fromBox.height, 3);
      } else {
        // Unknown page size: centres line up, uniform scale (never stretched).
        expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(flat.x + flat.width / 2, 3);
      }
    }
  });

  test("translate mode only undoes the stage origin shift", () => {
    expect(mobileReaderStageFlipTransform({ from: { x: 84, y: 0, width: 867, height: 669 }, to: { x: 0, y: 0, width: 951, height: 669 }, aspect: 0.7, mode: "translate" }))
      .toEqual({ translateX: 84, translateY: 0, scale: 1 });
  });

  test("degenerate rects and extreme scales are clamped", () => {
    expect(mobileReaderStageFlipTransform({ from: flat, to: { x: 0, y: 0, width: 0, height: 0 }, aspect: 0.7, mode: "page" }))
      .toEqual({ translateX: 0, translateY: 0, scale: 1 });
    const extreme = mobileReaderStageFlipTransform({ from: { x: 0, y: 0, width: 4000, height: 4000 }, to: { x: 0, y: 0, width: 100, height: 100 }, aspect: 1, mode: "page" });
    expect(extreme.scale).toBe(2.5);
  });
});

describe("gallery continuity", () => {
  const geometry = { mountKey: "k", paged: true, extent: 867, viewport: 669 };
  test("same mount key + new extent re-offsets; a new key or presentation is a remount", () => {
    expect(mobileReaderGalleryRelayout(null, geometry)).toBe("none");
    expect(mobileReaderGalleryRelayout(geometry, { ...geometry, extent: 951 })).toBe("reoffset");
    expect(mobileReaderGalleryRelayout(geometry, { ...geometry, viewport: 400 })).toBe("reoffset");
    expect(mobileReaderGalleryRelayout(geometry, { ...geometry, mountKey: "k2", extent: 951 })).toBe("none");
    expect(mobileReaderGalleryRelayout(geometry, { ...geometry, paged: false })).toBe("none");
    expect(mobileReaderGalleryRelayout(geometry, { ...geometry })).toBe("none");
  });

  test("long strip keeps its reading progress when the column narrows", () => {
    const result = mobileReaderStripRelayoutOffset({
      contentOffset: 5000,
      contentLength: 20_669,
      viewportLength: 669,
      nextViewportLength: 669,
      widthRatio: 0.5,
      fixedLength: 169,
    });
    expect(result.progress).toBeCloseTo(0.25, 5);
    const predicted = 169 + (20_669 - 169) * 0.5;
    expect(result.offset).toBe(Math.round(0.25 * (predicted - 669)));
  });

  test("a strip that does not scroll stays at the top", () => {
    expect(mobileReaderStripRelayoutOffset({ contentOffset: 0, contentLength: 500, viewportLength: 669, nextViewportLength: 669, widthRatio: 2, fixedLength: 0 }))
      .toEqual({ progress: 0, offset: Math.round(0) });
  });

  test("remount cross-fade only for a presentation change of the same content", () => {
    const base = { mountKey: "ch:1:rtl:single", contentKey: "ch:1:rtl" };
    expect(mobileReaderGalleryRemountMotion({ previous: base, next: { ...base, mountKey: "ch:1:rtl:manga" }, reduceMotion: false }))
      .toEqual({ crossfade: true, durationMs: 200 });
    expect(mobileReaderGalleryRemountMotion({ previous: base, next: { mountKey: "ch2", contentKey: "ch2" }, reduceMotion: false }).crossfade).toBe(false);
    expect(mobileReaderGalleryRemountMotion({ previous: { mountKey: "loading", contentKey: "x" }, next: { mountKey: "a", contentKey: "x" }, reduceMotion: false }).crossfade).toBe(false);
    expect(mobileReaderGalleryRemountMotion({ previous: null, next: base, reduceMotion: false }).crossfade).toBe(false);
    expect(mobileReaderGalleryRemountMotion({ previous: base, next: { ...base, mountKey: "x" }, reduceMotion: true }).durationMs).toBe(150);
  });
});

describe("chrome arrangement motion", () => {
  const capsules = { kind: "capsules" as const };
  const horizontal = { kind: "horizontal" as const };
  test("capsules settle the last 8pt down onto their row; bars fade in place", () => {
    expect(mobileReaderChromeArrangementMotion({ from: horizontal, to: capsules, reduceMotion: false }))
      .toEqual({ dx: 0, dy: -MOBILE_READER_CHROME_ARRANGEMENT_SLIDE, unfold: false, durationMs: 220 });
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: horizontal, reduceMotion: false })?.dy).toBe(0);
  });
  test("the console unfolds", () => {
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: { kind: "console" }, reduceMotion: false })?.unfold).toBe(true);
  });
  test("no motion for the first show or an unchanged arrangement; Reduce Motion fades only", () => {
    expect(mobileReaderChromeArrangementMotion({ from: null, to: horizontal, reduceMotion: false })).toBeNull();
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: capsules, reduceMotion: false })).toBeNull();
    expect(mobileReaderChromeArrangementMotion({ from: horizontal, to: { kind: "console" }, reduceMotion: true }))
      .toEqual({ dx: 0, dy: 0, unfold: false, durationMs: 150 });
  });
});

describe("dock motion", () => {
  const bounds = { x: 0, y: 0, width: 951, height: 669 };
  test("side / pane docks slide in from their window edge, the console dock rises", () => {
    expect(mobileReaderDockMotion({ region: "side", frame: { x: 500, y: 0, width: 360, height: 600 }, bounds, reduceMotion: false }).dx).toBe(MOBILE_READER_DOCK_SLIDE);
    expect(mobileReaderDockMotion({ region: "pane", frame: { x: 8, y: 8, width: 440, height: 600 }, bounds, reduceMotion: false }).dx).toBe(-MOBILE_READER_DOCK_SLIDE);
    expect(mobileReaderDockMotion({ region: "console", frame: { x: 8, y: 560, width: 650, height: 300 }, bounds, reduceMotion: false })).toEqual({ dx: 0, dy: 24 });
    expect(mobileReaderDockMotion({ region: "side", frame: { x: 500, y: 0, width: 360, height: 600 }, bounds, reduceMotion: true })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("reader cards on the measured Duo book pose", () => {
  const book = fixture.measurements.find((m) => m.screen === "iphone-duo-inner" && m.pose === "partially-folded" && m.orientation === "landscape-left")!;
  const layout: MobileWindowLayout = {
    width: book.bounds.width,
    height: book.bounds.height,
    supported: true,
    divisions: book.regions.filter((r) => r.kind === "division").map((r, i) => ({ id: `d${i}`, active: r.active, ...r.frame })),
    occlusions: book.regions.filter((r) => r.kind === "occlusion").map((r, i) => ({ id: `o${i}`, active: r.active, ...r.frame })),
    verticalBarEdge: "trailing",
    layoutDirection: "ltr",
    safeAreaInsets: book.insets,
  };
  const pose = mobileReaderPoseLayout({ layout, fallbackInsets: book.insets, paged: true, pageCount: 20, twoPage: true, rtl: false, learningOpen: false });

  test("the locked / error card centres in the reading-start pane, not across the fold", () => {
    const insets = mobileReaderStageHorizontalInsets(pose.modalFrame, pose.stage);
    expect(insets).not.toBeNull();
    expect(insets!.left).toBe(0);
    expect(insets!.right).toBeCloseTo(951 - 455.5, 1);
  });

  test("a card frame that is the whole stage, or another pane, adds nothing", () => {
    const stage = { x: 0, y: 0, width: 402, height: 874 };
    expect(mobileReaderStageHorizontalInsets(stage, stage)).toBeNull();
    expect(mobileReaderStageHorizontalInsets({ x: 0, y: 500, width: 669, height: 400 }, { x: 0, y: 82, width: 669, height: 373 })).toBeNull();
  });
});
