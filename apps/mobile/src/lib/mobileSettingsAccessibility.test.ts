import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileSourceRoot = path.join(import.meta.dir, "..");

describe("mobile settings native accessibility contracts", () => {
  test("exposes one actionable switch and hides the duplicate SwiftUI subtree", () => {
    const source = readFileSync(
      path.join(
        mobileSourceRoot,
        "design-system/components/NemuNativeSwitch.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('accessibilityRole="switch"');
    expect(source).toContain("accessibilityLabel={accessibilityLabel}");
    expect(source).toContain("accessibilityHidden()");
    expect(source).toContain("onAccessibilityTap={() =>");
    expect(source).toContain("if (!disabled) onValueChange(!value)");
  });

  test("exposes every iOS segmented choice as an individually selectable tab", () => {
    const source = readFileSync(
      path.join(mobileSourceRoot, "screens/SettingsScreen.tsx"),
      "utf8",
    );

    expect(source).toContain("swiftAccessibilityHidden()");
    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain("selected: option.value === displayedValue");
    expect(source).toContain("selection={displayedValue}");
    expect(source).toContain("setOptimisticValue(nextValue)");
    expect(source).toContain(
      'screenReaderEnabled || interactionLocked ? "auto" : "none"',
    );
    expect(source).toContain("const interactionBlocked = disabled || interactionLocked");
    expect(source).toContain(
      "...(disabled ? [swiftDisabled(true)] : []),",
    );
    expect(source).not.toContain(
      "...(interactionBlocked ? [swiftDisabled(true)] : []),",
    );
    expect(source).not.toContain(
      '<View accessibilityRole="tablist" style={styles.nativeSegmentedShell}>',
    );
  });
});
