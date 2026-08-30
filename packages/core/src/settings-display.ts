export const MAX_SETTING_FORMATTED_VALUE_LENGTH = 256;
const MAX_SETTING_DISPLAY_TEXT_LENGTH = 1_048_576;

export function isUnsafeSettingTextCodePoint(codePoint: number): boolean {
  return (
    (codePoint < 0x20 &&
      codePoint !== 0x09 &&
      codePoint !== 0x0a &&
      codePoint !== 0x0d) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x00ad ||
    codePoint === 0x061c ||
    codePoint === 0x200b ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

/** Remove terminal controls and bidi overrides from untrusted UI copy while
 * doing only bounded work, even when a plugin returns a huge string. */
export function sanitizeSettingDisplayText(
  value: string,
  maxLength: number,
): string {
  if (!Number.isFinite(maxLength) || maxLength <= 0 || value.length === 0) {
    return "";
  }
  const boundedMaxLength = Math.min(
    Math.floor(maxLength),
    MAX_SETTING_DISPLAY_TEXT_LENGTH,
  );
  let scanLimit = Math.min(value.length, boundedMaxLength * 2);
  // Do not manufacture a lone surrogate when the bounded scan lands in the
  // middle of a valid supplementary-plane character.
  if (
    scanLimit > 0 &&
    scanLimit < value.length &&
    value.charCodeAt(scanLimit - 1) >= 0xd800 &&
    value.charCodeAt(scanLimit - 1) <= 0xdbff &&
    value.charCodeAt(scanLimit) >= 0xdc00 &&
    value.charCodeAt(scanLimit) <= 0xdfff
  ) {
    scanLimit -= 1;
  }
  const output: string[] = [];
  let outputLength = 0;

  for (const character of value.slice(0, scanLimit)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isUnsafeSettingTextCodePoint(codePoint)) continue;
    if (outputLength + character.length > boundedMaxLength) break;
    output.push(character);
    outputLength += character.length;
    if (outputLength >= boundedMaxLength) break;
  }
  return output.join("");
}

/** Invoke an untrusted plugin formatter without letting exceptions, non-string
 * values, controls, bidi overrides, or oversized output break settings UI. */
export function formatSettingDisplayValue(
  formatter: ((value: number) => unknown) | null | undefined,
  value: number,
): string {
  if (!formatter) return String(value);
  try {
    const result = formatter(value);
    if (typeof result !== "string") {
      // Async formatters are unsupported, but consume a native Promise's
      // rejection so a mistaken `async` callback cannot create an unhandled
      // rejection after we have already fallen back. Calling the intrinsic
      // directly does not execute arbitrary thenable properties.
      if (result && typeof result === "object") {
        try {
          void Promise.prototype.then.call(result, undefined, () => undefined);
        } catch {
          // Not a genuine Promise (or an inaccessible proxy); ignore it.
        }
      }
      return String(value);
    }
    return sanitizeSettingDisplayText(
      result,
      MAX_SETTING_FORMATTED_VALUE_LENGTH,
    );
  } catch {
    return String(value);
  }
}
