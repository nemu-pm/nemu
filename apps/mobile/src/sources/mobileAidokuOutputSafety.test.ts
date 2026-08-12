import { describe, expect, test } from "bun:test";
import {
  MOBILE_AIDOKU_OUTPUT_MAX_CHAPTERS,
  MOBILE_AIDOKU_OUTPUT_MAX_DEPTH,
  MOBILE_AIDOKU_OUTPUT_MAX_FILTER_DEPTH,
  MOBILE_AIDOKU_OUTPUT_MAX_FILTER_OPTIONS,
  MOBILE_AIDOKU_OUTPUT_MAX_HOME_COMPONENTS,
  MOBILE_AIDOKU_OUTPUT_MAX_HOME_ENTRIES,
  MOBILE_AIDOKU_OUTPUT_MAX_LISTINGS,
  MOBILE_AIDOKU_OUTPUT_MAX_MANGA_ENTRIES,
  MOBILE_AIDOKU_OUTPUT_MAX_NODES,
  MOBILE_AIDOKU_OUTPUT_MAX_PAGES,
  MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES,
  sanitizeMobileAidokuOutput,
} from "./mobileAidokuOutputSafety";

const manga = (index: number) => ({ key: `manga-${index}`, title: `Manga ${index}` });
const homeComponent = (entries: number) => ({
  value: { entries: Array.from({ length: entries }, (_, index) => manga(index)) },
});
const homeLayout = (components: unknown[]) => ({ components });

