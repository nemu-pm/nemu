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
import { resolveNemuNativeHeaderChrome } from "./nativeHeaderChrome";
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
};

export const usesNemuNativeHeader =
  Platform.OS === "ios" || Platform.OS === "android";

export { NEMU_SOFT_SCROLL_EDGE_EFFECTS } from "./nativeHeaderChrome";

/**
 * Native stack defaults: transparent iOS bars with soft edges when horizontal.
 * Vertical bars leave the top/bottom content clear; derive placement from the
 * window observer so folding and navigation update the effects together.
 */
export function createNemuNativeStackScreenOptions(tokens: NemuTokens, verticalBarSide: "left" | "right" | null = null) {
  return {
    contentStyle: { backgroundColor: tokens.background },
    headerBackButtonDisplayMode: "minimal" as const,
    headerBackTitle: "",
    headerShadowVisible: false,
    headerShown: usesNemuNativeHeader,
    ...resolveNemuNativeHeaderChrome(Platform.OS, tokens.background, verticalBarSide),
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
  verticalBarSide: "left" | "right" | null = null,
) {
  return {
    ...createNemuNativeStackScreenOptions(tokens, verticalBarSide),
    headerShown: true,
    title,
  };
}

/** Every native screen is soft-edged now; an alias of `createNemuNativeScreenOptions`. */
export const createNemuSoftEdgeScreenOptions = createNemuNativeScreenOptions;

/**
 * Bar items take the platform's own colour: no tint is passed, so on iOS 26+
 * they are the system's monochrome Liquid Glass items and on Android they
 * follow the bar's content colour.
 */
export function renderNemuNativeToolbarButtons(
  actions: NemuNativeHeaderAction[],
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
