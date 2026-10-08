import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { memo, useCallback, useEffect, useRef } from "react";
import { StyleSheet, View, type ViewInstance } from "react-native";
import {
  getEntryTitle,
  type InstalledSource,
  type LibraryEntry,
  type LocalMangaProgress,
} from "@/data/schema";
import {
  createNemuShadowStyle,
  MobileCachedImage,
  nemuFontWeight,
  NemuPressable,
  radius,
  useNemuTheme,
} from "@/design-system";
import {
  formatMobileNewChapterTag,
  getMobileExploreNewChapters,
} from "@/lib/mobileContinueReadingCopy";
import { formatMobileMangaCardAccessibilityLabel } from "@/lib/mobileMangaCard";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  buildMobileEntryProgressMap,
  getMobileEntryMostRecentSource,
  getMobileLibraryProgressInfo,
  type MobileLibraryProgressIndex,
} from "@/lib/mobileLibraryPresentation";
import {
  getMobileShelfPlankSegments,
  MOBILE_SHELF,
  type MobileShelfRow,
} from "@/lib/mobileLibraryShelf";
import { ZoomSource } from "../../../modules/nemu-window-layout";
import { MobileExploreCoverPlaceholder } from "./MobileExploreCoverPlaceholder";
import {
  preferExploreDissolveTarget,
  registerExploreDissolveTarget,
  useExploreDissolveHidden,
} from "./mobileExploreDissolve";
import { pushMobileExploreDetail, useMobileExploreEntryCover } from "./mobileExploreCover";
import { ExploreSharperCoverProbe } from "./ExploreSharperCoverProbe";
import { MobileOdometerText } from "./MobileOdometerText";
import { MobileShelfPlank } from "./MobileShelfPlank";

const COVER_RADIUS = R.thumb;
/** The cover fills its column, the same size as the Grid's (Shelf ⇄ Grid does not resize it). */
const COVER_INSET = 0;

type Props = {
  entry: LibraryEntry;
  entryProgress?: Map<string, LocalMangaProgress>;
  progressIndex: MobileLibraryProgressIndex;
  strings: MobileStrings;
  installedSources: InstalledSource[];
  /** The row's shelf, for the first cell of a row (it draws the planks); else `null`. */
  row: MobileShelfRow | null;
  /** Cell width; the cover is sized explicitly from it. */
  itemWidth: number;
  onLongPress?: (entry: LibraryEntry) => void;
};

/**
 * One title on a floating wall shelf: the cover alone (no caption) as a
 * physical book standing flat on the plank — a small natural turn, the
 * sliver of its side the turn reveals, a hairline rim — with a corner tag when
 * new chapters are out. The first cell of each row draws the row's plank(s).
 */
