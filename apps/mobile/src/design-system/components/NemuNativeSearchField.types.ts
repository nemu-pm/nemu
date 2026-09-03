/**
 * Shared contract for the capsule search field used inside sheets.
 *
 * The value stays owned by the caller on every platform. iOS renders a real
 * SwiftUI `TextField` (see `NemuNativeSearchField.ios.tsx`), which is
 * uncontrolled natively, so the iOS implementation mirrors `value` back into
 * the field through its imperative ref whenever the caller changes it out of
 * band (a programmatic clear, or resetting the query when a sheet reopens).
 */
export type NemuNativeSearchFieldProps = {
  /** Current query text. The caller owns this state. */
  value: string;
  /** Called with every user edit, and with `""` when the clear action fires. */
  onChangeText: (value: string) => void;
  /** Called when the keyboard's search key is pressed. */
  onSubmit?: () => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Accessibility label for the trailing clear control. */
  clearAccessibilityLabel: string;
  testID?: string;
  /** Test ID for the trailing clear control. */
  clearActionTestID?: string;
};
