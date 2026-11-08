import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { MobileCachedImage, useNemuTheme } from "@/design-system";
import type { SearchSourceDisplay } from "@/lib/mobileSearch";

/** A source's package icon on a small glass tile (globe when it has none). */
export function MobileSearchSourceIcon({
  source,
  size = 20,
}: {
  source: Pick<SearchSourceDisplay, "icon">;
  size?: number;
}) {
  const { tokens } = useNemuTheme();
  const glyphSize = Math.max(13, size - 8);

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: Math.max(5, size * 0.24),
          backgroundColor: tokens.sourceIconGlass,
          borderColor: tokens.border,
        },
      ]}
    >
      {source.icon ? (
        <MobileCachedImage
          fallback={<Ionicons name="globe-outline" size={glyphSize} color={tokens.mutedForeground} />}
          uriOwnership="source"
          source={{ uri: source.icon }}
          style={styles.image}
        />
      ) : (
        <Ionicons name="globe-outline" size={glyphSize} color={tokens.mutedForeground} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
