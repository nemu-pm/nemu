import { describe, expect, test } from "bun:test";
import {
  base64DecodedByteLength,
  base64ToBytes,
  decodeBase64,
} from "./mobileBase64";

// `decodeBase64` (atob fast path) replaced `base64ToBytes` (regex + per-sextet
// Map lookups) on the image/OCR read paths. These lock the two decoders to the
// same output so the swap stays behaviour-preserving.

function encode(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe("base64 decoding parity", () => {
  test("both decoders agree across every padding remainder", () => {
    for (let length = 0; length <= 32; length += 1) {
      const bytes = Array.from({ length }, (_, index) => (index * 37) % 256);
      const encoded = encode(bytes);
      expect(Array.from(decodeBase64(encoded))).toEqual(bytes);
      expect(Array.from(base64ToBytes(encoded))).toEqual(bytes);
    }
  });

  test("padded, unpadded and empty inputs decode identically", () => {
    const cases = ["", "AA==", "AAA=", "AAAA", "AQID", "AQI=", "AQ=="];
    for (const value of cases) {
      expect(Array.from(decodeBase64(value))).toEqual(
        Array.from(base64ToBytes(value)),
      );
    }
    expect(Array.from(decodeBase64("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(decodeBase64("AQI="))).toEqual([1, 2]);
    expect(Array.from(decodeBase64("AQ=="))).toEqual([1]);
    expect(decodeBase64("").byteLength).toBe(0);
  });

  test("all 256 byte values survive a round-trip", () => {
    const bytes = Array.from({ length: 256 }, (_, index) => index);
    expect(Array.from(decodeBase64(encode(bytes)))).toEqual(bytes);
  });

  test("malformed input falls back instead of throwing", () => {
    // `atob` rejects these; the tolerant decoder must still produce bytes.
    expect(Array.from(decodeBase64("AQ ID"))).toEqual([1, 2, 3]);
    expect(() => decodeBase64("!!!!")).not.toThrow();
  });

  test("decoded byte length matches the decoded output", () => {
    for (const value of ["AA==", "AAA=", "AAAA", "AQID"]) {
      expect(base64DecodedByteLength(value)).toBe(
        decodeBase64(value).byteLength,
      );
    }
  });
});
