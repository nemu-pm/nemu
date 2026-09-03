import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// The hook itself pulls in react-native-reanimated, which cannot load under
// the Bun test runner, so these are source-parity assertions in the style of
// the other mobile layout tests.
const SKELETON_COMPONENTS = [
  "MobileLibrarySkeleton.tsx",
  "MobileSearchSkeleton.tsx",
  "MobileBrowseSkeleton.tsx",
  "MobileSettingsSkeleton.tsx",
  "MobileMangaPageSkeleton.tsx",
] as const;

function readComponent(name: string): string {
  return readFileSync(path.join(import.meta.dir, "../components", name), "utf8");
}

const hookSource = readFileSync(
  path.join(import.meta.dir, "useSkeletonPulse.ts"),
  "utf8",
);

describe("useSkeletonPulse", () => {
  test("breathes 1 → 0.55 → 1 over 1.2s and settles under reduce motion", () => {
    expect(hookSource).toContain("minOpacity: 0.55");
    expect(hookSource).toContain("maxOpacity: 1,");
    expect(hookSource).toContain("halfCycleMs: 600");
    expect(hookSource).toContain("reduceMotionOpacity: 0.78");
    expect(hookSource).toContain("reduceMotionSettleMs: 120");
  });

  test("holds placeholders back for the classic 150ms threshold", () => {
    expect(hookSource).toContain("SKELETON_DISPLAY_DELAY_MS = 150");
    expect(hookSource).toContain("delayMs = SKELETON_DISPLAY_DELAY_MS");
  });

  test("keeps the pulse and the delay in one module", () => {
    expect(hookSource).toContain("export function useSkeletonPulse");
    expect(hookSource).toContain("export function useSkeletonDisplayDelay");
  });
});

describe("skeleton components", () => {
  test("every skeleton drives the shared pulse and the display delay", () => {
    for (const name of SKELETON_COMPONENTS) {
      const source = readComponent(name);
      expect(source).toContain("useSkeletonPulse(reduceMotion === true)");
      expect(source).toContain("useSkeletonDisplayDelay(150)");
    }
  });

  test("no skeleton pins a static opacity that fights the animated one", () => {
    for (const name of SKELETON_COMPONENTS) {
      // MobileBrowseSkeleton is the reference implementation and keeps its
      // tonal opacities; every other skeleton derives contrast from color.
      if (name === "MobileBrowseSkeleton.tsx") continue;
      expect(readComponent(name)).not.toContain("opacity: 0.");
    }
  });

  test("library and search cards reserve MangaCard's copy block", () => {
    for (const name of [
      "MobileLibrarySkeleton.tsx",
      "MobileSearchSkeleton.tsx",
    ]) {
      const source = readComponent(name);
      expect(source).toContain("minHeight: 60");
      expect(source).toContain("marginTop: 8");
    }
  });

  test("chapter placeholders match MobileChapterCell geometry", () => {
    const source = readComponent("MobileMangaPageSkeleton.tsx");
    expect(source).toContain("minHeight: 52");
    expect(source).toContain('flexBasis: "48%"');
  });

  test("settings rows use the real 68/72pt heights and icon frames", () => {
    const source = readComponent("MobileSettingsSkeleton.tsx");
    expect(source).toContain("minHeight: 72");
    expect(source).toContain("minHeight: 68");
    expect(source).toContain("size?: 24 | 34 | 40");
    expect(source).not.toContain("width: 44");
  });
});
