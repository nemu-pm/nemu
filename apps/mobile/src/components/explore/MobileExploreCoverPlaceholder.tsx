import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { StyleSheet, View } from "react-native";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuText,
  useNemuTheme,
} from "@/design-system";
import { getMobileExploreCoverPlaceholderSize } from "@/lib/mobileExploreCoverPlaceholder";
import { ExploreGradient } from "./ExploreGradient";

/**
 * Stand-in for a title without a (loadable) cover: a plain cloth-bound book
 * in nemu's indigo with the title set on it, so the slot still says
 * what it is. Fills its parent; `width` only picks the type size.
 */
export function MobileExploreCoverPlaceholder({
  title,
  width,
}: {
  title: string;
  width: number;
}) {
  const { scheme, tokens } = useNemuTheme();
  const dark = scheme === "dark";
  const size = getMobileExploreCoverPlaceholderSize(width);
  const compact = size === "compact" || size === "mini";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { backgroundColor: tokens.card }]}
    >
      <ExploreGradient
        colors={[
          nemuColorWithAlpha(tokens.primary, dark ? 0.42 : 0.46),
          nemuColorWithAlpha(tokens.primary, dark ? 0.2 : 0.3),
        ]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.frame,
          compact ? styles.frameCompact : null,
          size === "mini" ? styles.frameMini : null,
          size === "large" ? styles.frameLarge : null,
          { borderColor: nemuColorWithAlpha(tokens.primary, dark ? 0.5 : 0.55) },
        ]}
      >
        {size === "mini" ? null : (
        <NemuText
          numberOfLines={compact || size === "large" ? 3 : 4}
          maxFontSizeMultiplier={1.15}
          color={tokens.foreground}
          style={[styles.title, compact ? styles.titleCompact : null, size === "large" ? styles.titleLarge : null]}
        >
          {title}
        </NemuText>
        )}
        <View style={[styles.rule, size === "large" ? styles.ruleLarge : null, { backgroundColor: tokens.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    height: "100%",
  },
  frame: {
    flex: 1,
    margin: 6,
    paddingHorizontal: 7,
    paddingTop: "22%",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: R.hair,
  },
  frameLarge: {
    margin: 10,
    paddingHorizontal: 18,
    gap: 14,
  },
  frameMini: {
    margin: 2,
    paddingHorizontal: 0,
    justifyContent: "center",
    paddingTop: 0,
  },
  frameCompact: {
    margin: 4,
    paddingHorizontal: 4,
    gap: 5,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
    textAlign: "center",
  },
  titleCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  rule: {
    width: 18,
    height: 2,
    borderRadius: R.hair / 2,
  },
  titleLarge: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: nemuFontWeight.bold,
  },
  ruleLarge: {
    width: 32,
    height: 3,
    borderRadius: R.hair,
  },
});
