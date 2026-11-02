import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileNativeStackSheet } from "@/components/MobileNativeStackSheet";
import type { MobileNativeStackSheetLayout } from "@/components/MobileNativeStackSheet.types";
import { ReaderPluginManagementRow } from "@/components/ReaderPluginManagementRow";
import {
  MobileReaderPluginSettingsCard,
  MobileReaderPluginSettingsDescription,
} from "@/components/MobileReaderPluginSettingsContent";
import { useMobileReaderPluginSignedInState } from "@/components/useMobileReaderPluginSignedInState";
import { NemuInlineEmptyState, useNemuTheme } from "@/design-system";
import {
  READER_PLUGIN_SHEET_GROUP,
  READER_PLUGIN_SHEET_LIST_PAGE,
  readerPluginSheetPage,
} from "@/lib/mobileFittedSheet";
import { MOBILE_EXPLORE_GROUP_SHAPE } from "@/lib/mobileExploreRadius";
import type { MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_NATIVE_SHEET_BOTTOM_GUTTER } from "@/lib/mobileNativeSheet";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import { READER_SETTINGS_FORM_INSET } from "@/lib/readerSettingsNativePopoverLayout";
import { ReaderPluginEnableRow } from "./ReaderPluginSettingsRows";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

/** Until the list is measured: the bar and two plugin rows. */
const ESTIMATED_SHEET_HEIGHT = 260;

/**
 * Where a plugin page's groups sit: the Form inset of the stack it is pushed
 * in (the reader settings sheet / popover, or this sheet), the iPhone default
 * until the Form has reported its own.
 */
export type ReaderPluginStackInset = { left: number; right: number };

const insetOf = (layout: MobileNativeStackSheetLayout): ReaderPluginStackInset => ({
  left: layout.inset,
  right: layout.inset,
});

/**
 * The reader's Plugins sheet on iOS: a system sheet with a navigation bar, as
 * the reader settings sheet — "Plugins" in the bar with ✕, Settings → Reader
 * → Plugins' rows in one group, and each plugin's page pushed with the
 * system back (title in the bar, its description, the on / off row and the
 * shared settings card). The same pages are pushed inside the reader
 * settings sheet and popover.
 */
export function ReaderPluginSettingsSheet({
  visible,
  pageInteractive = false,
  maxSheetHeight = null,
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
  const list = (layout: MobileNativeStackSheetLayout, measuring: boolean) => (
    <ReaderPluginListPage
      stackInset={insetOf(layout)}
      plugins={plugins}
      loading={loading}
      error={error}
      loadError={loadError}
      busy={measuring ? false : busy}
      retryingLoad={retryingLoad}
      canRetryLoadError={canRetryLoadError}
      strings={strings}
      measuring={measuring}
      onClose={onClose}
      onDismissError={onDismissError}
      onDismissLoadError={onDismissLoadError}
      onRetryLoad={onRetryLoad}
      onSelectPlugin={onSelectPlugin}
      onTogglePlugin={onTogglePlugin}
    />
  );
  const detail = (plugin: MobileReaderPluginState, layout: MobileNativeStackSheetLayout, measuring: boolean) => (
    <ReaderPluginDetailPage
      stackInset={insetOf(layout)}
      plugin={plugin}
      busy={measuring ? false : busy}
      loading={loading}
      error={error}
      strings={strings}
      measuring={measuring}
      onBack={onClearSelectedPlugin}
      onTogglePlugin={onTogglePlugin}
      onResetPlugin={onResetPlugin}
      onChangePluginValue={onChangePluginValue}
    />
  );

  return (
    <MobileNativeStackSheet
      visible={visible}
      onClose={onClose}
      pages={[
        {
          id: READER_PLUGIN_SHEET_LIST_PAGE,
          title: strings.settings.plugins,
          render: (layout) => list(layout, false),
          measure: (layout) => list(layout, true),
        },
        ...(selectedPlugin
          ? [
              {
                id: readerPluginSheetPage(selectedPlugin.id),
                title: selectedPlugin.name,
                render: (layout: MobileNativeStackSheetLayout) => detail(selectedPlugin, layout, false),
                measure: (layout: MobileNativeStackSheetLayout) => detail(selectedPlugin, layout, true),
              },
            ]
          : []),
      ]}
      onPop={(depth) => {
        if (depth < 2) onClearSelectedPlugin();
      }}
      closeAccessibilityLabel={strings.common.done}
      // A toggle or reset in flight keeps the sheet up, so its outcome (and
      // any error) lands here, not behind the reader.
      closeDisabled={busy}
      interactiveDismissDisabled={busy}
      group={READER_PLUGIN_SHEET_GROUP}
      estimatedHeight={ESTIMATED_SHEET_HEIGHT}
      // Half folded like a laptop: never past the hinge.
      maxHeight={maxSheetHeight}
      // Book posture (Duo): the page beside the sheet stays live.
      backgroundInteraction={pageInteractive}
      // Over white and black manga pages alike, as the reader settings sheet.
      background="material"
      testID="ReaderPluginSettingsSheet"
    />
  );
}

/** A page's body on the stack's Form inset (the bar above is the system's). */
function ReaderPluginSheetPage({
  stackInset,
  children,
}: {
  stackInset?: ReaderPluginStackInset;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        styles.stackBody,
        stackInset ? { paddingLeft: stackInset.left, paddingRight: stackInset.right } : null,
      ]}
    >
      {children}
    </View>
  );
}

