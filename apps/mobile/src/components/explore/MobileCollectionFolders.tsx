import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalCollection,
} from "@/data/schema";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  NemuText,
  useMobilePageGutters,
  useNemuTheme,
} from "@/design-system";
import {
  getMobileCollectionFolderWidth,
  MOBILE_COLLECTION_FOLDER_ASPECT,
  MOBILE_COLLECTION_FOLDER_GAP,
  MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE,
} from "@/lib/mobileCollectionFolderGeometry";
import { buildMobileCoverTintPalette } from "@/lib/mobileCoverTint";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { useMobileCoverTint } from "@/lib/useMobileCoverTint";
import { ExploreGlass } from "./ExploreGlass";
import { ExploreCoverFallback } from "./ExploreCoverFallback";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import { useMobileExploreEntryCover } from "./mobileExploreCover";
import { useMobileExploreRowBleed } from "./useMobileExploreRowBleed";

const FOLDER_ASPECT = MOBILE_COLLECTION_FOLDER_ASPECT;
const FOLDER_RADIUS = R.group;
/** The front pocket's share of the folder's height; the covers rise above it. */
const POCKET_SHARE = 0.48;
/** The back panel starts this far down, so the covers stand out above it. */
const BACK_TOP = 12;
const FAN_COVER_SHARE = 0.46;
const FAN_SPREAD_SHARE = 0.2;
/** Rotation, offset (in spreads) and drop of up to three covers fanned out of the pocket. */
const FAN = [
  { rotate: -9, x: -1, y: 8 },
  { rotate: 8, x: 1, y: 8 },
  { rotate: 0, x: 0, y: 0 },
] as const;
const FAN_PAIR = [
  { rotate: -6, x: -0.55, y: 4 },
  { rotate: 6, x: 0.55, y: 4 },
] as const;

/**
 * Collections as folders: a row of tinted folders in their front cover's
 * colour, up to three covers fanned up out of each, a glass front pocket the
 * covers show softly through, and the name and size underneath. More folders
 * than fit scroll sideways. Tapping opens the collection in place (the Library
 * title menu's selection).
 */
