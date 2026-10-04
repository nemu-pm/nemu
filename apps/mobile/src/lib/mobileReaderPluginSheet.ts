/**
 * Pure model for the reader's Plugins sheet (ReaderPluginSettingsSheet): the
 * list row's secondary line. Each plugin's page renders the shared settings
 * card (`MobileReaderPluginSettingsCard`), the same one Settings shows.
 */
import { formatMobileSettingsCount, type MobileStrings } from "./mobileI18n";
import type { MobileReaderPlugin } from "./mobileReaderPlugins";
import { countRenderableSourceSettings } from "./mobileSourceSettings";

/** The row's secondary line, in sentence case: "5 settings", "1 setting". */
export function mobileReaderPluginRowSubtitle(
  plugin: Pick<MobileReaderPlugin, "settings">,
  strings: MobileStrings,
): string {
  return formatMobileSettingsCount(
    countRenderableSourceSettings(plugin.settings),
    strings,
  );
}
