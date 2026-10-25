import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileShelfPlankSegments, getMobileShelfRow } from "./mobileLibraryShelf";
import { MOBILE_MOTION, shouldMobilePoseSizeSpring } from "./mobileMotion";

// Build 9 (Duo sim): unfolding the Library dropped the page 38 pt in one frame
// and merged the shelf rails at once; the source home's cards resized in one
// or two frames. Folding hid the same snaps under the system's own fold
// animation. Everything a fold or an unfold moves must glide on the pose
// spring: list rows under the header, the sections inside it, cell contents
// sized from a prop, and the planks.
const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");

describe("unfolding glides like folding (build 9 E)", () => {
  test("the Library's rows glide to their new y under the header (pose list cells)", () => {
    const library = read("../screens/LibraryScreen.tsx");
    expect(library).toContain("CellRendererComponent={MobilePoseListCell}");
    // The sections under the Continue Reading card glide with it.
    expect(library).toContain("<MobilePoseLayoutView>\n                  <MobileLaunchRevealGroup group=\"collections\">");
    expect(library).toContain("<MobilePoseLayoutView>\n                  <MobileLaunchRevealGroup group=\"titlesHeader\">");
    // Grid cells spring their content from the old width.
    expect(library).toContain("contentSize={shelfMode ? undefined : cellStyle.width}");
  });

  test("a shelf cell springs its book from the top-left corner; its planks keep their identity and glide", () => {
    const cell = read("../components/explore/MobileLibraryShelfCell.tsx");
    expect(cell).toContain("<MobilePoseSizeSpringView size={coverWidth}>");
    expect(cell).toContain("key={index}");
    expect(cell).not.toContain("key={segment.x}");
    const plank = read("../components/explore/MobileShelfPlank.tsx");
    expect(plank).toContain("layout={layout}");
    expect(plank).toContain("entering={layout ? pose.entering : undefined}");
    expect(plank).toContain("exiting={layout ? pose.exiting : undefined}");
  });

  test("the source home's cards spring from their old size with their cells", () => {
    const browse = read("../screens/SourceBrowseScreen.tsx");
    expect(browse).toContain("<MobilePoseLayoutView key={item.id} style={gridItemStyleAt(index)} contentSize={gridItemWidth}>");
    expect(browse).toContain("CellRendererComponent={MobilePoseListCell}");
  });

  test("the size-spring view scales from the leading corner on the shared pose size spring", () => {
    const view = read("../components/MobilePoseLayoutView.tsx");
    expect(view).toContain("useMobilePoseSizeSpring(size)");
    expect(view).toContain('transformOrigin: "left top"');
  });

  test("merging the rails on unfold keeps the leading plank (index 0) and drops the trailing one", () => {
    const grid = { columns: 6, itemWidth: 110, columnMargins: [0, 12, 12, 126, 12, 12] };
    const half = getMobileShelfPlankSegments(getMobileShelfRow(grid, 12, 8, { start: 362, end: 474 }));
    const flat = getMobileShelfPlankSegments(
      getMobileShelfRow({ ...grid, columnMargins: [0, 12, 12, 12, 12, 12] }, 12, 8, null),
    );
    expect(half).toHaveLength(2);
    expect(flat).toHaveLength(1);
    // The same leading start: segment 0 only grows across the hinge.
    expect(flat[0].x).toBe(half[0].x);
    expect(flat[0].width).toBeGreaterThan(half[0].width);
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
