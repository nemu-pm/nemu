import { describe, expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { extractAixMetadata } from "./aixMetadata";
import { MOBILE_AIX_PACKAGE_LIMITS } from "./sourcePackageSafety";

function makeAix(
  files: Record<string, string | Uint8Array>,
  level: 0 | 6 = 6,
): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, value]) => [
        path,
        typeof value === "string" ? strToU8(value) : value,
      ]),
    ),
    { level },
  );
}

function patchCentralDirectoryEntry(
  archive: Uint8Array,
  path: string,
  patch: (view: DataView, offset: number) => void,
): Uint8Array {
  const next = archive.slice();
  const view = new DataView(next.buffer, next.byteOffset, next.byteLength);
  const decoder = new TextDecoder();
  for (let offset = 0; offset + 46 <= next.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(next.subarray(offset + 46, offset + 46 + nameLength));
    if (name === path) {
      patch(view, offset);
      return next;
    }
    offset += 45 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Missing ZIP entry ${path}`);
}

describe("extractAixMetadata", () => {
  test("extracts source manifest, filters, settings, and wasm presence", () => {
    const bytes = makeAix({
      "Payload/source.json": JSON.stringify({
        info: {
          id: "en.example",
          name: "Example",
          version: 4,
          url: "https://example.com",
          languages: ["en"],
          contentRating: 1,
        },
        listings: [{ id: "popular", name: "Popular", kind: 1 }],
      }),
      "Payload/filters.json": JSON.stringify([
        {
          id: "genre[]",
          title: "Genres",
          type: "multi-select",
          options: ["Action", "Drama"],
        },
      ]),
      "Payload/settings.json": JSON.stringify([
        {
          key: "quality",
          title: "Image Quality",
          type: "select",
          options: ["High", "Low"],
        },
        {
          key: "token",
          title: "API Token",
          type: "text",
          subtitle: "Private credential",
          secure: true,
          placeholder: "Paste token",
          requires: "quality",
          requiresFalse: "offline",
          requiresFeature: "secure-inputs",
          notification: "tokenChanged",
          refreshes: ["settings", "content", "unknown"],
        },
        {
          key: "advanced",
          title: "Advanced",
          type: "page",
          info: "Advanced source settings",
          icon: { type: "system", name: "gear", color: "#fff" },
          items: [
            {
              key: "blocked",
              title: "Blocked",
              type: "editable-list",
              default: ["spoiler"],
            },
          ],
        },
      ]),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    });

    expect(extractAixMetadata(bytes)).toEqual({
      sourceId: "en.example",
      name: "Example",
      version: 4,
      languages: ["en"],
      contentRating: 1,
      urls: ["https://example.com"],
      listings: [{ id: "popular", name: "Popular", kind: 1 }],
      filters: [
        {
          id: "genre[]",
          title: "Genres",
          type: "multi-select",
          optionCount: 2,
        },
      ],
      settings: [
        {
          key: "quality",
          title: "Image Quality",
          type: "select",
          optionCount: 2,
          values: ["High", "Low"],
        },
        {
          key: "token",
          title: "API Token",
          type: "text",
          subtitle: "Private credential",
          placeholder: "Paste token",
          secure: true,
          requires: "quality",
          requiresFalse: "offline",
          requiresFeature: "secure-inputs",
          notification: "tokenChanged",
          refreshes: ["settings", "content"],
        },
        {
          key: "advanced",
          title: "Advanced",
          type: "page",
          info: "Advanced source settings",
          icon: { type: "system", name: "gear", color: "#fff" },
          items: [
            {
              key: "blocked",
              title: "Blocked",
              type: "editable-list",
              default: ["spoiler"],
            },
          ],
        },
      ],
      hasWasm: true,
    });
  });

  test("falls back to deprecated lang and manifest filters", () => {
    const bytes = makeAix({
      "Payload/source.json": JSON.stringify({
        info: {
          id: "ja.example",
          name: "Legacy",
          lang: "ja",
          version: 1,
        },
        filters: [{ type: "text", name: "Title" }],
      }),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    });

    expect(extractAixMetadata(bytes)).toMatchObject({
      sourceId: "ja.example",
      name: "Legacy",
      languages: ["ja"],
      filters: [{ title: "Title", type: "text" }],
      hasWasm: true,
    });
  });

  test("rejects an oversized compressed package before parsing ZIP data", () => {
    const oversized = new Uint8Array(
      MOBILE_AIX_PACKAGE_LIMITS.maxCompressedBytes + 1,
    );

    expect(() => extractAixMetadata(oversized)).toThrow(
      /AIX package exceeds the .* byte safety limit/,
    );
  });

  test("rejects a ZIP bomb from declared sizes before inflating any entry", () => {
    const bytes = makeAix({
      "Payload/source.json": JSON.stringify({
        info: { id: "en.bomb", name: "Bomb", version: 1 },
      }),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    });
    const bomb = patchCentralDirectoryEntry(
      bytes,
      "Payload/main.wasm",
      (view, offset) => {
        view.setUint32(
          offset + 24,
          MOBILE_AIX_PACKAGE_LIMITS.maxDeclaredUncompressedBytes + 1,
          true,
        );
      },
    );

    expect(() => extractAixMetadata(bomb)).toThrow(
      /declared uncompressed data exceeds/,
    );
  });

  test("checks actual extracted metadata size even if ZIP declarations lie", () => {
    const manifest = JSON.stringify({
      info: { id: "en.actual-bomb", name: "Actual Bomb", version: 1 },
    });
    const oversizedManifest =
      manifest +
      " ".repeat(
        MOBILE_AIX_PACKAGE_LIMITS.maxMetadataEntryBytes + 1 - manifest.length,
      );
    const bytes = makeAix(
      {
        "Payload/source.json": oversizedManifest,
        "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
      },
      0,
    );
    const liedAboutSize = patchCentralDirectoryEntry(
      bytes,
      "Payload/source.json",
      (view, offset) => {
        view.setUint32(offset + 24, 1, true);
      },
    );

    expect(() => extractAixMetadata(liedAboutSize)).toThrow(
      /source\.json exceeds the .* metadata safety limit/,
    );
  });

  test("rejects archives with too many entries", () => {
    const files: Record<string, Uint8Array | string> = {
      "Payload/source.json": JSON.stringify({
        info: { id: "en.entries", name: "Entries", version: 1 },
      }),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    };
    for (let index = 0; index < MOBILE_AIX_PACKAGE_LIMITS.maxEntries; index += 1) {
      files[`Payload/empty-${index}.txt`] = new Uint8Array(0);
    }

    expect(() => extractAixMetadata(makeAix(files))).toThrow(
      /archive exceeds the .* entry safety limit/,
    );
  });

  test("detects main.wasm without attempting to inflate it", () => {
    const bytes = makeAix({
      "Payload/source.json": JSON.stringify({
        info: { id: "en.no-inflate", name: "No Inflate", version: 1 },
      }),
      "Payload/main.wasm": new Uint8Array([0, 97, 115, 109]),
    });
    const unsupportedWasmCompression = patchCentralDirectoryEntry(
      bytes,
      "Payload/main.wasm",
      (view, offset) => {
        view.setUint16(offset + 10, 99, true);
      },
    );

    expect(extractAixMetadata(unsupportedWasmCompression)).toMatchObject({
      sourceId: "en.no-inflate",
      hasWasm: true,
    });
  });
});
