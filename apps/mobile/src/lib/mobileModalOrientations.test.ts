import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { MOBILE_MODAL_SUPPORTED_ORIENTATIONS } from "./mobileModalOrientations";

const SRC_ROOT = path.join(import.meta.dir, "..");
const APP_ROOT = path.join(import.meta.dir, "..", "..", "app");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".tsx"))
    .filter((entry) => !entry.includes(".test."))
    .map((entry) => path.join(root, entry));
}

/** Every `<Modal …>` opening tag (props may span lines) in the app sources. */
function modalOpeningTags(): { file: string; tag: string }[] {
  const tags: { file: string; tag: string }[] = [];
  for (const file of [...sourceFiles(SRC_ROOT), ...sourceFiles(APP_ROOT)]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<Modal\b[\s\S]*?>/g)) {
      tags.push({ file: path.relative(SRC_ROOT, file), tag: match[0] });
    }
  }
  return tags;
}

describe("MOBILE_MODAL_SUPPORTED_ORIENTATIONS", () => {
  test("covers portrait and both landscape orientations", () => {
    expect(MOBILE_MODAL_SUPPORTED_ORIENTATIONS).toContain("portrait");
    expect(MOBILE_MODAL_SUPPORTED_ORIENTATIONS).toContain("landscape-left");
    expect(MOBILE_MODAL_SUPPORTED_ORIENTATIONS).toContain("landscape-right");
  });

  test("every React Native Modal declares the shared orientations", () => {
    // RN's iOS Modal defaults to portrait-only: in landscape it rotates the
    // app, or crashes when the scene is landscape-locked.
    const missing = modalOpeningTags()
      .filter(
        ({ tag }) =>
          !tag.includes(
            "supportedOrientations={MOBILE_MODAL_SUPPORTED_ORIENTATIONS}",
          ),
      )
      .map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});
