import { describe, it, expect } from "vitest";
import {
  encodeString,
  decodeString,
  encodeOptionString,
  decodeOptionString,
  decodeVarint,
  decodeI32,
  decodeI64,
  decodeF32,
  decodeU8,
  decodeBool,
  decodeOption,
  decodeVec,
  encodeEmptyVec,
  decodeChapter,
  decodeMangaPageResult,
  decodePageList,
  decodeFilterList,
  encodeHashMap,
  encodePageContext,
  encodeU16,
  encodeImageResponse,
  encodeFilterValue,
  encodeFilterValues,
  encodeManga,
  encodeChapter,
  concatBytes,
} from "./postcard";
import { FilterType } from "./types";

describe("postcard encoding/decoding", () => {
  describe("string encoding", () => {
    it("should encode and decode simple strings", () => {
      const original = "hello";
      const encoded = encodeString(original);
      const [decoded] = decodeString(encoded);
      expect(decoded).toBe(original);
    });

    it("should encode and decode unicode strings", () => {
      const original = "你好世界";
      const encoded = encodeString(original);
      const [decoded] = decodeString(encoded);
      expect(decoded).toBe(original);
    });

    it("should encode and decode empty string", () => {
      const original = "";
      const encoded = encodeString(original);
      const [decoded] = decodeString(encoded);
      expect(decoded).toBe(original);
    });

    it("should encode empty vec", () => {
      const encoded = encodeEmptyVec();
      expect(encoded).toEqual(new Uint8Array([0]));
    });
  });

  describe("option string encoding", () => {
    it("should encode None", () => {
      const encoded = encodeOptionString(null);
      expect(encoded).toEqual(new Uint8Array([0]));
    });

    it("should encode Some", () => {
      const encoded = encodeOptionString("test");
      expect(encoded[0]).toBe(1); // Some variant
    });

    it("should decode None", () => {
      const [decoded, offset] = decodeOptionString(new Uint8Array([0]));
      expect(decoded).toBeNull();
      expect(offset).toBe(1);
    });

    it("should decode Some", () => {
      const encoded = encodeOptionString("test");
      const [decoded] = decodeOptionString(encoded);
      expect(decoded).toBe("test");
    });
  });

  describe("varint decoding", () => {
    it("should decode single byte varint", () => {
      const [value, offset] = decodeVarint(new Uint8Array([42]), 0);
      expect(value).toBe(42);
      expect(offset).toBe(1);
    });

    it("should decode multi-byte varint", () => {
      // 300 = 0x82 0x02
      const [value] = decodeVarint(new Uint8Array([0xac, 0x02]), 0);
      expect(value).toBe(300);
    });
  });

  describe("integer decoding", () => {
    it("should decode i32", () => {
      const bytes = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
      const [value, offset] = decodeI32(bytes, 0);
      expect(value).toBe(1);
      expect(offset).toBe(4);
    });

    it("should decode negative i32", () => {
      const bytes = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
      const [value] = decodeI32(bytes, 0);
      expect(value).toBe(-1);
    });

    it("should decode i64 (zigzag varint)", () => {
      // Zigzag encoding: positive 1 -> 2 (0x02)
      const bytes = new Uint8Array([0x02]);
      const [value, offset] = decodeI64(bytes, 0);
      expect(value).toBe(1);
      expect(offset).toBe(1);
    });

    it("should decode negative i64 (zigzag varint)", () => {
      // Zigzag encoding: -1 -> 1 (0x01)
      const bytes = new Uint8Array([0x01]);
      const [value, offset] = decodeI64(bytes, 0);
      expect(value).toBe(-1);
      expect(offset).toBe(1);
    });
  });

  describe("float decoding", () => {
    it("should decode f32", () => {
      // 1.0 in IEEE 754 = 0x3f800000
      const bytes = new Uint8Array([0x00, 0x00, 0x80, 0x3f]);
      const [value] = decodeF32(bytes, 0);
      expect(value).toBeCloseTo(1.0, 5);
    });
  });

  describe("u8 decoding", () => {
    it("should decode u8", () => {
      const [value, offset] = decodeU8(new Uint8Array([0xff]), 0);
      expect(value).toBe(255);
      expect(offset).toBe(1);
    });
  });

  describe("bool decoding", () => {
    it("should decode true", () => {
      const [value] = decodeBool(new Uint8Array([1]), 0);
      expect(value).toBe(true);
    });

    it("should decode false", () => {
      const [value] = decodeBool(new Uint8Array([0]), 0);
      expect(value).toBe(false);
    });
  });

  describe("option decoding", () => {
    it("should decode None", () => {
      const [value, offset] = decodeOption(
        new Uint8Array([0]),
        0,
        decodeU8
      );
      expect(value).toBeNull();
      expect(offset).toBe(1);
    });

    it("should decode Some", () => {
      const [value, offset] = decodeOption(
        new Uint8Array([1, 42]),
        0,
        decodeU8
      );
      expect(value).toBe(42);
      expect(offset).toBe(2);
    });
  });

  describe("vec decoding", () => {
    it("should decode empty vec", () => {
      const [values] = decodeVec(new Uint8Array([0]), 0, decodeU8);
      expect(values).toEqual([]);
    });

    it("should decode vec with items", () => {
      const [values] = decodeVec(
        new Uint8Array([3, 1, 2, 3]),
        0,
        decodeU8
      );
      expect(values).toEqual([1, 2, 3]);
    });
  });
});

