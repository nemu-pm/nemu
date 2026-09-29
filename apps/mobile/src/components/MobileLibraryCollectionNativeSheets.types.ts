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
  onCreate: () => void;
  onRename: (collection: LocalCollection) => void;
  onRemove: (collection: LocalCollection) => void;
};
