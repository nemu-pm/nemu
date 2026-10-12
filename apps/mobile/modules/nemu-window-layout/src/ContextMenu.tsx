import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import type { ContextMenuItem } from "./types";

export const contextMenuViewAvailable = false;

/** Web and tests: a plain view (the menu is iOS only). */
export function ContextMenuView({
  style,
  children,
}: {
  items: ContextMenuItem[];
  menuTitle?: string;
  previewCornerRadius?: number;
  onMenuAction?: (id: string) => void;
  style?: ViewProps["style"];
  children?: ReactNode;
}) {
  return <View style={style}>{children}</View>;
}