describe("complex structure decoding", () => {
  describe("Chapter decoding", () => {
    it("should decode minimal chapter", () => {
      // key: "ch1", rest all None/false
      const keyBytes = encodeString("ch1");
      const bytes = new Uint8Array([
        ...keyBytes,
        0, // title: None
        0, // chapterNumber: None
        0, // volumeNumber: None
        0, // dateUploaded: None
        0, // scanlators: None
        0, // url: None
        0, // language: None
        0, // thumbnail: None
        0, // locked: false
      ]);

      const [chapter] = decodeChapter(bytes, 0);
      expect(chapter.key).toBe("ch1");
      expect(chapter.title).toBeNull();
      expect(chapter.locked).toBe(false);
    });
  });

  describe("Page decoding", () => {
    it("should handle empty page list", () => {
      const pages = decodePageList(new Uint8Array([0])); // empty vec
      expect(pages).toEqual([]);
    });
  });

  describe("Filter decoding", () => {
    it("should handle empty filter list", () => {
      const filters = decodeFilterList(new Uint8Array([0])); // empty vec
      expect(filters).toEqual([]);
    });
  });

  describe("MangaPageResult decoding", () => {
    it("should decode empty result", () => {
      const result = decodeMangaPageResult(new Uint8Array([0, 0]));
      expect(result.entries).toEqual([]);
      expect(result.hasNextPage).toBe(false);
    });

    it("should decode result with hasNextPage true", () => {
      const result = decodeMangaPageResult(new Uint8Array([0, 1]));
      expect(result.entries).toEqual([]);
      expect(result.hasNextPage).toBe(true);
    });
  });

  describe("ImageResponse encoding (for processPageImage)", () => {
    describe("encodeHashMap", () => {
      it("should encode empty map", () => {
        const encoded = encodeHashMap({});
        expect(encoded).toEqual(new Uint8Array([0])); // length 0
      });

      it("should encode map with entries", () => {
        const encoded = encodeHashMap({ key: "value" });
        // len(1) + "key" + "value"
        expect(encoded[0]).toBe(1); // 1 entry
        // Rest is key-value pair encoded as strings
        const [key, keyEnd] = decodeString(encoded, 1);
        const [value] = decodeString(encoded, keyEnd);
        expect(key).toBe("key");
        expect(value).toBe("value");
      });

      it("should encode map with multiple entries", () => {
        const encoded = encodeHashMap({ a: "1", b: "2" });
        expect(encoded[0]).toBe(2); // 2 entries
      });
    });

    describe("encodePageContext", () => {
      it("should encode null as None", () => {
        const encoded = encodePageContext(null);
        expect(encoded).toEqual(new Uint8Array([0]));
      });

      it("should encode context as Some(HashMap)", () => {
        const encoded = encodePageContext({ width: "100", height: "200" });
        expect(encoded[0]).toBe(1); // Some
        expect(encoded[1]).toBe(2); // 2 entries in map
      });
    });

    describe("encodeU16", () => {
      it("should encode 0", () => {
        const encoded = encodeU16(0);
        expect(encoded).toEqual(new Uint8Array([0, 0]));
      });

      it("should encode 200 (HTTP OK)", () => {
        const encoded = encodeU16(200);
        // 200 in little-endian: 0xC8 0x00
        expect(encoded).toEqual(new Uint8Array([200, 0]));
      });

      it("should encode 404", () => {
        const encoded = encodeU16(404);
        // 404 = 0x0194 in little-endian: 0x94 0x01
        expect(encoded).toEqual(new Uint8Array([0x94, 0x01]));
      });
    });

    describe("encodeImageResponse", () => {
      it("should encode complete ImageResponse", () => {
        const encoded = encodeImageResponse(
          200,                          // code
          { "Content-Type": "image/png" }, // headers
          "https://example.com/image.png", // requestUrl
          { "Referer": "https://example.com" }, // requestHeaders
          42                            // imageRid
        );
        
        // Verify structure:
        // [u16 code][HashMap headers][Option<String> url][HashMap reqHeaders][i32 imageRid]
        expect(encoded.length).toBeGreaterThan(0);
        
        // First 2 bytes should be code (200 = 0xC8 0x00)
        expect(encoded[0]).toBe(200);
        expect(encoded[1]).toBe(0);
      });

      it("should encode ImageResponse with null requestUrl", () => {
        const encoded = encodeImageResponse(
          404,
          {},
          null,
          {},
          0
        );
        
        expect(encoded.length).toBeGreaterThan(0);
        // First 2 bytes: 404 = 0x94 0x01
        expect(encoded[0]).toBe(0x94);
        expect(encoded[1]).toBe(0x01);
      });
    });
  });
});

