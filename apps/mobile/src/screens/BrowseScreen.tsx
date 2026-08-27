import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, router, type Href } from "expo-router";
import {
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type SectionListData,
  type SectionListRenderItemInfo,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileBrowseSkeleton } from "@/components/MobileBrowseSkeleton";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { MobileSourceInstallSheet } from "@/components/MobileSourceInstallSheet";
import {
  NemuButton,
  GlassSurface,
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuPressable,
  PageHeader,
  PageScaffold,
  SourceCard,
  createNemuNativeScreenOptions,
  radius,
  renderNemuNativeToolbarButtons,
  nemuFontWeight,
  useNemuTheme,
  usesNemuNativeHeader,
  type NemuNativeHeaderAction,
  type SourceCardModel,
} from "@/design-system";
import {
  isMobileSourceInstallCancellation,
  useAvailableSources,
  useInstalledSources,
  useMobileLanguageSettings,
  useSourceInstaller,
} from "@/data/mobileHooks";
import {
  hapticConfirm,
  hapticError,
  hapticPress,
  hapticSelection,
} from "@/lib/haptics";
import { prefetchCachedMobileImages } from "@/lib/mobileImageCache";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  buildMobileInstalledSourceKeySet,
  canClearMobileBrowseSourceQuery,
  canSelectMobileBrowseAllLanguages,
  canStartMobileSourceInstall,
  filterMobileAvailableSources,
  getMobileAvailableSourceLanguageOptions,
  getMobileSourceInstallResultAction,
  getMobileSourceWarningAccessibilityLabel,
  getMobileSourceWarningMessages,
  groupMobileSourcesByLanguage,
  isMobileUnsupportedInstalledSource,
  mergeMobileInstalledSourceRegistryMetadata,
  shouldRenderMobileBrowseSkeleton,
} from "@/lib/mobileBrowseSources";
import { getMobileInstalledSourceRegistryRef } from "@/lib/mobileInstalledSourceKeys";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { sortSourcesByLanguagePriority } from "@/lib/mobileLanguageSettings";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import {
  makeSourceKey,
  type MobileRegistrySource,
} from "@/sources/aidokuRegistry";

const SOURCE_WARNING_COLOR = "#f59e0b";

type BrowseConfirmation = {
  type: "install-warning";
  source: MobileRegistrySource;
  warnings: string[];
};

type SourceActionError = {
  title: string;
  detail: string;
};

type BrowseSheet = "add-source" | "source-language";

type AvailableSourceSection = {
  label: string;
  data: MobileRegistrySource[];
};

/**
 * Installed sources carry an `unsupported` flag so runtimes this build cannot
 * execute (today: Tachiyomi, which can arrive through cloud sync) render as an
 * explicit "unsupported" row instead of a normal one that only fails on tap.
 */
type InstalledSourceCardModel = SourceCardModel & { unsupported: boolean };

/**
 * Stand-in for `SourceCard` used by sources this build cannot run. It is not a
 * gateway into browsing; it only routes to the source's settings so the user
 * can uninstall it.
 */
