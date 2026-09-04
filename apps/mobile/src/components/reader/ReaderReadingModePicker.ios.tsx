import {
  Host as SwiftHost,
  Picker as SwiftPicker,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  disabled as swiftDisabled,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { useNemuTheme } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import {
  READER_READING_MODE_ORDER,
  isReaderReadingMode,
  type ReaderReadingModePickerProps,
} from "./readerReadingModeOptions";

/** Height of a UIKit segmented control, so the row keeps its rhythm. */
const SEGMENTED_CONTROL_HEIGHT = 32;

/**
 * iOS reading-direction control: a real `UISegmentedControl` via SwiftUI's
 * `Picker` with `.segmented` style, so it picks up the platform's own metrics,
 * tinting and selection animation instead of a hand-drawn tab strip.
 */
export function ReaderReadingModePicker({
  accessibilityLabel,
  disabled = false,
  labelForMode,
  mode,
  onSetMode,
}: ReaderReadingModePickerProps) {
  const { scheme, tokens } = useNemuTheme();

  return (
    <View style={[styles.root, { opacity: disabled ? 0.56 : 1 }]}>
      <SwiftHost
        colorScheme={scheme}
        seedColor={tokens.primary}
        style={styles.host}
      >
        <SwiftPicker
          modifiers={[
            pickerStyle("segmented"),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(disabled ? [swiftDisabled(true)] : []),
          ]}
          selection={mode}
          onSelectionChange={(selection) => {
            if (disabled) return;
            if (!isReaderReadingMode(selection) || selection === mode) return;
            void hapticSelection();
            onSetMode(selection);
          }}
        >
          {READER_READING_MODE_ORDER.map((option) => (
            <SwiftText key={option} modifiers={[tag(option)]}>
              {labelForMode(option)}
            </SwiftText>
          ))}
        </SwiftPicker>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: SEGMENTED_CONTROL_HEIGHT,
    justifyContent: "center",
  },
  host: {
    width: "100%",
    height: SEGMENTED_CONTROL_HEIGHT,
  },
});
