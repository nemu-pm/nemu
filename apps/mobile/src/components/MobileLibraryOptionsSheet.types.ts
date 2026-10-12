import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileLibraryOptionsSheetProps = {
  visible: boolean;
  /** "add": not saved yet; "in-library": saved; null while no sheet is up. */
  mode: "add" | "in-library" | null;
  strings: MobileStrings;
  /** A library action is in flight: every option waits. */
  busy: boolean;
  adding: boolean;
  /** Offer "Add and Start Reading" (a first chapter is known). */
  canAddAndRead: boolean;
  error: string | null;
  onClearError: () => void;
  onClose: () => void;
  onDismiss: () => void;
  onAdd: () => void;
  onAddAndRead: () => void;
  onManageCollections: () => void;
  onRemove: () => void;
};
