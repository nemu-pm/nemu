import { describe, expect, test } from "bun:test";
import { mobileAdaptiveLayout } from "./mobileAdaptiveLayout";
import { getMobileStrings } from "./mobileI18n";
import {
  canDismissMobileNativeSheetFromPan,
  canDismissMobileNativeSheetFromHardwareBack,
  MOBILE_NATIVE_ANDROID_SNAP_POINTS,
  normalizeMobileNativeSheetSnapPointsForPlatform,
  MOBILE_NATIVE_ANDROID_MIN_FIXED_HEIGHT,
  resolveMobileNativeSheetAndroidFrame,
  resolveMobileNativeSheetAndroidPlacement,
  resolveMobileNativeSheetAndroidWidth,
  resolveMobileNativeSheetAvailableHeight,
  resolveMobileNativeSheetBodyTopPadding,
  resolveMobileNativeSheetBottomPadding,
  resolveMobileNativeSheetSoftBottomEdge,
  resolveMobileSheetIosLayoutBudget,
  resolveMobileSheetHeaderMetrics,
  resolveMobileNativeSheetDismissLabel,
  resolveMobileNativeSheetIosFramedDetentHeight,
  resolveMobileNativeSheetIosLayout,
  resolveMobileNativeSheetIosPresentation,
  MOBILE_NATIVE_IOS_MIN_FRAMED_HEIGHT,
  type MobileNativeSheetIosPresentation,
  shouldBoundMobileNativeSheetForPlatform,
} from "./mobileNativeSheet";

