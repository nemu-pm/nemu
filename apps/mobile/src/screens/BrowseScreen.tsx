import { Image as ServerIconImage } from "react-native";
import { MobileQuickActionMenu, mobileNativeQuickMenuAvailable } from "@/components/MobileQuickActionMenu";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { MOBILE_EXPLORE_RADIUS } from "@/lib/mobileExploreRadius";
import { Stack, router, useFocusEffect } from "expo-router";
import {
  consumeMobileAddSourceSheetDirectoryFocus,
  consumeMobileAddSourceSheetRequest,
  subscribeMobileAddSourceSheetRequest,
} from "@/lib/mobileAddSourceSheetRequest";
import { hasMobileUserSourceDirectory } from "@/lib/mobileSourceDirectoryGuide";
import { useMobileSourceDirectories } from "@/data/useMobileSourceDirectories";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type SectionListData,
  type SectionListRenderItemInfo,
  type ScrollViewInstance,
  type ViewInstance,
} from "react-native";
import { useMobilePoseTransition } from "@/lib/MobilePoseTransitionContext";
import { useMobileRestingVerticalFold } from "@/lib/useMobileRestingVerticalFold";
import { useMobileScrollGroupAnchor } from "@/lib/useMobileScrollGroupAnchor";
import {
  estimateMobileSourceGroupHeight,
  getMobileSourceColumns,
  MOBILE_SOURCE_GROUP_GAP,
  partitionMobileSourceGroups,
} from "@/lib/mobileSourceColumns";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ADD_DIRECTORY_PAGE, SERVER_PICKER_PAGE } from "@/lib/mobileAddSourcesPages";
import { selfHostedKindName } from "@/lib/selfHosted/messages";
import { SELF_HOSTED_REGISTRY_ID, SELF_HOSTED_SETUP_KINDS, type SelfHostedKind } from "@/lib/selfHosted/policy";
import { EmptyLibrary } from "@/components/EmptyLibrary";
import { MobileBrowseSkeleton } from "@/components/MobileBrowseSkeleton";
import { MobileAddSourcesDirectoryPage } from "@/components/MobileAddSourceDirectorySheet";
import { MobileAddSourcesStack, mobileAddSourcesPushesPagesNatively } from "@/components/MobileAddSourcesStack";
import { SERVER_ICONS } from "@/components/mobileServerIcons";
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
  isMobileRefreshSourcesCancellation,
  showMobileRefreshSourcesErrorToast,
} from "@/lib/mobileRefreshSourcesFeedback";
import {
  createNemuNativeScreenOptions,
  GlassSurface,
  MobileCachedImage,
  MobileChip,
  MobileNativeSheetScaffold,
  NemuButton,
  nemuColorWithAlpha,
  nemuFontWeight,
  type NemuNativeHeaderAction,
  NemuNativeSearchField,
  NemuNativeSheetHeaderAction,
  NemuNativeSwitch,
  NemuPressable,
  NemuSheetScrollEdge,
  NemuText,
  PageHeader,
  PageScaffold,
  radius,
  renderNemuNativeToolbarButtons,
  SourceCard,
  type SourceCardModel,
  useMobileNativeSheetTheme,
  useMobilePageGutters,
  useNemuTheme,
  usesNemuNativeHeader,
} from "@/design-system";
import {
  isMobileSourceInstallCancellation,
  useAvailableSources,
  useInstalledSources,
  useLibraryEntries,
  useMobileLanguageSettings,
  useSourceInstaller,
} from "@/data/mobileHooks";
import type { AppLanguage, InstalledSource } from "@/data/schema";
import {
  hapticConfirm,
  hapticError,
  hapticSelection,
} from "@/lib/haptics";
import { formatMobileCatalogCacheAge } from "@/lib/mobileCatalogCacheAge";
import { prefetchCachedMobileImages } from "@/lib/mobileImageCache";
import { scheduleMobileIdleTask } from "@/lib/mobileIdleTask";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { mobileGridPrefersEvenColumns } from "@/lib/mobileAdaptiveLayout";
import { getMobileSourceGridLayout } from "@/lib/mobilePageLayout";
import { chunkMobileGridRows, mobileFoldAwareGridCellStyle } from "@/lib/mobileFoldAwareGrid";
import { MobileListChangeCell, MobilePoseLayoutView, MobilePoseWidthSpringView } from "@/components/MobilePoseLayoutView";
import Animated from "react-native-reanimated";
import {
  mobileGridGlideAppearing,
  mobileGridGlideFrameTransition,
  mobileGridGlideTransition,
  mobileGridGlideVanishing,
  openMobileGridGlideWindow,
} from "@/lib/mobilePoseLayoutAnimations";
import { MobilePaneAlignedView } from "@/lib/MobilePaneAlignedView";
import { useMobileContainerFold } from "@/lib/useMobileContainerFold";
import {
  buildMobileInstalledSourceKeySet,
  buildMobileSourceQuickActions,
  canStartMobileSourceInstall,
  filterMobileAvailableSources,
  hasMobileExplicitSources,
  getMobileAvailableSourceLanguageOptions,
  getMobileSourceInstallHandoff,
  getMobileSourceInstallResultAction,
  getMobileSourceQuickActionHandoff,
  getMobileSourceWarningAccessibilityLabel,
  getMobileSourceWarningMessages,
  groupMobileSourcesByLanguage,
  omitMobileBrowseSourcesFromGroups,
  selectMobileBrowseLibrarySources,
  isMobileUnsupportedInstalledSource,
  filterEnabledMobileInstalledSources,
  mergeMobileInstalledSourceRegistryMetadata,
  resolveMobileSourceHomepageUrl,
  shouldRenderMobileBrowseSkeleton,
  shouldReopenMobileAddSourceSheetAfterInstall,
  type MobileSourceQuickActionId,
  getMobileSourceOriginLabel,
  formatMobileSourceLanguages,
} from "@/lib/mobileBrowseSources";
import { getMobileInstalledSourceRegistryRef } from "@/lib/mobileInstalledSourceKeys";
import {
  getMobileInstalledSourceName,
  getMobileInstalledSourceOriginLabel,
} from "@/lib/mobileInstalledSourcePresentation";
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
  | { type: "start-install"; source: MobileRegistrySource }
  | { type: "open-server-form"; kind: SelfHostedKind };

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
          <NemuText
            numberOfLines={1}
            style={[
              styles.unsupportedSourceTitle,
              { color: tokens.foreground },
            ]}
          >
            {source.name}
          </NemuText>
          <MobileChip
            accessibilityLabel={strings.common.sourceUnsupportedBadge}
            label={strings.common.sourceUnsupportedBadge}
            size="sm"
            variant="static"
          />
        </View>
        <NemuText
          numberOfLines={2}
          style={[
            styles.unsupportedSourceSubtitle,
            { color: tokens.mutedForeground },
          ]}
        >
          {strings.common.sourceUnsupportedTachiyomiDescription}
        </NemuText>
      </View>
    </NemuPressable>
  );
}

