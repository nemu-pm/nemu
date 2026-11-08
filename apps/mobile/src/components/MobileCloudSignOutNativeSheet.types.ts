import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileCloudSignOutNativeSheetProps = {
  visible: boolean;
  strings: MobileStrings;
  keepData: boolean;
  loading: boolean;
  error?: { title: string; detail: string } | null;
  /** A choice row was tapped (the caller skips the one already chosen). */
  onSelectChoice: (keepData: boolean) => void;
  onErrorDismiss: () => void;
  /** Cancel, or the sheet swiped away. */
  onClose: () => void;
  onConfirm: () => void;
};
