import { ScrollView, StyleSheet } from "react-native";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileReaderPluginSettingsCard,
  MobileReaderPluginSettingsDescription,
} from "@/components/MobileReaderPluginSettingsContent";
import { useMobileReaderPluginSignedInState } from "@/components/useMobileReaderPluginSignedInState";
import {
  MobileNativeSheetScaffold,
  NemuInlineEmptyState,
  NemuNativeSheetHeaderAction,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import { ReaderPluginEnableRow, ReaderPluginListItem } from "./ReaderPluginSettingsRows";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

/**
 * The reader's Plugins sheet on Android / web: the shared list rows
 * (`ReaderPluginListItem`: the plugin mark, its name and "5 settings", a
 * divider and a trailing switch centred on the row, the description under
 * it). The plugin's page (`ReaderPluginDetail`, the same rows as iOS and
 * Settings) replaces the list in the same sheet, with a back action in the
 * header and on hardware Back.
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
              <ReaderPluginListItem
                key={plugin.id}
                plugin={plugin}
                busy={busy}
                strings={strings}
                onOpen={() => onSelectPlugin(plugin.id)}
                onToggle={(enabled) => onTogglePlugin(plugin, enabled)}
              />
            ))
          )}
        </ScrollView>
      )}
    </MobileNativeSheetScaffold>
  );
}

/**
 * A plugin's page: the same rows as the iOS sheet's plugin page and
 * Settings' plugin sheet (description, the on / off row, the shared settings
 * card). Off, the settings stay visible (dimmed) so the page keeps its shape.
 */
function ReaderPluginDetail({
  plugin: storedPlugin,
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
  const plugin = useMobileReaderPluginSignedInState(storedPlugin, strings);
  return (
    <>
      <MobileReaderPluginSettingsDescription plugin={plugin} />
      <ReaderPluginEnableRow
        plugin={plugin}
        busy={busy}
        strings={strings}
        onToggle={(enabled) => onTogglePlugin(plugin, enabled)}
      />
      <MobileReaderPluginSettingsCard
        plugin={plugin}
        strings={strings}
        disabled={busy || !plugin.enabled}
        loading={loading}
        error={error}
        onReset={() => onResetPlugin(plugin)}
        onChange={(key, value) => onChangePluginValue(plugin, key, value)}
      />
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
});
