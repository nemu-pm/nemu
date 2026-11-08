import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  NemuNativeSwitch,
  NemuPressable,
  NemuText,
  nemuSheetMetrics,
  radius,
  useNemuTheme,
} from "@/design-system";
import { canRunMobileSwitchSelectionFeedback } from "@/lib/mobileAccessibility";
import { hapticSelection } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { mobileReaderPluginRowSubtitle } from "@/lib/mobileReaderPluginSheet";
import { ReaderPluginIcon } from "@/components/MobileReaderPluginSettingsContent";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";

/**
 * The reader Plugins sheet's list rows, shared by every platform: the plugin
 * mark, its name and "5 settings", a divider, the switch and a trailing
 * chevron (the "split switch" preference: the switch turns the plugin on or
 * off, the rest of the row, chevron included, opens its settings).
 */
export function ReaderPluginListItem({
  plugin,
  busy,
  strings,
  onOpen,
  onToggle,
}: {
  plugin: MobileReaderPluginState;
  busy: boolean;
  strings: MobileStrings;
  onOpen: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={formatMobileString(
          strings.settings.editReaderPluginSettings,
          { name: plugin.name },
        )}
        accessibilityHint={mobileReaderPluginRowSubtitle(plugin, strings)}
        onPress={onOpen}
        pressedScale={0.985}
        containerStyle={styles.rowMainContainer}
        style={[styles.rowMain, nemuSheetMetrics.twoLineRowLayout]}
        testID={`ReaderPluginSettingsRow:${plugin.id}`}
      >
        <ReaderPluginIcon plugin={plugin} />
        <View style={styles.copy}>
          <NemuText
            color={tokens.foreground}
            density="compact"
            numberOfLines={1}
            style={nemuSheetMetrics.twoLineRowTitle}
            variant="rowTitle"
          >
            {plugin.name}
          </NemuText>
          <NemuText
            color={tokens.mutedForeground}
            density="compact"
            numberOfLines={1}
            style={nemuSheetMetrics.twoLineRowSupporting}
            variant="rowSubtitle"
          >
            {mobileReaderPluginRowSubtitle(plugin, strings)}
          </NemuText>
        </View>
      </NemuPressable>
      <View style={[styles.divider, { backgroundColor: tokens.border }]} />
      <View style={styles.switch}>
        <ReaderPluginSwitch
          plugin={plugin}
          busy={busy}
          strings={strings}
          onToggle={onToggle}
        />
      </View>
      {/*
        The chevron is part of the row's open target, past the switch. Its
        own press area spans the row's height; VoiceOver already has the
        row's "Edit … settings" button, so it is not a second element.
      */}
      <NemuPressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        hitSlop={0}
        onPress={onOpen}
        pressedScale={0.94}
        containerStyle={styles.chevronContainer}
        style={styles.chevron}
        testID={`ReaderPluginSettingsChevron:${plugin.id}`}
      >
        <Ionicons
          name="chevron-forward"
          size={18}
          color={tokens.mutedForeground}
        />
      </NemuPressable>
    </View>
  );
}

/** The plugin's on / off switch (the list rows). */
export function ReaderPluginSwitch({
  plugin,
  busy,
  strings,
  onToggle,
}: {
  plugin: MobileReaderPluginState;
  busy: boolean;
  strings: MobileStrings;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <NemuNativeSwitch
      accessibilityLabel={formatMobileString(
        strings.settings.readerPluginSwitch,
        { name: plugin.name },
      )}
      disabled={busy}
      value={plugin.enabled}
      onValueChange={(nextValue) => {
        if (
          !canRunMobileSwitchSelectionFeedback({
            checked: plugin.enabled,
            disabled: busy,
            nextChecked: nextValue,
          })
        ) {
          return;
        }
        void hapticSelection();
        onToggle(nextValue);
      }}
    />
  );
}

/**
 * On a plugin's page while it is off: the list it was opened from has its
 * switch, so the page only says why its settings are dimmed.
 */
export function ReaderPluginOffFooter({
  plugin,
  strings,
}: {
  plugin: MobileReaderPluginState;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  if (plugin.enabled) return null;
  return (
    <NemuText
      color={tokens.mutedForeground}
      density="compact"
      style={styles.footer}
      variant="caption"
    >
      {formatMobileString(strings.settings.readerPluginOffFooter, {
        name: plugin.name,
      })}
    </NemuText>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  rowMainContainer: {
    flex: 1,
    minWidth: 0,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 12,
    paddingRight: 14,
    paddingVertical: 8,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 14,
  },
  switch: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 14,
  },
  chevronContainer: {
    alignSelf: "stretch",
  },
  chevron: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 8,
    paddingRight: 12,
  },
  footer: {
    paddingHorizontal: 12,
  },
});
