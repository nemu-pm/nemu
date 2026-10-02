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
  /** Header padding above the title row. */
  paddingTop: number;
  /** Header padding below the title row, before the body's own top padding. */
  paddingBottom: number;
  showActionLabels: boolean;
  sideWidth: number | null;
  titleAlignment: "center" | "left" | "right";
  titleNumberOfLines: 1 | 2;
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
      // The 48dp control row plus its bottom padding. Nothing above it: the
      // Material drag handle already reserves 22dp under the handle, and the
      // former 8dp top padding plus a 64dp row centred the title ~41dp below
      // the handle — the loose grabber-to-title gap on every titled sheet.
      minimumHeight: 52,
      paddingTop: 0,
      paddingBottom: 4,
      showActionLabels: true,
      sideWidth: null,
      titleAlignment: isRTL ? "right" : "left",
      titleNumberOfLines: 2,
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
    paddingTop: 4,
    paddingBottom: 4,
    showActionLabels: false,
    sideWidth: 76,
    titleAlignment: "center",
    titleNumberOfLines: 1,
  };
}

/**
 * Space above a native sheet's body. With a chrome header it separates header
 * and body (the platform metric). Without one the body sits directly under the
 * sheet's own grabber: iOS keeps its metric, but Android's Material 3 sheet
 * already reserves 22dp of drag-handle padding below the handle, and adding
 * the 8dp body inset on top of it left a visibly loose grabber-to-content gap
 * (the Nemu Agent sheet's title row, the onboarding sheet's icon). So on
 * Android the handle's own padding is the whole gap.
 */
export const MOBILE_NATIVE_ANDROID_SHEET_TOP_PADDING_UNDER_HANDLE = 0;

export function resolveMobileNativeSheetBodyTopPadding({
  platform,
  hasChrome,
}: {
  platform: string;
  hasChrome: boolean;
}): number {
  if (platform === "android" && !hasChrome) {
    return MOBILE_NATIVE_ANDROID_SHEET_TOP_PADDING_UNDER_HANDLE;
  }
  return resolveMobileSheetHeaderMetrics(platform).bodyTopPadding;
}

/**
 * Height of Material 3's `BottomSheetDefaults.DragHandle`: a 4dp bar with 22dp
 * of padding above and below it.
 */
export const MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT = 48;

// Match Material 3's 640dp cap and our SDK 58 BottomSheet patch, which bounds
// the directly hosted Yoga root as well. Bounding only this inner scaffold
// leaves an oversized native host and still clips landscape content.
export function resolveMobileNativeSheetAndroidWidth(windowWidth: number): number {
  return Math.min(windowWidth, 640);
}

/** A book-posture pane narrower than this keeps the centred (flat) sheet. */
export const MOBILE_NATIVE_SHEET_MIN_PANE_WIDTH = 320;

export type MobileNativeSheetAndroidPlacement = {
  /** Width of the sheet (Material's 640dp cap included). */
  width: number;
  /** Horizontal shift of the sheet's centre from the window centre (dp). */
  offsetX: number;
  /** The sheet sits in one pane of a book-posture window. */
  paneAligned: boolean;
};

/**
 * Where an Android bottom sheet sits horizontally. Flat: centred at
 * Material's 640dp cap. Book posture (vertical fold): inside the trailing
 * pane in the layout direction — the pane iPhone Duo's system sheets and our
 * reader chrome move to — so the sheet never straddles the fold (HIG: keep
 * content and tap targets clear of the folding region). Notebook keeps the
 * bottom sheet full-width: it rises from the bottom pane.
 */
export function resolveMobileNativeSheetAndroidPlacement({
  windowWidth,
  posture,
  panels,
  layoutDirection = "ltr",
}: {
  windowWidth: number;
  posture: "flat" | "book" | "notebook";
  /** Window-coordinate panes in physical order (`mobileAdaptiveLayout`). */
  panels: readonly { x: number; width: number }[];
  layoutDirection?: "ltr" | "rtl";
}): MobileNativeSheetAndroidPlacement {
  const flat = { width: resolveMobileNativeSheetAndroidWidth(windowWidth), offsetX: 0, paneAligned: false };
  if (posture !== "book" || panels.length !== 2 || !(windowWidth > 0)) return flat;
  const pane = layoutDirection === "rtl" ? panels[0] : panels[panels.length - 1];
  if (!pane || !(pane.width >= MOBILE_NATIVE_SHEET_MIN_PANE_WIDTH)) return flat;
  const width = Math.min(pane.width, 640);
  return {
    width,
    offsetX: pane.x + pane.width / 2 - windowWidth / 2,
    paneAligned: true,
  };
}

/**
 * The height a native sheet's own content (chrome + body) can occupy at its
 * tallest detent. iOS (unchanged): the window minus the safe-area insets.
 * Android: Material insets the sheet content for the status and navigation
 * bars *and* stacks its drag handle above our content, so the handle's 48dp
 * comes off as well. Without it a full-height sheet's pinned action row (the
 * metadata editor's Reset/Save) was sized 48dp taller than the room Material
 * gave it and ended up under the gesture bar.
 */
export function resolveMobileNativeSheetAvailableHeight({
  platform,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
}: {
  platform: string;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
}): number {
  const available = windowHeight - safeAreaTop - safeAreaBottom;
  return platform === "android"
    ? available - MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT
    : available;
}