export const MobileLibraryShelfCell = memo(function MobileLibraryShelfCell({
  entry,
  entryProgress,
  progressIndex,
  strings,
  installedSources,
  row,
  itemWidth,
  onLongPress,
}: Props) {
  const { scheme, tokens } = useNemuTheme();
  const cover = useMobileExploreEntryCover(entry, installedSources);
  const info = getMobileLibraryProgressInfo(entry, progressIndex, strings, entryProgress);
  const title = getEntryTitle(entry);
  const id = entry.item.libraryItemId;
  const dark = scheme === "dark";
  const coverWidth = Math.max(0, itemWidth - COVER_INSET * 2);
  const coverHeight = Math.round(coverWidth * 1.5);
  const plankY = MOBILE_SHELF.headroom + coverHeight;
  const zoomId = `shelf:${id}`;
  // This book turns to dust if the title is removed from its long-press menu.
  const bookRef = useRef<ViewInstance>(null);
  useEffect(() => registerExploreDissolveTarget(id, bookRef), [id]);
  const dissolving = useExploreDissolveHidden(id);
  const handleLongPress = useCallback(() => {
    preferExploreDissolveTarget(id, bookRef);
    onLongPress?.(entry);
  }, [entry, id, onLongPress]);
  const placeholder = <MobileExploreCoverPlaceholder title={title} width={coverWidth} />;
  // "+N" when both chapter numbers are known; a bare dot for any other update.
  const progress = entryProgress ?? buildMobileEntryProgressMap(entry, progressIndex);
  const source = getMobileEntryMostRecentSource(entry, progress);
  const newCount = info.badge
    ? (getMobileExploreNewChapters(entry.sources, {
        sourceId: source?.id ?? null,
        lastReadNumber: source ? progress.get(source.id)?.lastReadChapterNumber : undefined,
      })?.count ?? null)
    : null;

  return (
    <View style={styles.cell}>
      {/* A thumbnail cover looks for a sharper one on the title's other sources. */}
      <ExploreSharperCoverProbe entry={entry} installedSources={installedSources} />
      {row
        ? getMobileShelfPlankSegments(row).map((segment) => (
            <MobileShelfPlank
              key={segment.x}
              left={row.left + segment.x}
              width={segment.width}
              top={plankY}
            />
          ))
        : null}

      <NemuPressable
        accessibilityRole="button"
        accessibilityLabel={formatMobileMangaCardAccessibilityLabel({
          openTemplate: strings.search.openItem,
          title,
          subtitle: info.subtitle,
          badge: info.badge,
        })}
        hapticFeedback="press"
        pressProfile="card"
        onPress={() => pushMobileExploreDetail(entry, cover, zoomId)}
        onLongPress={onLongPress ? handleLongPress : undefined}
        style={styles.coverPress}
      >
        <View
          ref={bookRef}
          style={[
            styles.book,
            {
              opacity: dissolving ? 0 : 1,
              width: coverWidth,
              height: coverHeight,
              // No turn: the cover is the zoom's source, and a 3D transform on
              // it bent the cover as the zoom landed back on it (the morph
              // flies to the flat frame, then the turned view shows again).
            },
          ]}
        >
          {/* Casts the book's soft shadow onto the wall and the plank. */}
          <View
            style={[
              styles.shadow,
              { backgroundColor: tokens.muted },
              createNemuShadowStyle({
                color: dark ? "rgba(0,0,0,0.6)" : "rgba(24,32,64,0.2)",
                offsetY: 3,
                radius: 6,
                elevation: 3,
              }),
            ]}
          />
          <ZoomSource
            zoomId={zoomId}
            style={[styles.cover, { width: coverWidth, height: coverHeight, backgroundColor: tokens.muted }]}
          >
            <View style={[styles.coverClip, { borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(20,28,60,0.12)" }]}>
              {cover ? (
                <MobileCachedImage
                  uriOwnership="source"
                  cacheKind="cover"
                  source={cover}
                  // No fade inside the native zoom source (see MobileNowReadingAccessory).
                  fadeIn={false}
                  fallback={placeholder}
                  style={styles.coverImage}
                />
              ) : (
                placeholder
              )}
            </View>
          </ZoomSource>
          {info.badge ? (
            <View
              accessibilityElementsHidden
              style={[styles.tag, { backgroundColor: tokens.danger, borderColor: dark ? "#000000" : "#ffffff" }]}
            >
              <View style={styles.tagDot} />
              {newCount ? (
                <MobileOdometerText
                  value={formatMobileNewChapterTag(newCount)}
                  maxFontSizeMultiplier={1.2}
                  color="#ffffff"
                  style={styles.tagText}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </NemuPressable>
    </View>
  );
});

const styles = StyleSheet.create({
  cell: {
    paddingTop: MOBILE_SHELF.headroom,
    paddingBottom: MOBILE_SHELF.plankTop + MOBILE_SHELF.plankFront,
  },
  coverPress: {
    paddingHorizontal: COVER_INSET,
  },
  book: {
    transformOrigin: "50% 100%",
  },
  shadow: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: COVER_RADIUS,
  },
  cover: {
    borderRadius: COVER_RADIUS,
  },
  coverClip: {
    flex: 1,
    borderRadius: COVER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  // nemu's new-chapters tag: a rounded tab hanging off the corner, ringed by
  // the page colour, carrying a dot and the count.
  tag: {
    position: "absolute",
    top: -7,
    right: -6,
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 6,
    paddingRight: 7,
    borderRadius: radius.pill,
    borderTopLeftRadius: 4,
    borderWidth: 1.5,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 5 / 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  tagText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.bold,
    fontVariant: ["tabular-nums"],
  },
});
