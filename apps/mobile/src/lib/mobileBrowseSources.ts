import type { AppLanguage, InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  getMobileSourceKind,
  isMobileUnsupportedSourceKind,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import {
  getMobileInstalledSourceRegistryKey,
  getMobileInstalledSourceRegistryKeys,
  mobileInstalledSourceMatchesRoute,
} from "./mobileInstalledSourceKeys";
import {
  compareMobileLanguageCodes,
  getLanguageCategory,
  normalizeMobileLanguageCode,
  sortSourcesByLanguagePriority,
  type MobileLanguageSource,
} from "./mobileLanguageSettings";

export type MobileBrowseLanguageSource = MobileLanguageSource & {
  id: string;
  name: string;
};

export type MobileBrowseSource = MobileBrowseLanguageSource & {
  registryName: string;
  contentRating?: number;
};

type MobileSourceWarningCopy = {
  warningAuthentication: string;
  warningCloudflare: string;
  warningTitle: string;
};

export type MobileBrowseSourceLanguageSection<T extends MobileBrowseLanguageSource> = {
  label: string;
  sources: T[];
};

export type MobileSourceInstallResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export function filterMobileAvailableSources<T extends MobileBrowseSource>(
  sources: T[],
  options: {
    query: string;
    selectedLanguages?: Iterable<string>;
    showAdult: boolean;
    appLanguage: AppLanguage;
  },
): T[] {
  const normalized = options.query.trim().toLowerCase();
  const selectedLanguages = new Set(options.selectedLanguages ?? []);
  const filtered = sources
    .filter((source) => options.showAdult || (source.contentRating ?? 0) < 2)
    .filter((source) => {
      if (selectedLanguages.size === 0) return true;
      if (!source.languages?.length) return selectedLanguages.has("other");
      return source.languages.some((language) =>
        selectedLanguages.has(normalizeMobileLanguageCode(language)),
      );
    })
    .filter((source) => {
      if (!normalized) return true;
      const haystack = [
        source.name,
        source.id,
        source.registryName,
        source.languages?.join(" ") ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  return sortSourcesByLanguagePriority(filtered, options.appLanguage);
}

export function canClearMobileBrowseSourceQuery(query: string): boolean {
  return query.length > 0;
}

export function canSelectMobileBrowseAllLanguages({
  selected,
}: {
  selected: boolean;
}): boolean {
  return !selected;
}

export function groupMobileSourcesByLanguage<T extends MobileBrowseLanguageSource>(
  sources: T[],
  appLanguage: AppLanguage,
  options: { sortSourcesByName?: boolean } = {},
): MobileBrowseSourceLanguageSection<T>[] {
  const grouped = new Map<string, T[]>();

  for (const source of sources) {
    const language = getLanguageCategory(source.languages);
    const group = grouped.get(language);
    if (group) {
      group.push(source);
    } else {
      grouped.set(language, [source]);
    }
  }

  return [...grouped.entries()]
    .sort(([languageA], [languageB]) =>
      compareMobileLanguageCodes(languageA, languageB, appLanguage),
    )
    .map(([label, sectionSources]) => ({
      label,
      sources: options.sortSourcesByName
        ? [...sectionSources].sort((a, b) => a.name.localeCompare(b.name))
        : [...sectionSources],
    }));
}

export function getMobileAvailableSourceLanguageOptions<
  T extends MobileBrowseSource,
>(sources: T[], appLanguage: AppLanguage): string[] {
  const languages = new Set<string>();
  for (const source of sources) {
    if (!source.languages?.length) {
      languages.add("other");
      continue;
    }
    for (const language of source.languages) {
      languages.add(normalizeMobileLanguageCode(language));
    }
  }

  return [...languages].sort((a, b) =>
    compareMobileLanguageCodes(a, b, appLanguage),
  );
}

export function canStartMobileSourceInstall(
  sourceKey: string,
  activeInstallKey: string | null,
): boolean {
  return (
    sourceKey.length > 0 &&
    (activeInstallKey === null || activeInstallKey.length === 0)
  );
}

export function getMobileSourceInstallResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileSourceInstallResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}

/**
 * Tapping Install always dismisses the Add Source sheet first. The toast host
 * lives in the root React Native tree, underneath the native sheet, so a
 * progress toast raised while the sheet is presented stays invisible until the
 * user closes the sheet by hand. Warned sources dismiss into the confirmation
 * sheet; everything else dismisses straight into the install.
 */
export type MobileSourceInstallHandoff =
  | "confirm-after-dismiss"
  | "install-after-dismiss";

export function getMobileSourceInstallHandoff({
  warningCount,
}: {
  warningCount: number;
}): MobileSourceInstallHandoff {
  return warningCount > 0 ? "confirm-after-dismiss" : "install-after-dismiss";
}

/**
 * The Add Source sheet never re-presents itself once an install has started.
 * Re-opening it would cover the progress/success toast that is the only
 * feedback surface for the install, which is exactly the bug this policy
 * pins closed. Cancelling the warning confirmation is the one path that
 * returns to the sheet, and it never reaches this policy.
 */
export function shouldReopenMobileAddSourceSheetAfterInstall(): boolean {
  return false;
}

/** Rows offered by the installed-source long-press quick-action sheet. */
export type MobileSourceQuickActionId =
  | "settings"
  | "update"
  | "openInBrowser"
  | "uninstall";

/**
 * Where a quick-action row is allowed to act. The quick-action sheet is a
 * native `@expo/ui` bottom sheet and only one of those can be presented at a
 * time, so every row whose destination is another sheet — or whose only
 * feedback surface is the toast host that sits *underneath* the sheet — has to
 * dismiss the quick actions first and run from the post-dismiss callback.
 * Opening a homepage leaves the app entirely, so it is the one row that may act
 * while the sheet is still on screen.
 */
export type MobileSourceQuickActionHandoff =
  | "dismiss-then-open-settings"
  | "dismiss-then-install-update"
  | "dismiss-then-confirm-uninstall"
  | "open-url";

export function getMobileSourceQuickActionHandoff(
  action: MobileSourceQuickActionId,
): MobileSourceQuickActionHandoff {
  switch (action) {
    case "settings":
      return "dismiss-then-open-settings";
    case "update":
      return "dismiss-then-install-update";
    case "uninstall":
      return "dismiss-then-confirm-uninstall";
    case "openInBrowser":
      return "open-url";
  }
}

export function getMobileSourceWarningMessages(
  source: Pick<MobileRegistrySource, "hasAuthentication" | "hasCloudflare">,
  strings: Pick<
    MobileSourceWarningCopy,
    "warningAuthentication" | "warningCloudflare"
  >,
): string[] {
  const messages: string[] = [];
  if (source.hasAuthentication) messages.push(strings.warningAuthentication);
  if (source.hasCloudflare) messages.push(strings.warningCloudflare);
  return messages;
}

export function getMobileSourceWarningAccessibilityLabel(
  source: Pick<
    MobileRegistrySource,
    "hasAuthentication" | "hasCloudflare" | "name"
  >,
  strings: MobileSourceWarningCopy,
): string | null {
  const messages = getMobileSourceWarningMessages(source, strings);
  if (messages.length === 0) return null;
  return `${source.name}. ${strings.warningTitle}. ${messages.join(" ")}`;
}

export function shouldRenderMobileBrowseSkeleton({
  loading,
  installedCount,
  availableCount,
  hasError,
}: {
  loading: boolean;
  installedCount: number;
  availableCount: number;
  hasError: boolean;
}): boolean {
  return loading && !hasError && installedCount === 0 && availableCount === 0;
}

export function buildMobileInstalledSourceKeySet(
  sources: InstalledSource[]
): Set<string> {
  const keys = new Set<string>();

  for (const source of sources) {
    for (const key of getMobileInstalledSourceRegistryKeys(source)) {
      keys.add(key);
    }
  }

  return keys;
}

export function findMobileInstalledSourceForRegistrySource(
  installedSources: InstalledSource[],
  registrySource: Pick<MobileRegistrySource, "registryId" | "id">
): InstalledSource | null {
  return (
    installedSources.find((source) =>
      mobileInstalledSourceMatchesRoute(
        source,
        registrySource.registryId,
        registrySource.id,
      ),
    ) ?? null
  );
}

export function getMobileInstalledSourceRegistryDisplayName(
  installedSources: InstalledSource[],
  registrySource: Pick<MobileRegistrySource, "registryId" | "id" | "name">,
): string {
  return (
    findMobileInstalledSourceForRegistrySource(
      installedSources,
      registrySource,
    )?.name ?? registrySource.name
  );
}

/**
 * True when an installed record points at a runtime this build cannot execute
 * (today: Tachiyomi). Cloud sync can hand us these records from the web app, so
 * every installed-source list has to be able to mark them instead of rendering
 * a normal row that only fails once the user taps it.
 */
export function isMobileUnsupportedInstalledSource(
  source: Pick<InstalledSource, "id" | "registryId" | "sourceKind">,
): boolean {
  return isMobileUnsupportedSourceKind(getMobileSourceKind(source));
}

export function mergeMobileInstalledSourceRegistryMetadata(
  installedSources: InstalledSource[],
  registrySources: MobileRegistrySource[]
): InstalledSource[] {
  const registryByKey = new Map(
    registrySources.map((source) => [
      makeSourceKey(source.registryId, source.id),
      source,
    ])
  );

  return installedSources.map((installed) => {
    const normalized = normalizeInstalledSource(installed);
    const registrySource = registryByKey.get(
      getMobileInstalledSourceRegistryKey(installed)
    );

    if (!registrySource) return installed;
    const packageMetadata =
      installed.packageMetadata ?? registrySource.packageMetadata;

    return {
      ...installed,
      registryId: installed.registryId || normalized.registryId,
      sourceKind: registrySource.sourceKind ?? installed.sourceKind,
      sourceId: installed.sourceId ?? normalized.sourceId,
      name: registrySource.name || installed.name,
      icon: registrySource.icon ?? installed.icon,
      languages: registrySource.languages ?? installed.languages,
      contentRating: registrySource.contentRating ?? installed.contentRating,
      ...(registrySource.hasAuthentication == null
        ? {}
        : { hasAuthentication: registrySource.hasAuthentication }),
      ...(registrySource.hasCloudflare == null
        ? {}
        : { hasCloudflare: registrySource.hasCloudflare }),
      downloadUrl: registrySource.downloadUrl ?? installed.downloadUrl,
      ...(packageMetadata === undefined ? {} : { packageMetadata }),
    };
  });
}
