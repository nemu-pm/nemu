import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobilePoseFlipStart, MOBILE_MOTION, shouldMobilePoseSizeSpring } from "./mobileMotion";

// Build 9 (Duo sim): unfolding the Library dropped the page 38 pt in one frame;
// the source home's cards resized in one or two frames. Folding hid the same snaps under the system's own fold
// animation. Everything a fold or an unfold moves must glide on the pose
// spring: list rows under the header, the sections inside it, cell contents
// sized from a prop.
const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");

describe("unfolding glides like folding (build 9 E)", () => {
  test("the Library's rows glide to their new y under the header (pose list cells)", () => {
    const library = read("../screens/LibraryScreen.tsx");
    expect(library).toContain("CellRendererComponent={MobilePoseListCell}");
    // Grid cells spring their content from the old width.
    expect(library).toContain("contentSize={gridItemWidth}");
  });

  test("the source home's cards spring from their old size with their cells", () => {
    const browse = read("../screens/SourceBrowseScreen.tsx");
    expect(browse).toMatch(/<MobilePoseLayoutView\s+key=\{item\.id\}[^>]*style=\{gridItemStyleAt\(index\)\}\s+contentSize=\{gridItemWidth\}\s*>/);
    expect(browse).toContain("CellRendererComponent={MobilePoseListCell}");
  });

  test("the size-spring view scales from the leading corner in its own layout transition (same mount as the new size)", () => {
    const view = read("../components/MobilePoseLayoutView.tsx");
    expect(view).toContain("layout={layout ? mobilePoseSizeFlipTransition : undefined} style={styles.leadingOrigin}");
    expect(view).toContain('transformOrigin: "left top"');
    // No JS-written scale racing the mount (build 9 r3 4b).
    expect(view).not.toContain("useMobilePoseSizeSpring(");
    const animations = read("./mobilePoseLayoutAnimations.ts");
    expect(animations).toContain('export const mobilePoseSizeFlipTransition = makeMobilePoseFlipTransition("leading");');
    // The frame is left to React (no originX/width in the FLIP): only the transform springs.
    const flip = animations.slice(animations.indexOf("function makeMobilePoseFlipTransition"), animations.indexOf("export const mobilePoseSizeFlipTransition"));
    expect(flip).not.toMatch(/originX:|originY:|width: with|height: with/);
    expect(flip).toContain("{ scale: withSpring(1, SPRING) }");
  });

  test("a FLIP start draws the view where and at the size it was; identity outside a pose change", () => {
    const half = { x: 10, y: 20, width: 173, height: 115 };
    const flat = { x: 30, y: 20, width: 197, height: 131 };
    const leading = getMobilePoseFlipStart(half, flat, "leading", true, false);
    expect(leading.scale).toBeCloseTo(173 / 197, 6);
    expect(leading.translateX).toBe(-20);
    expect(leading.translateY).toBe(0);
    // About the centre: the old centre, at the old size.
    const centre = getMobilePoseFlipStart(half, flat, "centre", true, false);
    expect(flat.x + flat.width / 2 + centre.translateX).toBe(half.x + half.width / 2);
    expect(flat.y + flat.height / 2 + centre.translateY).toBe(half.y + half.height / 2);
    expect(flat.width * centre.scale).toBeCloseTo(half.width, 6);
    const identity = { translateX: 0, translateY: 0, scale: 1 };
    expect(getMobilePoseFlipStart(half, flat, "centre", false, false)).toEqual(identity);
    expect(getMobilePoseFlipStart(half, flat, "centre", true, true)).toEqual(identity);
    expect(getMobilePoseFlipStart({ ...flat, x: 0 }, flat, "centre", true, false)).toEqual(identity); // moved only
    expect(getMobilePoseFlipStart({ ...half, width: 0 }, flat, "leading", true, false)).toEqual(identity);
  });

  test("the Sources tab's rows follow their column's width: re-laid out on the spring, not snapped (build 9 r2 5c)", () => {
    const browse = read("../screens/BrowseScreen.tsx");
    expect(browse).toContain('<MobilePoseWidthSpringView width={column.width} style={styles.sourceColumn}>');
    // The column frame keeps its own transition (position, fading panes).
    expect(browse).toContain("style={{ width: column.width, marginLeft: column.marginLeft }}");
    const view = read("../components/MobilePoseLayoutView.tsx");
    expect(view).toContain("useMobilePoseWidthSpring(width)");
    const spring = read("./useMobilePoseSizeSpring.ts");
    expect(spring).toContain("useAnimatedStyle(() => ({ width: animated.value }))");
    // Retargeting continues from what is on screen (no reset to the old width).
    expect(spring).toContain("animated.value = withSpring(width, { ...MOBILE_MOTION.settleSpring });");
  });

  test("the pose window's UI flag is up before the commit that opens it (build 9 r3 4c: a 24 pt one-frame snap, 1 in 4)", () => {
    const animations = read("./mobilePoseLayoutAnimations.ts");
    // A synchronizable written while rendering, not a shared value queued on
    // the UI runtime in a microtask after React's commit.
    expect(animations).toContain("const poseMotionActive = createSynchronizable(false, { fixedType: true });");
    expect(animations).toContain("poseMotionActive.setBlocking(true);");
    expect(animations).toContain("poseMotionActive.setBlocking(false);");
    expect(animations).not.toContain("runOnUI(");
    expect(animations).not.toContain("poseMotionActive.value");
    // Every pose layout animation reads it at its start.
    expect(animations.match(/poseMotionActive\.getBlocking\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test("a size glides only inside a pose change, between measured sizes, without Reduce Motion", () => {
    expect(shouldMobilePoseSizeSpring(454, 437, true, false)).toBe(true);
    expect(shouldMobilePoseSizeSpring(437, 454, true, false)).toBe(true); // folding too
    expect(shouldMobilePoseSizeSpring(454, 437, false, false)).toBe(false);
    expect(shouldMobilePoseSizeSpring(454, 437, true, true)).toBe(false);
    expect(shouldMobilePoseSizeSpring(0, 437, true, false)).toBe(false); // first measurement
    expect(shouldMobilePoseSizeSpring(437.2, 437, true, false)).toBe(false);
  });

  test("on the settle spring a 17 pt width change moves at most 11 pt between two 30 fps frames", () => {
    const { stiffness, damping, mass } = MOBILE_MOTION.settleSpring;
    let x = 17;
    let v = 0;
    const dt = 1 / 1000;
    const positions: number[] = [];
    for (let ms = 0; ms <= 1000; ms += 1) {
      if (ms % 35 === 0) positions.push(x);
      const a = (-stiffness * x - damping * v) / mass;
      v += a * dt;
      x += v * dt;
    }
    const steps = positions.slice(1).map((p, i) => Math.abs(p - positions[i]));
    expect(Math.max(...steps)).toBeLessThanOrEqual(11);
    expect(Math.abs(positions[positions.length - 1])).toBeLessThan(0.5);
  });
});
