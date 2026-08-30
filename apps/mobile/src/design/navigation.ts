import { createElement, type ComponentProps } from "react";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { hapticPress } from "@/lib/haptics";
import { isMobileHeaderActionDisabled } from "@/lib/mobileHeaderActions";
import type { MobileHeaderActionState } from "@/lib/mobileHeaderActions";
import {
  resolveNemuNativeToolbarIcon,
  type NemuNativeToolbarSymbol,
} from "./nativeToolbarIcons";
import type { NemuTokens } from "./tokens";
import { nemuFontWeight } from "./typography";

type NemuNativeToolbarIcon = NonNullable<
  ComponentProps<typeof Stack.Toolbar.Button>["icon"]
>;

export type NemuNativeHeaderAction = MobileHeaderActionState & {
  icon: NemuNativeToolbarSymbol;
  label: string;
  hint?: string;
  onPress: () => void;
  tintColor?: string;
};

export const usesNemuNativeHeader =
  Platform.OS === "ios" || Platform.OS === "android";

export function createNemuNativeStackScreenOptions(tokens: NemuTokens) {
  return {
    contentStyle: { backgroundColor: tokens.background },
    headerBackButtonDisplayMode: "minimal" as const,
    headerBackTitle: "",
    headerShadowVisible: false,
    headerShown: usesNemuNativeHeader,
    headerStyle: { backgroundColor: tokens.background },
    headerTintColor: tokens.foreground,
    headerTitleStyle: {
      color: tokens.foreground,
      fontSize: 17,
      fontWeight: nemuFontWeight.semibold,
    },
  };
}

export function createNemuNativeScreenOptions(
  tokens: NemuTokens,
  title: string,
) {
  return {
    ...createNemuNativeStackScreenOptions(tokens),
    headerShown: true,
    title,
  };
}

export function renderNemuNativeToolbarButtons(
  actions: NemuNativeHeaderAction[],
  tintColor: string,
) {
  return actions.map((action) => {
    const disabled = isMobileHeaderActionDisabled(action);
    return createElement(Stack.Toolbar.Button, {
      key: action.label,
      accessibilityLabel: action.label,
      accessibilityHint: action.hint,
      disabled,
      icon: resolveNemuNativeToolbarIcon(action.icon) as NemuNativeToolbarIcon,
      tintColor: action.tintColor ?? tintColor,
      onPress: () => {
        if (disabled) return;
        void hapticPress();
        action.onPress();
      },
    });
  });
}
