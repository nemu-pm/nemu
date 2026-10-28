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

/** The largest text-size scale of a design-explore section heading. */
export const MOBILE_EXPLORE_SECTION_TITLE_MAX_SCALE = 1.3;
