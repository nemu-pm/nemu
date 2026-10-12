/**
 * Manga grid sizing constants. Every production grid lays out through
 * `useMobileFoldAwareGrid` (`mobileFoldAwareGridLayout`), which also owns the
 * column-parity rule (`mobileGridPrefersEvenColumns`: even counts only where a
 * fold splits the grid).
 */
export const MOBILE_MANGA_GRID_GAP = 12;

/**
 * Narrowest cover the grid packs down to. A portrait iPhone (375–440pt wide,
 * 16pt gutters) lands on three ~106–128pt covers; wider layouts add columns at
 * the same cover size instead of blowing three or four covers up to 200pt+,
 * so a landscape phone shows more titles per row, not bigger ones.
 */
export const MOBILE_MANGA_GRID_MIN_ITEM_WIDTH = 104;
/** Keeps a 13" iPad in landscape at ~120pt covers rather than 11+ columns. */
export const MOBILE_MANGA_GRID_MAX_COLUMNS = 10;
export const MOBILE_MANGA_GRID_MIN_COLUMNS = 2;