export function MobileCollectionFolders({
  collections,
  membership,
  entries,
  installedSources,
  strings,
  onSelect,
}: {
  collections: LocalCollection[];
  membership: Map<string, Set<string>>;
  /** Library entries in display order (most recent first). */
  entries: LibraryEntry[];
  installedSources: InstalledSource[];
  strings: MobileStrings;
  onSelect: (collectionId: string) => void;
}) {
  const { tokens } = useNemuTheme();
  const bleed = useMobileExploreRowBleed();
  const gutters = useMobilePageGutters();
  const { width: windowWidth } = useWindowDimensions();
  const folders = useMemo(
    () =>
      collections
        .filter((collection) => !collection.removed)
        .map((collection) => {
          const members = membership.get(collection.collectionId) ?? new Set<string>();
          return {
            collection,
            count: members.size,
            covers: entries.filter((entry) => members.has(entry.item.libraryItemId)).slice(0, 3),
          };
        }),
    [collections, entries, membership],
  );
  if (!folders.length) return null;
  const width = getMobileCollectionFolderWidth(windowWidth - gutters.left - gutters.right, FOLDER_GAP);
  return (
    <View style={styles.section}>
      <NemuText
        accessibilityRole="header"
        maxFontSizeMultiplier={MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE}
        color={tokens.foreground}
        style={styles.title}
      >
        {strings.designExplore.collectionsTitle}
      </NemuText>
      <View style={[bleed.frame, bleed.clips ? styles.frameClip : null]}>
        <ScrollView
          horizontal
          // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
          scrollsToTop={false}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={width + FOLDER_GAP}
          style={styles.scroller}
          contentContainerStyle={[bleed.content, styles.row]}
        >
          {folders.map(({ collection, count, covers }) => (
            <Folder
              key={collection.collectionId}
              name={collection.name}
              count={count}
              covers={covers}
              width={width}
              installedSources={installedSources}
              strings={strings}
              onPress={() => onSelect(collection.collectionId)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const Folder = memo(function Folder({
  name,
  count,
  covers,
  width,
  installedSources,
  strings,
  onPress,
}: {
  name: string;
  count: number;
  covers: LibraryEntry[];
  width: number;
  installedSources: InstalledSource[];
  strings: MobileStrings;
  onPress: () => void;
}) {
  const { scheme, tokens } = useNemuTheme();
  const height = Math.round(width * FOLDER_ASPECT);
  const countLabel = formatMobileString(
    count === 1 ? strings.designExplore.collectionCountOne : strings.designExplore.collectionCount,
    { count },
  );
  // The folder takes its front cover's colour (the most recent title).
  const front = covers[0] ?? null;
  const frontCover = useMobileExploreEntryCover(front, installedSources);
  const tint = useMobileCoverTint(frontCover, front ? `item:${front.item.libraryItemId}` : undefined);
  const palette = useMemo(() => buildMobileCoverTintPalette(tint, scheme), [scheme, tint]);
  const coverWidth = Math.round(width * FAN_COVER_SHARE);
  const spread = Math.round(width * FAN_SPREAD_SHARE);
  const pocketHeight = Math.round(height * POCKET_SHARE);
  const fanned = covers.slice(0, 3);
  const slots = fanned.length === 1 ? [FAN[2]] : fanned.length === 2 ? FAN_PAIR : FAN;
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${countLabel}`}
      accessibilityHint={strings.designExplore.openCollectionHint}
      hapticFeedback="press"
      pressProfile="card"
      onPress={onPress}
      style={{ width }}
    >
      <View style={{ width, height }}>
        {/* The folder's back, in the cover's colour. */}
        <View
          style={[
            styles.back,
            { top: BACK_TOP, backgroundColor: palette.card },
            createNemuShadowStyle({ color: palette.cardGlow, offsetY: 6, radius: 14, elevation: 6 }),
          ]}
        />
        <View style={styles.fan}>
          {fanned.length === 0 ? (
            <Ionicons
              name="albums-outline"
              size={28}
              color={palette.cardInkSecondary}
              style={{ marginTop: Math.round((height - pocketHeight - 28) / 2) + BACK_TOP / 2 }}
            />
          ) : (
            [...fanned].reverse().map((entry, index) => {
              const slot = slots[index] ?? FAN[2];
              return (
                <FanCover
                  key={entry.item.libraryItemId}
                  entry={entry}
                  installedSources={installedSources}
                  width={coverWidth}
                  rotate={slot.rotate}
                  x={slot.x * spread}
                  y={slot.y}
                />
              );
            })
          )}
        </View>
        {/* The front pocket: tinted glass the covers show softly through. */}
        <ExploreGlass
          cornerRadius={FOLDER_RADIUS}
          tintColor={palette.cardGlass}
          style={[styles.pocket, { height: pocketHeight }]}
        >
          <View
            pointerEvents="none"
            style={[styles.pocketLip, { borderTopColor: palette.cardRim }]}
          />
        </ExploreGlass>
      </View>
      <View style={styles.label}>
        <NemuText numberOfLines={1} maxFontSizeMultiplier={1.3} color={tokens.foreground} style={styles.name}>
          {name}
        </NemuText>
        <NemuText numberOfLines={1} maxFontSizeMultiplier={1.3} color={tokens.secondaryForeground} style={styles.count}>
          {countLabel}
        </NemuText>
      </View>
    </NemuPressable>
  );
});

function FanCover({
  entry,
  installedSources,
  width,
  rotate,
  x,
  y,
}: {
  entry: LibraryEntry;
  installedSources: InstalledSource[];
  width: number;
  rotate: number;
  x: number;
  y: number;
}) {
  const { tokens } = useNemuTheme();
  const cover = useMobileExploreEntryCover(entry, installedSources);
  const title = getEntryTitle(entry);
  const placeholder = <MobileExploreCoverPlaceholder title={title} width={width} />;
  return (
    <View
      style={[
        styles.fanCover,
        {
          width,
          height: Math.round(width * 1.5),
          backgroundColor: tokens.muted,
          transform: [{ translateX: x }, { translateY: y }, { rotate: `${rotate}deg` }],
          ...createNemuShadowStyle({ color: "rgba(0,0,0,0.3)", offsetY: 2, radius: 5, elevation: 3 }),
        },
      ]}
    >
      <View style={styles.fanClip}>
        {cover ? (
          <MobileCachedImage
            uriOwnership="source"
            cacheKind="cover"
            source={cover}
            fallback={<ExploreCoverFallback title={title} width={width} color={tokens.muted} />}
            style={styles.fanImage}
          />
        ) : (
          placeholder
        )}
      </View>
    </View>
  );
}

const FOLDER_GAP = MOBILE_COLLECTION_FOLDER_GAP;

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: nemuFontWeight.bold,
  },
  // The folders' shadows and the fan's corners reach past the row.
  scroller: {
    overflow: "visible",
  },
  // Beside a vertical system bar the row stops at its frame (folders do not
  // slide under the bar); the padding keeps the fan and the shadows.
  frameClip: {
    overflow: "hidden",
    paddingTop: 12,
    marginTop: -12,
    paddingBottom: 12,
    marginBottom: -12,
  },
  row: {
    gap: FOLDER_GAP,
  },
  back: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: FOLDER_RADIUS,
    borderCurve: "continuous",
  },
  fan: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  fanCover: {
    position: "absolute",
    top: 2,
    borderRadius: R.thumb,
  },
  fanClip: {
    flex: 1,
    borderRadius: R.thumb,
    overflow: "hidden",
  },
  fanImage: {
    width: "100%",
    height: "100%",
  },
  pocket: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  // The pocket's lit top edge.
  pocketLip: {
    position: "absolute",
    top: 0,
    left: FOLDER_RADIUS,
    right: FOLDER_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  label: {
    paddingTop: 10,
    paddingHorizontal: 2,
    gap: 1,
  },
  name: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.semibold,
  },
  count: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.regular,
  },
});
