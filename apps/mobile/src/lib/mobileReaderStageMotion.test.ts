import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_CHROME_ARRANGEMENT_SLIDE,
  mobileReaderApplyFlip,
  mobileReaderChromeArrangementKey,
  mobileReaderChromeArrangementMotion,
  mobileReaderChromeGeometryKey,
  mobileReaderChromeGlide,
  mobileReaderContainBox,
  mobileReaderGalleryRelayout,
  mobileReaderGalleryRemountMotion,
  mobileReaderPageFrameFlip,
  mobileReaderPoseVeilCaps,
  mobilePoseVeilPlanWithCaps,
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
  test("capsules settle the last 8pt down onto their row when they replace the console", () => {
    expect(mobileReaderChromeArrangementMotion({ from: { kind: "console" }, to: capsules, reduceMotion: false }))
      .toEqual({ dx: 0, dy: -MOBILE_READER_CHROME_ARRANGEMENT_SLIDE, unfold: false, durationMs: 220 });
  });
  test("the console unfolds", () => {
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: { kind: "console" }, reduceMotion: false })?.unfold).toBe(true);
  });
  test("no motion for the first show or an unchanged arrangement; Reduce Motion fades only", () => {
    expect(mobileReaderChromeArrangementMotion({ from: null, to: capsules, reduceMotion: false })).toBeNull();
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: capsules, reduceMotion: false })).toBeNull();
    expect(mobileReaderChromeArrangementMotion({ from: capsules, to: { kind: "console" }, reduceMotion: true }))
      .toEqual({ dx: 0, dy: 0, unfold: false, durationMs: 150 });
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
  const pose = mobileReaderPoseLayout({ layout, fallbackInsets: book.insets, paged: true, pageCount: 20, twoPage: true, rtl: false });

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

