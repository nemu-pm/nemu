import type { ComponentProps } from "react";
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  GlassSurface,
  MobileCachedImage,
  nemuColorWithAlpha,
  NemuPressable,
  NemuRingSpinner,
  createNemuShadowStyle,
  radius,
  nemuFontWeight,
  useNemuTheme,
  type NemuButtonDepthVariant,
} from "@/design-system";
import { MobileExpandableDescription } from "@/components/MobileExpandableDescription";
import { MobileMangaStatusBadge } from "@/components/MobileMangaStatusBadge";
import { MobileTagList } from "@/components/MobileTagList";
import type { MobileStrings } from "@/lib/mobileI18n";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
type MobileMangaDetailSurfaceActionsPlacement = "below" | "copy";

function isRemoteImageSource(
  source: MobileMangaDetailCoverSource | null | undefined,
): source is { uri: string; headers?: Record<string, string> } {
  return (
    typeof source === "object" &&
    source !== null &&
    !Array.isArray(source) &&
    typeof source.uri === "string"
  );
}

type MobileMangaDetailCoverSource =
  | number
  | { uri: string; headers?: Record<string, string> };

export type MobileMangaDetailSurfaceBadge = {
  key: string;
  label: string;
  iconUri?: string | null;
  tone?: "muted" | "primary";
};

export type MobileMangaDetailSurfacePrimaryAction = {
  label: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  available: boolean;
  busy?: boolean;
  disabled?: boolean;
  iconName: IoniconName;
  iconUri?: string | null;
  onPress: () => void;
};

export type MobileMangaDetailSurfaceAction = {
  key: string;
  accessibilityLabel: string;
  accessibilityHint?: string;
  busy?: boolean;
  disabled?: boolean;
  iconName: IoniconName;
  color?: string;
  buttonDepth?: NemuButtonDepthVariant;
  onPress: () => void;
};

function primaryActionDepth(
  action: MobileMangaDetailSurfacePrimaryAction,
): NemuButtonDepthVariant {
  return action.available ? "primary" : "secondary";
}

function secondaryActionDepth(
  action: MobileMangaDetailSurfaceAction,
): NemuButtonDepthVariant {
  if (action.buttonDepth) return action.buttonDepth;
  if (action.key === "library") {
    return action.iconName === "bookmark-outline" ? "secondary" : "outline";
  }
  if (action.key === "remove") return "destructive";
  return "outline";
}

