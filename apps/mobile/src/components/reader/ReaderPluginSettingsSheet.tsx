import { ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileJapaneseLearningDictionaryRow } from "@/components/MobileJapaneseLearningDictionaryRow";
import { MobileSourceSettingsCard } from "@/components/MobileSourceSettingsCard";
import {
  MobileNativeSheetScaffold,
  NemuInlineEmptyState,
  NemuNativeSheetHeaderAction,
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
import { MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY } from "@/lib/mobileJapaneseLearningEngine";
import { mobileReaderPluginRowSubtitle } from "@/lib/mobileReaderPluginSheet";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

/**
 * The reader's Plugins sheet on Android / web: Material list rows — the
 * plugin mark, its name and "5 settings", a divider and a trailing switch
 * centred on the row (the "split switch" preference: the text opens the
 * plugin's settings, the switch turns it on or off), the description as a
 * supporting line under the row. The plugin's settings replace the list in
 * the same sheet, with a back action in the header and on hardware Back.
 */
export function ReaderPluginSettingsSheet({
  visible,
  plugins,
  selectedPluginId,
  loading,
  error,
  loadError,
  busy,
  retryingLoad,
  canRetryLoadError,
  strings,
  onClose,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
  onSelectPlugin,
  onClearSelectedPlugin,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: ReaderPluginSettingsSheetProps) {
  const { tokens } = useNemuTheme();
  const selectedPlugin = selectedPluginId
    ? (plugins.find((plugin) => plugin.id === selectedPluginId) ?? null)
    : null;

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      onHardwareBackPress={() => {
        if (!selectedPlugin) return false;
        onClearSelectedPlugin();
        return true;
      }}
      title={selectedPlugin ? selectedPlugin.name : strings.settings.plugins}
      headerLeading={
        selectedPlugin ? (
          <NemuNativeSheetHeaderAction
            accessibilityLabel={strings.common.back}
            androidIcon="arrow-back"
            iosSystemImage="chevron.backward"
            onPress={onClearSelectedPlugin}
          />
        ) : undefined
      }
      dismissLabel={strings.common.done}
      // A toggle or reset in flight keeps the sheet up, so its outcome (and
      // any error) lands here, not behind the reader.
      dismissDisabled={busy}
      enablePanDownToClose={!busy}
      snapPoints={["86%"]}
      fillContent
      contentStyle={styles.sheet}
      testID="ReaderPluginSettingsSheet"
    >
      {error ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={error}
          dismissLabel={strings.common.clear}
          onDismiss={onDismissError}
          variant="embedded"
        />
      ) : null}
      {loadError ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={loadError}
          actionLabel={strings.common.retry}
          actionDisabled={!canRetryLoadError}
          actionLoading={retryingLoad}
          dismissLabel={strings.common.clear}
          onActionPress={onRetryLoad}
          onDismiss={onDismissLoadError}
          variant="embedded"
        />
      ) : null}

      {loading && plugins.length === 0 ? (
        <NemuInlineEmptyState
          icon="hourglass-outline"
          title={strings.settings.loadingReaderPlugins}
        />
      ) : (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {selectedPlugin ? (
            <ReaderPluginDetail
              plugin={selectedPlugin}
              loading={loading}
              error={error}
              busy={busy}
              strings={strings}
              onTogglePlugin={onTogglePlugin}
              onResetPlugin={onResetPlugin}
              onChangePluginValue={onChangePluginValue}
            />
          ) : (
            plugins.map((plugin) => (
              <View key={plugin.id} style={styles.pluginBlock}>
                <ReaderPluginRow
                  plugin={plugin}
                  busy={busy}
                  strings={strings}
                  onOpen={() => onSelectPlugin(plugin.id)}
                  onToggle={(enabled) => onTogglePlugin(plugin, enabled)}
                />
                {plugin.description ? (
                  <NemuText
                    color={tokens.mutedForeground}
                    density="compact"
                    style={styles.footer}
                    variant="caption"
                  >
                    {plugin.description}
                  </NemuText>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </MobileNativeSheetScaffold>
  );
}

function ReaderPluginRow({
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
        <View
          style={[styles.icon, { backgroundColor: tokens.sourceIconGlass }]}
        >
          <Ionicons
            name={plugin.icon}
            size={20}
            color={plugin.enabled ? tokens.primary : tokens.mutedForeground}
          />
        </View>
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
        <Ionicons
          name="chevron-forward"
          size={18}
          color={tokens.mutedForeground}
        />
      </NemuPressable>
      <View style={[styles.divider, { backgroundColor: tokens.border }]} />
      <View style={styles.switch}>
        <PluginSwitch
          plugin={plugin}
          busy={busy}
          strings={strings}
          onToggle={onToggle}
        />
      </View>
    </View>
  );
}

function PluginSwitch({
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

function ReaderPluginDetail({
  plugin,
  loading,
  error,
  busy,
  strings,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: {
  plugin: MobileReaderPluginState;
  loading: boolean;
  error: string | null;
  busy: boolean;
  strings: MobileStrings;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
  onResetPlugin: ReaderPluginSettingsSheetProps["onResetPlugin"];
  onChangePluginValue: ReaderPluginSettingsSheetProps["onChangePluginValue"];
}) {
  const { tokens } = useNemuTheme();
  return (
    <>
      <View
        style={[
          styles.row,
          styles.enableRow,
          nemuSheetMetrics.listRowLayout,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View
          style={[styles.icon, { backgroundColor: tokens.sourceIconGlass }]}
        >
          <Ionicons
            name={plugin.icon}
            size={20}
            color={plugin.enabled ? tokens.primary : tokens.mutedForeground}
          />
        </View>
        <NemuText
          color={tokens.foreground}
          density="compact"
          numberOfLines={1}
          style={[styles.copy, nemuSheetMetrics.twoLineRowTitle]}
          variant="rowTitle"
        >
          {formatMobileString(strings.settings.readerPluginSwitch, {
            name: plugin.name,
          })}
        </NemuText>
        <PluginSwitch
          plugin={plugin}
          busy={busy}
          strings={strings}
          onToggle={(enabled) => onTogglePlugin(plugin, enabled)}
        />
      </View>
      {plugin.enabled ? (
        <MobileSourceSettingsCard
          settings={plugin.settings}
          values={plugin.values}
          loading={loading}
          error={error}
          title={strings.settings.pluginSettings}
          subtitle={plugin.description}
          navigationResetKey={plugin.id}
          emptyMessage={strings.settings.noPluginSettings}
          showEmpty
          disabled={busy}
          onReset={() => onResetPlugin(plugin)}
          onChange={(key, value) => onChangePluginValue(plugin, key, value)}
          renderSettingAccessory={
            plugin.id === "japanese-learning"
              ? (setting, values) =>
                  setting.key === MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY ? (
                    <MobileJapaneseLearningDictionaryRow
                      disabled={busy}
                      engine={values[MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY]}
                      strings={strings}
                    />
                  ) : null
              : undefined
          }
        />
      ) : (
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
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    minHeight: 0,
    gap: 12,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    gap: 16,
    paddingBottom: 4,
  },
  pluginBlock: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  enableRow: {
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    paddingRight: 10,
    paddingVertical: 8,
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
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
    paddingHorizontal: 14,
  },
  footer: {
    paddingHorizontal: 12,
  },
});
