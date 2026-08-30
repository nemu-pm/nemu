import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileSourceRoot = path.join(import.meta.dir, "..");

describe("mobile settings native accessibility contracts", () => {
  test("labels the nested SwiftUI switch instead of only its React Native host", () => {
    const source = readFileSync(
      path.join(
        mobileSourceRoot,
        "design-system/components/NemuNativeSwitch.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("swiftAccessibilityLabel(accessibilityLabel)");
  });

  test("exposes every iOS segmented choice as an individually selectable tab", () => {
    const source = readFileSync(
      path.join(mobileSourceRoot, "screens/SettingsScreen.tsx"),
      "utf8",
    );

    expect(source).toContain("swiftAccessibilityHidden()");
    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain("selected: option.value === value");
    expect(source).not.toContain(
      '<View accessibilityRole="tablist" style={styles.nativeSegmentedShell}>',
    );
  });
});
