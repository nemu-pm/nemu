// std namespace - standard library functions (new aidoku-rs ABI)
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import { GlobalStore } from "../global-store";

// Initialize dayjs plugins
dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export function createStdImports(store: GlobalStore) {
  return {
    // Destroy a descriptor (free resources)
    destroy: (descriptor: number): void => {
      store.removeStdValue(descriptor);
    },

    // Get the length of a buffer stored at a descriptor
    buffer_len: (descriptor: number): number => {
      if (descriptor < 0) return -1;
      const value = store.readStdValue(descriptor);

      if (value instanceof Uint8Array) {
        return value.length;
      }
      if (typeof value === "string") {
        return new TextEncoder().encode(value).length;
      }
      return -1;
    },

    // Read buffer data into WASM memory
    read_buffer: (
      descriptor: number,
      bufferPtr: number,
      size: number
    ): number => {
      if (descriptor < 0 || size <= 0) return -1;
      const value = store.readStdValue(descriptor);

      let bytes: Uint8Array;
      if (value instanceof Uint8Array) {
        bytes = value;
      } else if (typeof value === "string") {
        bytes = new TextEncoder().encode(value);
      } else {
        return -1;
      }

      if (size > bytes.length) {
        return -2; // InvalidBufferSize
      }

      store.writeBytes(bytes.slice(0, size), bufferPtr);
      return 0;
    },

    // Get current date as Unix timestamp
    current_date: (): number => {
      return Date.now() / 1000;
    },

    // Get UTC offset in seconds
    utc_offset: (): bigint => {
      // Return the offset in seconds (negative because getTimezoneOffset returns minutes west of UTC)
      return BigInt(-new Date().getTimezoneOffset() * 60);
    },

    // Parse a date string into a Unix timestamp
    parse_date: (
      stringPtr: number,
      stringLen: number,
      formatPtr: number,
      formatLen: number,
      localePtr: number,
      localeLen: number,
      timezonePtr: number,
      timezoneLen: number
    ): number => {
      if (stringLen <= 0 || formatLen <= 0) return -5;

      const dateStr = store.readString(stringPtr, stringLen);
      const format = store.readString(formatPtr, formatLen);
      const locale =
        localeLen > 0 ? store.readString(localePtr, localeLen) : null;
      const tz =
        timezoneLen > 0 ? store.readString(timezonePtr, timezoneLen) : null;

      if (!dateStr || !format) return -5;

      const date = parseDateWithFormat(dateStr, format, locale, tz);
      if (date) {
        return Math.floor(date.getTime() / 1000);
      }
      return -5;
    },
  };
}

// Swift/iOS DateFormatter format mappings to dayjs formats
const FORMAT_MAPPINGS: Record<string, string> = {
  // Year
  yyyy: "YYYY",
  yy: "YY",
  // Month
  MMMM: "MMMM",
  MMM: "MMM",
  MM: "MM",
  M: "M",
  // Day
  dd: "DD",
  d: "D",
  // Hour
  HH: "HH",
  H: "H",
  hh: "hh",
  h: "h",
  // Minute
  mm: "mm",
  m: "m",
  // Second
  ss: "ss",
  s: "s",
  // AM/PM
  a: "A",
  // Timezone
  Z: "Z",
  z: "z",
  ZZZZZ: "Z",
  ZZZ: "ZZ",
};

// Convert Swift DateFormatter format to dayjs format
function convertFormat(swiftFormat: string): string {
  let result = swiftFormat;

  // Sort by length descending to replace longer patterns first
  const sortedKeys = Object.keys(FORMAT_MAPPINGS).sort(
    (a, b) => b.length - a.length
  );

  for (const key of sortedKeys) {
    result = result.replace(new RegExp(key, "g"), FORMAT_MAPPINGS[key]);
  }

  return result;
}

