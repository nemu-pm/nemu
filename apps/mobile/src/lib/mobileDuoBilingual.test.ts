import { afterEach, describe, expect, test } from "bun:test";
import fixture from "../../../../tests/fixtures/iphone-duo/safearea-measurements.json";
import type { MobileWindowLayout } from "@/lib/mobileWindowLayout";
import {
  getMobileDuoBilingualChoice,
  isMobileDuoDualReaderConfigured,
  mobileDuoBilingualAssignPanes,
  mobileDuoBilingualEligibility,
  mobileDuoBilingualFromReaderPose,
  mobileDuoBilingualStageOverrides,
  resolveMobileDuoBilingualMode,
  setMobileDuoBilingualChoice,
  subscribeMobileDuoBilingualChoice,
} from "./mobileDuoBilingual";

// iPhone Duo inner display in book posture: 951×669 with a vertical fold
// region (already including Apple's interaction margins) at x 463…488.
const duoBook: MobileWindowLayout = {
  width: 951,
  height: 669,
  supported: true,
  divisions: [{ id: "fold", active: true, x: 463, y: 0, width: 25, height: 669 }],
  occlusions: [],
};
const duoFlatLandscape: MobileWindowLayout = {
  width: 951,
  height: 669,
  supported: true,
  divisions: [{ id: "fold", active: false, x: 463, y: 0, width: 25, height: 669 }],
  occlusions: [],
};
const duoNotebook: MobileWindowLayout = {
  width: 669,
  height: 951,
  supported: true,
  divisions: [{ id: "fold", active: true, x: 0, y: 463, width: 669, height: 25 }],
  occlusions: [],
};
const duoOuter: MobileWindowLayout = { width: 466, height: 678, supported: true, divisions: [], occlusions: [] };
const duoOuterLandscape: MobileWindowLayout = { width: 678, height: 466, supported: true, divisions: [], occlusions: [] };
const duoInnerPortrait: MobileWindowLayout = { width: 669, height: 951, supported: true, divisions: [], occlusions: [] };

const base = { rtl: true, paged: true, dualReaderConfigured: true } as const;

describe("isMobileDuoDualReaderConfigured", () => {
  test("needs enabled + secondary source + seed pair", () => {
    const source = { id: "s" };
    const seed = { primaryId: "a", secondaryId: "b" };
    expect(isMobileDuoDualReaderConfigured({ enabled: true, secondarySource: source, seedPair: seed })).toBe(true);
    expect(isMobileDuoDualReaderConfigured({ enabled: false, secondarySource: source, seedPair: seed })).toBe(false);
    expect(isMobileDuoDualReaderConfigured({ enabled: true, secondarySource: null, seedPair: seed })).toBe(false);
    expect(isMobileDuoDualReaderConfigured({ enabled: true, secondarySource: source, seedPair: null })).toBe(false);
  });
});

describe("mobileDuoBilingualAssignPanes", () => {
  const left = { x: 0, y: 0, width: 100, height: 100 };
  const right = { x: 100, y: 0, width: 100, height: 100 };
  test("RTL puts the primary on the right (reading-start side)", () => {
    expect(mobileDuoBilingualAssignPanes([left, right], true)).toEqual({
      primary: right, secondary: left, primarySide: "right", secondarySide: "left",
    });
  });
  test("LTR puts the primary on the left", () => {
    expect(mobileDuoBilingualAssignPanes([left, right], false)).toEqual({
      primary: left, secondary: right, primarySide: "left", secondarySide: "right",
    });
  });
});

