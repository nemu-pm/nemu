import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  GlassSurface,
  NemuPressable,
  NemuRingSpinner,
  NemuText,
  nemuFontWeight,
  radius,
  useNemuTheme,
  useMobilePageGutters,
  nemuToneColor,
} from "@/design-system";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { getMobileFloatingTabBarOverlayExtent } from "@/lib/mobileFloatingTabBarClearance";
import { getMobileStrings } from "@/lib/mobileI18n";
import { useMobileBottomTabBarInset } from "@/lib/mobileBottomTabBarInset";
import { isMobileBottomTabBarRoute } from "@/lib/mobileRootTabs";
import {
  MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT,
  resolveMobileToastPlacement,
} from "@/lib/mobileToastPlacement";
import { useMobileToastObstacle, useMobileToastRegion } from "@/lib/mobileToastRegion";
import { createMobileToastStore } from "@/lib/mobileToastStore";
import {
  MobileToastContext,
  type MobileToastController,
  type MobileToastOptions,
  type MobileToastTone,
} from "./MobileToastContext";

const toastStore = createMobileToastStore<MobileToastOptions>();
const toastController: MobileToastController = {
  show: toastStore.show,
  dismiss: toastStore.dismiss,
};

const toneIcons: Record<MobileToastTone, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark",
  info: "information-circle",
  warning: "alert-circle-outline",
  danger: "warning",
};

type MobileToastSurfaceAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type MobileToastSurfaceProps = {
  tone?: MobileToastTone;
  /** Overrides the tone's default glyph; always drawn bare (no shell). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Overrides the tone tint, e.g. a muted reader hint. */
  iconColor?: string;
  /** Replaces the leading glyph with the indeterminate Nemu loading ring. */
  loading?: boolean;
  title: string;
  detail?: string;
  detailNumberOfLines?: number;
  action?: MobileToastSurfaceAction;
  onDismiss?: () => void;
  /**
   * Reader chrome paints its own tinted panel instead of the app glass pill.
   * Geometry and typography stay shared so the two cannot drift.
   */
  plain?: boolean;
  backgroundColor?: string;
  borderColor?: string;
  titleColor?: string;
  detailColor?: string;
  /**
   * The pill's exact width (the anchored host). The liquid-glass content is
   * hosted in its own SwiftUI surface that sizes to its contents until the
   * shell is measured, so without it a long one-line title lays the row out
   * wider than the pill and pushes the trailing control past its edge.
   */
  width?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The single toast shape: a `radius.tab` pill with one bare tone-tinted glyph,
 * a 13/17 title, a 12/16 muted detail, an optional 28pt depth action pill and
 * an optional bare dismiss glyph. Both the anchored host and the in-sheet
 * inline toast render this, so their geometry cannot drift.
 */
export function MobileToastSurface({
  tone = "info",
  icon,
  iconColor,
  loading = false,
  title,
  detail,
  detailNumberOfLines = 2,
  action,
  onDismiss,
  plain = false,
  backgroundColor,
  borderColor,
  titleColor,
  detailColor,
  width,
  style,
}: MobileToastSurfaceProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const resolvedIconColor = iconColor ?? nemuToneColor(tokens, tone);
  const announcement = [title, detail].filter(Boolean).join(". ");
  const hasTrailingControl = Boolean(action) || Boolean(onDismiss);

  const content = (
    <>
      {loading ? (
        <NemuRingSpinner color={resolvedIconColor} size={20} />
      ) : (
        <Ionicons
          accessibilityElementsHidden
          importantForAccessibility="no"
          name={icon ?? toneIcons[tone]}
          size={20}
          color={resolvedIconColor}
        />
      )}
      <View
        accessible
        accessibilityLabel={announcement}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.texts}
      >
        <NemuText
          color={titleColor ?? tokens.foreground}
          numberOfLines={2}
          style={styles.title}
          variant="rowSubtitle"
        >
          {title}
        </NemuText>
        {detail ? (
          <NemuText
            color={detailColor ?? tokens.mutedForeground}
            numberOfLines={detailNumberOfLines}
            variant="caption"
          >
            {detail}
          </NemuText>
        ) : null}
      </View>
      {action ? (
        action.loading ? (
          <NemuRingSpinner color={tokens.primary} size={14} />
        ) : (
          // `NemuButton` (and any depth pressable) grows its frame to the
          // native 44/48pt target, which would push this 48pt pill to 60.
          // The same `secondary` depth surface is rendered at 28pt here and
          // the target is restored around it: negative margins let the 44pt
          // frame overhang the toast's own padding, and hitSlop covers the
          // rest. Touch stays 44pt; layout stays 32pt.
          <NemuPressable
            accessibilityLabel={action.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: action.disabled }}
            buttonDepth="secondary"
            containerStyle={styles.actionTarget}
            disabled={action.disabled}
            hapticFeedback="press"
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            onPress={action.onPress}
            style={[
              styles.actionPill,
              { opacity: action.disabled ? 0.5 : 1 },
            ]}
          >
            <NemuText
              color={tokens.primary}
              numberOfLines={1}
              style={styles.actionLabel}
              variant="caption"
            >
              {action.label}
            </NemuText>
          </NemuPressable>
        )
      ) : null}
      {onDismiss ? (
        <NemuPressable
          accessibilityLabel={strings.feedback.dismiss}
          accessibilityRole="button"
          hapticFeedback="none"
          hitSlop={6}
          onPress={onDismiss}
          pressProfile="icon"
          style={styles.dismiss}
        >
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name="close"
            size={20}
            color={tokens.mutedForeground}
          />
        </NemuPressable>
      ) : null}
    </>
  );

  const layout = [
    styles.pillContent,
    hasTrailingControl ? null : styles.pillContentWithoutTrailing,
    width === undefined ? null : { width },
  ];

  if (plain) {
    return (
      <View
        style={[
          styles.plainShell,
          layout,
          { backgroundColor, borderColor },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <GlassSurface
      intensity={32}
      liquidGlass
      style={[
        styles.pill,
        {
          backgroundColor: backgroundColor ?? tokens.tabGlass,
          borderColor: borderColor ?? tokens.tabBorder,
        },
        style,
      ]}
      contentStyle={layout}
    >
      {content}
    </GlassSurface>
  );
}

/** The open soft keyboard's height (0 when closed). */
function useToastKeyboardHeight(): number {
  const [height, setHeight] = useState(() => Math.max(Keyboard.metrics()?.height ?? 0, 0));
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(
      ios ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setHeight(Math.max(event.endCoordinates?.height ?? 0, 0)),
    );
    const hide = Keyboard.addListener(
      ios ? "keyboardWillHide" : "keyboardDidHide",
      () => setHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

type ActiveToast = {
  id: string;
  options: MobileToastOptions;
};

function MobileToastHost({
  toast,
  onDismiss,
}: {
  toast: ActiveToast | null;
  onDismiss: (id: string) => void;
}) {
  const { reduceMotion } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const gutters = useMobilePageGutters();
  const adaptive = useMobileAdaptiveLayout();
  const pathname = usePathname();
  const measuredTabBarInset = useMobileBottomTabBarInset();
  const region = useMobileToastRegion();
  const obstacle = useMobileToastObstacle();
  const [toastHeight, setToastHeight] = useState<number | undefined>(undefined);
  const keyboardHeight = useToastKeyboardHeight();
  const reducedMotion = useReducedMotion();
  const motionDisabled = reduceMotion || reducedMotion === true;
  const windowInsets = adaptive.safeAreaInsets;
  const safeArea = {
    left: windowInsets?.left ?? insets.left,
    right: windowInsets?.right ?? insets.right,
    bottom: windowInsets?.bottom ?? insets.bottom,
  };
  const placement = resolveMobileToastPlacement({
    windowWidth: adaptive.width,
    posture: adaptive.posture,
    panels: adaptive.panels,
    verticalBarSide: adaptive.verticalBarSide,
    safeArea,
    gutters,
    bottomTabBarVisible: isMobileBottomTabBarRoute(pathname, Platform.OS),
    // Android's floating bar is drawn in JS (no native measurement).
    bottomTabBarInset: Platform.OS === "ios" ? measuredTabBarInset : null,
    fallbackBottomTabBarInset:
      Platform.OS === "ios"
        ? safeArea.bottom + MOBILE_IOS_TAB_BAR_FALLBACK_HEIGHT
        : getMobileFloatingTabBarOverlayExtent(insets.bottom),
    region,
    obstacle,
    windowHeight: adaptive.height,
    toastHeight,
    keyboardHeight,
  });

  const announcement = toast
    ? [toast.options.title, toast.options.detail].filter(Boolean).join(". ")
    : null;
  useEffect(() => {
    // iOS ignores live regions (Android's surface already has one): announce
    // the toast explicitly so VoiceOver reads the title.
    if (announcement && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(announcement);
  }, [toast, announcement]);

  if (!toast) return null;

  const action = toast.options.action;

  return (
    <Animated.View
      key={toast.id}
      pointerEvents="box-none"
      onLayout={(event) => setToastHeight(event.nativeEvent.layout.height)}
      entering={
        // ~25% quicker settle than the original 18/220 spring at the same
        // damping ratio (~0.6), so the pill still arrives without oscillating.
        motionDisabled
          ? undefined
          : FadeInDown.springify().damping(22).stiffness(340)
      }
      exiting={motionDisabled ? undefined : FadeOutDown.duration(120)}
      style={[
        styles.host,
        placement.top === undefined
          ? { bottom: placement.bottom, left: placement.left, width: placement.width }
          : { top: placement.top, left: placement.left, width: placement.width },
      ]}
    >
      <MobileToastSurface
        action={
          action
            ? {
                label: action.label,
                onPress: () => {
                  onDismiss(toast.id);
                  action.onPress();
                },
              }
            : undefined
        }
        detail={toast.options.detail}
        loading={toast.options.loading}
        onDismiss={action ? undefined : () => onDismiss(toast.id)}
        title={toast.options.title}
        tone={toast.options.tone ?? "info"}
        width={placement.width}
      />
    </Animated.View>
  );
}

export function MobileToastProvider({ children }: { children: ReactNode }) {
  const toast = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot,
  );

  return (
    <MobileToastContext.Provider value={toastController}>
      {children}
      <MobileToastHost toast={toast} onDismiss={toastStore.dismiss} />
    </MobileToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
  },
  pill: {
    borderRadius: radius.tab,
  },
  plainShell: {
    borderRadius: radius.tab,
    borderWidth: 0.5,
    overflow: "hidden",
  },
  pillContent: {
    flex: 0,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 14,
  },
  pillContentWithoutTrailing: {
    paddingRight: 14,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  actionTarget: {
    // Cancels the depth pressable's 44/48pt frame back to the 32pt content
    // box; the frame still overhangs into the toast's vertical padding.
    marginVertical: -6,
  },
  actionPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionLabel: {
    fontWeight: nemuFontWeight.semibold,
  },
  dismiss: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
