import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";

export type ReaderPluginSettingsSheetProps = {
  visible: boolean;
  plugins: MobileReaderPluginState[];
  /** The plugin whose settings are open (pushed), or null for the list. */
  selectedPluginId: string | null;
  loading: boolean;
  /** A failed toggle / value / reset write. */
  error: string | null;
  /** The plugin list failed to load. */
  loadError: string | null;
  /** A write (or a reload) is in flight. */
  busy: boolean;
  retryingLoad: boolean;
  canRetryLoadError: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onDismissError: () => void;
  onDismissLoadError: () => void;
  onRetryLoad: () => void;
  onSelectPlugin: (pluginId: string) => void;
  onClearSelectedPlugin: () => void;
  onTogglePlugin: (plugin: MobileReaderPluginState, enabled: boolean) => void;
  onResetPlugin: (plugin: MobileReaderPluginState) => void;
  onChangePluginValue: (
    plugin: MobileReaderPluginState,
    key: string,
    value: unknown,
  ) => void;
};
