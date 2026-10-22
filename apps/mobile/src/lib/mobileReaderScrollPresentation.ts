/**
 * Scroll (continuous vertical) reading presentation constants.
 */

/**
 * What a page shows until its image decodes — a quiet dark plate (no
 * spinner, no text), so a fling past unloaded pages never reads as a run of
 * black screens or status cards.
 */
export const MOBILE_READER_SCROLL_PLACEHOLDER_COLOR = "#1C1C1E";
/** The first display of a page that waited on the network fades this long. */
export const MOBILE_READER_SCROLL_IMAGE_FADE_MS = 150;
