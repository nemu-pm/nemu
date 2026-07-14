export const MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES = 4 * 1024 * 1024;
export const MOBILE_AIDOKU_OUTPUT_MAX_DEPTH = 24;
export const MOBILE_AIDOKU_OUTPUT_MAX_NODES = 100_000;
export const MOBILE_AIDOKU_OUTPUT_MAX_PAGES = 2_000;
export const MOBILE_AIDOKU_OUTPUT_MAX_CHAPTERS = 10_000;
export const MOBILE_AIDOKU_OUTPUT_MAX_MANGA_ENTRIES = 500;
export const MOBILE_AIDOKU_OUTPUT_MAX_LISTINGS = 256;
export const MOBILE_AIDOKU_OUTPUT_MAX_FILTERS = 1_024;
export const MOBILE_AIDOKU_OUTPUT_MAX_FILTER_DEPTH = 8;
export const MOBILE_AIDOKU_OUTPUT_MAX_FILTER_OPTIONS = 2_048;
export const MOBILE_AIDOKU_OUTPUT_MAX_HOME_LAYOUTS = 65;
export const MOBILE_AIDOKU_OUTPUT_MAX_HOME_COMPONENTS = 512;
export const MOBILE_AIDOKU_OUTPUT_MAX_HOME_ENTRIES = 4_000;
const MOBILE_AIDOKU_IMAGE_REQUEST_MAX_URL_LENGTH = 16 * 1024;
const MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADERS = 96;
const MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADER_BYTES = 64 * 1024;

export type MobileAidokuOutputKind =
  | "capabilities"
  | "search"
  | "details"
  | "chapters"
  | "pages"
  | "filters"
  | "listings"
  | "listing-page"
  | "home"
  | "modify-image-request";

type JsonRecord = Record<string, unknown>;

function assertPlainRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonRecord;
}

function assertArrayLimit(
  value: unknown,
  maxLength: number,
  label: string,
): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new Error(`${label} exceeds the ${maxLength} item safety limit.`);
  }
  return value;
}

function jsonStringByteLength(value: string): number {
  // Includes the two surrounding quotes and exactly mirrors the escapes used
  // by well-formed JSON.stringify. Counting first prevents a multi-megabyte
  // escaped string from being materialized only to discover it is over limit.
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (
      code === 0x08 ||
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0c ||
      code === 0x0d
    ) {
      bytes += 2;
    } else if (code <= 0x1f) {
      bytes += 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 6;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      bytes += 6;
    } else {
      bytes += 3;
    }
    if (bytes > MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES) return bytes;
  }
  return bytes;
}

/**
 * Builds an owned JSON-only clone while enforcing node, depth, and exact JSON
 * byte budgets. Descriptor values are copied without invoking getters, and
 * non-enumerable properties (including a hostile own `toJSON`) never reach the
 * object passed to JSON.stringify.
 */
