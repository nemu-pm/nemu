import { Host as SwiftHost, Picker as SwiftPicker, Text as SwiftText } from "@expo/ui/swift-ui";
import { accessibilityLabel as swiftAccessibilityLabel, pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { hapticSelection } from "@/lib/haptics";
import type { ReaderSegmentedControlProps } from "./ReaderSegmentedControl";

export type { ReaderSegmentedControlOption, ReaderSegmentedControlProps } from "./ReaderSegmentedControl";

/** Height of a UIKit segmented control. */
const SEGMENTED_CONTROL_HEIGHT = 32;

/**
 * The study desk's surface switch as a real `UISegmentedControl` (SwiftUI
 * `Picker` with `.segmented` style) in the dark appearance, so it carries the
 * system's own metrics, thumb and selection animation over the reader.
 */
export function ReaderSegmentedControl<T extends string>({
  accessibilityLabel,
  options,
  value,
  onChange,
  style,
}: ReaderSegmentedControlProps<T>) {
  return (
    <View style={[styles.root, style]}>
      <SwiftHost colorScheme="dark" style={styles.host}>
        <SwiftPicker
          modifiers={[pickerStyle("segmented"), swiftAccessibilityLabel(accessibilityLabel)]}
          selection={value}
          onSelectionChange={(selection) => {
            const next = options.find((option) => option.value === selection);
            if (!next || next.value === value) return;
            void hapticSelection();
            onChange(next.value);
          }}
        >
          {options.map((option) => (
            <SwiftText key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: SEGMENTED_CONTROL_HEIGHT,
    justifyContent: "center",
  },
  host: {
    width: "100%" as const,
    height: SEGMENTED_CONTROL_HEIGHT,
  },
});
