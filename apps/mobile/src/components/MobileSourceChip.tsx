import type Ionicons from "@expo/vector-icons/Ionicons";
import { MobileChip } from "@/design-system";

type MobileSourceChipProps = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  badge?: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: "button" | "checkbox" | "tab";
  onPress: () => void;
  onLongPress?: () => void;
};

/**
 * The Search tab's source selector chip. Now a named alias for the shared
 * `MobileChip` `toggle` variant so the source row, the browse filter row, and
 * the add-source sheet all paint the same pill.
 */
export function MobileSourceChip(props: MobileSourceChipProps) {
  return <MobileChip variant="toggle" {...props} />;
}