describe("mobile native sheet behavior", () => {
  test("keeps Yoga content inside Material's landscape sheet width", () => {
    expect(resolveMobileNativeSheetAndroidWidth(426)).toBe(426);
    expect(resolveMobileNativeSheetAndroidWidth(952)).toBe(640);
    expect(resolveMobileNativeSheetAndroidWidth(600)).toBe(600);
  });
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
      minimumHeight: 52,
      paddingTop: 0,
      paddingBottom: 4,
      showActionLabels: true,
      sideWidth: null,
      titleAlignment: "left",
      titleNumberOfLines: 2,
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
      // Formerly `verticalPadding: 4`: the same 4pt above and below.
      paddingTop: 4,
      paddingBottom: 4,
      showActionLabels: false,
      sideWidth: 76,
      titleAlignment: "center",
      titleNumberOfLines: 1,
    });
  });

  test("budgets each header row to fit its native control without a layout correction", () => {
    for (const platform of ["ios", "android"] as const) {
      const metrics = resolveMobileSheetHeaderMetrics(platform);
      expect(metrics.minimumHeight).toBe(
        metrics.controlSize + metrics.paddingTop + metrics.paddingBottom,
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

  test("does not stack body padding under Android's Material drag handle", () => {
    expect(resolveMobileNativeSheetBodyTopPadding({ platform: "ios", hasChrome: false })).toBe(8);
    expect(resolveMobileNativeSheetBodyTopPadding({ platform: "ios", hasChrome: true })).toBe(8);
    expect(resolveMobileNativeSheetBodyTopPadding({ platform: "android", hasChrome: true })).toBe(
      resolveMobileSheetHeaderMetrics("android").bodyTopPadding,
    );
    expect(resolveMobileNativeSheetBodyTopPadding({ platform: "android", hasChrome: false })).toBe(0);
  });

  test("ends every Android body one gutter above the navigation bar Material already clears", () => {
    for (const scroll of [false, true]) {
      expect(
        resolveMobileNativeSheetBottomPadding({ platform: "android", scroll, safeAreaBottom: 24 }),
      ).toBe(18);
    }
  });

  test("a soft bottom edge leaves the last row where a plain body's gutter put it", () => {
    // iOS: the body reaches into the home indicator's inset; the fade covers
    // that inset and the gutter, and the list's end padding equals the fade.
    expect(resolveMobileNativeSheetSoftBottomEdge({ platform: "ios", safeAreaBottom: 34 })).toEqual({
      endInset: 52,
      fadeHeight: 52,
    });
    // No home indicator (Touch ID phones): still clear of the rounded corners.
    expect(resolveMobileNativeSheetSoftBottomEdge({ platform: "ios", safeAreaBottom: 0 }).fadeHeight).toBe(38);
    // Android: Material already clears the navigation bar.
    expect(resolveMobileNativeSheetSoftBottomEdge({ platform: "android", safeAreaBottom: 24 })).toEqual({
      endInset: 24,
      fadeHeight: 24,
    });
  });

  describe("Android sheet heights match iOS", () => {
    // Pixel-like phone: 952dp window, 48dp status bar, 24dp gesture bar.
    const phone = { windowHeight: 952, safeAreaTop: 48, safeAreaBottom: 24 };
    const available = 952 - 48 - 24 - 48;

    test("a content-sized iOS sheet wraps its content, capped at the room it has", () => {
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: undefined })).toEqual({
        kind: "content",
        maxHeight: available,
      });
    });

    test("a fraction detent gets the same visible sheet height iOS shows", () => {
      // iOS 60% sheet: 0.6 * (952 - 48) = 542.4dp tall from the screen bottom.
      // Android: minus its 48dp handle and the 24dp gesture bar it sits above.
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["60%"] })).toEqual({
        kind: "fixed",
        height: Math.round(0.6 * 904 - 48 - 24),
      });
      // Only the first detent is the opening height.
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["48%", "100%"] }),
      ).toEqual({ kind: "fixed", height: Math.round(0.48 * 904 - 72) });
      // Pixel detents are sheet heights too.
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: [420] })).toEqual({
        kind: "fixed",
        height: 420 - 72,
      });
      // Never a sliver.
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["10%"] })).toEqual({
        kind: "fixed",
        height: MOBILE_NATIVE_ANDROID_MIN_FIXED_HEIGHT,
      });
    });

    test("only a large (100%) iOS sheet is full height", () => {
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["100%"] })).toEqual({
        kind: "fixed",
        height: available,
      });
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: [5000] })).toEqual({
        kind: "fixed",
        height: available,
      });
    });

    test("unreadable detents fall back to content-sized", () => {
      expect(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["tall"] })).toEqual({
        kind: "content",
        maxHeight: available,
      });
    });

    test("an open keyboard comes out of the room, so the header stays on screen", () => {
      // Material pads the sheet content by the IME inset; RN reports the
      // keyboard's height above the gesture bar (312dp here).
      const keyboardHeight = 312;
      const room = available - keyboardHeight;
      // The Add Sources detent (~75%) no longer fits above the keyboard.
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["75%"], keyboardHeight }),
      ).toEqual({ kind: "fixed", height: room });
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["100%"], keyboardHeight }),
      ).toEqual({ kind: "fixed", height: room });
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: undefined, keyboardHeight }),
      ).toEqual({ kind: "content", maxHeight: room });
      // A short detent that already fits keeps its iOS height.
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: [420], keyboardHeight }),
      ).toEqual({ kind: "fixed", height: 420 - 72 });
      // Closed keyboard (0) is the default; a bogus negative height is ignored.
      expect(
        resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["75%"], keyboardHeight: -40 }),
      ).toEqual(resolveMobileNativeSheetAndroidFrame({ ...phone, snapPoints: ["75%"] }));
      // Never negative, even in a landscape window the keyboard nearly fills.
      expect(
        resolveMobileNativeSheetAndroidFrame({
          windowHeight: 411,
          safeAreaTop: 24,
          safeAreaBottom: 0,
          snapPoints: ["100%"],
          keyboardHeight: 400,
        }),
      ).toEqual({ kind: "fixed", height: 0 });
    });
  });

  test("snapshots the approved iOS sheet spacing", () => {
    // iOS must not move: every spacing helper resolves to today's numbers.
    const header = resolveMobileSheetHeaderMetrics("ios");
    expect({
      bodyTopPadding: header.bodyTopPadding,
      bodyHorizontalPadding: header.bodyHorizontalPadding,
      headerMinimumHeight: header.minimumHeight,
      headerPaddingTop: header.paddingTop,
      headerPaddingBottom: header.paddingBottom,
      bodyTopWithoutChrome: resolveMobileNativeSheetBodyTopPadding({ platform: "ios", hasChrome: false }),
      bodyTopWithChrome: resolveMobileNativeSheetBodyTopPadding({ platform: "ios", hasChrome: true }),
      bottomContentSized: resolveMobileNativeSheetBottomPadding({ platform: "ios", scroll: false, safeAreaBottom: 34 }),
      bottomScrolling: resolveMobileNativeSheetBottomPadding({ platform: "ios", scroll: true, safeAreaBottom: 34 }),
      bottomScrollingNoInset: resolveMobileNativeSheetBottomPadding({ platform: "ios", scroll: true, safeAreaBottom: 0 }),
      snapPoints: normalizeMobileNativeSheetSnapPointsForPlatform(["82%"], "ios"),
      availableHeight: resolveMobileNativeSheetAvailableHeight({
        platform: "ios",
        windowHeight: 852,
        safeAreaTop: 59,
        safeAreaBottom: 34,
      }),
    }).toEqual({
      bodyTopPadding: 8,
      bodyHorizontalPadding: 16,
      headerMinimumHeight: 52,
      headerPaddingTop: 4,
      headerPaddingBottom: 4,
      bodyTopWithoutChrome: 8,
      bodyTopWithChrome: 8,
      bottomContentSized: 18,
      bottomScrolling: 62,
      bottomScrollingNoInset: 40,
      snapPoints: ["82%"],
      availableHeight: 759,
    });
  });
});

