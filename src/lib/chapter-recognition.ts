/**
 * Chapter number recognition from chapter name strings.
 * Ported from Mihon's ChapterRecognition.kt
 *
 * Parses chapter numbers from strings like:
 * - "Vol.1 Ch. 4: Misrepresentation" → 4
 * - "Bleach 567: Down With Snowwhite" → 567
 * - "Ch.5a" → 5.1 (alpha suffix)
 * - "Chapter 10 extra" → 10.99
 */

const NUMBER_PATTERN = /([0-9]+)(\.[0-9]+)?(\.?[a-z]+)?/;

/** All cases with Ch.xx - "Vol.1 Ch. 4: Title" → 4 */
const BASIC_PATTERN = /(?<=ch\.) *([0-9]+)(\.[0-9]+)?(\.?[a-z]+)?/i;

/** General number pattern - "Bleach 567: Title" → 567 */
const NUMBER_REGEX = new RegExp(NUMBER_PATTERN.source, "gi");

/** Remove unwanted tags like v1, vol004, version1243, volume64, season1 */
const UNWANTED_PATTERN = /\b(?:v|ver|vol|version|volume|season|s)[^a-z]?[0-9]+/gi;

/** Remove whitespace before special keywords */
const UNWANTED_WHITESPACE = /\s(?=extra|special|omake)/gi;

/**
 * Parse chapter number from chapter name.
 *
 * @param mangaTitle - Title of the manga (used to remove from chapter name)
 * @param chapterName - The chapter name string to parse
 * @param existingNumber - Existing chapter number (if valid, returned as-is)
 * @returns Parsed chapter number, or -1 if not found
 */
export function parseChapterNumber(
  mangaTitle: string,
  chapterName: string,
  existingNumber?: number
): number {
  // If chapter number is already known and valid, return it
  // -2 is a special value meaning "use as-is", >-1 means valid
  if (existingNumber != null && (existingNumber === -2 || existingNumber > -1)) {
    return existingNumber;
  }

  // Clean chapter name: lowercase, remove manga title, normalize punctuation
  let cleanName = chapterName
    .toLowerCase()
    .replace(mangaTitle.toLowerCase(), "")
    .trim()
    .replace(/,/g, ".")
    .replace(/-/g, ".")
    .replace(UNWANTED_WHITESPACE, "");

  // Find all number matches
  const matches = [...cleanName.matchAll(NUMBER_REGEX)];

  if (matches.length === 0) {
    return existingNumber ?? -1;
  }

  if (matches.length > 1) {
    // Multiple numbers found - remove unwanted tags and try again
    const cleanedName = cleanName.replace(UNWANTED_PATTERN, "");

    // Try "Ch.xx" pattern first
    const basicMatch = cleanedName.match(BASIC_PATTERN);
    if (basicMatch) {
      return getChapterNumberFromMatch(basicMatch);
    }

    // Fall back to first number in cleaned string
    const numberMatch = cleanedName.match(NUMBER_PATTERN);
    if (numberMatch) {
      return getChapterNumberFromMatch(numberMatch);
    }
  }

  // Return the first number encountered
  return getChapterNumberFromMatch(matches[0]);
}

/**
 * Extract chapter number from regex match.
 */
function getChapterNumberFromMatch(match: RegExpMatchArray): number {
  const initial = parseInt(match[1], 10);
  const subChapterDecimal = match[2]; // e.g., ".5"
  const subChapterAlpha = match[3]; // e.g., ".a" or "a"
  const addition = checkForDecimal(subChapterDecimal, subChapterAlpha);
  return initial + addition;
}

/**
 * Check for decimal value from matched groups.
 */
function checkForDecimal(decimal?: string, alpha?: string): number {
  if (decimal) {
    return parseFloat(decimal);
  }

  if (alpha) {
    if (alpha.includes("extra")) return 0.99;
    if (alpha.includes("omake")) return 0.98;
    if (alpha.includes("special")) return 0.97;

    const trimmedAlpha = alpha.replace(/^\./, "");
    if (trimmedAlpha.length === 1) {
      return parseAlphaPostFix(trimmedAlpha[0]);
    }
  }

  return 0;
}

/**
 * Convert alpha suffix to decimal: a → 0.1, b → 0.2, etc.
 */
function parseAlphaPostFix(alpha: string): number {
  const code = alpha.charCodeAt(0);
  const aCode = "a".charCodeAt(0);
  const number = code - aCode + 1;
  if (number >= 10) return 0;
  return number / 10;
}

