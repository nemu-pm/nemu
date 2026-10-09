/** Folders per row on a phone: two whole ones, the third peeking by this much. */
const MOBILE_COLLECTION_FOLDER_PEEK = 40;
const MOBILE_COLLECTION_FOLDER_MIN_WIDTH = 150;
const MOBILE_COLLECTION_FOLDER_MAX_WIDTH = 196;
/** Folder height over its width (the pocket is a little wider than tall). */
export const MOBILE_COLLECTION_FOLDER_ASPECT = 0.8;
export const MOBILE_COLLECTION_FOLDER_GAP = 12;

/**
 * Width of one collection folder for the row's content width (the window less
 * its gutters): two whole folders and a peek of the third on a phone, never
 * narrower than a folder can carry its fanned covers, never wider than reads
 * as a folder on a tablet or an open fold (more of them fit instead).
 */
export function getMobileCollectionFolderWidth(contentWidth: number, gap: number): number {
  return Math.round(
    Math.min(
      MOBILE_COLLECTION_FOLDER_MAX_WIDTH,
      Math.max(
        MOBILE_COLLECTION_FOLDER_MIN_WIDTH,
        (contentWidth - gap - MOBILE_COLLECTION_FOLDER_PEEK) / 2,
      ),
    ),
  );
}

/**
 * How much of the Collections section may show above the tab bar: its heading and at least
 * 40 % of the folders, and never the names under the tab bar.
 */
const MOBILE_COLLECTION_FOLDER_CUT = 56;

/**
 * A section heading's height over its row: one 28 pt line at the text size
 * (scaled up to `MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE`, like the heading)
 * and the 12 pt step to the row. Unscaled, the folders rested with their
 * heading under the tab bar at the largest text sizes.
 */
export const MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE = 1.3;

export function getMobileExploreSectionHeadingHeight(fontScale = 1): number {
  const scale = Math.max(1, Math.min(MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE, fontScale));
  return Math.ceil(28 * scale) + 12;
}

export function getMobileCollectionFolderPeek(contentWidth: number, fontScale = 1): { min: number; max: number } {
  const width = getMobileCollectionFolderWidth(contentWidth, MOBILE_COLLECTION_FOLDER_GAP);
  const heading = getMobileExploreSectionHeadingHeight(fontScale);
  const art = Math.round(width * MOBILE_COLLECTION_FOLDER_ASPECT);
  return { min: heading + Math.round(art * 0.4), max: heading + art - MOBILE_COLLECTION_FOLDER_CUT };
}
