import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("mobile confirmation sheet", () => {
  const source = readFileSync(
    path.join(import.meta.dir, "MobileConfirmationSheet.tsx"),
    "utf8",
  );

  test("renders a bare glyph inside a composed centered title row", () => {
    expect(source).not.toContain("styles.iconShell");
    expect(source).not.toMatch(/backgroundColor:\s*`\$\{accentColor\}18`/);
    // Same composed header as the plugin/source settings sheets: the glyph
    // rides IN the centered title row, not in a leading slot above it.
    expect(source).toContain(
      '<Ionicons name={iconName} size={20} color={tokens.mutedForeground} />',
    );
    expect(source).toContain("styles.titleRow");
    expect(source).toContain('accessibilityRole="header"');
  });
});