const noop = () => {};

export function ReaderPluginListPage({
  plugins,
  loading,
  error,
  loadError,
  busy,
  retryingLoad,
  canRetryLoadError,
  strings,
  measuring,
  stackInset,
  onDismissError,
  onDismissLoadError,
  onRetryLoad,
  onSelectPlugin,
  onTogglePlugin,
}: {
  plugins: MobileReaderPluginState[];
  loading: boolean;
  error: string | null;
  loadError: string | null;
  busy: boolean;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  strings: MobileStrings;
  measuring: boolean;
  stackInset?: ReaderPluginStackInset;
  onClose: () => void;
  onDismissError: () => void;
  onDismissLoadError: () => void;
  onRetryLoad: () => void;
  onSelectPlugin: (pluginId: string) => void;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
}) {
  const { tokens } = useNemuTheme();
  return (
    <ReaderPluginSheetPage stackInset={stackInset}>
      {error ? (
        <MobileInlineErrorBanner
          title={strings.settings.settingsActionFailed}
          detail={error}
          dismissLabel={strings.common.clear}
          onDismiss={measuring ? noop : onDismissError}
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
          onActionPress={measuring ? noop : onRetryLoad}
          onDismiss={measuring ? noop : onDismissLoadError}
          variant="embedded"
        />
      ) : null}
      {loading && plugins.length === 0 ? (
        <NemuInlineEmptyState icon="hourglass-outline" title={strings.settings.loadingReaderPlugins} />
      ) : plugins.length > 0 ? (
        // Settings → Reader → Plugins' own rows, in one group. The row opens
        // a plugin that is off too: its page has the on / off row.
        <View style={[styles.stackGroup, { backgroundColor: tokens.card }]}>
          {plugins.map((plugin, index) => (
            <ReaderPluginManagementRow
              key={plugin.id}
              plugin={plugin}
              strings={strings}
              disabled={busy}
              opensWhileOff
              first={index === 0}
              onSelect={measuring ? noop : () => onSelectPlugin(plugin.id)}
              onToggle={measuring ? noop : (enabled) => onTogglePlugin(plugin, enabled)}
            />
          ))}
        </View>
      ) : null}
    </ReaderPluginSheetPage>
  );
}

/**
 * A plugin's page: Settings' plugin page (description and the shared
 * settings card) plus the plugin's on / off row; its name is the bar's
 * title. Off, the settings stay visible (dimmed) so the page keeps its shape
 * when the switch flips.
 */
export function ReaderPluginDetailPage({
  plugin: storedPlugin,
  busy,
  loading,
  error,
  strings,
  measuring = false,
  stackInset,
  onTogglePlugin,
  onResetPlugin,
  onChangePluginValue,
}: {
  plugin: MobileReaderPluginState;
  busy: boolean;
  loading: boolean;
  error: string | null;
  strings: MobileStrings;
  /** The off-screen measuring copy: inert, never starts a dictionary download. */
  measuring?: boolean;
  stackInset?: ReaderPluginStackInset;
  onBack: () => void;
  onTogglePlugin: ReaderPluginSettingsSheetProps["onTogglePlugin"];
  onResetPlugin: ReaderPluginSettingsSheetProps["onResetPlugin"];
  onChangePluginValue: ReaderPluginSettingsSheetProps["onChangePluginValue"];
}) {
  const plugin = useMobileReaderPluginSignedInState(storedPlugin, strings);
  return (
    <ReaderPluginSheetPage stackInset={stackInset}>
      <MobileReaderPluginSettingsDescription plugin={plugin} />
      <ReaderPluginEnableRow
        plugin={plugin}
        busy={busy}
        strings={strings}
        outlined={false}
        onToggle={measuring ? noop : (enabled) => onTogglePlugin(plugin, enabled)}
      />
      <MobileReaderPluginSettingsCard
        plugin={plugin}
        strings={strings}
        disabled={busy || !plugin.enabled}
        loading={loading}
        error={error}
        inert={measuring}
        outlined={false}
        onReset={measuring ? noop : () => onResetPlugin(plugin)}
        onChange={measuring ? noop : (key, value) => onChangePluginValue(plugin, key, value)}
      />
    </ReaderPluginSheetPage>
  );
}


const styles = StyleSheet.create({
  // On the stack's Form inset (as the Form reported it; the iPhone default
  // until then), so a page lines up with the page it came from.
  stackBody: {
    gap: 14,
    paddingHorizontal: READER_SETTINGS_FORM_INSET,
    paddingTop: 8,
    paddingBottom: MOBILE_NATIVE_SHEET_BOTTOM_GUTTER,
  },
  // A Settings group: the card the Settings → Reader → Plugins rows sit in.
  // No outline: the Form's groups beside it have none.
  stackGroup: {
    ...MOBILE_EXPLORE_GROUP_SHAPE,
    overflow: "hidden",
  },
});
