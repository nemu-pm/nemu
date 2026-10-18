import AddIcon from "@expo/material-symbols/add.xml";
import RefreshIcon from "@expo/material-symbols/refresh.xml";
import SettingsIcon from "@expo/material-symbols/settings.xml";
import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml";
import CheckIcon from "@expo/material-symbols/check.xml";
import CloseIcon from "@expo/material-symbols/close.xml";
import DeleteIcon from "@expo/material-symbols/delete.xml";
import DownloadIcon from "@expo/material-symbols/download.xml";
import NewFolderIcon from "@expo/material-symbols/create_new_folder.xml";
import EditIcon from "@expo/material-symbols/edit.xml";
import CollectionsIcon from "@expo/material-symbols/collections_bookmark.xml";
import FolderManagedIcon from "@expo/material-symbols/folder_managed.xml";
import LayersIcon from "@expo/material-symbols/layers.xml";
import SearchIcon from "@expo/material-symbols/search.xml";
import TuneIcon from "@expo/material-symbols/tune.xml";
import CheckCircleIcon from "@expo/material-symbols/check_circle.xml";
import UncheckedCircleIcon from "@expo/material-symbols/radio_button_unchecked.xml";
import LibraryAddIcon from "@expo/material-symbols/library_add.xml";
import LinkIcon from "@expo/material-symbols/link.xml";
import ShareIcon from "@expo/material-symbols/share.xml";
import type { ImageSourcePropType } from "react-native";
import type { NemuNativeToolbarSymbol } from "./nativeToolbarIcons";

const androidToolbarIcons: Record<NemuNativeToolbarSymbol, ImageSourcePropType> = {
  "arrow.clockwise": RefreshIcon,
  checkmark: CheckIcon,
  "checkmark.circle": CheckCircleIcon,
  circle: UncheckedCircleIcon,
  link: LinkIcon,
  "rectangle.stack.badge.plus": LibraryAddIcon,
  "square.and.arrow.up": ShareIcon,
  "chevron.left": ArrowBackIcon,
  "folder.badge.gearshape": FolderManagedIcon,
  "folder.badge.plus": NewFolderIcon,
  gearshape: SettingsIcon,
  "line.3.horizontal.decrease": TuneIcon,
  magnifyingglass: SearchIcon,
  pencil: EditIcon,
  plus: AddIcon,
  "rectangle.stack": CollectionsIcon,
  "square.and.arrow.down": DownloadIcon,
  "square.stack.3d.up": LayersIcon,
  trash: DeleteIcon,
  "xmark.circle": CloseIcon,
};

export function resolveNemuNativeToolbarIcon(
  icon: NemuNativeToolbarSymbol,
): ImageSourcePropType {
  return androidToolbarIcons[icon];
}
