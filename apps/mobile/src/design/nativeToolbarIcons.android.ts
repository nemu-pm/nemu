import AddIcon from "@expo/material-symbols/add.xml";
import ArrowBackIcon from "@expo/material-symbols/arrow_back.xml";
import CloseIcon from "@expo/material-symbols/close.xml";
import DeleteIcon from "@expo/material-symbols/delete.xml";
import EditIcon from "@expo/material-symbols/edit.xml";
import LayersIcon from "@expo/material-symbols/layers.xml";
import MoreIcon from "@expo/material-symbols/more_horiz.xml";
import SearchIcon from "@expo/material-symbols/search.xml";
import type { ImageSourcePropType } from "react-native";
import type { NemuNativeToolbarSymbol } from "./nativeToolbarIcons";

const androidToolbarIcons: Record<NemuNativeToolbarSymbol, ImageSourcePropType> = {
  "chevron.left": ArrowBackIcon,
  "ellipsis.circle": MoreIcon,
  magnifyingglass: SearchIcon,
  pencil: EditIcon,
  plus: AddIcon,
  "square.stack.3d.up": LayersIcon,
  trash: DeleteIcon,
  "xmark.circle": CloseIcon,
};

export function resolveNemuNativeToolbarIcon(
  icon: NemuNativeToolbarSymbol,
): ImageSourcePropType {
  return androidToolbarIcons[icon];
}
