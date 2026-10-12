import { describe, expect, test } from "bun:test";
import {
  mobileDualReaderFabArea,
  mobileDualReaderFabClamp,
  mobileDualReaderFabDefault,
  mobileDualReaderFabSnap,
} from "./mobileDualReaderFabLayout";
import { mobileReaderPoseLayout } from "./mobileReaderPoseLayout";
import type { MobileWindowLayout } from "./mobileWindowLayout";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";

const SIZE = 48;
const MARGIN = 12;

function duo(screen: string, posture: string, orientation: string): MobileWindowLayout {
  const m = fixture.measurements.find((e) => e.screen === screen && e.pose === posture && e.orientation === orientation)!;
  const regions = m.regions.map((r, i) => ({ id: `${r.kind}-${i}`, active: r.active, ...r.frame }));
  return {
    width: m.bounds.width, height: m.bounds.height, supported: true,
    divisions: regions.filter((_, i) => m.regions[i].kind === "division"),
    occlusions: regions.filter((_, i) => m.regions[i].kind === "occlusion"),
    verticalBarEdge: screen === "iphone-duo-outer" || m.bounds.width > m.bounds.height ? "trailing" : null,
    layoutDirection: "ltr",
    safeAreaInsets: m.insets,
  };
}

function areaFor(layout: MobileWindowLayout, twoPage = false) {
  const pose = mobileReaderPoseLayout({ layout, fallbackInsets: { top: 0, left: 0, bottom: 0, right: 0 }, paged: true, pageCount: 10, twoPage, rtl: false });
  return {
    pose,
    area: mobileDualReaderFabArea({
      chrome: pose.chrome.kind === "capsules" ? { kind: "capsules", content: pose.chrome.content } : { kind: pose.chrome.kind },
      stage: pose.stage, modalFrame: pose.modalFrame, bounds: pose.bounds, safeInsets: pose.safeInsets,
    }),
  };
}

describe("dual-reader FAB area", () => {
  test("closed display: the FAB rests inside the safe area, clear of the bar column", () => {
    const { area } = areaFor(duo("iphone-duo-outer", "closed", "portrait"));
    const right = mobileDualReaderFabDefault(area, SIZE, MARGIN);
    expect(right.x + SIZE).toBeLessThanOrEqual(466 - 84);
  });

  test("capsule chrome: the FAB stays between the capsule row and the scrubber", () => {
    const { pose, area } = areaFor(duo("iphone-duo-inner", "open", "landscape-left"));
    if (pose.chrome.kind !== "capsules") throw new Error("expected capsules");
    const top = mobileDualReaderFabClamp({ x: 0, y: -100, side: "right" }, area, SIZE, MARGIN);
    const bottom = mobileDualReaderFabClamp({ x: 0, y: 5000, side: "right" }, area, SIZE, MARGIN);
    expect(top.y).toBeGreaterThanOrEqual(pose.chrome.back.y + pose.chrome.back.height);
    expect(bottom.y + SIZE).toBeLessThanOrEqual(pose.chrome.scrubber.y);
  });

  test("book: confined to the chrome pane, clear of the fold", () => {
    const { area } = areaFor(duo("iphone-duo-inner", "partially-folded", "landscape-left"), true);
    for (const side of ["left", "right"] as const) {
      const pos = mobileDualReaderFabClamp({ x: 0, y: 300, side }, area, SIZE, MARGIN);
      const overlapsFold = pos.x < 495.5 && pos.x + SIZE > 455.5;
      expect(overlapsFold).toBe(false);
    }
  });

  test("notebook: over the page pane, not the console", () => {
    const { pose, area } = areaFor(duo("iphone-duo-inner", "partially-folded", "portrait"));
    const pos = mobileDualReaderFabClamp({ x: 0, y: 2000, side: "right" }, area, SIZE, MARGIN);
    expect(pos.y + SIZE).toBeLessThanOrEqual(pose.stage.y + pose.stage.height);
  });

  test("phone: the window inside the safe area (today's behaviour)", () => {
    const area = mobileDualReaderFabArea({
      chrome: { kind: "horizontal" },
      stage: { x: 0, y: 0, width: 402, height: 874 },
      modalFrame: { x: 0, y: 0, width: 402, height: 874 },
      bounds: { x: 0, y: 0, width: 402, height: 874 },
      safeInsets: { top: 62, left: 0, bottom: 34, right: 0 },
    });
    expect(area).toEqual({ x: 0, y: 62, width: 402, height: 874 - 62 - 34 });
  });

  test("snap picks the nearer edge of the area", () => {
    const area = { x: 100, y: 0, width: 300, height: 600 };
    expect(mobileDualReaderFabSnap({ x: 120, y: 50 }, area, SIZE, MARGIN)).toEqual({ x: 112, y: 50, side: "left" });
    expect(mobileDualReaderFabSnap({ x: 330, y: 900 }, area, SIZE, MARGIN)).toEqual({ x: 400 - 12 - 48, y: 600 - 12 - 48, side: "right" });
  });
});
