import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  canDismissMobileNativeSheetFromPan,
  canDismissMobileNativeSheetFromHardwareBack,
  MOBILE_NATIVE_ANDROID_SNAP_POINTS,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  resolveMobileSheetIosLayoutBudget,
  resolveMobileSheetHeaderMetrics,
  resolveMobileNativeSheetDismissLabel,
  shouldBoundMobileNativeSheetForPlatform,
} from "./mobileNativeSheet";

describe("mobile native sheet behavior", () => {
  test("aligns Android Material sheet chrome and body to one 24dp grid", () => {
    expect(resolveMobileSheetHeaderMetrics("android")).toEqual({
      bodyDescriptionFontSize: 14,
      bodyDescriptionLineHeight: 20,
      bodyDescriptionMaxFontSizeMultiplier: 1.6,
      bodyDescriptionNumberOfLines: null,
      bodyHorizontalPadding: 24,
      bodyTopPadding: 8,
      controlSize: 48,
      horizontalPadding: 24,
      minimumHeight: 64,
      showActionLabels: true,
      sideWidth: null,
      titleAlignment: "left",
      titleNumberOfLines: 2,
      verticalPadding: 8,
    });
  });

  test("aligns Android Material titles to the locale's logical start edge", () => {
    expect(resolveMobileSheetHeaderMetrics("android", false).titleAlignment).toBe(
      "left",
    );
    expect(resolveMobileSheetHeaderMetrics("android", true).titleAlignment).toBe(
      "right",
    );
  });

  test("keeps iOS sheet chrome compact with native-sized controls", () => {
    expect(resolveMobileSheetHeaderMetrics("ios")).toEqual({
      bodyDescriptionFontSize: 13,
      bodyDescriptionLineHeight: 19,
      bodyDescriptionMaxFontSizeMultiplier: 1.6,
      bodyDescriptionNumberOfLines: null,
      bodyHorizontalPadding: 16,
      bodyTopPadding: 8,
      controlSize: 44,
      horizontalPadding: 16,
      minimumHeight: 52,
      showActionLabels: false,
      sideWidth: 76,
      titleAlignment: "center",
      titleNumberOfLines: 1,
      verticalPadding: 4,
    });
  });

  test("budgets each header row to fit its native control without a layout correction", () => {
    for (const platform of ["ios", "android"] as const) {
      const metrics = resolveMobileSheetHeaderMetrics(platform);
      expect(metrics.minimumHeight).toBe(
        metrics.controlSize + metrics.verticalPadding * 2,
      );
    }
  });

  test("keeps essential sheet descriptions in an untruncated body region", () => {
    for (const platform of ["ios", "android"] as const) {
      const metrics = resolveMobileSheetHeaderMetrics(platform);
      expect(metrics.bodyDescriptionNumberOfLines).toBeNull();
      expect(metrics.bodyDescriptionMaxFontSizeMultiplier).toBeGreaterThanOrEqual(
        1.6,
      );
    }
  });

  test("uses compact iOS header actions and permits labeled Material actions", () => {
    expect(resolveMobileSheetHeaderMetrics("ios").showActionLabels).toBe(false);
    expect(resolveMobileSheetHeaderMetrics("android").showActionLabels).toBe(
      true,
    );
  });

  test("budgets compact iOS chrome and full-width body copy at narrow phone widths", () => {
    expect(resolveMobileSheetIosLayoutBudget(320)).toEqual({
      bodyWidth: 288,
      compactActionWidth: 76,
      titleWidth: 112,
    });
    expect(resolveMobileSheetIosLayoutBudget(390)).toEqual({
      bodyWidth: 358,
      compactActionWidth: 76,
      titleWidth: 182,
    });

    for (const language of ["en", "zh", "ja"] as const) {
      const instructions =
        getMobileStrings(language).settings.sourceSettingsBasicLoginInstructions;
      expect(Array.from(instructions).length).toBeGreaterThan(20);
      expect(
        resolveMobileSheetHeaderMetrics("ios").bodyDescriptionNumberOfLines,
      ).toBeNull();
    }
  });

  test("matches Android sheets to their physical partial and expanded states", () => {
    const canonicalAndroidStates: (string | number)[] = ["50%", "100%"];
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(
        canonicalAndroidStates,
        "android",
      ),
    ).toBe(canonicalAndroidStates);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(["82%"], "android"),
    ).toEqual(["50%", "100%"]);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform([360], "android"),
    ).toEqual(["50%", "100%"]);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(["100%"], "android"),
    ).toEqual(["100%"]);
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(
        ["40%", "90%"],
        "android",
      ),
    ).toEqual(["50%", "100%"]);
  });

  test("reuses one canonical Material detent array for normalized callers", () => {
    const percentage = normalizeMobileNativeSheetSnapPointsForPlatform(
      ["82%"],
      "android",
    );
    const pixels = normalizeMobileNativeSheetSnapPointsForPlatform(
      [360],
      "android",
    );

    expect(percentage).toBe(MOBILE_NATIVE_ANDROID_SNAP_POINTS);
    expect(pixels).toBe(MOBILE_NATIVE_ANDROID_SNAP_POINTS);
  });

  test("preserves dynamic and non-Android sheet detents", () => {
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(undefined, "android"),
    ).toBeUndefined();
    expect(
      normalizeMobileNativeSheetSnapPointsForPlatform(["82%"], "ios"),
    ).toEqual(["82%"]);
    expect(normalizeMobileNativeSheetSnapPointsForPlatform([], "android")).toEqual(
      [],
    );
  });

  test("bounds only dynamic Android sheets in landscape", () => {
    const input = {
      platform: "android",
      width: 840,
      height: 432,
      snapPoints: undefined,
    };
    expect(shouldBoundMobileNativeSheetForPlatform(input)).toBe(true);
    expect(
      shouldBoundMobileNativeSheetForPlatform({ ...input, width: 432, height: 840 }),
    ).toBe(false);
    expect(
      shouldBoundMobileNativeSheetForPlatform({ ...input, platform: "ios" }),
    ).toBe(false);
    expect(
      shouldBoundMobileNativeSheetForPlatform({
        ...input,
        snapPoints: ["82%"],
      }),
    ).toBe(false);
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
    expect(
      canDismissMobileNativeSheetFromHardwareBack({
        dismissDisabled: true,
        dismissLabel: "Cancel",
        enablePanDownToClose: true,
      }),
    ).toBe(false);
  });

  test("one guard blocks native drag, scrim, and back dismissal", () => {
    const guarded = {
      dismissDisabled: true,
      dismissLabel: "Cancel",
      enablePanDownToClose: true,
    };

    expect(canDismissMobileNativeSheetFromPan(guarded)).toBe(false);
    expect(canDismissMobileNativeSheetFromHardwareBack(guarded)).toBe(false);
    expect(resolveMobileNativeSheetDismissLabel(guarded)).toBe("Cancel");
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
