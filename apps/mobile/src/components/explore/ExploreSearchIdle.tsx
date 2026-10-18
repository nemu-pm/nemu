import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { getEntryTitle, type InstalledSource, type LibraryEntry } from "@/data/schema";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  NemuText,
  radius,
  useMobilePageBleedStyles,
  useNemuTheme,
} from "@/design-system";
import { formatMobileNewChapterTag } from "@/lib/mobileContinueReadingCopy";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { selectMobileSearchIdleUpdates } from "@/lib/mobileSearchIdle";
import { useMangaProgress } from "@/data/mobileHooks";
import {
  buildMobileEntryProgressMap,
  buildMobileProgressIndex,
  getMobileEntryMostRecentSource,
} from "@/lib/mobileLibraryPresentation";
import { ZoomSource } from "../../../modules/nemu-window-layout";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import { pushMobileExploreDetail, useMobileExploreEntryCover } from "./mobileExploreCover";

const COVER_WIDTH = 92;
const ROW_HEIGHT = 46;
const GLYPH_STROKE = 1.75;

/**
 * The Search tab before anything is typed (design-explore): what you looked
 * for last, one tap to look again, and the library titles with new chapters,
 * one tap to their page. Each part shows only when it has something; with
 * neither, the caller keeps its "Search for manga" state.
 */
