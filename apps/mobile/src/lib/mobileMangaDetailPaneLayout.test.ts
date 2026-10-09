import { describe, expect, test } from "bun:test";
import {
  getMobileChapterSectionRhythm as rhythm,
  getMobileDetailDescriptionPresentation as description,
  getMobileDetailPaneCoverWidth as paneCover,
  MOBILE_DETAIL_PANE_METRICS,
} from "./mobileMangaDetailPaneLayout";
import { getMobileDetailHeroCopyLayout as heroLayout } from "./mobileMangaDetailTagLayout";
import { getMobileSplitPaneLayout, getMobileSplitPanePadding, MOBILE_DETAIL_SPLIT_OPTIONS } from "./mobileSplitPaneLayout";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";

/** Inner width of the info pane: pane width minus its horizontal padding. */
function infoPaneInnerWidth(containerWidth: number, foldSplit: Parameters<typeof getMobileSplitPaneLayout>[0]["foldSplit"], posture: "flat" | "book") {
  const layout = getMobileSplitPaneLayout({
    containerWidth,
    regularWidth: true,
    posture,
    foldSplit,
    options: MOBILE_DETAIL_SPLIT_OPTIONS,
  });
  if (layout.mode !== "split") throw new Error("expected a split");
  const padding = getMobileSplitPanePadding({ pageGutters: { left: 16, right: 84 }, innerGutter: 16 });
  return layout.leading.width - padding.leading.paddingLeft - padding.leading.paddingRight;
}

describe("info pane cover", () => {
  test("grows past the compact card's 112pt cap on the Duo inner display", () => {
    // Book: the pane is the 455.5pt fold half → ~423pt inner.
    const book = infoPaneInnerWidth(951, { axis: "horizontal", gutter: { start: 455.5, end: 495.5 } } as never, "book");
    expect(book).toBe(423.5);
    expect(paneCover(book)).toBe(143);
    // A wide tablet without a fold (Notes-style 380pt pane) → 348pt inner.
    const tablet = infoPaneInnerWidth(951, null, "flat");
    expect(tablet).toBe(348);
    expect(paneCover(tablet)).toBe(118);
  });

  test("Duo unfolding resizes the info pane to the proportional sidebar", () => {
    const division = { id: "fold", x: 455.5, y: 0, width: 40, height: 669 };
    const heroFor = (active: boolean) => {
      const layout = { width: 951, height: 669, supported: true, divisions: [{ ...division, active }], occlusions: [] };
      const adaptive = mobileAdaptiveLayout(layout);
      const foldSplit = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: 867, height: 669 });
      const inner = infoPaneInnerWidth(867, foldSplit, adaptive.posture === "book" ? "book" : "flat");
      return heroLayout({
        surfaceWidth: inner,
        fontScale: 1,
        compact: false,
        hasAuthors: true,
        hasTagRow: false,
        maxTitleLines: MOBILE_DETAIL_PANE_METRICS.maxTitleLines,
        baseCoverWidth: paneCover(inner),
      });
    };
    const flat = heroFor(false);
    expect(flat.coverWidth).toBeLessThan(heroFor(true).coverWidth);
    expect(heroFor(true).coverWidth).toBe(143);
  });

  test("stays within its clamp", () => {
    expect(paneCover(200)).toBe(MOBILE_DETAIL_PANE_METRICS.minCoverWidth);
    expect(paneCover(900)).toBe(MOBILE_DETAIL_PANE_METRICS.maxCoverWidth);
    expect(paneCover(Number.NaN)).toBe(118);
  });

  test("the copy column still ends on the cover's bottom edge with the larger cover", () => {
    const layout = heroLayout({
      surfaceWidth: 348,
      fontScale: 1,
      compact: false,
      hasAuthors: true,
      hasTagRow: false,
      maxTitleLines: 4,
      baseCoverWidth: paneCover(348),
    });
    expect(layout.coverWidth).toBe(118);
    expect(layout.coverHeight).toBe(177);
    // 177 − (18 + 8 authors) − (36 + 4 + 8 actions) = 103 → three 28pt lines.
    expect(layout.titleLines).toBe(3);
  });

  test("without a requested cover the compact rule is unchanged", () => {
    const compact = heroLayout({ surfaceWidth: 346, fontScale: 1, compact: false, hasAuthors: true, hasTagRow: true, maxTitleLines: 3 });
    const explicit = heroLayout({ surfaceWidth: 346, fontScale: 1, compact: false, hasAuthors: true, hasTagRow: true, maxTitleLines: 3, baseCoverWidth: undefined });
    expect(explicit).toEqual(compact);
    expect(compact.coverWidth).toBe(112);
  });
});