describe("mobileDuoBilingualEligibility", () => {
  test("book posture: one pane per physical half, clear of the fold", () => {
    const result = mobileDuoBilingualEligibility({ ...base, layout: duoBook });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.layout.posture).toBe("book");
    expect(result.layout.panes).toEqual([
      { x: 0, y: 0, width: 463, height: 669 },
      { x: 488, y: 0, width: 463, height: 669 },
    ]);
    expect(result.layout.primarySide).toBe("right");
    expect(result.layout.primary).toEqual({ x: 488, y: 0, width: 463, height: 669 });
    expect(result.layout.spine).toEqual({ start: 463, end: 488 });
    expect(result.layout.stage).toEqual({ x: 0, y: 0, width: 951, height: 669 });
  });

  test("book posture LTR: primary on the left", () => {
    const result = mobileDuoBilingualEligibility({ ...base, rtl: false, layout: duoBook });
    expect(result.eligible && result.layout.primary.x).toBe(0);
  });

  test("book posture keeps panes clear of an active inner-camera occlusion", () => {
    const result = mobileDuoBilingualEligibility({
      ...base,
      layout: { ...duoBook, occlusions: [{ id: "cam", active: true, x: 900, y: 0, width: 51, height: 60 }] },
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    const right = result.layout.panes[1];
    // The unoccluded rect never intersects the camera.
    const intersects = right.x < 951 && right.x + right.width > 900 && right.y < 60 && right.y + right.height > 0;
    expect(intersects).toBe(false);
  });

  test("flat regular-width landscape: equal halves meeting at the centre", () => {
    const result = mobileDuoBilingualEligibility({ ...base, layout: duoFlatLandscape });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.layout.posture).toBe("flat");
    expect(result.layout.panes).toEqual([
      { x: 0, y: 0, width: 475, height: 669 },
      { x: 475, y: 0, width: 476, height: 669 },
    ]);
    expect(result.layout.spine).toEqual({ start: 475, end: 475 });
  });

  test("flat halves stay inside the horizontal safe area", () => {
    const result = mobileDuoBilingualEligibility({
      ...base,
      layout: { ...duoFlatLandscape, safeAreaInsets: { top: 0, bottom: 20, left: 0, right: 60 } },
    });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.layout.stage).toEqual({ x: 0, y: 0, width: 891, height: 669 });
    expect(result.layout.panes[1].x + result.layout.panes[1].width).toBe(891);
  });

  test("flat halves respect a narrowed available area (docked side panel)", () => {
    const narrow = mobileDuoBilingualEligibility({
      ...base,
      layout: duoFlatLandscape,
      available: { x: 0, y: 0, width: 500, height: 669 },
    });
    expect(narrow).toEqual({ eligible: false, reason: "panesTooSmall" });
    const roomy = mobileDuoBilingualEligibility({
      ...base,
      layout: { ...duoFlatLandscape, width: 1366, height: 1024 },
      available: { x: 0, y: 0, width: 926, height: 1024 },
    });
    expect(roomy.eligible).toBe(true);
  });

  test("outer display and phone landscape (compact) fall back", () => {
    expect(mobileDuoBilingualEligibility({ ...base, layout: duoOuter })).toEqual({ eligible: false, reason: "compact" });
    // 678pt is a regular width, but 466pt is a compact height.
    expect(mobileDuoBilingualEligibility({ ...base, layout: duoOuterLandscape }))
      .toEqual({ eligible: false, reason: "compact" });
    const phoneLandscape: MobileWindowLayout = { width: 874, height: 402, supported: true, divisions: [], occlusions: [] };
    expect(mobileDuoBilingualEligibility({ ...base, layout: phoneLandscape }))
      .toEqual({ eligible: false, reason: "compact" });
  });

  test("tablet landscape is eligible", () => {
    const tablet: MobileWindowLayout = { width: 1366, height: 1024, supported: false, divisions: [], occlusions: [] };
    expect(mobileDuoBilingualEligibility({ ...base, layout: tablet }).eligible).toBe(true);
  });

  test("flat inner portrait is not a side-by-side window", () => {
    expect(mobileDuoBilingualEligibility({ ...base, layout: duoInnerPortrait })).toEqual({ eligible: false, reason: "portrait" });
  });

  test("notebook posture belongs to the study desk", () => {
    expect(mobileDuoBilingualEligibility({ ...base, layout: duoNotebook })).toEqual({ eligible: false, reason: "notebook" });
  });

  test("requires a configured dual reader and a paged presentation", () => {
    expect(mobileDuoBilingualEligibility({ ...base, dualReaderConfigured: false, layout: duoBook }))
      .toEqual({ eligible: false, reason: "notConfigured" });
    expect(mobileDuoBilingualEligibility({ ...base, paged: false, layout: duoBook }))
      .toEqual({ eligible: false, reason: "notPaged" });
  });

  test("a docked learning panel in the other pane blocks it", () => {
    expect(mobileDuoBilingualEligibility({ ...base, layout: duoBook, secondPaneOccupied: true }))
      .toEqual({ eligible: false, reason: "blocked" });
  });

  test("tiny book halves are rejected", () => {
    const layout: MobileWindowLayout = {
      width: 600, height: 400, supported: true, occlusions: [],
      divisions: [{ id: "fold", active: true, x: 150, y: 0, width: 10, height: 400 }],
    };
    expect(mobileDuoBilingualEligibility({ ...base, layout })).toEqual({ eligible: false, reason: "panesTooSmall" });
  });
});

