import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
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
  type NemuTokens,
} from "@/design-system";
import { getMobileFloatingTabBarOverlayExtent } from "@/lib/mobileFloatingTabBarClearance";
import { getMobileStrings } from "@/lib/mobileI18n";
import {
  MobileToastContext,
  type MobileToastController,
  type MobileToastOptions,
  type MobileToastTone,
} from "./MobileToastContext";

const AUTO_DISMISS_MS = 4_000;
const ACTION_AUTO_DISMISS_MS = 6_000;

const toneIcons: Record<MobileToastTone, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark",
  info: "information-circle",
  warning: "alert-circle-outline",
  danger: "warning",
};

function toneColor(tokens: NemuTokens, tone: MobileToastTone): string {
  if (tone === "success") return tokens.success;
  if (tone === "danger") return tokens.danger;
  if (tone === "warning") return tokens.warning;
  return tokens.primary;
}

export type MobileToastSurfaceAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export type MobileToastSurfaceProps = {
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
  detailNumberOfLines = 1,
  action,
  onDismiss,
  plain = false,
  backgroundColor,
  borderColor,
  titleColor,
  detailColor,
  style,
}: MobileToastSurfaceProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const resolvedIconColor = iconColor ?? toneColor(tokens, tone);
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
          numberOfLines={1}
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
  const reducedMotion = useReducedMotion();
  const motionDisabled = reduceMotion || reducedMotion === true;
  const bottom = getMobileFloatingTabBarOverlayExtent(insets.bottom) + 12;

  if (!toast) return null;

  const action = toast.options.action;

  return (
    <Animated.View
      key={toast.id}
      pointerEvents="box-none"
      entering={
        motionDisabled
          ? undefined
          : FadeInDown.springify().damping(18).stiffness(220)
      }
      exiting={motionDisabled ? undefined : FadeOutDown.duration(160)}
      style={[styles.host, { bottom }]}
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
      />
    </Animated.View>
  );
}

export function MobileToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const sequenceRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer();
      setToast((current) => (current?.id === id ? null : current));
    },
    [clearTimer],
  );

  const show = useCallback(
    (options: MobileToastOptions) => {
      const id = options.id ?? `mobile-toast-${++sequenceRef.current}`;
      clearTimer();
      setToast({ id, options });
      const duration = options.duration ?? (options.action ? "long" : "normal");
      if (duration !== "sticky") {
        timerRef.current = setTimeout(
          () => {
            timerRef.current = null;
            setToast((current) => (current?.id === id ? null : current));
          },
          duration === "long" ? ACTION_AUTO_DISMISS_MS : AUTO_DISMISS_MS,
        );
      }
      return id;
    },
    [clearTimer],
  );

  const controller = useMemo<MobileToastController>(
    () => ({ show, dismiss }),
    [show, dismiss],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return (
    <MobileToastContext.Provider value={controller}>
      {children}
      <MobileToastHost toast={toast} onDismiss={dismiss} />
    </MobileToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
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
