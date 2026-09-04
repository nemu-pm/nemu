import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobile inline error banner", () => {
  const source = readFileSync(
    path.join(import.meta.dir, "MobileInlineErrorBanner.tsx"),
    "utf8",
  );

  test("keeps long GlassSurface diagnostics intrinsically sized on Android", () => {
    const contentStyle = source.match(
      /content:\s*\{(?<style>[\s\S]*?)\n\s*\},/,
    )?.groups?.style;

    expect(contentStyle).toBeDefined();
    expect(contentStyle).toMatch(/\bflex:\s*0\b/);
    expect(source).toContain("contentStyle={styles.content}");
    expect(source).toContain('accessibilityRole={announce ? "alert" : undefined}');
  });

  test("renders a bare tone glyph without the tinted icon square", () => {
    expect(source).not.toContain("styles.icon");
    expect(source).not.toMatch(/backgroundColor:\s*`\$\{accentColor\}18`/);
    expect(source).toContain("<Ionicons name={iconName} size={18} color={accentColor} />");
  });

  test("keeps the danger tone readable through the glyph color", () => {
    expect(source).toContain(
      'const accentColor = tone === "success" ? tokens.success : tokens.danger;',
    );
  });

  test("caps embedded detail and diagnostic lines so sheets never overflow", () => {
    expect(source).toContain("const EMBEDDED_DESCRIPTION_MAX_LINES = 2;");
    expect(source).toContain("const EMBEDDED_DIAGNOSTIC_MAX_LINES = 4;");
    expect(source).toMatch(
      /numberOfLines=\{\s*embedded \? EMBEDDED_DESCRIPTION_MAX_LINES : undefined\s*\}/,
    );
    expect(source).toContain(
      "numberOfLines={EMBEDDED_DIAGNOSTIC_MAX_LINES}",
    );
  });

  test("collapses the raw diagnostic behind a technical-details disclosure", () => {
    expect(source).toContain("splitMobileInlineErrorDetail(detail)");
    expect(source).toContain("{embedded && diagnostic ? (");
    expect(source).toContain("accessibilityState={{ expanded: diagnosticOpen }}");
    expect(source).toContain("styles.diagnosticMono");
  });

  test("keeps the live region and announcement behavior intact", () => {
    expect(source).toContain('accessibilityLiveRegion={announce ? "polite" : undefined}');
    expect(source).toContain("AccessibilityInfo.announceForAccessibility(announcement);");
    expect(source).toContain('const announcement = `${title}. ${detail}`;');
  });
});