describe("resolveMobileDuoBilingualMode", () => {
  test("defaults to side by side when eligible", () => {
    expect(resolveMobileDuoBilingualMode({ eligible: true, choice: null }))
      .toEqual({ mode: "sideBySide", sideBySide: true, showToggle: true });
  });
  test("an explicit Spread choice wins", () => {
    expect(resolveMobileDuoBilingualMode({ eligible: true, choice: "spread" }))
      .toEqual({ mode: "spread", sideBySide: false, showToggle: true });
  });
  test("ineligible windows hide the toggle but remember the choice", () => {
    expect(resolveMobileDuoBilingualMode({ eligible: false, choice: "sideBySide" }))
      .toEqual({ mode: "sideBySide", sideBySide: false, showToggle: false });
  });
});

describe("session choice store", () => {
  afterEach(() => setMobileDuoBilingualChoice(null));
  test("notifies subscribers once per change", () => {
    let calls = 0;
    const unsubscribe = subscribeMobileDuoBilingualChoice(() => {
      calls += 1;
    });
    setMobileDuoBilingualChoice("spread");
    setMobileDuoBilingualChoice("spread");
    expect(getMobileDuoBilingualChoice()).toBe("spread");
    setMobileDuoBilingualChoice("sideBySide");
    unsubscribe();
    setMobileDuoBilingualChoice(null);
    expect(calls).toBe(2);
  });
});

// --- Measured iPhone Duo geometry (safearea.info, Xcode 27.1 simulator) ------
type Measurement = (typeof fixture.measurements)[number];

