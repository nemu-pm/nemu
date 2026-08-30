import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobile inline error banner", () => {
  test("keeps long GlassSurface diagnostics intrinsically sized on Android", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "MobileInlineErrorBanner.tsx"),
      "utf8",
    );
    const contentStyle = source.match(
      /content:\s*\{(?<style>[\s\S]*?)\n\s*\},/,
    )?.groups?.style;

    expect(contentStyle).toBeDefined();
    expect(contentStyle).toMatch(/\bflex:\s*0\b/);
    expect(source).toContain("contentStyle={styles.content}");
    expect(source).toContain('accessibilityRole={announce ? "alert" : undefined}');
  });
});
