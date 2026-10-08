import type { ComponentType, ReactNode } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, View, type ViewProps } from "react-native";

export type ContextMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** SF Symbol name. */
  systemImage?: string;
  destructive?: boolean;
  disabled?: boolean;
};

type ContextMenuViewProps = {
  items: ContextMenuItem[];
  menuTitle?: string;
  onMenuAction?: (id: string) => void;
  style?: ViewProps["style"];
  children?: ReactNode;
};

const nativeModule = Platform.OS === "ios"
  ? requireOptionalNativeModule<{ contextMenuViewAvailable?: boolean }>("NemuWindowLayout")
  : null;

/** True when this binary has the context menu view (older binaries get a plain view). */
export const contextMenuViewAvailable = nativeModule?.contextMenuViewAvailable === true;

type NativeProps = Omit<ContextMenuViewProps, "onMenuAction"> & {
  onMenuAction?: (event: { nativeEvent: { id: string } }) => void;
};

const NativeContextMenu: ComponentType<NativeProps> | null = contextMenuViewAvailable
  ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuContextMenuView")
  : null;

/**
 * A system context menu on `children` (iOS `UIContextMenuInteraction`): a long
 * press lifts the view and opens the menu. Taps still reach the children.
 * Without the native view (Android, an older binary) it is a plain view.
 */
export function ContextMenuView({ items, menuTitle, onMenuAction, style, children }: ContextMenuViewProps) {
  if (!NativeContextMenu) return <View style={style}>{children}</View>;
  return (
    <NativeContextMenu
      items={items}
      menuTitle={menuTitle}
      onMenuAction={onMenuAction ? (event) => onMenuAction(event.nativeEvent.id) : undefined}
      style={style}
    >
      {children}
    </NativeContextMenu>
  );
}