function toLayout(m: Measurement): MobileWindowLayout {
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

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("bilingual eligibility on measured iPhone Duo poses", () => {
  for (const m of fixture.measurements) {
    const landscape = m.bounds.width > m.bounds.height;
    const expected = m.screen === "iphone-duo-outer"
      ? "compact"
      : m.pose === "partially-folded"
        ? landscape ? "book" : "notebook"
        : landscape ? "flat" : "portrait";
    test(`${m.screen} ${m.pose} ${m.orientation} → ${expected}`, () => {
      const layout = toLayout(m);
      const result = mobileDuoBilingualEligibility({ ...base, layout });
      if (expected === "compact" || expected === "notebook" || expected === "portrait") {
        expect(result).toEqual({ eligible: false, reason: expected });
        return;
      }
      expect(result.eligible).toBe(true);
      if (!result.eligible) return;
      expect(result.layout.posture).toBe(expected);
      const [left, right] = result.layout.panes;
      const activeOcclusions = layout.occlusions.filter((o) => o.active);
      for (const pane of [left, right]) {
        // Inside the safe area horizontally, clear of every active occlusion.
        expect(pane.x).toBeGreaterThanOrEqual(m.insets.left);
        expect(pane.x + pane.width).toBeLessThanOrEqual(m.bounds.width - m.insets.right);
        for (const occlusion of activeOcclusions) expect(overlaps(pane, occlusion)).toBe(false);
        expect(pane.width).toBeGreaterThanOrEqual(280);
        expect(pane.height).toBe(m.bounds.height);
      }
      if (expected === "book") {
        // Nothing on the 455.5–495.5 fold (margins included).
        expect(left.x + left.width).toBeLessThanOrEqual(455.5);
        expect(right.x).toBeGreaterThanOrEqual(495.5);
        expect(result.layout.spine).toEqual({ start: 455.5, end: 495.5 });
        // Trailing 84pt bar column trimmed; the status occlusion lives in it.
        expect(right).toEqual({ x: 495.5, y: 0, width: 371.5, height: 669 });
      } else {
        expect(result.layout.spine.start).toBe(433);
        expect(right.x + right.width).toBe(867);
      }
      expect(result.layout.primarySide).toBe("right");
    });
  }
});

describe("mobileDuoBilingualFromReaderPose", () => {
  const bookPose = {
    posture: "book" as const,
    bounds: { x: 0, y: 0, width: 951, height: 669 },
    stage: { x: 0, y: 0, width: 951, height: 669 },
    spread: true,
    spreadSlots: [
      { x: 0, y: 0, width: 455.5, height: 669 },
      { x: 495.5, y: 0, width: 371.5, height: 669 },
    ],
    learning: { presentation: "sheet" },
  };
  const opts = { rtl: true, paged: true, dualReaderConfigured: true };

  test("book spread slots become the panes", () => {
    const result = mobileDuoBilingualFromReaderPose({ ...opts, pose: bookPose });
    expect(result.eligible).toBe(true);
    if (!result.eligible) return;
    expect(result.layout.panes).toEqual([bookPose.spreadSlots[0], bookPose.spreadSlots[1]]);
    expect(result.layout.primary).toEqual(bookPose.spreadSlots[1]);
    expect(result.layout.spine).toEqual({ start: 455.5, end: 495.5 });
  });

  test("slots are converted from stage-local to reader coordinates", () => {
    const result = mobileDuoBilingualFromReaderPose({
      ...opts,
      pose: { ...bookPose, stage: { x: 10, y: 20, width: 931, height: 649 } },
    });
    expect(result.eligible && result.layout.panes[1].x).toBe(505.5);
  });

  test("flat spread halves the stage", () => {
    const result = mobileDuoBilingualFromReaderPose({
      ...opts,
      pose: {
        posture: "flat",
        bounds: { x: 0, y: 0, width: 951, height: 669 },
        stage: { x: 0, y: 0, width: 867, height: 669 },
        spread: true,
        learning: { presentation: "sheet" },
      },
    });
    expect(result.eligible && result.layout.panes).toEqual([
      { x: 0, y: 0, width: 433, height: 669 },
      { x: 433, y: 0, width: 434, height: 669 },
    ]);
  });

  test("no spread: blocked by a dock, or too small; flat compact / notebook / portrait", () => {
    expect(mobileDuoBilingualFromReaderPose({ ...opts, pose: { ...bookPose, spread: false, learning: { presentation: "docked" } } }))
      .toEqual({ eligible: false, reason: "blocked" });
    expect(mobileDuoBilingualFromReaderPose({ ...opts, pose: { ...bookPose, spread: false } }))
      .toEqual({ eligible: false, reason: "panesTooSmall" });
    const flat = { ...bookPose, posture: "flat" as const, spreadSlots: undefined };
    expect(mobileDuoBilingualFromReaderPose({ ...opts, pose: { ...flat, bounds: { x: 0, y: 0, width: 678, height: 466 } } }))
      .toEqual({ eligible: false, reason: "compact" });
    expect(mobileDuoBilingualFromReaderPose({ ...opts, pose: { ...flat, bounds: { x: 0, y: 0, width: 669, height: 951 } } }))
      .toEqual({ eligible: false, reason: "portrait" });
    expect(mobileDuoBilingualFromReaderPose({ ...opts, pose: { ...bookPose, posture: "notebook" } }))
      .toEqual({ eligible: false, reason: "notebook" });
    expect(mobileDuoBilingualFromReaderPose({ ...opts, dualReaderConfigured: false, pose: bookPose }))
      .toEqual({ eligible: false, reason: "notConfigured" });
  });
});

describe("mobileDuoBilingualStageOverrides", () => {
  test("stage becomes the primary pane; rail exclusions are re-based and clipped", () => {
    const result = mobileDuoBilingualEligibility({ ...base, layout: duoBook });
    if (!result.eligible) throw new Error("expected eligible");
    const overrides = mobileDuoBilingualStageOverrides({
      layout: result.layout,
      poseStage: { x: 0, y: 0, width: 951, height: 669 },
      tapExclusions: [
        { x: 880, y: 8, width: 72, height: 500 }, // rail on the right pane
        { x: 10, y: 10, width: 40, height: 40 }, // on the secondary pane → dropped
      ],
    });
    expect(overrides.stage).toEqual(result.layout.primary);
    expect(overrides.twoPage).toBe(false);
    expect(overrides.spreadSlots).toBeUndefined();
    expect(overrides.foldGap).toBeNull();
    expect(overrides.tapExclusions).toEqual([{ x: 392, y: 8, width: 71, height: 500 }]);
  });
});
