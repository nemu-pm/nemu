// TEST-ONLY diagnostic (remove with it before release).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  clearNativeMenuPressTrace,
  formatNativeMenuPressTrace,
  isNativeMenuPressTraceEnabled,
  setNativeMenuPressTraceEnabled,
} from "../../modules/nemu-window-layout/src/ContextMenuPressTrace";
import { createNativeContextMenuPressGate } from "../../modules/nemu-window-layout/src/ContextMenuLongPress";

const read = (relative: string) =>
  readFileSync(path.join(import.meta.dir, "..", "..", relative), "utf8");

afterEach(() => {
  setNativeMenuPressTraceEnabled(false);
  clearNativeMenuPressTrace();
});

describe("long-press trace (test only)", () => {
  test("off by default: nothing is recorded", () => {
    expect(isNativeMenuPressTraceEnabled()).toBe(false);
    const gate = createNativeContextMenuPressGate();
    gate.pressIn({ native: 0, wall: 0 });
    gate.menuWillDisplay();
    expect(formatNativeMenuPressTrace()).toBe("");
  });

  test("on: a sequence lists every step with its touch-clock offset", () => {
    setNativeMenuPressTraceEnabled(true);
    const gate = createNativeContextMenuPressGate();
    gate.pressIn({ native: 1000, wall: Date.now() });
    gate.menuConfigure();
    gate.menuWillDisplay();
    expect(gate.resolvePress({ native: 1640, wall: Date.now() }, () => {})).toBe("suppress");
    gate.menuWillEnd();
    gate.menuPreviewTap();
    const text = formatNativeMenuPressTrace();
    for (const step of ["pressIn", "menu configure", "menu willDisplay", "onPress -> suppress", "menu willEnd", "menu preview tapped"]) {
      expect(text).toContain(step);
    }
    expect(text).toContain("[touch +640ms] onPress -> suppress");
  });

  test("keeps only the last eight sequences; switching off clears", () => {
    setNativeMenuPressTraceEnabled(true);
    const gate = createNativeContextMenuPressGate();
    for (let index = 0; index < 12; index += 1) gate.pressIn({ native: index, wall: 0 });
    expect(formatNativeMenuPressTrace().split("\n").filter((line) => line.startsWith("#"))).toHaveLength(8);
    setNativeMenuPressTraceEnabled(false);
    expect(formatNativeMenuPressTrace()).toBe("");
  });

  test("never logs, and is labelled as a test to remove", () => {
    for (const file of [
      "modules/nemu-window-layout/src/ContextMenuPressTrace.ts",
      "src/lib/mobileNativeMenuPressTraceSetting.native.ts",
      "src/lib/mobileNativeMenuPressTraceSetting.ts",
    ]) {
      const source = read(file);
      expect(source).not.toContain("console.");
      expect(source).toContain("TEST-ONLY");
    }
    const settings = read("src/screens/SettingsScreen.tsx");
    expect(settings).toContain("<NativeMenuPressTraceSection />");
    const swift = read("modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    // The preview tap only dismisses the menu: it never opens the item.
    expect(swift).toContain("animator.preferredCommitStyle = .dismiss");
  });
});