function cloneBoundedDataGraph(value: unknown): unknown {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  let jsonBytes = 0;

  const addJsonBytes = (amount: number) => {
    jsonBytes += amount;
    if (jsonBytes > MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES) {
      throw new Error(
        `Aidoku output exceeds the ${MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES} byte safety limit.`,
      );
    }
  };

  const clone = (item: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > MOBILE_AIDOKU_OUTPUT_MAX_NODES) {
      throw new Error("Aidoku output exceeds the node safety limit.");
    }
    if (depth > MOBILE_AIDOKU_OUTPUT_MAX_DEPTH) {
      throw new Error("Aidoku output exceeds the nesting safety limit.");
    }

    if (item === null) {
      addJsonBytes(4);
      return null;
    }
    if (typeof item === "string") {
      if (item.length > MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES) {
        throw new Error("Aidoku output contains an oversized string.");
      }
      addJsonBytes(jsonStringByteLength(item));
      return item;
    }
    if (typeof item === "boolean") {
      addJsonBytes(item ? 4 : 5);
      return item;
    }
    if (typeof item === "number") {
      if (!Number.isFinite(item)) {
        throw new Error("Aidoku output contains a non-finite number.");
      }
      addJsonBytes(Object.is(item, -0) ? 1 : String(item).length);
      return item;
    }
    if (typeof item !== "object") {
      throw new Error("Aidoku output contains a non-data value.");
    }

    if (ancestors.has(item)) {
      throw new Error("Aidoku output contains a cyclic value.");
    }
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        // Check before allocating the output array or walking a huge sparse
        // length. Every index contributes one JSON node even when it is a hole.
        if (item.length > MOBILE_AIDOKU_OUTPUT_MAX_NODES - nodes) {
          throw new Error("Aidoku output exceeds the node safety limit.");
        }
        addJsonBytes(2 + Math.max(0, item.length - 1));
        const output = new Array<unknown>(item.length);
        for (let index = 0; index < item.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !("value" in descriptor)) {
            throw new Error(`Aidoku output array item ${index} is not data-only.`);
          }
          output[index] = clone(descriptor.value, depth + 1);
        }
        return output;
      }

      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error("Aidoku output contains a non-plain object.");
      }
      const keys = Object.keys(item);
      // Fail before cloning values or allocating descriptor maps. Object.keys is
      // the smallest getter-free reflection primitive available in JS engines.
      if (keys.length > MOBILE_AIDOKU_OUTPUT_MAX_NODES - nodes) {
        throw new Error("Aidoku output exceeds the node safety limit.");
      }
      addJsonBytes(2);
      const output = Object.create(null) as JsonRecord;
      let emittedKeys = 0;
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !("value" in descriptor)) {
          throw new Error(`Aidoku output property ${key} is not data-only.`);
        }
        // Aidoku's decoders intentionally use undefined for absent optional
        // fields. Preserve JSON object semantics by omitting those data values,
        // while still rejecting functions/symbols and array holes elsewhere.
        if (descriptor.value === undefined) continue;
        addJsonBytes(
          (emittedKeys > 0 ? 1 : 0) + jsonStringByteLength(key) + 1,
        );
        output[key] = clone(descriptor.value, depth + 1);
        emittedKeys += 1;
      }
      return output;
    } finally {
      ancestors.delete(item);
    }
  };

  return clone(value, 0);
}

function assertFilters(value: unknown): void {
  const roots = assertArrayLimit(
    value,
    MOBILE_AIDOKU_OUTPUT_MAX_FILTERS,
    "Aidoku filters",
  );
  const stack = roots.map((filter) => ({ filter, depth: 1 }));
  let count = 0;

  while (stack.length > 0) {
    const { filter, depth } = stack.pop()!;
    count += 1;
    if (count > MOBILE_AIDOKU_OUTPUT_MAX_FILTERS) {
      throw new Error("Aidoku filters exceed the aggregate safety limit.");
    }
    if (depth > MOBILE_AIDOKU_OUTPUT_MAX_FILTER_DEPTH) {
      throw new Error("Aidoku filters exceed the nesting safety limit.");
    }
    const record = assertPlainRecord(filter, "Aidoku filter");
    if (record.options !== undefined) {
      assertArrayLimit(
        record.options,
        MOBILE_AIDOKU_OUTPUT_MAX_FILTER_OPTIONS,
        "Aidoku filter options",
      );
    }
    if (record.filters !== undefined) {
      const children = assertArrayLimit(
        record.filters,
        MOBILE_AIDOKU_OUTPUT_MAX_FILTERS,
        "Aidoku child filters",
      );
      for (const child of children) stack.push({ filter: child, depth: depth + 1 });
    }
  }
}

function assertHome(value: unknown): void {
  const home = assertPlainRecord(value, "Aidoku home output");
  if (home.partials !== undefined && !Array.isArray(home.partials)) {
    throw new Error("Aidoku home partials must be an array.");
  }
  const layouts = [home.layout, ...(home.partials ?? [])]
    .filter((layout) => layout != null);
  if (layouts.length > MOBILE_AIDOKU_OUTPUT_MAX_HOME_LAYOUTS) {
    throw new Error("Aidoku home output exceeds the layout safety limit.");
  }

  let componentCount = 0;
  let entryCount = 0;
  for (const layout of layouts) {
    const components = assertArrayLimit(
      assertPlainRecord(layout, "Aidoku home layout").components,
      MOBILE_AIDOKU_OUTPUT_MAX_HOME_COMPONENTS,
      "Aidoku home components",
    );
    componentCount += components.length;
    if (componentCount > MOBILE_AIDOKU_OUTPUT_MAX_HOME_COMPONENTS) {
      throw new Error("Aidoku home components exceed the aggregate safety limit.");
    }
    for (const component of components) {
      const componentValue = assertPlainRecord(
        assertPlainRecord(component, "Aidoku home component").value,
        "Aidoku home component value",
      );
      for (const key of ["entries", "items", "links"] as const) {
        if (componentValue[key] === undefined) continue;
        const entries = assertArrayLimit(
          componentValue[key],
          MOBILE_AIDOKU_OUTPUT_MAX_HOME_ENTRIES,
          "Aidoku home entries",
        );
        entryCount += entries.length;
        if (entryCount > MOBILE_AIDOKU_OUTPUT_MAX_HOME_ENTRIES) {
          throw new Error("Aidoku home entries exceed the aggregate safety limit.");
        }
      }
    }
  }
}

