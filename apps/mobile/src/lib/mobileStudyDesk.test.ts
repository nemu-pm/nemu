import { describe, expect, test } from "bun:test";
import { isMobileStudyDeskPose } from "./mobileStudyDesk";
import { mobileReaderPoseLayout, type MobileReaderPoseLayoutInput } from "./mobileReaderPoseLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";

const find = (posture: string, orientation: string) =>
  fixture.measurements.find((m) => m.screen === "iphone-duo-inner" && m.pose === posture && m.orientation === orientation)!;
const layoutFor = (m: (typeof fixture.measurements)[number], vertical: boolean): MobileWindowLayout => {
  const regions = m.regions.map((r, i) => ({ id: `${r.kind}-${i}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width, height: m.bounds.height, supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
    verticalBarEdge: vertical ? "trailing" : null, layoutDirection: "ltr", safeAreaInsets: m.insets,
  };
};
const pose = (layout: MobileWindowLayout, overrides: Partial<MobileReaderPoseLayoutInput> = {}) =>
  mobileReaderPoseLayout({
    layout,
    fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 },
    paged: true,
    pageCount: 10,
    twoPage: false,
    rtl: true,
    learningOpen: true,
    ...overrides,
  });

describe("study desk pose (measured iPhone Duo)", () => {
  test("half-folded portrait docks the desk in the whole bottom pane; open landscape does not", () => {
    const notebook = pose(layoutFor(find("partially-folded", "portrait"), false));
    expect(isMobileStudyDeskPose(notebook)).toBe(true);
    if (notebook.learning.presentation !== "docked") throw new Error("expected dock");
    // Below the 40pt fold band (455.5–495.5), inside the 34pt home-indicator inset.
    expect(notebook.learning.frame.y).toBeGreaterThanOrEqual(495.5);
    expect(notebook.learning.frame.y + notebook.learning.frame.height).toBeLessThanOrEqual(951 - 34);
    expect(isMobileStudyDeskPose(pose(layoutFor(find("open", "landscape-left"), true)))).toBe(false);
  });

  test("half-folded portrait in scroll mode: the strip spans both panes and the fold band is the measured division", () => {
    const strip = pose(layoutFor(find("partially-folded", "portrait"), false), { paged: false, learningOpen: false });
    expect(strip.stage).toEqual({ x: 0, y: 0, width: 669, height: 951 });
    expect(strip.foldBand).toEqual({ x: 0, y: 455.5, width: 669, height: 40 });
    expect(isMobileStudyDeskPose(strip)).toBe(false);
  });
});
