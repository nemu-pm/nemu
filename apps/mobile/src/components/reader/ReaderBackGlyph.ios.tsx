import { Host as SwiftHost, Image as SwiftImage } from "@expo/ui/swift-ui";
import { font, frame } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { MOBILE_READER_BACK_SYMBOL } from "@/lib/mobileReaderBarIcons";
import type { ReaderBackGlyphProps } from "./ReaderBackGlyph.types";

const BOX = MOBILE_READER_BACK_SYMBOL.box;

/**
 * iOS: the system's own `chevron.backward`, at the size and weight a native
 * navigation bar's Liquid Glass back button draws it, so the reader's Back
 * reads as the same control as every other stack's. Drawing only: the
 * pressable around it owns the touch.
 */
export function ReaderBackGlyph({ color }: ReaderBackGlyphProps) {
  return (
    <View pointerEvents="none" style={styles.root}>
      {/* The capsule already sits clear of the status bar and the Duo's
          vertical bar column; the nested host must not inset it again. */}
      <SwiftHost colorScheme="dark" ignoreSafeArea="all" style={styles.root}>
        <SwiftImage
          systemName={MOBILE_READER_BACK_SYMBOL.name}
          color={color}
          modifiers={[
            font({ size: MOBILE_READER_BACK_SYMBOL.pointSize, weight: MOBILE_READER_BACK_SYMBOL.weight }),
            frame({ width: BOX, height: BOX }),
          ]}
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
