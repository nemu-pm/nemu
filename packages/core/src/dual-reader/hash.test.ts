import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  computeDhash,
  createDhashWord,
  dhashWordFromHex,
  dhashWordToHex,
  hammingDistance,
} from "./hash";
import { deserializeDhash, serializeDhash } from "./hash-serialization";

function descendingLuma(): Uint8Array {
  return Uint8Array.from({ length: 9 * 9 }, (_, index) => {
    const x = index % 9;
    const y = Math.floor(index / 9);
    return 255 - x * 16 - y;
  });
}

describe("dual-reader exact 64-bit dHash words", () => {
  test("round-trips the existing unsigned hexadecimal cache format", () => {
    const word = createDhashWord(0x0123_4567, 0x89ab_cdef);

    expect(dhashWordToHex(word)).toBe("123456789abcdef");
    expect(dhashWordFromHex("123456789abcdef")).toEqual(word);
    expect(dhashWordToHex(createDhashWord(0, 0))).toBe("0");
  });

  test("counts differences in both 32-bit halves exactly", () => {
    const zero = dhashWordFromHex("0");
    const all = dhashWordFromHex("ffffffffffffffff");
    const outerBits = dhashWordFromHex("8000000080000000");

    expect(hammingDistance(zero, all)).toBe(64);
    expect(hammingDistance(zero, outerBits)).toBe(2);
  });

  test("computes and serializes upper bits without a native BigInt dependency", () => {
    const hash = computeDhash({
      data: descendingLuma(),
      width: 9,
      height: 9,
      channels: 1,
    });

    expect(serializeDhash(hash)).toEqual({
      h: "ffffffffffffffff",
      v: "ffffffffffffffff",
    });
    expect(deserializeDhash(serializeDhash(hash))).toEqual(hash);
  });

  test("rejects signed, over-wide, and malformed legacy cache values", () => {
    expect(() => dhashWordFromHex("-80000000")).toThrow();
    expect(() => dhashWordFromHex("10000000000000000")).toThrow();
    expect(() => dhashWordFromHex("not-a-hash")).toThrow();
  });

  test("runs in an isolated process where the BigInt global is unavailable", () => {
    const hashUrl = new URL("./hash.ts", import.meta.url).href;
    const serializationUrl = new URL("./hash-serialization.ts", import.meta.url)
      .href;
    const script = `
      Object.defineProperty(globalThis, "BigInt", {
        configurable: true,
        value: undefined,
        writable: true,
      });
      const hashModule = await import(${JSON.stringify(hashUrl)});
      const serialization = await import(${JSON.stringify(serializationUrl)});
      const data = Uint8Array.from({ length: 81 }, (_, index) => {
        const x = index % 9;
        const y = Math.floor(index / 9);
        return 255 - x * 16 - y;
      });
      const hash = hashModule.computeDhash({
        data,
        width: 9,
        height: 9,
        channels: 1,
      });
      const encoded = serialization.serializeDhash(hash);
      const decoded = serialization.deserializeDhash(encoded);
      console.log(JSON.stringify({
        encoded,
        distance: hashModule.dhashDistance(hash, decoded),
        bigintType: typeof globalThis.BigInt,
      }));
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      encoded: { h: "ffffffffffffffff", v: "ffffffffffffffff" },
      distance: 0,
      bigintType: "undefined",
    });
  });
});
