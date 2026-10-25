import { useState, type ComponentType, type ReactNode } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { Platform, View, type ViewProps } from "react-native";
import type { ContextMenuItem } from "./types";
import { createNativeContextMenuPressGate, NativeContextMenuLongPressContext } from "./ContextMenuLongPress";

type ContextMenuViewProps = {
  items: ContextMenuItem[];
  menuTitle?: string;
  previewCornerRadius?: number;
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
  onMenuWillDisplay?: () => void;
  onMenuWillEnd?: () => void;
  /** TEST-ONLY trace events (remove before release). */
  onMenuConfigure?: () => void;
  onMenuPreviewTap?: () => void;
};

const NativeContextMenu: ComponentType<NativeProps> | null = contextMenuViewAvailable
  ? requireNativeViewManager<NativeProps>("NemuWindowLayout", "NemuContextMenuView")
  : null;

/**
 * A system context menu on `children` (iOS `UIContextMenuInteraction`): a long
 * press lifts the view and opens the menu. Taps still reach the children.
 * Without the native view (Android, an older binary) it is a plain view.
 */
export function ContextMenuView({ items, menuTitle, previewCornerRadius, onMenuAction, style, children }: ContextMenuViewProps) {
  // One gate per menu: the pressables inside drop the release of a touch
  // that became the menu's long press (see `ContextMenuLongPress`).
  const [gate] = useState(createNativeContextMenuPressGate);
  if (!NativeContextMenu) return <View style={style}>{children}</View>;
  return (
    <NativeContextMenu
      items={items}
      menuTitle={menuTitle}
      previewCornerRadius={previewCornerRadius}
      onMenuAction={onMenuAction ? (event) => onMenuAction(event.nativeEvent.id) : undefined}
      onMenuWillDisplay={gate.menuWillDisplay}
      onMenuWillEnd={gate.menuWillEnd}
      onMenuConfigure={gate.menuConfigure}
      onMenuPreviewTap={gate.menuPreviewTap}
      style={style}
    >
      {items.length > 0 ? (
        // The menu owns the long press: pressables inside must not also
        // treat the release after the hold as a tap.
        <NativeContextMenuLongPressContext.Provider value={gate}>
          {children}
        </NativeContextMenuLongPressContext.Provider>
      ) : (
        children
      )}
    </NativeContextMenu>
  );
}
