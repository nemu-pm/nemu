import { describe, expect, test } from "bun:test";
import {
  canDismissMobileNativeSheetFromHardwareBack,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  resolveMobileNativeSheetDismissLabel,
} from "./mobileNativeSheet";

describe("mobile native sheet dismissal", () => {
  test("gives single-detent Android sheets partial and expanded states", () => {
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(["82%"], "android"),
    ).toEqual(["50%", "100%"]);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform([360], "android"),
    ).toEqual(["50%", "100%"]);
  });

  test("preserves dynamic and non-Android sheet detents", () => {
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(undefined, "android"),
    ).toBeUndefined();
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(["82%"], "ios"),
    ).toEqual(["82%"]);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(
        ["40%", "90%"],
        "android",
      ),
    ).toEqual(["40%", "90%"]);
  });

  test("does not invent an active label for a non-dismissible busy sheet", () => {
    expect(
      resolveMobileNativeSheetDismissLabel({
        enablePanDownToClose: false,
      }),
    ).toBeNull();
  });

  test("uses an explicit localized escape while pan dismissal is disabled", () => {
    expect(
      resolveMobileNativeSheetDismissLabel({
        dismissLabel: "キャンセル",
        enablePanDownToClose: false,
      }),
    ).toBe("キャンセル");
  });

  test("preserves an explicit caller action while pan dismissal is enabled", () => {
    expect(
      resolveMobileNativeSheetDismissLabel({
        dismissLabel: "Done",
        enablePanDownToClose: true,
      }),
    ).toBe("Done");
  });

  test("honors an explicit request to hide the chrome action", () => {
    expect(
      resolveMobileNativeSheetDismissLabel({
        dismissLabel: "Cancel",
        enablePanDownToClose: false,
        showDismissButton: false,
      }),
    ).toBeNull();
  });

  test("requires an explicit label for an explicitly shown action", () => {
    expect(
      resolveMobileNativeSheetDismissLabel({
        enablePanDownToClose: true,
        showDismissButton: true,
      }),
    ).toBeNull();
    expect(
      resolveMobileNativeSheetDismissLabel({
        dismissLabel: "完成",
        enablePanDownToClose: true,
        showDismissButton: true,
      }),
    ).toBe("完成");
  });

  test("consumes Android Back without closing a guarded busy sheet", () => {
    expect(
      canDismissMobileNativeSheetFromHardwareBack({
        enablePanDownToClose: false,
      }),
    ).toBe(false);
    expect(
      canDismissMobileNativeSheetFromHardwareBack({
        dismissLabel: "Cancel",
        enablePanDownToClose: false,
        showDismissButton: false,
      }),
    ).toBe(false);
  });

  test("allows Android Back through either caller-approved escape route", () => {
    expect(
      canDismissMobileNativeSheetFromHardwareBack({
        enablePanDownToClose: true,
      }),
    ).toBe(true);
    expect(
      canDismissMobileNativeSheetFromHardwareBack({
        dismissLabel: "Cancel",
        enablePanDownToClose: false,
      }),
    ).toBe(true);
  });
});