/**
 * How tall an Android native sheet is, so it matches the height the same
 * sheet has on iOS.
 *
 * Material's `ModalBottomSheet` has no detents: it either wraps its content or
 * (given a full-height child) fills the screen, and its only other state is a
 * "partially expanded" one that is the full-height sheet pushed half off the
 * display. Passing iOS-style detents through therefore produced full-screen
 * sheets (one detent) or clipped ones (two). Instead, on Android the native
 * sheet always wraps its content and opens expanded, and the scaffold sizes
 * that content to what iOS shows:
 *
 * - no detent (content-sized on iOS): `content` — wraps the content, capped at
 *   the room the sheet has, scrolling past it;
 * - a fraction or pixel detent: `fixed` — a container of the height the iOS
 *   sheet has at that detent, i.e. the same visible sheet height from the
 *   bottom of the screen (the iOS fraction is of the window below the status
 *   bar; the Android sheet adds its 48dp drag handle and sits above the
 *   navigation bar, so both come off the content);
 * - `100%` / `large`: `fixed` at the full available height.
 *
 * `maxHeight`/`height` are for the scaffold's own content (chrome + body),
 * never more than [resolveMobileNativeSheetAvailableHeight].
 */
export type MobileNativeSheetAndroidFrame =
  | { kind: "content"; maxHeight: number }
  | { kind: "fixed"; height: number };

/** The shortest fixed-detent content an Android sheet is given. */
export const MOBILE_NATIVE_ANDROID_MIN_FIXED_HEIGHT = 188;

export function resolveMobileNativeSheetAndroidFrame({
  snapPoints,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
  keyboardHeight = 0,
}: {
  snapPoints: (string | number)[] | undefined;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
  /**
   * Height of the open soft keyboard above the navigation bar (React Native's
   * `keyboardDidShow` `endCoordinates.height`), 0 when it is closed. Material
   * pads the sheet content by the IME inset, so the keyboard's height comes
   * out of the room the content has; without it a detent-sized sheet with a
   * focused field (the Add Sources search) outgrew the screen and pushed its
   * drag handle and header under the status bar.
   */
  keyboardHeight?: number;
}): MobileNativeSheetAndroidFrame {
  const available = Math.max(
    resolveMobileNativeSheetAvailableHeight({
      platform: "android",
      windowHeight,
      safeAreaTop,
      safeAreaBottom,
    }) - Math.max(keyboardHeight, 0),
    0,
  );
  const detent = snapPoints?.[0];
  if (detent === undefined) return { kind: "content", maxHeight: available };
  // The visible iOS sheet height at this detent.
  let sheetHeight: number | undefined;
  if (typeof detent === "number") {
    sheetHeight = detent;
  } else if (detent.endsWith("%")) {
    const percentage = Number.parseFloat(detent);
    if (Number.isFinite(percentage)) {
      sheetHeight = (percentage / 100) * (windowHeight - safeAreaTop);
    }
  } else {
    const pixels = Number.parseFloat(detent);
    if (Number.isFinite(pixels)) sheetHeight = pixels;
  }
  if (sheetHeight === undefined) return { kind: "content", maxHeight: available };
  const content = Math.round(
    sheetHeight - MOBILE_NATIVE_ANDROID_DRAG_HANDLE_HEIGHT - safeAreaBottom,
  );
  return {
    kind: "fixed",
    height: Math.min(
      Math.max(content, MOBILE_NATIVE_ANDROID_MIN_FIXED_HEIGHT),
      available,
    ),
  };
}

/**
 * Padding below a native sheet's body content.
 *
 * iOS (approved, unchanged): 18pt for a content-sized body; a scrolling body
 * clears the home indicator itself, `safeAreaBottom + 28` with a 40pt floor.
 * Android: Material 3's `ModalBottomSheet` already lays its content out above
 * the navigation bar (its default `contentWindowInsets`), so adding the inset
 * again only double-padded scrolling sheets; every body ends with the same
 * 18dp gutter above the bar.
 */
export const MOBILE_NATIVE_SHEET_BOTTOM_GUTTER = 18;

export function resolveMobileNativeSheetBottomPadding({
  platform,
  scroll,
  safeAreaBottom,
}: {
  platform: string;
  scroll: boolean;
  safeAreaBottom: number;
}): number {
  if (platform === "android" || !scroll) return MOBILE_NATIVE_SHEET_BOTTOM_GUTTER;
  return Math.max(safeAreaBottom + 28, 40);
}

/**
 * A soft bottom edge for a sheet whose body is the caller's own list
 * (`MobileNativeSheetScaffold`'s `softBottomEdge`): instead of stopping in a
 * hard line one gutter above the home indicator's inset, the list runs to the
 * sheet's own bottom edge and fades out over `fadeHeight`.
 *
 * `endInset` is how far the list pads its end: its last row rests exactly
 * where the fade begins (where a plain body's bottom gutter put it), so
 * nothing is faded once scrolled to the end. iOS: the body reaches into the
 * sheet's bottom safe area (the home indicator's inset, and a floating
 * sheet's rounded corners), so the fade covers that inset plus the gutter.
 * Android: Material already ends the content above the navigation bar.
 */
export function resolveMobileNativeSheetSoftBottomEdge({
  platform,
  safeAreaBottom,
}: {
  platform: string;
  safeAreaBottom: number;
}): { endInset: number; fadeHeight: number } {
  const fadeHeight =
    platform === "android"
      ? MOBILE_NATIVE_SHEET_BOTTOM_GUTTER + 6
      : Math.max(safeAreaBottom, 20) + MOBILE_NATIVE_SHEET_BOTTOM_GUTTER;
  return { endInset: fadeHeight, fadeHeight };
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
