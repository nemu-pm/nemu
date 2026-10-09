/**
 * A reader plugin's page of settings, drawn with our React Native components,
 * shared by Settings → Reader → Plugins (the gear's sheet) and the reader's
 * own Plugins sheet, so both show the same rows: the plugin mark and name, its
 * description, and the settings card (engine picker, the on-device dictionary
 * line under it, the sign-in-gated assist switch, Reset).
 */

import { useState, type ComponentProps, type ReactNode } from "react";
import { Image, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileJapaneseLearningDictionaryRow } from "@/components/MobileJapaneseLearningDictionaryRow";
import { MobileSourceSettingsCard } from "@/components/MobileSourceSettingsCard";
import { NemuText, radius, useNemuTheme } from "@/design-system";
import type { SourcePackageSetting } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY } from "@/lib/mobileJapaneseLearningEngine";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import dualReadIconImage from "../../../../src/lib/plugins/builtin/dual-reader/icon.png";
import japaneseLearningIconImage from "../../../../src/lib/plugins/builtin/japanese-learning/icon.png";

const readerPluginArtworkSources = {
  "dual-reader": Image.resolveAssetSource(dualReadIconImage),
  "japanese-learning": Image.resolveAssetSource(japaneseLearningIconImage),
} as const;

/**
 * `row` is the boxed 34pt list artwork. `title` is the bare mark that sits on
 * the baseline of a sheet title: no tinted frame, sized to the title line box
 * so the icon and the title read as one centered unit.
 */
export function ReaderPluginIcon({
  plugin,
  placement = "row",
}: {
  plugin: Pick<MobileReaderPluginState, "id" | "name" | "icon" | "enabled">;
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
    ? styles.titleArtwork
    : [styles.artwork, { backgroundColor: tokens.sourceIconGlass }];

  if (source && !failed) {
    return (
      <View style={frameStyle}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={plugin.name}
          fadeDuration={0}
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={source}
          style={styles.artworkImage}
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

/** The plugin's mark and name as one centered title line. */
export function MobileReaderPluginSettingsTitle({
  plugin,
  numberOfLines = 2,
}: {
  plugin: MobileReaderPluginState;
  numberOfLines?: number;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.titleRow}>
      <ReaderPluginIcon plugin={plugin} placement="title" />
      <NemuText
        accessibilityRole="header"
        color={tokens.foreground}
        density="compact"
        numberOfLines={numberOfLines}
        style={styles.title}
        variant="sheetTitle"
      >
        {plugin.name}
      </NemuText>
    </View>
  );
}

/** The plugin's description, centered under its title. */
export function MobileReaderPluginSettingsDescription({
  plugin,
}: {
  plugin: MobileReaderPluginState;
}) {
  const { tokens } = useNemuTheme();
  if (!plugin.description) return null;
  return (
    <NemuText
      color={tokens.mutedForeground}
      density="compact"
      style={styles.description}
      variant="rowSubtitle"
    >
      {plugin.description}
    </NemuText>
  );
}

/**
 * The plugin mark, name and description: the head of the plugin's page when
 * nothing else carries its title (Settings' sheet has no navigation bar).
 */
export function MobileReaderPluginSettingsHeader({
  plugin,
}: {
  plugin: MobileReaderPluginState;
}) {
  return (
    <View style={styles.header}>
      <MobileReaderPluginSettingsTitle plugin={plugin} />
      <MobileReaderPluginSettingsDescription plugin={plugin} />
    </View>
  );
}

type SourceSettingsCardProps = ComponentProps<typeof MobileSourceSettingsCard>;

/** The plugin's settings card, with the on-device dictionary line under Recognition Engine. */
export function MobileReaderPluginSettingsCard({
  plugin,
  strings,
  disabled,
  loading,
  error,
  retryDisabled,
  retrying,
  inert = false,
  onRetry,
  onReset,
  onChange,
  cardProps,
}: {
  /** Already resolved for the sign-in state (`useMobileReaderPluginSignedInState`). */
  plugin: MobileReaderPluginState;
  strings: MobileStrings;
  disabled: boolean;
  loading: boolean;
  error: string | null;
  retryDisabled?: boolean;
  retrying?: boolean;
  /** An off-screen copy that only measures the page: it never starts a dictionary download. */
  inert?: boolean;
  onRetry?: () => void;
  onReset: () => void;
  onChange: (key: string, value: unknown, setting: SourcePackageSetting) => void;
  /** The host's dedicated-sheet handoffs (`useMobileSourceSettingsTransientSheets().cardProps`). */
  cardProps?: Pick<
    SourceSettingsCardProps,
    "onRequestLoginSheet" | "onRequestMultiSelectSheet" | "onRequestStringListSheet"
  >;
}): ReactNode {
  return (
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
      renderSettingAccessory={
        plugin.id === "japanese-learning"
          ? (setting, values) =>
              setting.key === MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY ? (
                <MobileJapaneseLearningDictionaryRow
                  disabled={disabled}
                  engine={values[MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY]}
                  strings={strings}
                  autoInstall={!inert}
                />
              ) : null
          : undefined
      }
      {...cardProps}
    />
  );
}

const styles = StyleSheet.create({
  artwork: {
    // One notch under the old 40pt tile so the plugin rows read at the same
    // scale as the sibling 34pt source icon tiles next to them.
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.md,
  },
  artworkImage: {
    width: "100%",
    height: "100%",
  },
  titleArtwork: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderRadius: radius.sm,
  },
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
  description: {
    textAlign: "center",
  },
});
