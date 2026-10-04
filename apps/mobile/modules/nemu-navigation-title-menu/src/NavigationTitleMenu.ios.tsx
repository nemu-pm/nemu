import type { ComponentType } from "react";
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core";
import { StyleSheet } from "react-native";
import type {
  NavigationTitleMenuHeader,
  NavigationTitleMenuProps,
  NavigationTitleMenuSection,
} from "./types";

type NativeProps = {
  sections: NavigationTitleMenuSection[];
  header?: NavigationTitleMenuHeader | null;
  onSelectAction: (event: { nativeEvent: { id: string } }) => void;
  pointerEvents?: "none";
  style?: unknown;
};

const nativeModule = requireOptionalNativeModule<{ titleMenuAvailable?: boolean }>(
  "NemuNavigationTitleMenu",
);

/** False for a binary built before the module existed (no crash, no menu). */
export const navigationTitleMenuAvailable = nativeModule?.titleMenuAvailable === true;

const NativeNavigationTitleMenu: ComponentType<NativeProps> | null =
  navigationTitleMenuAvailable
    ? requireNativeViewManager<NativeProps>("NemuNavigationTitleMenu")
    : null;

/**
 * Gives the native-stack screen this is mounted in a UIKit title menu
 * (`UINavigationItem.titleMenuProvider`): the system chevron beside the
 * navigation title, and a menu opened from the title. Mount it anywhere in
 * the screen; it renders nothing itself.
 */
export default function NavigationTitleMenu({
  sections,
  header,
  onSelectAction,
}: NavigationTitleMenuProps) {
  if (!NativeNavigationTitleMenu) return null;
  return (
    <NativeNavigationTitleMenu
      sections={sections}
      header={header ?? null}
      onSelectAction={(event) => onSelectAction(event.nativeEvent.id)}
      pointerEvents="none"
      style={styles.hidden}
    />
  );
}

const styles = StyleSheet.create({
  hidden: { position: "absolute", width: 0, height: 0 },
});