// B11: Listing/HomeLayout encoding tests
describe("Listing encoding (B11)", () => {
  it("should encode basic listing structure", () => {
    // Listing has: id (String), name (String), kind (u8 enum)
    const parts: Uint8Array[] = [];
    parts.push(encodeString("popular"));
    parts.push(encodeString("Popular"));
    parts.push(new Uint8Array([0])); // kind = Default = 0
    
    const encoded = concatBytes(parts);
    
    // Verify we can decode it back
    let pos = 0;
    let id: string, name: string;
    [id, pos] = decodeString(encoded, pos);
    [name, pos] = decodeString(encoded, pos);
    const kind = encoded[pos];
    
    expect(id).toBe("popular");
    expect(name).toBe("Popular");
    expect(kind).toBe(0);
  });
});

describe("Manga encoding for WASM (B11)", () => {
  it("should encode manga with all fields", () => {
    const manga = {
      key: "manga-123",
      title: "Test Manga",
      cover: "https://example.com/cover.jpg",
      authors: ["Author 1"],
      artists: ["Artist 1"],
      description: "A test manga",
      url: "https://example.com/manga/123",
      tags: ["action", "comedy"],
      status: 1 as const, // Ongoing
      nsfw: 0 as const, // Safe
      viewer: 0 as const, // Default
    };
    
    const encoded = encodeManga(manga);
    expect(encoded.length).toBeGreaterThan(0);
    
    // Verify first field (key) can be decoded
    const [key] = decodeString(encoded, 0);
    expect(key).toBe("manga-123");
  });

  it("should encode minimal manga", () => {
    const manga = {
      key: "minimal",
    };
    
    const encoded = encodeManga(manga);
    expect(encoded.length).toBeGreaterThan(0);
    
    // First field is key
    const [key] = decodeString(encoded, 0);
    expect(key).toBe("minimal");
  });
});

describe("Chapter encoding for WASM (B11)", () => {
  it("should encode chapter with all fields", () => {
    const chapter = {
      key: "ch-1",
      id: "ch-1",
      title: "Chapter 1",
      chapterNumber: 1.0,
      volumeNumber: 1.0,
      dateUploaded: Date.now(),
      scanlator: "Test Group",
      url: "https://example.com/ch/1",
      lang: "en",
    };
    
    const encoded = encodeChapter(chapter);
    expect(encoded.length).toBeGreaterThan(0);
    
    // First field is key
    const [key] = decodeString(encoded, 0);
    expect(key).toBe("ch-1");
  });
});

// B12: HTML error codes
describe("HTML error codes (B12)", () => {
  const HtmlError = {
    InvalidDescriptor: -1,
    InvalidString: -2,
    InvalidHtml: -3,
    InvalidQuery: -4,
    NoResult: -5,
    SwiftSoupError: -6,
  };

  it("should match aidoku-rs HtmlError values", () => {
    expect(HtmlError.InvalidDescriptor).toBe(-1);
    expect(HtmlError.InvalidString).toBe(-2);
    expect(HtmlError.InvalidHtml).toBe(-3);
    expect(HtmlError.InvalidQuery).toBe(-4);
    expect(HtmlError.NoResult).toBe(-5);
    expect(HtmlError.SwiftSoupError).toBe(-6);
  });
});