function assertModifiedImageRequest(value: unknown): void {
  const request = assertPlainRecord(value, "Aidoku image request");
  if (
    typeof request.url !== "string" ||
    request.url.length === 0 ||
    request.url.length > MOBILE_AIDOKU_IMAGE_REQUEST_MAX_URL_LENGTH
  ) {
    throw new Error("Aidoku image request URL is invalid.");
  }
  const parsed = new URL(request.url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Aidoku image request URL must use http or https.");
  }

  const headers = assertPlainRecord(
    request.headers ?? {},
    "Aidoku image request headers",
  );
  const entries = Object.entries(headers);
  if (entries.length > MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADERS) {
    throw new Error("Aidoku image request has too many headers.");
  }
  let byteLength = 0;
  for (const [rawKey, rawValue] of entries) {
    if (typeof rawValue !== "string") {
      throw new Error("Aidoku image request has an invalid header value.");
    }
    const key = rawKey.trim();
    if (!key || /[\r\n]/.test(key) || /[\r\n]/.test(rawValue)) {
      throw new Error("Aidoku image request has an invalid header.");
    }
    if (
      key.length > MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADER_BYTES ||
      rawValue.length > MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADER_BYTES
    ) {
      throw new Error("Aidoku image request headers exceed the safety limit.");
    }
    byteLength +=
      new TextEncoder().encode(key).byteLength +
      new TextEncoder().encode(rawValue).byteLength;
    if (byteLength > MOBILE_AIDOKU_IMAGE_REQUEST_MAX_HEADER_BYTES) {
      throw new Error("Aidoku image request headers exceed the safety limit.");
    }
  }
}

function assertKindLimits(kind: MobileAidokuOutputKind, value: unknown): void {
  switch (kind) {
    case "capabilities":
      assertArrayLimit(
        assertPlainRecord(value, "Aidoku capabilities").staticListings,
        MOBILE_AIDOKU_OUTPUT_MAX_LISTINGS,
        "Aidoku static listings",
      );
      return;
    case "search":
    case "listing-page":
      assertArrayLimit(
        assertPlainRecord(value, "Aidoku manga page").entries,
        MOBILE_AIDOKU_OUTPUT_MAX_MANGA_ENTRIES,
        "Aidoku manga entries",
      );
      return;
    case "chapters":
      assertArrayLimit(
        value,
        MOBILE_AIDOKU_OUTPUT_MAX_CHAPTERS,
        "Aidoku chapters",
      );
      return;
    case "pages":
      assertArrayLimit(value, MOBILE_AIDOKU_OUTPUT_MAX_PAGES, "Aidoku pages");
      return;
    case "filters":
      assertFilters(value);
      return;
    case "listings":
      assertArrayLimit(
        value,
        MOBILE_AIDOKU_OUTPUT_MAX_LISTINGS,
        "Aidoku listings",
      );
      return;
    case "home":
      assertHome(value);
      return;
    case "modify-image-request":
      assertModifiedImageRequest(value);
      return;
    case "details":
      return;
  }
}

/**
 * Produces an owned, plain JSON clone only after all structural and byte caps
 * pass. The byte limit is measured from UTF-8, not JS UTF-16 code units.
 */
export function sanitizeMobileAidokuOutput<T>(
  kind: MobileAidokuOutputKind,
  value: T,
): T {
  const owned = cloneBoundedDataGraph(value);
  const json = JSON.stringify(owned);
  if (json === undefined) {
    throw new Error("Aidoku output is not serializable.");
  }
  const byteLength = new TextEncoder().encode(json).byteLength;
  if (byteLength > MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES) {
    throw new Error(
      `Aidoku output exceeds the ${MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES} byte safety limit.`,
    );
  }
  const normalized = JSON.parse(json) as T;
  assertKindLimits(kind, normalized);
  return normalized;
}
