import type { SourcePackageSetting } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileSourceMultiSelectNativeSheetProps = {
  setting: SourcePackageSetting;
  options: Array<{ label: string; value: string }>;
  selectedValues: string[];
  visible: boolean;
  single: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onToggle: (value: string) => void;
  onClose: () => void;
  onDismiss?: () => void;
};

export type MobileSourceStringListNativeSheetProps = {
  setting: SourcePackageSetting;
  items: string[];
  visible: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onAdd: (item: string) => void;
  onRemove: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onClose: () => void;
  onDismiss?: () => void;
};