describe("pose-change continuity (flat ⇄ book spreads, chrome, rotation)", () => {
  const spread = (pages: string) => snapshot({
    stage: { x: 0, y: 0, width: 951, height: 669 },
    presentation: "spread:manga",
    spread: true,
    pages,
  });

  test("flat ⇄ book with a spread keeps the stage (the window) but moves the halves: slots and page frames glide", () => {
    const flat = spread(JSON.stringify([null, 475.5, 669]));
    const book = spread(JSON.stringify([[{ x: 0, y: 0, width: 455.5, height: 669 }, { x: 495.5, y: 0, width: 455.5, height: 669 }], 455.5, 669]));
    expect(mobileReaderStageMotion(flat, book, { reduceMotion: false })).toEqual({ kind: "glide", flip: "translate" });
    expect(mobileReaderStageMotion(book, flat, { reduceMotion: false })).toEqual({ kind: "glide", flip: "translate" });
    // Reduce Motion: no movement.
    expect(mobileReaderStageMotion(flat, book, { reduceMotion: true }).kind).toBe("fade");
  });

  test("the same page geometry at the same stage does nothing (chrome toggles never move the page)", () => {
    const flat = spread(JSON.stringify([null, 475.5, 669]));
    expect(mobileReaderStageMotion(flat, spread(JSON.stringify([null, 475.5, 669])), { reduceMotion: false }).kind).toBe("none");
  });

  test("page frame FLIP draws the new box where the old one was, centre on centre", () => {
    const from = { x: 20, y: 0, width: 471, height: 669 };
    const to = { x: 0, y: 11, width: 455.5, height: 647 };
    const flip = mobileReaderPageFrameFlip(from, to);
    expect(flip.scale).toBeCloseTo(471 / 455.5, 5);
    const centre = mobileReaderApplyFlip({ x: to.x + to.width / 2, y: to.y + to.height / 2 }, to, flip);
    expect(centre.x).toBeCloseTo(from.x + from.width / 2, 5);
    expect(centre.y).toBeCloseTo(from.y + from.height / 2, 5);
    const corner = mobileReaderApplyFlip({ x: to.x, y: to.y }, to, flip);
    expect(corner.x).toBeCloseTo(from.x, 3);
    expect(mobileReaderPageFrameFlip(to, to)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
    expect(mobileReaderPageFrameFlip({ x: 0, y: 0, width: 0, height: 0 }, to)).toEqual({ translateX: 0, translateY: 0, scale: 1 });
  });

  test("a remount after a window resize never cross-fades (the old list is laid out for the old window)", () => {
    const base = { mountKey: "ch:spread", contentKey: "ch", windowKey: "951x669" };
    expect(mobileReaderGalleryRemountMotion({ previous: base, next: { ...base, mountKey: "ch:single" }, reduceMotion: false }).crossfade).toBe(true);
    expect(mobileReaderGalleryRemountMotion({
      previous: base,
      next: { mountKey: "ch:single", contentKey: "ch", windowKey: "669x951" },
      reduceMotion: false,
    })).toEqual({ crossfade: false, durationMs: 0 });
  });

  test("capsules that move per pane glide as the same elements: no remount, no fade", () => {
    const flatRow = { kind: "capsules" as const, geometry: mobileReaderChromeGeometryKey([{ x: 16, y: 26, width: 44, height: 44 }, null]) };
    const bookRow = { kind: "capsules" as const, geometry: mobileReaderChromeGeometryKey([{ x: 16, y: 26, width: 44, height: 44 }, { x: 70, y: 26, width: 300, height: 44 }]) };
    expect(mobileReaderChromeGlide({ from: flatRow, to: bookRow, reduceMotion: false })).toBe(true);
    expect(mobileReaderChromeGlide({ from: bookRow, to: flatRow, reduceMotion: false })).toBe(true);
    // The layer keeps its identity (no fade out in one pane and in at the other).
    expect(mobileReaderChromeArrangementKey(flatRow)).toBe(mobileReaderChromeArrangementKey(bookRow));
    expect(mobileReaderChromeArrangementMotion({ from: flatRow, to: bookRow, reduceMotion: false })).toBeNull();
    // Unchanged, first show, another arrangement kind, or Reduce Motion: no glide.
    expect(mobileReaderChromeGlide({ from: flatRow, to: flatRow, reduceMotion: false })).toBe(false);
    expect(mobileReaderChromeGlide({ from: null, to: bookRow, reduceMotion: false })).toBe(false);
    expect(mobileReaderChromeGlide({ from: { kind: "console" }, to: bookRow, reduceMotion: false })).toBe(false);
    expect(mobileReaderChromeGlide({ from: flatRow, to: bookRow, reduceMotion: true })).toBe(false);
    expect(mobileReaderChromeGeometryKey([{ x: 16.2, y: 25.8, width: 44, height: 44 }])).toBe("16,26,44,44");
  });

  test("the reader's pose veil is a light frost on iOS and nothing on Android (never a near-opaque black wash)", () => {
    const plan = { blurIntensity: 36, tintOpacity: 0.86, fadeInMs: 0, holdMs: 120, fadeOutMs: 260 };
    const ios = mobilePoseVeilPlanWithCaps(plan, mobileReaderPoseVeilCaps("ios"));
    expect(ios.tintOpacity).toBeLessThanOrEqual(0.3);
    expect(ios.blurIntensity).toBeLessThanOrEqual(24);
    expect(ios.fadeOutMs).toBe(260);
    const android = mobilePoseVeilPlanWithCaps(plan, mobileReaderPoseVeilCaps("android"));
    expect(android.tintOpacity).toBe(0);
    expect(android.blurIntensity).toBe(0);
    // Other surfaces keep the app-wide plan.
    expect(mobilePoseVeilPlanWithCaps(plan, null)).toBe(plan);
    expect(mobilePoseVeilPlanWithCaps(plan, { maxTintOpacity: 0.9 }).tintOpacity).toBe(0.86);
  });
});
