import { Host as SwiftHost, Image as SwiftImage } from "@expo/ui/swift-ui";
import { font, frame } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import type { ReaderScreenStepGlyphProps } from "./ReaderScreenStepGlyph.types";

const BOX = 32;

/** iOS: the system's `chevron.up` / `chevron.down`. Drawing only: the pressable around it owns the touch. */
export function ReaderScreenStepGlyph({ direction, color }: ReaderScreenStepGlyphProps) {
  return (
    <View pointerEvents="none" style={styles.root}>
      <SwiftHost colorScheme="dark" ignoreSafeArea="all" style={styles.root}>
        <SwiftImage
          systemName={direction === "up" ? "chevron.up" : "chevron.down"}
          color={color}
          modifiers={[font({ size: 24, weight: "semibold" }), frame({ width: BOX, height: BOX })]}
        />
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: BOX,
    height: BOX,
  },
});
