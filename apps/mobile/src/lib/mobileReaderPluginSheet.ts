/**
 * Pure model for the reader's Plugins sheet (ReaderPluginSettingsSheet): the
 * list row's secondary line. Each plugin's page renders the shared settings
 * card (`MobileReaderPluginSettingsCard`), the same one Settings shows.
 */
import { formatMobileSettingsCount, type MobileStrings } from "./mobileI18n";
import type { MobileReaderPlugin } from "./mobileReaderPlugins";
import { countRenderableSourceSettings } from "./mobileSourceSettings";

/**
 * The row's secondary line, in sentence case: "5 settings", "1 setting"; a
 * plugin with nothing to configure (Dual Read in release) reads its
 * description rather than "0 settings".
 */
export function mobileReaderPluginRowSubtitle(
  plugin: Pick<MobileReaderPlugin, "settings" | "description">,
  strings: MobileStrings,
): string {
  const count = countRenderableSourceSettings(plugin.settings);
  return count > 0 ? formatMobileSettingsCount(count, strings) : plugin.description;
}