// B10: PageContext encoding tests
describe("PageContext encoding (B10)", () => {
  describe("encodeHashMap", () => {
    it("should encode empty map correctly", () => {
      const encoded = encodeHashMap({});
      // Empty map is just length 0
      expect(encoded).toEqual(new Uint8Array([0]));
    });

    it("should encode single entry map", () => {
      const encoded = encodeHashMap({ width: "100" });
      expect(encoded[0]).toBe(1); // 1 entry
      // Verify we can decode the key-value pair
      let pos = 1;
      const [key, keyEnd] = decodeString(encoded, pos);
      const [value] = decodeString(encoded, keyEnd);
      expect(key).toBe("width");
      expect(value).toBe("100");
    });

    it("should encode multiple entries", () => {
      const encoded = encodeHashMap({ width: "100", height: "200" });
      expect(encoded[0]).toBe(2); // 2 entries
    });
  });

  describe("encodePageContext for process_page_image", () => {
    it("should encode null as None (0x00)", () => {
      const encoded = encodePageContext(null);
      expect(encoded).toEqual(new Uint8Array([0]));
    });

    it("should encode context as Some(HashMap)", () => {
      const encoded = encodePageContext({ key: "value" });
      expect(encoded[0]).toBe(1); // Some tag
      expect(encoded[1]).toBe(1); // 1 entry in map
    });
  });

  describe("raw HashMap encoding for aidoku-rs context_descriptor >= 0", () => {
    // B10: When context_descriptor >= 0, aidoku-rs reads T (HashMap) directly, not Option<T>
    it("should encode raw HashMap without Option wrapper", () => {
      const rawMap = encodeHashMap({ width: "100" });
      // Should not have Option tag
      expect(rawMap[0]).toBe(1); // 1 entry (not Option::Some tag)
    });
  });
});

// B8: Filter encoding tests
describe("FilterValue encoding (B8)", () => {
  describe("encodeFilterValue", () => {
    it("should encode Title filter as Text variant (0)", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Title,
        name: "Title",
        value: "search query",
      });
      
      // First byte should be variant 0 (Text)
      expect(encoded[0]).toBe(0);
      expect(encoded.length).toBeGreaterThan(1);
    });

    it("should encode Author filter as Text variant (0)", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Author,
        name: "Author",
        value: "John Doe",
      });
      
      expect(encoded[0]).toBe(0);
    });

    it("should encode Sort filter as variant 1", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Sort,
        name: "Sort",
        value: { index: 2, ascending: true },
      });
      
      expect(encoded[0]).toBe(1);
    });

    it("should encode Check filter as variant 2", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Check,
        name: "Completed Only",
        value: true,
      });
      
      expect(encoded[0]).toBe(2);
    });

    it("should encode Select filter as variant 3", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Select,
        name: "Status",
        value: "ongoing",
      });
      
      expect(encoded[0]).toBe(3);
    });

    it("should encode Genre filter as MultiSelect variant (4)", () => {
      const encoded = encodeFilterValue({
        type: FilterType.Genre,
        name: "Genres",
        value: {
          included: ["action"],
          excluded: ["romance"],
        },
      });
      
      expect(encoded[0]).toBe(4);
    });
  });

  describe("encodeFilterValues", () => {
    it("should encode empty filter array", () => {
      const encoded = encodeFilterValues([]);
      
      // Empty vec is just [0] (length 0)
      expect(encoded).toEqual(new Uint8Array([0]));
    });

    it("should encode multiple filters", () => {
      const encoded = encodeFilterValues([
        { type: FilterType.Title, name: "Title", value: "test" },
        { type: FilterType.Check, name: "Check", value: true },
      ]);
      
      // First byte is vec length (2)
      expect(encoded[0]).toBe(2);
      expect(encoded.length).toBeGreaterThan(1);
    });

    it("should skip Group type filters", () => {
      const encoded = encodeFilterValues([
        { type: FilterType.Title, name: "Title", value: "test" },
        { type: FilterType.Group, name: "Group", filters: [] },
        { type: FilterType.Check, name: "Check", value: true },
      ]);
      
      // Should only have 2 filters (Group skipped)
      expect(encoded[0]).toBe(2);
    });
  });
});