describe("description", () => {
  const short = "Kudan: a half-human, half-bovine yokai endowed with the power of prophecy.";
  const medium = `${short}\nOne novel catches the eye of fiction editor Hazama. ${"Lorem ipsum dolor sit amet. ".repeat(12)}`;
  const long = "Lorem ipsum dolor sit amet. ".repeat(40);

  test("the compact card keeps three lines and its 260-character rule", () => {
    expect(description({ value: short, pane: false })).toEqual({ collapsedLines: 3, collapsible: false });
    expect(description({ value: medium, pane: false })).toEqual({ collapsedLines: 3, collapsible: true });
  });

  test("the info pane shows a typical synopsis in full", () => {
    expect(description({ value: medium, pane: true }).collapsible).toBe(false);
    expect(description({ value: "a\nb\nc\nd\ne", pane: true }).collapsible).toBe(false);
  });

  test("only a very long synopsis collapses in the pane, to a dozen lines", () => {
    expect(description({ value: long, pane: true })).toEqual({ collapsedLines: 12, collapsible: true });
    expect(description({ value: Array.from({ length: 14 }, (_, i) => `line ${i}`).join("\n"), pane: true }).collapsible).toBe(true);
  });
});

describe("chapter section rhythm", () => {
  test("compact keeps design A's values", () => {
    expect(rhythm({ regularWidth: false, minimumTouchTarget: 44 })).toEqual({
      sectionGap: 16,
      headerRowHeight: 28,
      headerRowMarginBottom: 0,
      sortActionMarginVertical: 0,
      toolbarMarginVertical: 0,
      sourceSelectorMarginTop: 0,
      sourceSelectorMarginBottom: 0,
      firstRowGap: 16,
      rowGap: 8,
    });
  });

  test("regular widths fold the touch frames' overhang out of the gaps", () => {
    const ios = rhythm({ regularWidth: true, minimumTouchTarget: 44 });
    // 44pt sort frame in a 28pt row; 44pt chip frames around 30pt pills.
    expect(ios.sortActionMarginVertical).toBe(-8);
    expect(ios.toolbarMarginVertical).toBe(-7);
    const android = rhythm({ regularWidth: true, minimumTouchTarget: 48 });
    expect(android.sortActionMarginVertical).toBe(-10);
    expect(android.toolbarMarginVertical).toBe(-9);
  });

  test("regular widths use one step between heading, chips and grid", () => {
    const regular = rhythm({ regularWidth: true, minimumTouchTarget: 44 });
    // Visible gaps: heading row → chip pill, chip pill → first chapter row.
    const headingToChips = regular.sectionGap;
    // Measured from the heading's baseline (≈7pt above the row's bottom on
    // iOS), the pull-up keeps heading → chips close to chips → grid.
    expect(regular.headerRowMarginBottom).toBe(-6);
    expect(7 + headingToChips + regular.headerRowMarginBottom).toBe(13);
    const chipsToGrid = regular.firstRowGap;
    expect(headingToChips).toBe(12);
    expect(chipsToGrid).toBe(12);
    // The row the heading sits in is its visible height, so the pane's first
    // line starts at the top of the heading (aligned with the info pane's cover).
    const sortFrame = 44 + 2 * regular.sortActionMarginVertical;
    expect(sortFrame).toBe(regular.headerRowHeight);
  });
});
