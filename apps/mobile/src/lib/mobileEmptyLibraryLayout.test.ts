import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getMobileEmptyLibraryLayout,
  NEMU_WEB_EMPTY_LIBRARY_VISUAL,
} from "./mobileEmptyLibraryLayout";

describe("getMobileEmptyLibraryLayout", () => {
  test("keeps the established vertical treatment on a short landscape phone", () => {
    const layout = getMobileEmptyLibraryLayout({
      height: 411,
      width: 780,
    });

    expect(layout).toEqual({
      glowBleed: 48,
      portraitMaxWidth: 512,
      rootMinHeight: 247,
    });
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

    expect(layout).toEqual({
      glowBleed: 48,
      portraitMaxWidth: 390,
      rootMinHeight: 506,
    });
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

    expect(layout.portraitMaxWidth).toBeLessThan(370);
    expect(layout.portraitMaxWidth).toBeGreaterThan(240);
    expect(layout.rootMinHeight).toBe(617);
    expect(layout.glowBleed).toBe(48);
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
    expect(pageScaffold).toContain("paddingHorizontal: spacing.pageX");
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
