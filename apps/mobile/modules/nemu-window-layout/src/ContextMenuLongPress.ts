import { createContext, useContext } from "react";

/**
 * True inside a native context menu (`ContextMenuView` on iOS with items):
 * the system's `UIContextMenuInteraction` owns the long press there. React
 * Native's Pressability only cancels the press on release after a long hold
 * when the pressable has an `onLongPress`, so pressables inside give
 * themselves a no-op one (`NemuPressable`); otherwise lifting the finger
 * after the menu opened also ran `onPress` (opening the title underneath).
 */
export const NativeContextMenuLongPressContext = createContext(false);

export function useNativeContextMenuOwnsLongPress(): boolean {
  return useContext(NativeContextMenuLongPressContext);
}