// Common relative date patterns in multiple languages
const RELATIVE_PATTERNS = [
  // English
  { pattern: /(\d+)\s*seconds?\s*ago/i, unit: "second" },
  { pattern: /(\d+)\s*minutes?\s*ago/i, unit: "minute" },
  { pattern: /(\d+)\s*hours?\s*ago/i, unit: "hour" },
  { pattern: /(\d+)\s*days?\s*ago/i, unit: "day" },
  { pattern: /(\d+)\s*weeks?\s*ago/i, unit: "week" },
  { pattern: /(\d+)\s*months?\s*ago/i, unit: "month" },
  { pattern: /(\d+)\s*years?\s*ago/i, unit: "year" },
  { pattern: /just\s*now/i, unit: "now" },
  { pattern: /today/i, unit: "today" },
  { pattern: /yesterday/i, unit: "yesterday" },
  // Chinese
  { pattern: /(\d+)\s*秒前/i, unit: "second" },
  { pattern: /(\d+)\s*分钟前/i, unit: "minute" },
  { pattern: /(\d+)\s*小时前/i, unit: "hour" },
  { pattern: /(\d+)\s*天前/i, unit: "day" },
  { pattern: /(\d+)\s*周前/i, unit: "week" },
  { pattern: /(\d+)\s*个?月前/i, unit: "month" },
  { pattern: /(\d+)\s*年前/i, unit: "year" },
  { pattern: /刚刚/i, unit: "now" },
  { pattern: /今天/i, unit: "today" },
  { pattern: /昨天/i, unit: "yesterday" },
  // Japanese
  { pattern: /(\d+)\s*秒前/i, unit: "second" },
  { pattern: /(\d+)\s*分前/i, unit: "minute" },
  { pattern: /(\d+)\s*時間前/i, unit: "hour" },
  { pattern: /(\d+)\s*日前/i, unit: "day" },
  { pattern: /(\d+)\s*週間前/i, unit: "week" },
  { pattern: /(\d+)\s*ヶ?月前/i, unit: "month" },
  { pattern: /(\d+)\s*年前/i, unit: "year" },
  // Korean
  { pattern: /(\d+)\s*초\s*전/i, unit: "second" },
  { pattern: /(\d+)\s*분\s*전/i, unit: "minute" },
  { pattern: /(\d+)\s*시간\s*전/i, unit: "hour" },
  { pattern: /(\d+)\s*일\s*전/i, unit: "day" },
  { pattern: /(\d+)\s*주\s*전/i, unit: "week" },
  { pattern: /(\d+)\s*개?월\s*전/i, unit: "month" },
  { pattern: /(\d+)\s*년\s*전/i, unit: "year" },
];

// Parse relative dates
function parseRelativeDate(str: string): Date | null {
  for (const { pattern, unit } of RELATIVE_PATTERNS) {
    const match = str.match(pattern);
    if (match) {
      const now = dayjs();

      if (unit === "now") {
        return now.toDate();
      }
      if (unit === "today") {
        return now.startOf("day").toDate();
      }
      if (unit === "yesterday") {
        return now.subtract(1, "day").startOf("day").toDate();
      }

      const amount = parseInt(match[1], 10);
      if (!isNaN(amount)) {
        return now
          .subtract(amount, unit as dayjs.ManipulateType)
          .toDate();
      }
    }
  }
  return null;
}

// Date parsing helper - handles common Swift DateFormatter formats
function parseDateWithFormat(
  str: string,
  format: string,
  _locale: string | null,
  tz: string | null
): Date | null {
  try {
    // Trim the string
    str = str.trim();

    // Try relative date parsing first
    const relativeDate = parseRelativeDate(str);
    if (relativeDate) {
      return relativeDate;
    }

    // Convert Swift format to dayjs format
    const dayjsFormat = convertFormat(format);

    // Try parsing with the converted format
    let parsed = dayjs(str, dayjsFormat, true);

    // If strict parsing fails, try without strict mode
    if (!parsed.isValid()) {
      parsed = dayjs(str, dayjsFormat, false);
    }

    // If still invalid, try native parsing
    if (!parsed.isValid()) {
      parsed = dayjs(str);
    }

    if (parsed.isValid()) {
      // Apply timezone if specified
      if (tz) {
        try {
          parsed = parsed.tz(tz);
        } catch {
          // Ignore timezone errors
        }
      }
      return parsed.toDate();
    }

    // Fallback: try various common formats
    const commonFormats = [
      "YYYY-MM-DD",
      "YYYY/MM/DD",
      "DD-MM-YYYY",
      "DD/MM/YYYY",
      "MM-DD-YYYY",
      "MM/DD/YYYY",
      "YYYY-MM-DD HH:mm:ss",
      "YYYY-MM-DDTHH:mm:ss",
      "YYYY-MM-DDTHH:mm:ssZ",
      "MMMM D, YYYY",
      "D MMMM YYYY",
      "MMM D, YYYY",
      "D MMM YYYY",
    ];

    for (const fmt of commonFormats) {
      const attempt = dayjs(str, fmt, true);
      if (attempt.isValid()) {
        return attempt.toDate();
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Export for testing
export { parseDateWithFormat, parseRelativeDate, convertFormat };
