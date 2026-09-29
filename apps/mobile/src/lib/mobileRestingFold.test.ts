import { beforeEach, describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import { getMobileEmptyLibraryAdaptiveLayout } from "./mobileEmptyLibraryLayout";
import { mobileFoldAwareGridLayout, mobileFoldPagerLayout, mobilePaneContentRegion } from "./mobileFoldAwareGrid";
import {
  MOBILE_IOS_FOLD_GUTTER,
  mobileRestingFoldAdaptive,
  mobileRestingFoldMinGutter,
  mobileRestingFoldSplitForContainer,
  noteMobileActiveFold,
  resetMobileRestingFoldMemory,
} from "./mobileRestingFold";
import type { MobileWindowLayout } from "./mobileWindowLayout";

type Measurement = (typeof fixture.measurements)[number];

function toLayout(m: Measurement): MobileWindowLayout {
  const regions = m.regions.map((r, index) => ({ id: `${r.kind}-${index}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
  };
}

function measured(pose: string, orientation: string) {
  const m = fixture.measurements.find((x) => x.screen === "iphone-duo-inner" && x.pose === pose && x.orientation === orientation);
  if (!m) throw new Error(`missing fixture ${pose} ${orientation}`);
  return toLayout(m);
}

// The Library page content box on the inner landscape display: full width
// minus the trailing 84pt bar column, below the header.
const LANDSCAPE_CONTAINER = { x: 0, y: 94, width: 867, height: 541 };
const PORTRAIT_CONTAINER = { x: 16, y: 138, width: 637, height: 700 };

beforeEach(() => resetMobileRestingFoldMemory());

describe("mobileRestingFoldSplitForContainer (measured iPhone Duo)", () => {
  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`fully open ${orientation}: the inactive division yields the book split`, () => {
      const book = mobileFoldSplitForContainer(mobileAdaptiveLayout(measured("partially-folded", orientation)), LANDSCAPE_CONTAINER);
      const flat = measured("open", orientation);
      expect(mobileAdaptiveLayout(flat).posture).toBe("flat");
      const resting = mobileRestingFoldSplitForContainer(flat, LANDSCAPE_CONTAINER);
      expect(resting).toEqual(book);
      expect(resting?.gutter).toEqual({ start: 455.5, end: 495.5 });
    });
  }

  test("an active fold is not a resting fold", () => {
    expect(mobileRestingFoldSplitForContainer(measured("partially-folded", "landscape-left"), LANDSCAPE_CONTAINER)).toBeNull();
  });

  test("the outer display reports no division at all", () => {
    const outer = fixture.measurements.find((x) => x.screen === "iphone-duo-outer")!;
    expect(mobileRestingFoldSplitForContainer(toLayout(outer), { x: 0, y: 0, width: 382, height: 600 })).toBeNull();
  });

  test("a flat Android hinge (zero-width, inactive) gets the same widened gutter as when folded", () => {
    const hinge = { id: "fold-0", x: 420.5, y: 0, width: 0, height: 701 };
    const flat: MobileWindowLayout = { width: 841, height: 701, supported: true, divisions: [{ ...hinge, active: false }], occlusions: [] };
    const folded: MobileWindowLayout = { ...flat, divisions: [{ ...hinge, active: true }] };
    const container = { x: 0, y: 100, width: 841, height: 520 };
    expect(mobileRestingFoldSplitForContainer(flat, container)).toEqual(
      mobileFoldSplitForContainer(mobileAdaptiveLayout(folded), container),
    );
  });
});

describe("resting gutter never depends on the inactive region's width", () => {
  const container = { x: 0, y: 94, width: 867, height: 541 };
  const flatWith = (width: number): MobileWindowLayout => ({
    width: 951,
    height: 669,
    supported: true,
    divisions: [{ id: "division-0", active: false, x: 475.5 - width / 2, y: 0, width, height: 669 }],
    occlusions: [],
  });

  test("an iOS zero-width inactive division (Apple: zero when flat) still gets the 40pt Duo gutter", () => {
    const book = mobileFoldSplitForContainer(mobileAdaptiveLayout(measured("partially-folded", "landscape-left")), container);
    for (const width of [0, 12, 40]) {
      expect(mobileRestingFoldSplitForContainer(flatWith(width), container, 120, mobileRestingFoldMinGutter("ios"))).toEqual(book);
    }
    expect(mobileRestingFoldMinGutter("ios")).toBe(MOBILE_IOS_FOLD_GUTTER);
    expect(mobileRestingFoldMinGutter("android")).toBe(20);
  });

  test("the active fold seen at this window size wins over the platform default", () => {
    const folded: MobileWindowLayout = {
      ...flatWith(0),
      divisions: [{ id: "division-0", active: true, x: 453.5, y: 0, width: 44, height: 669 }],
    };
    noteMobileActiveFold(folded);
    expect(mobileRestingFoldSplitForContainer(flatWith(0), container, 120, 40)?.gutter).toEqual({ start: 453.5, end: 497.5 });
    expect(mobileRestingFoldSplitForContainer(flatWith(0), container, 120, 40)).toEqual(
      mobileFoldSplitForContainer(mobileAdaptiveLayout(folded), container),
    );
    // Another window size (rotated, Split View) does not reuse it.
    const other = { ...flatWith(0), width: 900 };
    const otherGutter = mobileRestingFoldSplitForContainer(other, { ...container, width: 800 }, 120, 40)!.gutter;
    expect(otherGutter.end - otherGutter.start).toBe(40);
  });

  test("a notebook-axis (horizontal) resting division is not a book split", () => {
    expect(mobileRestingFoldAdaptive(measured("open", "portrait"))).toBeNull();
  });

  test("the resting adaptive layout is the book posture's", () => {
    const resting = mobileRestingFoldAdaptive(measured("open", "landscape-left"), 40)!;
    const book = mobileAdaptiveLayout(measured("partially-folded", "landscape-left"));
    expect(resting.posture).toBe("book");
    expect(resting.fold).toEqual(book.fold);
    expect(resting.panels).toEqual(book.panels);
  });
});

describe("empty-state hero: unfolding releases the fold gutter", () => {
  function heroFor(layout: MobileWindowLayout, container: typeof LANDSCAPE_CONTAINER) {
    const adaptive = mobileAdaptiveLayout(layout);
    const fold = mobileFoldSplitForContainer(adaptive, container);
    return getMobileEmptyLibraryAdaptiveLayout({
      width: container.width,
      height: container.height,
      bleedWidth: container.width,
      fold: fold ? { axis: fold.axis, gutter: fold.gutter } : null,
    });
  }

  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`book ⇄ fully open (${orientation}) restore the ordinary pane gap`, () => {
      const book = heroFor(measured("partially-folded", orientation), LANDSCAPE_CONTAINER);
      const flat = heroFor(measured("open", orientation), LANDSCAPE_CONTAINER);
      expect(book.arrangement).toBe("row");
      expect(flat).not.toEqual(book);
      expect(flat).toMatchObject({ artPane: { x: 0, width: 422 }, copyPane: { x: 446 } });
    });
  }

  test("without the reported division a wide flat box keeps its even split", () => {
    const flat = getMobileEmptyLibraryAdaptiveLayout({ width: 867, height: 541 });
    expect(flat).toMatchObject({ arrangement: "row", artPane: { x: 0, width: 422 }, copyPane: { x: 446 } });
  });

  test("fully open portrait keeps the phone stack (the notebook column would shrink the art)", () => {
    const flat = heroFor(measured("open", "portrait"), PORTRAIT_CONTAINER);
    const notebook = heroFor(measured("partially-folded", "portrait"), PORTRAIT_CONTAINER);
    expect(flat.arrangement).toBe("stack");
    expect(notebook.arrangement).toBe("column");
    expect(flat.portraitMaxWidth).toBeGreaterThan(notebook.portraitMaxWidth);
  });
});

describe("browsing surfaces: unfolding uses the full container", () => {
  // Library grid content box: the container minus 16pt page gutters.
  const container = { x: 0, y: 94, width: 867, height: 541 };
  function surfaces(layout: MobileWindowLayout) {
    const adaptive = mobileAdaptiveLayout(layout);
    const aligned = adaptive;
    const split = mobileFoldSplitForContainer(aligned, container);
    const fold = split?.axis === "horizontal" ? { start: split.gutter.start - 16, end: split.gutter.end - 16 } : null;
    return {
      grid: mobileFoldAwareGridLayout({ contentWidth: 867 - 32, minItemWidth: 104, gap: 12, preferEven: true, fold }),
      pager: mobileFoldPagerLayout({ containerWidth: 867, margin: 8, fold: split ? split.gutter : null }),
      placeholder: mobilePaneContentRegion({ container, posture: aligned.posture, fold: aligned.fold, windowHeight: 669 }),
    };
  }
  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`book ⇄ fully open (${orientation})`, () => {
      const book = surfaces(measured("partially-folded", orientation));
      const flat = surfaces(measured("open", orientation));
      expect(book.grid.foldAligned).toBe(true);
      expect(flat.grid.foldAligned).toBe(false);
      expect(flat.placeholder.width).toBe(container.width);
      expect(flat.pager).not.toEqual(book.pager);
    });
  }
});
