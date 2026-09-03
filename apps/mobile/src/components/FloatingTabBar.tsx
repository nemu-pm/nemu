import { router, usePathname } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  radius,
  spacing,
  nemuFontWeight,
  useNemuTheme,
  GlassSurface,
  NemuPressable,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getMobileStrings, type MobileStrings } from "@/lib/mobileI18n";
import {
  getMobileRootTabPressAction,
  isMobileRootTabSelected,
  type MobileRootTabHref,
} from "@/lib/mobileRootTabs";
import { emitMobileRootTabReselect } from "@/lib/mobileRootTabReselect";
import {
  MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT,
  MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING,
} from "@/lib/mobileFloatingTabBarClearance";

type TabItem = {
  href: MobileRootTabHref;
  labelKey: keyof MobileStrings["nav"];
  icon: keyof typeof Ionicons.glyphMap;
  selectedIcon: keyof typeof Ionicons.glyphMap;
};

const tabs: TabItem[] = [
  { href: "/library", labelKey: "library", icon: "home-outline", selectedIcon: "home" },
  { href: "/browse", labelKey: "browse", icon: "globe-outline", selectedIcon: "globe" },
  { href: "/search", labelKey: "search", icon: "search-outline", selectedIcon: "search" },
  { href: "/settings", labelKey: "settings", icon: "settings-outline", selectedIcon: "settings" },
];

const TAB_ITEM_WIDTH = 72;
const TAB_ITEM_GAP = 8;

export function FloatingTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { reduceMotion, tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => isMobileRootTabSelected(pathname, tab.href)),
  );
  const [pillProgress] = useState(() => new Animated.Value(activeIndex));

  useEffect(() => {
    pillProgress.stopAnimation();
    if (reduceMotion) {
      pillProgress.setValue(activeIndex);
      return;
    }
    Animated.timing(pillProgress, {
      toValue: activeIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, pillProgress, reduceMotion]);

  const barContent = (
    <View accessibilityRole="tablist" style={styles.items}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.selectionPill,
          {
            backgroundColor: `${tokens.primary}24`,
            transform: [
              {
                translateX: pillProgress.interpolate({
                  inputRange: [0, tabs.length - 1],
                  outputRange: [0, (tabs.length - 1) * (TAB_ITEM_WIDTH + TAB_ITEM_GAP)],
                }),
              },
            ],
          },
        ]}
      />
      {tabs.map((tab) => {
        const active = isMobileRootTabSelected(pathname, tab.href);
        const pressAction = getMobileRootTabPressAction(pathname, tab.href);
        const canReselect = pressAction === "reselect";
        const canNavigate = pressAction === "navigate";
        const color = active ? tokens.primary : tokens.mutedForeground;

        return (
          <NemuPressable
            key={tab.href}
            accessibilityRole="tab"
            accessibilityLabel={strings.nav[tab.labelKey]}
            accessibilityState={{ selected: active }}
            hapticFeedback={canNavigate || canReselect ? "selection" : "none"}
            pressProfile="tab"
            onPress={() => {
              if (canReselect) {
                emitMobileRootTabReselect(tab.href);
                return;
              }
              if (!canNavigate) return;
              router.navigate(tab.href);
            }}
            style={styles.item}
          >
            <Ionicons
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no"
              name={active ? tab.selectedIcon : tab.icon}
              size={23}
              color={color}
            />
            <Text
              accessible={false}
              accessibilityElementsHidden
              adjustsFontSizeToFit
              importantForAccessibility="no"
              maxFontSizeMultiplier={1.4}
              minimumFontScale={0.75}
              numberOfLines={1}
              style={[styles.label, { color }]}
            >
              {strings.nav[tab.labelKey]}
            </Text>
          </NemuPressable>
        );
      })}
    </View>
  );

  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + spacing.tabBottom }]}
    >
      <GlassSurface
        intensity={32}
        style={[
          styles.bar,
          {
            backgroundColor:
              Platform.OS === "android" ? tokens.card : tokens.tabGlass,
            borderColor: tokens.tabBorder,
          },
        ]}
      >
        {barContent}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
    pointerEvents: "box-none",
    paddingHorizontal: 8,
  },
  bar: {
    borderRadius: radius.tab,
    maxWidth: "100%",
  },
  items: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING,
  },
  item: {
    width: TAB_ITEM_WIDTH,
    minHeight: MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectionPill: {
    position: "absolute",
    left: 12,
    top: MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING,
    width: TAB_ITEM_WIDTH,
    height: MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT,
    borderRadius: 16,
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: nemuFontWeight.semibold,
    letterSpacing: 0,
    maxWidth: 64,
  },
});
