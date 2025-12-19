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
} from "./postcard";

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

    it("should decode i64", () => {
      const bytes = new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const [value, offset] = decodeI64(bytes, 0);
      expect(value).toBe(1);
      expect(offset).toBe(8);
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
});
