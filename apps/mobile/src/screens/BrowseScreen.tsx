import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, router, type Href } from "expo-router";
import {
  Linking,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type SectionListData,
  type SectionListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileBrowseSkeleton } from "@/components/MobileBrowseSkeleton";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileInlineToast } from "@/components/MobileInlineToast";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { MobileSourceQuickSettingsSheet } from "@/components/MobileSourceQuickSettingsSheet";
import {
  QuickActionSheet,
  type QuickAction,
} from "@/components/QuickActionSheet";
import { useMobileToast } from "@/components/MobileToastContext";
import {
  NemuButton,
  GlassSurface,
  MobileCachedImage,
  MobileChip,
  MobileNativeSheetScaffold,
  NemuNativeSearchField,
  NemuNativeSheetHeaderAction,
  NemuNativeSwitch,
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
import type { AppLanguage, InstalledSource } from "@/data/schema";
import {
  hapticConfirm,
  hapticError,
  hapticSelection,
} from "@/lib/haptics";
import { prefetchCachedMobileImages } from "@/lib/mobileImageCache";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { resolveMobileSheetHeaderMetrics } from "@/lib/mobileNativeSheet";
import {
  buildMobileInstalledSourceKeySet,
  canSelectMobileBrowseAllLanguages,
  canStartMobileSourceInstall,
  filterMobileAvailableSources,
  getMobileAvailableSourceLanguageOptions,
  getMobileSourceInstallHandoff,
  getMobileSourceInstallResultAction,
  getMobileSourceQuickActionHandoff,
  getMobileSourceWarningAccessibilityLabel,
  getMobileSourceWarningMessages,
  groupMobileSourcesByLanguage,
  isMobileUnsupportedInstalledSource,
  mergeMobileInstalledSourceRegistryMetadata,
  shouldRenderMobileBrowseSkeleton,
  shouldReopenMobileAddSourceSheetAfterInstall,
  type MobileSourceQuickActionId,
} from "@/lib/mobileBrowseSources";
import { getMobileInstalledSourceRegistryRef } from "@/lib/mobileInstalledSourceKeys";
import { getMobileInstalledSourceName } from "@/lib/mobileInstalledSourcePresentation";
import { normalizeMobileSourceExternalUrl } from "@/lib/mobileSourceExternalUrl";
import {
  buildMobileSourceIconIndex,
  resolveMobileInstalledSourceIconUri,
} from "@/lib/mobileSourceIconResolution";
import { findMobileSourceUpdates } from "@/lib/mobileSourceUpdates";
import {
  getMobileSourceErrorPresentation,
  sanitizeMobileErrorDiagnostic,
  splitMobileInlineErrorDetail,
} from "@/lib/mobileSourceErrors";
import {
  formatMobileLanguageDisplayName,
  sortSourcesByLanguagePriority,
} from "@/lib/mobileLanguageSettings";
import {
  markMobilePerformance,
  measureMobilePerformance,
} from "@/lib/mobilePerformance";
import {
  makeSourceKey,
  type MobileRegistrySource,
} from "@/sources/aidokuRegistry";

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

type AddSourceDismissAction =
  | { type: "open-language" }
  | { type: "open-confirmation"; confirmation: BrowseConfirmation }
  | { type: "start-install"; source: MobileRegistrySource };

/**
 * Only one native `@expo/ui` bottom sheet can be presented at a time, so the
 * quick-action rows queue their destination here and the sheet's post-dismiss
 * callback performs it. See `getMobileSourceQuickActionHandoff`.
 */
type SourceQuickActionDismissAction =
  | { type: "open-settings" }
  | { type: "confirm-uninstall"; source: InstalledSource }
  | { type: "install-update"; source: MobileRegistrySource };

type ConfirmationDismissAction =
  | { type: "reopen-add-source" }
  | { type: "start-install"; source: MobileRegistrySource };

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
            style={[
              styles.unsupportedSourceTitle,
              { color: tokens.foreground },
            ]}
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
  appLanguage: AppLanguage,
): string {
  return formatMobileLanguageDisplayName(language, appLanguage, {
    multi: strings.sourceBrowse.multiLanguage,
    other: strings.browse.otherLanguages,
  });
}

