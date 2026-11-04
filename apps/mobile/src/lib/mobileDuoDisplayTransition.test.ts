import { describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import { getMobileStrings } from "./mobileI18n";
import {
  mobileDuoDisplaySnapshot,
  mobileDuoDisplayTransition,
  mobileDuoHandoffMessage,
  type MobileDuoDisplay,
  type MobileDuoDisplaySnapshot,
  type MobileDuoDisplayState,
} from "./mobileDuoDisplayTransition";

const outer = (hinge: MobileDuoDisplaySnapshot["hinge"] = "closed"): MobileDuoDisplaySnapshot => ({ width: 466, height: 678, hinge });
const outerLandscape: MobileDuoDisplaySnapshot = { width: 678, height: 466, hinge: "closed" };
const innerLandscape = (hinge: MobileDuoDisplaySnapshot["hinge"] = "fullyOpen"): MobileDuoDisplaySnapshot => ({ width: 951, height: 669, hinge });
const innerPortrait: MobileDuoDisplaySnapshot = { width: 669, height: 951, hinge: "fullyOpen" };

/** Feeds snapshots in order; returns every emitted handoff (null for none). */
function run(snapshots: MobileDuoDisplaySnapshot[]): Array<MobileDuoDisplay | null> {
  let state: MobileDuoDisplayState | null = null;
  return snapshots.map((snapshot) => {
    const result = mobileDuoDisplayTransition(state, snapshot);
    state = result.state;
    return result.handoff;
  });
}

describe("mobileDuoDisplayTransition", () => {
  test("first snapshot never emits", () => {
    expect(run([outer()])).toEqual([null]);
    expect(run([innerLandscape()])).toEqual([null]);
  });

  test("Duo unfold: outer → inner emits once", () => {
    expect(run([outer(), innerLandscape("partiallyOpen"), innerLandscape("fullyOpen")])).toEqual([null, "inner", null]);
  });

  test("Duo close: inner → outer emits once", () => {
    expect(run([innerPortrait, outer()])).toEqual([null, "outer"]);
  });

  test("hinge flips before the window moves: pending until geometry confirms", () => {
    expect(run([outer("closed"), outer("partiallyOpen"), innerLandscape("partiallyOpen")])).toEqual([null, null, "inner"]);
  });

  test("window moves before the hinge reports: confirmed by the hinge flip", () => {
    expect(run([innerLandscape("partiallyOpen"), outer("partiallyOpen"), outer("closed")])).toEqual([null, null, "outer"]);
  });

  test("hinge flapping back before the move cancels the change", () => {
    expect(run([outer("closed"), outer("partiallyOpen"), outer("closed"), outer("closed")])).toEqual([null, null, null, null]);
  });

  test("rotation never emits (outer or inner)", () => {
    expect(run([outer(), outerLandscape, outer()])).toEqual([null, null, null]);
    expect(run([innerPortrait, innerLandscape(), innerPortrait])).toEqual([null, null, null]);
  });

  test("fold angle (book ↔ flat) never emits", () => {
    expect(run([innerLandscape("fullyOpen"), innerLandscape("partiallyOpen"), innerLandscape("fullyOpen")]))
      .toEqual([null, null, null]);
  });

  test("inner split view resize with the hinge open does not emit", () => {
    expect(run([innerLandscape(), { width: 420, height: 669, hinge: "fullyOpen" }])).toEqual([null, null]);
  });

  test("Android foldable: FoldingFeature disappears on the outer screen", () => {
    const androidInner = { width: 673, height: 841, hinge: "fullyOpen" as const };
    const androidOuter = { width: 384, height: 832, hinge: null };
    expect(run([androidInner, androidOuter, androidInner])).toEqual([null, "outer", "inner"]);
  });

  test("devices that never reported a hinge never emit (phones, tablets, resizable windows)", () => {
    const phone = { width: 402, height: 874, hinge: null };
    const tablet = { width: 1024, height: 1366, hinge: null };
    expect(run([phone, tablet, phone])).toEqual([null, null, null]);
  });

  test("invalid geometry keeps the previous state", () => {
    let state: MobileDuoDisplayState | null = mobileDuoDisplayTransition(null, outer()).state;
    const result = mobileDuoDisplayTransition(state, { width: 0, height: 0, hinge: "closed" });
    expect(result.handoff).toBeNull();
    expect(result.state).toEqual(state);
    state = result.state;
    expect(mobileDuoDisplayTransition(state, innerLandscape()).handoff).toBe("inner");
  });

  test("snapshot adapter normalises a missing hinge and flags fold regions", () => {
    expect(mobileDuoDisplaySnapshot({ width: 1, height: 2, hinge: null }))
      .toEqual({ width: 1, height: 2, hinge: null, hasFold: false });
    expect(mobileDuoDisplaySnapshot({ width: 1, height: 2, divisions: [{}] }).hasFold).toBe(true);
  });
});

describe("measured iPhone Duo sizes without a hinge state (older natives)", () => {
  type Measurement = (typeof fixture.measurements)[number];
  const find = (screen: string, pose: string, orientation: string): MobileDuoDisplaySnapshot => {
    const m = fixture.measurements.find((item: Measurement) =>
      item.screen === screen && item.pose === pose && item.orientation === orientation)!;
    return mobileDuoDisplaySnapshot({
      width: m.bounds.width,
      height: m.bounds.height,
      hinge: null,
      divisions: m.regions.filter((r) => r.kind === "division"),
    });
  };
  const closedPortrait = find("iphone-duo-outer", "closed", "portrait");
  const closedLandscapeRight = find("iphone-duo-outer", "closed", "landscape-right");
  const openLandscape = find("iphone-duo-inner", "open", "landscape-left");
  const book = find("iphone-duo-inner", "partially-folded", "landscape-left");
  const openPortrait = find("iphone-duo-inner", "open", "portrait");

  test("outer has no fold region; the inner display reports one even when inactive", () => {
    expect(closedPortrait.hasFold).toBe(false);
    expect(openLandscape.hasFold).toBe(true);
  });

  test("launch closed, unfold, fold to book, close again", () => {
    expect(run([closedPortrait, openLandscape, book, closedLandscapeRight])).toEqual([null, "inner", null, "outer"]);
  });

  test("rotation on either display never emits", () => {
    expect(run([closedPortrait, closedLandscapeRight, closedPortrait])).toEqual([null, null, null]);
    expect(run([openPortrait, openLandscape, openPortrait])).toEqual([null, null, null]);
  });
});

describe("mobileDuoHandoffMessage", () => {
  test("formats with and without a page in every locale", () => {
    const en = getMobileStrings("en").duo;
    expect(mobileDuoHandoffMessage(en, "outer", 12)).toBe("Continued on outer display · p.12");
    expect(mobileDuoHandoffMessage(en, "inner", null)).toBe("Continued on inner display");
    expect(mobileDuoHandoffMessage(en, "inner", 0)).toBe("Continued on inner display");
    expect(mobileDuoHandoffMessage(getMobileStrings("ja").duo, "outer", 3)).toBe("外側ディスプレイで続行 · 3ページ");
    expect(mobileDuoHandoffMessage(getMobileStrings("zh").duo, "inner", 7)).toBe("已在内屏继续 · 第 7 页");
  });
});
