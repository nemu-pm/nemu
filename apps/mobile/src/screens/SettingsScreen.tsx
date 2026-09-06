import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ImageSourcePropType,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import SegmentedControl from "@expo/ui/community/segmented-control";
import {
  Host as SwiftHost,
  Picker as SwiftPicker,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden as swiftAccessibilityHidden,
  disabled as swiftDisabled,
  pickerStyle,
  tag,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { Stack, router, useLocalSearchParams, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { nextSyncTimestamp } from "@nemu/core";
import { MobileAboutSheet } from "@/components/MobileAboutSheet";
import { MobileAgentStatusCard } from "@/components/MobileAgentStatusCard";
import { MobileCloudSyncCard } from "@/components/MobileCloudSyncCard";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import { MobileSettingsSkeleton } from "@/components/MobileSettingsSkeleton";
import { MobileSourceSettingsCard } from "@/components/MobileSourceSettingsCard";
import { MobileStorageBreakdown } from "@/components/MobileStorageBreakdown";
import dualReadIconImage from "../../../../src/lib/plugins/builtin/dual-reader/icon.png";
import japaneseLearningIconImage from "../../../../src/lib/plugins/builtin/japanese-learning/icon.png";
import { useMobileDataStore } from "@/data/mobileDataContext";
import {
  emitMobileDataChanged,
  emitMobileSettingsDataChanged,
} from "@/data/mobileDataEvents";
import {
  useAvailableSources,
  type MobileDataClearMode,
  useMobileDataManagement,
  useInstalledSources,
  useMobileLanguageSettings,
  useMobileFeedbackSettings,
  useMobileReaderPlugins,
  useReadingMode,
  useSourceSettings,
} from "@/data/mobileHooks";
import type {
  AppLanguage,
  InstalledSource,
  MetadataLanguagePreference,
  ReadingMode,
  SourcePackageSetting,
  ThemePreference,
} from "@/data/schema";
import {
  MobileChip,
  MobileNativeSheetScaffold,
  NemuButton,
  NemuNativeSwitch,
  NemuPressable,
  NemuText,
  PageScaffold,
  radius,
  nemuBrandTextStyle,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  useNemuTheme,
} from "@/design-system";
import {
  hapticConfirm,
  hapticError,
  hapticPress,
  hapticSelection,
} from "@/lib/haptics";
import { canRunMobileSwitchSelectionFeedback } from "@/lib/mobileAccessibility";
import {
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
} from "@/lib/mobileSourceErrors";
import {
  getMobileInstalledSourceRegistryRef,
  getMobileInstalledSourceSettingsKeys,
} from "@/lib/mobileInstalledSourceKeys";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import {
  isMobileUnsupportedInstalledSource,
  mergeMobileInstalledSourceRegistryMetadata,
} from "@/lib/mobileBrowseSources";
import {
  canRetryMobileSourceSettingsLoadError,
  countRenderableSourceSettings,
  countVisibleSourceSettings,
  getMobileSourceSettingsNavigationResetKey,
  makeMobileSourceKey,
  sourceSettingRequestsDataRefresh,
} from "@/lib/mobileSourceSettings";
import { removeMobileSourceAfterSettingsCleanup } from "@/lib/mobileSourceUninstall";
import { clearMobileSourceDetailCacheForSource } from "@/lib/mobileSourceDetailCache";
import { normalizeMobileSourceExternalUrl } from "@/lib/mobileSourceExternalUrl";
import {
  resolveMobileSourceSettingAction,
  type MobileSourceLoginSubmission,
} from "@/lib/mobileSourceSettingActions";
import { getMobileSourceBrowseHref } from "@/lib/mobileSourceRoutes";
import {
  canRetryMobileSettingsLoadError,
  canRunMobileSettingsSelection,
  canStartMobileSettingsAction,
  getMobileSettingsMutationResultAction,
  isMobileSettingsActionBusy,
  shouldRenderMobileSettingsSkeletonForSection,
  shouldRenderMobileSourcesSectionLoading,
  type MobileSettingsActionState,
} from "@/lib/mobileSettingsActions";
import { getMobileSettingsSheetLayout } from "@/lib/mobileSettingsSheetLayout";
import {
  getMobileInstalledSourceName,
  getMobileInstalledSourceSubtitle,
} from "@/lib/mobileInstalledSourcePresentation";
import {
  buildMobileSourceIconIndex,
  resolveMobileInstalledSourceIconUri,
} from "@/lib/mobileSourceIconResolution";
import {
  MobileInstalledSourceSettingsSheet,
  MobileSourceIcon as SourceIcon,
} from "@/components/MobileInstalledSourceSettingsSheet";
import { useMobileSourceSettingsTransientSheets } from "@/components/useMobileSourceSettingsTransientSheets";
import {
  isMobileSourceSettingsConfirmation,
  resolveMobileFirstQueuedSheetHandoff,
  resolveMobileSourceSettingsPostDismissAction,
  shouldReopenMobileSourceSettingsAfterConfirmation,
} from "@/lib/mobileSettingsSheetHandoff";
import {
  makeMobileRuntimeSourceKey,
  normalizeInstalledSource,
  resolveMobileSourcePackageCacheKey,
} from "@/sources/mobileSourceRuntime";
import { defaultMobileSourceSessionCache } from "@/sources/mobileSourceExecutorCache";
import {
  completeMobileSourceLogin,
  completeMobileSourceLogout,
  getMobileSourceLoginCapabilities,
  isMobileSourceLoginCancellation,
  resetMobileSourceRuntimeSettings,
  runMobileSourceSettingsOperation,
  type MobileSourceLoginCapabilities,
  type MobileSourceSettingsOperation,
} from "@/sources/mobileSourceSettingsExecutor";
import { clearMobileAidokuSandboxDataForSource } from "@/sources/mobileAidokuSandboxData";
import {
  cacheImportedAixSourcePackage,
  clearCachedSourcePackage,
} from "@/sources/sourcePackageCache";
import {
  MOBILE_CUSTOM_AIDOKU_REGISTRY,
  MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
  buildImportedAixInstalledSource,
} from "@/sources/mobileSourceImport";
import { clearMobileSourceImageRequestCache } from "@/sources/mobileSourceImages";
import { mobileAuthClient } from "@/sync/mobileAuthClient";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";

const EMPTY_SOURCE_SETTINGS: SourcePackageSetting[] = [];

type SettingsConfirmation =
  | { type: "uninstall-source"; source: InstalledSource; name: string }
  | { type: "clear-cache" }
  | { type: "clear-all-data" }
  | { type: "source-logout"; setting: SourcePackageSetting }
  | { type: "source-button"; setting: SourcePackageSetting };

type SourceSettingsConfirmation = Extract<
  SettingsConfirmation,
  { type: "source-logout" | "source-button" }
>;

const readingModes: Array<{
  mode: ReadingMode;
  labelKey: keyof MobileStrings["reader"];
}> = [
  { mode: "rtl", labelKey: "rtl" },
  { mode: "ltr", labelKey: "ltr" },
  { mode: "scrolling", labelKey: "scroll" },
];

function sourceParts(source: InstalledSource): {
  registryId: string;
  sourceId: string;
} {
  return getMobileInstalledSourceRegistryRef(source);
}

function ResolvedSettingsImage({
  accessibilityLabel,
  source,
  style,
  onError,
}: {
  accessibilityLabel?: string;
  source: ImageSourcePropType;
  style: StyleProp<ImageStyle>;
  onError: () => void;
}) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={accessibilityLabel}
      fadeDuration={0}
      onError={onError}
      resizeMode="cover"
      source={source}
      style={style}
    />
  );
}

function sourceName(source: InstalledSource): string {
  return getMobileInstalledSourceName(source);
}

function sourceSettingsKey(source: InstalledSource): string {
  const { registryId, sourceId } = sourceParts(source);
  return makeMobileSourceKey(registryId, sourceId);
}

function appLanguageModes(
  strings: MobileStrings,
): Array<{ value: AppLanguage; label: string }> {
  return [
    { value: "en", label: strings.settings.languageEnglish },
    { value: "zh", label: strings.settings.languageChinese },
    { value: "ja", label: strings.settings.languageJapanese },
  ];
}

function themeModes(
  strings: MobileStrings,
): Array<{ value: ThemePreference; label: string }> {
  return [
    { value: "system", label: strings.settings.themeSystem },
    { value: "light", label: strings.settings.themeLight },
    { value: "dark", label: strings.settings.themeDark },
  ];
}

function metadataLanguageModes(
  strings: MobileStrings,
): Array<{ value: MetadataLanguagePreference; label: string }> {
  return [
    { value: "auto", label: strings.settings.metadataLanguageAuto },
    ...appLanguageModes(strings),
  ];
}

function languageLabel(language: AppLanguage, strings: MobileStrings): string {
  return (
    appLanguageModes(strings).find((mode) => mode.value === language)?.label ??
    strings.settings.languageEnglish
  );
}

function sourceSubtitle(source: InstalledSource): string {
  return getMobileInstalledSourceSubtitle(source);
}

