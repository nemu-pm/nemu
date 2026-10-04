import { useMemo, type ReactNode } from "react";
import {
  StyleSheet,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MobileNativeSheetScaffold, type MobileSheetSafeAreaEdge } from "./MobileNativeSheetScaffold";

type MobileSheetScaffoldProps = {
  visible: boolean;
  onRequestClose: () => void;
  /** Called after the platform-native sheet has fully dismissed. */
  onDismiss?: () => void;
  /** Handles Android Back inside an in-sheet subflow without dismissing it. */
  onHardwareBackPress?: () => boolean;
  backdropOnPress?: () => void;
  backdropDisabled?: boolean;
  /** Optional chrome title, independent of the caller-provided dismiss action. */
  backgroundColor?: string;
  title?: string;
  subtitle?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  dismissLabel?: string;
  dismissDisabled?: boolean;
  showDismissButton?: boolean;
  frameMaxHeight?: DimensionValue;
  sheetMinHeight?: DimensionValue;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * Overrides the platform bottom gutter under the content, e.g. 0 for a
   * body whose own bottom bar (a composer, an action footer) should run to
   * the sheet's bottom edge.
   */
  contentBottomInset?: number;
  /**
   * iOS: safe-area edges the content extends into, so it reaches the sheet's
   * own edges where the safe area is not over it: the iPhone Duo outer
   * display's system vertical bar column (reserved at a spanning sheet's
   * trailing edge) and, for a sheet floating clear of the screen's bottom
   * edge, the home indicator's inset below its content.
   */
  contentIgnoresSafeAreaEdges?: MobileSheetSafeAreaEdge | MobileSheetSafeAreaEdge[];
  children: ReactNode;
};

function snapPointsFromMaxHeight(
  frameMaxHeight: DimensionValue | undefined,
): (string | number)[] | undefined {
  if (frameMaxHeight === "auto") return undefined;
  if (typeof frameMaxHeight === "number" || typeof frameMaxHeight === "string") {
    return [frameMaxHeight];
  }
  return undefined;
}

export function MobileSheetScaffold({
  visible,
  onRequestClose,
  onDismiss,
  onHardwareBackPress,
  backdropOnPress,
  backdropDisabled = false,
  backgroundColor,
  title,
  subtitle,
  headerLeading,
  headerTrailing,
  dismissLabel,
  dismissDisabled,
  showDismissButton,
  frameMaxHeight,
  sheetMinHeight,
  contentStyle,
  contentBottomInset,
  contentIgnoresSafeAreaEdges,
  children,
}: MobileSheetScaffoldProps) {
  const snapPoints = useMemo(
    () => snapPointsFromMaxHeight(frameMaxHeight),
    [frameMaxHeight],
  );

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={backdropOnPress ?? onRequestClose}
      onDismiss={onDismiss}
      onHardwareBackPress={onHardwareBackPress}
      backgroundColor={backgroundColor}
      title={title}
      subtitle={subtitle}
      headerLeading={headerLeading}
      headerTrailing={headerTrailing}
      {...(dismissLabel ? { dismissLabel } : {})}
      dismissDisabled={dismissDisabled}
      showDismissButton={showDismissButton}
      snapPoints={snapPoints}
      fillContent={Boolean(snapPoints)}
      // A disabled backdrop also disables pan-down-to-close. Callers that
      // still want a chrome escape provide its localized label above.
      enablePanDownToClose={!backdropDisabled}
      contentBottomInset={contentBottomInset}
      contentIgnoresSafeAreaEdges={contentIgnoresSafeAreaEdges}
      contentStyle={[
        contentStyle ?? styles.sheet,
        sheetMinHeight != null ? { minHeight: sheetMinHeight } : null,
      ]}
    >
      {children}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 14,
  },
});
