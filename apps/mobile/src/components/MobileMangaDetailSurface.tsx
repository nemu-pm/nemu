import {
  getMobileMangaDetailActionPresentation,
  getMobileMangaDetailPrimaryButtonWidth,
  MOBILE_DETAIL_ACTION_GAP,
  MOBILE_DETAIL_ACTION_HORIZONTAL_PADDING,
  MOBILE_DETAIL_ACTION_ICON_WIDTH,
  MOBILE_DETAIL_ACTION_ROW_GAP,
  MOBILE_DETAIL_ICON_ACTION_WIDTH,
} from "@/lib/mobileMangaDetailActionLabel";
import { useCallback, useState, type ComponentProps } from "react";
import {
  fitMobileDetailTagRow,
  getMobileDetailActionRowOverhang,
  getMobileDetailBaseCoverWidth,
  getMobileDetailHeroCopyLayout,
  getMobileDetailOverflowSampleLabel,
  MOBILE_DETAIL_HERO_METRICS,
} from "@/lib/mobileMangaDetailTagLayout";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import {
  GlassSurface,
  getNemuButtonMinimumTargetSize,
  MobileCachedImage,
  MobileChip,
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
import { useMobileMangaDetailPane } from "@/components/MobileMangaDetailPaneContext";
import { MobileMangaDetailTagSheet } from "@/components/MobileMangaDetailTagSheet";
import { MobileMangaStatusBadge } from "@/components/MobileMangaStatusBadge";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH } from "@/lib/mobileMangaDetailPresentation";
import { getMobileMangaDetailHeroLayout } from "@/lib/mobileDynamicTypeLayout";
import {
  getMobileDetailPaneCoverWidth,
  MOBILE_DETAIL_PANE_METRICS,
} from "@/lib/mobileMangaDetailPaneLayout";

/**
 * The hero title and primary action wrap at large text sizes; beyond this
 * multiplier the extra size only pushes the chapters off-screen.
 */
