import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  NemuNativeSwitch,
  NemuPressable,
  NemuText,
  useNemuRowHighlight,
  useNemuTheme,
} from "@/design-system";
import { ReaderPluginIcon } from "@/components/MobileReaderPluginSettingsContent";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { canRunMobileSwitchSelectionFeedback } from "@/lib/mobileAccessibility";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { MOBILE_SETTINGS_GROUP_INSET } from "@/lib/mobileExploreRadius";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { mobileReaderPluginRowSubtitle } from "@/lib/mobileReaderPluginSheet";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";

/**
 * A plugin's row in a settings group: Settings → Reader → Plugins, and the
 * reader settings sheet's pushed Plugins page (the same row in both): the
 * plugin mark, its name and "5 settings", the switch, then the chevron, no
 * divider between them. The switch turns the plugin on or off; the rest of
 * the row, chevron included, opens its settings (once it is on, unless
 * `opensWhileOff`), also when it has few settings or none: every plugin's row
 * behaves the same.
 */
export function ReaderPluginManagementRow({
  plugin,
  strings,
  selected = false,
  disabled,
  opensWhileOff = false,
  first = false,
  onSelect,
  onToggle,
}: {
  plugin: MobileReaderPluginState;
  strings: MobileStrings;
  selected?: boolean;
  disabled: boolean;
  /** The plugin's page opens while it is off (it says why its settings are dimmed). */
  opensWhileOff?: boolean;
  /** The group's first row: no hairline above it. */
  first?: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { tokens } = useNemuTheme();
  const selectDisabled = disabled || (!opensWhileOff && !plugin.enabled);
  // The row's two pressables open the same page; the whole row (to the
  // group's edges, clipped by it) takes the selection highlight.
  const rowHighlight = useNemuRowHighlight();

  const openSettings = () => {
    if (selectDisabled) return;
    void hapticPress();
    onSelect();
  };

  return (
    <View
      style={[
        styles.row,
        mobileDesignExploreFlag ? styles.exploreRow : null,
        first ? styles.firstRow : null,
        { borderColor: tokens.border },
        selected &&
          plugin.enabled && {
            backgroundColor: nemuColorWithAlpha(tokens.primary, 0.03),
          },
      ]}
    >
      {rowHighlight.overlay()}
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={formatMobileString(strings.settings.editReaderPluginSettings, {
          name: plugin.name,
        })}
        accessibilityHint={mobileReaderPluginRowSubtitle(plugin, strings)}
        accessibilityState={{ disabled: selectDisabled }}
        disabled={selectDisabled}
        onPressIn={rowHighlight.onPressIn}
        onPressOut={rowHighlight.onPressOut}
        onPress={() => {
          rowHighlight.onPress();
          openSettings();
        }}
        pressedScale={1}
        containerStyle={styles.mainWrap}
        style={[styles.main, !plugin.enabled && styles.dimmed]}
        testID={`ReaderPluginSettings:${plugin.id}`}
      >
        <ReaderPluginIcon plugin={plugin} />
        <View style={styles.text}>
          <NemuText
            numberOfLines={1}
            style={[styles.title, { color: tokens.foreground }]}
          >
            {plugin.name}
          </NemuText>
          <NemuText
            numberOfLines={1}
            style={[styles.subtitle, { color: tokens.mutedForeground }]}
          >
            {mobileReaderPluginRowSubtitle(plugin, strings)}
          </NemuText>
        </View>
      </NemuPressable>
      <View style={styles.actions}>
        <NemuNativeSwitch
          accessibilityLabel={formatMobileString(
            strings.settings.readerPluginSwitch,
            {
              name: plugin.name,
            },
          )}
          disabled={disabled}
          value={plugin.enabled}
          onValueChange={(nextValue) => {
            if (
              !canRunMobileSwitchSelectionFeedback({
                checked: plugin.enabled,
                disabled,
                nextChecked: nextValue,
              })
            ) {
              return;
            }
            void hapticSelection();
            onToggle(nextValue);
          }}
        />
        <NemuPressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          disabled={selectDisabled}
          onPressIn={rowHighlight.onPressIn}
          onPressOut={rowHighlight.onPressOut}
          onPress={() => {
            rowHighlight.onPress();
            openSettings();
          }}
          pressedScale={1}
          containerStyle={styles.chevronContainer}
          style={[styles.chevron, selectDisabled && styles.dimmed]}
          testID={`ReaderPluginSettingsChevron:${plugin.id}`}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={tokens.mutedForeground}
          />
        </NemuPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    // The list bleeds to the card edge (Settings' `pluginEmbeddedList`
    // cancels the card's 12pt padding), so this row supplies the whole
    // trailing inset. 24 = the card padding plus the 12pt inner-row padding
    // the sibling "触感与提示" toggle rows use, so every switch on the screen
    // shares one right edge. The installed-source rows can sit at 6 because
    // their icon buttons carry a 44pt touch target around a 32pt pill; the
    // bare 51pt native switch has no such slack.
    paddingLeft: 12,
    paddingRight: 24,
    paddingVertical: 10,
  },
  exploreRow: {
    paddingLeft: MOBILE_SETTINGS_GROUP_INSET,
    paddingRight: MOBILE_SETTINGS_GROUP_INSET,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  mainWrap: {
    flex: 1,
    minWidth: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dimmed: {
    opacity: 0.62,
  },
  // The trailing cluster (switch + chevron) is sized by its content and
  // never shrinks; `main` is the flex child that absorbs a narrow screen or
  // enlarged type, so the row can not grow wider than its card. It spans the
  // row's height so the chevron's press area does too.
  actions: {
    flexShrink: 0,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chevronContainer: {
    alignSelf: "stretch",
  },
  // Past the switch, ending on the right edge the screen's switches share
  // (the row's trailing inset), so trailing controls still line up.
  chevron: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 10,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
