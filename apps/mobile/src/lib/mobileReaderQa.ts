/**
 * QA-only reader switches, baked in at build time (Expo inlines
 * `process.env.EXPO_PUBLIC_*` property reads). Simulator screenshots on the
 * iPhone Duo inner display cannot rely on synthesized taps, so these open the
 * reader chrome or one reader panel without touching the screen. Release
 * builds leave the variables unset and every switch resolves to off.
 */

export type MobileReaderQaPanel = "settings" | "plugins" | "ocr" | "ask" | "chat" | "transcript";
export type MobileReaderQaNotebook = "trackpad" | "filmstrip";

export function resolveMobileReaderQaChrome(value: string | undefined): boolean {
  return value === "1";
}

export function resolveMobileReaderQaPanel(value: string | undefined): MobileReaderQaPanel | null {
  // `plugins:<pluginId>` is the plugins sheet opened onto one plugin.
  if (value?.startsWith("plugins:")) return resolveMobileReaderQaPlugin(value, undefined) ? "plugins" : null;
  switch (value) {
    case "settings":
    case "plugins":
    case "ocr":
    case "ask":
    case "chat":
    case "transcript":
      return value;
    default:
      return null;
  }
}

const QA_PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The plugin whose settings page the plugins QA panel opens: from
 * `EXPO_PUBLIC_READER_QA_PANEL=plugins:<id>`, else from
 * `EXPO_PUBLIC_READER_QA_PLUGIN=<id>` alongside `…_PANEL=plugins`. Null
 * leaves the sheet on its plugin list.
 */
export function resolveMobileReaderQaPlugin(
  panelValue: string | undefined,
  pluginValue: string | undefined,
): string | null {
  const candidate = panelValue?.startsWith("plugins:")
    ? panelValue.slice("plugins:".length)
    : panelValue === "plugins"
      ? pluginValue
      : undefined;
  return candidate && QA_PLUGIN_ID.test(candidate) ? candidate : null;
}

export function resolveMobileReaderQaNotebook(value: string | undefined): MobileReaderQaNotebook | null {
  return value === "trackpad" || value === "filmstrip" ? value : null;
}

/** `EXPO_PUBLIC_READER_QA_CHROME=1`: reader chrome stays visible (no auto-hide, taps do not hide it). */
export const MOBILE_READER_QA_CHROME = resolveMobileReaderQaChrome(process.env.EXPO_PUBLIC_READER_QA_CHROME);

/**
 * `EXPO_PUBLIC_READER_QA_PANEL=settings|plugins|ocr|ask|chat|transcript`: opens that panel once the chapter is
 * ready. `plugins` is the reader's Plugins sheet (`plugins:<pluginId>` opens that plugin's settings page);
 * `ocr` selects the first detected line; `ask` then asks about that sentence.
 */
export const MOBILE_READER_QA_PANEL = resolveMobileReaderQaPanel(process.env.EXPO_PUBLIC_READER_QA_PANEL);

/**
 * The plugin page the `plugins` QA panel opens, from `EXPO_PUBLIC_READER_QA_PANEL=plugins:<id>` or
 * `EXPO_PUBLIC_READER_QA_PLUGIN=<id>` (e.g. `japanese-learning`, `dual-reader`); null keeps the list.
 */
export const MOBILE_READER_QA_PLUGIN = resolveMobileReaderQaPlugin(
  process.env.EXPO_PUBLIC_READER_QA_PANEL,
  process.env.EXPO_PUBLIC_READER_QA_PLUGIN,
);

/**
 * `EXPO_PUBLIC_READER_QA_NOTEBOOK=trackpad|filmstrip`: the notebook
 * posture's bottom pane starts in that state for the session (the saved
 * preference is untouched).
 */
export const MOBILE_READER_QA_NOTEBOOK = resolveMobileReaderQaNotebook(process.env.EXPO_PUBLIC_READER_QA_NOTEBOOK);