describe("ios sheet sizing held for a presentation", () => {
  const contentSized: MobileNativeSheetIosPresentation = {
    sizing: "content",
    snapPoints: undefined,
  };
  const tall = ["88%"];
  const short = ["82%"];

  test("a closed sheet adopts the sizing its next presentation asks for", () => {
    expect(
      resolveMobileNativeSheetIosPresentation({
        held: contentSized,
        presented: false,
        snapPoints: tall,
      }),
    ).toEqual({ sizing: "detents", snapPoints: tall });
    expect(
      resolveMobileNativeSheetIosPresentation({
        held: { sizing: "detents", snapPoints: tall },
        presented: false,
        snapPoints: undefined,
      }),
    ).toEqual(contentSized);
    expect(
      resolveMobileNativeSheetIosPresentation({
        held: contentSized,
        presented: false,
        snapPoints: [],
      }),
    ).toBe(contentSized);
  });

  test("a presented content-sized sheet stays content-sized when detents are requested", () => {
    // The source manager: a hugging source list whose add panel gets results.
    const held = resolveMobileNativeSheetIosPresentation({
      held: contentSized,
      presented: true,
      snapPoints: tall,
    });
    expect(held).toBe(contentSized);
    expect(resolveMobileNativeSheetIosLayout({ held, snapPoints: tall })).toEqual({
      nativeSnapPoints: undefined,
      framesDetent: true,
    });
    // Back to the short list: nothing to frame.
    expect(resolveMobileNativeSheetIosLayout({ held, snapPoints: undefined })).toEqual({
      nativeSnapPoints: undefined,
      framesDetent: false,
    });
  });

  test("a presented detent sheet keeps its last detents when content sizing is requested", () => {
    // A bounded source list that shows its content-sized confirmation.
    const detents: MobileNativeSheetIosPresentation = { sizing: "detents", snapPoints: short };
    const held = resolveMobileNativeSheetIosPresentation({
      held: detents,
      presented: true,
      snapPoints: undefined,
    });
    expect(held).toBe(detents);
    expect(resolveMobileNativeSheetIosLayout({ held, snapPoints: undefined })).toEqual({
      nativeSnapPoints: short,
      framesDetent: false,
    });
  });

  test("a presented detent sheet may change its detents", () => {
    const detents: MobileNativeSheetIosPresentation = { sizing: "detents", snapPoints: short };
    const held = resolveMobileNativeSheetIosPresentation({
      held: detents,
      presented: true,
      snapPoints: tall,
    });
    expect(held).toEqual({ sizing: "detents", snapPoints: tall });
    expect(resolveMobileNativeSheetIosLayout({ held, snapPoints: tall })).toEqual({
      nativeSnapPoints: tall,
      framesDetent: false,
    });
    // Unchanged detents keep the held object (no state churn).
    expect(
      resolveMobileNativeSheetIosPresentation({ held, presented: true, snapPoints: tall }),
    ).toBe(held);
  });

  test("never hands the native sheet a different sizing kind mid-presentation", () => {
    const requests = [undefined, tall, undefined, short, [], tall];
    for (const first of [undefined, tall]) {
      let held = resolveMobileNativeSheetIosPresentation({
        held: contentSized,
        presented: false,
        snapPoints: first,
      });
      const kind = held.sizing;
      for (const snapPoints of requests) {
        held = resolveMobileNativeSheetIosPresentation({ held, presented: true, snapPoints });
        const { nativeSnapPoints } = resolveMobileNativeSheetIosLayout({ held, snapPoints });
        expect(nativeSnapPoints?.length ? "detents" : "content").toBe(kind);
      }
    }
  });

  test("a framed detent is the detent's height less the grabber room", () => {
    expect(
      resolveMobileNativeSheetIosFramedDetentHeight({
        detentHeight: 642,
        grabberRoom: 16,
        windowHeight: 874,
        safeAreaTop: 62,
      }),
    ).toBe(626);
  });

  test("a framed detent fits above the keyboard", () => {
    // 874 - 62 - 336 - 16: the header stays on screen with the keyboard up.
    expect(
      resolveMobileNativeSheetIosFramedDetentHeight({
        detentHeight: 642,
        grabberRoom: 16,
        windowHeight: 874,
        safeAreaTop: 62,
        keyboardHeight: 336,
      }),
    ).toBe(460);
    // A detent already shorter than that room is left alone.
    expect(
      resolveMobileNativeSheetIosFramedDetentHeight({
        detentHeight: 300,
        grabberRoom: 16,
        windowHeight: 874,
        safeAreaTop: 62,
        keyboardHeight: 336,
      }),
    ).toBe(284);
    // Landscape with the keyboard up: never below a usable body.
    expect(
      resolveMobileNativeSheetIosFramedDetentHeight({
        detentHeight: 330,
        grabberRoom: 16,
        windowHeight: 402,
        safeAreaTop: 0,
        keyboardHeight: 260,
      }),
    ).toBe(MOBILE_NATIVE_IOS_MIN_FRAMED_HEIGHT);
  });
});

