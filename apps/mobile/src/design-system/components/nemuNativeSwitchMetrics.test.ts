import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getNemuIosSwitchFrame,
  NEMU_IOS_26_SWITCH_FRAME,
  NEMU_IOS_LEGACY_SWITCH_FRAME,
  parseIosMajorVersion,
} from "./nemuNativeSwitchMetrics";

describe("getNemuIosSwitchFrame", () => {
  test("iOS 26 and later reserve the 63x28 Liquid Glass switch", () => {
    for (const version of ["26.0", "26.4", "27.0", 27]) {
      expect(getNemuIosSwitchFrame(version)).toEqual(NEMU_IOS_26_SWITCH_FRAME);
    }
    expect(NEMU_IOS_26_SWITCH_FRAME).toEqual({ width: 63, height: 28 });
  });

  test("earlier iOS keeps the classic 51x31 switch", () => {
    for (const version of ["17.5", "18.6", 18]) {
      expect(getNemuIosSwitchFrame(version)).toEqual(NEMU_IOS_LEGACY_SWITCH_FRAME);
    }
  });

  test("unparseable versions fall back to the legacy frame", () => {
    expect(parseIosMajorVersion("")).toBe(0);
    expect(getNemuIosSwitchFrame("unknown")).toEqual(NEMU_IOS_LEGACY_SWITCH_FRAME);
  });
});

describe("NemuNativeSwitch iOS accessibility", () => {
  const source = readFileSync(path.join(import.meta.dir, "NemuNativeSwitch.tsx"), "utf8");
  const iosBranch = source.slice(
    source.indexOf('if (Platform.OS === "ios")'),
    source.indexOf('if (Platform.OS === "android")'),
  );

  test("exposes one labeled switch while hiding the native duplicate", () => {
    expect(iosBranch).toContain('accessibilityRole="switch"');
    expect(iosBranch).toContain("accessibilityHidden()");
    expect(iosBranch).toContain("label={accessibilityLabel}");
    expect(iosBranch).toContain("labelsHidden()");
  });

  test("sizes the host from the OS switch frame instead of a hard-coded 51x31", () => {
    expect(iosBranch).toContain("getNemuIosSwitchFrame(Platform.Version)");
  });
});
