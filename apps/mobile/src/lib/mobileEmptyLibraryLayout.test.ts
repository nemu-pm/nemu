import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import {
  getMobileEmptyLibraryAdaptiveLayout,
  getMobileEmptyLibraryLayout,
  NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT,
  NEMU_WEB_EMPTY_LIBRARY_VISUAL,
} from "./mobileEmptyLibraryLayout";
import { getMobilePageGutters } from "./mobilePageGutters";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";

describe("getMobileEmptyLibraryLayout", () => {
  test("keeps the established vertical treatment on a short landscape phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      height: 411,
      width: 780,
    });

    expect(layout.portraitMaxWidth).toBe(512);
    expect(layout.rootMinHeight).toBe(247);
  });

  test("matches the web full-viewport portrait on a narrow phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      height: 568,
      width: 320,
    });

    expect(layout.portraitMaxWidth).toBe(320);
  });

  test("keeps the established portrait treatment on a normal phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      height: 844,
      width: 390,
    });

    expect(layout.portraitMaxWidth).toBe(390);
    expect(layout.rootMinHeight).toBe(506);
  });

  test("matches the real web portrait breakpoints on target devices", () => {
    expect(
      getMobileEmptyLibraryLayout({ height: 874, width: 402 }).portraitMaxWidth,
    ).toBe(402);
    expect(
      getMobileEmptyLibraryLayout({ height: 891, width: 411 }).portraitMaxWidth,
    ).toBe(411);
    expect(
      getMobileEmptyLibraryLayout({ height: 700, width: 640 }).portraitMaxWidth,
    ).toBe(448);
    expect(
      getMobileEmptyLibraryLayout({ height: 700, width: 767 }).portraitMaxWidth,
    ).toBe(448);
    expect(
      getMobileEmptyLibraryLayout({ height: 402, width: 874 }).portraitMaxWidth,
    ).toBe(512);
    expect(
      getMobileEmptyLibraryLayout({ height: 411, width: 891 }).portraitMaxWidth,
    ).toBe(512);
  });

  test("sizes the portrait to the padded native column and visible chrome", () => {
    const layout = getMobileEmptyLibraryLayout({
      height: 874,
      width: 402,
      horizontalPadding: 16,
      verticalChrome: 257,
    });

    const portraitHeight = layout.portraitMaxWidth * (456 / 390);
    const stack =
      portraitHeight +
      layout.glowBleed +
      NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT +
      NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding * 2;
    expect(layout.portraitMaxWidth).toBeLessThan(402 - 32);
    expect(layout.rootMinHeight).toBe(617);
    expect(stack).toBeLessThanOrEqual(layout.rootMinHeight);
  });

  test("pins spacing and type to the production web empty state", () => {
    const webEmpty = readFileSync(
      path.join(import.meta.dir, "../../../../src/components/library-empty.tsx"),
      "utf8",
    );
    const pageScaffold = readFileSync(
      path.join(import.meta.dir, "../design-system/components/PageScaffold.tsx"),
      "utf8",
    );

    expect(webEmpty).toContain("min-h-[60vh]");
    expect(webEmpty).toContain("justify-center p-4");
    expect(webEmpty).toContain("relative mb-4 portrait-container");
    expect(webEmpty).toContain("gap-2 text-center");
    expect(webEmpty).toContain("text-lg font-medium tracking-tight");
    expect(webEmpty).toContain("text-sm text-muted-foreground leading-relaxed");
    expect(webEmpty).toContain('className="mt-6"');
    // The scaffold pads with the safe-area-aware page gutters, which are
    // exactly `spacing.pageX` on a portrait phone.
    expect(pageScaffold).toContain("paddingLeft: gutters.left");
    expect(pageScaffold).toContain("paddingRight: gutters.right");
    expect(getMobilePageGutters({ left: 0, right: 0 })).toMatchObject({
      left: spacing.pageX,
      right: spacing.pageX,
    });
    expect(NEMU_WEB_EMPTY_LIBRARY_VISUAL).toEqual({
      actionMarginTop: 24,
      copyGap: 8,
      descriptionLineHeight: 23,
      portraitMarginBottom: 16,
      rootMinHeightViewportRatio: 0.6,
      rootPadding: 16,
      titleLetterSpacing: -0.45,
      titleLineHeight: 28,
    });
  });
});

describe("getMobileEmptyLibraryAdaptiveLayout", () => {
  const ratioOfHeight = (layout: { portraitMaxWidth: number }, height: number) =>
    (layout.portraitMaxWidth * (456 / 390)) / height;

  test("a regular phone keeps its stacked proportion", () => {
    const phone = getMobileEmptyLibraryAdaptiveLayout({ width: 402, height: 668 });
    expect(phone.arrangement).toBe("stack");
    expect(phone.portraitMaxWidth).toBeGreaterThan(360);
  });

  test("Duo outer display (bars on the trailing edge) gets the phone proportion", () => {
    // 466×678 minus the 84pt trailing bar column and the top header only.
    const outer = getMobileEmptyLibraryAdaptiveLayout({ width: 382, height: 600 });
    expect(outer.arrangement).toBe("stack");
    expect(ratioOfHeight(outer, 678)).toBeGreaterThan(0.5);
  });

  test("an unfolded landscape foldable places art beside the copy at phone scale", () => {
    const fold = getMobileEmptyLibraryAdaptiveLayout({ width: 841, height: 509 });
    expect(fold.arrangement).toBe("row");
    expect(fold.portraitMaxWidth).toBeGreaterThan(340);
    expect(ratioOfHeight(fold, 701)).toBeGreaterThan(0.55);
  });

  test("book posture splits art and copy exactly at the fold", () => {
    const book = getMobileEmptyLibraryAdaptiveLayout({
      width: 867,
      height: 589,
      fold: { axis: "horizontal", gutter: { start: 405, end: 426 } },
    });
    expect(book).toMatchObject({ arrangement: "row", artPane: { x: 0, width: 405 }, copyPane: { x: 426, width: 441 } });
  });

  test("a zero-width Pixel Fold hinge splits art and copy with a real gutter", () => {
    const adaptive = mobileAdaptiveLayout({
      width: 841, height: 701, supported: true,
      divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }], occlusions: [],
    });
    const split = mobileFoldSplitForContainer(adaptive, { x: 0, y: 100, width: 841, height: 520 });
    const book = getMobileEmptyLibraryAdaptiveLayout({ width: 841, height: 520, fold: split });
    expect(book).toMatchObject({ arrangement: "row", artPane: { x: 0, width: 410.5 }, copyPane: { x: 430.5 } });
  });

  test("notebook posture puts art in the top pane and copy in the bottom pane", () => {
    const notebook = getMobileEmptyLibraryAdaptiveLayout({
      width: 669,
      height: 860,
      fold: { axis: "vertical", gutter: { start: 400, end: 421 } },
    });
    expect(notebook).toMatchObject({ arrangement: "column", artPane: { y: 0, height: 400 }, copyPane: { y: 421, height: 439 } });
    if (notebook.arrangement === "column") {
      expect(notebook.portraitMaxWidth * (456 / 390)).toBeLessThan(400);
    }
  });

  test("a tall inner display stays stacked and never exceeds the web md cap", () => {
    const portrait = getMobileEmptyLibraryAdaptiveLayout({ width: 669, height: 790 });
    expect(portrait.arrangement).toBe("stack");
    expect(portrait.portraitMaxWidth).toBeLessThanOrEqual(512);
  });
});
