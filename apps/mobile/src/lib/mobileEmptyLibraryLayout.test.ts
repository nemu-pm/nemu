import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
// eslint-disable-next-line no-restricted-imports -- test needs the runtime token value; importing from @/design-system pulls the component barrel, which loads react-native's Flow-typed index.js and breaks bun's test runner.
import { spacing } from "@/design/tokens";
import {
  getMobileEmptyLibraryLayout,
  NEMU_EMPTY_LIBRARY_COPY_STACK_HEIGHT,
  NEMU_WEB_EMPTY_LIBRARY_VISUAL,
} from "./mobileEmptyLibraryLayout";
import { getMobilePageGutters } from "./mobilePageGutters";

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
