const MOBILE_SOURCE_EXTERNAL_URL_MAX_LENGTH = 8 * 1024;

/**
 * Source home layouts are untrusted package output. They may open ordinary web
 * links after an explicit tap, but must not dispatch arbitrary OS/custom
 * schemes (including Nemu deep links) through React Native Linking.
 */
export function normalizeMobileSourceExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MOBILE_SOURCE_EXTERNAL_URL_MAX_LENGTH) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
