import Ionicons from "@expo/vector-icons/Ionicons";
import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import CheckCircleIcon from "@expo/material-symbols/check_circle.xml";
import ContentCopyIcon from "@expo/material-symbols/content_copy.xml";
import DocumentScannerIcon from "@expo/material-symbols/document_scanner.xml";
import ExtensionIcon from "@expo/material-symbols/extension.xml";
import FormatListBulletedIcon from "@expo/material-symbols/format_list_bulleted.xml";
import ForumIcon from "@expo/material-symbols/forum.xml";
import RefreshIcon from "@expo/material-symbols/refresh.xml";
import SettingsIcon from "@expo/material-symbols/settings.xml";
import SkipNextIcon from "@expo/material-symbols/skip_next.xml";
import SkipPreviousIcon from "@expo/material-symbols/skip_previous.xml";
import ViewColumnIcon from "@expo/material-symbols/view_column.xml";
import { StyleSheet, View, type ImageSourcePropType } from "react-native";
import { hapticSelection } from "@/lib/haptics";
import type {
  MobileReaderMoreMenuActionId,
  MobileReaderMoreMenuIcon,
} from "@/lib/mobileReaderMoreMenu";
import type { ReaderMoreMenuProps } from "./ReaderMoreMenu.types";

const SIZE = 44;

const ICONS: Record<MobileReaderMoreMenuIcon, ImageSourcePropType> = {
  skipPrevious: SkipPreviousIcon,
  skipNext: SkipNextIcon,
  refresh: RefreshIcon,
  checkCircle: CheckCircleIcon,
  settings: SettingsIcon,
  extension: ExtensionIcon,
  detectText: DocumentScannerIcon,
  nemuChat: ForumIcon,
  dualRead: ContentCopyIcon,
  bilingualLayout: ViewColumnIcon,
  chapterList: FormatListBulletedIcon,
};

/**
 * Android: the ⋯ button anchors a Material 3 dropdown (Compose
 * `DropdownMenu` through `MenuView`), the sections split by dividers.
 */
export function ReaderMoreMenu({
  sections,
  accessibilityLabel,
  accessibilityHint,
  color,
  onAction,
  onInteract,
}: ReaderMoreMenuProps) {
  const actions: MenuAction[] = sections.map((section) => ({
    id: section.id,
    title: "",
    displayInline: true,
    subactions: section.items.map((item) => ({
      id: item.id,
      title: item.subtitle ? `${item.title} · ${item.subtitle}` : item.title,
      image: ICONS[item.icon],
      state: item.checked === undefined ? undefined : item.checked ? "on" : "off",
      attributes: { disabled: item.disabled },
    })),
  }));
  return (
    <View style={styles.root} onTouchStart={onInteract}>
      <MenuView
        colorScheme="dark"
        actions={actions}
        onPressAction={({ nativeEvent }) => {
          const item = sections
            .flatMap((section) => section.items)
            .find((entry) => entry.id === nativeEvent.event);
          if (!item || item.disabled) return;
          void hapticSelection();
          onAction(nativeEvent.event as MobileReaderMoreMenuActionId);
        }}
        style={styles.root}
      >
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityRole="button"
          style={styles.trigger}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={color} />
        </View>
      </MenuView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
  },
  trigger: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
