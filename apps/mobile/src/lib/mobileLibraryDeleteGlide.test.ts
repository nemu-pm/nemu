import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

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
    const arm = glide.indexOf("setGridGlideFrom(from);");
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
    expect(animations.match(/gridGlideActive\.getBlocking\(\) && !poseReduceMotion\.value/g)?.length).toBe(2);
  });
});