export function MobileMangaDetailSurface({
  title,
  authors,
  coverSource,
  onCoverError,
  onCoverLoad,
  status,
  badges,
  primaryAction,
  secondaryActions = [],
  actionsPlacement = "below",
  tags,
  description,
  strings,
}: {
  title: string;
  authors?: string[];
  coverSource?: MobileMangaDetailCoverSource | null;
  /** Lets the owner fall back to the last cover that actually rendered. */
  onCoverError?: () => void;
  onCoverLoad?: () => void;
  status?: number;
  badges: MobileMangaDetailSurfaceBadge[];
  primaryAction?: MobileMangaDetailSurfacePrimaryAction | null;
  secondaryActions?: MobileMangaDetailSurfaceAction[];
  actionsPlacement?: MobileMangaDetailSurfaceActionsPlacement;
  tags?: string[];
  description?: string | null;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const coverWidth = Math.max(92, Math.min(112, Math.floor((width - 72) * 0.32)));
  const coverHeight = coverWidth * (3 / 2);
  const primaryActionColor = primaryAction?.available
    ? tokens.primaryForeground
    : tokens.mutedForeground;
  const renderActions = (placement: MobileMangaDetailSurfaceActionsPlacement) => {
    if (!primaryAction && !secondaryActions.length) return null;
    const primaryActionFull = placement === "below" && compact && secondaryActions.length > 1;

    return (
      <View style={[styles.actionRow, placement === "copy" ? styles.actionRowInCopy : null]}>
        {primaryAction ? (
          <NemuPressable
            accessibilityLabel={primaryAction.accessibilityLabel}
            accessibilityHint={primaryAction.accessibilityHint}
            accessibilityRole="button"
            accessibilityState={{
              busy: primaryAction.busy || undefined,
              disabled: primaryAction.disabled || undefined,
            }}
            buttonDepth={primaryActionDepth(primaryAction)}
            disabled={primaryAction.disabled}
            onPress={primaryAction.onPress}
            pressedScale={0.97}
            containerStyle={[
              styles.primaryActionContainer,
              primaryActionFull ? styles.primaryActionContainerFull : null,
            ]}
            style={[
              styles.primaryAction,
              {
                opacity: !primaryAction.available
                  ? 0.7
                  : primaryAction.disabled
                    ? 0.64
                    : 1,
              },
            ]}
          >
            {primaryAction.busy ? (
              <NemuRingSpinner
                size={15}
                color={primaryActionColor}
                accessibilityLabel={primaryAction.accessibilityLabel}
              />
            ) : primaryAction.iconUri ? (
              <MobileCachedImage
                fallback={
                  <Ionicons
                    name={primaryAction.iconName}
                    size={15}
                    color={primaryActionColor}
                  />
                }
                uriOwnership="source"
                source={{ uri: primaryAction.iconUri }}
                style={styles.primaryActionIcon}
              />
            ) : (
              <Ionicons name={primaryAction.iconName} size={15} color={primaryActionColor} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.primaryActionText, { color: primaryActionColor }]}
            >
              {primaryAction.label}
            </Text>
          </NemuPressable>
        ) : null}
        {secondaryActions.map((action) => (
          <NemuPressable
            key={action.key}
            accessibilityLabel={action.accessibilityLabel}
            accessibilityHint={action.accessibilityHint}
            accessibilityRole="button"
            accessibilityState={{
              busy: action.busy || undefined,
              disabled: action.disabled || undefined,
            }}
            buttonDepth={secondaryActionDepth(action)}
            disabled={action.disabled}
            onPress={action.onPress}
            pressedScale={0.94}
            containerStyle={styles.iconActionContainer}
            style={[
              styles.iconAction,
              {
                opacity: action.disabled ? 0.64 : 1,
              },
            ]}
          >
            {action.busy ? (
              <NemuRingSpinner
                size={16}
                color={action.color ?? tokens.primary}
                accessibilityLabel={action.accessibilityLabel}
              />
            ) : (
              <Ionicons
                name={action.iconName}
                size={action.iconName === "add-outline" ? 20 : 16}
                color={action.color ?? tokens.mutedForeground}
              />
            )}
          </NemuPressable>
        ))}
      </View>
    );
  };

  return (
    <GlassSurface style={styles.heroShell} contentStyle={styles.hero}>
      <View style={[styles.heroInfoRow, compact ? styles.heroInfoRowCompact : null]}>
        <View style={[styles.coverFrame, { width: coverWidth }]}>
          <View
            style={[
              styles.cover,
              {
                width: coverWidth,
                backgroundColor: tokens.muted,
                borderColor: tokens.coverBorder,
                ...createNemuShadowStyle({
                  color: tokens.shadow,
                  offsetY: 6,
                  radius: 18,
                  elevation: 6,
                }),
              },
            ]}
          >
            {isRemoteImageSource(coverSource) ? (
              <MobileCachedImage
                fallback={
                  <LinearGradient
                    colors={[nemuColorWithAlpha(tokens.primary, 0.33), tokens.muted]}
                    style={styles.coverPlaceholder}
                  />
                }
                uriOwnership="source"
                source={coverSource}
                onError={onCoverError ? () => onCoverError() : undefined}
                onLoad={onCoverLoad ? () => onCoverLoad() : undefined}
                style={styles.coverImage}
              />
            ) : coverSource ? (
              <Image source={coverSource} style={styles.coverImage} />
            ) : (
              <LinearGradient
                colors={[nemuColorWithAlpha(tokens.primary, 0.33), tokens.muted]}
                style={styles.coverPlaceholder}
              />
            )}
          </View>
          <MobileMangaStatusBadge
            status={status}
            strings={strings}
            style={styles.coverStatusBadge}
          />
        </View>
        <View style={styles.copy}>
          <View
            style={[
              styles.copyBody,
              actionsPlacement === "copy" ? { height: coverHeight } : null,
            ]}
          >
            <View style={styles.copyMain}>
              <Text
                numberOfLines={compact ? 4 : 3}
                style={[
                  styles.title,
                  compact ? styles.titleCompact : null,
                  { color: tokens.foreground },
                ]}
              >
                {title}
              </Text>
              {authors?.length ? (
                <Text numberOfLines={2} style={[styles.text, { color: tokens.mutedForeground }]}>
                  {authors.join(", ")}
                </Text>
              ) : null}
            </View>
            {actionsPlacement === "copy" ? (
              <>
                <View style={styles.copyBodySpacer} />
                {renderActions("copy")}
              </>
            ) : null}
          </View>
          {badges.length ? (
            <View style={styles.badgeRow}>
              {badges.map((badge) => {
                const primary = badge.tone === "primary";
                return (
                  <View
                    key={badge.key}
                    style={[
                      styles.badge,
                      {
                        backgroundColor: primary ? tokens.primary : tokens.muted,
                      },
                    ]}
                  >
                    {badge.iconUri ? (
                      <MobileCachedImage
                        fallback={null}
                        uriOwnership="source"
                        source={{ uri: badge.iconUri }}
                        style={styles.sourceBadgeIcon}
                      />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.badgeText,
                        {
                          color: primary ? tokens.primaryForeground : tokens.mutedForeground,
                        },
                      ]}
                    >
                      {badge.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {actionsPlacement === "below" ? renderActions("below") : null}

      {tags?.length ? <MobileTagList tags={tags} strings={strings} /> : null}

      {description ? (
        <MobileExpandableDescription key={description} value={description} strings={strings} />
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  heroShell: {
    borderRadius: radius.xl,
  },
  hero: {
    gap: 14,
    padding: 14,
  },
  heroInfoRow: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  heroInfoRowCompact: {
    gap: 12,
  },
  coverFrame: {
    flexShrink: 0,
    alignItems: "center",
    paddingBottom: 14,
  },
  cover: {
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    flex: 1,
  },
  coverStatusBadge: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
  },
  copy: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 8,
  },
  copyBody: {
    gap: 8,
  },
  copyBodySpacer: {
    flex: 1,
    minHeight: 0,
  },
  copyMain: {
    gap: 8,
    flexShrink: 1,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 26,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  badge: {
    minHeight: 26,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: 9,
  },
  sourceBadgeIcon: {
    flexShrink: 0,
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  badgeText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  actionRowInCopy: {
    flexWrap: "nowrap",
    alignSelf: "stretch",
  },
  primaryAction: {
    minHeight: 36,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
  },
  primaryActionContainer: {
    flex: 1,
    minWidth: 0,
  },
  primaryActionContainerFull: {
    flexBasis: "100%",
  },
  primaryActionIcon: {
    flexShrink: 0,
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  primaryActionText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  iconAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  iconActionContainer: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
});
