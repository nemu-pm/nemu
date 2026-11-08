import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import { getMobileEmptyLibraryAdaptiveLayout } from "./mobileEmptyLibraryLayout";
import { mobileFoldAwareGridLayout, mobileFoldPagerLayout, mobilePaneContentRegion } from "./mobileFoldAwareGrid";
import {
  MOBILE_IOS_FOLD_GUTTER,
  mobileRestingFoldMinGutter,
  mobileVerticalFoldBand,
  mobileVerticalFoldGutterForContainer,
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

describe("fold rule: book splits at the fold, fully open uses the ordinary layout", () => {
  test("a flat (inactive) fold is not a split line", () => {
    for (const orientation of ["landscape-left", "landscape-right"]) {
      const flat = mobileAdaptiveLayout(measured("open", orientation));
      expect(mobileFoldSplitForContainer(flat, LANDSCAPE_CONTAINER)).toBeNull();
      const book = mobileAdaptiveLayout(measured("partially-folded", orientation));
      expect(book.posture).toBe("book");
      expect(mobileFoldSplitForContainer(book, LANDSCAPE_CONTAINER)).not.toBeNull();
    }
  });

  test("inactive horizontal fold band height per platform", () => {
    expect(mobileRestingFoldMinGutter("ios")).toBe(MOBILE_IOS_FOLD_GUTTER);
    expect(mobileRestingFoldMinGutter("android")).toBe(20);
  });
});

describe("empty-state hero: the copy does not move when the Duo folds", () => {
  function heroFor(layout: MobileWindowLayout, container: typeof LANDSCAPE_CONTAINER) {
    const adaptive = mobileAdaptiveLayout(layout);
    const split = mobileFoldSplitForContainer(adaptive, container);
    // As EmptyLibrary: a vertical fold splits art and copy folded or flat;
    // only the notebook (horizontal fold) split still needs the active fold.
    const gutter = mobileVerticalFoldGutterForContainer(
      mobileVerticalFoldBand(layout, mobileRestingFoldMinGutter("ios")),
      container,
    );
    return getMobileEmptyLibraryAdaptiveLayout({
      width: container.width,
      height: container.height,
      bleedWidth: container.width,
      fold: gutter
        ? { axis: "horizontal", gutter }
        : split?.axis === "vertical"
          ? { axis: "vertical", gutter: split.gutter }
          : null,
    });
  }

  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`book ⇄ fully open (${orientation}) keep the same fold split`, () => {
      const book = heroFor(measured("partially-folded", orientation), LANDSCAPE_CONTAINER);
      const flat = heroFor(measured("open", orientation), LANDSCAPE_CONTAINER);
      expect(book).toMatchObject({ arrangement: "row", artPane: { x: 0, width: 455.5 }, copyPane: { x: 495.5, width: 371.5 } });
      expect(flat).toEqual(book);
    });
  }

  test("the band is the same folded and flat, and ignores the inactive division's width", () => {
    const book = mobileVerticalFoldBand(measured("partially-folded", "landscape-left"), MOBILE_IOS_FOLD_GUTTER);
    const flat = mobileVerticalFoldBand(measured("open", "landscape-left"), MOBILE_IOS_FOLD_GUTTER);
    expect(book).toEqual({ left: 455.5, right: 495.5, active: true });
    expect(flat).toEqual({ left: 455.5, right: 495.5, active: false });
    // Apple: an inactive division may be reported zero-wide; only its centre counts.
    const zeroWide: MobileWindowLayout = {
      width: 951, height: 669, supported: true, occlusions: [],
      divisions: [{ id: "d", x: 475.5, y: 0, width: 0, height: 669, active: false }],
    };
    expect(mobileVerticalFoldBand(zeroWide, MOBILE_IOS_FOLD_GUTTER)).toEqual(flat);
  });

  test("a horizontal fold (inner portrait) or a box on one side of the fold has no vertical split", () => {
    expect(mobileVerticalFoldBand(measured("open", "portrait"), MOBILE_IOS_FOLD_GUTTER)).toBeNull();
    const band = mobileVerticalFoldBand(measured("open", "landscape-left"), MOBILE_IOS_FOLD_GUTTER);
    expect(mobileVerticalFoldGutterForContainer(band, { x: 495.5, width: 371.5 })).toBeNull();
    expect(mobileVerticalFoldGutterForContainer(band, null)).toBeNull();
  });

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
