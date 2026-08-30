export type MobileNativeSheetDismissControlOptions = {
  dismissLabel?: string;
  enablePanDownToClose: boolean;
  showDismissButton?: boolean;
};

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
  // Material 3 ignores the requested detent values and exposes only an
  // approximately half-height partial state and a full-height expanded state.
  // Normalize both single- and multi-detent callers to those physical heights
  // so our bounded React Native scroll frame matches the visible native sheet.
  // A caller's explicit 100% detent is preserved above to intentionally skip
  // the partial anchor for a constrained landscape form.
  return ["50%", "100%"];
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
  return (
    options.enablePanDownToClose ||
    resolveMobileNativeSheetDismissLabel(options) !== null
  );
}