const formatLanguages = formatMobileSourceLanguages;

/** Section key of the built-in server sources in Browse. */
const SELF_HOSTED_GROUP = "self-hosted";

function formatSourceLanguageLabel(
  language: string,
  strings: MobileStrings,
  appLanguage: AppLanguage,
): string {
  if (language === SELF_HOSTED_GROUP) return strings.selfHosted.groupTitle;
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

/**
 * One removable active filter: the shared chip primitive's `toggle` variant in
 * its selected (plain primary surface) state, with a trailing `close` glyph.
 * Same pill as the Search tab's source chips.
 */
function ActiveFilterChip({
  label,
  removeLabel,
  onPress,
  wrapLabel,
}: {
  label: string;
  removeLabel: string;
  onPress: () => void;
  /** A directory's name is shown whole instead of truncated. */
  wrapLabel?: boolean;
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
      wrapLabel={wrapLabel}
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
      <NemuText
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
      </NemuText>
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
  /** Null when no added directory lists an explicit source: no toggle then. */
  onToggleAdult: (() => void) | null;
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
            if (allLanguagesSelected) return;
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
      {onToggleAdult ? (
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
            <NemuText
              numberOfLines={1}
              style={[
                styles.adultToggleTitle,
                { color: tokens.foreground },
              ]}
            >
              {strings.browse.adult}
            </NemuText>
            <NemuText
              numberOfLines={2}
              style={[
                styles.adultToggleSubtitle,
                { color: tokens.mutedForeground },
              ]}
            >
              {strings.browse.adultSourcesDescription}
            </NemuText>
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
            ? nemuColorWithAlpha(tokens.muted, 0.48)
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
            <NemuText
              numberOfLines={1}
              style={[styles.sourceTitle, { color: tokens.foreground }]}
            >
              {source.name}
            </NemuText>
            <NemuText
              numberOfLines={1}
              style={[
                styles.sourceVersionText,
                { color: tokens.mutedForeground },
              ]}
            >
              v{source.version}
            </NemuText>
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
          <NemuText
            numberOfLines={1}
            style={[styles.sourceSubtitle, { color: tokens.mutedForeground }]}
          >
            {[
              formatLanguages(source.languages, strings.sourceBrowse.multiLanguage),
              getMobileSourceOriginLabel(source, strings),
            ]
              .filter(Boolean)
              .join(" / ")}
          </NemuText>
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
            <NemuText
              style={[styles.installText, { color: tokens.mutedForeground }]}
            >
              {strings.browse.installed}
            </NemuText>
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

/**
 * A built-in server source in the Add Source sheet (Komga, Kavita): not
 * downloaded, so there is nothing to install; the row opens the server's
 * setup form.
 */
const BuiltInSourceRow = memo(function BuiltInSourceRow({
  kind,
  strings,
  onPress,
}: {
  kind: SelfHostedKind;
  strings: MobileStrings;
  onPress: (kind: SelfHostedKind) => void;
}) {
  const { tokens } = useNemuTheme();
  const name = selfHostedKindName(kind);
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${strings.selfHosted.rowSubtitle}`}
      onPress={() => onPress(kind)}
      style={[
        styles.availableShell,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <View style={styles.availableRow}>
        <View style={styles.sourceIcon}>
          <ServerIconImage source={SERVER_ICONS[kind]} style={styles.sourceIcon} resizeMode="contain" />
        </View>
        <View style={styles.availableText}>
          <NemuText numberOfLines={1} style={[styles.sourceTitle, { color: tokens.foreground }]}>
            {name}
          </NemuText>
          <NemuText numberOfLines={1} style={[styles.sourceSubtitle, { color: tokens.mutedForeground }]}>
            {strings.selfHosted.rowSubtitle}
          </NemuText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={tokens.mutedForeground} />
      </View>
    </NemuPressable>
  );
});

/**
 * The end of the Add Sources list: where more sources come from. With only
 * the built-in demo directory the row says why to add one; once the user has
 * a directory of their own it is the bare row, so it never nags.
 */
function SourceDirectoryGuide({
  prominent,
  strings,
  onPress,
}: {
  prominent: boolean;
  strings: MobileStrings;
  onPress: () => void;
}) {
  // Inside the sheet: the sheet's card colours, as the server entry row uses.
  const { tokens } = useMobileNativeSheetTheme();
  const action = strings.browse.addSourceDirectory;
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={action}
      accessibilityHint={prominent ? strings.browse.sourceDirectoryGuideBody : undefined}
      onPress={onPress}
      pressHighlight
      style={[
        styles.directoryGuide,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
      testID="AddSourceDirectoryGuide"
    >
      <Ionicons name="add-circle-outline" size={24} color={tokens.primary} />
      <View style={styles.directoryGuideText}>
        <NemuText numberOfLines={1} style={[styles.directoryGuideLabel, { color: tokens.primary }]}>
          {action}
        </NemuText>
        {prominent ? (
          <NemuText style={[styles.directoryGuideDetail, { color: tokens.mutedForeground }]}>
            {strings.browse.sourceDirectoryGuideBody}
          </NemuText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={tokens.mutedForeground} style={{ marginRight: -4 }} />
    </NemuPressable>
  );
}

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
 * The Add Sources sheet opens at three quarters of the screen and drags up to
 * full height; the catalog scrolls inside it.
 *
 * Fixed fractions, never a measured height: the native sheet's selected
 * detent is the snap point at its index, and the single measured height this
 * sheet used to pass (an 88% placeholder, then header + list content) changed
 * while the sheet was up. Since @expo/ui 58.0.21 the presented sheet picks
 * that change up, leaving SwiftUI's selection outside the new one-detent list
 * ("Cannot set selected sheet detent if it is not included"); the sheet then
 * settled near half height with no other detent to drag to. A
 * module-level array keeps the detents' identity (and so the selection) stable
 * too.
 */
const ADD_SOURCE_SHEET_SNAP_POINTS: (string | number)[] = ["75%", "100%"];

/** The latest the catalog list waits for the sheet's native layout. */
const ADD_SOURCE_LIST_MOUNT_FALLBACK_MS = 250;

/**
 * The Add Sources catalog list (its scroll edge blur, the server entry and
 * the first rows), mounted once the native sheet has sized the body instead
 * of in the "+" tap's own commit. That commit then carries only the sheet,
 * its header and the search field, so the native presentation starts without
 * waiting for the list's views; the rows follow a frame or two into the
 * slide-up. The space keeps the list's frame meanwhile (nothing reflows).
 * Mounted anyway after `ADD_SOURCE_LIST_MOUNT_FALLBACK_MS`.
 */
function AddSourceListAfterSheetLayout({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), ADD_SOURCE_LIST_MOUNT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.height > 0) setReady(true);
  }, []);
  return (
    <View style={styles.availableListScroller} onLayout={ready ? undefined : handleLayout}>
      {ready ? children : null}
    </View>
  );
}

export function BrowseScreen() {
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const { tokens } = useNemuTheme();
  // The Add Sources sheet's own content, built here outside the sheet.
  const sheetTokens = useMobileNativeSheetTheme().tokens;
  const [query, setQuery] = useState("");
  // A directory just added from Add Source Directory: the sheet shows its
  // sources alone, under a chip naming it that clears the focus.
  const [directoryFocus, setDirectoryFocus] = useState<string | null>(null);
  const [showAdult, setShowAdult] = useState(false);
  const [activeSheet, setActiveSheet] = useState<BrowseSheet | null>(null);
  const [activeSheetVisible, setActiveSheetVisible] = useState(false);
  // Add Source Directory and Connect Server, pushed inside the sheet. On
  // Android they are in its body, and a server's form is its own screen.
  const [addSourcesPath, setAddSourcesPath] = useState<string[]>([]);
  const [addSourcesPageBlocksDismiss, setAddSourcesPageBlocksDismiss] = useState(false);
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
  const sourceDirectories = useMobileSourceDirectories();
  const focusedDirectory = directoryFocus
    ? sourceDirectories.directories.find((directory) => directory.id === directoryFocus) ?? null
    : null;
  const installer = useSourceInstaller();
  const toast = useMobileToast();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const pageGutters = useMobilePageGutters();
  // Source cards size from the measured content box (Duo's trailing system
  // bars narrow it), even columns whenever the window has a fold region
  // (folded or flat). Only an active fold reserves the middle gutter.
  const sourceGridContainer = useMobileContainerFold<ViewInstance>();
  const sourceGridSplit = sourceGridContainer.split;
  const sourceGridPrefersEven = mobileGridPrefersEvenColumns(sourceGridContainer.adaptive);
  const sourceGrid = useMemo(
    () =>
      getMobileSourceGridLayout(
        sourceGridContainer.width ?? windowWidth - pageGutters.left - pageGutters.right,
        fontScale,
        {
          preferEven: sourceGridPrefersEven,
          fold:
            sourceGridSplit?.axis === "horizontal"
              ? { start: sourceGridSplit.gutter.start, end: sourceGridSplit.gutter.end }
              : null,
        },
      ),
    [
      fontScale,
      pageGutters.left,
      pageGutters.right,
      sourceGridPrefersEven,
      sourceGridContainer.width,
      sourceGridSplit,
      windowWidth,
    ],
  );
  const usesNativeHeader = usesNemuNativeHeader;

  const installedKeys = useMemo(
    () => buildMobileInstalledSourceKeySet(installed.data),
    [installed.data],
  );

  // Browse is a source operation: a disabled install gets no card. It stays
  // reachable (and re-enablable) from Settings › Sources.
  const installedSources = useMemo<InstalledSourceCardModel[]>(() => {
    const merged = filterEnabledMobileInstalledSources(
      mergeMobileInstalledSourceRegistryMetadata(
        installed.data,
        available.data,
      ),
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
        subtitle:
          registryId === SELF_HOSTED_REGISTRY_ID && source.selfHosted
            ? selfHostedKindName(source.selfHosted.kind)
            : getMobileInstalledSourceOriginLabel(source, strings),
        unsupported: isMobileUnsupportedInstalledSource(source),
      };
    });
    return sortSourcesByLanguagePriority(cards, appLanguage);
  }, [appLanguage, available.data, installed.data, strings]);
  // The registry most sources come from; only sources from another one say
  // where they are from (a row of "aidoku-community" says nothing).
  const mainRegistry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const source of installedSources) counts.set(source.registryId, (counts.get(source.registryId) ?? 0) + 1);
    let best: string | null = null;
    for (const [registry, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = registry;
    return best;
  }, [installedSources]);
  const groupedInstalledSources = useMemo(
    () => {
      // The user's own servers form one group of their own, ahead of the
      // language groups.
      const servers = installedSources.filter((source) => source.registryId === SELF_HOSTED_REGISTRY_ID);
      const rest = installedSources.filter((source) => source.registryId !== SELF_HOSTED_REGISTRY_ID);
      const groups = groupMobileSourcesByLanguage(rest, appLanguage);
      return servers.length > 0 ? [{ label: SELF_HOSTED_GROUP, sources: servers }, ...groups] : groups;
    },
    [appLanguage, installedSources],
  );
  // Design-explore: the sources the library reads from, first and with how
  // many titles each holds (they also stay in their language group below).
  const libraryEntries = useLibraryEntries();
  const exploreSourceSections = useMemo<
    { label: string; sources: (InstalledSourceCardModel & { exploreKeepSubtitle?: boolean })[] }[]
  >(() => {
    if (!mobileDesignExploreFlag) return groupedInstalledSources;
    const picked = selectMobileBrowseLibrarySources(
      installedSources.filter((source) => !source.unsupported),
      libraryEntries.data.flatMap((entry) => (entry.item.inLibrary === false ? [] : entry.sources)),
    );
    if (!picked.length) return groupedInstalledSources;
    return [
      {
        label: EXPLORE_LIBRARY_SECTION,
        sources: picked.map(({ source, titles }) => ({
          ...source,
          subtitle:
            titles === 1
              ? strings.designExplore.browseLibraryTitlesOne
              : formatMobileString(strings.designExplore.browseLibraryTitles, { count: titles }),
          exploreKeepSubtitle: true,
        })),
      },
      // Each source once: the language groups skip what the library group lists.
      ...omitMobileBrowseSourcesFromGroups(groupedInstalledSources, picked.map(({ source }) => source)),
    ];
  }, [groupedInstalledSources, installedSources, libraryEntries.data, strings]);
  // Design-explore: half open (book posture), two columns of groups, one a
  // pane across the Duo's vertical hinge — each group whole in one column,
  // the next one in the shorter column (estimated from its rows, so a group
  // never changes column because it was measured). Fully open (landscape or
  // portrait) the display is one whole screen: one 560pt column centred on
  // it. The columns are keyed (col-0 / col-1), so folding glides col-0 to its
  // new frame on the pose spring and col-1 fades in or out.
  const sourceListWidth = sourceGridContainer.width ?? windowWidth - pageGutters.left - pageGutters.right;
  // Until the list is measured in the window it starts at the page gutter.
  const sourceListFrame = useMemo(
    () => sourceGridContainer.rect ?? { x: pageGutters.left, width: sourceListWidth },
    [pageGutters.left, sourceGridContainer.rect, sourceListWidth],
  );
  const sourceListFold = useMobileRestingVerticalFold(mobileDesignExploreFlag ? sourceListFrame : null);
  const sourceColumns = useMemo(
    () =>
      getMobileSourceColumns({
        contentWidth: sourceListWidth,
        fold: sourceGridSplit?.axis === "horizontal" ? sourceGridSplit.gutter : null,
        band: sourceListFold,
        foldRegion: sourceGridContainer.adaptive.hasFoldRegion,
      }),
    [sourceGridContainer.adaptive.hasFoldRegion, sourceGridSplit, sourceListFold, sourceListWidth],
  );
  const sourceGroupColumns = useMemo(
    () =>
      partitionMobileSourceGroups(
        exploreSourceSections.map((section) =>
          estimateMobileSourceGroupHeight({
            rows: section.sources.length,
            unsupportedRows: section.sources.filter((source) => source.unsupported).length,
          }),
        ),
        sourceColumns.length,
      ),
    [exploreSourceSections, sourceColumns.length],
  );
  const sourceListSplit = mobileDesignExploreFlag && sourceColumns.length > 1;
  // The first visible group keeps its distance from the top when the
  // arrangement changes (rotation: one column ⇄ one a pane).
  const browseScrollRef = useRef<ScrollViewInstance | null>(null);
  const sourceGroupAnchor = useMobileScrollGroupAnchor({
    scrollRef: browseScrollRef as unknown as Parameters<typeof useMobileScrollGroupAnchor>[0]["scrollRef"],
    layoutKey: `${windowWidth}|${sourceColumns.map((column) => `${column.x}:${column.width}`).join(",")}`,
  });
  const sourcePose = useMobilePoseTransition();

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
  // A built-in server source has no package settings to show: its "Settings"
  // is the same form it was added with, pushed instead of the settings sheet.
  useEffect(() => {
    if (
      !quickActionSettingsVisible ||
      quickActionSource?.registryId !== SELF_HOSTED_REGISTRY_ID ||
      !quickActionSource.sourceId
    ) {
      return;
    }
    const sourceId = quickActionSource.sourceId;
    setQuickActionSettingsVisible(false);
    setQuickActionSourceId(null);
    router.push({ pathname: "/(tabs)/browse/server", params: { sourceId } });
  }, [quickActionSettingsVisible, quickActionSource]);
  const quickActionUpdate = useMemo(
    () =>
      quickActionSource
        ? (findMobileSourceUpdates([quickActionSource], available.data)[0] ??
          null)
        : null,
    [available.data, quickActionSource],
  );
  const quickActionHomepage = useMemo(
    () =>
      resolveMobileSourceHomepageUrl(quickActionSource?.packageMetadata?.urls),
    [quickActionSource],
  );
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

  const hasExplicitSources = useMemo(
    () => hasMobileExplicitSources(available.data),
    [available.data],
  );
  // A toggle left on stays off while no directory lists explicit sources.
  const adultShown = showAdult && hasExplicitSources;
  const filteredAvailable = useMemo(() => {
    const candidates = directoryFocus
      ? available.data.filter((source) => source.registryId === directoryFocus)
      : available.data;
    return filterMobileAvailableSources(candidates, {
      appLanguage,
      query,
      selectedLanguages,
      showAdult: adultShown,
    });
  }, [adultShown, appLanguage, available.data, directoryFocus, query, selectedLanguages]);
  const groupedAvailable = useMemo(
    () =>
      groupMobileSourcesByLanguage(filteredAvailable, appLanguage, {
        sortSourcesByName: true,
      }),
    [appLanguage, filteredAvailable],
  );
  const builtInKinds = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return SELF_HOSTED_SETUP_KINDS.filter(
      (kind) => !needle || selfHostedKindName(kind).toLowerCase().includes(needle),
    );
  }, [query]);
  // Typing or changing a filter: the rows left glide together, those going and
  // coming fade. Up before the commit that moves them.
  const availableFilterKey = `${query}|${[...selectedLanguages].join()}|${adultShown}|${directoryFocus ?? ""}`;
  const seenAvailableFilterKeyRef = useRef(availableFilterKey);
  if (seenAvailableFilterKeyRef.current !== availableFilterKey) {
    seenAvailableFilterKeyRef.current = availableFilterKey;
    openMobileGridGlideWindow();
  }
  // A source added or removed: its row fades in or out, the group's edge and
  // the rows and groups after it glide.
  const installedSourcesKey = installedSources.map((source) => source.id).join();
  const seenInstalledSourcesKeyRef = useRef(installedSourcesKey);
  if (seenInstalledSourcesKeyRef.current !== installedSourcesKey) {
    // The first list arriving (the page's skeleton leaving) just shows.
    if (seenInstalledSourcesKeyRef.current) openMobileGridGlideWindow();
    seenInstalledSourcesKeyRef.current = installedSourcesKey;
  }
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
  const showNoSourcesEmpty = !error && !showSkeleton && installedSources.length === 0;
  const activeInstallKey = pendingInstallKey ?? installer.installingKey;
  const refreshDisabled = refreshingSources || activeInstallKey !== null;
  const catalogCacheAge = formatMobileCatalogCacheAge(
    available.catalogCachedAt,
    appLanguage,
  );
  const selectedFilterLabel = formatLanguageSelectionLabel(
    selectedLanguages,
    strings,
    appLanguage,
  );
  const activeFilterCount = selectedLanguages.size + (adultShown ? 1 : 0);

  const restoreAddSourceSheet = useCallback(() => {
    setActiveSheet("add-source");
    setActiveSheetVisible(true);
  }, []);

  useEffect(() => {
    if (activeSheet !== "add-source") return;
    // The icon prefetch resolves cache files synchronously on the JS thread.
    // Run it once the thread is idle, after the sheet's own mount and its
    // follow-up layout commits, instead of in the same tick as the mount.
    const task = scheduleMobileIdleTask(
      () => {
        void prefetchCachedMobileImages(
          filteredAvailable
            .slice(0, 36)
            .map((source) => (source.icon ? { uri: source.icon } : null)),
        );
      },
      { timeout: 1200 },
    );
    return () => task.cancel();
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
        <NemuText
          style={[
            styles.sourceLanguageHeader,
            styles.availableSourceLanguageHeader,
            { color: sheetTokens.mutedForeground },
          ]}
        >
          {label}
        </NemuText>
      );
    },
    [appLanguage, strings, sheetTokens.mutedForeground],
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

  const refreshSourcesRef = useRef<() => Promise<void>>(async () => {});
  const refreshSources = async () => {
    if (refreshGuardRef.current || activeInstallKey !== null) return;

    refreshGuardRef.current = true;
    setRefreshingSources(true);
    setActionError(null);
    try {
      await Promise.all([installed.reload(), available.reload()]);
      await hapticConfirm();
    } catch (error) {
      if (isMobileSourceInstallCancellation(error)) return;
      // A superseded/aborted refresh is not a failure; the run that replaced
      // it reports itself.
      if (isMobileRefreshSourcesCancellation(error)) return;
      if (__DEV__) console.warn("[browse] refresh sources failed:", error);
      await hapticError();
      // The page still shows its sources: a toast, not the inline banner.
      showMobileRefreshSourcesErrorToast({
        toast,
        strings,
        error,
        onRetry: () => void refreshSourcesRef.current(),
      });
    } finally {
      refreshGuardRef.current = false;
      setRefreshingSources(false);
    }
  };
  refreshSourcesRef.current = refreshSources;

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

  // Bumped on every "+" tap (see `presentRequest`).
  const [addSourcePresentRequest, setAddSourcePresentRequest] = useState(0);
  // Set at the "+" tap; the sheet body's first layout measures the time to
  // presentation (JS queueing plus mount) against it.
  const addSourceTapStartedAtRef = useRef<number | null>(null);
  // Stable: the native toolbar's items are rebuilt only when their own
  // inputs change, not on every Browse render.
  const openAddSourceSheet = useCallback(() => {
    addSourceTapStartedAtRef.current = markMobilePerformance("browse.addSource.tap");
    setAddSourcesPath([]);
    // A registry query is useful only for the current sheet visit. Keeping it
    // after installing or dismissing a source makes a later visit look empty
    // until the user notices and clears the stale filter.
    setQuery("");
    setDirectoryFocus(null);
    addSourceDismissActionRef.current = null;
    setActiveSheet("add-source");
    setActiveSheetVisible(true);
    // Lets the sheet tell a tap that must re-present it (its native close
    // still in flight, or a presentation left invisible) from a no-op.
    setAddSourcePresentRequest((request) => request + 1);
  }, []);
  const handleAddSourceSheetBodyLayout = useCallback(() => {
    const startedAt = addSourceTapStartedAtRef.current;
    if (startedAt === null) return;
    addSourceTapStartedAtRef.current = null;
    measureMobilePerformance("browse.addSource.presented", startedAt);
  }, []);
  // Settings → Installed Sources' "+" switches to this tab and files a
  // one-shot request for the same sheet the header "+" opens. It is consumed
  // when Browse is focused: right away on a first mount, or through the
  // subscription when the tab was already mounted. The request is cleared
  // either way, so it never reopens the sheet on a later visit; it is dropped
  // (like the disabled "+") while an install runs or another sheet is up.
  const addSourceRequestHandlerRef = useRef<() => void>(() => undefined);
  addSourceRequestHandlerRef.current = () => {
    if (!consumeMobileAddSourceSheetRequest()) return;
    const focus = consumeMobileAddSourceSheetDirectoryFocus();
    // Already open (a directory link confirmed over it): show the new
    // directory's sources in place.
    if (activeSheet === "add-source" && focus) {
      setAddSourcesPath([]);
      setQuery("");
      setDirectoryFocus(focus);
      return;
    }
    if (activeInstallKey !== null || activeSheet !== null) return;
    openAddSourceSheet();
    setDirectoryFocus(focus);
  };
  useFocusEffect(
    useCallback(() => {
      addSourceRequestHandlerRef.current();
      return subscribeMobileAddSourceSheetRequest(() => {
        addSourceRequestHandlerRef.current();
      });
    }, []),
  );
  const closeAddSourceSheet = () => {
    setActiveSheetVisible(false);
  };
  const handleAddSourceSheetDismissed = () => {
    const next = addSourceDismissActionRef.current;
    addSourceDismissActionRef.current = null;
    setActiveSheet(null);
    setActiveSheetVisible(false);
    setAddSourcesPath([]);
    setAddSourcesPageBlocksDismiss(false);

    if (next?.type === "open-language") {
      setActiveSheet("source-language");
      setActiveSheetVisible(true);
      return;
    }
    if (next?.type === "start-install") {
      startInstallAfterAddSourceDismissal(next.source);
      return;
    }
    if (next?.type === "open-server-form") {
      router.push({ pathname: "/(tabs)/browse/server", params: { kind: next.kind } });
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
  const openServerForm = (kind: SelfHostedKind) => {
    void hapticSelection();
    requestAddSourceDismissal({ type: "open-server-form", kind });
  };
  const openAddDirectory = () => {
    void hapticSelection();
    setAddSourcesPath([ADD_DIRECTORY_PAGE]);
  };
  const openServerPicker = () => {
    void hapticSelection();
    setAddSourcesPath([SERVER_PICKER_PAGE]);
  };
  const closeAddSourcesPages = useCallback(() => setAddSourcesPath([]), []);
  // Added: back on the list, on the new directory's sources.
  const handleDirectoryAdded = useCallback((directoryId: string) => {
    setQuery("");
    setDirectoryFocus(directoryId);
    setAddSourcesPath([]);
  }, []);
  // Connected: the server is in Browse, below the sheet.
  const handleServerConnected = useCallback(() => setActiveSheetVisible(false), []);
  const addSourcesPage = addSourcesPath.at(-1);
  const addDirectoryInBody = addSourcesPage === ADD_DIRECTORY_PAGE && !mobileAddSourcesPushesPagesNatively;
  const serverPickerInBody = addSourcesPage === SERVER_PICKER_PAGE && !mobileAddSourcesPushesPagesNatively;
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
  const quickActionLabel = (id: MobileSourceQuickActionId): string => {
    switch (id) {
      case "settings":
        return strings.settings.sourceSettingsDefaultTitle;
      case "update":
        return formatMobileString(strings.browse.updateSourceToVersion, {
          version: quickActionUpdate?.version ?? "",
        });
      case "openInBrowser":
        return strings.browse.openSourceHomepage;
      case "uninstall":
        return strings.common.uninstall;
    }
  };
  // Which rows this sheet offers, and in what order, is shared with Settings'
  // copy of it; only the copy and the handlers are local.
  const quickActions: QuickAction<MobileSourceQuickActionId>[] =
    quickActionSource
      ? buildMobileSourceQuickActions({
          // `installedSources` runs through `filterEnabledMobileInstalledSources`,
          // so a disabled install never gets a card to long-press here and this
          // sheet only ever targets a runnable source.
          canOpenSettings: true,
          hasUpdate: quickActionUpdate !== null,
          hasHomepage: quickActionHomepage !== null,
        }).map((descriptor) => ({
          ...descriptor,
          label: quickActionLabel(descriptor.id),
          onPress: () => runQuickAction(descriptor.id),
        }))
      : [];

  // An unsupported source's row opens its settings in place, as the long-press
  // 设置 does; the Settings tab stays the place to manage every source.
  const openUnsupportedSourceSettings = (id: string) => {
    setQuickActionSourceId(id);
    setQuickActionSettingsVisible(true);
  };

  const sourceContextActions = (id: string): QuickAction[] => {
    const source = mergedInstalledSources.find((item) => item.id === id);
    if (!source) return [];
    const update = findMobileSourceUpdates([source], available.data)[0];
    const homepage = resolveMobileSourceHomepageUrl(source.packageMetadata?.urls);
    return buildMobileSourceQuickActions({ canOpenSettings: true, hasUpdate: Boolean(update), hasHomepage: Boolean(homepage) }).map((descriptor) => ({
      ...descriptor,
      label: descriptor.id === "update"
        ? formatMobileString(strings.browse.updateSourceToVersion, { version: update?.version ?? "" })
        : quickActionLabel(descriptor.id),
      onPress: () => {
        // UIKit has finished dismissing the menu before presenting a destination.
        switch (descriptor.id) {
          case "settings":
            setQuickActionSourceId(id);
            setQuickActionSettingsVisible(true);
            break;
          case "update":
            if (update) void installSourceRef.current?.(update);
            break;
          case "openInBrowser":
            if (homepage) void Linking.openURL(homepage).catch(() => undefined);
            break;
          case "uninstall":
            setQuickActionUninstall(source);
            setQuickActionUninstallVisible(true);
            break;
        }
      },
    }));
  };


  const addSourceActionDisabled = activeInstallKey !== null;
  const addSourcesLabel = strings.browse.addSources;
  const manageSourcesLabel = strings.browse.manageSources;
  const nativeHeaderActions = useMemo<NemuNativeHeaderAction[]>(() => [
    {
      icon: "plus",
      label: addSourcesLabel,
      disabled: addSourceActionDisabled,
      onPress: openAddSourceSheet,
    },
    // The new design keeps one "+"; sources are managed from Settings.
    ...(mobileDesignExploreFlag ? [] : [{
      icon: "square.stack.3d.up" as const,
      label: manageSourcesLabel,
      onPress: () => {
        router.push({
          pathname: "/(tabs)/settings/[section]",
          params: { section: "sources" },
        });
      },
    }]),
  ], [addSourceActionDisabled, addSourcesLabel, manageSourcesLabel, openAddSourceSheet]);
  // The same elements while the actions are unchanged, so a Browse render
  // (a sheet state change, a keystroke) does not hand the toolbar items to
  // native again.
  const nativeToolbarButtons = useMemo(
    () => renderNemuNativeToolbarButtons(nativeHeaderActions),
    [nativeHeaderActions],
  );

  // Messages at the top of the page. Across the hinge they open the
  // leading column instead of running across both panes.
  const sourceTopCards = actionError || (showSourceUpdateNotice && sourceUpdateNotice && sourceUpdateMessage) ? (
    <>
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
    </>
  ) : null;

  // One language group: its header and its inset list (design-explore) or
  // card grid. Across the hinge a group stays whole in its pane's column.
  const renderSourceSection = (section: (typeof exploreSourceSections)[number]) => {
    const label =
      section.label === EXPLORE_LIBRARY_SECTION
        ? strings.designExplore.browseInLibrary
        : formatSourceLanguageLabel(section.label, strings, appLanguage);
    const group = (
      <Animated.View
        key={section.label}
        ref={mobileDesignExploreFlag ? sourceGroupAnchor.groupRef(section.label) : undefined}
        collapsable={false}
        layout={mobileGridGlideFrameTransition}
        entering={mobileGridGlideAppearing}
        exiting={mobileGridGlideVanishing}
        style={[styles.sourceLanguageSection, mobileDesignExploreFlag ? styles.exploreSourceSection : null]}
      >
        <NemuText
          style={[
            styles.sourceLanguageHeader,
            { color: tokens.mutedForeground },
          ]}
        >
          {label}
        </NemuText>
        {mobileDesignExploreFlag ? (
          // Design-explore: one inset group per language, short rows.
          <Animated.View
            layout={mobileGridGlideFrameTransition}
            style={[
              styles.exploreSourceGroup,
              { backgroundColor: tokens.card, borderColor: tokens.cardBorder },
            ]}
          >
            {section.sources.map((source, index) => (
              // A real view per row (never flattened into the group), so
              // a row moved between sections keeps its own subtree.
              <Animated.View
                key={source.id}
                collapsable={false}
                layout={mobileGridGlideTransition}
                entering={mobileGridGlideAppearing}
                exiting={mobileGridGlideVanishing}
              >
                {index > 0 ? (
                  <View style={[styles.exploreSourceSeparator, { backgroundColor: tokens.border }]} />
                ) : null}
                {source.unsupported ? (
                  <UnsupportedSourceRow
                    source={source}
                    strings={strings}
                    onPress={() => openUnsupportedSourceSettings(source.id)}
                  />
                ) : (
                  <MobileQuickActionMenu
                    actions={sourceContextActions(source.id)}
                    // The group draws the row's fill, so the lifted preview
                    // was clear: the row carries the group's colour itself
                    // (no change at rest) and lifts with the group's corners.
                    style={{ backgroundColor: tokens.card }}
                    cornerRadius={MOBILE_EXPLORE_RADIUS.group}
                  >
                  <SourceCard
                    compact
                    item={
                      source.registryId === mainRegistry && !source.exploreKeepSubtitle
                        ? { ...source, subtitle: undefined }
                        : source
                    }
                    onLongPress={mobileNativeQuickMenuAvailable ? undefined : () => {
                      void hapticSelection();
                      quickActionDismissRef.current = null;
                      setQuickActionSourceId(source.id);
                      setQuickActionVisible(true);
                    }}
                  />
                  </MobileQuickActionMenu>
                )}
              </Animated.View>
            ))}
          </Animated.View>
        ) : (
        <View style={styles.sourceGrid}>
          {chunkMobileGridRows(section.sources, sourceGrid.columns).map((row, rowIndex) => (
            <MobilePoseLayoutView key={rowIndex} style={styles.sourceGridRow}>
              {row.map((source, column) => (
                // Folding glides each card to its pane (pose settle spring).
                <MobilePoseLayoutView key={source.id} style={mobileFoldAwareGridCellStyle(sourceGrid, column)}>
                  {source.unsupported ? (
                    <UnsupportedSourceRow
                      source={source}
                      strings={strings}
                      onPress={() => openUnsupportedSourceSettings(source.id)}
                    />
                  ) : (
                    <MobileQuickActionMenu actions={sourceContextActions(source.id)}>
                      <SourceCard
                        item={source}
                        onLongPress={mobileNativeQuickMenuAvailable ? undefined : () => {
                          void hapticSelection();
                          quickActionDismissRef.current = null;
                          setQuickActionSourceId(source.id);
                          setQuickActionVisible(true);
                        }}
                      />
                    </MobileQuickActionMenu>
                  )}
                </MobilePoseLayoutView>
              ))}
            </MobilePoseLayoutView>
          ))}
        </View>
        )}
      </Animated.View>
    );
    // Design-explore: a group glides to its new place in its column (pose
    // settle spring) when the columns move.
    return mobileDesignExploreFlag ? (
      <MobilePoseLayoutView key={section.label}>{group}</MobilePoseLayoutView>
    ) : group;
  };

  return (
    <>
      {usesNativeHeader ? (
        <>
          <Stack.Screen
            options={createNemuNativeScreenOptions(tokens, strings.nav.browse, verticalBarSide)}
          />
          <Stack.Toolbar placement="right">
            {nativeToolbarButtons}
          </Stack.Toolbar>
        </>
      ) : null}
      <PageScaffold
        nativeHeader={usesNativeHeader}
        scrollRef={browseScrollRef}
        onScroll={mobileDesignExploreFlag ? sourceGroupAnchor.onScroll : undefined}
        // No sources: the empty state fills the viewport and only rubber-bands.
        fillViewport={showNoSourcesEmpty}
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
          <View style={[styles.sections, showNoSourcesEmpty ? styles.fillGrow : null]}>
            {sourceListSplit ? null : sourceTopCards}

            <View style={showNoSourcesEmpty ? styles.fillGrow : undefined}>
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
                <View
                  ref={sourceGridContainer.ref}
                  onLayout={sourceGridContainer.onLayout}
                  style={mobileDesignExploreFlag ? styles.sourceColumnsRow : styles.availableList}
                >
                  {mobileDesignExploreFlag ? (
                    // Stable column keys (as Settings' split panes): a column
                    // keeps its groups mounted while the window turns, its
                    // frame on the pose layout transition; the trailing one
                    // fades in when the panes appear (pose entering/exiting,
                    // only inside a pose change, so a first mount just shows).
                    // The frame transition only moves the column's own frame:
                    // its groups were laid out at the new width at once, so
                    // unfolding snapped each row's trailing edge and chevron
                    // ~17pt in one frame while the column glided (build 9 r2
                    // E). The content now follows the width on the same
                    // spring, laid out at each in-between width.
                    sourceColumns.map((column, columnIndex) => (
                      <MobilePoseLayoutView
                        key={`col-${columnIndex}`}
                        entering={sourcePose.entering}
                        exiting={sourcePose.exiting}
                        style={{ width: column.width, marginLeft: column.marginLeft }}
                      >
                        <MobilePoseWidthSpringView width={column.width} style={styles.sourceColumn}>
                          {columnIndex === 0 && sourceListSplit ? sourceTopCards : null}
                          {exploreSourceSections.map((section, sectionIndex) =>
                            (sourceGroupColumns[sectionIndex] ?? 0) === columnIndex ? renderSourceSection(section) : null,
                          )}
                        </MobilePoseWidthSpringView>
                      </MobilePoseLayoutView>
                    ))
                  ) : (
                    exploreSourceSections.map(renderSourceSection)
                  )}
                </View>
              ) : (
                <MobilePaneAlignedView fill>
                  {({ minHeight }) => (
                    <MobilePageEmpty
                      fill
                      minHeight={minHeight}
                      icon="globe-outline"
                      title={strings.browse.noSources}
                      description={strings.browse.noSourcesDescription}
                      actionLabel={strings.browse.addSource}
                      onActionPress={openAddSourceSheet}
                    />
                  )}
                </MobilePaneAlignedView>
              )}
            </View>
          </View>
        )}
      </PageScaffold>

      {activeSheet === "add-source" ? (
        <MobileNativeSheetScaffold
          visible={activeSheetVisible}
          presentRequest={addSourcePresentRequest}
          onClose={closeAddSourceSheet}
          onDismiss={handleAddSourceSheetDismissed}
          onHardwareBackPress={addDirectoryInBody ? () => {
            closeAddSourcesPages();
            return true;
          } : undefined}
          title={addDirectoryInBody
            ? strings.browse.addSourceDirectory
            : serverPickerInBody ? strings.selfHosted.connectServer : strings.browse.addSources}
          dismissLabel={strings.common.close}
          enablePanDownToClose={!(addSourcesPage !== undefined && addSourcesPageBlocksDismiss)}
          wrapIosHostedContent={(hostedContent) => (
            <MobileAddSourcesStack
              path={addSourcesPath}
              onPathChange={setAddSourcesPath}
              onDirectoryAdded={handleDirectoryAdded}
              onServerConnected={handleServerConnected}
              onDismissBlockedChange={setAddSourcesPageBlocksDismiss}
            >
              {hostedContent}
            </MobileAddSourcesStack>
          )}
          headerLeading={serverPickerInBody || addDirectoryInBody ? (
            <NemuNativeSheetHeaderAction
              accessibilityLabel={strings.common.back}
              androidIcon="chevron-back"
              iosSystemImage="chevron.backward"
              onPress={closeAddSourcesPages}
            />
          ) : (
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
          )}
          // Opens at the first detent (75%); iOS drags up to the second
          // (100%). The scaffold maps the first onto Android's
          // content-wrapping Material sheet.
          snapPoints={ADD_SOURCE_SHEET_SNAP_POINTS}
          fillContent
          contentBottomInset={0}
          contentIgnoresSafeAreaEdges="horizontal"
          testID="AddSourceSheet"
        >
          {addDirectoryInBody ? (
            <MobileAddSourcesDirectoryPage
              open
              onAdded={handleDirectoryAdded}
              onDismissBlockedChange={setAddSourcesPageBlocksDismiss}
            />
          ) : serverPickerInBody ? (
            <NemuSheetScrollEdge>
              {(edge) => (
                <ScrollView {...edge} contentContainerStyle={styles.serverPicker}>
                  {SELF_HOSTED_SETUP_KINDS.map((kind) => (
                    <BuiltInSourceRow key={kind} kind={kind} strings={strings} onPress={openServerForm} />
                  ))}
                </ScrollView>
              )}
            </NemuSheetScrollEdge>
          ) : <View style={styles.addSourceSheetBody} onLayout={handleAddSourceSheetBodyLayout}>
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

              {selectedLanguages.size > 0 || adultShown || focusedDirectory ? (
                <View style={styles.activeFilterChips}>
                  {focusedDirectory ? (
                    <ActiveFilterChip
                      label={formatMobileString(strings.browse.directoryFilterChip, {
                        name: focusedDirectory.name,
                      })}
                      removeLabel={strings.common.remove}
                      onPress={() => setDirectoryFocus(null)}
                      wrapLabel
                    />
                  ) : null}
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
                  {adultShown ? (
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

            <AddSourceListAfterSheetLayout>
            <NemuSheetScrollEdge style={styles.availableListScroller}>
              {(edge) => (
                <SectionList
                  {...edge}
                  // Focused on a just-added directory: its sources alone.
                  ListHeaderComponent={builtInKinds.length > 0 && !directoryFocus ? (
                    <NemuPressable
                      accessibilityRole="button"
                      onPress={openServerPicker}
                      accessibilityLabel={strings.selfHosted.connectServer}
                      pressHighlight
                      style={[
                        styles.serverEntry,
                        { backgroundColor: sheetTokens.card, borderColor: sheetTokens.border },
                      ]}
                    >
                      {/* The servers stack into a source row's 44pt icon slot, each
                          ringed in the card colour so the overlaps read as tiles. */}
                      <View style={styles.serverEntryIcons}>
                        {SELF_HOSTED_SETUP_KINDS.map((kind, index) => (
                          <View
                            key={kind}
                            style={[
                              styles.serverEntryIconRing,
                              kind === "suwayomi" ? styles.serverEntryIconRingRound : null,
                              { left: index * 10 - 1.5, borderColor: sheetTokens.card },
                            ]}
                          >
                            <ServerIconImage source={SERVER_ICONS[kind]} style={styles.serverEntryIcon} resizeMode="contain" />
                          </View>
                        ))}
                      </View>
                      <NemuText numberOfLines={1} style={[styles.serverEntryLabel, { color: sheetTokens.foreground }]}>{strings.selfHosted.connectServer}</NemuText>
                      <Ionicons name="chevron-forward" size={16} color={sheetTokens.mutedForeground} style={{ marginRight: -4 }} />
                    </NemuPressable>
                  ) : undefined}
                  // Android: inside a native sheet, hand the drag to the sheet at the top.
                  nestedScrollEnabled
                  alwaysBounceVertical={false}
                  automaticallyAdjustContentInsets={false}
                  contentInsetAdjustmentBehavior="never"
                  initialNumToRender={10}
                  maxToRenderPerBatch={18}
                  keyboardDismissMode="interactive"
                  keyboardShouldPersistTaps="handled"
                  sections={availableSourceSections}
                  keyExtractor={availableSourceKeyExtractor}
                  renderSectionHeader={renderAvailableSectionHeader}
                  renderItem={renderAvailableSourceRow}
                  ItemSeparatorComponent={AvailableRowSeparator}
                  SectionSeparatorComponent={AvailableSectionSeparator}
                  CellRendererComponent={MobileListChangeCell}
                  ListFooterComponent={
                    sourceDirectories.loading || directoryFocus ? undefined : (
                      <SourceDirectoryGuide
                        prominent={!hasMobileUserSourceDirectory(sourceDirectories.directories)}
                        strings={strings}
                        onPress={openAddDirectory}
                      />
                    )
                  }
                  ListEmptyComponent={
                    // A just-added directory's sources may still be loading.
                    directoryFocus && available.loading ? (
                      <ActivityIndicator style={styles.directoryFocusLoading} color={sheetTokens.primary} />
                    ) : <View
                      style={[
                        styles.inlineEmpty,
                        {
                          backgroundColor: sheetTokens.card,
                          borderColor: sheetTokens.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="filter-outline"
                        size={22}
                        color={sheetTokens.mutedForeground}
                      />
                      <NemuText
                        style={[
                          styles.inlineEmptyText,
                          { color: sheetTokens.mutedForeground },
                        ]}
                      >
                        {strings.browse.noSourceResults}
                      </NemuText>
                    </View>}
                  style={styles.availableListScroller}
                  contentContainerStyle={styles.availableListContent}
                  stickySectionHeadersEnabled={false}
                  updateCellsBatchingPeriod={32}
                  windowSize={7}
                />
              )}
            </NemuSheetScrollEdge>
            </AddSourceListAfterSheetLayout>
          </View>}
        </MobileNativeSheetScaffold>
      ) : null}

      {activeSheet === "source-language" ? (
        <MobileNativeSheetScaffold
          visible={activeSheetVisible}
          onClose={closeLanguageSheet}
          onDismiss={handleLanguageSheetDismissed}
          title={strings.browse.languageFilter}
          dismissLabel={strings.common.close}
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
            showAdult={adultShown}
            onToggleAdult={
              hasExplicitSources ? () => setShowAdult((value) => !value) : null
            }
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

/** Key of the design-explore "In Your Library" group among the language groups. */
const EXPLORE_LIBRARY_SECTION = "explore:library";

const styles = StyleSheet.create({
  exploreSourceSection: {
    // The page's width between its gutters on every window, as Library and
    // Settings use it (a 640pt centred column left most of an iPad empty).
    width: "100%",
  },
  exploreSourceGroup: {
    borderRadius: MOBILE_EXPLORE_RADIUS.group,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  exploreSourceSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14 + 40 + 12,
  },
  sections: {
    gap: 26,
  },
  fillGrow: {
    flexGrow: 1,
  },
  serverPicker: { gap: 12, paddingTop: 12, paddingBottom: 24 },
  // A source row's card and columns (`availableShell`, `availableRow`), so
  // icons, label and chevron line up with the rows below.
  serverEntry: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    // The gap between language groups (`availableSectionSeparator`): the
    // first header belongs to the rows beneath it, not to this card.
    marginBottom: 18,
  },
  serverEntryIcons: { width: 44, height: 24 },
  // The ring sits outside the 24pt icon, as a shadow ring would.
  serverEntryIconRing: {
    position: "absolute",
    top: -1.5,
    width: 27,
    height: 27,
    borderRadius: 7.5,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  // Suwayomi's mark is a circle.
  serverEntryIconRingRound: { borderRadius: 13.5 },
  serverEntryIcon: { width: 24, height: 24 },
  serverEntryLabel: { flex: 1, fontSize: 15, fontWeight: nemuFontWeight.medium },
  directoryGuide: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 18,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  directoryGuideText: { flex: 1, gap: 2 },
  directoryGuideLabel: { fontSize: 15, fontWeight: nemuFontWeight.medium },
  directoryGuideDetail: { fontSize: 13, lineHeight: 17 },
  directoryFocusLoading: { paddingVertical: 24 },
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
  // Explicit rows; column spacing is each cell's marginLeft so the middle
  // gutter can equal the fold in book posture.
  sourceGrid: {
    gap: 12,
  },
  sourceGridRow: {
    flexDirection: "row",
  },
  availableList: {
    gap: 18,
  },
  // Design-explore: the group columns side by side (one, or one a pane).
  sourceColumnsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  sourceColumn: {
    gap: MOBILE_SOURCE_GROUP_GAP,
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
    // Rounded-corner tail: ~36pt under the last row at full scroll.
    paddingBottom: 36,
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
    // The Install button's slot, so the text column holds still; the status
    // ends where the button does.
    width: 112,
    minHeight: 32,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
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
