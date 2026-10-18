import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import {
  getMobileSplitPaneLayout as split,
  getMobileSplitPanePadding,
  MOBILE_DETAIL_SPLIT_OPTIONS as detail,
  MOBILE_SETTINGS_SPLIT_INNER_GUTTER,
  MOBILE_SETTINGS_SPLIT_OPTIONS as settings,
} from "./mobileSplitPaneLayout";

const hinge = { id: "hinge", x: 465, y: 0, width: 21, height: 669, active: true };

describe("split pane layout", () => {
  test("compact widths keep a single column (outer display, phones)", () => {
    expect(split({ containerWidth: 466, regularWidth: false, posture: "flat", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("flat without a fold region (tablets): narrower leading pane, like the Notes sidebar", () => {
    expect(split({ containerWidth: 951, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toEqual({
      mode: "split",
      alignment: "flat",
      leading: { x: 0, width: 380 },
      trailing: { x: 380, width: 571 },
      gutter: 0,
    });
    // Wide tablets cap the leading pane.
    expect(split({ containerWidth: 1366, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toMatchObject({
      leading: { width: 460 },
    });
  });

  test("settings sidebar follows the system Settings: 320pt, or what leaves the detail 419pt", () => {
    // Measured on the system Settings app (window width → sidebar / detail).
    const measured: [number, number, number][] = [
      [669, 250, 419], // Duo inner display, portrait
      [834, 320, 514], // iPad Pro 11-inch, portrait
      [951, 320, 631], // Duo inner display, landscape
      [1210, 320, 890], // iPad Pro 11-inch, landscape
    ];
    for (const [containerWidth, leading, trailing] of measured) {
      expect(split({ containerWidth, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toEqual({
        mode: "split",
        alignment: "flat",
        leading: { x: 0, width: leading },
        trailing: { x: leading, width: trailing },
        gutter: 0,
      });
    }
    // In between, the sidebar gives way before the detail does.
    expect(split({ containerWidth: 700, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toMatchObject({
      leading: { width: 281 },
      trailing: { width: 419 },
    });
  });

  test("settings measure the sidebar between the side safe areas (a bar beside it keeps its rows)", () => {
    // Duo inner display in landscape, vertical bar on the trailing edge: unchanged.
    expect(split({ containerWidth: 951, regularWidth: true, posture: "flat", foldSplit: null, options: settings, sideInsets: { left: 0, right: 84 } })).toMatchObject({
      leading: { width: 320 },
    });
    // Outer display in landscape, rail on the leading edge: 250pt beside the rail.
    expect(split({ containerWidth: 678, regularWidth: true, posture: "flat", foldSplit: null, options: settings, sideInsets: { left: 84, right: 0 } })).toMatchObject({
      leading: { x: 0, width: 334 },
      trailing: { x: 334, width: 344 },
    });
    // Rail on the trailing edge: the detail keeps 419pt beside it.
    expect(split({ containerWidth: 678, regularWidth: true, posture: "flat", foldSplit: null, options: settings, sideInsets: { left: 0, right: 84 } })).toMatchObject({
      leading: { width: 250 },
      trailing: { width: 428 },
    });
    // Manga detail ignores the insets.
    expect(split({ containerWidth: 951, regularWidth: true, posture: "flat", foldSplit: null, options: detail, sideInsets: { left: 84, right: 0 } })).toMatchObject({
      leading: { width: 380 },
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
    expect(split({ containerWidth: 560, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toEqual({ mode: "single" });
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
      leading: { width: 320 },
    });
  });

  test("unfolding restores proportional panes and removes the active fold gutter", () => {
    const flatDuo = { width: 951, height: 669, supported: true, divisions: [{ ...hinge, x: 455.5, width: 40, active: false }], occlusions: [] };
    const bookDuo = { ...flatDuo, divisions: [{ ...flatDuo.divisions[0], active: true }] };
    const container = { x: 0, y: 0, width: 867, height: 669 };
    const panes = (layout: typeof flatDuo, options: typeof detail) => {
      const adaptive = mobileAdaptiveLayout(layout);
      return split({
        containerWidth: 867,
        regularWidth: true,
        posture: adaptive.posture,
        foldSplit: mobileFoldSplitForContainer(adaptive, container),
        options,
      });
    };
    for (const options of [detail, settings]) {
      expect(panes(flatDuo, options)).toMatchObject({ alignment: "flat", gutter: 0 });
      expect(panes(bookDuo, options)).toMatchObject({ alignment: "fold", leading: { width: 455.5 }, trailing: { x: 495.5, width: 371.5 }, gutter: 40 });
    }
  });

  test("notebook posture keeps a single column", () => {
    expect(split({ containerWidth: 951, regularWidth: true, posture: "notebook", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("settings keep the flat sidebar in notebook posture, like flat portrait", () => {
    const flatPortrait = { width: 669, height: 951, supported: true, divisions: [{ id: "hinge", x: 0, y: 455.5, width: 669, height: 40, active: false }], occlusions: [] };
    const notebook = { ...flatPortrait, divisions: [{ ...flatPortrait.divisions[0], active: true }] };
    const container = { x: 0, y: 0, width: 669, height: 951 };
    const panes = (layout: typeof flatPortrait) => {
      const adaptive = mobileAdaptiveLayout(layout);
      return {
        posture: adaptive.posture,
        layout: split({
          containerWidth: 669,
          regularWidth: adaptive.regularWidth,
          posture: adaptive.posture,
          foldSplit: mobileFoldSplitForContainer(adaptive, container),
          options: settings,
        }),
      };
    };
    const flat = panes(flatPortrait);
    const folded = panes(notebook);
    expect(folded.posture).toBe("notebook");
    expect(flat.layout).toMatchObject({ alignment: "flat", leading: { width: 250 }, trailing: { x: 250, width: 419 } });
    expect(folded.layout).toEqual(flat.layout);
    // Manga detail still keeps one column there.
    expect(split({ containerWidth: 669, regularWidth: true, posture: "notebook", foldSplit: null, options: detail })).toEqual({ mode: "single" });
  });

  test("settings content sits 20pt from the boundary: 40pt from the crease in book posture", () => {
    const bookDuo = mobileAdaptiveLayout({ width: 951, height: 669, supported: true, divisions: [{ ...hinge, x: 455.5, width: 40 }], occlusions: [] });
    const layout = split({
      containerWidth: 951,
      regularWidth: true,
      posture: "book",
      foldSplit: mobileFoldSplitForContainer(bookDuo, { x: 0, y: 0, width: 951, height: 669 }),
      options: settings,
    });
    if (layout.mode !== "split") throw new Error("expected a split");
    const padding = getMobileSplitPanePadding({ pageGutters: { left: 16, right: 16 }, innerGutter: MOBILE_SETTINGS_SPLIT_INNER_GUTTER });
    const crease = 455.5 + 20;
    // Measured on the system Settings: content edges at 436 and 516.
    expect(crease - (layout.leading.width - padding.leading.paddingRight)).toBe(40);
    expect(layout.trailing.x + padding.trailing.paddingLeft - crease).toBe(40);
  });

  test("outer edges keep the safe-area gutters; inner edges use the plain gutter", () => {
    expect(getMobileSplitPanePadding({ pageGutters: { left: 16, right: 59 }, innerGutter: 16 })).toEqual({
      leading: { paddingLeft: 16, paddingRight: 16 },
      trailing: { paddingLeft: 16, paddingRight: 59 },
    });
  });
});
