export type MobileNativeSheetDismissControlOptions = {
  dismissLabel?: string;
  enablePanDownToClose: boolean;
  showDismissButton?: boolean;
};

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
