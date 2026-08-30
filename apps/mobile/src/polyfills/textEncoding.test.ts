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
