import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNemuTheme } from "@/design-system";
import { getMobileSettingsOutlineGlyph, MOBILE_SETTINGS_GLYPH } from "@/lib/mobileSettingsGlyph";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * A settings row's or heading's icon in the new design: the original
 * design's outline glyph in the accent, bare (no tile behind it), in a fixed
 * box so titles and separators line up down the list.
 */
export function ExploreSettingsGlyph({ name, color }: { name: IoniconName; color?: string }) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.box}>
      <Ionicons
        name={getMobileSettingsOutlineGlyph(name) as IoniconName}
        size={MOBILE_SETTINGS_GLYPH.size}
        color={color ?? tokens.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: MOBILE_SETTINGS_GLYPH.box,
    height: MOBILE_SETTINGS_GLYPH.box,
    alignItems: "center",
    justifyContent: "center",
  },
});
