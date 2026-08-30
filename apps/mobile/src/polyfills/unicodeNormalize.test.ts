import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  installJscSafeUnicodeNormalize,
  nativeStringNormalize,
  type UnicodeNormalizationForm,
  type UnicodeNormalizeGlobal,
  type UnicodeNormalizer,
} from "./unicodeNormalize";

const require = createRequire(import.meta.url);
const unorm = require("unorm") as UnicodeNormalizer;

describe("Android JSC Unicode normalization crash guard", () => {
  test("replaces the crashing host function and implements all normalization forms", () => {
    const prototype: {
      normalize?: (form?: UnicodeNormalizationForm) => string;
    } = {};
    const targetGlobal = {} as UnicodeNormalizeGlobal;
    installJscSafeUnicodeNormalize({ normalizer: unorm, prototype, targetGlobal });

    const normalize = prototype.normalize;
    expect(typeof normalize).toBe("function");
    if (!normalize) throw new Error("Expected normalize polyfill to be installed.");
    const call = (receiver: unknown, ...args: unknown[]) =>
      Reflect.apply(normalize, receiver, args);

    expect(nativeStringNormalize).toBe(String.prototype.normalize);
    expect(targetGlobal.__NEMU_UNICODE_NORMALIZE_SHIMMED__).toBe(true);
    expect(normalize.length).toBe(0);
    expect(call("e\u0301")).toBe("é");
    expect(call("e\u0301", "NFC")).toBe("é");
    expect(call("é", "NFD")).toBe("e\u0301");
    expect(call("Ｏｎｅ\u3000Ｐｉｅｃｅ ﬃ", "NFKC")).toBe("One Piece ffi");
    expect(call("é", "NFKD")).toBe("e\u0301");
    expect(call("は\u3099", "NFC")).toBe("ば");
    expect(call("ｶﾞ", "NFKC")).toBe("ガ");
    expect(call("\u1100\u1161", "NFC")).toBe("가");
    expect(call("가", "NFD")).toBe("\u1100\u1161");
    expect(call("one-piece.example", "NFKC")).toBe("one-piece.example");
    expect(call(123)).toBe("123");
    expect(call("Ｏｎｅ", { toString: () => "NFKC" })).toBe("One");
    expect(() => call("x", "INVALID")).toThrow(RangeError);
    expect(() => call(null)).toThrow(TypeError);
    expect(() => call(Symbol("x"))).toThrow(TypeError);
    expect(() => call("x", Symbol("NFC"))).toThrow(TypeError);
    expect(Object.getOwnPropertyDescriptor(prototype, "normalize")).toMatchObject({
      configurable: true,
      enumerable: false,
      writable: true,
    });
  });

  test("installs only behind the Android JSC marker", () => {
    const androidGuard = readFileSync(
      path.join(import.meta.dir, "stringNormalize.android.ts"),
      "utf8",
    );
    expect(androidGuard).toContain(
      "if (androidJscGlobal.__NEMU_BIGINT_SHIMMED__ === true)",
    );
    expect(androidGuard).toContain("installJscSafeUnicodeNormalize({");
  });

  test("loads the Android-only guard immediately after BigInt detection and before Expo", () => {
    const entry = readFileSync(
      path.join(import.meta.dir, "../../index.ts"),
      "utf8",
    );
    const bigIntImport = entry.indexOf('import "./src/polyfills/bigInt";');
    const normalizeImport = entry.indexOf(
      'import "./src/polyfills/stringNormalize";',
    );
    const expoImport = entry.indexOf('import "expo-router/entry";');

    expect(bigIntImport).toBeGreaterThanOrEqual(0);
    expect(normalizeImport).toBeGreaterThan(bigIntImport);
    expect(expoImport).toBeGreaterThan(normalizeImport);
    expect(
      readFileSync(path.join(import.meta.dir, "stringNormalize.ts"), "utf8"),
    ).not.toContain("unorm");
    const androidGuard = readFileSync(
      path.join(import.meta.dir, "stringNormalize.android.ts"),
      "utf8",
    );
    expect(androidGuard).toContain('require("unorm")');
    expect(androidGuard).not.toContain('import unorm from "unorm"');
  });

  test("keeps every direct mobile normalization call behind the entry guard", () => {
    const directCallsites = [
      "../sources/mobileSourceSearch.ts",
      "../lib/mobileJapaneseLearningTranscriptTiming.ts",
      "../lib/mobileMetadataMatch.ts",
    ];
    for (const relativePath of directCallsites) {
      expect(
        readFileSync(path.join(import.meta.dir, relativePath), "utf8"),
      ).toContain(".normalize(");
    }
  });
});
