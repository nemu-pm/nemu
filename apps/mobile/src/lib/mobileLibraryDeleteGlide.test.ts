import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileListOrderChange } from "./mobileFoldAwareGrid";

// Owner, 2026-10-30: removing a title flashed the grid ("删除的话布局应该实时重新
// 计算并且有动画"). Every row after the removed title was keyed by the titles
// in it, so the removal re-keyed and remounted the rest of the grid in one
// frame, under a global opacity LayoutAnimation. The covers now glide.
const read = (file: string) => readFileSync(path.join(import.meta.dir, file), "utf8");

describe("removing a title glides the Library grid", () => {
  const library = read("../screens/LibraryScreen.tsx");

  test("rows are keyed by their place, so a removal keeps them mounted", () => {
    expect(library).toContain("(_row: LibraryEntry[], rowIndex: number) => `${collectionLayoutKey}|${rowIndex}`");
    expect(library).not.toContain("libraryRowKey(");
  });

  test("no global LayoutAnimation over the change", () => {
    expect(library).not.toContain("LayoutAnimation.configureNext");
  });

  test("the cells take the glide transition a commit before the change, then the window opens", () => {
    const glide = library.slice(library.indexOf("const glideLibraryGrid = useCallback("));
    const arm = glide.indexOf("setGridGlide(glide);");
    const prepare = glide.indexOf("await prepare();");
    const open = glide.indexOf("openMobileGridGlideWindow();");
    const change = glide.indexOf("await change();");
    expect(arm).toBeGreaterThan(-1);
    expect(arm).toBeLessThan(prepare);
    expect(prepare).toBeLessThan(open);
    expect(open).toBeLessThan(change);
    expect(library).toContain("layout: mobileGridGlideTransition,");
    expect(library).toContain("makeMobileGridGlideEntering(glideOffset)");
  });

  test("removal and Undo both glide", () => {
    expect(library.match(/glideLibraryGrid\(/g)?.length).toBe(2);
  });

  test("the glide is gated by its own synchronizable and Reduce Motion", () => {
    const animations = read("./mobilePoseLayoutAnimations.ts");
    expect(animations).toContain("const gridGlideActive = createSynchronizable(false, { fixedType: true });");
    expect(animations.match(/gridGlideActive\.getBlocking\(\) && !poseReduceMotion\.value/g)?.length).toBe(3);
  });

  // Owner, 2026-11-04: after removing the last title the empty view appeared
  // whole in one frame behind the dust ("删除全部漫画后到空视图的过渡需要自然").
  test("the empty state the last title leaves fades in, and an Undo fades it out", () => {
    const empty = library.slice(library.indexOf("ListEmptyComponent={"));
    expect(empty.match(/entering=\{mobileGridGlideEmptyEntering\}/g)?.length).toBe(2);
    expect(empty.match(/exiting=\{mobileGridGlideEmptyExiting\}/g)?.length).toBe(2);
  });

  test("the empty state's motion is gated by the glide window and Reduce Motion", () => {
    const animations = read("./mobilePoseLayoutAnimations.ts");
    const entering = animations.slice(animations.indexOf("export const mobileGridGlideEmptyEntering"));
    const exiting = animations.slice(animations.indexOf("export const mobileGridGlideEmptyExiting"));
    expect(entering.indexOf("if (!gridGlideActive.getBlocking())")).toBeLessThan(entering.indexOf("withSpring"));
    expect(entering.indexOf("if (poseReduceMotion.value)")).toBeLessThan(entering.indexOf("withSpring"));
    expect(exiting).toContain("!gridGlideActive.getBlocking()\n    ? 0");
    // Reanimated skips animations under the system Reduce Motion by default;
    // the short fade that stands in for the motion has to opt out.
    const reduced = entering.slice(entering.indexOf("if (poseReduceMotion.value)"), entering.indexOf("withSpring"));
    expect(reduced).toContain("reduceMotion: ReduceMotion.Never");
    expect(exiting.slice(0, exiting.indexOf("};"))).toContain("reduceMotion: ReduceMotion.Never");
  });

  // Owner, 2026-11-06: every state change animates ("打磨所有过渡").
  test("a change from elsewhere glides too: the old list holds a commit while the cells take the transition", () => {
    const held = library.slice(library.indexOf("const heldOrderChangeRef"));
    expect(held.indexOf("setGridGlide(glide);")).toBeLessThan(held.indexOf("requestAnimationFrame"));
    expect(held.indexOf("requestAnimationFrame")).toBeLessThan(held.indexOf("openMobileGridGlideWindow();"));
    expect(held.indexOf("openMobileGridGlideWindow();")).toBeLessThan(held.indexOf("setDrawnGrid({ entries: visibleEntries"));
    expect(library).toContain("chunkMobileGridRows(gridEntries, gridColumns)");
    expect(library).toContain("gridGlide.leaving?.has(entry.item.libraryItemId) ? mobileGridGlideVanishing : undefined");
  });

  test("a collection switch opens the window, so its empty state fades", () => {
    const seen = library.slice(library.indexOf("if (seenCollectionLayoutKey !== collectionLayoutKey)"));
    expect(seen.slice(0, seen.indexOf("}"))).toContain("openMobileGridGlideWindow();");
  });
});

describe("getMobileListOrderChange", () => {
  test("nothing moved, or an empty side, is no change", () => {
    expect(getMobileListOrderChange(["a", "b"], ["a", "b"])).toBeNull();
    expect(getMobileListOrderChange([], ["a"])).toBeNull();
    expect(getMobileListOrderChange(["a"], [])).toBeNull();
  });

  test("a reorder has old indices and nothing leaving", () => {
    const change = getMobileListOrderChange(["a", "b"], ["b", "a"])!;
    expect(change.from.get("a")).toBe(0);
    expect(change.from.get("b")).toBe(1);
    expect(change.leaving.size).toBe(0);
  });

  test("a title gone is leaving; a new one has no old index", () => {
    const change = getMobileListOrderChange(["a", "b"], ["c", "b"])!;
    expect([...change.leaving]).toEqual(["a"]);
    expect(change.from.has("c")).toBe(false);
  });
});
