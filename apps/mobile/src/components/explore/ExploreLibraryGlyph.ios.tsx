import { Host as SwiftHost, Image as SwiftImage } from "@expo/ui/swift-ui";
import { font, frame, imageScale } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { EXPLORE_LIBRARY_SYMBOL, type ExploreLibraryGlyphProps } from "./ExploreLibraryGlyph.types";

const BOX = EXPLORE_LIBRARY_SYMBOL.box;

/**
 * iOS: the system `checkmark` / `plus`, drawn as a native glass circle
 * button draws its symbol. Drawing only: the pressable around it owns the
 * touch.
 */
export function ExploreLibraryGlyph({ added, color }: ExploreLibraryGlyphProps) {
  return (
    <View pointerEvents="none" style={styles.root}>
      <SwiftHost ignoreSafeArea="all" style={styles.root}>
        <SwiftImage
          systemName={added ? EXPLORE_LIBRARY_SYMBOL.added : EXPLORE_LIBRARY_SYMBOL.add}
          color={color}
          modifiers={[
            font({ size: EXPLORE_LIBRARY_SYMBOL.pointSize, weight: EXPLORE_LIBRARY_SYMBOL.weight }),
            imageScale(EXPLORE_LIBRARY_SYMBOL.scale),
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
