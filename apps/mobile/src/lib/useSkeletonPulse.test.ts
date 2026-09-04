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
  test("stops the infinite repeat when the host is no longer loading", () => {
    expect(hookSource).toContain(
      "export function useSkeletonPulse(reduceMotion: boolean, active = true)",
    );
    // The `!active` branch has to cancel before the repeat is ever scheduled,
    // otherwise `withRepeat(…, -1)` keeps running for the host's whole life.
    const activeGuard = hookSource.indexOf("if (!active) {");
    expect(activeGuard).toBeGreaterThan(-1);
    expect(activeGuard).toBeLessThan(hookSource.indexOf("withRepeat("));
    expect(hookSource).toContain("cancelAnimation(opacity);");
    expect(hookSource).toContain("}, [active, opacity, reduceMotion]);");
  });

  test("long-lived hosts gate the pulse on their own loading flag", () => {
    const gallery = readFileSync(
      path.join(import.meta.dir, "../components/reader/MobileReaderGallery.tsx"),
      "utf8",
    );
    expect(gallery).toContain("reduceMotion === true,\n    isReaderLoading,");
    const storage = readFileSync(
      path.join(import.meta.dir, "../components/MobileStorageBreakdown.tsx"),
      "utf8",
    );
    expect(storage).toContain("useSkeletonPulse(reduceMotion === true, loading)");
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
      // tonal opacities, but only through the shared named constants; every
      // other skeleton derives contrast from color.
      expect(readComponent(name)).not.toContain("opacity: 0.");
    }
    expect(readComponent("MobileBrowseSkeleton.tsx")).toContain(
      "opacity: SKELETON_SURFACE_OPACITY",
    );
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
