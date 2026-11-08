import type { LocalCollection } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileCollectionMembershipNativeFormRow = {
  collection: LocalCollection;
  /** Books in the collection: the row's trailing value. */
  count: number;
  /** The count as words, for VoiceOver. */
  countLabel: string;
  selected: boolean;
};

export type MobileCollectionMembershipNativeFormProps = {
  visible: boolean;
  strings: MobileStrings;
  subtitle: string;
  loading: boolean;
  rows: MobileCollectionMembershipNativeFormRow[];
  /** Any collection operation in flight: rows and actions wait. */
  busy: boolean;
  saving: boolean;
  creating: boolean;
  saveDisabled: boolean;
  /** Unsaved changes or work in flight: swipe-to-dismiss is blocked, Cancel still works. */
  dirty: boolean;
  error: string | null;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
  onToggle: (collectionId: string) => void;
  onCreate: (name: string) => void;
  onRename: (collection: LocalCollection, name: string) => void;
  onRemove: (collection: LocalCollection) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Swipe-down / system dismissal request. */
  onClose: () => void;
  onDismiss: () => void;
};
