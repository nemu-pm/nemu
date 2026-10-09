import { router, usePathname, useRootNavigationState } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, I18nManager, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  nemuColorWithAlpha,
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
  type MobileRootTabHref,
} from "@/lib/mobileRootTabs";
import {
  navigateToMobileRootTab,
  resolveMobileActiveRootTabHref,
  type MobileNavigationState,
} from "@/lib/mobileRootTabNavigation";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { emitMobileRootTabReselect } from "@/lib/mobileRootTabReselect";
import {
  MOBILE_FLOATING_TAB_BAR_ITEM_MIN_HEIGHT,
  MOBILE_FLOATING_TAB_BAR_VERTICAL_PADDING,
  resolveMobileFloatingTabBarFrame,
} from "@/lib/mobileFloatingTabBarClearance";
import { resolveMobileBottomScrollEdgeEffect } from "@/lib/mobileScrollEdgeEffect";
import { scrollEdgeEffectSupportsProgressiveBlur } from "../../modules/nemu-scroll-edge-effect";

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

const tabHrefs = tabs.map((tab) => tab.href);

const ANDROID_FOCUS_RIPPLE =
  Platform.OS === "android" ? { color: "transparent", foreground: true } : undefined;

const TAB_ITEM_WIDTH = 72;
const TAB_ITEM_GAP = 8;

export function FloatingTabBar() {
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState() as
    | MobileNavigationState
    | undefined;
  const activeHref = resolveMobileActiveRootTabHref(
    pathname,
    rootNavigationState,
    tabHrefs,
  );
  const adaptive = useMobileAdaptiveLayout();
  const paneFrame = resolveMobileFloatingTabBarFrame({
    windowWidth: adaptive.width,
    posture: adaptive.posture,
    panels: adaptive.panels,
    layoutDirection: I18nManager.isRTL ? "rtl" : "ltr",
  });
  const insets = useSafeAreaInsets();
  const { reduceMotion, tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.href === activeHref),
  );
  const [pillProgress] = useState(() => new Animated.Value(activeIndex));
  // Android keyboard / D-pad focus: the system highlight is a rectangle over
  // the whole touch target, so it is replaced by a ring in the pill's shape.
  const [focusedHref, setFocusedHref] = useState<MobileRootTabHref | null>(null);

  useEffect(() => {
    pillProgress.stopAnimation();
    if (reduceMotion) {
      pillProgress.setValue(activeIndex);
      return;
    }
    Animated.spring(pillProgress, {
      toValue: activeIndex,
      damping: 22,
      stiffness: 320,
      mass: 1,
      overshootClamping: false,
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
            backgroundColor: nemuColorWithAlpha(tokens.primary, 0.14),
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
        const active = tab.href === activeHref;
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
            // A transparent foreground ripple declares a focused state, which
            // stops Android drawing its rectangular default focus highlight;
            // the pill-shaped ring below shows focus instead.
            android_ripple={ANDROID_FOCUS_RIPPLE}
            onFocus={
              Platform.OS === "android" ? () => setFocusedHref(tab.href) : undefined
            }
            onBlur={
              Platform.OS === "android"
                ? () => setFocusedHref((current) => (current === tab.href ? null : current))
                : undefined
            }
            onPress={() => {
              if (canReselect) {
                emitMobileRootTabReselect(tab.href);
                return;
              }
              if (!canNavigate) return;
              // From a detail or reader (above the tabs) this closes them
              // rather than stacking another copy of the tabs on top.
              if (!navigateToMobileRootTab(tab.href, { popToRoot: false, router })) {
                router.navigate(tab.href);
              }
            }}
            style={styles.item}
          >
            {focusedHref === tab.href ? (
              <View
                pointerEvents="none"
                style={[styles.focusRing, { borderColor: tokens.primary }]}
              />
            ) : null}
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

  // The fade half of the soft bottom edge; the blur half is the native
  // `MobileScrollEdgeEffectHost` around the stack. Static, token-coloured and
  // touch-transparent, so scrolling never re-renders it.
  const edgeEffect = resolveMobileBottomScrollEdgeEffect({
    bottomInset: insets.bottom,
    tabBottom: spacing.tabBottom,
    blurAvailable: scrollEdgeEffectSupportsProgressiveBlur,
  });
  const edgeScrim = (
    <LinearGradient
      accessible={false}
      colors={
        edgeEffect.scrimStops.map((stop) =>
          nemuColorWithAlpha(tokens.background, stop.alpha),
        ) as unknown as readonly [string, string, ...string[]]
      }
      importantForAccessibility="no-hide-descendants"
      locations={
        edgeEffect.scrimStops.map((stop) => stop.offset) as unknown as readonly [
          number,
          number,
          ...number[],
        ]
      }
      pointerEvents="none"
      style={[styles.edgeScrim, { height: edgeEffect.height }]}
    />
  );

  return (
    <>
      {edgeScrim}
      <View
        style={[
          styles.wrapper,
          { bottom: insets.bottom + spacing.tabBottom },
          paneFrame ? { left: paneFrame.left, right: undefined, width: paneFrame.width } : null,
        ]}
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
    </>
  );
}

const styles = StyleSheet.create({
  edgeScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 29,
  },
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
  focusRing: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    borderWidth: 2,
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
