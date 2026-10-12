import { createContext, useContext, type ReactNode } from "react";
import type { ViewProps } from "react-native";
import { ContextMenuView } from "../../modules/nemu-window-layout";
import { contextMenuViewAvailable } from "../../modules/nemu-window-layout/src/ContextMenu";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import type { QuickAction } from "./QuickActionSheet";

// Kept beside the wrapper so callers and the fallback agree on gesture ownership.
// eslint-disable-next-line react-refresh/only-export-components
export const mobileNativeQuickMenuAvailable = mobileDesignExploreFlag && contextMenuViewAvailable;
const ActionsContext = createContext<((key: string) => QuickAction[]) | null>(null);
export const MobileQuickActionProvider = ActionsContext.Provider;
const symbols: Record<string, string> = {
  "checkmark-done-outline": "checkmark.circle",
  "albums-outline": "folder.badge.plus",
  "open-outline": "arrow.up.right.square",
  "trash-outline": "trash",
  "settings-outline": "gearshape",
  "options-outline": "slider.horizontal.3",
  "refresh-outline": "arrow.down.circle",
  "download-outline": "arrow.down.circle",
  "globe-outline": "globe",
};

/** The same action model drives the native menu and the cross-platform sheet. */
export function MobileQuickActionMenu({
  actionKey,
  actions: provided,
  beforeAction,
  children,
  style,
  cornerRadius = 16,
}: {
  style?: ViewProps["style"];
  actionKey?: string;
  actions?: QuickAction[];
  beforeAction?: () => void;
  cornerRadius?: number;
  children: ReactNode;
}) {
  const getActions = useContext(ActionsContext);
  const actions = provided ?? (actionKey ? getActions?.(actionKey) : undefined) ?? [];
  if (!mobileNativeQuickMenuAvailable || !actions.length) return <>{children}</>;
  return (
    <ContextMenuView
      style={style}
      previewCornerRadius={cornerRadius}
      items={actions.map((action) => ({
        id: action.id,
        title: action.label,
        systemImage: symbols[action.icon],
        destructive: action.destructive,
      }))}
      onMenuAction={(id) => {
        beforeAction?.();
        actions.find((action) => action.id === id)?.onPress();
      }}
    >
      {children}
    </ContextMenuView>
  );
}
