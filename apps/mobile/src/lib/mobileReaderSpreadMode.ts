/**
 * The reader's page layout choice for paged reading.
 *
 * - `single`: one page at a time, always.
 * - `double`: a spread wherever the pose can hold one.
 * - `auto`: a spread when the window the pages sit in is wide enough that
 *   both pages stay as large as a single page would be. Decided from the
 *   real stage rectangle, never from orientation, idiom or the device.
 */
export type ReaderSpreadMode = "single" | "double" | "auto";

export const READER_SPREAD_MODES: readonly ReaderSpreadMode[] = ["single", "double", "auto"];
export const DEFAULT_READER_SPREAD_MODE: ReaderSpreadMode = "auto";

export function isReaderSpreadMode(value: unknown): value is ReaderSpreadMode {
  return typeof value === "string" && (READER_SPREAD_MODES as readonly string[]).includes(value);
}

/**
 * The saved choice. Builds before the three-way setting stored a boolean
 * (`readerTwoPageMode`): an explicit true keeps spreads on ("double"), an
 * explicit false keeps them off ("single"); a profile that never touched the
 * switch gets the default.
 */
export function normalizeReaderSpreadMode(
  value: unknown,
  legacyTwoPage?: boolean | null,
): ReaderSpreadMode {
  if (isReaderSpreadMode(value)) return value;
  if (legacyTwoPage === true) return "double";
  if (legacyTwoPage === false) return "single";
  return DEFAULT_READER_SPREAD_MODE;
}

/** A page is about 1.42 times taller than wide; a spread of two fits when the stage is this wide per unit of height. */
export const READER_AUTO_SPREAD_MIN_ASPECT = 1.35;
/** Below these a stage is phone-sized even when wide (a landscape phone): pages stay single. */
export const READER_AUTO_SPREAD_MIN_WIDTH = 600;
export const READER_AUTO_SPREAD_MIN_HEIGHT = 450;

/** Whether `auto` shows a spread in a stage of this size. */
export function readerAutoSpreadFits(stage: { width: number; height: number }): boolean {
  const { width, height } = stage;
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return false;
  return (
    width >= READER_AUTO_SPREAD_MIN_WIDTH &&
    height >= READER_AUTO_SPREAD_MIN_HEIGHT &&
    width / height >= READER_AUTO_SPREAD_MIN_ASPECT
  );
}

/** The user's choice resolved for one stage: true = the user wants a spread here. */
export function resolveReaderSpreadWanted(
  mode: ReaderSpreadMode,
  stage: { width: number; height: number },
): boolean {
  if (mode === "double") return true;
  if (mode === "single") return false;
  return readerAutoSpreadFits(stage);
}
