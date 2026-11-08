import { describe, expect, test } from "bun:test";
import { SimpleTextDecoder, SimpleTextEncoder } from "./textEncoding";

const encoder = new SimpleTextEncoder();

describe("JSC text encoding polyfill", () => {
  test("preserves multi-byte Japanese text across arbitrary streaming chunks", () => {
    const input = "猫が好き。emoji: 🍙";
    const bytes = encoder.encode(input);
    const decoder = new SimpleTextDecoder();
    let output = "";

    for (const byte of bytes) {
      output += decoder.decode(Uint8Array.of(byte), { stream: true });
    }
    output += decoder.decode();

    expect(output).toBe(input);
  });

  test("buffers a split BOM and strips it only at the start of a stream", () => {
    const decoder = new SimpleTextDecoder();

    expect(decoder.decode(Uint8Array.of(0xef), { stream: true })).toBe("");
    expect(decoder.decode(Uint8Array.of(0xbb), { stream: true })).toBe("");
    expect(
      decoder.decode(Uint8Array.of(0xbf, 0x61), { stream: true }),
    ).toBe("a");
    expect(decoder.decode()).toBe("");
  });

  test("replaces an incomplete sequence once when a non-fatal stream flushes", () => {
    const decoder = new SimpleTextDecoder();

    expect(decoder.decode(Uint8Array.of(0xf0, 0x9f), { stream: true })).toBe("");
    expect(decoder.decode()).toBe("\ufffd");
  });

  test("throws on invalid or incomplete fatal streams and resets afterward", () => {
    const invalid = new SimpleTextDecoder("utf-8", { fatal: true });
    expect(() => invalid.decode(Uint8Array.of(0xe2, 0x28))).toThrow(TypeError);
    expect(invalid.decode(Uint8Array.of(0x6f, 0x6b))).toBe("ok");

    const incomplete = new SimpleTextDecoder("utf-8", { fatal: true });
    expect(
      incomplete.decode(Uint8Array.of(0xe7, 0x8c), { stream: true }),
    ).toBe("");
    expect(() => incomplete.decode()).toThrow(TypeError);
    expect(incomplete.decode(Uint8Array.of(0x6f, 0x6b))).toBe("ok");
  });

  test("decodes long ASCII and mixed text across its internal slice sizes", () => {
    const ascii = "{\"title\":\"chapter\",\"pages\":[1,2,3]}".repeat(1200);
    expect(new SimpleTextDecoder().decode(encoder.encode(ascii))).toBe(ascii);

    // Short and long ASCII runs between multi-byte text, long enough to pass
    // the 8192-unit slice boundary at several alignments.
    for (const padding of ["", "a", "ab", "abc"]) {
      const mixed =
        padding +
        "猫a🍙<p class=\"synopsis-paragraph\">好き</p>é".repeat(700) +
        "x".repeat(8200) +
        "終";
      expect(new SimpleTextDecoder().decode(encoder.encode(mixed))).toBe(mixed);
    }
  });

  test("matches the platform decoder on random bytes, whole and streamed", () => {
    let seed = 0x9e3779b9;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    // Weighted towards ASCII and well-formed lead/continuation bytes so that
    // valid sequences, truncated ones and stray bytes all occur.
    const pools = [
      [0x20, 0x41, 0x7a, 0x0a],
      [0xe3, 0x81, 0x82, 0xe7, 0x8c, 0xab],
      [0xf0, 0x9f, 0x8d, 0x99, 0xc3, 0xa9],
      [0xc0, 0xe0, 0x80, 0xed, 0xa0, 0xf4, 0x90, 0xff, 0xef, 0xbb, 0xbf],
    ];

    for (let round = 0; round < 300; round += 1) {
      const bytes = new Uint8Array(random(96));
      for (let index = 0; index < bytes.length; index += 1) {
        const pool = pools[random(8) < 4 ? 0 : 1 + random(3)];
        bytes[index] = pool[random(pool.length)];
      }
      const expected = new TextDecoder().decode(bytes);
      expect(new SimpleTextDecoder().decode(bytes)).toBe(expected);

      const streamed = new SimpleTextDecoder();
      let output = "";
      for (let offset = 0; offset < bytes.length; ) {
        const size = 1 + random(7);
        output += streamed.decode(bytes.subarray(offset, offset + size), {
          stream: true,
        });
        offset += size;
      }
      output += streamed.decode();
      expect(output).toBe(expected);

      let nativeThrew = false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        nativeThrew = true;
      }
      let polyfillThrew = false;
      try {
        new SimpleTextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        polyfillThrew = true;
      }
      expect(polyfillThrew).toBe(nativeThrew);
    }
  });

  test("keeps its own copy of bytes a stream still needs", () => {
    const decoder = new SimpleTextDecoder();
    const chunk = Uint8Array.of(0x61, 0xe7, 0x8c);

    expect(decoder.decode(chunk, { stream: true })).toBe("a");
    chunk.fill(0x62);
    expect(decoder.decode(Uint8Array.of(0xab))).toBe("猫");
    expect(Array.from(chunk)).toEqual([0x62, 0x62, 0x62]);
  });

  test("reads only the viewed range of a larger buffer", () => {
    const backing = encoder.encode("xx猫が好きyy");
    const view = new DataView(backing.buffer, 2, backing.length - 4);

    expect(new SimpleTextDecoder().decode(view)).toBe("猫が好き");
    expect(new SimpleTextDecoder().decode(backing.buffer)).toBe("xx猫が好きyy");
  });

  test("encodes unpaired surrogates as replacement characters", () => {
    expect(Array.from(encoder.encode("a\ud800b\udc00c"))).toEqual([
      0x61,
      0xef,
      0xbf,
      0xbd,
      0x62,
      0xef,
      0xbf,
      0xbd,
      0x63,
    ]);
  });

  test("encodeInto never writes a partial UTF-8 sequence", () => {
    const tooSmall = new Uint8Array(3);
    expect(encoder.encodeInto("🍙", tooSmall)).toEqual({ read: 0, written: 0 });
    expect(Array.from(tooSmall)).toEqual([0, 0, 0]);

    const exact = new Uint8Array(4);
    expect(encoder.encodeInto("🍙", exact)).toEqual({ read: 2, written: 4 });
    expect(Array.from(exact)).toEqual([0xf0, 0x9f, 0x8d, 0x99]);
  });
});
