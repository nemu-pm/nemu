import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  GlassSurface,
  NemuButton,
  NemuText,
  radius,
  useNemuTheme,
  type NemuTokens,
} from "@/design-system";
import { getMobileFloatingTabBarOverlayExtent } from "@/lib/mobileFloatingTabBarClearance";
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
  danger: "warning",
};

function toneColor(tokens: NemuTokens, tone: MobileToastTone): string {
  if (tone === "success") return tokens.success;
  if (tone === "danger") return tokens.danger;
  return tokens.primary;
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
  const { tokens, reduceMotion } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const motionDisabled = reduceMotion || reducedMotion === true;
  const bottom = getMobileFloatingTabBarOverlayExtent(insets.bottom) + 12;

  if (!toast) return null;

  const tone = toast.options.tone ?? "info";
  const iconColor = toneColor(tokens, tone);

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
      <GlassSurface
        intensity={32}
        style={[
          styles.pill,
          {
            backgroundColor: tokens.tabGlass,
            borderColor: tokens.tabBorder,
          },
        ]}
        contentStyle={styles.pillContent}
      >
        <View style={styles.row}>
          <Ionicons name={toneIcons[tone]} size={18} color={iconColor} />
          <View style={styles.texts}>
            <NemuText variant="rowTitle" numberOfLines={1}>
              {toast.options.title}
            </NemuText>
            {toast.options.detail ? (
              <NemuText variant="caption" numberOfLines={1}>
                {toast.options.detail}
              </NemuText>
            ) : null}
          </View>
          {toast.options.action ? (
            <NemuButton
              size="xs"
              variant="secondary"
              label={toast.options.action.label}
              onPress={() => {
                toast.options.action?.onPress();
                onDismiss(toast.id);
              }}
            />
          ) : (
            <NemuButton
              size="icon-xs"
              variant="ghost"
              tone="plain"
              icon="close"
              accessibilityLabel={String(toast.options.title)}
              onPress={() => onDismiss(toast.id)}
            />
          )}
        </View>
      </GlassSurface>
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
    left: 12,
    right: 12,
  },
  pill: {
    borderRadius: radius.tab,
  },
  pillContent: {
    borderRadius: radius.tab,
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