const HERO_MAX_FONT_SIZE_MULTIPLIER = MOBILE_DETAIL_HERO_METRICS.maxFontSizeMultiplier;
const HERO_COMPACT_ROW_WIDTH = MOBILE_DETAIL_HERO_METRICS.compactRowWidth;
const HERO_ROW_GAP = 14;
const HERO_ROW_GAP_COMPACT = 12;
const TAG_GAP = 8;

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
  compactLabel?: string;
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
  /** Pinned chips (e.g. "Updated") that lead the tag row and never overflow. */
  badges: MobileMangaDetailSurfaceBadge[];
  primaryAction?: MobileMangaDetailSurfacePrimaryAction | null;
  secondaryActions?: MobileMangaDetailSurfaceAction[];
  actionsPlacement?: MobileMangaDetailSurfaceActionsPlacement;
  tags?: string[];
  description?: string | null;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const minimumTouchTarget = getNemuButtonMinimumTargetSize(Platform.OS);
  // Regular-width info pane: no card inside the pane, a larger cover, every
  // tag below the hero row and the description in full (see
  // `mobileMangaDetailPaneLayout`). Everywhere else: design A, unchanged.
  const paneMode = useMobileMangaDetailPane().role === "leading";
  // Lay out from the hero's own width, not the window: in a split view the
  // hero lives in the leading pane. Until measured, assume a full-width page.
  const [rowWidth, setRowWidth] = useState(0);
  const surfaceWidth = rowWidth > 0 ? rowWidth : Math.max(0, windowWidth - 60);
  const compact = surfaceWidth < HERO_COMPACT_ROW_WIDTH;
  const heroLayout = getMobileMangaDetailHeroLayout({
    fontScale,
    compact,
    requestedActionsPlacement: actionsPlacement,
  });
  const stacked = heroLayout.stacked;
  const effectiveActionsPlacement = heroLayout.actionsPlacement;
  const hasActions = Boolean(primaryAction || secondaryActions.length);
  const requestedActionsInCopy = !stacked && effectiveActionsPlacement === "copy" && hasActions;
  const tagList = tags ?? [];
  const hasTagRow = tagList.length > 0 || badges.length > 0;
  // In the pane the tags get their own wrapping block under the hero row.
  const tagsInCopy = hasTagRow && !paneMode;
  const heroRowGap = paneMode
    ? MOBILE_DETAIL_PANE_METRICS.heroRowGap
    : compact
      ? HERO_ROW_GAP_COMPACT
      : HERO_ROW_GAP;
  const copyLayoutFor = (withActions: boolean) =>
    getMobileDetailHeroCopyLayout({
      surfaceWidth,
      fontScale,
      compact,
      hasAuthors: Boolean(authors?.length),
      hasTagRow: tagsInCopy,
      hasActions: withActions,
      // The pane's taller cover leaves room for a fourth title line.
      maxTitleLines: paneMode
        ? Math.max(MOBILE_DETAIL_PANE_METRICS.maxTitleLines, heroLayout.titleLines ?? 0)
        : heroLayout.titleLines ?? 3,
      minimumTouchTarget,
      baseCoverWidth: paneMode ? getMobileDetailPaneCoverWidth(surfaceWidth) : undefined,
    });
  const requestedCopyLayout = copyLayoutFor(requestedActionsInCopy);

  // The primary label never truncates: its natural widths are measured once
  // (off-screen) and the presentation picks full → short label → the row
  // below the cover. Decided from the in-copy geometry only, so moving the
  // row cannot feed back into the decision.
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const recordLabelWidth = useCallback((text: string, width: number) => {
    setLabelWidths((previous) => (previous[text] === width ? previous : { ...previous, [text]: width }));
  }, []);
  const primaryLabelTexts = primaryAction
    ? [primaryAction.label, ...(primaryAction.compactLabel ? [primaryAction.compactLabel] : [])]
    : [];
  const needsLabelMeasurement = primaryLabelTexts.some((text) => labelWidths[text] === undefined);
  const secondaryCount = secondaryActions.length;
  const primaryPresentation = primaryAction
    ? getMobileMangaDetailActionPresentation({
        label: primaryAction.label,
        compactLabel: primaryAction.compactLabel,
        labelWidth: labelWidths[primaryAction.label],
        compactLabelWidth: primaryAction.compactLabel ? labelWidths[primaryAction.compactLabel] : undefined,
        requestedPlacement: requestedActionsInCopy ? "copy" : "below",
        copyButtonWidth: getMobileMangaDetailPrimaryButtonWidth({
          rowWidth: surfaceWidth - requestedCopyLayout.coverWidth - heroRowGap,
          secondaryCount,
          maxWidth: MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH,
          minimumTouchTarget,
        }),
        belowButtonWidth: getMobileMangaDetailPrimaryButtonWidth({
          rowWidth: surfaceWidth,
          secondaryCount,
          maxWidth: MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH,
          fullRow: (compact && secondaryCount > 1) || stacked,
          minimumTouchTarget,
        }),
        wrap: heroLayout.primaryActionLines === undefined,
        fontScale,
      })
    : null;
  const actionsInCopy = requestedActionsInCopy && (primaryPresentation?.placement ?? "copy") === "copy";
  const copyLayout = actionsInCopy === requestedActionsInCopy ? requestedCopyLayout : copyLayoutFor(actionsInCopy);
  const coverWidth = stacked
    ? paneMode
      ? getMobileDetailPaneCoverWidth(surfaceWidth)
      : getMobileDetailBaseCoverWidth(surfaceWidth)
    : copyLayout.coverWidth;
  const coverHeight = stacked ? coverWidth * 1.5 : copyLayout.coverHeight;
  const [tagSheetOpen, setTagSheetOpen] = useState(false);

  // Tag fitting is measured: every chip renders once, invisibly, to report
  // its width; the visible row then shows the prefix that fits plus "+N".
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const [tagRowWidth, setTagRowWidth] = useState(0);
  const recordChipWidth = useCallback((key: string, width: number) => {
    setChipWidths((previous) => (previous[key] === width ? previous : { ...previous, [key]: width }));
  }, []);
  const tagKeys = tagList.map((tag, index) => `tag:${index}:${tag}`);
  const badgeKeys = badges.map((badge) => `badge:${badge.key}:${badge.label}`);
  const overflowSample = getMobileDetailOverflowSampleLabel(tagList.length);
  const overflowKey = `overflow:${overflowSample}`;
  const tagFit = fitMobileDetailTagRow({
    availableWidth: tagRowWidth,
    tagWidths: tagKeys.map((key) => chipWidths[key]),
    pinnedWidths: badgeKeys.map((key) => chipWidths[key]),
    overflowChipWidth: chipWidths[overflowKey],
    gap: TAG_GAP,
    // Stacked (large text): the row spans the card, so a second line is fine.
    // The pane's tag block wraps like web's (which folds after ten tags).
    maxLines: paneMode ? MOBILE_DETAIL_PANE_METRICS.tagMaxLines : stacked ? 2 : 1,
  });
  const needsChipMeasurement =
    hasTagRow &&
    [...tagKeys, ...badgeKeys, ...(tagList.length ? [overflowKey] : [])].some(
      (key) => chipWidths[key] === undefined,
    );
  const overflowChipMargin = -Math.max(0, (minimumTouchTarget - MOBILE_DETAIL_HERO_METRICS.chipHeight) / 2);

  const primaryActionColor = primaryAction?.available
    ? tokens.primaryForeground
    : tokens.mutedForeground;

  const renderBadgeChip = (badge: MobileMangaDetailSurfaceBadge) => (
    <MobileChip
      key={badge.key}
      accessibilityLabel={badge.label}
      icon={badge.iconUri ?? undefined}
      label={badge.label}
      selected={badge.tone === "primary"}
      variant="static"
    />
  );
  const renderOverflowChip = (label: string, count: number, onPress?: () => void) => (
    <View style={{ marginVertical: overflowChipMargin }}>
      <MobileChip
        accessibilityLabel={formatMobileString(strings.common.moreTags, { count })}
        accessibilityHint={strings.common.tagsSheetHint}
        accessibilityState={{}}
        label={label}
        onPress={onPress ?? (() => undefined)}
        variant="toggle"
      />
    </View>
  );

  const tagRow = hasTagRow ? (
    <View
      onLayout={(event) => setTagRowWidth(event.nativeEvent.layout.width)}
      style={[
        styles.tagRow,
        stacked || paneMode ? styles.tagRowWrapping : styles.tagRowSingleLine,
      ]}
    >
      {tagFit.ready ? (
        <>
          {badges.map(renderBadgeChip)}
          {tagList.slice(0, tagFit.visibleCount).map((tag, index) => (
            <MobileChip
              key={tagKeys[index]}
              accessibilityLabel={tag}
              label={tag}
              variant="static"
            />
          ))}
          {tagFit.overflowCount > 0
            ? renderOverflowChip(`+${tagFit.overflowCount}`, tagFit.overflowCount, () => setTagSheetOpen(true))
            : null}
        </>
      ) : null}
      {needsChipMeasurement ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.chipMeasurer}
        >
          {badges.map((badge, index) => (
            <View
              key={badgeKeys[index]}
              onLayout={(event) => recordChipWidth(badgeKeys[index], event.nativeEvent.layout.width)}
            >
              {renderBadgeChip(badge)}
            </View>
          ))}
          {tagList.map((tag, index) => (
            <View
              key={tagKeys[index]}
              onLayout={(event) => recordChipWidth(tagKeys[index], event.nativeEvent.layout.width)}
            >
              <MobileChip accessibilityLabel={tag} label={tag} variant="static" />
            </View>
          ))}
          {tagList.length ? (
            <View onLayout={(event) => recordChipWidth(overflowKey, event.nativeEvent.layout.width)}>
              {renderOverflowChip(overflowSample, 0)}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const renderActions = (placement: MobileMangaDetailSurfaceActionsPlacement) => {
    if (!hasActions) return null;
    const primaryActionFull =
      placement === "below" &&
      ((compact && secondaryActions.length > 1) || stacked);

    return (
      <View
        style={[
          styles.actionRow,
          placement === "copy"
            ? [
                styles.actionRowInCopy,
                // The pill, not its invisible touch frame, meets the cover edge.
                { marginBottom: -getMobileDetailActionRowOverhang({ minimumTouchTarget }) },
              ]
            : null,
        ]}
      >
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
              maxFontSizeMultiplier={HERO_MAX_FONT_SIZE_MULTIPLIER}
              numberOfLines={primaryPresentation?.lines}
              style={[
                styles.primaryActionText,
                primaryPresentation?.lines === undefined ? styles.primaryActionTextWrapping : null,
                { color: primaryActionColor },
              ]}
            >
              {primaryPresentation?.label ?? primaryAction.label}
            </Text>
          </NemuPressable>
        ) : null}
        {primaryAction && needsLabelMeasurement ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={styles.labelMeasurer}
          >
            {primaryLabelTexts.map((text) => (
              <Text
                key={text}
                maxFontSizeMultiplier={HERO_MAX_FONT_SIZE_MULTIPLIER}
                numberOfLines={1}
                onLayout={(event) => recordLabelWidth(text, Math.ceil(event.nativeEvent.layout.width))}
                style={styles.primaryActionMeasureText}
              >
                {text}
              </Text>
            ))}
          </View>
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

  const content = (
    <>
      <View
        onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        style={[
          styles.heroInfoRow,
          { gap: heroRowGap },
          stacked ? styles.heroInfoRowStacked : null,
        ]}
      >
        <View
          style={[
            styles.coverFrame,
            { width: coverWidth },
            stacked ? styles.coverFrameStacked : null,
          ]}
        >
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
        <View
          style={[
            styles.copy,
            { gap: copyLayout.gap },
            stacked ? styles.copyStacked : { minHeight: coverHeight },
            paneMode && !stacked ? styles.copyPane : null,
          ]}
        >
          <View style={[styles.copyTop, { gap: copyLayout.gap }]}>
            <Text
              maxFontSizeMultiplier={HERO_MAX_FONT_SIZE_MULTIPLIER}
              numberOfLines={stacked ? heroLayout.titleLines : copyLayout.titleLines}
              style={[
                styles.title,
                compact ? styles.titleCompact : null,
                { color: tokens.foreground },
              ]}
            >
              {title}
            </Text>
            {authors?.length ? (
              <Text
                maxFontSizeMultiplier={HERO_MAX_FONT_SIZE_MULTIPLIER}
                numberOfLines={stacked ? undefined : copyLayout.authorLines}
                style={[styles.text, { color: tokens.mutedForeground }]}
              >
                {authors.join(", ")}
              </Text>
            ) : null}
          </View>
          {paneMode ? null : stacked ? tagRow : (
            // Whatever room the title leaves is the tag row's; the actions
            // below it stay pinned to the cover's bottom edge.
            <View style={styles.copyMiddle}>{tagRow}</View>
          )}
          {actionsInCopy ? renderActions("copy") : null}
        </View>
      </View>

      {!actionsInCopy ? renderActions("below") : null}

      {paneMode ? tagRow : null}

      {description ? (
        <MobileExpandableDescription
          key={description}
          value={description}
          strings={strings}
          pane={paneMode}
        />
      ) : null}

      {tagList.length ? (
        <MobileMangaDetailTagSheet
          visible={tagSheetOpen}
          tags={tagList}
          strings={strings}
          onClose={() => setTagSheetOpen(false)}
        />
      ) : null}
    </>
  );

  // The pane is already its own column (hairline divider, or the fold): its
  // content sits on the page background instead of a card inside the pane.
  return paneMode ? (
    <View style={styles.paneHero}>{content}</View>
  ) : (
    <GlassSurface style={styles.heroShell} contentStyle={styles.hero}>
      {content}
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
  paneHero: {
    gap: MOBILE_DETAIL_PANE_METRICS.blockGap,
  },
  heroInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  // Large text: cover on its own row, copy (title/authors/tags) full width.
  heroInfoRowStacked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  coverFrame: {
    flexShrink: 0,
    alignItems: "center",
    paddingBottom: 14,
  },
  coverFrameStacked: {
    alignSelf: "center",
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
  },
  // In the stacked (column) hero the copy sizes to its content instead of
  // flexing against the cover.
  copyStacked: {
    flex: 0,
    flexGrow: 0,
    flexBasis: "auto",
  },
  copyTop: {
    flexShrink: 1,
  },
  // Title/authors on top, actions on the cover's bottom edge.
  copyPane: {
    justifyContent: "space-between",
  },
  copyMiddle: {
    flexGrow: 1,
    justifyContent: "center",
    minHeight: MOBILE_DETAIL_HERO_METRICS.chipHeight,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: MOBILE_DETAIL_HERO_METRICS.titleLineHeight,
    fontWeight: nemuFontWeight.bold,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: MOBILE_DETAIL_HERO_METRICS.compactTitleLineHeight,
  },
  text: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: MOBILE_DETAIL_HERO_METRICS.authorLineHeight,
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TAG_GAP,
  },
  // One line, height-capped: tag count can never change the card height.
  tagRowSingleLine: {
    flexWrap: "nowrap",
    height: MOBILE_DETAIL_HERO_METRICS.chipHeight,
  },
  tagRowWrapping: {
    flexWrap: "wrap",
  },
  // Off-screen twin of the tag row that only reports chip widths.
  chipMeasurer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: TAG_GAP,
    opacity: 0,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: MOBILE_DETAIL_ACTION_ROW_GAP,
    alignItems: "center",
  },
  actionRowInCopy: {
    flexWrap: "nowrap",
    alignSelf: "stretch",
  },
  primaryAction: {
    minHeight: 36,
    paddingVertical: 6,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: MOBILE_DETAIL_ACTION_GAP,
    borderRadius: radius.pill,
    paddingHorizontal: MOBILE_DETAIL_ACTION_HORIZONTAL_PADDING,
  },
  primaryActionContainer: {
    flex: 1,
    minWidth: 0,
    maxWidth: MOBILE_MANGA_DETAIL_PRIMARY_ACTION_MAX_WIDTH,
  },
  primaryActionContainerFull: {
    flexBasis: "100%",
  },
  primaryActionIcon: {
    flexShrink: 0,
    width: MOBILE_DETAIL_ACTION_ICON_WIDTH,
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
  primaryActionTextWrapping: {
    textAlign: "center",
  },
  // Same type as the label, unconstrained, so it reports its natural width.
  primaryActionMeasureText: {
    alignSelf: "flex-start",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  labelMeasurer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 2000,
    alignItems: "flex-start",
    opacity: 0,
  },
  iconAction: {
    width: MOBILE_DETAIL_ICON_ACTION_WIDTH,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  iconActionContainer: {
    width: MOBILE_DETAIL_ICON_ACTION_WIDTH,
    height: 36,
    flexShrink: 0,
  },
});
