/**
 * Text that wraps a word across lines: a word wider than its line is split by
 * character (a card title at the largest Dynamic Type sizes, "Pepper&Ca" /
 * "rrot"). Detected from the laid-out lines (`onTextLayout`), so the text can
 * be set smaller until it breaks between words.
 */

/** A letter or digit of a script that separates words with spaces (CJK breaks between any two characters). */
const SPACED_WORD_CHAR = /[\p{L}\p{N}&'’]/u;
const UNSPACED_SCRIPT_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

function isSpacedWordChar(char: string | undefined): boolean {
  return char !== undefined && SPACED_WORD_CHAR.test(char) && !UNSPACED_SCRIPT_CHAR.test(char);
}

/** True when a line ends inside a word that the next line continues. */
export function hasMobileMidWordLineBreak(lines: readonly { text: string }[]): boolean {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const end = Array.from(lines[index].text).at(-1);
    const start = Array.from(lines[index + 1].text)[0];
    if (isSpacedWordChar(end) && isSpacedWordChar(start)) return true;
  }
  return false;
}

/** Each step sets the text this much smaller. */
const WORD_FIT_STEP = 0.9;

/**
 * The next, smaller font size multiplier to try for text that broke a word,
 * or null once it is at the text's own size (Dynamic Type only grows it; a
 * word that does not fit even then is left to wrap).
 */
export function nextMobileWordFitMultiplier(current: number): number | null {
  if (current <= 1) return null;
  return Math.max(1, Math.round(current * WORD_FIT_STEP * 100) / 100);
}
