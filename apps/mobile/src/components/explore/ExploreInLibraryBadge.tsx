import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useNemuTheme } from "@/design-system";

/**
 * A small mark on a listing cover whose title is already in the library
 * (design-explore): a primary disc with a check, ringed in the page colour so
 * it reads over any cover. Decorative; the cell says "In Library" to VoiceOver.
 */
export function ExploreInLibraryBadge() {
  const { tokens } = useNemuTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: tokens.primary, borderColor: tokens.background }]}
    >
      <Svg width={12} height={12} viewBox="0 0 12 12">
        <Path
          d="M2.6 6.3 4.9 8.5 9.4 3.6"
          stroke={tokens.primaryForeground}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 22 / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
