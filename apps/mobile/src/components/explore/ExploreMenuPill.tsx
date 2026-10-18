import { MenuView } from "@expo/ui/community/menu";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { nemuColorWithAlpha, nemuFontWeight, NemuText, radius, useNemuTheme } from "@/design-system";
import { ExploreGlass } from "./ExploreGlass";
import { glassViewAvailable } from "../../../modules/nemu-window-layout";

type MenuActions = Parameters<typeof MenuView>[0]["actions"];
type PressAction = NonNullable<Parameters<typeof MenuView>[0]["onPressAction"]>;

/**
 * A native menu behind a quiet pill ("MangaDex · 130 ⌄", "Filters (2) ⌄"):
 * Liquid Glass on iOS 26+ (it reacts to a press, like the bar's circles), a flat
 * tinted pill elsewhere. The menu itself is the system's.
 */
export function ExploreMenuPill({
  label,
  actions,
  onPressAction,
  accent = false,
}: {
  label: string;
  actions: MenuActions;
  onPressAction: PressAction;
  /** Selected look: the label in the accent colour (a menu that holds a value). */
  accent?: boolean;
}) {
  const { tokens } = useNemuTheme();
  const content = (
    <>
      <NemuText
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        color={accent ? tokens.primary : tokens.foreground}
        style={styles.label}
      >
        {label}
      </NemuText>
      <Svg width={10} height={10} viewBox="0 0 10 10">
        <Path d="M2 3.6 5 6.6l3-3" stroke={tokens.mutedForeground} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </>
  );
  return (
    <MenuView actions={actions} onPressAction={onPressAction} style={styles.menu}>
      {glassViewAvailable ? (
        <ExploreGlass interactive style={styles.glass}>
          <View accessibilityLabel={label} accessibilityRole="button" style={styles.pill}>
            {content}
          </View>
        </ExploreGlass>
      ) : (
        <View
          accessibilityLabel={label}
          accessibilityRole="button"
          style={[styles.pill, { backgroundColor: nemuColorWithAlpha(tokens.foreground, 0.07) }]}
        >
          {content}
        </View>
      )}
    </MenuView>
  );
}

const styles = StyleSheet.create({
  glass: { flexShrink: 1 },
  menu: { flexShrink: 1, maxWidth: "100%" },
  pill: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
  },
  label: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: nemuFontWeight.semibold },
});
