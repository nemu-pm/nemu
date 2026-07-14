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
      snapPoints={snapPoints}
      fillContent={Boolean(snapPoints)}
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
