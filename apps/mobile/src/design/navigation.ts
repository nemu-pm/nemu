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

/**
 * iOS 26+ soft top scroll edge (`UIScrollEdgeEffect.Style.soft`): the
 * navigation bar is see-through and content scrolls under it, fading softly
 * into the bar instead of stopping at an opaque band with a hard cut. Content
 * still starts below the bar (`contentInsetAdjustmentBehavior="automatic"`).
 * No `headerBlurEffect` with it (react-native-screens: the two overlap).
 * Android keeps the opaque bar (Material top app bars tint on scroll instead).
 */
export const NEMU_SOFT_SCROLL_EDGE_EFFECTS = {
  top: "soft",
  bottom: "automatic",
  left: "automatic",
  right: "automatic",
} as const;

export function createNemuSoftEdgeScreenOptions(
  tokens: NemuTokens,
  title: string,
) {
  const base = createNemuNativeScreenOptions(tokens, title);
  if (Platform.OS !== "ios") return base;
  return {
    ...base,
    headerTransparent: true,
    headerStyle: { backgroundColor: "transparent" },
    scrollEdgeEffects: NEMU_SOFT_SCROLL_EDGE_EFFECTS,
  };
}

export function renderNemuNativeToolbarButtons(
  actions: NemuNativeHeaderAction[],
  tintColor: string,
) {
  return actions.map((action) => {
    const disabled = isMobileHeaderActionDisabled(action);
    // The label is passed as the button's children so it becomes the
    // `UIBarButtonItem.title` (expo-router maps it to `label` → `title`). The
    // bar still presents the symbol only, but the system needs the title for
    // overflow menus and expanded forms (HIG, iPhone Duo: "Include a title even
    // when an item shows a symbol"), which the vertical bar hits often on the
    // 466pt-tall outer display in landscape.
    return createElement(
      Stack.Toolbar.Button,
      {
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
      },
      action.label,
    );
  });
}
