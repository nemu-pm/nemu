import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import {
  estimateMobileSourceGroupHeight,
  getMobileSourceColumns,
  MOBILE_SOURCE_GROUP_GAP,
  partitionMobileSourceGroups,
} from "./mobileSourceColumns";
import {
  mobileRestingFoldMinGutter,
  mobileVerticalFoldBand,
  mobileVerticalFoldGutterForContainer,
} from "./mobileRestingFold";
import { mobileScrollGroupAnchorDelta, pickMobileScrollGroupAnchor } from "./useMobileScrollGroupAnchor";
import type { MobileWindowLayout } from "./mobileWindowLayout";

function duoInner(pose: string, orientation: string): MobileWindowLayout {
  const m = fixture.measurements.find((x) => x.screen === "iphone-duo-inner" && x.pose === pose && x.orientation === orientation);
  if (!m) throw new Error(`missing fixture ${pose} ${orientation}`);
  const regions = m.regions.map((r, index) => ({ id: `${r.kind}-${index}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width,
    height: m.bounds.height,
    supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
  };
}

// The Sources list box on the inner landscape display: inside 16pt page
// gutters of the 867pt page (left of the 84pt bar column).
const LIST = { x: 16, width: 835 };

function columnsFor(pose: string, orientation: string) {
  const band = mobileVerticalFoldGutterForContainer(
    mobileVerticalFoldBand(duoInner(pose, orientation), mobileRestingFoldMinGutter("ios")),
    LIST,
  );
  // Half open the band is the active fold (the iOS division plus margins).
  const fold = pose === "partially-folded" ? band : null;
  return { fold: band, columns: getMobileSourceColumns({ contentWidth: LIST.width, fold, band, foldRegion: true }) };
}

describe("Sources columns on the Duo inner display", () => {
  test("half open: one column a pane, ending and starting at the fold", () => {
    const { fold, columns } = columnsFor("partially-folded", "landscape-left");
    expect(fold).not.toBeNull();
    expect(columns).toHaveLength(2);
    expect(columns[0].x).toBe(0);
    expect(columns[0].x + columns[0].width).toBeLessThanOrEqual(fold!.start);
    expect(columns[1].x).toBeGreaterThanOrEqual(fold!.end);
    expect(columns[1].x + columns[1].width).toBe(LIST.width);
    expect(columns[0].width + columns[1].marginLeft).toBe(columns[1].x);
  });

  for (const orientation of ["landscape-left", "landscape-right"]) {
    test(`fully open (${orientation}): one 560pt column centred on the whole screen, nothing at the hinge`, () => {
      const { fold, columns } = columnsFor("open", orientation);
      // The hinge band is there, but fully open it splits nothing.
      expect(fold).not.toBeNull();
      expect(columns).toEqual([{ x: (LIST.width - 560) / 2, width: 560, marginLeft: (LIST.width - 560) / 2 }]);
    });

    test(`fully open ⇄ book (${orientation}): one column ⇄ one a pane (col-0 glides, col-1 fades)`, () => {
      expect(columnsFor("open", orientation).columns).toHaveLength(1);
      expect(columnsFor("partially-folded", orientation).columns).toHaveLength(2);
    });
  }

  test("inner portrait (fully open): one 560pt column, centred", () => {
    const { fold, columns } = (() => {
      const band = mobileVerticalFoldBand(duoInner("open", "portrait"), mobileRestingFoldMinGutter("ios"));
      const gutter = mobileVerticalFoldGutterForContainer(band, { x: 20, width: 629 });
      return { fold: gutter, columns: getMobileSourceColumns({ contentWidth: 629, fold: gutter, band: gutter, foldRegion: true }) };
    })();
    expect(fold).toBeNull();
    expect(columns).toEqual([{ x: 34.5, width: 560, marginLeft: 34.5 }]);
  });

  test("phones and tablets (no fold region): the full width, as before", () => {
    expect(getMobileSourceColumns({ contentWidth: 370, fold: null, band: null, foldRegion: false })).toEqual([{ x: 0, width: 370, marginLeft: 0 }]);
    expect(getMobileSourceColumns({ contentWidth: 980, fold: null, band: null, foldRegion: false })).toEqual([{ x: 0, width: 980, marginLeft: 0 }]);
  });

  test("panes too narrow for a list stay one column", () => {
    expect(getMobileSourceColumns({ contentWidth: 500, fold: { start: 240, end: 260 }, band: { start: 240, end: 260 }, foldRegion: true })).toHaveLength(1);
  });
});

describe("groups flow whole into the shorter column", () => {
  const height = (rows: number) => estimateMobileSourceGroupHeight({ rows });

  test("the first group opens the leading column; each next goes to the shorter one", () => {
    expect(partitionMobileSourceGroups([height(3), height(5), height(1), height(2)], 2)).toEqual([0, 1, 0, 0]);
  });

  test("ties go to the leading column", () => {
    expect(partitionMobileSourceGroups([height(2), height(2), height(2)], 2)).toEqual([0, 1, 0]);
  });

  test("one column takes every group in order", () => {
    expect(partitionMobileSourceGroups([10, 20, 30], 1)).toEqual([0, 0, 0]);
  });

  test("the gap between groups counts", () => {
    // [100] | [] → [100] | [80] → 100 vs 80: the third goes right.
    const columns = partitionMobileSourceGroups([100, 80, 10, 10], 2, MOBILE_SOURCE_GROUP_GAP);
    expect(columns).toEqual([0, 1, 1, 0]);
  });

  test("an unsupported source's taller card counts", () => {
    expect(estimateMobileSourceGroupHeight({ rows: 2, unsupportedRows: 1 })).toBe(22 + 60 + 84);
  });
});

describe("scroll anchor across a re-layout", () => {
  const frames = [
    { key: "ja", x: 16, top: -200, bottom: -20 },
    { key: "en", x: 16, top: 0, bottom: 300 },
    { key: "zh", x: 512, top: -40, bottom: 200 },
  ];

  test("the topmost group still showing below the viewport top (leading column on a tie)", () => {
    expect(pickMobileScrollGroupAnchor(frames, 60, false)).toEqual({ key: "zh", offset: -100 });
    expect(
      pickMobileScrollGroupAnchor(
        [
          { key: "b", x: 512, top: 100, bottom: 200 },
          { key: "a", x: 16, top: 100, bottom: 200 },
        ],
        60,
        false,
      ),
    ).toEqual({ key: "a", offset: 40 });
  });

  test("at the top nothing is anchored (the page stays at its top)", () => {
    expect(pickMobileScrollGroupAnchor(frames, 60, true)).toBeNull();
  });

  test("the scroll moves by the group's change of distance from the top", () => {
    expect(mobileScrollGroupAnchorDelta({ offset: -100 }, 340, 90)).toBe(350);
    expect(mobileScrollGroupAnchorDelta({ offset: 40 }, 130, 90)).toBe(0);
  });
});