function formatLanguageSelectionLabel(
  selectedLanguages: Set<string>,
  strings: MobileStrings,
  appLanguage: AppLanguage,
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

function sourceActionErrorPresentation(
  error: unknown,
  strings: MobileStrings,
): SourceActionError {
  const presentation = getMobileSourceErrorPresentation(error, strings);
  return { title: presentation.title, detail: presentation.detail };
}

function colorWithOpacity(color: string, opacity: number) {
  const hexMatch = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hexMatch) return color;

  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${color}${alpha}`;
}

function formatCatalogCacheAge(savedAt: number | null, appLanguage: string): string | null {
  if (!savedAt || savedAt > Date.now()) return null;
  const elapsedMinutes = Math.max(1, Math.round((Date.now() - savedAt) / 60_000));
  const locale = appLanguage === "zh" ? "zh-CN" : appLanguage === "ja" ? "ja-JP" : "en-US";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedMinutes < 60) return formatter.format(-elapsedMinutes, "minute");
  const hours = Math.round(elapsedMinutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

/**
 * One removable active filter: the shared chip primitive's `toggle` variant in
 * its selected (plain primary surface) state, with a trailing `close` glyph.
 * Same pill as the Search tab's source chips.
 */
function ActiveFilterChip({
  label,
  removeLabel,
  onPress,
}: {
  label: string;
  removeLabel: string;
  onPress: () => void;
}) {
  return (
    <MobileChip
      accessibilityLabel={`${removeLabel} ${label}`}
      accessibilityRole="button"
      label={label}
      onPress={onPress}
      selected
      trailingIcon="close"
      variant="toggle"
    />
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
  showAdult,
  onToggleAdult,
}: {
  languages: string[];
  selectedLanguages: Set<string>;
  strings: MobileStrings;
  appLanguage: AppLanguage;
  onSelectAll: () => void;
  onToggleLanguage: (language: string) => void;
  showAdult: boolean;
  onToggleAdult: () => void;
}) {
  const { tokens } = useNemuTheme();
  const visibleLanguages = languages.filter((language) => language !== "all");
  const allLanguagesSelected = selectedLanguages.size === 0;
  const pinnedLanguages = visibleLanguages.filter(
    (language) => language === "multi",
  );
  const listLanguages = visibleLanguages.filter(
    (language) => language !== "multi",
  );

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
      {/*
        The explicit-content toggle is a settings row, not a language option,
        so it gets its own card group under the language groups. Every child
        rides one centre line — fixed-height icon tile, copy block, and the
        switch in a box as tall as the switch itself — so nothing sits offset
        or tilted inside the row.
      */}
      {/*
        A plain card, not GlassSurface: the native switch is a SwiftUI host,
        and inside expo-blur's UIVisualEffectView it renders several points
        above its layout box. The settings card uses the same plain surface
        and its switches sit on the row's centre line.
      */}
      <View
        style={[
          styles.languageListSection,
          styles.adultToggleCard,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <View style={styles.adultToggleRow}>
          <View style={styles.adultToggleIcon}>
            <Ionicons name="eye-outline" size={22} color={tokens.primary} />
          </View>
          <View style={styles.adultToggleCopy}>
            <Text
              numberOfLines={1}
              style={[
                styles.adultToggleTitle,
                { color: tokens.foreground },
              ]}
            >
              {strings.browse.adult}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.adultToggleSubtitle,
                { color: tokens.mutedForeground },
              ]}
            >
              {strings.browse.adultSourcesDescription}
            </Text>
          </View>
          <View style={styles.adultToggleAccessory}>
            <NemuNativeSwitch
              accessibilityLabel={strings.browse.adultSourcesSwitch}
              value={showAdult}
              onValueChange={onToggleAdult}
            />
          </View>
        </View>
      </View>
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
                  color={tokens.warning}
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
            <Text
              style={[styles.installText, { color: tokens.mutedForeground }]}
            >
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

/**
 * `SectionList` renders a section separator on both sides of a header. A header
 * belongs to the rows beneath it, so only the gap that follows the previous
 * group's last card gets the 18pt of air; the 8pt under the header comes from
 * the header's own margin. The first header keeps the list's padding only,
 * because nothing leads it.
 */
function AvailableSectionSeparator({
  leadingItem,
}: {
  leadingItem?: MobileRegistrySource;
}) {
  if (leadingItem === undefined) return null;
  return <View style={styles.availableSectionSeparator} />;
}

/**
 * The Add Sources sheet sizes its iOS detent to its content instead of
 * parking a blank tail under a short (or filtered) list:
 *
 *   scaffold header chrome + the scaffold body's top padding + the sheet's
 *   own header stack + the measured list content + corner clearance
 *
 * The list's own 24pt bottom padding is already inside the measured content,
 * so the clearance is pure extra tail (~36pt total under the last row) —
 * enough air above the screen's rounded corners when scrolled to the very
 * bottom. The detent clamps to `[320, 88%]` of the scaffold's available
 * height (`windowHeight - insets.top - insets.bottom`, mirroring
 * `MobileNativeSheetScaffold`); longer catalogs stay at the ceiling and
 * scroll inside the sheet (`fillContent`).
 */
const ADD_SOURCE_SHEET_MAX_DETENT_FRACTION = 0.88;
const ADD_SOURCE_SHEET_MIN_DETENT = 320;
const ADD_SOURCE_SHEET_CORNER_CLEARANCE = 12;

export function BrowseScreen() {
  const { tokens } = useNemuTheme();
  const [query, setQuery] = useState("");
  const [showAdult, setShowAdult] = useState(false);
  const [activeSheet, setActiveSheet] = useState<BrowseSheet | null>(null);
  const [activeSheetVisible, setActiveSheetVisible] = useState(false);
  const addSourceDismissActionRef = useRef<AddSourceDismissAction | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(
    () => new Set(),
  );
  const [confirmation, setConfirmation] = useState<BrowseConfirmation | null>(
    null,
  );
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const confirmationDismissActionRef =
    useRef<ConfirmationDismissAction | null>(null);
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
  const toast = useMobileToast();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = usesNemuNativeHeader;

  const installedKeys = useMemo(
    () => buildMobileInstalledSourceKeySet(installed.data),
    [installed.data],
  );

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

  // Long-press quick actions for an installed source. Kept next to the card
  // that opens them; a short press still routes into the source.
  const [quickActionSourceId, setQuickActionSourceId] = useState<string | null>(
    null,
  );
  const [quickActionVisible, setQuickActionVisible] = useState(false);
  const [quickActionSettingsVisible, setQuickActionSettingsVisible] =
    useState(false);
  const [quickActionUninstall, setQuickActionUninstall] =
    useState<InstalledSource | null>(null);
  const [quickActionUninstallVisible, setQuickActionUninstallVisible] =
    useState(false);
  const [uninstallingSourceId, setUninstallingSourceId] = useState<
    string | null
  >(null);
  const quickActionDismissRef = useRef<SourceQuickActionDismissAction | null>(
    null,
  );
  // `installSource` is declared further down; the quick-action handoff runs
  // long after this render, so it reaches the latest closure through a ref.
  const installSourceRef = useRef<
    ((source: MobileRegistrySource) => Promise<void>) | null
  >(null);
  const mergedInstalledSources = useMemo(
    () =>
      mergeMobileInstalledSourceRegistryMetadata(installed.data, available.data),
    [available.data, installed.data],
  );
  const quickActionSource = useMemo(
    () =>
      quickActionSourceId
        ? (mergedInstalledSources.find(
            (source) => source.id === quickActionSourceId,
          ) ?? null)
        : null,
    [mergedInstalledSources, quickActionSourceId],
  );
  const quickActionUpdate = useMemo(
    () =>
      quickActionSource
        ? (findMobileSourceUpdates([quickActionSource], available.data)[0] ??
          null)
        : null,
    [available.data, quickActionSource],
  );
  const quickActionHomepage = useMemo(() => {
    for (const url of quickActionSource?.packageMetadata?.urls ?? []) {
      const normalized = normalizeMobileSourceExternalUrl(url);
      if (normalized) return normalized;
    }
    return null;
  }, [quickActionSource]);
  // Passing the raw catalog rebuilt the icon index on every render of this
  // screen; the same join Settings keeps memoized.
  const sourceIconIndex = useMemo(
    () => buildMobileSourceIconIndex(available.data),
    [available.data],
  );
  const quickActionIconUri = quickActionSource
    ? resolveMobileInstalledSourceIconUri(quickActionSource, sourceIconIndex)
    : null;

  // `MobileNativeSheetScaffold` fires `onClose` *and then* `onDismiss` from the
  // same native close. This handler is the `onClose` half, so it must never
  // touch the queued handoff — clearing it here would wipe the destination one
  // statement before `handleQuickActionsDismissed` reads it.
  const closeQuickActions = useCallback(() => {
    setQuickActionVisible(false);
  }, []);

  const requestQuickActionDismissal = useCallback(
    (next: SourceQuickActionDismissAction) => {
      // Native dismissal is asynchronous. The first accepted tap owns this
      // visibility cycle so a second row cannot replace its queued destination.
      if (quickActionDismissRef.current) return;
      quickActionDismissRef.current = next;
      setQuickActionVisible(false);
    },
    [],
  );

  const handleQuickActionsDismissed = useCallback(() => {
    const next = quickActionDismissRef.current;
    quickActionDismissRef.current = null;
    if (next?.type === "open-settings") {
      setQuickActionSettingsVisible(true);
      return;
    }
    if (next?.type === "confirm-uninstall") {
      setQuickActionUninstall(next.source);
      setQuickActionUninstallVisible(true);
      return;
    }
    if (next?.type === "install-update") {
      // The install raises a sticky progress toast, and the toast host sits
      // under the native sheet; starting it only after the dismissal keeps
      // that progress visible.
      const source = next.source;
      setQuickActionSourceId(null);
      void installSourceRef.current?.(source);
      return;
    }
    setQuickActionSourceId(null);
  }, []);

  const runQuickActionUninstall = useCallback(async () => {
    const source = quickActionUninstall;
    if (!source || uninstallingSourceId) return;
    const { registryId, sourceId } = getMobileInstalledSourceRegistryRef(source);
    setUninstallingSourceId(source.id);
    try {
      await installer.uninstallSource({
        id: sourceId,
        registryId,
        registryName: registryId,
        name: getMobileInstalledSourceName(source),
        version: source.version,
      });
      await installed.reload();
      setQuickActionUninstallVisible(false);
      toast.show({
        id: `source-uninstall:${source.id}`,
        tone: "info",
        title: formatMobileString(strings.browse.uninstalledSource, {
          name: getMobileInstalledSourceName(source),
        }),
      });
      await hapticConfirm();
    } catch (error) {
      setQuickActionUninstallVisible(false);
      setActionError(sourceActionErrorPresentation(error, strings));
      await hapticError();
    } finally {
      setUninstallingSourceId((current) =>
        current === source.id ? null : current,
      );
    }
  }, [
    installed,
    installer,
    quickActionUninstall,
    strings,
    toast,
    uninstallingSourceId,
  ]);

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
  // Registry discovery enriches the Add Source sheet, but it must never hide
  // already-installed sources on the main Browse screen.
  const error = installed.error;
  const errorPresentation = useMemo(
    () => (error ? getMobileSourceErrorPresentation(error, strings) : null),
    [error, strings],
  );
  // The presentation `detail` follows the error-copy contract: localized copy
  // first, sanitized exception text second. The full-page state renders those
  // as two separate affordances instead of one run-on paragraph.
  const errorCopy = useMemo(() => {
    if (!error || !errorPresentation) return null;
    const split = splitMobileInlineErrorDetail(errorPresentation.detail);
    return {
      description: split.description,
      diagnostic: split.diagnostic ?? sanitizeMobileErrorDiagnostic(error),
    };
  }, [error, errorPresentation]);
  const showSkeleton = shouldRenderMobileBrowseSkeleton({
    loading,
    installedCount: installed.data.length,
    availableCount: available.data.length,
    hasError: Boolean(error),
  });
  const activeInstallKey = pendingInstallKey ?? installer.installingKey;
  const refreshDisabled = refreshingSources || activeInstallKey !== null;
  const catalogCacheAge = formatCatalogCacheAge(
    available.catalogCachedAt,
    appLanguage,
  );
  const selectedFilterLabel = formatLanguageSelectionLabel(
    selectedLanguages,
    strings,
    appLanguage,
  );
  const activeFilterCount = selectedLanguages.size + (showAdult ? 1 : 0);

  // Measured Add Sources sheet detent (iOS). Both inputs come from the
  // sheet's own layout: the header stack's `onLayout` and the list's
  // `onContentSizeChange`, which reports natural content height because the
  // list's content container does not stretch (`availableListContent` opts
  // out of `flexGrow` for exactly this reason). Until the first measurement
  // lands, the detent stays at the 88% ceiling so the snap-point prop is
  // always a one-element numeric array — iOS animates numeric detent changes
  // in place, but it must never see `undefined` swap in for the array.
  const [
    addSourceHeaderStackHeight,
    setAddSourceHeaderStackHeight,
  ] = useState(0);
  const [
    addSourceListContentHeight,
    setAddSourceListContentHeight,
  ] = useState(0);
  const addSourceSheetSnapPoint = useMemo(() => {
    const metrics = resolveMobileSheetHeaderMetrics(Platform.OS);
    const maxDetent = Math.round(
      ADD_SOURCE_SHEET_MAX_DETENT_FRACTION *
        (windowHeight - insets.top - insets.bottom),
    );
    const measuredDetent =
      metrics.minimumHeight +
      metrics.bodyTopPadding +
      addSourceHeaderStackHeight +
      addSourceListContentHeight +
      ADD_SOURCE_SHEET_CORNER_CLEARANCE;
    const detent =
      addSourceHeaderStackHeight > 0 && addSourceListContentHeight > 0
        ? measuredDetent
        : maxDetent;
    return Math.min(
      Math.max(Math.round(detent), ADD_SOURCE_SHEET_MIN_DETENT),
      maxDetent,
    );
  }, [
    addSourceHeaderStackHeight,
    addSourceListContentHeight,
    insets.bottom,
    insets.top,
    windowHeight,
  ]);
  const handleAddSourceHeaderStackLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      setAddSourceHeaderStackHeight((currentHeight) =>
        currentHeight === nextHeight ? currentHeight : nextHeight,
      );
    },
    [],
  );
  // A virtualized list re-reports its content height on every render batch,
  // and each report re-ran the detent memo and re-rendered the sheet. The
  // detent only needs one number: the first measurement wins and the next
  // dismissal clears it for the next open.
  const handleAvailableListContentSizeChange = useCallback(
    (_contentWidth: number, contentHeight: number) => {
      const nextHeight = Math.ceil(contentHeight);
      setAddSourceListContentHeight((currentHeight) =>
        currentHeight > 0 ? currentHeight : nextHeight,
      );
    },
    [],
  );

  const restoreAddSourceSheet = useCallback(() => {
    setActiveSheet("add-source");
    setActiveSheetVisible(true);
  }, []);

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

  const installSource = async (
    source: MobileRegistrySource,
  ): Promise<void> => {
    const key = makeSourceKey(source.registryId, source.id);
    const guardedInstallKey =
      installGuardKeyRef.current ?? installer.installingKey;
    if (!canStartMobileSourceInstall(key, guardedInstallKey)) return;

    installGuardKeyRef.current = key;
    setPendingInstallKey(key);
    setActionError(null);
    const installToastId = `source-install:${key}`;
    toast.show({
      id: installToastId,
      title: formatMobileString(strings.browse.installingSourceDescription, {
        name: source.name,
      }),
      loading: true,
      duration: "sticky",
      action: {
        label: strings.common.cancel,
        onPress: installer.cancelInstall,
      },
    });
    const installStartedAt = markMobilePerformance("source.install.start", {
      key,
      name: source.name,
    });
    try {
      if (source.icon) {
        void prefetchCachedMobileImages([{ uri: source.icon }]);
      }
      await installer.installSource(source);
      measureMobilePerformance("source.install.package", installStartedAt, {
        key,
      });
      // The package is usable as soon as the local installed-source store has
      // reloaded. Registry discovery is remote enrichment and may run until the
      // native HTTP timeout; it must not leave a completed install behind a
      // misleading spinner.
      await installed.reload();
      void available.reload().catch(() => undefined);
      measureMobilePerformance("source.install.complete", installStartedAt, {
        key,
      });
      if (
        getMobileSourceInstallResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        setConfirmation(null);
      }
      toast.show({
        id: installToastId,
        tone: "success",
        title: formatMobileString(strings.browse.installedSource, {
          name: source.name,
        }),
      });
      await hapticConfirm();
    } catch (error) {
      // A user-requested cancel is not a failure; remove the progress toast.
      if (isMobileSourceInstallCancellation(error)) {
        setConfirmation(null);
        toast.dismiss(installToastId);
        return;
      }
      await hapticError();
      if (
        getMobileSourceInstallResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        setConfirmation(null);
      }
      const presentation = sourceActionErrorPresentation(error, strings);
      setActionError(presentation);
      toast.show({
        id: installToastId,
        tone: "danger",
        title: presentation.title,
        detail: presentation.detail,
        action: {
          label: strings.common.retry,
          onPress: () => {
            void installSource(source);
          },
        },
      });
    } finally {
      if (installGuardKeyRef.current === key) {
        installGuardKeyRef.current = null;
      }
      setPendingInstallKey((current) => (current === key ? null : current));
    }
  };

  const startInstallAfterAddSourceDismissal = (
    source: MobileRegistrySource,
  ) => {
    const key = makeSourceKey(source.registryId, source.id);
    const guardedInstallKey =
      installGuardKeyRef.current ?? installer.installingKey;
    // The sheet stays closed either way: the running install already owns a
    // sticky progress toast, and re-presenting the sheet would cover it.
    if (shouldReopenMobileAddSourceSheetAfterInstall()) {
      restoreAddSourceSheet();
    }
    if (!canStartMobileSourceInstall(key, guardedInstallKey)) return;

    void installSource(source);
  };

  const requestAddSourceDismissal = (next: AddSourceDismissAction) => {
    // Native dismissal is asynchronous. The first accepted tap owns this
    // visibility cycle so a second row cannot replace its queued destination.
    if (addSourceDismissActionRef.current) return;
    addSourceDismissActionRef.current = next;
    setActiveSheetVisible(false);
  };

  const confirmInstallSource = (source: MobileRegistrySource) => {
    setActionError(null);
    const warnings = getMobileSourceWarningMessages(source, strings.browse);
    // Install always dismisses the sheet first: the toast host sits under the
    // native sheet, so a progress toast raised behind it is invisible until
    // the sheet is closed by hand.
    if (
      getMobileSourceInstallHandoff({ warningCount: warnings.length }) ===
      "install-after-dismiss"
    ) {
      requestAddSourceDismissal({ type: "start-install", source });
      return;
    }

    requestAddSourceDismissal({
      type: "open-confirmation",
      confirmation: { type: "install-warning", source, warnings },
    });
  };
  const confirmInstallSourceRef = useRef(confirmInstallSource);
  useEffect(() => {
    confirmInstallSourceRef.current = confirmInstallSource;
    installSourceRef.current = installSource;
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
      const label = formatSourceLanguageLabel(
        section.label,
        strings,
        appLanguage,
      );
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
    }: SectionListRenderItemInfo<
      MobileRegistrySource,
      AvailableSourceSection
    >) => {
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
    if (confirmationDismissActionRef.current) return;
    confirmationDismissActionRef.current = {
      type: "start-install",
      source: confirmation.source,
    };
    setConfirmationVisible(false);
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
      setActionError(sourceActionErrorPresentation(error, strings));
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

  const openAddSourceSheet = () => {
    // A registry query is useful only for the current sheet visit. Keeping it
    // after installing or dismissing a source makes a later visit look empty
    // until the user notices and clears the stale filter.
    setQuery("");
    addSourceDismissActionRef.current = null;
    setActiveSheet("add-source");
    setActiveSheetVisible(true);
  };
  const closeAddSourceSheet = () => {
    setActiveSheetVisible(false);
  };
  const handleAddSourceSheetDismissed = () => {
    const next = addSourceDismissActionRef.current;
    addSourceDismissActionRef.current = null;
    setActiveSheet(null);
    setActiveSheetVisible(false);
    setAddSourceListContentHeight(0);

    if (next?.type === "open-language") {
      setActiveSheet("source-language");
      setActiveSheetVisible(true);
      return;
    }
    if (next?.type === "start-install") {
      startInstallAfterAddSourceDismissal(next.source);
      return;
    }
    if (next?.type === "open-confirmation") {
      // Leave the destination unclaimed while the confirmation is visible.
      // Its first Cancel or Confirm tap owns the handoff; a native dismissal
      // falls back to reopening Add Source in the post-dismiss callback.
      confirmationDismissActionRef.current = null;
      setConfirmation(next.confirmation);
      setConfirmationVisible(true);
      return;
    }
  };
  const openLanguageSheet = () => {
    requestAddSourceDismissal({ type: "open-language" });
  };
  const closeLanguageSheet = () => {
    setActiveSheetVisible(false);
  };
  const handleLanguageSheetDismissed = () => {
    restoreAddSourceSheet();
  };
  const cancelInstallConfirmation = () => {
    if (confirmationDismissActionRef.current) return;
    confirmationDismissActionRef.current = { type: "reopen-add-source" };
    setConfirmationVisible(false);
  };
  const handleInstallConfirmationDismissed = () => {
    const next = confirmationDismissActionRef.current ?? {
      type: "reopen-add-source" as const,
    };
    confirmationDismissActionRef.current = null;
    setConfirmation(null);
    setConfirmationVisible(false);

    if (next.type === "start-install") {
      startInstallAfterAddSourceDismissal(next.source);
      return;
    }
    restoreAddSourceSheet();
  };
  const runQuickAction = (action: MobileSourceQuickActionId) => {
    const source = quickActionSource;
    if (!source) return;
    switch (getMobileSourceQuickActionHandoff(action)) {
      case "dismiss-then-open-settings":
        requestQuickActionDismissal({ type: "open-settings" });
        return;
      case "dismiss-then-install-update":
        if (!quickActionUpdate) return;
        requestQuickActionDismissal({
          type: "install-update",
          source: quickActionUpdate,
        });
        return;
      case "dismiss-then-confirm-uninstall":
        requestQuickActionDismissal({ type: "confirm-uninstall", source });
        return;
      case "open-url": {
        if (!quickActionHomepage) return;
        // Leaving the app is the one destination that does not need the sheet
        // gone first, so it opens directly and lets the sheet close behind it.
        const homepage = quickActionHomepage;
        closeQuickActions();
        void Linking.openURL(homepage).catch(() => undefined);
        return;
      }
    }
  };
  const quickActions = ((): QuickAction<MobileSourceQuickActionId>[] => {
    if (!quickActionSource) return [];
    const actions: QuickAction<MobileSourceQuickActionId>[] = [
      {
        id: "settings",
        label: strings.settings.sourceSettingsDefaultTitle,
        icon: "options-outline",
        onPress: () => runQuickAction("settings"),
      },
    ];
    if (quickActionUpdate) {
      actions.push({
        id: "update",
        label: formatMobileString(strings.browse.updateSourceToVersion, {
          version: quickActionUpdate.version,
        }),
        icon: "arrow-up-circle-outline",
        onPress: () => runQuickAction("update"),
      });
    }
    if (quickActionHomepage) {
      actions.push({
        id: "openInBrowser",
        label: strings.browse.openSourceHomepage,
        icon: "open-outline",
        onPress: () => runQuickAction("openInBrowser"),
      });
    }
    actions.push({
      id: "uninstall",
      label: strings.common.uninstall,
      icon: "trash-outline",
      destructive: true,
      onPress: () => runQuickAction("uninstall"),
    });
    return actions;
  })();


  const nativeHeaderActions: NemuNativeHeaderAction[] = [
    {
      icon: "plus",
      label: strings.browse.addSources,
      disabled: activeInstallKey !== null,
      onPress: openAddSourceSheet,
    },
    {
      icon: "square.stack.3d.up",
      label: strings.browse.manageSources,
      onPress: () => {
        router.push({
          pathname: "/(tabs)/settings/[section]",
          params: { section: "sources" },
        });
      },
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
            title={
              errorPresentation?.title ?? strings.browse.sourcesUnavailable
            }
            description={
              errorCopy?.description ?? strings.browse.sourcesUnavailable
            }
            diagnostic={errorCopy?.diagnostic ?? undefined}
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
                                  void hapticSelection();
                                  quickActionDismissRef.current = null;
                                  setQuickActionSourceId(source.id);
                                  setQuickActionVisible(true);
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
          visible={activeSheetVisible}
          onClose={closeAddSourceSheet}
          onDismiss={handleAddSourceSheetDismissed}
          title={strings.browse.addSources}
          dismissLabel={strings.common.done}
          dismissAsIcon
          headerLeading={
            <NemuNativeSheetHeaderAction
              accessibilityLabel={formatMobileString(
                strings.browse.languageFilterOption,
                { language: selectedFilterLabel },
              )}
              androidIcon="filter-outline"
              iosSystemImage="line.3.horizontal.decrease"
              badgeCount={activeFilterCount}
              onPress={() => {
                void hapticSelection();
                openLanguageSheet();
              }}
            />
          }
          snapPoints={
            Platform.OS === "android" ? ["100%"] : [addSourceSheetSnapPoint]
          }
          fillContent
          contentBottomInset={0}
          testID="AddSourceSheet"
        >
          <View style={styles.addSourceSheetBody}>
            {/*
              Everything above the list lives in one stack so the scroll
              container's top edge sits exactly at the search field's bottom.
              The 12pt separation belongs to the list's own content inset
              (`availableListContent`) instead of a flex gap: rows then slide
              under the field while scrolling instead of being clipped at a
              hard edge floating in an empty gap, and the first row still
              starts 12pt clear of the field at rest.
            */}
            <View
              onLayout={handleAddSourceHeaderStackLayout}
              style={styles.addSourceSheetHeaderStack}
            >
              {available.error ? (
                <MobileInlineToast
                  title={strings.feedback.catalogUnavailableTitle}
                  detail={[
                    strings.feedback.catalogUnavailableDetail,
                    catalogCacheAge,
                  ].filter(Boolean).join(" · ")}
                  actionLabel={strings.common.retry}
                  actionDisabled={refreshingSources}
                  actionLoading={refreshingSources}
                  onActionPress={() => {
                    void refreshSources();
                  }}
                />
              ) : null}
              {/*
                iOS renders this as a real SwiftUI `TextField` (`Host > HStack >
                magnifier / TextField / clear Button`) via `@expo/ui/swift-ui`;
                every other platform keeps the RN `TextInput` capsule. Both live
                in `NemuNativeSearchField`, which also documents the SwiftUI
                first-responder/IME caveat of hosting a text field inside the
                sheet's own SwiftUI presentation and how to fall back.
              */}
              <NemuNativeSearchField
                accessibilityLabel={strings.browse.searchRegistries}
                clearAccessibilityLabel={strings.common.clear}
                clearActionTestID="AddSourceSearchClearAction"
                onChangeText={setQuery}
                placeholder={strings.browse.searchRegistries}
                value={query}
              />

              {selectedLanguages.size > 0 || showAdult ? (
                <View style={styles.activeFilterChips}>
                  {[...selectedLanguages].map((language) => (
                    <ActiveFilterChip
                      key={language}
                      label={formatSourceLanguageLabel(
                        language,
                        strings,
                        appLanguage,
                      )}
                      removeLabel={strings.common.remove}
                      onPress={() => toggleLanguage(language)}
                    />
                  ))}
                  {showAdult ? (
                    <ActiveFilterChip
                      label={strings.browse.adult}
                      removeLabel={strings.common.remove}
                      onPress={() => setShowAdult(false)}
                    />
                  ) : null}
                </View>
              ) : null}

              {actionError ? (
                <MobileInlineErrorBanner
                  variant="embedded"
                  title={actionError.title}
                  detail={actionError.detail}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setActionError(null)}
                />
              ) : null}
            </View>

            <SectionList
              alwaysBounceVertical={false}
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              onContentSizeChange={handleAvailableListContentSizeChange}
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
          visible={activeSheetVisible}
          onClose={closeLanguageSheet}
          onDismiss={handleLanguageSheetDismissed}
          title={strings.browse.languageFilter}
          dismissLabel={strings.common.done}
          snapPoints={["82%"]}
          scroll
          scrollContentBottomInset={18}
          testID="SourceLanguageSheet"
        >
          <LanguageFilterSheetSection
            languages={languageOptions}
            selectedLanguages={selectedLanguages}
            strings={strings}
            appLanguage={appLanguage}
            onSelectAll={() => setSelectedLanguages(new Set())}
            onToggleLanguage={toggleLanguage}
            showAdult={showAdult}
            onToggleAdult={() => setShowAdult((value) => !value)}
          />
        </MobileNativeSheetScaffold>
      ) : null}

      {confirmationDetails ? (
        <MobileConfirmationSheet
          visible={confirmationVisible}
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
          onCancel={cancelInstallConfirmation}
          onDismiss={handleInstallConfirmationDismissed}
          onConfirm={runConfirmedAction}
        >
          {actionError ? (
            <MobileInlineErrorBanner
              variant="embedded"
              title={actionError.title}
              detail={actionError.detail}
              dismissLabel={strings.common.clear}
              onDismiss={() => setActionError(null)}
            />
          ) : null}
        </MobileConfirmationSheet>
      ) : null}

      {quickActionSource ? (
        <QuickActionSheet
          visible={quickActionVisible}
          variant="icon"
          title={getMobileInstalledSourceName(quickActionSource)}
          image={quickActionIconUri}
          actions={quickActions}
          testID="SourceQuickActionSheet"
          onClose={closeQuickActions}
          onDismiss={handleQuickActionsDismissed}
        />
      ) : null}
      {quickActionSource && quickActionSettingsVisible ? (
        <MobileSourceQuickSettingsSheet
          source={quickActionSource}
          iconUri={quickActionIconUri}
          strings={strings}
          visible={quickActionSettingsVisible}
          onClose={() => setQuickActionSettingsVisible(false)}
          onDismiss={() => setQuickActionSourceId(null)}
        />
      ) : null}
      {quickActionUninstall ? (
        <MobileConfirmationSheet
          visible={quickActionUninstallVisible}
          title={strings.settings.uninstallSource}
          description={formatMobileString(
            strings.settings.uninstallSourceConfirm,
            { name: getMobileInstalledSourceName(quickActionUninstall) },
          )}
          subject={getMobileInstalledSourceName(quickActionUninstall)}
          iconName="trash-outline"
          cancelLabel={strings.common.cancel}
          confirmLabel={strings.common.uninstall}
          confirmAccessibilityLabel={formatMobileString(
            strings.settings.uninstallSourceNamed,
            { name: getMobileInstalledSourceName(quickActionUninstall) },
          )}
          loading={uninstallingSourceId === quickActionUninstall.id}
          destructive
          onCancel={() => setQuickActionUninstallVisible(false)}
          onDismiss={() => {
            setQuickActionUninstall(null);
            setQuickActionSourceId(null);
          }}
          onConfirm={() => {
            void runQuickActionUninstall();
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sections: {
    gap: 26,
  },
  addSourceSheetBody: {
    flex: 1,
    minHeight: 0,
  },
  addSourceSheetHeaderStack: {
    gap: 14,
  },
  activeFilterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    // The gap under the search field is a content inset, not a flex gap, so
    // the scroll viewport starts at the field's bottom edge and nothing is
    // ever clipped in the empty space between them.
    paddingTop: 12,
    // Rounded-corner tail: the measured detent adds 12pt of clearance on top
    // of this padding, leaving ~36pt under the last row at full scroll.
    paddingBottom: 24,
    // No `flexGrow`: a content container stretched to the viewport would
    // report the viewport height from `onContentSizeChange`, and the sheet's
    // measured detent depends on that callback reporting the natural content
    // height to stay out of a feedback loop.
  },
  availableRowSeparator: {
    height: 12,
  },
  availableSectionSeparator: {
    height: 18,
  },
  availableSourceLanguageHeader: {
    // Section titles (日本語, …) need real separation from the preceding
    // section's rows — and from the search field for the first section — so
    // they read as group headers rather than floating labels.
    marginTop: 10,
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
  // The explicit-content toggle row mirrors the language option rows' group
  // chrome with every child centred on one line (itemsCenter, fixed
  // heights), so the switch cannot sit rotated or offset in its container.
  adultToggleCard: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  adultToggleRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  adultToggleIcon: {
    // Bare glyph, no tile: keeps the row's column alignment with the language
    // rows above without boxing the icon.
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  adultToggleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  adultToggleTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  adultToggleSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  adultToggleAccessory: {
    // Same shape as the settings card's `settingControl`: let the native
    // switch host report its own height and let the row's `alignItems:
    // "center"` seat it — a fixed-height box here pushed the toggle upward.
    minWidth: 54,
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
