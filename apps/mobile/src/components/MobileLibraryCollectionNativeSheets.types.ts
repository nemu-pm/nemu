import type { LocalCollection } from "@/data/schema";
import type { MobileCollectionActionState } from "@/lib/mobileCollections";
import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileLibraryTitleMenuNativeSheetProps = {
  visible: boolean;
  collections: LocalCollection[];
  strings: MobileStrings;
  selectedCollectionId: string | null;
  disabled: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onSelect: (collectionId: string | null) => void;
  onManage: () => void;
};

export type MobileCollectionNameNativeSheetProps = {
  visible: boolean;
  mode: "create" | "rename";
  initialName?: string;
  strings: MobileStrings;
  saving: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onSubmit: (name: string) => void;
};

export type MobileCollectionsManagerNativeSheetProps = {
  visible: boolean;
  collections: LocalCollection[];
  strings: MobileStrings;
  membership: Map<string, Set<string>>;
  selectedCollectionId: string | null;
  actionState: MobileCollectionActionState;
  onClose: () => void;
  onDismiss?: () => void;
  onSelect: (collectionId: string) => void;
  /**
   * The sheet asks for names and confirmations itself (alerts over the
   * sheet, as in Photos), so these commit: the sheet stays open and its list
   * updates in place.
   */
  onCreate: (name: string) => void;
  onRename: (collection: LocalCollection, name: string) => void;
  onRemove: (collection: LocalCollection) => void;
};