export function ExploreSearchIdle({
  recents,
  entries,
  installedSources,
  strings,
  onPressRecent,
  onClearRecents,
}: {
  recents: readonly string[];
  entries: readonly LibraryEntry[];
  installedSources: InstalledSource[];
  strings: MobileStrings;
  onPressRecent: (query: string) => void;
  onClearRecents: () => void;
}) {
  const { tokens } = useNemuTheme();
  const bleed = useMobilePageBleedStyles();
  const progress = useMangaProgress();
  const updates = useMemo(() => {
    const index = buildMobileProgressIndex(progress.data);
    return selectMobileSearchIdleUpdates(entries, undefined, (entry) => {
      const map = buildMobileEntryProgressMap(entry, index);
      const source = getMobileEntryMostRecentSource(entry, map);
      return { sourceId: source?.id ?? null, lastReadNumber: source ? map.get(source.id)?.lastReadChapterNumber : undefined };
    });
  }, [entries, progress.data]);
  return (
    <View style={styles.root}>
      {recents.length ? (
        <View>
          <View style={styles.header}>
            <NemuText accessibilityRole="header" color={tokens.foreground} style={styles.headerTitle}>
              {strings.designExplore.searchRecent}
            </NemuText>
            <NemuPressable
              accessibilityRole="button"
              accessibilityLabel={strings.designExplore.searchClearRecent}
              hapticFeedback="press"
              hitSlop={10}
              onPress={onClearRecents}
            >
              <NemuText color={tokens.primary} style={styles.headerAction}>
                {strings.common.clear}
              </NemuText>
            </NemuPressable>
          </View>
          {recents.map((query, index) => (
            <NemuPressable
              key={query}
              accessibilityRole="button"
              accessibilityLabel={formatMobileString(strings.designExplore.searchRecentItem, { query })}
              pressProfile="row"
              pressedScale={1}
              onPress={() => onPressRecent(query)}
              style={styles.recentRow}
            >
              <ClockGlyph color={tokens.mutedForeground} />
              <View
                style={[
                  styles.recentText,
                  index < recents.length - 1 ? { borderBottomColor: tokens.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                ]}
              >
                <NemuText numberOfLines={1} maxFontSizeMultiplier={1.6} color={tokens.foreground} style={styles.recentLabel}>
                  {query}
                </NemuText>
              </View>
            </NemuPressable>
          ))}
        </View>
      ) : null}
      {updates.length ? (
        <View>
          <View style={styles.header}>
            <NemuText accessibilityRole="header" color={tokens.foreground} style={styles.headerTitle}>
              {strings.designExplore.searchNewChapters}
            </NemuText>
          </View>
          <ScrollView
            horizontal
            // Not a status-bar target: iOS scrolls to the top only when exactly one scroll view on screen asks to.
            scrollsToTop={false}
            showsHorizontalScrollIndicator={false}
            style={bleed.frame}
            contentContainerStyle={[bleed.content, styles.updatesRow]}
          >
            {updates.map(({ entry, count }) => (
              <UpdatedTitle
                key={entry.item.libraryItemId}
                entry={entry}
                count={count}
                installedSources={installedSources}
                strings={strings}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const UpdatedTitle = memo(function UpdatedTitle({
  entry,
  count,
  installedSources,
  strings,
}: {
  entry: LibraryEntry;
  count: number | null;
  installedSources: InstalledSource[];
  strings: MobileStrings;
}) {
  const { scheme, tokens } = useNemuTheme();
  const title = getEntryTitle(entry);
  const cover = useMobileExploreEntryCover(entry, installedSources);
  const zoomId = `search-new:${entry.item.libraryItemId}`;
  const label = [
    title,
    count ? formatMobileString(strings.designExplore.newChapterCount, { count }) : strings.common.new,
  ].join(", ");
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hapticFeedback="press"
      pressedScale={0.97}
      onPress={() => pushMobileExploreDetail(entry, cover, zoomId)}
      style={styles.updated}
    >
      <View>
        <ZoomSource
          zoomId={zoomId}
          style={[
            styles.updatedCover,
            createNemuShadowStyle({ color: "rgba(0,0,0,0.22)", offsetY: 3, radius: 6, elevation: 3 }),
          ]}
        >
          <View style={[styles.updatedCoverClip, { backgroundColor: tokens.secondary }]}>
            {cover ? (
              <MobileCachedImage
                uriOwnership="source"
                cacheKind="cover"
                source={cover}
                fadeIn={false}
                fallback={<MobileExploreCoverPlaceholder title={title} width={COVER_WIDTH} />}
                style={styles.updatedImage}
              />
            ) : (
              <MobileExploreCoverPlaceholder title={title} width={COVER_WIDTH} />
            )}
          </View>
        </ZoomSource>
        <View
          style={[
            styles.tag,
            { backgroundColor: tokens.danger, borderColor: scheme === "dark" ? "#000000" : "#ffffff" },
          ]}
        >
          <NemuText maxFontSizeMultiplier={1.2} color="#ffffff" style={styles.tagText}>
            {count ? formatMobileNewChapterTag(count) : strings.common.new}
          </NemuText>
        </View>
      </View>
      <NemuText numberOfLines={2} maxFontSizeMultiplier={1.3} color={tokens.foreground} style={styles.updatedTitle}>
        {title}
      </NemuText>
    </NemuPressable>
  );
});

/** A clock in the chapter list's stroke weight. */
function ClockGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Circle cx={9} cy={9} r={7} stroke={color} strokeWidth={GLYPH_STROKE} fill="none" />
        <Path
          d="M9 5.2V9l2.6 1.7"
          stroke={color}
          strokeWidth={GLYPH_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 22,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: nemuFontWeight.bold,
  },
  headerAction: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: nemuFontWeight.medium,
  },
  recentRow: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
  },
  glyph: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  recentText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    marginLeft: 10,
  },
  recentLabel: {
    fontSize: 16,
    lineHeight: 21,
  },
  updatesRow: {
    gap: 14,
    paddingTop: 8,
    paddingBottom: 4,
  },
  updated: {
    width: COVER_WIDTH,
    gap: 6,
  },
  updatedCover: {
    width: COVER_WIDTH,
    height: Math.round(COVER_WIDTH * 1.5),
    borderRadius: R.thumb,
    borderCurve: "continuous",
  },
  updatedCoverClip: {
    flex: 1,
    borderRadius: R.thumb,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  updatedImage: {
    width: "100%",
    height: "100%",
  },
  updatedTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.medium,
  },
  // The shelf's new-chapters tag, hanging off the cover's corner.
  tag: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: "center",
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.bold,
  },
});
