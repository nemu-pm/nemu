import type { ReactNode } from "react";

/** A sheet height, as SwiftUI `presentationDetents` takes it. */
export type MobileNativeFormSheetDetent = "medium" | "large" | { fraction: number } | { height: number };

export type MobileNativeFormSheetAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Replaces the action with a spinner while its work runs. */
  busy?: boolean;
};

export type MobileNativeFormSheetProps = {
  visible: boolean;
  /** The person dismissed the sheet (swipe down or the close / cancel action). */
  onClose: () => void;
  /** The system finished dismissing the sheet. */
  onDismiss?: () => void;
  title: string;
  subtitle?: string;
  detents: MobileNativeFormSheetDetent[];
  /**
   * `glass` (default): the system's Liquid Glass sheet, for a few short
   * action rows. `grouped`: the opaque grouped-table background with solid
   * cells and compact section spacing (Settings, Photos "Add to Album") —
   * for lists of names and counts, whose secondary text loses its contrast
   * over glass when the library's covers are behind the sheet.
   */
  background?: "glass" | "grouped";
  /**
   * The first group sits just under the bar (inline title, no top scroll
   * margin) on a glass sheet too, instead of below an empty band
   * (design-explore; `grouped` always does).
   */
  tightTop?: boolean;
  /** Blocks swipe-to-dismiss (unsaved changes, work in flight). */
  interactiveDismissDisabled?: boolean;
  /**
   * Leading action. A string is a text Cancel; omitted, the sheet gets the
   * system close (xmark) button.
   */
  cancel?: MobileNativeFormSheetAction;
  closeAccessibilityLabel?: string;
  /** Trailing confirmation (Save / Done / Create), drawn as the prominent action. */
  confirm?: MobileNativeFormSheetAction;
  /** Extra trailing icon action (e.g. "+" for a new item). */
  primaryAction?: MobileNativeFormSheetAction & { systemImage: string };
  /**
   * SwiftUI `Section`s of the sheet's `Form` (iOS only — the content is
   * `@expo/ui/swift-ui` views).
   */
  children: ReactNode;
  /**
   * Wraps the form (SwiftUI `alert` / `confirmationDialog` presenters that
   * need a trigger view): receives the form, returns it wrapped.
   */
  wrapForm?: (form: ReactNode) => ReactNode;
  /**
   * Remounts the Form when it changes. Pass the identity of a list that can
   * gain or lose rows, so a created / removed collection starts a fresh Form
   * instead of an animated row diff inside the `@expo/ui` Form (defensive:
   * the crash seen while building this came from a destructive-role swipe
   * action, see MobileCollectionMembershipNativeForm.ios.tsx).
   */
  formKey?: string;
  testID?: string;
};