describe("mobile Aidoku output safety", () => {
  test("accepts exact scalar operation results", () => {
    expect(sanitizeMobileAidokuOutput("boolean", true)).toBe(true);
    expect(sanitizeMobileAidokuOutput("void", null)).toBeNull();
    expect(() => sanitizeMobileAidokuOutput("boolean", "yes")).toThrow(
      "boolean",
    );
    expect(() => sanitizeMobileAidokuOutput("void", false)).toThrow("null");
  });

  test("accepts and owns a legitimate MangaDex-like home result", () => {
    const input = {
      layout: homeLayout([
        homeComponent(20),
        { value: { links: [{ id: "latest", title: "Latest" }] } },
      ]),
      partials: [homeLayout([homeComponent(12)])],
    };
    const output = sanitizeMobileAidokuOutput("home", input);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output.layout).not.toBe(input.layout);
  });

  test("omits optional undefined object fields like Aidoku decoders do", () => {
    const decoded: Record<string, unknown> = {
      key: "manga",
      title: undefined,
      cover: "https://example.test/cover.jpg",
    };
    expect(
      sanitizeMobileAidokuOutput("details", decoded),
    ).toEqual({ key: "manga", cover: "https://example.test/cover.jpg" });
  });

  test("measures the aggregate serialized limit in UTF-8 bytes", () => {
    const emojiBytes = new TextEncoder().encode("😀").byteLength;
    const oversized = "😀".repeat(
      Math.floor(MOBILE_AIDOKU_OUTPUT_MAX_UTF8_BYTES / emojiBytes) + 1,
    );
    expect(() =>
      sanitizeMobileAidokuOutput("details", { key: "m", description: oversized }),
    ).toThrow("byte safety limit");
  });

  test("fails before stringify can invoke a non-enumerable toJSON", () => {
    let invoked = false;
    const input = { key: "safe" };
    Object.defineProperty(input, "toJSON", {
      enumerable: false,
      value() {
        invoked = true;
        throw new Error("must not run");
      },
    });

    expect(sanitizeMobileAidokuOutput("details", input)).toEqual({ key: "safe" });
    expect(invoked).toBe(false);
  });

  test("preserves an own __proto__ key without mutating object prototypes", () => {
    const before = ({} as Record<string, unknown>).polluted;
    const input = JSON.parse(
      '{"key":"safe","__proto__":{"polluted":true}}',
    ) as Record<string, unknown>;
    const output = sanitizeMobileAidokuOutput("details", input);

    expect(Object.prototype.hasOwnProperty.call(output, "__proto__")).toBe(true);
    expect(output.__proto__).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>).polluted).toBe(before);
  });

  test("rejects a huge sparse array before walking or cloning its length", () => {
    const sparse: unknown[] = [];
    sparse.length = MOBILE_AIDOKU_OUTPUT_MAX_NODES * 100;
    expect(() => sanitizeMobileAidokuOutput("pages", sparse)).toThrow(
      "node safety limit",
    );
  });

  test("rejects cyclic, accessor, deep, and oversized-node graphs", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => sanitizeMobileAidokuOutput("details", cyclic)).toThrow("cyclic");

    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => "unsafe",
    });
    expect(() => sanitizeMobileAidokuOutput("details", accessor)).toThrow(
      "data-only",
    );

    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let index = 0; index <= MOBILE_AIDOKU_OUTPUT_MAX_DEPTH; index += 1) {
      deep.next = {};
      deep = deep.next as Record<string, unknown>;
    }
    expect(() => sanitizeMobileAidokuOutput("details", root)).toThrow(
      "nesting safety limit",
    );

    expect(() =>
      sanitizeMobileAidokuOutput(
        "details",
        Array.from({ length: MOBILE_AIDOKU_OUTPUT_MAX_NODES }, () => null),
      ),
    ).toThrow("node safety limit");
  });

  test("accepts shared aliases while still cloning each JSON occurrence", () => {
    const shared = { key: "same manga" };
    const cloned = sanitizeMobileAidokuOutput("details", {
      primary: shared,
      secondary: shared,
    }) as {
      primary: { key: string };
      secondary: { key: string };
    };

    expect(cloned.primary).toEqual({ key: "same manga" });
    expect(cloned.secondary).toEqual({ key: "same manga" });
    expect(cloned.primary).not.toBe(cloned.secondary);
  });

  test("enforces pages, chapters, manga pages, and listings limits", () => {
    expect(() =>
      sanitizeMobileAidokuOutput(
        "pages",
        Array.from({ length: MOBILE_AIDOKU_OUTPUT_MAX_PAGES + 1 }, (_, index) => ({
          url: `https://example.test/${index}`,
        })),
      ),
    ).toThrow("2000 item safety limit");
    expect(() =>
      sanitizeMobileAidokuOutput(
        "chapters",
        Array.from({ length: MOBILE_AIDOKU_OUTPUT_MAX_CHAPTERS + 1 }, (_, index) => ({
          key: String(index),
        })),
      ),
    ).toThrow("10000 item safety limit");
    expect(() =>
      sanitizeMobileAidokuOutput("search", {
        entries: Array.from(
          { length: MOBILE_AIDOKU_OUTPUT_MAX_MANGA_ENTRIES + 1 },
          (_, index) => manga(index),
        ),
        hasNextPage: false,
      }),
    ).toThrow("500 item safety limit");
    expect(() =>
      sanitizeMobileAidokuOutput(
        "listings",
        Array.from({ length: MOBILE_AIDOKU_OUTPUT_MAX_LISTINGS + 1 }, (_, index) => ({
          id: String(index),
          name: String(index),
        })),
      ),
    ).toThrow("256 item safety limit");
  });

  test("enforces filter depth and option limits", () => {
    let nested: Record<string, unknown> = { name: "leaf" };
    for (let index = 0; index < MOBILE_AIDOKU_OUTPUT_MAX_FILTER_DEPTH; index += 1) {
      nested = { name: `group-${index}`, filters: [nested] };
    }
    expect(() => sanitizeMobileAidokuOutput("filters", [nested])).toThrow(
      "filters exceed the nesting safety limit",
    );
    expect(() =>
      sanitizeMobileAidokuOutput("filters", [
        {
          name: "selection",
          options: Array.from(
            { length: MOBILE_AIDOKU_OUTPUT_MAX_FILTER_OPTIONS + 1 },
            (_, index) => String(index),
          ),
        },
      ]),
    ).toThrow("2048 item safety limit");
  });

  test("counts final and partial home layouts jointly", () => {
    expect(() =>
      sanitizeMobileAidokuOutput("home", {
        layout: homeLayout([]),
        partials: { components: [] },
      }),
    ).toThrow("partials must be an array");

    expect(() =>
      sanitizeMobileAidokuOutput("home", {
        layout: homeLayout(
          Array.from(
            { length: MOBILE_AIDOKU_OUTPUT_MAX_HOME_COMPONENTS },
            () => homeComponent(0),
          ),
        ),
        partials: [homeLayout([homeComponent(0)])],
      }),
    ).toThrow("components exceed the aggregate safety limit");

    expect(() =>
      sanitizeMobileAidokuOutput("home", {
        layout: homeLayout([homeComponent(MOBILE_AIDOKU_OUTPUT_MAX_HOME_ENTRIES)]),
        partials: [homeLayout([homeComponent(1)])],
      }),
    ).toThrow("entries exceed the aggregate safety limit");
  });

  test("bounds modified image request URLs and headers", () => {
    expect(
      sanitizeMobileAidokuOutput("modify-image-request", {
        url: "https://example.test/image.jpg",
        headers: { Referer: "https://example.test/" },
      }),
    ).toEqual({
      url: "https://example.test/image.jpg",
      headers: { Referer: "https://example.test/" },
    });
    expect(() =>
      sanitizeMobileAidokuOutput("modify-image-request", {
        url: "file:///private/image.jpg",
        headers: {},
      }),
    ).toThrow("must use http or https");
    expect(() =>
      sanitizeMobileAidokuOutput("modify-image-request", {
        url: "https://example.test/image.jpg",
        headers: Object.fromEntries(
          Array.from({ length: 97 }, (_, index) => [`x-${index}`, "value"]),
        ),
      }),
    ).toThrow("too many headers");
    expect(() =>
      sanitizeMobileAidokuOutput("modify-image-request", {
        url: "https://example.test/image.jpg",
        headers: { Referer: "ok\r\nX-Injection: yes" },
      }),
    ).toThrow("invalid header");
    expect(() =>
      sanitizeMobileAidokuOutput("modify-image-request", {
        url: "https://example.test/image.jpg",
        headers: { "x-large": "😀".repeat(20_000) },
      }),
    ).toThrow("headers exceed the safety limit");
  });
});
