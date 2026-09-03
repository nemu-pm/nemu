export type MobileSettingsActionState = {
  refreshingSources: boolean;
  removingSource: boolean;
  clearingData: boolean;
  changingSettings: boolean;
};

export type MobileSettingsSkeletonState = {
  installedSourcesLoading: boolean;
  installedSourcesCount: number;
  installedSourcesError: string | null;
  availableSourcesLoading: boolean;
  availableSourcesCount: number;
  availableSourcesError: string | null;
  readerPluginsLoading: boolean;
  readerPluginsCount: number;
  readerPluginsError: string | null;
};

export type MobileSettingsSkeletonSection =
  | null
  | "reader"
  | "sources"
  | "appearance"
  | "data";

export type MobileSettingsMutationResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export function isMobileSettingsActionBusy(
  state: MobileSettingsActionState,
): boolean {
  return (
    state.refreshingSources ||
    state.removingSource ||
    state.clearingData ||
    state.changingSettings
  );
}

export function canStartMobileSettingsAction(
  state: MobileSettingsActionState,
): boolean {
  return !isMobileSettingsActionBusy(state);
}

export function canRunMobileSettingsSelection({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}

export function canRetryMobileSettingsLoadError({
  hasError,
  disabled,
}: {
  hasError: boolean;
  disabled: boolean;
}): boolean {
  return hasError && !disabled;
}

export function shouldRenderMobileSettingsSkeleton(
  state: MobileSettingsSkeletonState,
): boolean {
  if (state.installedSourcesError || state.readerPluginsError) {
    return false;
  }

  // The settings landing page only needs local data. Registry discovery is a
  // remote operation with its own loading/error UI in the Sources section, so
  // it must never hold the entire settings screen behind a skeleton.
  return (
    (state.installedSourcesLoading && state.installedSourcesCount === 0) ||
    (state.readerPluginsLoading && state.readerPluginsCount === 0)
  );
}

export function shouldRenderMobileSettingsSkeletonForSection(
  state: MobileSettingsSkeletonState,
  section: MobileSettingsSkeletonSection,
): boolean {
  return section === null && shouldRenderMobileSettingsSkeleton(state);
}

export function shouldRenderMobileSourcesSectionLoading(
  state: MobileSettingsSkeletonState,
): boolean {
  if (state.installedSourcesError) return false;

  // This section manages packages already stored on the device. Registry
  // discovery only enriches those rows with newer metadata, and can take up to
  // the native HTTP timeout on an unreliable connection. Never hide usable
  // local sources behind that unrelated network request.
  return state.installedSourcesLoading && state.installedSourcesCount === 0;
}

export function getMobileSettingsMutationResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileSettingsMutationResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}

/**
 * The language pickers mirror the web `Tabs` control, so a tab is inert while
 * it is already selected, while the settings screen is busy, or while its own
 * mutation is still being persisted.
 */
export function canSelectMobileLanguageTab({
  selected,
  disabled,
  interactionLocked,
}: {
  selected: boolean;
  disabled: boolean;
  interactionLocked: boolean;
}): boolean {
  return !selected && !disabled && !interactionLocked;
}

export function resolveMobileLanguageTabAccessibilityState({
  selected,
  disabled,
  interactionLocked,
}: {
  selected: boolean;
  disabled: boolean;
  interactionLocked: boolean;
}): { selected: boolean; disabled: boolean } {
  return { selected, disabled: disabled || interactionLocked };
}
