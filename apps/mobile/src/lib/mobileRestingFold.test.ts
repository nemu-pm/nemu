import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import { getMobileEmptyLibraryAdaptiveLayout } from "./mobileEmptyLibraryLayout";
import { mobileRestingFoldSplitForContainer } from "./mobileRestingFold";
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

describe("empty-state hero: fold ⇄ unfold moves nothing", () => {
  function heroFor(layout: MobileWindowLayout, container: typeof LANDSCAPE_CONTAINER) {
    const adaptive = mobileAdaptiveLayout(layout);
    const fold = mobileFoldSplitForContainer(adaptive, container);
    const resting = fold ? null : mobileRestingFoldSplitForContainer(layout, container);
    return getMobileEmptyLibraryAdaptiveLayout({
      width: container.width,
      height: container.height,
      bleedWidth: container.width,
      fold: fold ? { axis: fold.axis, gutter: fold.gutter } : null,
      restingFold: resting ? { axis: resting.axis, gutter: resting.gutter } : null,
    });
  }

  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`book ⇄ fully open (${orientation}) produce identical panes and art`, () => {
      const book = heroFor(measured("partially-folded", orientation), LANDSCAPE_CONTAINER);
      const flat = heroFor(measured("open", orientation), LANDSCAPE_CONTAINER);
      expect(book.arrangement).toBe("row");
      expect(flat).toEqual(book);
      expect(flat).toMatchObject({ artPane: { x: 0, width: 455.5 }, copyPane: { x: 495.5, width: 371.5 } });
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
