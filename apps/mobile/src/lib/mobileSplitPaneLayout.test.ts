import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import {
  getMobileSplitPaneLayout as split,
  getMobileSplitPanePadding,
  MOBILE_DETAIL_SPLIT_OPTIONS as detail,
  MOBILE_SETTINGS_SPLIT_OPTIONS as settings,
} from "./mobileSplitPaneLayout";

const hinge = { id: "hinge", x: 465, y: 0, width: 21, height: 669, active: true };

describe("split pane layout", () => {
  test("compact widths keep a single column (outer display, phones)", () => {
    expect(split({ containerWidth: 466, regularWidth: false, posture: "flat", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("flat inner display: narrower leading pane, like the Notes sidebar", () => {
    expect(split({ containerWidth: 951, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toEqual({
      mode: "split",
      alignment: "flat",
      leading: { x: 0, width: 380 },
      trailing: { x: 380, width: 571 },
      gutter: 0,
    });
    // Settings on the inner portrait display: 36% would be 241, so the
    // sidebar keeps its minimum.
    expect(split({ containerWidth: 669, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toMatchObject({
      leading: { width: 300 },
      trailing: { x: 300, width: 369 },
    });
    // Wide tablets cap the leading pane.
    expect(split({ containerWidth: 1366, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toMatchObject({
      leading: { width: 460 },
    });
  });

  test("manga detail only splits flat on expanded widths (web, Material list-detail)", () => {
    // Duo inner portrait and tablets in portrait keep the single list.
    for (const containerWidth of [669, 744, 834]) {
      expect(split({ containerWidth, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toEqual({ mode: "single" });
    }
    expect(split({ containerWidth: 840, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toMatchObject({
      mode: "split",
      leading: { width: 336 },
    });
  });

  test("too narrow for two usable panes stays single", () => {
    expect(split({ containerWidth: 610, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toEqual({ mode: "single" });
    expect(split({ containerWidth: 0, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("book posture puts the pane boundary exactly on the fold", () => {
    const adaptive = mobileAdaptiveLayout({ width: 951, height: 669, supported: true, divisions: [hinge], occlusions: [] });
    const foldSplit = mobileFoldSplitForContainer(adaptive, { x: 0, y: 0, width: 951, height: 669 });
    const layout = split({ containerWidth: 951, regularWidth: true, posture: "book", foldSplit, options: detail });
    expect(layout).toEqual({
      mode: "split",
      alignment: "fold",
      leading: { x: 0, width: 465 },
      trailing: { x: 486, width: 465 },
      gutter: 21,
    });
    // Settings uses the same halves even though its flat sidebar is narrower.
    expect(split({ containerWidth: 951, regularWidth: true, posture: "book", foldSplit, options: settings })).toMatchObject({
      alignment: "fold",
      leading: { width: 465 },
    });
  });

  test("a zero-width Android fold splits exactly like a reported region", () => {
    const pixelFold = mobileAdaptiveLayout({
      width: 841, height: 701, supported: true,
      divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }], occlusions: [],
    });
    expect(pixelFold.posture).toBe("book");
    const foldSplit = mobileFoldSplitForContainer(pixelFold, { x: 0, y: 0, width: 841, height: 701 });
    expect(split({ containerWidth: 841, regularWidth: true, posture: "book", foldSplit, options: detail })).toEqual({
      mode: "split",
      alignment: "fold",
      leading: { x: 0, width: 410.5 },
      trailing: { x: 430.5, width: 410.5 },
      gutter: 20,
    });
  });

  test("book posture without a usable fold split falls back to the flat rule", () => {
    expect(split({ containerWidth: 951, regularWidth: true, posture: "book", foldSplit: null, options: settings })).toMatchObject({
      alignment: "flat",
      leading: { width: 342 },
    });
  });

  test("notebook posture keeps a single column", () => {
    expect(split({ containerWidth: 951, regularWidth: true, posture: "notebook", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("outer edges keep the safe-area gutters; inner edges use the plain gutter", () => {
    expect(getMobileSplitPanePadding({ pageGutters: { left: 16, right: 59 }, innerGutter: 16 })).toEqual({
      leading: { paddingLeft: 16, paddingRight: 16 },
      trailing: { paddingLeft: 16, paddingRight: 59 },
    });
  });
});
