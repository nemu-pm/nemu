/**
 * QA-only reader switches, baked in at build time (Expo inlines
 * `process.env.EXPO_PUBLIC_*` property reads). Simulator screenshots on the
 * iPhone Duo inner display cannot rely on synthesized taps, so these open the
 * reader chrome or one reader panel without touching the screen. Release
 * builds leave the variables unset and every switch resolves to off.
 */

export type MobileReaderQaPanel = "settings" | "ocr" | "ask" | "chat" | "transcript";
export type MobileReaderQaNotebook = "trackpad" | "filmstrip" | "studyDesk";

export function resolveMobileReaderQaChrome(value: string | undefined): boolean {
  return value === "1";
}

export function resolveMobileReaderQaPanel(value: string | undefined): MobileReaderQaPanel | null {
  switch (value) {
    case "settings":
    case "ocr":
    case "ask":
    case "chat":
    case "transcript":
      return value;
    default:
      return null;
  }
}

export function resolveMobileReaderQaNotebook(value: string | undefined): MobileReaderQaNotebook | null {
  return value === "trackpad" || value === "filmstrip" || value === "studyDesk" ? value : null;
}

/** `EXPO_PUBLIC_READER_QA_CHROME=1`: reader chrome stays visible (no auto-hide, taps do not hide it). */
export const MOBILE_READER_QA_CHROME = resolveMobileReaderQaChrome(process.env.EXPO_PUBLIC_READER_QA_CHROME);

/**
 * `EXPO_PUBLIC_READER_QA_PANEL=settings|ocr|ask|chat|transcript`: opens that panel once the chapter is
 * ready. `ocr` selects the first detected line; `ask` then asks about that sentence.
 */
export const MOBILE_READER_QA_PANEL = resolveMobileReaderQaPanel(process.env.EXPO_PUBLIC_READER_QA_PANEL);

/**
 * `EXPO_PUBLIC_READER_QA_NOTEBOOK=trackpad|filmstrip|studyDesk`: the notebook
 * posture's bottom pane starts in that state for the session (the saved
 * preference is untouched).
 */
export const MOBILE_READER_QA_NOTEBOOK = resolveMobileReaderQaNotebook(process.env.EXPO_PUBLIC_READER_QA_NOTEBOOK);
