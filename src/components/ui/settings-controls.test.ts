import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

const locales = { en, ja, zh } as const;

function repoFile(relativePath: string): string {
  return readFileSync(
    path.join(import.meta.dir, "..", "..", relativePath),
    "utf8",
  );
}

/**
 * The editable-list reorder buttons are icon-only, so their `aria-label` is
 * the only thing a screen reader announces. It must be localized like every
 * other control label rather than hardcoded English.
 */
describe("editable list reorder labels", () => {
  it("defines the reorder labels in every locale", () => {
    for (const [language, messages] of Object.entries(locales)) {
      const sourceSettings = messages.sourceSettings as Record<string, string>;
      expect(sourceSettings.moveUp, language).toBeTruthy();
      expect(sourceSettings.moveDown, language).toBeTruthy();
      expect(sourceSettings.moveUp, language).not.toBe(
        sourceSettings.moveDown,
      );
    }
    expect(zh.sourceSettings.moveUp).toBe("上移");
    expect(zh.sourceSettings.moveDown).toBe("下移");
    expect(ja.sourceSettings.moveUp).toBe("上へ移動");
    expect(ja.sourceSettings.moveDown).toBe("下へ移動");
  });

  it("renders them through t() instead of hardcoded English", () => {
    const controls = repoFile("components/ui/settings-controls.tsx");

    expect(controls).toContain('aria-label={t("sourceSettings.moveUp")}');
    expect(controls).toContain('aria-label={t("sourceSettings.moveDown")}');
    expect(controls).not.toContain('aria-label="Move up"');
    expect(controls).not.toContain('aria-label="Move down"');
  });
});
