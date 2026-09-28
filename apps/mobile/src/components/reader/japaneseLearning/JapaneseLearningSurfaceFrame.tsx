import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import {
  MobileSheetHeader,
  MobileSheetScaffold,
  NemuNativeSheetHeaderAction,
} from "@/design-system";
import { resolveMobileSheetHeaderMetrics } from "@/lib/mobileNativeSheet";
import { ReaderCapsule } from "../ReaderCapsule";
import { ReaderDarkThemeScope } from "../ReaderDarkThemeScope";
import {
  DOCKED_PANEL_BASE,
  DOCKED_PANEL_BORDER,
  DOCKED_PANEL_GLASS_TINT,
  DOCKED_PANEL_TOKEN_OVERRIDES,
  DOCKED_PANEL_RADIUS,
  JapaneseLearningEmbeddedHostContext,
  type JapaneseLearningEmbeddedHost,
} from "./japaneseLearningEmbeddedHost";


type SheetProps = ComponentProps<typeof MobileSheetScaffold>;

export type JapaneseLearningSurfaceFrameProps = SheetProps & {
  /**
   * Docked presentation (regular-width, book and notebook poses): the surface
   * fills the reader-provided panel beside the page instead of presenting a
   * modal sheet over it. The page stays interactive, like the web transcript
   * popover. Compact widths keep the native sheet.
   */
  docked?: boolean;
  /** Localized label for the docked panel's close action. */
  closeLabel: string;
};

/**
 * One frame for every Japanese Learning surface: the native sheet on compact
 * windows, a docked panel otherwise. The docked panel reports `onDismiss`
 * after it closes, so the sheet-to-sheet hand-offs (launcher → transcript,
 * transcript → OCR result) keep working unchanged.
 */
export function JapaneseLearningSurfaceFrame({
  docked = false,
  closeLabel,
  ...sheet
}: JapaneseLearningSurfaceFrameProps) {
  const host = useContext(JapaneseLearningEmbeddedHostContext);
  if (!docked) return <MobileSheetScaffold {...sheet} />;
  if (host) return <JapaneseLearningEmbeddedSurface host={host} {...sheet} />;
  return (
    <ReaderDarkThemeScope overrides={DOCKED_PANEL_TOKEN_OVERRIDES}>
      <JapaneseLearningDockedSurface closeLabel={closeLabel} {...sheet} />
    </ReaderDarkThemeScope>
  );
}

/** Reports `onDismiss` once a docked / embedded surface has left the tree (no native dismissal to wait for). */
function useDockedDismiss(visible: boolean, onDismiss: (() => void) | undefined) {
  const wasVisibleRef = useRef(visible);
  const onDismissRef = useRef(onDismiss);
  useLayoutEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (wasVisible && !visible) onDismissRef.current?.();
  }, [visible]);
}

function JapaneseLearningEmbeddedSurface({
  host,
  visible,
  onDismiss,
  headerLeading,
  headerTrailing,
  contentStyle,
  children,
}: SheetProps & { host: JapaneseLearningEmbeddedHost }) {
  const metrics = resolveMobileSheetHeaderMetrics(Platform.OS);
  useDockedDismiss(visible, onDismiss);
  if (!visible) return null;
  return (
    <View style={styles.embedded}>
      {host.renderHeader({ action: headerLeading ?? headerTrailing })}
      <View
        style={[
          styles.body,
          { paddingHorizontal: metrics.bodyHorizontalPadding },
          StyleSheet.flatten(contentStyle),
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function JapaneseLearningDockedSurface({
  visible,
  onRequestClose,
  onDismiss,
  backdropOnPress,
  title,
  headerLeading,
  headerTrailing,
  contentStyle,
  closeLabel,
  children,
}: SheetProps & { closeLabel: string }) {
  const reduceMotion = useReducedMotion();
  const metrics = resolveMobileSheetHeaderMetrics(Platform.OS);
  // No native dismissal animation to wait for: the close is complete as
  // soon as the panel leaves the tree.
  useDockedDismiss(visible, onDismiss);

  if (!visible) return null;
  const close = backdropOnPress ?? onRequestClose;

  return (
    <Animated.View
      // Reduce Motion: appear in place, no fade.
      entering={reduceMotion ? undefined : FadeIn.duration(160)}
      exiting={reduceMotion ? undefined : FadeOut.duration(120)}
      style={styles.panel}
    >
      {/* Dark Liquid Glass over the black reader: the same material as the
          reader capsules instead of an opaque themed card. */}
      <ReaderCapsule
        cornerRadius={DOCKED_PANEL_RADIUS}
        interactive={false}
        tintColor={DOCKED_PANEL_GLASS_TINT}
        pointerEvents="box-none"
        style={styles.glass}
      >
        <MobileSheetHeader
          // The header's side slots hold one control each; a surface's own
          // header action (e.g. Listen) moves to the free leading slot so the
          // close action keeps the trailing one.
          leading={headerLeading ?? headerTrailing}
          title={title ?? ""}
          trailing={
            <NemuNativeSheetHeaderAction
              accessibilityLabel={closeLabel}
              androidIcon="close-outline"
              iosSystemImage="xmark"
              onPress={close}
            />
          }
        />
        <View
          style={[
            styles.body,
            { paddingHorizontal: metrics.bodyHorizontalPadding },
            StyleSheet.flatten(contentStyle),
          ]}
        >
          {children}
        </View>
      </ReaderCapsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  embedded: {
    flex: 1,
    minHeight: 0,
  },
  panel: {
    ...StyleSheet.absoluteFill,
  },
  glass: {
    flex: 1,
    paddingTop: 6,
    borderRadius: DOCKED_PANEL_RADIUS,
    backgroundColor: DOCKED_PANEL_BASE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DOCKED_PANEL_BORDER,
  },
  body: {
    flex: 1,
    minHeight: 0,
    gap: 14,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
