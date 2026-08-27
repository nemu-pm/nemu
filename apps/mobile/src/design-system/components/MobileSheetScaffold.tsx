import type { ReactNode } from "react";
import {
  StyleSheet,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MobileNativeSheetScaffold } from "./MobileNativeSheetScaffold";

type MobileSheetScaffoldProps = {
  visible: boolean;
  onRequestClose: () => void;
  backdropOnPress?: () => void;
  backdropDisabled?: boolean;
  /** Chrome title. Also gives the mandatory dismiss control something to sit beside. */
  title?: string;
  dismissLabel?: string;
  showDismissButton?: boolean;
  frameMaxHeight?: DimensionValue;
  sheetMinHeight?: DimensionValue;
  contentStyle?: StyleProp<ViewStyle>;
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
  backdropOnPress,
  backdropDisabled = false,
  title,
  dismissLabel,
  showDismissButton,
  frameMaxHeight,
  sheetMinHeight,
  contentStyle,
  children,
}: MobileSheetScaffoldProps) {
  const snapPoints = snapPointsFromMaxHeight(frameMaxHeight);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={backdropOnPress ?? onRequestClose}
      title={title}
      {...(dismissLabel ? { dismissLabel } : {})}
      showDismissButton={showDismissButton}
      snapPoints={snapPoints}
      fillContent={Boolean(snapPoints)}
      // A disabled backdrop also disables pan-down-to-close, which makes the
      // native scaffold render its mandatory dismiss control.
      enablePanDownToClose={!backdropDisabled}
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
    padding: 16,
  },
});
