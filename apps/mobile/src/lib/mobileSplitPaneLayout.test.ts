import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout, mobileFoldSplitForContainer } from "./mobileAdaptiveLayout";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { MOBILE_SEARCH_SPLIT_OPTIONS } from "./mobileSearchLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getMobileFoldSplitColumns,
  getMobileListColumnStyles,
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
      [951, 320, 631], // Duo inner display, landscape
      [1210, 320, 890], // iPad Pro 11-inch, landscape
    ];
    for (const [containerWidth, leading, trailing] of measured) {
      expect(split({ containerWidth, containerHeight: 669, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toEqual({
        mode: "split",
        alignment: "flat",
        leading: { x: 0, width: leading },
        trailing: { x: leading, width: trailing },
        gutter: 0,
      });
    }
    // Narrower, the sidebar gives way before the detail does.
    expect(split({ containerWidth: 700, containerHeight: 500, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toMatchObject({
      leading: { width: 281 },
      trailing: { width: 419 },
    });
  });

  test("settings split only where UISplitViewController shows two columns: landscape, not portrait", () => {
    // A default split view controller on the Duo's inner display (27.2):
    // 951 x 669 sidebar beside the secondary, 669 x 951 the secondary alone.
    expect(split({ containerWidth: 951, containerHeight: 669, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toMatchObject({ mode: "split" });
    for (const [containerWidth, containerHeight] of [[669, 951], [834, 1194], [1032, 1376]]) {
      expect(split({ containerWidth, containerHeight, regularWidth: true, posture: "flat", foldSplit: null, options: settings })).toEqual({ mode: "single" });
    }
    // Manga detail keeps its own width rule.
    expect(split({ containerWidth: 1032, containerHeight: 1376, regularWidth: true, posture: "flat", foldSplit: null, options: detail })).toMatchObject({ mode: "split" });
  });

  test("compact width keeps one column however wide the window is, as UISplitViewController does", () => {
    const window = (width: number, height: number, h: "compact" | "regular"): MobileWindowLayout =>
      ({ width, height, supported: true, divisions: [], occlusions: [], horizontalSizeClass: h, verticalSizeClass: height < 500 ? "compact" : "regular" });
    const settingsFor = (layout: MobileWindowLayout) =>
      split({ containerWidth: layout.width, containerHeight: layout.height, regularWidth: mobileAdaptiveLayout(layout).regularWidth, posture: "flat", foldSplit: null, options: settings, sideInsets: { left: 84, right: 0 } });
    // Duo outer display in landscape (compact width) and a 6.3" iPhone in landscape: one list.
    expect(settingsFor(window(678, 466, "compact"))).toEqual({ mode: "single" });
    expect(settingsFor(window(874, 402, "compact"))).toEqual({ mode: "single" });
    // Duo inner landscape and a Max iPhone in landscape (regular width): sidebar and detail.
    expect(settingsFor(window(951, 669, "regular"))).toMatchObject({ mode: "split" });
    expect(settingsFor(window(956, 440, "regular"))).toMatchObject({ mode: "split" });
    // Search's wide split likewise drops on a compact-width phone in landscape.
    const searchFor = (layout: MobileWindowLayout) =>
      split({ containerWidth: layout.width, regularWidth: mobileAdaptiveLayout(layout).regularWidth, posture: "flat", foldSplit: null, options: MOBILE_SEARCH_SPLIT_OPTIONS });
    expect(searchFor(window(874, 402, "compact"))).toEqual({ mode: "single" });
    expect(searchFor(window(1180, 820, "regular"))).toMatchObject({ mode: "split" });
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

  test("settings keep one column in notebook posture, as in flat portrait", () => {
    const flatPortrait = { width: 669, height: 951, supported: true, divisions: [{ id: "hinge", x: 0, y: 455.5, width: 669, height: 40, active: false }], occlusions: [] };
    const notebook = { ...flatPortrait, divisions: [{ ...flatPortrait.divisions[0], active: true }] };
    const container = { x: 0, y: 0, width: 669, height: 951 };
    const panes = (layout: typeof flatPortrait) => {
      const adaptive = mobileAdaptiveLayout(layout);
      return {
        posture: adaptive.posture,
        layout: split({
          containerWidth: 669,
          containerHeight: 951,
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
    expect(flat.layout).toEqual({ mode: "single" });
    expect(folded.layout).toEqual({ mode: "single" });
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

/** A measured iPhone Duo inner window (safearea.info, Xcode 27.1): 951×669, the rail's 84pt inset on the right. */
function duoInner(pose: "partially-folded" | "open", orientation: "landscape-left" | "landscape-right"): MobileWindowLayout {
  const m = fixture.measurements.find((x) => x.screen === "iphone-duo-inner" && x.pose === pose && x.orientation === orientation)!;
  const regions = m.regions.map((r, index) => ({ id: `${r.kind}-${index}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
    safeAreaInsets: m.insets,
  };
}

describe("fold split columns (Duo F7: a source home's ranking column)", () => {
  // The home list's content box: inside the 20pt page gutter and the rail's 84pt inset (x20–867).
  const box = { x: 20, y: 0, width: 951 - 20 - 84, height: 669 };
  const columnsFor = (layout: MobileWindowLayout) => {
    const adaptive = mobileAdaptiveLayout(layout);
    const foldSplit = mobileFoldSplitForContainer(adaptive, box);
    return getMobileFoldSplitColumns({
      contentWidth: box.width,
      fold: foldSplit?.axis === "horizontal" ? foldSplit.gutter : null,
      options: MOBILE_SEARCH_SPLIT_OPTIONS,
      innerGutter: 16,
    });
  };

  for (const orientation of ["landscape-left", "landscape-right"] as const) {
    test(`book (${orientation === "landscape-left" ? "book" : "book-flipped"}): the right column starts at x511.5, clear of the fold, like Search's results`, () => {
      const columns = columnsFor(duoInner("partially-folded", orientation))!;
      expect(columns).not.toBeNull();
      // Window coordinates. Before: the second column started at x452, its rank numerals at ~x476 (the fold centre).
      expect(box.x + columns.trailing.x).toBe(511.5);
      expect(box.x + columns.trailing.x + columns.trailing.width).toBe(867);
      expect(box.x + columns.leading.x).toBe(20);
      expect(box.x + columns.leading.x + columns.leading.width).toBe(439.5);
      // Nothing within 16pt of the fold region (455.5–495.5).
      expect(box.x + columns.leading.x + columns.leading.width).toBeLessThanOrEqual(455.5 - 16);
      expect(box.x + columns.trailing.x).toBeGreaterThanOrEqual(495.5 + 16);
    });
  }

  test("matches Search's own fold split on the same window: sidebar ends and results start at the same x", () => {
    const adaptive = mobileAdaptiveLayout(duoInner("partially-folded", "landscape-left"));
    const window = { x: 0, y: 0, width: 951, height: 669 };
    const search = split({
      containerWidth: 951,
      regularWidth: true,
      posture: adaptive.posture,
      foldSplit: mobileFoldSplitForContainer(adaptive, window),
      options: MOBILE_SEARCH_SPLIT_OPTIONS,
    });
    if (search.mode !== "split") throw new Error("Search does not split");
    const padding = getMobileSplitPanePadding({ pageGutters: { left: 20, right: 84 }, innerGutter: 16 });
    const columns = columnsFor(duoInner("partially-folded", "landscape-left"))!;
    expect(box.x + columns.trailing.x).toBe(search.trailing.x + padding.trailing.paddingLeft);
    expect(box.x + columns.leading.x + columns.leading.width).toBe(search.leading.width - padding.leading.paddingRight);
  });

  test("flat (open): no fold split — the columns stay as they are, as Search reserves nothing for an inactive fold", () => {
    expect(columnsFor(duoInner("open", "landscape-left"))).toBeNull();
    expect(columnsFor(duoInner("open", "landscape-right"))).toBeNull();
    expect(getMobileFoldSplitColumns({ contentWidth: 847, fold: null, options: MOBILE_SEARCH_SPLIT_OPTIONS, innerGutter: 16 })).toBeNull();
  });

  test("a fold that leaves a half too small for a pane keeps the flat columns", () => {
    expect(getMobileFoldSplitColumns({ contentWidth: 847, fold: { start: 200, end: 240 }, options: MOBILE_SEARCH_SPLIT_OPTIONS, innerGutter: 16 })).toBeNull();
  });
});

describe("home list columns across a fold/unfold on the page (Duo F7, r19)", () => {
  const box = { x: 20, y: 0, width: 951 - 20 - 84, height: 669 };
  // What useMobileFoldAwareGrid hands HomeListColumns for a pose: the active
  // fold in content-box coordinates (null unless the device is folded).
  const stylesFor = (layout: MobileWindowLayout) => {
    const adaptive = mobileAdaptiveLayout(layout);
    const foldSplit = mobileFoldSplitForContainer(adaptive, box);
    return getMobileListColumnStyles({
      contentWidth: box.width,
      fold: foldSplit?.axis === "horizontal" ? foldSplit.gutter : null,
      columns: 2,
      gap: 16,
      options: MOBILE_SEARCH_SPLIT_OPTIONS,
      innerGutter: 16,
    });
  };

  test("flat → book → flat: the second flat layout is the first one, even columns, not the book split", () => {
    const fresh = stylesFor(duoInner("open", "landscape-left"));
    const book = stylesFor(duoInner("partially-folded", "landscape-left"));
    const unfolded = stylesFor(duoInner("open", "landscape-left"));
    expect(fresh.mode).toBe("flat");
    expect(book.mode).toBe("fold");
    expect(book.columns.map((c) => c.width)).toEqual([419.5, 355.5]);
    expect(unfolded).toEqual(fresh);
    // Even: both columns grow from a zero basis, a 16pt gap between them.
    for (const column of unfolded.columns) {
      expect(column).toMatchObject({ width: "auto", flexBasis: 0, flexGrow: 1, flexShrink: 1 });
    }
    expect(unfolded.columns.map((c) => c.marginLeft)).toEqual([0, 16]);
  });

  test("each mode sets every key the other one set, so no book width survives an unfold", () => {
    const book = stylesFor(duoInner("partially-folded", "landscape-right"));
    const flat = stylesFor(duoInner("open", "landscape-right"));
    for (const [a, b] of book.columns.map((column, i) => [column, flat.columns[i]] as const)) {
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const key of Object.keys(a)) expect((b as Record<string, unknown>)[key]).toBeDefined();
    }
    // The r19 regression: the book widths kept as the basis plus half the free space each.
    const [leading, trailing] = book.columns.map((c) => c.flexBasis);
    const free = box.width - 16 - leading - trailing;
    expect(leading + free / 2).not.toBeCloseTo((box.width - 16) / 2, 0);
  });

  test("HomeListColumns renders those complete styles on stable keyed pose views (a fold glides, never remounts)", () => {
    const source = readFileSync(path.join(import.meta.dir, "../components/SourceHomeView.tsx"), "utf8");
    expect(source).toContain("getMobileListColumnStyles({");
    expect(source).toContain("<View style={styles.exploreListColumns}>");
    expect(source).not.toContain("<View key={layout.mode} style={styles.exploreListColumns}>");
    expect(source).toContain("<MobilePoseLayoutView key={column} style={style}>");
    expect(source).not.toContain("exploreListColumnCell");
  });
});
