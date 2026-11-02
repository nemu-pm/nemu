export type MobileSourceLoginNativeField = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** A hint under the field (the web login's local storage keys). */
  footer?: string;
  secure?: boolean;
  multiline?: boolean;
  keyboard?: "default" | "email-address";
};

export type MobileSourceLoginNativeSheetProps = {
  visible: boolean;
  title: string;
  /** The instructions, under the fields. */
  instructions: string;
  /** Basic: username and password in one group. Web: one group per field. */
  method: "basic" | "web";
  fields: MobileSourceLoginNativeField[];
  error: string | null;
  submitting: boolean;
  cancelLabel: string;
  submitLabel: string;
  submitAccessibilityLabel: string;
  onClose: () => void;
  onDismiss?: () => void;
  onSubmit: () => void;
};
