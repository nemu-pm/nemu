export type MobileSourceSettingsConfirmation = {
  type: "source-button" | "source-logout";
};

export function isMobileSourceSettingsConfirmation(
  confirmation: { type: string } | null,
): confirmation is MobileSourceSettingsConfirmation {
  return (
    confirmation?.type === "source-button" ||
    confirmation?.type === "source-logout"
  );
}

export function resolveMobileSourceSettingsPostDismissAction(
  hasQueuedConfirmation: boolean,
): "clear-source" | "present-confirmation" {
  return hasQueuedConfirmation ? "present-confirmation" : "clear-source";
}

export function resolveMobileFirstQueuedSheetHandoff<T>({
  current,
  next,
}: {
  current: T | null;
  next: T;
}): { accepted: boolean; queued: T } {
  return current === null
    ? { accepted: true, queued: next }
    : { accepted: false, queued: current };
}

export function shouldReopenMobileSourceSettingsAfterConfirmation({
  activeSection,
  confirmation,
  sourceAvailable,
}: {
  activeSection: string | null;
  confirmation: { type: string } | null;
  sourceAvailable: boolean;
}): boolean {
  return (
    activeSection === "sources" &&
    sourceAvailable &&
    isMobileSourceSettingsConfirmation(confirmation)
  );
}
