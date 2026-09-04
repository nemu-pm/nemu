import { useRef } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { InstalledSource, SourcePackageSetting } from "@/data/schema";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuText,
  radius,
  useNemuTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import { getMobileInstalledSourceName } from "@/lib/mobileInstalledSourcePresentation";
import { normalizeMobileSourceIconUri } from "@/lib/mobileSourceIconResolution";
import { getMobileSettingsSheetLayout } from "@/lib/mobileSettingsSheetLayout";
import { countVisibleSourceSettings } from "@/lib/mobileSourceSettings";
import type { MobileSourceLoginSubmission } from "@/lib/mobileSourceSettingActions";
import type { MobileSourceLoginCapabilities } from "@/sources/mobileSourceSettingsExecutor";
import { MobileSourceSettingsCard } from "./MobileSourceSettingsCard";
import { useMobileSourceSettingsTransientSheets } from "./useMobileSourceSettingsTransientSheets";

/**
 * Installed-source artwork. `icon` is the already-resolved URI from
 * `resolveMobileInstalledSourceIconUri` (installed record → registry catalog).
 *
 * The globe is rendered through `MobileCachedImage`'s `fallback` rather than a
 * local `failed` latch: the cache reports a transient error whenever the file
 * has not been downloaded yet (or a resolve was cancelled) and then repairs
 * itself, so unmounting the image on the first error pinned the placeholder for
 * the life of the screen.
 */
export function MobileSourceIcon({
  icon,
  placement = "row",
}: {
  icon?: string | null;
  placement?: "row" | "title";
}) {
  const { tokens } = useNemuTheme();
  const iconUri = normalizeMobileSourceIconUri(icon);
  const inTitle = placement === "title";
  const placeholder = (
    <Ionicons
      name="globe-outline"
      size={inTitle ? 20 : 22}
      color={tokens.mutedForeground}
    />
  );

  return (
    <View
      style={
        inTitle
          ? styles.titleIcon
          : [styles.rowIcon, { backgroundColor: tokens.sourceIconGlass }]
      }
    >
      {iconUri ? (
        <MobileCachedImage
          fallback={placeholder}
          uriOwnership="source"
          source={{ uri: iconUri }}
          style={styles.iconImage}
        />
      ) : (
        placeholder
      )}
    </View>
  );
}

/**
 * Runtime settings for one installed source. Rendered by both the Settings
 * 已安装源 list and the Browse long-press quick-action sheet, so the two
 * surfaces cannot drift; the owning screen supplies the settings state and the
 * mutation handlers.
 *
 * `onAction`/`onLogin`/`onLogout` are optional: `MobileSourceSettingsCard`
 * disables the rows that need them, which is how the reader-plugin sheet
 * already renders. Login and the rich setting kinds (multi-select, string
 * list) layer as their own sheets through the shared dismiss-then-present
 * handoff.
 */
export function MobileInstalledSourceSettingsSheet({
  source,
  iconUri,
  strings,
  visible,
  disabled,
  settings,
  values,
  loading,
  error,
  retryDisabled,
  retrying,
  navigationResetKey,
  onClose,
  onDismiss,
  onRetry,
  onReset,
  onChange,
  onAction,
  onLogin,
  onLogout,
  loginCapabilities = null,
}: {
  source: InstalledSource;
  iconUri: string | null;
  strings: MobileStrings;
  visible: boolean;
  disabled: boolean;
  settings: SourcePackageSetting[];
  values: Record<string, unknown>;
  loading: boolean;
  error: string | null;
  retryDisabled: boolean;
  retrying: boolean;
  navigationResetKey: string | number | null;
  onClose: () => void;
  onDismiss?: () => void;
  onRetry: () => void;
  onReset: () => void;
  onChange: (
    key: string,
    value: unknown,
    setting: SourcePackageSetting,
  ) => void;
  onAction?: (setting: SourcePackageSetting) => void;
  onLogin?: (
    setting: SourcePackageSetting,
    submission: MobileSourceLoginSubmission,
    options?: { signal?: AbortSignal },
  ) => Promise<string | null>;
  onLogout?: (setting: SourcePackageSetting) => void;
  loginCapabilities?: MobileSourceLoginCapabilities | null;
}) {
  const name = getMobileInstalledSourceName(source);
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const embeddedBackHandlerRef = useRef<(() => void) | null>(null);
  const sheetLayout = getMobileSettingsSheetLayout({
    fontScale,
    height,
    // Size the detent from the rows the current values actually render;
    // sources gate settings behind switches, and sizing from the declared
    // count reserved a large empty tail for shapes like MANGA Plus.
    rowCount: countVisibleSourceSettings(settings, values),
    width,
  });
  const transientSheets = useMobileSourceSettingsTransientSheets({
    visible,
    disabled,
    values,
    strings,
    onChange,
    onClose,
    onDismiss,
    ...(onLogin ? { onLogin } : null),
  });

  return (
    <>
      <MobileNativeSheetScaffold
        {...transientSheets.settingsSheetProps}
        onHardwareBackPress={() => {
          const handler = embeddedBackHandlerRef.current;
          if (!handler) return false;
          handler();
          return true;
        }}
        scroll={sheetLayout.scroll}
        snapPoints={sheetLayout.snapPoint ? [sheetLayout.snapPoint] : undefined}
        testID={`InstalledSourceSettingsSheet:${source.id}`}
      >
        {/*
          Same treatment as the plugin settings sheet: a leading header slot
          strands the source mark in the top-left corner while the title stays
          optically centered, so compose both into one centered row.
        */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <MobileSourceIcon icon={iconUri} placement="title" />
            <NemuText
              accessibilityRole="header"
              color={tokens.foreground}
              density="compact"
              numberOfLines={2}
              style={styles.title}
              variant="sheetTitle"
            >
              {name}
            </NemuText>
          </View>
        </View>
        <MobileSourceSettingsCard
          settings={settings}
          values={values}
          loading={loading}
          error={error}
          title={strings.settings.sourceSettingsDefaultTitle}
          hideSubtitle
          navigationResetKey={navigationResetKey}
          emptyMessage={strings.settings.sourceSettingsEmpty}
          showEmpty
          disabled={disabled}
          retryDisabled={retryDisabled}
          retrying={retrying}
          onEmbeddedBackHandlerChange={(handler) => {
            embeddedBackHandlerRef.current = handler;
          }}
          onRetry={onRetry}
          onReset={onReset}
          onChange={onChange}
          onAction={onAction}
          onLogin={onLogin}
          onLogout={onLogout}
          loginCapabilities={loginCapabilities}
          {...transientSheets.cardProps}
        />
      </MobileNativeSheetScaffold>
      {transientSheets.renderTransientSheet()}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    textAlign: "center",
  },
  titleIcon: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.sm,
  },
  rowIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
  },
  iconImage: {
    width: "100%",
    height: "100%",
  },
});
