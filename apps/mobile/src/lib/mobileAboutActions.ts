export type MobileAboutActionState = {
  openingSourceCode: boolean;
};

export function isMobileAboutActionBusy(
  state: MobileAboutActionState,
): boolean {
  return state.openingSourceCode;
}

export function canOpenMobileAboutSourceCode(
  state: MobileAboutActionState,
): boolean {
  return !isMobileAboutActionBusy(state);
}