function SourceManagementRow({
  source,
  iconUri,
  strings,
  removing,
  disabled,
  onBrowse,
  onSettings,
  onRemove,
}: {
  source: InstalledSource;
  iconUri: string | null;
  strings: MobileStrings;
  removing: boolean;
  disabled: boolean;
  onBrowse: () => void;
  onSettings: () => void;
  onRemove: () => void;
}) {
  const { tokens } = useNemuTheme();
  const name = sourceName(source);
  const removeDisabled = disabled || removing;
  const canOpenSettings = !disabled;
  // Tachiyomi records can arrive through cloud sync; this build cannot run
  // them, so the row says so up front instead of failing on tap.
  const unsupported = isMobileUnsupportedInstalledSource(source);
  const browseDisabled = disabled || unsupported;

  return (
    <View style={[styles.sourceEmbeddedRow, { borderColor: tokens.border }]}>
      <NemuPressable
        accessibilityLabel={
          unsupported
            ? `${name}. ${strings.common.sourceUnsupported}`
            : formatMobileString(strings.settings.browseSource, { name })
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: browseDisabled }}
        disabled={browseDisabled}
        hapticFeedback={browseDisabled ? "none" : "press"}
        onPress={() => {
          if (browseDisabled) return;
          onBrowse();
        }}
        pressedScale={0.985}
        containerStyle={styles.sourceMainContainer}
        style={[styles.sourceMain, browseDisabled && styles.disabledMain]}
      >
        <SourceIcon icon={iconUri} />
        <View style={styles.sourceText}>
          <View style={styles.sourceTitleRow}>
            <NemuText
              numberOfLines={1}
              style={[
                styles.rowTitle,
                styles.sourceTitle,
                { color: tokens.foreground },
              ]}
            >
              {name}
            </NemuText>
            <MobileChip
              accessibilityLabel={`v${source.version}`}
              label={`v${source.version}`}
              size="sm"
              variant="static"
            />
            {unsupported ? (
              <MobileChip
                accessibilityLabel={strings.common.sourceUnsupportedBadge}
                label={strings.common.sourceUnsupportedBadge}
                size="sm"
                variant="static"
              />
            ) : null}
          </View>
          <NemuText
            numberOfLines={2}
            style={[styles.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {unsupported
              ? strings.common.sourceUnsupportedTachiyomiDescription
              : sourceSubtitle(source)}
          </NemuText>
        </View>
      </NemuPressable>
      <View style={styles.sourceActions}>
        <NemuButton
          accessibilityLabel={formatMobileString(
            strings.settings.editSourceSettings,
            { name },
          )}
          accessibilityState={{ disabled }}
          disabled={disabled}
          hapticFeedback={canOpenSettings ? "press" : "none"}
          icon="settings-outline"
          onPress={() => {
            if (!canOpenSettings) return;
            onSettings();
          }}
          size="icon-sm"
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={formatMobileString(
            strings.settings.uninstallSourceNamed,
            { name },
          )}
          accessibilityState={{
            disabled: removeDisabled,
            busy: removing || undefined,
          }}
          disabled={removeDisabled}
          icon="trash-outline"
          loading={removing}
          onPress={onRemove}
          size="icon-sm"
          variant="destructive"
        />
      </View>
    </View>
  );
}

/**
 * `row` is the boxed 40pt list artwork. `title` is the bare mark that sits on
 * the baseline of a sheet title: no tinted frame, sized to the title line box
 * so the icon and the title read as one centered unit.
 */
function ReaderPluginIcon({
  plugin,
  placement = "row",
}: {
  plugin: MobileReaderPluginState;
  placement?: "row" | "title";
}) {
  const { tokens } = useNemuTheme();
  const [failed, setFailed] = useState(false);
  const source =
    plugin.id === "japanese-learning"
      ? readerPluginArtworkSources["japanese-learning"]
      : plugin.id === "dual-reader"
        ? readerPluginArtworkSources["dual-reader"]
        : null;
  const inTitle = placement === "title";
  const frameStyle = inTitle
    ? styles.pluginTitleArtwork
    : [styles.pluginArtwork, { backgroundColor: tokens.sourceIconGlass }];

  if (source && !failed) {
    return (
      <View style={frameStyle}>
        <ResolvedSettingsImage
          accessibilityLabel={plugin.name}
          source={source}
          style={styles.pluginArtworkImage}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={frameStyle}>
      <Ionicons
        name={plugin.icon}
        size={inTitle ? 22 : 20}
        color={plugin.enabled ? tokens.primary : tokens.mutedForeground}
      />
    </View>
  );
}

function ReaderPluginManagementRow({
  plugin,
  strings,
  selected,
  disabled,
  embedded = false,
  onSelect,
  onToggle,
}: {
  plugin: MobileReaderPluginState;
  strings: MobileStrings;
  selected: boolean;
  disabled: boolean;
  embedded?: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { tokens } = useNemuTheme();
  const selectDisabled = disabled || !plugin.enabled;
  const hasSettings = countRenderableSourceSettings(plugin.settings) > 0;
  const canOpenSettings = hasSettings && !selectDisabled;

  const rowContent = (
    <>
      <View style={[styles.pluginMain, !plugin.enabled && styles.disabledMain]}>
        <ReaderPluginIcon plugin={plugin} />
        <View style={styles.sourceText}>
          <NemuText
            numberOfLines={1}
            style={[styles.settingTitle, { color: tokens.foreground }]}
          >
            {plugin.name}
          </NemuText>
          <NemuText
            numberOfLines={2}
            style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
          >
            {plugin.description}
          </NemuText>
        </View>
      </View>
      <View style={styles.pluginActions}>
        {hasSettings ? (
          <NemuButton
            accessibilityLabel={formatMobileString(
              strings.settings.editReaderPluginSettings,
              {
                name: plugin.name,
              },
            )}
            accessibilityState={{ disabled: selectDisabled }}
            disabled={selectDisabled}
            hapticFeedback={canOpenSettings ? "press" : "none"}
            icon="settings-outline"
            onPress={() => {
              if (!canOpenSettings) return;
              onSelect();
            }}
            size="icon-sm"
            testID={`ReaderPluginSettings:${plugin.id}`}
            variant="secondary"
          />
        ) : null}
        <NemuNativeSwitch
          accessibilityLabel={formatMobileString(
            strings.settings.readerPluginSwitch,
            {
              name: plugin.name,
            },
          )}
          disabled={disabled}
          value={plugin.enabled}
          onValueChange={(nextValue) => {
            if (
              !canRunMobileSwitchSelectionFeedback({
                checked: plugin.enabled,
                disabled,
                nextChecked: nextValue,
              })
            ) {
              return;
            }
            void hapticSelection();
            onToggle(nextValue);
          }}
        />
      </View>
    </>
  );

  if (embedded) {
    return (
      <View
        style={[
          styles.pluginEmbeddedRow,
          { borderColor: tokens.border },
          selected &&
            plugin.enabled && {
              backgroundColor: nemuColorWithAlpha(tokens.primary, 0.03),
            },
        ]}
      >
        {rowContent}
      </View>
    );
  }

  return (
    <SettingsSurface
      style={[
        styles.pluginRowShell,
        selected &&
          plugin.enabled && {
            backgroundColor: nemuColorWithAlpha(tokens.primary, 0.03),
          },
      ]}
      contentStyle={styles.pluginRow}
    >
      {rowContent}
    </SettingsSurface>
  );
}

function MobileReaderPluginSettingsSheet({
  plugin,
  strings,
  visible,
  disabled,
  loading,
  error,
  retryDisabled,
  retrying,
  onClose,
  onRetry,
  onReset,
  onChange,
}: {
  plugin: MobileReaderPluginState;
  strings: MobileStrings;
  visible: boolean;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  retryDisabled: boolean;
  retrying: boolean;
  onClose: () => void;
  onRetry: () => void;
  onReset: () => void;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const sheetLayout = getMobileSettingsSheetLayout({
    fontScale,
    height,
    rowCount: countVisibleSourceSettings(plugin.settings, plugin.values),
    width,
  });
  // Multi-select and string-list settings open their dedicated sheets through
  // the shared dismiss-then-present handoff (this sheet has no login rows).
  const transientSheets = useMobileSourceSettingsTransientSheets({
    visible,
    disabled,
    values: plugin.values,
    strings,
    onChange,
    onClose,
  });

  return (
    <>
      <MobileNativeSheetScaffold
        {...transientSheets.settingsSheetProps}
        scroll={sheetLayout.scroll}
        snapPoints={sheetLayout.snapPoint ? [sheetLayout.snapPoint] : undefined}
        testID={`ReaderPluginSettingsSheet:${plugin.id}`}
      >
        {/*
          The plugin mark belongs to the title, not to the sheet chrome: a
          leading header slot leaves the icon stranded in the top-left corner
          while the title stays optically centered. Compose both into one
          centered row and center the description under it.
        */}
        <View style={styles.pluginSheetHeader}>
          <View style={styles.pluginSheetTitleRow}>
            <ReaderPluginIcon plugin={plugin} placement="title" />
            <NemuText
              accessibilityRole="header"
              color={tokens.foreground}
              density="compact"
              numberOfLines={2}
              style={styles.pluginSheetTitle}
              variant="sheetTitle"
            >
              {plugin.name}
            </NemuText>
          </View>
          {plugin.description ? (
            <NemuText
              color={tokens.mutedForeground}
              density="compact"
              style={styles.pluginSheetDescription}
              variant="rowSubtitle"
            >
              {plugin.description}
            </NemuText>
          ) : null}
        </View>
        <MobileSourceSettingsCard
          settings={plugin.settings}
          values={plugin.values}
          loading={loading}
          error={error}
          title={strings.settings.pluginSettings}
          hideSubtitle
          navigationResetKey={plugin.id}
          emptyMessage={strings.settings.noPluginSettings}
          showEmpty
          disabled={disabled}
          retryDisabled={retryDisabled}
          retrying={retrying}
          onRetry={onRetry}
          onReset={onReset}
          onChange={onChange}
          {...transientSheets.cardProps}
        />
      </MobileNativeSheetScaffold>
      {transientSheets.renderTransientSheet()}
    </>
  );
}

function ClearCloudDataOption({
  checked,
  disabled,
  strings,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  strings: MobileStrings;
  onToggle: () => void;
}) {
  const { tokens } = useNemuTheme();
  const { data: cloudSession } = mobileAuthClient.useSession();
  if (!cloudSession?.user) return null;

  return (
    <NemuPressable
      accessibilityLabel={strings.settings.clearCloudData}
      accessibilityRole="checkbox"
      accessibilityState={{
        checked,
        disabled,
      }}
      disabled={disabled}
      hapticFeedback="selection"
      onPress={onToggle}
      pressedScale={0.985}
      style={[
        styles.cloudClearOption,
        {
          backgroundColor: checked
            ? nemuColorWithAlpha(tokens.danger, 0.07)
            : tokens.muted,
          borderColor: checked ? tokens.danger : tokens.border,
          opacity: disabled ? 0.72 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.cloudClearCheck,
          {
            backgroundColor: checked ? tokens.danger : "transparent",
            borderColor: checked ? tokens.danger : tokens.border,
          },
        ]}
      >
        {checked ? (
          <Ionicons
            name="checkmark"
            size={13}
            color={tokens.primaryForeground}
          />
        ) : null}
      </View>
      <View style={styles.cloudClearCopy}>
        <NemuText
          density="compact"
          style={[styles.cloudClearTitle, { color: tokens.foreground }]}
        >
          {strings.settings.clearCloudData}
        </NemuText>
        <NemuText
          density="compact"
          style={[
            styles.cloudClearDescription,
            { color: tokens.mutedForeground },
          ]}
        >
          {strings.settings.clearCloudDataDescription}
        </NemuText>
      </View>
    </NemuPressable>
  );
}

type SettingsSegmentedOption<Value extends string> = {
  value: Value;
  label: string;
};

function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((nextEnabled) => {
      if (mounted) setEnabled(nextEnabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export type SettingsSectionId = "reader" | "sources" | "appearance" | "data";

function settingsSectionHref(
  section: SettingsSectionId,
  params: Record<string, string> = {},
): Href {
  return {
    pathname: "/(tabs)/settings/[section]",
    params: { ...params, section },
  };
}

const readerPluginArtworkSources = {
  "dual-reader": Image.resolveAssetSource(dualReadIconImage),
  "japanese-learning": Image.resolveAssetSource(japaneseLearningIconImage),
} as const;

function SettingsSurface({
  children,
  contentStyle,
  style,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.settingsSurface,
        { backgroundColor: tokens.card, borderColor: tokens.border },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

function PressableSettingsSurface({
  accessibilityLabel,
  children,
  contentStyle,
  disabled,
  hapticFeedback = "press",
  onPress,
  pressedScale = 0.985,
  style,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hapticFeedback?:
    | "press"
    | "selection"
    | "confirm"
    | "warning"
    | "error"
    | "none";
  onPress: () => void;
  pressedScale?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { tokens } = useNemuTheme();

  return (
    <NemuPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hapticFeedback={hapticFeedback}
      onPress={onPress}
      pressedScale={pressedScale}
      style={[
        styles.settingsSurface,
        { backgroundColor: tokens.card, borderColor: tokens.border },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </NemuPressable>
  );
}

function SettingsSegmentedPicker<Value extends string>({
  accessibilityLabel,
  disabled,
  interactionLocked = false,
  options,
  value,
  onSelect,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  interactionLocked?: boolean;
  options: Array<SettingsSegmentedOption<Value>>;
  value: Value;
  onSelect: (value: Value) => void;
}) {
  const { scheme, tokens } = useNemuTheme();
  const screenReaderEnabled = useScreenReaderEnabled();
  const interactionBlocked = disabled || interactionLocked;
  const [optimisticValue, setOptimisticValue] = useState<Value | null>(null);
  const displayedValue = optimisticValue ?? value;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === displayedValue),
  );
  const selectValue = (nextValue: Value) => {
    if (interactionBlocked || nextValue === displayedValue) return;
    // Preserve the native control's new selection while the async settings
    // mutation catches up. Otherwise an intermediate render can briefly feed
    // the old controlled value back into SwiftUI and make the thumb flash.
    setOptimisticValue(nextValue);
    requestAnimationFrame(() => {
      setOptimisticValue((current) =>
        current === nextValue ? null : current,
      );
    });
    void hapticSelection();
    onSelect(nextValue);
  };

  if (Platform.OS === "ios") {
    return (
      <View style={styles.nativeSegmentedIOSContainer}>
        <SwiftHost
          colorScheme={scheme}
          matchContents={{ horizontal: false, vertical: true }}
          style={styles.nativeSegmentedHost}
        >
          <SwiftPicker
            label={accessibilityLabel}
            modifiers={[
              swiftAccessibilityHidden(),
              pickerStyle("segmented"),
              tint(tokens.primary),
              ...(disabled ? [swiftDisabled(true)] : []),
            ]}
            selection={displayedValue}
            onSelectionChange={(nextValue) => {
              const nextOption = options.find(
                (option) => option.value === nextValue,
              );
              if (!nextOption) return;
              selectValue(nextOption.value);
            }}
          >
            {options.map((option) => (
              <SwiftText key={option.value} modifiers={[tag(option.value)]}>
                {option.label}
              </SwiftText>
            ))}
          </SwiftPicker>
        </SwiftHost>
        <View
          // Let the SwiftUI picker own ordinary touches so UISegmentedControl
          // can run its native selection transition. VoiceOver still receives
          // the individually-labelled React Native tabs used by this overlay.
          // While the current value is being persisted, the overlay also
          // blocks repeat taps without visually disabling and redrawing the
          // native picker midway through its selection animation.
          pointerEvents={
            screenReaderEnabled || interactionLocked ? "auto" : "none"
          }
          style={styles.nativeSegmentedAccessibilityOverlay}
        >
          {options.map((option) => (
            <NemuPressable
              key={option.value}
              accessibilityLabel={option.label}
              accessibilityRole="tab"
              accessibilityState={{
                disabled: interactionBlocked,
                selected: option.value === displayedValue,
              }}
              containerStyle={styles.nativeSegmentedAccessibilityOption}
              disabled={interactionBlocked}
              hapticFeedback="none"
              hitSlop={0}
              pressedScale={1}
              style={styles.nativeSegmentedAccessibilityOption}
              onPress={() => selectValue(option.value)}
            >
              <View />
            </NemuPressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SegmentedControl
      appearance={scheme}
      enabled={!interactionBlocked}
      selectedIndex={selectedIndex}
      style={styles.nativeSegmented}
      testID={accessibilityLabel}
      tintColor={tokens.primary}
      values={options.map((option) => option.label)}
      onChange={({ nativeEvent }) => {
        const nextOption = options[nativeEvent.selectedSegmentIndex];
        if (!nextOption) return;
        selectValue(nextOption.value);
      }}
    />
  );
}

function SettingsMenuRow({
  icon,
  title,
  subtitle,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <PressableSettingsSurface
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={styles.menuRowShell}
      contentStyle={styles.menuRowContent}
    >
      <View style={styles.menuRow}>
        <View style={styles.menuIcon}>
          <Ionicons name={icon} size={19} color={tokens.primary} />
        </View>
        <View style={styles.menuText}>
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            style={[styles.menuTitle, { color: tokens.foreground }]}
          >
            {title}
          </NemuText>
          <NemuText
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            numberOfLines={2}
            style={[styles.menuSubtitle, { color: tokens.mutedForeground }]}
          >
            {subtitle}
          </NemuText>
        </View>
        <Ionicons
          name="chevron-forward-outline"
          size={18}
          color={tokens.mutedForeground}
        />
      </View>
    </PressableSettingsSurface>
  );
}

/**
 * Same geometry as `DataActionRow`: a bordered row with the copy on the left
 * and the trailing control on the right, no leading icon frame.
 */
function FeedbackSettingRow({
  title,
  subtitle,
  value,
  onToggle,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (nextValue: boolean) => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={[styles.dataAction, { borderColor: tokens.border }]}>
      <View style={styles.dataActionText}>
        <NemuText style={[styles.settingTitle, { color: tokens.foreground }]}>
          {title}
        </NemuText>
        <NemuText
          style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
        >
          {subtitle}
        </NemuText>
      </View>
      <NemuNativeSwitch
        accessibilityLabel={title}
        value={value}
        onValueChange={(nextValue) => {
          void hapticSelection();
          onToggle(nextValue);
        }}
      />
    </View>
  );
}

/**
 * Haptics and the chapter-completion cue used to float as two unparented rows
 * on the settings landing page. They now live inside the reader section under
 * a titled card so every landing row belongs to a group, and the rows reuse
 * the data-management row geometry so both sections read the same.
 */
function MobileFeedbackSettingsCard() {
  const { tokens } = useNemuTheme();
  const strings = getMobileStrings(useMobileLanguageSettings().appLanguage);
  const {
    hapticsFeedbackEnabled,
    chapterCompleteCelebration,
    setHapticsFeedbackEnabled,
    setChapterCompleteCelebration,
  } = useMobileFeedbackSettings();

  return (
    <SettingsSurface
      style={styles.rowShell}
      contentStyle={styles.dataManagementCard}
    >
      <View style={styles.readerHeader}>
        <View style={styles.iconFrame}>
          <Ionicons name="sparkles-outline" size={20} color={tokens.primary} />
        </View>
        <View style={styles.rowText}>
          <NemuText style={[styles.rowTitle, { color: tokens.foreground }]}>
            {strings.settings.feedbackSection}
          </NemuText>
          <NemuText
            style={[styles.rowSubtitle, { color: tokens.mutedForeground }]}
          >
            {strings.settings.feedbackSectionDescription}
          </NemuText>
        </View>
      </View>
      <View style={styles.dataActions} testID="FeedbackSettingsCard">
        <FeedbackSettingRow
          title={strings.feedback.hapticsFeedback}
          subtitle={strings.feedback.hapticsFeedbackHint}
          value={hapticsFeedbackEnabled}
          onToggle={(nextValue) => {
            void setHapticsFeedbackEnabled(nextValue);
          }}
        />
        <FeedbackSettingRow
          title={strings.feedback.chapterCompleteFeedback}
          subtitle={strings.feedback.chapterCompleteFeedbackHint}
          value={chapterCompleteCelebration}
          onToggle={(nextValue) => {
            void setChapterCompleteCelebration(nextValue);
          }}
        />
      </View>
    </SettingsSurface>
  );
}

function SegmentedSetting<Value extends string>({
  title,
  subtitle,
  options,
  value,
  onSelect,
  disabled = false,
  interactionLocked = false,
}: {
  title: string;
  subtitle: string;
  options: Array<{ value: Value; label: string }>;
  value: Value;
  onSelect: (value: Value) => void;
  disabled?: boolean;
  interactionLocked?: boolean;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.settingBlock}>
      <View style={styles.settingCopy}>
        <NemuText style={[styles.settingTitle, { color: tokens.foreground }]}>
          {title}
        </NemuText>
        <NemuText
          style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
        >
          {subtitle}
        </NemuText>
      </View>
      <View style={styles.nativeSegmentedShell}>
        <SettingsSegmentedPicker
          accessibilityLabel={title}
          disabled={disabled}
          interactionLocked={interactionLocked}
          options={options}
          value={value}
          onSelect={onSelect}
        />
      </View>
    </View>
  );
}

function DataActionRow({
  icon,
  title,
  subtitle,
  actionLabel,
  busy,
  disabled,
  destructive,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  actionLabel: string;
  busy: boolean;
  disabled: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={[styles.dataAction, { borderColor: tokens.border }]}>
      <View style={styles.dataActionText}>
        <NemuText style={[styles.settingTitle, { color: tokens.foreground }]}>
          {title}
        </NemuText>
        <NemuText
          style={[styles.settingSubtitle, { color: tokens.mutedForeground }]}
        >
          {subtitle}
        </NemuText>
      </View>
      <NemuButton
        accessibilityLabel={title}
        accessibilityState={{ disabled, busy: busy || undefined }}
        containerStyle={styles.dataActionButton}
        disabled={disabled}
        icon={icon}
        label={actionLabel}
        loading={busy}
        onPress={onPress}
        size="sm"
        variant={destructive ? "destructive" : "outline"}
      />
    </View>
  );
}

function AboutSettingsRow({
  strings,
  onPress,
}: {
  strings: MobileStrings;
  onPress: () => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <PressableSettingsSurface
      accessibilityLabel={strings.settings.aboutNemuLabel}
      onPress={onPress}
      pressedScale={0.98}
      style={styles.aboutShell}
      contentStyle={styles.aboutContent}
    >
      <View style={styles.aboutRow}>
        <View style={styles.aboutIcon}>
          <Ionicons
            name="information-circle-outline"
            size={19}
            color={tokens.mutedForeground}
          />
        </View>
        <NemuText
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.aboutTitle, { color: tokens.foreground }]}
        >
          {strings.settings.aboutNemuBeforeBrand}
          <NemuText style={[nemuBrandTextStyle, { color: tokens.primary }]}>
            nemu
          </NemuText>
          {strings.settings.aboutNemuAfterBrand}
        </NemuText>
        <Ionicons
          name="chevron-forward-outline"
          size={17}
          color={tokens.mutedForeground}
        />
      </View>
    </PressableSettingsSurface>
  );
}

export function SettingsScreen({
  section = null,
}: {
  section?: SettingsSectionId | null;
}) {
  const params = useLocalSearchParams<{
    focus?: string | string[];
    sourceId?: string | string[];
  }>();
  const { tokens, themePreference, setThemePreference } = useNemuTheme();
  const { mode, setMode } = useReadingMode();
  const {
    appLanguage,
    effectiveMetadataLanguage,
    metadataLanguagePreference,
    setAppLanguage,
    setMetadataLanguagePreference,
  } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const appLanguageOptions = useMemo(
    () => appLanguageModes(strings),
    [strings],
  );
  const themeOptions = useMemo(() => themeModes(strings), [strings]);
  const metadataLanguageOptions = useMemo(
    () => metadataLanguageModes(strings),
    [strings],
  );
  const dataManagement = useMobileDataManagement();
  const readerPlugins = useMobileReaderPlugins();
  const store = useMobileDataStore();
  const sources = useInstalledSources();
  // Registry discovery only feeds the Sources section. Mounting it from the
  // settings root (or Reader/Appearance/Data) would start a catalog download
  // and a silent source auto-update pass no visible row can use.
  const availableSources = useAvailableSources({
    enabled: section === "sources",
  });
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [removingSourceId, setRemovingSourceId] = useState<string | null>(null);
  const removingSourceIdRef = useRef<string | null>(null);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const refreshGuardRef = useRef(false);
  const [pendingClearMode, setPendingClearMode] =
    useState<MobileDataClearMode | null>(null);
  const pendingClearModeRef = useRef<MobileDataClearMode | null>(null);
  const [settingsMutationKey, setSettingsMutationKey] = useState<string | null>(
    null,
  );
  const settingsMutationKeyRef = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState<SettingsConfirmation | null>(
    null,
  );
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const confirmationVisibleRef = useRef(false);
  const [sourceSettingsSheetVisible, setSourceSettingsSheetVisible] =
    useState(false);
  const queuedSourceConfirmationRef =
    useRef<SourceSettingsConfirmation | null>(null);
  const reopenSourceSettingsAfterConfirmationRef = useRef(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [clearCloudData, setClearCloudData] = useState(false);
  const [agentCardY, setAgentCardY] = useState<number | null>(null);
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const agentFocusAppliedRef = useRef(false);
  const focusParam = Array.isArray(params.focus)
    ? params.focus[0]
    : params.focus;
  const sourceParam = Array.isArray(params.sourceId)
    ? params.sourceId[0]
    : params.sourceId;
  const activeSection = section;
  const [dismissedSourceUpdateNoticeId, setDismissedSourceUpdateNoticeId] =
    useState<number | null>(null);
  const [dismissedAvailableSourcesError, setDismissedAvailableSourcesError] =
    useState<string | null>(null);
  const displayedSources = useMemo(
    () =>
      mergeMobileInstalledSourceRegistryMetadata(
        sources.data,
        availableSources.data,
      ),
    [availableSources.data, sources.data],
  );
  // Same catalog join Browse uses, so a record whose stored icon is missing or
  // relative still paints the catalog artwork here.
  const sourceIconIndex = useMemo(
    () => buildMobileSourceIconIndex(availableSources.data),
    [availableSources.data],
  );

  const selectedSource = useMemo(() => {
    if (!selectedSourceId) return null;
    return (
      displayedSources.find((source) => source.id === selectedSourceId) ?? null
    );
  }, [displayedSources, selectedSourceId]);

  const openSourceSettings = useCallback((sourceId: string) => {
    queuedSourceConfirmationRef.current = null;
    setOperationError(null);
    setSelectedSourceId(sourceId);
    setSourceSettingsSheetVisible(true);
  }, []);

  const presentSettingsConfirmation = useCallback((next: SettingsConfirmation) => {
    reopenSourceSettingsAfterConfirmationRef.current = false;
    confirmationVisibleRef.current = true;
    setConfirmation(next);
    setConfirmationVisible(true);
  }, []);

  const queueSourceSettingsConfirmation = useCallback(
    (next: SourceSettingsConfirmation) => {
      const queued = resolveMobileFirstQueuedSheetHandoff({
        current: queuedSourceConfirmationRef.current,
        next,
      });
      if (!queued.accepted) return false;
      queuedSourceConfirmationRef.current = queued.queued;
      setSourceSettingsSheetVisible(false);
      return true;
    },
    [],
  );

  const dismissSettingsConfirmation = useCallback((reopenSourceSettings = false) => {
    if (!confirmationVisibleRef.current) return;
    confirmationVisibleRef.current = false;
    reopenSourceSettingsAfterConfirmationRef.current =
      reopenSourceSettingsAfterConfirmationRef.current || reopenSourceSettings;
    setConfirmationVisible(false);
  }, []);

  const handleSourceSettingsDismiss = useCallback(() => {
    const queuedConfirmation = queuedSourceConfirmationRef.current;
    queuedSourceConfirmationRef.current = null;
    if (
      resolveMobileSourceSettingsPostDismissAction(
        queuedConfirmation !== null,
      ) === "present-confirmation" &&
      queuedConfirmation
    ) {
      presentSettingsConfirmation(queuedConfirmation);
      return;
    }
    setSelectedSourceId(null);
    setOperationError(null);
  }, [presentSettingsConfirmation]);

  const handleConfirmationDismiss = useCallback(() => {
    const dismissedConfirmation = confirmation;
    const reopenSourceSettings =
      reopenSourceSettingsAfterConfirmationRef.current &&
      shouldReopenMobileSourceSettingsAfterConfirmation({
        activeSection,
        confirmation: dismissedConfirmation,
        sourceAvailable: selectedSource !== null,
      });
    reopenSourceSettingsAfterConfirmationRef.current = false;
    confirmationVisibleRef.current = false;
    setConfirmation(null);
    if (reopenSourceSettings) {
      setSourceSettingsSheetVisible(true);
      return;
    }
    if (isMobileSourceSettingsConfirmation(dismissedConfirmation)) {
      setSelectedSourceId(null);
    }
  }, [activeSection, confirmation, selectedSource]);

  const selectedRuntimeSource = useMemo(
    () => (selectedSource ? normalizeInstalledSource(selectedSource) : null),
    [selectedSource],
  );

  useEffect(() => {
    if (activeSection !== "sources" || !sourceParam) return;
    const routedSource = displayedSources.find(
      (source) => source.id === sourceParam,
    );
    if (!routedSource) return;
    openSourceSettings(routedSource.id);
    router.setParams({ sourceId: undefined });
  }, [activeSection, displayedSources, openSourceSettings, sourceParam]);

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginId) return null;
    const plugin = readerPlugins.data.find(
      (item) => item.id === selectedPluginId,
    );
    if (!plugin?.enabled) return null;
    if (countRenderableSourceSettings(plugin.settings) <= 0) return null;
    return plugin;
  }, [readerPlugins.data, selectedPluginId]);
  const selectedSourceSchema =
    selectedSource?.packageMetadata?.settings ?? EMPTY_SOURCE_SETTINGS;
  const selectedSourceKey = selectedSource
    ? sourceSettingsKey(selectedSource)
    : null;
  const selectedSourceSettingsKeys = useMemo(
    () =>
      selectedSource
        ? getMobileInstalledSourceSettingsKeys(selectedSource)
        : [],
    [selectedSource],
  );
  const selectedSourceSettings = useSourceSettings(
    selectedSourceKey,
    selectedSourceSchema,
    selectedSourceSettingsKeys,
  );
  const [selectedSourceLoginCapabilities, setSelectedSourceLoginCapabilities] =
    useState<MobileSourceLoginCapabilities | null>(null);

  const probedLoginSourceRef = useRef(selectedRuntimeSource);
  useEffect(() => {
    let active = true;
    // Only a different source starts from an unknown login state. Re-probing
    // after a setting toggle keeps the current answer visible until the new
    // one arrives instead of blanking the login row on every write.
    if (probedLoginSourceRef.current !== selectedRuntimeSource) {
      probedLoginSourceRef.current = selectedRuntimeSource;
      setSelectedSourceLoginCapabilities(null);
    }
    if (!selectedRuntimeSource || selectedSourceSettings.loading) {
      return () => {
        active = false;
      };
    }

    void getMobileSourceLoginCapabilities({
      source: selectedRuntimeSource,
      settings: selectedSourceSettings.data,
    })
      .then((capabilities) => {
        if (active) setSelectedSourceLoginCapabilities(capabilities);
      })
      .catch(() => {
        if (active) {
          setSelectedSourceLoginCapabilities({ basic: false, web: false });
        }
      });
    return () => {
      active = false;
    };
  }, [
    selectedRuntimeSource,
    selectedSourceSettings.data,
    selectedSourceSettings.loading,
  ]);
  const confirmationDetails = useMemo(() => {
    if (!confirmation) return null;
    if (confirmation.type === "uninstall-source") {
      return {
        title: strings.settings.uninstallSource,
        description: formatMobileString(
          strings.settings.uninstallSourceConfirm,
          {
            name: confirmation.name,
          },
        ),
        subject: confirmation.name,
        iconName: "trash-outline" as const,
        confirmLabel: strings.common.uninstall,
        confirmAccessibilityLabel: formatMobileString(
          strings.settings.uninstallSourceNamed,
          { name: confirmation.name },
        ),
        destructive: true,
        loading: removingSourceId === confirmation.source.id,
      };
    }
    if (confirmation.type === "clear-cache") {
      return {
        title: strings.settings.clearCache,
        description: strings.settings.clearCacheConfirm,
        iconName: "refresh-outline" as const,
        confirmLabel: strings.common.clear,
        confirmAccessibilityLabel: strings.settings.clearCache,
        destructive: false,
        loading:
          pendingClearMode === "cache" ||
          dataManagement.clearingMode === "cache",
      };
    }
    if (confirmation.type === "source-logout") {
      return {
        title:
          confirmation.setting.logoutTitle ??
          strings.settings.sourceSettingsLogout,
        description: strings.settings.sourceSettingsLogoutConfirm,
        subject: confirmation.setting.title,
        iconName: "log-out-outline" as const,
        confirmLabel: strings.settings.sourceSettingsLogout,
        confirmAccessibilityLabel: strings.settings.sourceSettingsLogout,
        destructive: true,
        loading: settingsMutationKey !== null,
      };
    }
    if (confirmation.type === "source-button") {
      return {
        title: confirmation.setting.confirmTitle ?? confirmation.setting.title,
        description:
          confirmation.setting.confirmMessage ??
          strings.settings.sourceSettingsActionConfirm,
        subject: confirmation.setting.title,
        iconName: "flash-outline" as const,
        confirmLabel: strings.settings.sourceSettingsRunAction,
        confirmAccessibilityLabel: confirmation.setting.title,
        destructive: confirmation.setting.destructive === true,
        loading: settingsMutationKey !== null,
      };
    }
    return {
      title: strings.settings.clearAllData,
      description: strings.settings.clearAllDataConfirm,
      iconName: "trash-outline" as const,
      confirmLabel: strings.settings.clearAllLocalData,
      confirmAccessibilityLabel: strings.settings.clearAllData,
      destructive: true,
      loading:
        pendingClearMode === "all" || dataManagement.clearingMode === "all",
    };
  }, [
    confirmation,
    dataManagement.clearingMode,
    pendingClearMode,
    removingSourceId,
    settingsMutationKey,
    strings,
  ]);
  const metadataLanguageSubtitle =
    metadataLanguagePreference === "auto"
      ? formatMobileString(strings.settings.metadataAutoFollows, {
          language: languageLabel(effectiveMetadataLanguage, strings),
        })
      : strings.settings.metadataFixedDescription;
  const sourceUpdateNotice = availableSources.sourceUpdateNotice;
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
  const settingsActionState: MobileSettingsActionState = {
    refreshingSources,
    removingSource: removingSourceId !== null,
    clearingData:
      pendingClearMode !== null || dataManagement.clearingMode !== null,
    changingSettings: settingsMutationKey !== null,
  };
  const settingsActionBusy = isMobileSettingsActionBusy(settingsActionState);
  const retryingReaderPlugins = settingsMutationKey === "reader-plugins:reload";
  const retryingInstalledSources =
    settingsMutationKey === "installed-sources:reload";
  const retryingAvailableSources =
    settingsMutationKey === "available-sources:reload";
  const retryingSelectedSourceSettings =
    settingsMutationKey === `source-settings-reload:${selectedSourceKey ?? ""}`;
  const importingSource = settingsMutationKey === "source-import";
  const canRetryReaderPluginsError = canRetryMobileSettingsLoadError({
    hasError: Boolean(readerPlugins.error),
    disabled: settingsActionBusy,
  });
  const canRetryInstalledSourcesError = canRetryMobileSettingsLoadError({
    hasError: Boolean(sources.error),
    disabled: settingsActionBusy,
  });
  const canRetryAvailableSourcesError = canRetryMobileSettingsLoadError({
    hasError: Boolean(availableSources.error),
    disabled: settingsActionBusy,
  });
  const canRetryReaderPluginSettingsError =
    canRetryMobileSourceSettingsLoadError({
      hasError: Boolean(readerPlugins.error),
      state: {
        loading: readerPlugins.loading,
        mutating: settingsActionBusy,
      },
    });
  const canRetrySelectedSourceSettingsError =
    canRetryMobileSourceSettingsLoadError({
      hasError: Boolean(selectedSourceSettings.error),
      state: {
        loading: selectedSourceSettings.loading,
        mutating: settingsActionBusy,
      },
    });
  const showAvailableSourcesError =
    Boolean(availableSources.error) &&
    availableSources.error !== dismissedAvailableSourcesError;
  const availableSourcesErrorPresentation = useMemo(
    () =>
      availableSources.error
        ? getMobileSourceErrorPresentation(availableSources.error, strings)
        : null,
    [availableSources.error, strings],
  );
  const settingsSkeletonState = {
    installedSourcesLoading: sources.loading,
    installedSourcesCount: sources.data.length,
    installedSourcesError: sources.error,
    availableSourcesLoading: availableSources.loading,
    availableSourcesCount: availableSources.data.length,
    availableSourcesError: availableSources.error,
    readerPluginsLoading: readerPlugins.loading,
    readerPluginsCount: readerPlugins.data.length,
    readerPluginsError: readerPlugins.error,
  };
  const showSettingsSkeleton = shouldRenderMobileSettingsSkeletonForSection(
    settingsSkeletonState,
    activeSection,
  );
  const sourcesSectionLoading =
    activeSection === "sources" &&
    shouldRenderMobileSourcesSectionLoading(settingsSkeletonState);
  const settingsTitle =
    activeSection === "reader"
      ? strings.reader.title
      : activeSection === "sources"
        ? strings.settings.installedSources
        : activeSection === "appearance"
          ? strings.settings.appearance
          : activeSection === "data"
            ? strings.settings.dataManagement
            : strings.nav.settings;
  const showRefreshAction =
    activeSection === null || activeSection === "sources";

  useEffect(() => {
    if (focusParam !== "agent") {
      agentFocusAppliedRef.current = false;
      return;
    }
    if (activeSection !== "data") {
      router.replace(settingsSectionHref("data", { focus: "agent" }));
      return;
    }
    if (
      showSettingsSkeleton ||
      agentCardY === null ||
      agentFocusAppliedRef.current
    )
      return;

    agentFocusAppliedRef.current = true;
    requestAnimationFrame(() => {
      settingsScrollRef.current?.scrollTo({
        y: Math.max(agentCardY - 12, 0),
        animated: true,
      });
    });
  }, [activeSection, agentCardY, focusParam, showSettingsSkeleton]);

  const getGuardedSettingsActionState = (): MobileSettingsActionState => ({
    refreshingSources: refreshGuardRef.current || refreshingSources,
    removingSource:
      removingSourceIdRef.current !== null || removingSourceId !== null,
    clearingData:
      pendingClearModeRef.current !== null ||
      pendingClearMode !== null ||
      dataManagement.clearingMode !== null,
    changingSettings:
      settingsMutationKeyRef.current !== null || settingsMutationKey !== null,
  });
  const beginSettingsMutation = (key: string): boolean => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) {
      return false;
    }
    settingsMutationKeyRef.current = key;
    setSettingsMutationKey(key);
    return true;
  };
  const finishSettingsMutation = (key: string) => {
    if (settingsMutationKeyRef.current === key) {
      settingsMutationKeyRef.current = null;
    }
    setSettingsMutationKey((current) => (current === key ? null : current));
  };
  const runSettingsMutation = async (
    key: string,
    action: () => Promise<void>,
  ) => {
    if (!beginSettingsMutation(key)) return;
    setOperationError(null);
    try {
      await action();
    } finally {
      finishSettingsMutation(key);
    }
  };
  const reportSettingsError = async (error: unknown) => {
    await hapticError();
    setOperationError(
      describeMobileErrorDetail(
        error,
        strings.settings.settingsActionFailedDetail,
      ),
    );
  };

  const refreshSources = async () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;

    refreshGuardRef.current = true;
    setRefreshingSources(true);
    setOperationError(null);
    try {
      await availableSources.reload();
      await sources.reload();
      await hapticConfirm();
    } catch (error) {
      await reportSettingsError(error);
    } finally {
      refreshGuardRef.current = false;
      setRefreshingSources(false);
    }
  };

  const retryReaderPlugins = () => {
    if (!canRetryReaderPluginsError) return;
    void runSettingsMutation("reader-plugins:reload", async () => {
      try {
        await readerPlugins.reload();
        await hapticConfirm();
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const retryInstalledSources = () => {
    if (!canRetryInstalledSourcesError) return;
    void runSettingsMutation("installed-sources:reload", async () => {
      try {
        await Promise.all([sources.reload(), availableSources.reload()]);
        await hapticConfirm();
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const retryAvailableSources = () => {
    if (!canRetryAvailableSourcesError) return;
    void runSettingsMutation("available-sources:reload", async () => {
      try {
        await availableSources.reload();
        setDismissedAvailableSourcesError(null);
        await hapticConfirm();
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const retrySelectedSourceSettings = () => {
    if (!selectedSourceKey || !canRetrySelectedSourceSettingsError) return;
    void runSettingsMutation(
      `source-settings-reload:${selectedSourceKey}`,
      async () => {
        try {
          await selectedSourceSettings.reload();
          await hapticConfirm();
        } catch (error) {
          await reportSettingsError(error);
        }
      },
    );
  };

  const reloadSelectedSourceSettingScopes = async (
    setting: SourcePackageSetting,
  ) => {
    const refreshes = new Set(setting.refreshes ?? []);
    const tasks: Promise<unknown>[] = [];
    if (refreshes.has("settings")) tasks.push(selectedSourceSettings.reload());
    if (
      refreshes.has("content") ||
      refreshes.has("listings") ||
      refreshes.has("filters")
    ) {
      tasks.push(sources.reload(), availableSources.reload());
    }
    await Promise.all(tasks);
  };

  const executeSelectedSourceSettingOperation = async (
    operation: MobileSourceSettingsOperation,
    settings: Record<string, unknown> = selectedSourceSettings.data,
  ): Promise<string | null> => {
    if (!selectedRuntimeSource) {
      return strings.settings.sourceSettingsRuntimeUnavailable;
    }
    try {
      const result = await runMobileSourceSettingsOperation({
        source: selectedRuntimeSource,
        settings,
        operation,
      });
      if (result.status === "complete") return null;
      if (result.status === "rejected") {
        return strings.settings.sourceSettingsCredentialsRejected;
      }
      return strings.settings.sourceSettingsRuntimeUnavailable;
    } catch {
      return strings.settings.sourceSettingsActionFailed;
    }
  };

  const loginToSelectedSource = async (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options: { signal?: AbortSignal } = {},
  ): Promise<string | null> => {
    if (!selectedSourceKey) {
      return strings.settings.sourceSettingsRuntimeUnavailable;
    }
    const mutationKey = `source-settings-login:${selectedSourceKey}:${setting.key}`;
    if (!beginSettingsMutation(mutationKey)) {
      return strings.settings.sourceSettingsRuntimeUnavailable;
    }
    setOperationError(null);
    try {
      if (!selectedRuntimeSource) {
        return strings.settings.sourceSettingsRuntimeUnavailable;
      }
      const result = await completeMobileSourceLogin({
        source: selectedRuntimeSource,
        schema: selectedSourceSchema,
        setting,
        submission,
        currentSettings: selectedSourceSettings.data,
        clearSandbox: clearMobileAidokuSandboxDataForSource,
        persistSettings: selectedSourceSettings.setSettings,
        signal: options.signal,
      });
      if (result.status === "rejected") {
        return strings.settings.sourceSettingsCredentialsRejected;
      }
      if (result.status === "blocked") {
        return strings.settings.sourceSettingsRuntimeUnavailable;
      }
      // Credential persistence is the commit point. Resolve immediately so
      // the owner closes the sheet as a success; keeping Cancel visible during
      // an ancillary refresh would falsely imply the committed login can still
      // be cancelled. Refresh failures surface through the Settings error path.
      void reloadSelectedSourceSettingScopes(setting).catch((error) =>
        reportSettingsError(error),
      );
      void hapticConfirm();
      return null;
    } catch (error) {
      if (isMobileSourceLoginCancellation(error)) throw error;
      await hapticError();
      return strings.settings.sourceSettingsActionFailed;
    } finally {
      finishSettingsMutation(mutationKey);
    }
  };

  const runSelectedSourceButton = async (setting: SourcePackageSetting) => {
    if (!selectedSourceKey) return;
    const decision = resolveMobileSourceSettingAction(
      setting,
      selectedSourceSettings.data,
    );
    if (decision.kind !== "run-button") return;
    await runSettingsMutation(
      `source-settings-action:${selectedSourceKey}:${setting.key}`,
      async () => {
        const operationError = await executeSelectedSourceSettingOperation({
          kind: "notification",
          notification: decision.notification,
        });
        if (operationError) {
          await reportSettingsError(new Error(operationError));
          return;
        }
        await reloadSelectedSourceSettingScopes(setting);
        dismissSettingsConfirmation(true);
        await hapticConfirm();
      },
    );
  };

  const handleSelectedSourceAction = (setting: SourcePackageSetting) => {
    const decision = resolveMobileSourceSettingAction(
      setting,
      selectedSourceSettings.data,
    );
    if (decision.kind === "invalid-link") {
      void reportSettingsError(
        new Error(strings.settings.sourceSettingsInvalidLink),
      );
      return;
    }
    if (decision.kind === "open-link") {
      const url = normalizeMobileSourceExternalUrl(decision.url);
      if (!url) {
        void reportSettingsError(
          new Error(strings.settings.sourceSettingsInvalidLink),
        );
        return;
      }
      void Linking.openURL(url).catch(() =>
        reportSettingsError(
          new Error(strings.settings.sourceSettingsInvalidLink),
        ),
      );
      return;
    }
    if (decision.kind !== "run-button") return;
    if (decision.confirmation) {
      if (
        !queueSourceSettingsConfirmation({ type: "source-button", setting })
      ) {
        return;
      }
      setOperationError(null);
      return;
    }
    void runSelectedSourceButton(setting);
  };

  const logoutFromSelectedSource = async (setting: SourcePackageSetting) => {
    if (!selectedSourceKey) return;
    await runSettingsMutation(
      `source-settings-logout:${selectedSourceKey}:${setting.key}`,
      async () => {
        try {
          if (!selectedRuntimeSource) {
            throw new Error(strings.settings.sourceSettingsRuntimeUnavailable);
          }
          await completeMobileSourceLogout({
            source: selectedRuntimeSource,
            schema: selectedSourceSchema,
            setting,
            currentSettings: selectedSourceSettings.data,
            clearSandbox: clearMobileAidokuSandboxDataForSource,
            persistSettings: selectedSourceSettings.setSettings,
          });
          dismissSettingsConfirmation(true);
          await reloadSelectedSourceSettingScopes(setting);
          await hapticConfirm();
        } catch {
          await reportSettingsError(
            new Error(strings.settings.sourceSettingsActionFailed),
          );
        }
      },
    );
  };

  const selectReadingMode = async (nextMode: ReadingMode) => {
    if (nextMode === mode) return;
    await runSettingsMutation("reading-mode", async () => {
      try {
        await setMode(nextMode);
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const selectThemePreference = async (nextPreference: ThemePreference) => {
    if (nextPreference === themePreference) return;
    await runSettingsMutation("theme", async () => {
      try {
        await setThemePreference(nextPreference);
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const selectAppLanguage = async (nextLanguage: AppLanguage) => {
    if (nextLanguage === appLanguage) return;
    await runSettingsMutation("app-language", async () => {
      try {
        await setAppLanguage(nextLanguage);
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const selectMetadataLanguagePreference = async (
    nextPreference: MetadataLanguagePreference,
  ) => {
    if (nextPreference === metadataLanguagePreference) return;
    await runSettingsMutation("metadata-language", async () => {
      try {
        await setMetadataLanguagePreference(nextPreference);
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const openSource = (source: InstalledSource) => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    const { registryId, sourceId } = sourceParts(source);
    router.push(getMobileSourceBrowseHref({ registryId, sourceId }));
  };

  const importSourcePackage = () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    void runSettingsMutation("source-import", async () => {
      try {
        setOperationError(null);
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: [
            "application/vnd.aidoku.aix",
            "application/octet-stream",
            "application/zip",
            "*/*",
          ],
        });
        if (result.canceled) return;

        const asset = result.assets?.[0];
        if (!asset?.uri) {
          throw new Error(strings.settings.settingsActionFailedDetail);
        }

        const packageResult = await cacheImportedAixSourcePackage({
          uri: asset.uri,
          registryId: MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
        });
        const importedSource = buildImportedAixInstalledSource({
          packageResult,
        });
        const existing = (await store.getSyncSettings()).installedSources.find(
          (source) => source.id === importedSource.id,
        );
        const installedSource = {
          ...importedSource,
          updatedAt: nextSyncTimestamp(existing?.updatedAt),
        };
        await store.saveRegistry(MOBILE_CUSTOM_AIDOKU_REGISTRY);
        await store.saveInstalledSource(installedSource);
        defaultMobileSourceSessionCache.remove(
          makeMobileRuntimeSourceKey(normalizeInstalledSource(installedSource)),
        );
        emitMobileDataChanged("registries");
        emitMobileSettingsDataChanged({
          sourceSettingsChanged: true,
          installedSourcesChanged: true,
        });
        await sources.reload();
        openSourceSettings(installedSource.id);
        await hapticConfirm();
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const removeSource = async (source: InstalledSource) => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    removingSourceIdRef.current = source.id;
    setRemovingSourceId(source.id);
    setOperationError(null);
    try {
      defaultMobileSourceSessionCache.remove(
        makeMobileRuntimeSourceKey(normalizeInstalledSource(source)),
      );
      await clearMobileAidokuSandboxDataForSource(
        makeMobileRuntimeSourceKey(normalizeInstalledSource(source)),
      );
      await clearCachedSourcePackage(
        resolveMobileSourcePackageCacheKey(normalizeInstalledSource(source)),
      );
      clearMobileSourceImageRequestCache();
      await removeMobileSourceAfterSettingsCleanup({
        settingsKeys: getMobileInstalledSourceSettingsKeys(source),
        resetSourceSettings: (key) => store.resetSourceSettings(key),
        clearSourceDetailCache: () =>
          clearMobileSourceDetailCacheForSource(
            makeMobileRuntimeSourceKey(normalizeInstalledSource(source)),
          ),
        removeInstalledSource: () =>
          store.removeInstalledSource(source.id, source.registryId),
      });
      emitMobileSettingsDataChanged({
          sourceSettingsChanged: true,
          installedSourcesChanged: true,
        });
      if (selectedSourceId === source.id) {
        setSourceSettingsSheetVisible(false);
        setSelectedSourceId(null);
      }
      await sources.reload();
      if (
        getMobileSettingsMutationResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await hapticConfirm();
    } catch (error) {
      if (
        getMobileSettingsMutationResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await reportSettingsError(error);
    } finally {
      if (removingSourceIdRef.current === source.id) {
        removingSourceIdRef.current = null;
      }
      setRemovingSourceId((current) =>
        current === source.id ? null : current,
      );
    }
  };

  const toggleReaderPlugin = async (
    plugin: MobileReaderPluginState,
    enabled: boolean,
  ) => {
    await runSettingsMutation(`reader-plugin:${plugin.id}`, async () => {
      void hapticPress();
      try {
        await readerPlugins.setPluginEnabled(plugin.id, enabled);
        setSelectedPluginId((current) =>
          enabled ? plugin.id : current === plugin.id ? null : current,
        );
      } catch (error) {
        await reportSettingsError(error);
      }
    });
  };

  const confirmRemoveSource = (source: InstalledSource) => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    setOperationError(null);
    presentSettingsConfirmation({
      type: "uninstall-source",
      source,
      name: sourceName(source),
    });
  };

  const clearCache = async () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    pendingClearModeRef.current = "cache";
    setPendingClearMode("cache");
    setOperationError(null);
    try {
      await dataManagement.clearCache();
      await sources.reload();
      if (
        getMobileSettingsMutationResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await hapticConfirm();
    } catch (error) {
      if (
        getMobileSettingsMutationResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await reportSettingsError(error);
    } finally {
      if (pendingClearModeRef.current === "cache") {
        pendingClearModeRef.current = null;
      }
      setPendingClearMode((current) => (current === "cache" ? null : current));
    }
  };

  const clearAllData = async () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    pendingClearModeRef.current = "all";
    setPendingClearMode("all");
    setOperationError(null);
    try {
      await dataManagement.clearAllData({
        clearCloud: clearCloudData,
      });
      setSourceSettingsSheetVisible(false);
      setSelectedSourceId(null);
      setSelectedPluginId(null);
      setClearCloudData(false);
      // The data provider may switch profiles as soon as the durable reset
      // completes. Revision subscribers will reload defaults from the newly
      // mounted store; writing defaults through this closing screen could
      // resurrect rows in the just-cleared profile.
      if (
        getMobileSettingsMutationResultAction({ succeeded: true }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await hapticConfirm();
    } catch (error) {
      if (
        getMobileSettingsMutationResultAction({ succeeded: false }) ===
        "close-confirmation"
      ) {
        dismissSettingsConfirmation();
      }
      await reportSettingsError(error);
    } finally {
      if (pendingClearModeRef.current === "all") {
        pendingClearModeRef.current = null;
      }
      setPendingClearMode((current) => (current === "all" ? null : current));
    }
  };

  const confirmClearCache = () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    setOperationError(null);
    presentSettingsConfirmation({ type: "clear-cache" });
  };

  const confirmClearAllData = () => {
    if (!canStartMobileSettingsAction(getGuardedSettingsActionState())) return;
    setOperationError(null);
    setClearCloudData(false);
    presentSettingsConfirmation({ type: "clear-all-data" });
  };

  const runConfirmedAction = () => {
    if (!confirmation) return;
    if (confirmation.type === "uninstall-source") {
      void removeSource(confirmation.source);
      return;
    }
    if (confirmation.type === "clear-cache") {
      void clearCache();
      return;
    }
    if (confirmation.type === "source-logout") {
      void logoutFromSelectedSource(confirmation.setting);
      return;
    }
    if (confirmation.type === "source-button") {
      void runSelectedSourceButton(confirmation.setting);
      return;
    }
    void clearAllData();
  };

  return (
    <>
      <Stack.Screen options={{ title: settingsTitle }} />
      <PageScaffold
        nativeHeader
        onRefresh={
          showRefreshAction
            ? () => {
                void refreshSources();
              }
            : undefined
        }
        refreshDisabled={settingsActionBusy}
        refreshLabel={strings.settings.refreshSources}
        refreshing={refreshingSources}
        scrollRef={settingsScrollRef}
      >
        <View style={styles.list}>
          {showSettingsSkeleton ? (
            <MobileSettingsSkeleton
              accessibilityLabel={strings.settings.loading}
            />
          ) : (
            <>
              {operationError ? (
                <MobileInlineErrorBanner
                  title={strings.settings.settingsActionFailed}
                  detail={operationError}
                  dismissLabel={strings.common.clear}
                  onDismiss={() => setOperationError(null)}
                />
              ) : null}
              {showAvailableSourcesError &&
              availableSources.error &&
              availableSourcesErrorPresentation ? (
                <MobileInlineErrorBanner
                  title={availableSourcesErrorPresentation.title}
                  detail={availableSourcesErrorPresentation.detail}
                  actionLabel={strings.common.retry}
                  actionDisabled={!canRetryAvailableSourcesError}
                  actionLoading={retryingAvailableSources}
                  dismissLabel={strings.common.clear}
                  onActionPress={retryAvailableSources}
                  onDismiss={() =>
                    setDismissedAvailableSourcesError(availableSources.error)
                  }
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

              {activeSection === null ? (
                <>
                  <MobileCloudSyncCard />
                  <View style={styles.menuGroup}>
                    <SettingsMenuRow
                      icon="book-outline"
                      title={strings.reader.title}
                      subtitle={
                        strings.settings.readerDescriptionWithFeedback
                      }
                      disabled={settingsActionBusy}
                      onPress={() => router.push(settingsSectionHref("reader"))}
                    />
                    <SettingsMenuRow
                      icon="server-outline"
                      title={strings.settings.installedSources}
                      subtitle={strings.settings.installedSourcesDescription}
                      disabled={settingsActionBusy}
                      onPress={() =>
                        router.push(settingsSectionHref("sources"))
                      }
                    />
                    <SettingsMenuRow
                      icon="color-palette-outline"
                      title={strings.settings.appearance}
                      subtitle={strings.settings.appearanceDescription}
                      disabled={settingsActionBusy}
                      onPress={() =>
                        router.push(settingsSectionHref("appearance"))
                      }
                    />
                    <SettingsMenuRow
                      icon="folder-open-outline"
                      title={strings.settings.dataManagement}
                      subtitle={strings.settings.dataManagementDescription}
                      disabled={settingsActionBusy}
                      onPress={() => router.push(settingsSectionHref("data"))}
                    />
                  </View>
                  <AboutSettingsRow
                    strings={strings}
                    onPress={() => setAboutOpen(true)}
                  />
                </>
              ) : null}

              {activeSection === "reader" ? (
                <>
                  <SettingsSurface
                    style={styles.rowShell}
                    contentStyle={styles.readerRow}
                  >
                    <View style={styles.readerHeader}>
                      <View style={styles.iconFrame}>
                        <Ionicons
                          name="book-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <NemuText
                          style={[
                            styles.rowTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.reader.title}
                        </NemuText>
                        <NemuText
                          style={[
                            styles.rowSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.reader.description}
                        </NemuText>
                      </View>
                    </View>
                    <View style={styles.nativeSegmentedShell}>
                      <SettingsSegmentedPicker
                        accessibilityLabel={strings.reader.title}
                        disabled={
                          settingsActionBusy &&
                          settingsMutationKey !== "reading-mode"
                        }
                        interactionLocked={
                          settingsMutationKey === "reading-mode"
                        }
                        options={readingModes.map((item) => ({
                          value: item.mode,
                          label: strings.reader[item.labelKey],
                        }))}
                        value={mode}
                        onSelect={(nextMode) => {
                          if (
                            !canRunMobileSettingsSelection({
                              selected: nextMode === mode,
                              disabled: settingsActionBusy,
                            })
                          ) {
                            return;
                          }
                          void selectReadingMode(nextMode);
                        }}
                      />
                    </View>
                  </SettingsSurface>

                  <SettingsSurface
                    style={styles.pluginSectionShell}
                    contentStyle={styles.pluginSectionCard}
                  >
                    <View style={styles.readerHeader}>
                      <View style={styles.iconFrame}>
                        <Ionicons
                          name="options-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <NemuText
                          style={[
                            styles.rowTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.settings.plugins}
                        </NemuText>
                        <NemuText
                          style={[
                            styles.rowSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.pluginsDescription}
                        </NemuText>
                      </View>
                    </View>
                    {readerPlugins.error ? (
                      <View style={styles.emptyRow}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={22}
                          color={tokens.danger}
                        />
                        <NemuText
                          style={[
                            styles.emptyText,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {describeMobileErrorDetail(
                            readerPlugins.error,
                            strings.settings.settingsActionFailedDetail,
                          )}
                        </NemuText>
                        <NemuButton
                          accessibilityLabel={strings.common.retry}
                          accessibilityState={{
                            disabled: !canRetryReaderPluginsError,
                            busy: retryingReaderPlugins || undefined,
                          }}
                          disabled={!canRetryReaderPluginsError}
                          hapticFeedback={
                            canRetryReaderPluginsError ? "press" : "none"
                          }
                          icon="refresh-outline"
                          loading={retryingReaderPlugins}
                          onPress={retryReaderPlugins}
                          size="icon-sm"
                          variant="secondary"
                        />
                      </View>
                    ) : readerPlugins.loading && !readerPlugins.data.length ? (
                      <View style={styles.emptyRow}>
                        <ActivityIndicator
                          size="small"
                          color={tokens.primary}
                        />
                        <NemuText
                          style={[
                            styles.emptyText,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.loadingReaderPlugins}
                        </NemuText>
                      </View>
                    ) : (
                      <View style={styles.pluginEmbeddedList}>
                        {readerPlugins.data.map((plugin) => (
                          <ReaderPluginManagementRow
                            key={plugin.id}
                            plugin={plugin}
                            strings={strings}
                            selected={selectedPluginId === plugin.id}
                            disabled={
                              settingsMutationKey ===
                              `reader-plugin:${plugin.id}`
                            }
                            embedded
                            onSelect={() => {
                              if (settingsActionBusy) return;
                              setSelectedPluginId(plugin.id);
                            }}
                            onToggle={(enabled) => {
                              void toggleReaderPlugin(plugin, enabled);
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </SettingsSurface>

                  <MobileFeedbackSettingsCard />
                </>
              ) : null}

              {activeSection === "appearance" ? (
                <SettingsSurface
                  style={styles.rowShell}
                  contentStyle={styles.appearanceRow}
                >
                  <View style={styles.readerHeader}>
                    <View style={styles.iconFrame}>
                      <Ionicons
                        name="color-palette-outline"
                        size={20}
                        color={tokens.primary}
                      />
                    </View>
                    <View style={styles.rowText}>
                      <NemuText
                        style={[styles.rowTitle, { color: tokens.foreground }]}
                      >
                        {strings.settings.appearance}
                      </NemuText>
                      <NemuText
                        style={[
                          styles.rowSubtitle,
                          { color: tokens.mutedForeground },
                        ]}
                      >
                        {strings.settings.appearanceDescription}
                      </NemuText>
                    </View>
                  </View>
                  <SegmentedSetting
                    title={strings.settings.language}
                    subtitle={strings.settings.languageDescription}
                    options={appLanguageOptions}
                    value={appLanguage}
                    disabled={
                      settingsActionBusy &&
                      settingsMutationKey !== "app-language"
                    }
                    interactionLocked={
                      settingsMutationKey === "app-language"
                    }
                    onSelect={(value) => {
                      void selectAppLanguage(value);
                    }}
                  />
                  <SegmentedSetting
                    title={strings.settings.theme}
                    subtitle={strings.settings.themeDescription}
                    options={themeOptions}
                    value={themePreference}
                    disabled={
                      settingsActionBusy && settingsMutationKey !== "theme"
                    }
                    interactionLocked={settingsMutationKey === "theme"}
                    onSelect={(value) => {
                      void selectThemePreference(value);
                    }}
                  />
                  <SegmentedSetting
                    title={strings.settings.metadataLanguage}
                    subtitle={metadataLanguageSubtitle}
                    options={metadataLanguageOptions}
                    value={metadataLanguagePreference}
                    disabled={
                      settingsActionBusy &&
                      settingsMutationKey !== "metadata-language"
                    }
                    interactionLocked={
                      settingsMutationKey === "metadata-language"
                    }
                    onSelect={(value) => {
                      void selectMetadataLanguagePreference(value);
                    }}
                  />
                </SettingsSurface>
              ) : null}

              {activeSection === "sources" ? (
                <>
                  <SettingsSurface
                    style={styles.sourceSectionShell}
                    contentStyle={styles.sourceSectionCard}
                  >
                    <View style={styles.readerHeader}>
                      <View style={styles.iconFrame}>
                        <Ionicons
                          name="server-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <NemuText
                          style={[
                            styles.rowTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.settings.installedSources}
                        </NemuText>
                        <NemuText
                          style={[
                            styles.rowSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.installedSourcesDescription}
                        </NemuText>
                      </View>
                      <View style={styles.sourceHeaderActions}>
                        <NemuButton
                          accessibilityLabel={strings.settings.addSource}
                          disabled={settingsActionBusy}
                          icon="add-outline"
                          label={strings.common.add}
                          onPress={() => {
                            if (settingsActionBusy) return;
                            router.push("/browse");
                          }}
                          size="sm"
                          variant="default"
                        />
                      </View>
                    </View>
                    {sourcesSectionLoading ? (
                      <View style={styles.emptyRow}>
                        <ActivityIndicator
                          size="small"
                          color={tokens.primary}
                        />
                        <NemuText
                          style={[
                            styles.emptyText,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.loading}
                        </NemuText>
                      </View>
                    ) : sources.error ? (
                      <View style={styles.emptyRow}>
                        <Ionicons
                          name="alert-circle-outline"
                          size={22}
                          color={tokens.danger}
                        />
                        <NemuText
                          style={[
                            styles.emptyText,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {describeMobileErrorDetail(
                            sources.error,
                            strings.browse.sourcesUnavailable,
                          )}
                        </NemuText>
                        <NemuButton
                          accessibilityLabel={strings.common.retry}
                          accessibilityState={{
                            disabled: !canRetryInstalledSourcesError,
                            busy: retryingInstalledSources || undefined,
                          }}
                          disabled={!canRetryInstalledSourcesError}
                          hapticFeedback={
                            canRetryInstalledSourcesError ? "press" : "none"
                          }
                          icon="refresh-outline"
                          loading={retryingInstalledSources}
                          onPress={retryInstalledSources}
                          size="icon-sm"
                          variant="secondary"
                        />
                      </View>
                    ) : displayedSources.length ? (
                      <View style={styles.sourceList}>
                        {displayedSources.map((source) => (
                          <SourceManagementRow
                            key={source.id}
                            source={source}
                            iconUri={resolveMobileInstalledSourceIconUri(
                              source,
                              sourceIconIndex,
                            )}
                            strings={strings}
                            removing={removingSourceId === source.id}
                            disabled={settingsActionBusy}
                            onSettings={() => {
                              if (settingsActionBusy) return;
                              openSourceSettings(source.id);
                            }}
                            onBrowse={() => openSource(source)}
                            onRemove={() => confirmRemoveSource(source)}
                          />
                        ))}
                      </View>
                    ) : (
                      <View style={styles.emptyRow}>
                        <Ionicons
                          name="server-outline"
                          size={22}
                          color={tokens.mutedForeground}
                        />
                        <NemuText
                          style={[
                            styles.emptyText,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.noSourceManagement}
                        </NemuText>
                      </View>
                    )}
                  </SettingsSurface>
                  {/*
                    AIX import is a separate, deliberate flow rather than a
                    second header pill competing with Add: it opens the system
                    file picker and installs from local storage.
                  */}
                  <SettingsSurface
                    style={styles.sourceSectionShell}
                    contentStyle={styles.importSourceCard}
                  >
                    <View style={styles.readerHeader}>
                      <View style={styles.iconFrame}>
                        <Ionicons
                          name="document-attach-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <NemuText
                          style={[
                            styles.rowTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.settings.importSourceCardTitle}
                        </NemuText>
                        <NemuText
                          style={[
                            styles.rowSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.importSourceCardDescription}
                        </NemuText>
                      </View>
                    </View>
                    <NemuButton
                      accessibilityLabel={strings.settings.importSource}
                      containerStyle={styles.importSourceAction}
                      disabled={settingsActionBusy}
                      icon="document-attach-outline"
                      label={
                        importingSource
                          ? strings.settings.importingSource
                          : strings.settings.importSourceChooseFile
                      }
                      loading={importingSource}
                      onPress={importSourcePackage}
                      size="lg"
                      style={styles.importSourceButton}
                      variant="outline"
                    />
                  </SettingsSurface>
                </>
              ) : null}

              {activeSection === "data" ? (
                <>
                  <MobileStorageBreakdown
                    clearAllBusy={
                      pendingClearMode === "cache" ||
                      dataManagement.clearingMode === "cache"
                    }
                    strings={strings}
                    onClearAllCache={confirmClearCache}
                  />
                  <SettingsSurface
                    style={styles.rowShell}
                    contentStyle={styles.dataManagementCard}
                  >
                    <View style={styles.readerHeader}>
                      <View style={styles.iconFrame}>
                        <Ionicons
                          name="server-outline"
                          size={20}
                          color={tokens.primary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <NemuText
                          style={[
                            styles.rowTitle,
                            { color: tokens.foreground },
                          ]}
                        >
                          {strings.settings.dataManagement}
                        </NemuText>
                        <NemuText
                          style={[
                            styles.rowSubtitle,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {strings.settings.dataManagementDescription}
                        </NemuText>
                      </View>
                    </View>
                    <View style={styles.dataActions}>
                      <DataActionRow
                        icon="refresh-outline"
                        title={strings.settings.clearCache}
                        subtitle={strings.settings.clearCacheDescription}
                        actionLabel={strings.common.clear}
                        busy={
                          pendingClearMode === "cache" ||
                          dataManagement.clearingMode === "cache"
                        }
                        disabled={settingsActionBusy}
                        onPress={confirmClearCache}
                      />
                      <DataActionRow
                        icon="trash-outline"
                        title={strings.settings.clearAllData}
                        subtitle={strings.settings.clearAllDataDescription}
                        actionLabel={strings.common.clear}
                        busy={
                          pendingClearMode === "all" ||
                          dataManagement.clearingMode === "all"
                        }
                        disabled={settingsActionBusy}
                        destructive
                        onPress={confirmClearAllData}
                      />
                    </View>
                  </SettingsSurface>

                  <View
                    onLayout={(event) => {
                      setAgentCardY(event.nativeEvent.layout.y);
                    }}
                  >
                    <MobileAgentStatusCard />
                  </View>
                </>
              ) : null}
            </>
          )}
        </View>
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
            onCancel={() => {
              setClearCloudData(false);
              dismissSettingsConfirmation(
                shouldReopenMobileSourceSettingsAfterConfirmation({
                  activeSection,
                  confirmation,
                  sourceAvailable: selectedSource !== null,
                }),
              );
            }}
            onDismiss={handleConfirmationDismiss}
            onConfirm={runConfirmedAction}
          >
            {operationError ? (
              <MobileInlineErrorBanner
                title={strings.settings.settingsActionFailed}
                detail={operationError}
                dismissLabel={strings.common.clear}
                onDismiss={() => setOperationError(null)}
              />
            ) : null}
            {confirmation?.type === "clear-all-data" &&
            mobileSyncConfig.configured ? (
              <ClearCloudDataOption
                checked={clearCloudData}
                disabled={confirmationDetails.loading}
                strings={strings}
                onToggle={() => {
                  setClearCloudData((current) => !current);
                }}
              />
            ) : null}
          </MobileConfirmationSheet>
        ) : null}
        {selectedSource ? (
          <MobileInstalledSourceSettingsSheet
            source={selectedSource}
            iconUri={resolveMobileInstalledSourceIconUri(
              selectedSource,
              sourceIconIndex,
            )}
            strings={strings}
            visible={
              activeSection === "sources" && sourceSettingsSheetVisible
            }
            disabled={settingsActionBusy}
            settings={selectedSourceSchema}
            values={selectedSourceSettings.data}
            loading={selectedSourceSettings.loading}
            error={selectedSourceSettings.error ?? operationError}
            navigationResetKey={getMobileSourceSettingsNavigationResetKey(
              selectedSourceKey,
              selectedSourceSettingsKeys,
            )}
            loginCapabilities={selectedSourceLoginCapabilities}
            retryDisabled={!canRetrySelectedSourceSettingsError}
            retrying={retryingSelectedSourceSettings}
            onClose={() => setSourceSettingsSheetVisible(false)}
            onDismiss={handleSourceSettingsDismiss}
            onRetry={retrySelectedSourceSettings}
            onReset={() => {
              if (!selectedSourceKey || !selectedRuntimeSource) return;
              void runSettingsMutation(
                `source-settings-reset:${selectedSourceKey}`,
                async () => {
                  try {
                    await resetMobileSourceRuntimeSettings({
                      source: selectedRuntimeSource,
                      clearSandbox: clearMobileAidokuSandboxDataForSource,
                      resetProfileSettings:
                        selectedSourceSettings.resetSettings,
                    });
                    await hapticConfirm();
                  } catch (error) {
                    await reportSettingsError(error);
                  }
                },
              );
            }}
            onAction={handleSelectedSourceAction}
            onLogin={loginToSelectedSource}
            onLogout={(setting) => {
              if (
                !queueSourceSettingsConfirmation({
                  type: "source-logout",
                  setting,
                })
              ) {
                return;
              }
              setOperationError(null);
            }}
            onChange={(key, value, setting) => {
              if (!selectedSourceKey) return;
              void runSettingsMutation(
                `source-settings-value:${selectedSourceKey}:${key}`,
                async () => {
                  try {
                    await selectedSourceSettings.setSetting(key, value);
                    if (setting.notification) {
                      const operationError =
                        await executeSelectedSourceSettingOperation(
                          {
                            kind: "notification",
                            notification: setting.notification,
                          },
                          { ...selectedSourceSettings.data, [key]: value },
                        );
                      if (operationError) throw new Error(operationError);
                    }
                    if (!sourceSettingRequestsDataRefresh(setting)) return;
                    await reloadSelectedSourceSettingScopes(setting);
                  } catch {
                    await reportSettingsError(
                      new Error(strings.settings.sourceSettingsActionFailed),
                    );
                  }
                },
              );
            }}
          />
        ) : null}
        {selectedPlugin ? (
          <MobileReaderPluginSettingsSheet
            plugin={selectedPlugin}
            strings={strings}
            visible={activeSection === "reader"}
            disabled={settingsActionBusy}
            loading={readerPlugins.loading}
            error={readerPlugins.error}
            retryDisabled={!canRetryReaderPluginSettingsError}
            retrying={retryingReaderPlugins}
            onClose={() => setSelectedPluginId(null)}
            onRetry={retryReaderPlugins}
            onReset={() => {
              void runSettingsMutation(
                `reader-plugin-reset:${selectedPlugin.id}`,
                async () => {
                  try {
                    await readerPlugins.resetPluginValues(selectedPlugin.id);
                    await hapticConfirm();
                  } catch (error) {
                    await reportSettingsError(error);
                  }
                },
              );
            }}
            onChange={(key, value) => {
              void runSettingsMutation(
                `reader-plugin-value:${selectedPlugin.id}:${key}`,
                async () => {
                  try {
                    await readerPlugins.setPluginValue(
                      selectedPlugin.id,
                      key,
                      value,
                    );
                  } catch {
                    await hapticError();
                  }
                },
              );
            }}
          />
        ) : null}
        <MobileAboutSheet
          visible={aboutOpen}
          onClose={() => setAboutOpen(false)}
        />
      </PageScaffold>
    </>
  );
}

const styles = StyleSheet.create({
  settingsSurface: {
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: {
    gap: 12,
  },
  menuGroup: {
    gap: 8,
  },
  menuRowShell: {
    minHeight: 68,
    borderRadius: radius.lg,
  },
  menuRowContent: {
    justifyContent: "center",
  },
  menuRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  menuTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  menuSubtitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  rowShell: {
    minHeight: 68,
    borderRadius: radius.lg,
  },
  readerRow: {
    gap: 12,
    padding: 12,
  },
  appearanceRow: {
    gap: 14,
    padding: 12,
  },
  dataManagementCard: {
    gap: 12,
    padding: 12,
  },
  aboutShell: {
    minHeight: 50,
    borderRadius: radius.xl,
  },
  aboutContent: {
    justifyContent: "center",
  },
  aboutRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
  },
  aboutIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  readerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconFrame: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
  },
  settingBlock: {
    gap: 8,
  },
  settingCopy: {
    gap: 2,
  },
  settingTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.medium,
  },
  settingSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  dataActions: {
    gap: 8,
  },
  dataAction: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dataActionText: {
    flex: 1,
    minWidth: 0,
  },
  dataActionButton: {
    minWidth: 92,
  },
  nativeSegmentedShell: {
    minHeight: 34,
    justifyContent: "center",
  },
  nativeSegmentedIOSContainer: {
    minHeight: 34,
    position: "relative",
  },
  nativeSegmentedAccessibilityOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
  },
  nativeSegmentedAccessibilityOption: {
    flex: 1,
  },
  nativeSegmentedHost: {
    width: "100%",
    minHeight: 34,
  },
  nativeSegmented: {
    width: "100%",
    minHeight: 34,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
  },
  sourceList: {
    marginHorizontal: -12,
    marginBottom: -8,
  },
  sourceSectionShell: {
    borderRadius: radius.lg,
  },
  sourceSectionCard: {
    gap: 10,
    padding: 12,
  },
  sourceHeaderActions: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  pluginSectionShell: {
    borderRadius: radius.lg,
  },
  pluginSectionCard: {
    gap: 10,
    padding: 12,
  },
  pluginEmbeddedList: {
    marginHorizontal: -12,
    marginBottom: -8,
  },
  pluginEmbeddedRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    // The list bleeds to the card edge (`pluginEmbeddedList` cancels the
    // card's 12pt padding), so this row supplies the whole trailing inset.
    // 24 = the card padding plus the 12pt inner-row padding the sibling
    // "触感与提示" toggle rows use, so every switch on the screen shares one
    // right edge. The installed-source rows can sit at 6 because their icon
    // buttons carry a 44pt touch target around a 32pt pill; the bare 51pt
    // native switch has no such slack.
    paddingLeft: 12,
    paddingRight: 24,
    paddingVertical: 10,
  },
  pluginRowShell: {
    minHeight: 72,
    borderRadius: radius.lg,
  },
  pluginRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  sourceEmbeddedRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    // The trailing action buttons sit half the leading inset from the row
    // edge so the gear/trash cluster reads as part of the row, not adrift.
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 10,
  },
  sourceMainContainer: {
    flex: 1,
    minWidth: 0,
  },
  sourceMain: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pluginMainWrap: {
    flex: 1,
    minWidth: 0,
  },
  pluginMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pluginArtwork: {
    // One notch under the old 40pt tile so the plugin rows read at the same
    // scale as the sibling 34pt source icon tiles next to them.
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
  },
  pluginArtworkImage: {
    width: "100%",
    height: "100%",
  },
  pluginTitleArtwork: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.sm,
  },
  pluginSheetHeader: {
    alignItems: "center",
    gap: 4,
  },
  pluginSheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pluginSheetTitle: {
    flexShrink: 1,
    textAlign: "center",
  },
  pluginSheetDescription: {
    textAlign: "center",
  },
  disabledMain: {
    opacity: 0.62,
  },
  importSourceCard: {
    gap: 12,
    padding: 12,
  },
  importSourceAction: {
    alignSelf: "stretch",
  },
  importSourceButton: {
    alignSelf: "stretch",
  },
  pluginActions: {
    // The trailing cluster is sized by its content (44pt gear touch target +
    // 6pt gap + 54pt switch box) and never shrinks; `pluginMain` is the flex
    // child that absorbs a narrow screen or enlarged type, so the row can not
    // grow wider than its card. The old `minWidth: 92` was below that content
    // width and only obscured the real geometry.
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  sourceTitleIcon: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.sm,
  },
  sourceText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sourceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceTitle: {
    minWidth: 0,
    flexShrink: 1,
  },
  sourceActions: {
    minWidth: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  emptyRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  emptyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  cloudClearOption: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cloudClearCheck: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cloudClearCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cloudClearTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  cloudClearDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
