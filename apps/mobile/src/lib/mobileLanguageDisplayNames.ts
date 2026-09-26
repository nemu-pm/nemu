/**
 * Localized language names ("Abkhazian", "阿布哈西亚语", "アブハズ語") for codes
 * the curated autonym table in `mobileLanguageSettings` does not cover.
 *
 * iOS's system JavaScriptCore has `Intl.DisplayNames`. Android runs the
 * community JSC build without ICU, where there is no `Intl` global at all, so
 * the filter sheet printed raw codes ("AB", "AF"). There the names come from
 * the platform instead (`java.util.Locale`, ICU-backed on Android) through the
 * `NemuAidoku` native module; see `mobileLanguageDisplayNameResolver.android.ts`.
 *
 * Pure: no `react-native` or native-module imports, so it stays unit-testable.
 */

/** `code -> name` for the codes the platform can name; others are omitted. */
export type MobileNativeLanguageDisplayNameLookup = (
  codes: string[],
  displayLanguage: string,
) => Record<string, string> | null | undefined;

export type MobileLanguageDisplayNameResolver = (
  normalizedCode: string,
  displayLanguage: string,
) => string | undefined;

type DisplayNamesConstructor = new (
  locales: string[],
  options: { type: "language" },
) => { of: (value: string) => string | undefined };

function intlDisplayNamesConstructor(): DisplayNamesConstructor | null {
  try {
    const intl = (globalThis as { Intl?: { DisplayNames?: unknown } }).Intl;
    return typeof intl?.DisplayNames === "function"
      ? (intl.DisplayNames as DisplayNamesConstructor)
      : null;
  } catch {
    return null;
  }
}

/** `Intl.DisplayNames` when this engine has it (iOS, web, Bun), else `undefined`. */
export function intlLanguageDisplayName(
  normalizedCode: string,
  displayLanguage: string,
): string | undefined {
  const DisplayNames = intlDisplayNamesConstructor();
  if (!DisplayNames) return undefined;
  try {
    return new DisplayNames([displayLanguage], { type: "language" }).of(
      normalizedCode,
    );
  } catch {
    // `of` throws a RangeError for a structurally invalid code.
    return undefined;
  }
}

/**
 * Prefers `Intl.DisplayNames`; without it, asks `nativeLookup` once per
 * (display language, code) and caches the answer, including "no name", so a
 * re-rendering chip list never repeats a synchronous native call.
 */
export function createMobileLanguageDisplayNameResolver(
  nativeLookup: MobileNativeLanguageDisplayNameLookup | null,
  intlLookup: MobileLanguageDisplayNameResolver = intlLanguageDisplayName,
): MobileLanguageDisplayNameResolver {
  const cache = new Map<string, string | null>();

  return (normalizedCode, displayLanguage) => {
    const intlName = intlLookup(normalizedCode, displayLanguage);
    if (intlName) return intlName;
    if (!nativeLookup) return undefined;

    const key = `${displayLanguage}\u0000${normalizedCode}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached ?? undefined;

    let name: string | null = null;
    try {
      const result = nativeLookup([normalizedCode], displayLanguage);
      const candidate = result?.[normalizedCode];
      if (typeof candidate === "string" && candidate.trim()) {
        name = candidate.trim();
      }
    } catch {
      // A native build without the lookup keeps the uppercase-code fallback.
    }
    cache.set(key, name);
    return name ?? undefined;
  };
}
