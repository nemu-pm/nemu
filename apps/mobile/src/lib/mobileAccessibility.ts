export function getMobileSwitchAccessibilityState(
  checked: boolean,
  disabled = false,
) {
  return { checked, disabled };
}

export function canRunMobileSwitchSelectionFeedback({
  checked,
  disabled,
  nextChecked,
}: {
  checked: boolean;
  disabled?: boolean;
  nextChecked: boolean;
}): boolean {
  return !disabled && checked !== nextChecked;
}
