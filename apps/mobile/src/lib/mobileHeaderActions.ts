export type MobileHeaderActionState = {
  disabled?: boolean;
  loading?: boolean;
};

export function isMobileHeaderActionDisabled(
  action: MobileHeaderActionState,
): boolean {
  return Boolean(action.disabled || action.loading);
}