function UnsupportedSourceRow({
  source,
  strings,
  onPress,
}: {
  source: InstalledSourceCardModel;
  strings: MobileStrings;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={`${source.name}. ${strings.common.sourceUnsupported}`}
      accessibilityHint={strings.common.sourceUnsupportedTachiyomiDescription}
      onPress={onPress}
      pressedScale={0.985}
      style={[
        styles.unsupportedSourceRow,
        { backgroundColor: tokens.muted, borderColor: tokens.border },
      ]}
    >
      <View
        style={[
          styles.unsupportedSourceIcon,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <Ionicons
          name="alert-circle-outline"
          size={22}
          color={tokens.mutedForeground}
        />
      </View>
      <View style={styles.unsupportedSourceText}>
        <View style={styles.unsupportedSourceTitleRow}>
          <Text
            numberOfLines={1}
            style={[styles.unsupportedSourceTitle, { color: tokens.foreground }]}
          >
            {source.name}
          </Text>
          <View
            style={[
              styles.unsupportedSourceBadge,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
            <Text
              style={[
                styles.unsupportedSourceBadgeText,
                { color: tokens.mutedForeground },
              ]}
            >
              {strings.common.sourceUnsupportedBadge}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.unsupportedSourceSubtitle,
            { color: tokens.mutedForeground },
          ]}
        >
          {strings.common.sourceUnsupportedTachiyomiDescription}
        </Text>
      </View>
    </NemuPressable>
  );
}

function sourceSettingsHref(source: SourceCardModel): Href {
  return {
    pathname: "/(tabs)/settings/[section]",
    params: { section: "sources", sourceId: source.id },
  };
}

function formatLanguages(languages?: string[]): string | undefined {
  return languages?.length ? languages.join(", ").toUpperCase() : undefined;
}

function formatSourceLanguageLabel(
  language: string,
  strings: MobileStrings,
  appLanguage: string,
): string {
  if (language === "other") return strings.browse.otherLanguages;
  if (language === "multi") return strings.sourceBrowse.multiLanguage;

  try {
    const displayNamesCtor = (
      Intl as unknown as {
        DisplayNames?: new (
          locales: string[],
          options: { type: "language" },
        ) => { of: (code: string) => string | undefined };
      }
    ).DisplayNames;
    const label = displayNamesCtor
      ? new displayNamesCtor([appLanguage], { type: "language" }).of(language)
      : undefined;
    if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    // Some native runtimes ship a smaller Intl surface.
  }

  return language.toUpperCase();
}

function formatLanguageSelectionLabel(
  selectedLanguages: Set<string>,
  strings: MobileStrings,
  appLanguage: string,
): string {
  if (selectedLanguages.size === 0) return strings.browse.allLanguages;
  if (selectedLanguages.size === 1) {
    return formatSourceLanguageLabel(
      [...selectedLanguages][0],
      strings,
      appLanguage,
    );
  }

  return formatMobileString(strings.browse.languagesSelected, {
    count: selectedLanguages.size,
  });
}

function sourceActionErrorMessage(
  error: unknown,
  strings: MobileStrings,
): string {
  return describeMobileErrorDetail(error, strings.browse.sourcesUnavailable);
}

function waitForInstallSheetFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function colorWithOpacity(color: string, opacity: number) {
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hexMatch) return color;

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${alpha}`;
}

function LanguageFilterMenu({
  languages,
  selectedLanguages,
  strings,
  appLanguage,
  onOpenLanguageList,
}: {
  languages: string[];
  selectedLanguages: Set<string>;
  strings: MobileStrings;
  appLanguage: string;
  onOpenLanguageList: () => void;
}) {
  const { tokens } = useNemuTheme();
  const visibleLanguages = languages.filter((language) => language !== "all");
  if (visibleLanguages.length === 0) return null;
  const allLanguagesSelected = selectedLanguages.size === 0;
  const selectedLabel = formatLanguageSelectionLabel(
    selectedLanguages,
    strings,
    appLanguage,
  );

  return (
    <NemuPressable
      accessibilityLabel={formatMobileString(
        strings.browse.languageFilterOption,
        {
          language: selectedLabel,
        },
      )}
      accessibilityRole="button"
      buttonDepth={allLanguagesSelected ? "secondary" : "primary"}
      onPress={() => {
        void hapticSelection();
        onOpenLanguageList();
      }}
      pressedScale={0.98}
      style={styles.languageFallbackButton}
    >
      <Ionicons
        name="language-outline"
        size={15}
        color={
          allLanguagesSelected
            ? tokens.mutedForeground
            : tokens.primaryForeground
        }
      />
      <Text
        numberOfLines={1}
        style={[
          styles.languageFallbackText,
          {
            color: allLanguagesSelected
              ? tokens.foreground
              : tokens.primaryForeground,
          },
        ]}
      >
        {selectedLabel}
      </Text>
      <Ionicons
        name="chevron-down-outline"
        size={14}
        color={allLanguagesSelected ? tokens.primary : tokens.primaryForeground}
      />
    </NemuPressable>
  );
}

function LanguageFilterOptionRow({
  label,
  selected,
  accessibilityLabel,
  onPress,
  showSeparator = false,
}: {
  label: string;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  showSeparator?: boolean;
}) {
  const { tokens } = useNemuTheme();

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      pressedScale={0.99}
      style={[
        styles.languageOptionRow,
        showSeparator
          ? {
              borderBottomColor: tokens.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.languageOptionText,
          {
            color: selected ? tokens.primary : tokens.foreground,
            fontWeight: selected
              ? nemuFontWeight.semibold
              : nemuFontWeight.regular,
          },
        ]}
      >
        {label}
      </Text>
      <View style={styles.languageOptionAccessory}>
        {selected ? (
          <Ionicons name="checkmark-outline" size={18} color={tokens.primary} />
        ) : null}
      </View>
    </NemuPressable>
  );
}

function LanguageFilterSheetSection({
  languages,
  selectedLanguages,
  strings,
  appLanguage,
  onSelectAll,
  onToggleLanguage,
}: {
  languages: string[];
  selectedLanguages: Set<string>;
  strings: MobileStrings;
  appLanguage: string;
  onSelectAll: () => void;
  onToggleLanguage: (language: string) => void;
}) {
  const visibleLanguages = languages.filter((language) => language !== "all");
  const allLanguagesSelected = selectedLanguages.size === 0;
  const pinnedLanguages = visibleLanguages.filter((language) => language === "multi");
  const listLanguages = visibleLanguages.filter((language) => language !== "multi");

  return (
    <>
      <GlassSurface
        style={styles.languageListSection}
        contentStyle={styles.languageListContent}
      >
        <LanguageFilterOptionRow
          label={strings.browse.allLanguages}
          selected={allLanguagesSelected}
          accessibilityLabel={formatMobileString(
            strings.browse.languageFilterOption,
            {
              language: strings.browse.allLanguages,
            },
          )}
          showSeparator={pinnedLanguages.length > 0}
          onPress={() => {
            if (
              !canSelectMobileBrowseAllLanguages({
                selected: allLanguagesSelected,
              })
            ) {
              return;
            }
            void hapticSelection();
            onSelectAll();
          }}
        />
        {pinnedLanguages.map((language, index) => {
          const label = formatSourceLanguageLabel(
            language,
            strings,
            appLanguage,
          );
          const selected = selectedLanguages.has(language);
          return (
            <LanguageFilterOptionRow
              key={language}
              label={label}
              selected={selected}
              accessibilityLabel={formatMobileString(
                strings.browse.languageFilterOption,
                { language: label },
              )}
              showSeparator={index < pinnedLanguages.length - 1}
              onPress={() => {
                void hapticSelection();
                onToggleLanguage(language);
              }}
            />
          );
        })}
      </GlassSurface>

      {listLanguages.length ? (
        <GlassSurface
          style={styles.languageListSection}
          contentStyle={styles.languageListContent}
        >
          {listLanguages.map((language, index) => {
            const label = formatSourceLanguageLabel(
              language,
              strings,
              appLanguage,
            );
            const selected = selectedLanguages.has(language);
            return (
              <LanguageFilterOptionRow
                key={language}
                label={label}
                selected={selected}
                accessibilityLabel={formatMobileString(
                  strings.browse.languageFilterOption,
                  { language: label },
                )}
                showSeparator={index < listLanguages.length - 1}
                onPress={() => {
                  void hapticSelection();
                  onToggleLanguage(language);
                }}
              />
            );
          })}
        </GlassSurface>
      ) : null}
    </>
  );
}

const AvailableSourceRow = memo(function AvailableSourceRow({
  source,
  strings,
  installed,
  busy,
  installLocked,
  onInstall,
}: {
  source: MobileRegistrySource;
  strings: MobileStrings;
  installed: boolean;
  busy: boolean;
  installLocked: boolean;
  onInstall: (source: MobileRegistrySource) => void;
}) {
  const { tokens } = useNemuTheme();
  const disabled = busy || installLocked;
  const actionAccessibilityLabel = installed
    ? `${source.name}. ${strings.browse.installed}`
    : formatMobileString(strings.browse.installSourceNamed, {
        name: source.name,
      });
  const warningMessages = getMobileSourceWarningMessages(
    source,
    strings.browse,
  );
  const hasWarnings = warningMessages.length > 0;
  const warningAccessibilityLabel = getMobileSourceWarningAccessibilityLabel(
    source,
    strings.browse,
  );

  return (
    <View
      style={[
        styles.availableShell,
        {
          backgroundColor: installed
            ? colorWithOpacity(tokens.muted, 0.48)
            : tokens.card,
          borderColor: tokens.border,
        },
      ]}
    >
      <View style={styles.availableRow}>
        <View
          style={[
            styles.sourceIcon,
            {
              backgroundColor: source.icon
                ? "transparent"
                : tokens.sourceIconGlass,
              borderColor: source.icon ? "transparent" : tokens.border,
              borderWidth: source.icon ? 0 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          {source.icon ? (
            <MobileCachedImage
              fallback={
                <Ionicons
                  name="globe-outline"
                  size={22}
                  color={tokens.mutedForeground}
                />
              }
              uriOwnership="source"
              source={{ uri: source.icon }}
              style={styles.sourceIconImage}
            />
          ) : (
            <Ionicons
              name="globe-outline"
              size={22}
              color={tokens.mutedForeground}
            />
          )}
        </View>
        <View style={styles.availableText}>
          <View style={styles.sourceTitleRow}>
            <Text
              numberOfLines={1}
              style={[styles.sourceTitle, { color: tokens.foreground }]}
            >
              {source.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.sourceVersionText,
                { color: tokens.mutedForeground },
              ]}
            >
              v{source.version}
            </Text>
            {warningAccessibilityLabel ? (
              <View
                accessible
                accessibilityLabel={warningAccessibilityLabel}
                accessibilityRole="image"
                style={styles.sourceWarningIcon}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={15}
                  color={SOURCE_WARNING_COLOR}
                />
              </View>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={[styles.sourceSubtitle, { color: tokens.mutedForeground }]}
          >
            {[formatLanguages(source.languages), source.registryName]
              .filter(Boolean)
              .join(" / ")}
          </Text>
        </View>
        {installed ? (
          <View
            accessible
            accessibilityLabel={actionAccessibilityLabel}
            style={styles.installStatus}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={16}
              color={tokens.success}
            />
            <Text style={[styles.installText, { color: tokens.mutedForeground }]}>
              {strings.browse.installed}
            </Text>
          </View>
        ) : (
          <NemuButton
            accessibilityHint={
              warningMessages.length ? warningMessages.join(" ") : undefined
            }
            accessibilityLabel={
              hasWarnings
                ? `${actionAccessibilityLabel}. ${strings.browse.warningTitle}`
                : actionAccessibilityLabel
            }
            disabled={disabled}
            loading={busy}
            label={strings.common.install}
            onPress={() => {
              onInstall(source);
            }}
            size="sm"
            variant="outline"
            style={styles.sourceInstallButton}
            textStyle={styles.sourceInstallButtonText}
          />
        )}
      </View>
    </View>
  );
});

function availableSourceKeyExtractor(source: MobileRegistrySource) {
  return makeSourceKey(source.registryId, source.id);
}

function AvailableRowSeparator() {
  return <View style={styles.availableRowSeparator} />;
}

function AvailableSectionSeparator() {
  return <View style={styles.availableSectionSeparator} />;
}

export function BrowseScreen() {
  const { tokens } = useNemuTheme();
  const [query, setQuery] = useState("");
  const [showAdult, setShowAdult] = useState(false);
  const [activeSheet, setActiveSheet] = useState<BrowseSheet | null>(null);
  const [addSourceSheetKey, setAddSourceSheetKey] = useState(0);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(
    () => new Set(),
  );
  const [confirmation, setConfirmation] = useState<BrowseConfirmation | null>(
    null,
  );
  const [pendingInstallKey, setPendingInstallKey] = useState<string | null>(
    null,
  );
  const installGuardKeyRef = useRef<string | null>(null);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const refreshGuardRef = useRef(false);
  const [actionError, setActionError] = useState<SourceActionError | null>(
    null,
  );
  const [dismissedSourceUpdateNoticeId, setDismissedSourceUpdateNoticeId] =
    useState<number | null>(null);
  const installed = useInstalledSources();
  const available = useAvailableSources();
  const installer = useSourceInstaller();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const usesNativeHeader = usesNemuNativeHeader;

  const installedKeys = useMemo(
    () => buildMobileInstalledSourceKeySet(installed.data),
    [installed.data],
  );

  const availableByKey = useMemo(() => {
    return new Map(
      available.data.map((source) => [
        makeSourceKey(source.registryId, source.id),
        source,
      ]),
    );
  }, [available.data]);

  const installedSources = useMemo<InstalledSourceCardModel[]>(() => {
    const merged = mergeMobileInstalledSourceRegistryMetadata(
      installed.data,
      available.data,
    );
    const cards = merged.map((source) => {
      const { registryId, sourceId } =
        getMobileInstalledSourceRegistryRef(source);
      return {
        id: source.id,
        registryId,
        sourceId,
        name: source.name ?? sourceId,
        icon: source.icon,
        languages: source.languages,
        subtitle: registryId,
        unsupported: isMobileUnsupportedInstalledSource(source),
      };
    });
    return sortSourcesByLanguagePriority(cards, appLanguage);
  }, [appLanguage, available.data, installed.data]);
  const groupedInstalledSources = useMemo(
    () => groupMobileSourcesByLanguage(installedSources, appLanguage),
    [appLanguage, installedSources],
  );

  const filteredAvailable = useMemo(() => {
    return filterMobileAvailableSources(available.data, {
      appLanguage,
      query,
      selectedLanguages,
      showAdult,
    });
  }, [appLanguage, available.data, query, selectedLanguages, showAdult]);
  const groupedAvailable = useMemo(
    () =>
      groupMobileSourcesByLanguage(filteredAvailable, appLanguage, {
        sortSourcesByName: true,
      }),
    [appLanguage, filteredAvailable],
  );
  const availableSourceSections = useMemo<AvailableSourceSection[]>(
    () =>
      groupedAvailable.map((section) => ({
        label: section.label,
        data: section.sources,
      })),
    [groupedAvailable],
  );

  const languageOptions = useMemo(
    () => getMobileAvailableSourceLanguageOptions(available.data, appLanguage),
    [appLanguage, available.data],
  );

  const loading = installed.loading || available.loading;
  const error = installed.error ?? available.error;
  const showSkeleton = shouldRenderMobileBrowseSkeleton({
    loading,
    installedCount: installed.data.length,
    availableCount: available.data.length,
    hasError: Boolean(error),
  });
  const activeInstallKey = pendingInstallKey ?? installer.installingKey;
  const activeInstallSource = activeInstallKey
    ? (availableByKey.get(activeInstallKey) ?? null)
    : null;
  const activeInstallSourceName = activeInstallSource?.name;
  const refreshDisabled = refreshingSources || activeInstallKey !== null;

  useEffect(() => {
    if (activeSheet !== "add-source") return;
    void prefetchCachedMobileImages(
      filteredAvailable
        .slice(0, 36)
        .map((source) => (source.icon ? { uri: source.icon } : null)),
    );
  }, [activeSheet, filteredAvailable]);

  const sourceUpdateNotice = available.sourceUpdateNotice;
  const sourceUpdateMessage = useMemo(() => {
    if (!sourceUpdateNotice) return null;
    if (sourceUpdateNotice.names.length === 1) {
      return formatMobileString(strings.settings.sourceUpdated, {
        name: sourceUpdateNotice.names[0] ?? "",
      });
    }
    return formatMobileString(strings.settings.sourcesUpdated, {
      count: sourceUpdateNotice.names.length,
      names: sourceUpdateNotice.names.join(", "),
    });
  }, [sourceUpdateNotice, strings]);
  const showSourceUpdateNotice =
    Boolean(sourceUpdateNotice && sourceUpdateMessage) &&
    sourceUpdateNotice?.id !== dismissedSourceUpdateNoticeId;
  const confirmationDetails = useMemo(() => {
    if (!confirmation) return null;
    const key = makeSourceKey(
      confirmation.source.registryId,
      confirmation.source.id,
    );

    return {
      title: strings.browse.warningTitle,
      description: confirmation.warnings.join("\n\n"),
      subject: confirmation.source.name,
      iconName: "alert-circle-outline" as const,
      confirmLabel: strings.browse.installAnyway,
      confirmAccessibilityLabel: formatMobileString(
        strings.browse.installSourceNamed,
        { name: confirmation.source.name },
      ),
      destructive: false,
      loading: activeInstallKey === key,
    };
  }, [activeInstallKey, confirmation, strings]);

  const installSource = async (source: MobileRegistrySource) => {
    const key = makeSourceKey(source.registryId, source.id);
    const guardedInstallKey =
      installGuardKeyRef.current ?? installer.installingKey;
    if (!canStartMobileSourceInstall(key, guardedInstallKey)) return;

    installGuardKeyRef.current = key;
    setPendingInstallKey(key);
    setActionError(null);
    const installStartedAt = markMobilePerformance("source.install.start", {
      key,
      name: source.name,
    });
    try {
      await waitForInstallSheetFrame();
      measureMobilePerformance("source.install.sheet-visible", installStartedAt, {
        key,
      });
      if (source.icon) {
        void prefetchCachedMobileImages([{ uri: source.icon }]);
      }
      await installer.installSource(source);
      measureMobilePerformance("source.install.package", installStartedAt, {
        key,
      });
      await Promise.all([installed.reload(), available.reload()]);
      measureMobilePerformance("source.install.complete", installStartedAt, {
        key,
      });
      if (
        getMobileSourceInstallResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        setConfirmation(null);
      }
      await hapticConfirm();
    } catch (error) {
      // A user-requested cancel is not a failure; just close the sheet.
      if (isMobileSourceInstallCancellation(error)) {
        setConfirmation(null);
        return;
      }
      await hapticError();
      if (
        getMobileSourceInstallResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setConfirmation(null);
      }
      setActionError({
        title: strings.browse.sourcesUnavailable,
        detail: sourceActionErrorMessage(error, strings),
      });
    } finally {
      if (installGuardKeyRef.current === key) {
        installGuardKeyRef.current = null;
      }
      setPendingInstallKey((current) => (current === key ? null : current));
    }
  };

  const confirmInstallSource = (source: MobileRegistrySource) => {
    setActionError(null);
    const warnings = getMobileSourceWarningMessages(source, strings.browse);
    if (warnings.length === 0) {
      void installSource(source);
      return;
    }

    setConfirmation({ type: "install-warning", source, warnings });
  };
  const confirmInstallSourceRef = useRef(confirmInstallSource);
  useEffect(() => {
    confirmInstallSourceRef.current = confirmInstallSource;
  });
  const handleInstallSource = useCallback((source: MobileRegistrySource) => {
    confirmInstallSourceRef.current(source);
  }, []);
  const renderAvailableSectionHeader = useCallback(
    ({
      section,
    }: {
      section: SectionListData<MobileRegistrySource, AvailableSourceSection>;
    }) => {
      const label = formatSourceLanguageLabel(section.label, strings, appLanguage);
      return (
        <Text
          style={[
            styles.sourceLanguageHeader,
            styles.availableSourceLanguageHeader,
            { color: tokens.mutedForeground },
          ]}
        >
          {label}
        </Text>
      );
    },
    [appLanguage, strings, tokens.mutedForeground],
  );
  const renderAvailableSourceRow = useCallback(
    ({
      item: source,
    }: SectionListRenderItemInfo<MobileRegistrySource, AvailableSourceSection>) => {
      const key = makeSourceKey(source.registryId, source.id);
      return (
        <AvailableSourceRow
          source={source}
          strings={strings}
          installed={installedKeys.has(key)}
          busy={activeInstallKey === key}
          installLocked={activeInstallKey !== null && activeInstallKey !== key}
          onInstall={handleInstallSource}
        />
      );
    },
    [activeInstallKey, handleInstallSource, installedKeys, strings],
  );

  const runConfirmedAction = () => {
    if (!confirmation) return;
    const source = confirmation.source;
    setConfirmation(null);
    void installSource(source);
  };

  const refreshSources = async () => {
    if (refreshGuardRef.current || activeInstallKey !== null) return;

    refreshGuardRef.current = true;
    setRefreshingSources(true);
    setActionError(null);
    try {
      await Promise.all([installed.reload(), available.reload()]);
      await hapticConfirm();
    } catch (error) {
      await hapticError();
      setActionError({
        title: strings.browse.sourcesUnavailable,
        detail: sourceActionErrorMessage(error, strings),
      });
    } finally {
      refreshGuardRef.current = false;
      setRefreshingSources(false);
    }
  };

  const toggleLanguage = (language: string) => {
    setSelectedLanguages((current) => {
      const next = new Set(current);
      if (next.has(language)) {
        next.delete(language);
      } else {
        next.add(language);
      }
      return next;
    });
  };

  const clearSourceQuery = () => {
    if (!canClearMobileBrowseSourceQuery(query)) return;
    setQuery("");
    void hapticPress();
  };
  const openAddSourceSheet = () => {
    // A registry query is useful only for the current sheet visit. Keeping it
    // after installing or dismissing a source makes a later visit look empty
    // until the user notices and clears the stale filter.
    setQuery("");
    setActiveSheet("add-source");
  };
  const closeAddSourceSheet = () => {
    setActiveSheet(null);
  };
  const openLanguageSheet = () => {
    setActiveSheet("source-language");
  };
  const closeLanguageSheet = () => {
    setAddSourceSheetKey((key) => key + 1);
    setActiveSheet(null);
    requestAnimationFrame(() => {
      setActiveSheet("add-source");
    });
  };
  const nativeHeaderActions: NemuNativeHeaderAction[] = [
    {
      icon: "plus",
      label: strings.browse.addSources,
      disabled: activeInstallKey !== null,
      onPress: openAddSourceSheet,
    },
  ];

  return (
    <>
      {usesNativeHeader ? (
        <>
          <Stack.Screen
            options={createNemuNativeScreenOptions(tokens, strings.nav.browse)}
          />
          <Stack.Toolbar placement="right" tintColor={tokens.primary}>
            {renderNemuNativeToolbarButtons(
              nativeHeaderActions,
              tokens.primary,
            )}
          </Stack.Toolbar>
        </>
      ) : null}
      <PageScaffold
        nativeHeader={usesNativeHeader}
        onRefresh={() => {
          void refreshSources();
        }}
        refreshDisabled={refreshDisabled}
        refreshLabel={strings.browse.refreshSources}
        refreshing={refreshingSources}
      >
        {usesNativeHeader ? null : (
          <PageHeader
            title={strings.nav.browse}
            loading={loading || refreshingSources}
            actions={[
              {
                icon: "add-outline",
                label: strings.browse.addSources,
                onPress: openAddSourceSheet,
                color: tokens.primary,
              },
            ]}
          />
        )}

        {error ? (
          <EmptyLibrary
            title={strings.browse.sourcesUnavailable}
            description={error}
            actionLabel={strings.common.retry}
            actionDisabled={refreshDisabled}
            actionLoading={refreshingSources}
            onActionPress={() => {
              void refreshSources();
            }}
          />
        ) : showSkeleton ? (
          <MobileBrowseSkeleton
            accessibilityLabel={strings.welcome.loadingSources}
          />
        ) : (
          <View style={styles.sections}>
            {actionError ? (
              <MobileInlineErrorBanner
                title={actionError.title}
                detail={actionError.detail}
                dismissLabel={strings.common.clear}
                onDismiss={() => setActionError(null)}
              />
            ) : null}
            {showSourceUpdateNotice &&
            sourceUpdateNotice &&
            sourceUpdateMessage ? (
              <MobileInlineErrorBanner
                title={strings.settings.sourcesUpdatedTitle}
                detail={sourceUpdateMessage}
                dismissLabel={strings.common.clear}
                iconName="checkmark-circle-outline"
                tone="success"
                onDismiss={() =>
                  setDismissedSourceUpdateNoticeId(sourceUpdateNotice.id)
                }
              />
            ) : null}

            <View>
              {!usesNativeHeader && installedSources.length > 0 ? (
                <View style={styles.sourceHeader}>
                  <NemuButton
                    accessibilityLabel={strings.browse.addSources}
                    icon="add-outline"
                    label={strings.browse.addSources}
                    onPress={openAddSourceSheet}
                    variant="default"
                  />
                </View>
              ) : null}
              {installedSources.length ? (
                <View style={styles.availableList}>
                  {groupedInstalledSources.map((section) => {
                    const label = formatSourceLanguageLabel(
                      section.label,
                      strings,
                      appLanguage,
                    );
                    return (
                      <View
                        key={section.label}
                        style={styles.sourceLanguageSection}
                      >
                        <Text
                          style={[
                            styles.sourceLanguageHeader,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {label}
                        </Text>
                        <View style={styles.list}>
                          {section.sources.map((source) =>
                            source.unsupported ? (
                              <UnsupportedSourceRow
                                key={source.id}
                                source={source}
                                strings={strings}
                                onPress={() => {
                                  router.push(sourceSettingsHref(source));
                                }}
                              />
                            ) : (
                              <SourceCard
                                key={source.id}
                                item={source}
                                onLongPress={() => {
                                  router.push(sourceSettingsHref(source));
                                }}
                              />
                            ),
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <MobilePageEmpty
                  icon="globe-outline"
                  title={strings.browse.noSources}
                  description={strings.browse.noSourcesDescription}
                  actionLabel={strings.browse.addSource}
                  onActionPress={openAddSourceSheet}
                />
              )}
            </View>
          </View>
        )}
      </PageScaffold>

      {activeSheet === "add-source" ? (
        <MobileNativeSheetScaffold
          key={`add-source-${addSourceSheetKey}`}
          visible
          onClose={closeAddSourceSheet}
          title={strings.browse.addSources}
          dismissLabel={strings.common.done}
          snapPoints={["88%"]}
          fillContent
          contentBottomInset={0}
          contentStyle={styles.addSourceSheet}
          testID="AddSourceSheet"
        >
          <View style={styles.addSourceSheetBody}>
            <View
              style={[
                styles.searchShell,
                {
                  backgroundColor: tokens.card,
                  borderColor: tokens.border,
                },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={tokens.mutedForeground}
              />
              <TextInput
                accessibilityLabel={strings.browse.searchRegistries}
                accessibilityRole="search"
                autoCapitalize="none"
                autoCorrect={false}
                enterKeyHint="search"
                value={query}
                onChangeText={setQuery}
                placeholder={strings.browse.searchRegistries}
                placeholderTextColor={tokens.mutedForeground}
                returnKeyType="search"
                selectionColor={tokens.primary}
                style={[styles.searchInput, { color: tokens.foreground }]}
              />
              {canClearMobileBrowseSourceQuery(query) ? (
                <NemuPressable
                  accessibilityLabel={strings.common.clear}
                  accessibilityRole="button"
                  onPress={clearSourceQuery}
                  pressedScale={0.94}
                  style={[
                    styles.clearButton,
                    { backgroundColor: tokens.muted },
                  ]}
                >
                  <Ionicons
                    name="close-outline"
                    size={17}
                    color={tokens.mutedForeground}
                  />
                </NemuPressable>
              ) : null}
            </View>

            <View style={styles.sheetFilterControls}>
              <LanguageFilterMenu
                languages={languageOptions}
                selectedLanguages={selectedLanguages}
                strings={strings}
                appLanguage={appLanguage}
                onOpenLanguageList={openLanguageSheet}
              />
              <NemuPressable
                accessibilityLabel={strings.browse.adultSourcesSwitch}
                accessibilityRole="switch"
                accessibilityState={{ checked: showAdult }}
                buttonDepth={showAdult ? "primary" : "secondary"}
                hapticFeedback="selection"
                onPress={() => setShowAdult((value) => !value)}
                style={styles.adultToggle}
              >
                <Ionicons
                  name={showAdult ? "eye-outline" : "eye-off-outline"}
                  size={16}
                  color={
                    showAdult
                      ? tokens.primaryForeground
                      : tokens.mutedForeground
                  }
                />
              </NemuPressable>
            </View>

            <SectionList
              alwaysBounceVertical={false}
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              initialNumToRender={18}
              maxToRenderPerBatch={18}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              sections={availableSourceSections}
              keyExtractor={availableSourceKeyExtractor}
              renderSectionHeader={renderAvailableSectionHeader}
              renderItem={renderAvailableSourceRow}
              ItemSeparatorComponent={AvailableRowSeparator}
              SectionSeparatorComponent={AvailableSectionSeparator}
              ListEmptyComponent={
                <View
                  style={[
                    styles.inlineEmpty,
                    {
                      backgroundColor: tokens.card,
                      borderColor: tokens.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="filter-outline"
                    size={22}
                    color={tokens.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.inlineEmptyText,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {strings.browse.noSourceResults}
                  </Text>
                </View>
              }
              style={styles.availableListScroller}
              contentContainerStyle={styles.availableListContent}
              stickySectionHeadersEnabled={false}
              updateCellsBatchingPeriod={32}
              windowSize={7}
            />
          </View>
        </MobileNativeSheetScaffold>
      ) : null}

      {activeSheet === "source-language" ? (
        <MobileNativeSheetScaffold
          visible
          onClose={closeLanguageSheet}
          title={strings.browse.languageFilter}
          dismissLabel={strings.common.done}
          snapPoints={["82%"]}
          scroll
          scrollContentBottomInset={18}
          contentStyle={styles.languageSheet}
          testID="SourceLanguageSheet"
        >
          <LanguageFilterSheetSection
            languages={languageOptions}
            selectedLanguages={selectedLanguages}
            strings={strings}
            appLanguage={appLanguage}
            onSelectAll={() => setSelectedLanguages(new Set())}
            onToggleLanguage={toggleLanguage}
          />
        </MobileNativeSheetScaffold>
      ) : null}

      {confirmationDetails ? (
        <MobileConfirmationSheet
          visible
          title={confirmationDetails.title}
          description={confirmationDetails.description}
          subject={confirmationDetails.subject}
          iconName={confirmationDetails.iconName}
          cancelLabel={strings.common.cancel}
          confirmLabel={confirmationDetails.confirmLabel}
          confirmAccessibilityLabel={
            confirmationDetails.confirmAccessibilityLabel
          }
          loading={confirmationDetails.loading}
          destructive={confirmationDetails.destructive}
          onCancel={() => setConfirmation(null)}
          onConfirm={runConfirmedAction}
        >
          {actionError ? (
            <MobileInlineErrorBanner
              title={actionError.title}
              detail={actionError.detail}
              dismissLabel={strings.common.clear}
              onDismiss={() => setActionError(null)}
            />
          ) : null}
        </MobileConfirmationSheet>
      ) : null}

      <MobileSourceInstallSheet
        visible={activeInstallKey !== null}
        title={
          activeInstallSourceName
            ? formatMobileString(strings.browse.installingSourceDescription, {
                name: activeInstallSourceName,
              })
            : strings.browse.installingSourceDescriptionGeneric
        }
        sourceIcon={activeInstallSource?.icon}
        onCancel={installer.cancelInstall}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: 26,
  },
  addSourceSheet: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  addSourceSheetBody: {
    flex: 1,
    minHeight: 0,
    gap: 14,
  },
  languageSheet: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  sheetFilterControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sourceHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  availableList: {
    gap: 18,
  },
  availableListScroller: {
    flex: 1,
    minHeight: 0,
  },
  availableListContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  availableRowSeparator: {
    height: 12,
  },
  availableSectionSeparator: {
    height: 18,
  },
  availableSourceLanguageHeader: {
    marginBottom: 8,
  },
  sourceLanguageSection: {
    gap: 8,
  },
  unsupportedSourceRow: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  unsupportedSourceIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  unsupportedSourceText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  unsupportedSourceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  unsupportedSourceTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  unsupportedSourceBadge: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  unsupportedSourceBadgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
    textTransform: "uppercase",
  },
  unsupportedSourceSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  sourceLanguageHeader: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
    textTransform: "uppercase",
  },
  inlineEmpty: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  inlineEmptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  searchShell: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
  },
  clearButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  adultToggle: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    overflow: "hidden",
  },
  languageFallbackButton: {
    alignSelf: "flex-start",
    maxWidth: 220,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    overflow: "hidden",
  },
  languageFallbackText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  languageListSection: {
    borderRadius: radius.xl,
  },
  languageListContent: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  languageOptionRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  languageOptionText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  languageOptionAccessory: {
    width: 24,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  availableShell: {
    height: 74,
    flexShrink: 0,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  availableRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  sourceIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.lg,
  },
  sourceIconImage: {
    width: "100%",
    height: "100%",
  },
  availableText: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sourceTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  sourceWarningIcon: {
    width: 18,
    height: 22,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceVersionText: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sourceSubtitle: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.regular,
  },
  installStatus: {
    width: 112,
    minHeight: 32,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  installText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  sourceInstallButton: {
    width: 112,
    flexShrink: 0,
  },
  sourceInstallButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
});
