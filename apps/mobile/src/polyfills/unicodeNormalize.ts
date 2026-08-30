export type UnicodeNormalizationForm = "NFC" | "NFD" | "NFKC" | "NFKD";

export type UnicodeNormalizer = {
  nfc: (value: string) => string;
  nfd: (value: string) => string;
  nfkc: (value: string) => string;
  nfkd: (value: string) => string;
};

export type UnicodeNormalizeGlobal = typeof globalThis & {
  __NEMU_BIGINT_SHIMMED__?: boolean;
  __NEMU_UNICODE_NORMALIZE_SHIMMED__?: boolean;
};

type NormalizePrototype = {
  normalize?: (form?: UnicodeNormalizationForm) => string;
};

type InstallOptions = {
  normalizer: UnicodeNormalizer;
  prototype?: NormalizePrototype;
  targetGlobal?: UnicodeNormalizeGlobal;
};

// Keep the host function reachable for diagnostics and for a future engine
// upgrade. Do not probe it: jsc-android 2026004.0.1 SIGSEGVs instead of
// throwing when its non-Intl build enters ICU normalization.
export const nativeStringNormalize = String.prototype.normalize;

function isAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

function createSafeNormalize(normalizer: UnicodeNormalizer) {
  // The rest parameter keeps the declared arity at zero, matching the spec.
  return function normalize(this: unknown, ...args: [unknown?]): string {
    if (this === null || this === undefined) {
      throw new TypeError("String.prototype.normalize called on null or undefined");
    }

    // The String constructor is intentionally permissive for primitive
    // Symbols, while the normalize spec's ToString operation must reject one.
    if (typeof this === "symbol") throw new TypeError("Cannot convert a Symbol value to a string");
    const value = String(this);
    const rawForm = args[0];
    if (typeof rawForm === "symbol") {
      throw new TypeError("Cannot convert a Symbol value to a string");
    }
    const form = rawForm === undefined ? "NFC" : String(rawForm);
    if (form !== "NFC" && form !== "NFD" && form !== "NFKC" && form !== "NFKD") {
      throw new RangeError(`Invalid normalization form: ${form}`);
    }

    // Search terms and URL hosts are overwhelmingly ASCII. Avoid the Unicode
    // table walk without changing semantics (all four forms preserve ASCII).
    if (isAscii(value)) return value;

    switch (form) {
      case "NFC":
        return normalizer.nfc(value);
      case "NFD":
        return normalizer.nfd(value);
      case "NFKC":
        return normalizer.nfkc(value);
      case "NFKD":
        return normalizer.nfkd(value);
    }
  };
}

export function installJscSafeUnicodeNormalize({
  normalizer,
  prototype = String.prototype,
  targetGlobal = globalThis as UnicodeNormalizeGlobal,
}: InstallOptions): void {
  Object.defineProperty(prototype, "normalize", {
    configurable: true,
    enumerable: false,
    value: createSafeNormalize(normalizer),
    writable: true,
  });
  Object.defineProperty(targetGlobal, "__NEMU_UNICODE_NORMALIZE_SHIMMED__", {
    configurable: true,
    enumerable: false,
    value: true,
    writable: false,
  });
}