describe("android sheet placement on foldables", () => {
  const pixelFoldBook = mobileAdaptiveLayout({
    width: 841, height: 701, supported: true,
    divisions: [{ id: "fold-0", x: 420.5, y: 0, width: 0, height: 701, active: true }], occlusions: [],
  });
  test("flat windows keep the centred 640dp sheet", () => {
    expect(resolveMobileNativeSheetAndroidPlacement({ windowWidth: 841, posture: "flat", panels: [{ x: 0, width: 841 }] }))
      .toEqual({ width: 640, offsetX: 0, paneAligned: false });
    expect(resolveMobileNativeSheetAndroidPlacement({ windowWidth: 412, posture: "flat", panels: [{ x: 0, width: 412 }] }))
      .toEqual({ width: 412, offsetX: 0, paneAligned: false });
  });
  test("book posture moves the sheet into the trailing pane (a zero-width hinge included)", () => {
    const ltr = resolveMobileNativeSheetAndroidPlacement({ windowWidth: 841, posture: pixelFoldBook.posture, panels: pixelFoldBook.panels });
    expect(ltr).toEqual({ width: 410.5, offsetX: 430.5 + 410.5 / 2 - 841 / 2, paneAligned: true });
    // The sheet's frame is exactly the trailing pane: clear of the fold gutter.
    expect(841 / 2 + ltr.offsetX - ltr.width / 2).toBe(430.5);
    const rtl = resolveMobileNativeSheetAndroidPlacement({
      windowWidth: 841, posture: pixelFoldBook.posture, panels: pixelFoldBook.panels, layoutDirection: "rtl",
    });
    expect(841 / 2 + rtl.offsetX + rtl.width / 2).toBe(410.5);
  });
  test("Duo book pane and too-narrow panes", () => {
    const duo = mobileAdaptiveLayout({
      width: 951, height: 669, supported: true,
      divisions: [{ id: "d", x: 455.5, y: 0, width: 40, height: 669, active: true }], occlusions: [],
    });
    expect(resolveMobileNativeSheetAndroidPlacement({ windowWidth: 951, posture: duo.posture, panels: duo.panels }))
      .toMatchObject({ width: 455.5, paneAligned: true });
    expect(resolveMobileNativeSheetAndroidPlacement({
      windowWidth: 500, posture: "book", panels: [{ x: 0, width: 240 }, { x: 260, width: 240 }],
    })).toEqual({ width: 500, offsetX: 0, paneAligned: false });
  });
  test("notebook keeps the full-width bottom sheet", () => {
    expect(resolveMobileNativeSheetAndroidPlacement({ windowWidth: 701, posture: "notebook", panels: [{ x: 0, width: 701 }, { x: 0, width: 701 }] }))
      .toEqual({ width: 640, offsetX: 0, paneAligned: false });
  });
});
