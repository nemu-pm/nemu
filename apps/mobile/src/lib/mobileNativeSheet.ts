export type MobileNativeSheetDismissControlOptions = {
  dismissLabel?: string;
  dismissDisabled?: boolean;
  enablePanDownToClose: boolean;
  showDismissButton?: boolean;
};

export const MOBILE_SHEET_HEADER_ITEM_GAP = 12;
export const MOBILE_NATIVE_ANDROID_SNAP_POINTS: (string | number)[] = [
  "50%",
  "100%",
];

export type MobileSheetHeaderMetrics = {
  bodyDescriptionFontSize: number;
  bodyDescriptionLineHeight: number;
  bodyDescriptionMaxFontSizeMultiplier: number;
  bodyDescriptionNumberOfLines: number | null;
  bodyHorizontalPadding: number;
  bodyTopPadding: number;
  controlSize: number;
  horizontalPadding: number;
  minimumHeight: number;
  showActionLabels: boolean;
  sideWidth: number | null;
  titleAlignment: "center" | "left" | "right";
  titleNumberOfLines: 1 | 2;
  verticalPadding: number;
};

/**
 * Expo UI maps this flag to drag, outside-tap, and native back dismissal.
 * Keep the busy-state guard in one pure policy so those native paths cannot
 * drift apart.
 */
export function canDismissMobileNativeSheetFromPan({
  dismissDisabled,
  enablePanDownToClose,
}: Pick<
  MobileNativeSheetDismissControlOptions,
  "dismissDisabled" | "enablePanDownToClose"
>): boolean {
  return enablePanDownToClose && !dismissDisabled;
}

/** Platform chrome metrics shared by every native sheet header. */
export function resolveMobileSheetHeaderMetrics(
  platform: string,
  isRTL = false,
): MobileSheetHeaderMetrics {
  if (platform === "android") {
    return {
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
      titleAlignment: isRTL ? "right" : "left",
      titleNumberOfLines: 2,
      verticalPadding: 8,
    };
  }

  return {
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
  };
}

export function resolveMobileSheetIosLayoutBudget(containerWidth: number): {
  bodyWidth: number;
  compactActionWidth: number;
  titleWidth: number;
} {
  const metrics = resolveMobileSheetHeaderMetrics("ios");
  const compactActionWidth = metrics.sideWidth ?? 0;
  const innerWidth = Math.max(
    0,
    containerWidth - metrics.horizontalPadding * 2,
  );
  return {
    bodyWidth: Math.max(
      0,
      containerWidth - metrics.bodyHorizontalPadding * 2,
    ),
    compactActionWidth,
    titleWidth: Math.max(
      0,
      innerWidth - compactActionWidth * 2 - MOBILE_SHEET_HEADER_ITEM_GAP * 2,
    ),
  };
}

export function shouldBoundMobileNativeSheetForPlatform({
  platform,
  width,
  height,
  snapPoints,
}: {
  platform: string;
  width: number;
  height: number;
  snapPoints: (string | number)[] | undefined;
}) {
  return platform === "android" && width > height && !snapPoints?.length;
}

/**
 * Expo's Material 3 sheet only distinguishes partial and expanded states on
 * Android. Passing one explicit detent therefore expands it fully. Give that
 * platform both native states so a bounded sheet opens partially and remains
 * expandable; preserve exact detents everywhere else.
 */
export function normalizeMobileNativeSheetSnapPointsForPlatform(
  snapPoints: (string | number)[] | undefined,
  platform: string,
): (string | number)[] | undefined {
  if (platform !== "android" || !snapPoints?.length) {
    return snapPoints;
  }
  if (snapPoints.length === 1 && snapPoints[0] === "100%") {
    return snapPoints;
  }
  if (
    snapPoints.length === 2 &&
    snapPoints[0] === "50%" &&
    snapPoints[1] === "100%"
  ) {
    return snapPoints;
  }
  // Material 3 ignores the requested detent values and exposes only an
  // approximately half-height partial state and a full-height expanded state.
  // Normalize both single- and multi-detent callers to those physical heights
  // so our bounded React Native scroll frame matches the visible native sheet.
  // A caller's explicit 100% detent is preserved above to intentionally skip
  // the partial anchor for a constrained landscape form.
  return MOBILE_NATIVE_ANDROID_SNAP_POINTS;
}

/**
 * Native sheets must never invent a user-facing dismissal action. A caller
 * opts into chrome by providing a label and can explicitly hide that action.
 * Pan state must not manufacture a label or override either caller choice.
 */
export function resolveMobileNativeSheetDismissLabel(
  options: MobileNativeSheetDismissControlOptions,
): string | null {
  const label = options.dismissLabel?.trim();
  if (!label || options.showDismissButton === false) return null;
  return label;
}

/**
 * Android Back mirrors the sheet's user-accessible dismissal policy. It may
 * perform an implicit pan-equivalent close or the caller's explicit chrome
 * action, but it must stay consumed while a busy sheet disables both.
 */
export function canDismissMobileNativeSheetFromHardwareBack(
  options: MobileNativeSheetDismissControlOptions,
): boolean {
  if (options.dismissDisabled) return false;

  return (
    options.enablePanDownToClose ||
    resolveMobileNativeSheetDismissLabel(options) !== null
  );
}
