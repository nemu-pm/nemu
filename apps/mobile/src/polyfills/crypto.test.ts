import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installCryptoGetRandomValues } from "./crypto";

type CryptoShim = {
  getRandomValues: <T extends ArrayBufferView>(array: T) => T;
};

type CryptoGlobal = typeof globalThis & {
  crypto?: CryptoShim;
  __NEMU_CRYPTO_SHIMMED__?: boolean;
};

const g = globalThis as CryptoGlobal;
const originalDescriptor = Object.getOwnPropertyDescriptor(g, "crypto");
let delegatedViews: Uint8Array[];

function deterministicSecureFill(bytes: Uint8Array): void {
  delegatedViews.push(bytes);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (index * 17 + 31) & 0xff;
  }
}

describe("crypto polyfill (JSC fallback)", () => {
  beforeEach(() => {
    delegatedViews = [];
    (g as { crypto?: CryptoShim }).crypto = undefined;
    delete (g as { __NEMU_CRYPTO_SHIMMED__?: boolean }).__NEMU_CRYPTO_SHIMMED__;
    installCryptoGetRandomValues({ target: g, fillRandomBytes: deterministicSecureFill });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(g, "crypto", originalDescriptor);
    } else {
      delete (g as { crypto?: CryptoShim }).crypto;
    }
    delete (g as { __NEMU_CRYPTO_SHIMMED__?: boolean }).__NEMU_CRYPTO_SHIMMED__;
  });

  test("installs globalThis.crypto and delegates the exact view to the secure source", () => {
    expect(typeof g.crypto?.getRandomValues).toBe("function");
    expect(g.__NEMU_CRYPTO_SHIMMED__).toBe(true);

    const backing = new Uint8Array(12).fill(0xaa);
    const view = new Uint16Array(backing.buffer, 2, 4);
    const returned = g.crypto!.getRandomValues(view);

    expect(returned).toBe(view);
    expect(delegatedViews).toHaveLength(1);
    expect(delegatedViews[0]?.byteOffset).toBe(2);
    expect(delegatedViews[0]?.byteLength).toBe(8);
    expect(backing[0]).toBe(0xaa);
    expect(backing[1]).toBe(0xaa);
    expect(backing[10]).toBe(0xaa);
    expect(backing[11]).toBe(0xaa);
    expect(Array.from(backing.slice(2, 10))).toEqual([
      31, 48, 65, 82, 99, 116, 133, 150,
    ]);
  });

  test("rejects non-integer views before calling the secure source", () => {
    expect(() =>
      g.crypto!.getRandomValues(new Float32Array(4) as unknown as Uint8Array),
    ).toThrow(TypeError);
    expect(() =>
      g.crypto!.getRandomValues(new DataView(new ArrayBuffer(4)) as unknown as Uint8Array),
    ).toThrow(TypeError);
    expect(delegatedViews).toHaveLength(0);
  });

  test("enforces the Web Crypto 65,536-byte quota", () => {
    expect(() => g.crypto!.getRandomValues(new Uint8Array(65_537))).toThrow();
    try {
      g.crypto!.getRandomValues(new Uint8Array(65_537));
    } catch (error) {
      expect((error as Error).name).toBe("QuotaExceededError");
    }
    expect(delegatedViews).toHaveLength(0);

    expect(() => g.crypto!.getRandomValues(new Uint8Array(65_536))).not.toThrow();
    expect(delegatedViews).toHaveLength(1);
  });

  test("fails closed when the secure source is unavailable", () => {
    (g as { crypto?: CryptoShim }).crypto = undefined;
    installCryptoGetRandomValues({
      target: g,
      fillRandomBytes: () => {
        throw new Error("secure RNG unavailable");
      },
    });
    expect(() => g.crypto!.getRandomValues(new Uint8Array(32))).toThrow(
      "secure RNG unavailable",
    );
  });

  test("does not overwrite an existing crypto implementation", () => {
    const native: CryptoShim = {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => array,
    };
    Object.defineProperty(g, "crypto", {
      configurable: true,
      enumerable: false,
      value: native,
      writable: true,
    });
    installCryptoGetRandomValues({ target: g, fillRandomBytes: deterministicSecureFill });
    expect(g.crypto as unknown).toBe(native);
  });

  test("generateCodeVerifier produces a valid RFC 7636 verifier", async () => {
    const { generateCodeVerifier } = await import("@nemu/core/source-oauth");
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(/^[A-Za-z0-9-._~]+$/);
  });
});
