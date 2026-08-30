import { fillSecureRandomBytes } from "./secureRandom";

type CryptoGlobal = typeof globalThis & {
  crypto?: Crypto;
  __NEMU_CRYPTO_SHIMMED__?: boolean;
};

interface Crypto {
  getRandomValues?<T extends ArrayBufferView>(array: T): T;
}

type FillSecureRandomBytes = (bytes: Uint8Array) => void;

const MAX_RANDOM_BYTES = 65_536;

function isIntegerTypedArray(value: ArrayBufferView): boolean {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(value instanceof Float32Array) &&
    !(value instanceof Float64Array)
  );
}

function makeQuotaExceededError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException(
      `The requested length exceeds ${MAX_RANDOM_BYTES} bytes.`,
      "QuotaExceededError",
    );
  }
  const error = new Error(`The requested length exceeds ${MAX_RANDOM_BYTES} bytes.`);
  error.name = "QuotaExceededError";
  return error;
}

export function installCryptoGetRandomValues({
  target = globalThis as CryptoGlobal,
  fillRandomBytes = fillSecureRandomBytes,
}: {
  target?: CryptoGlobal;
  fillRandomBytes?: FillSecureRandomBytes;
} = {}): void {
  if (
    typeof target.crypto === "object" &&
    target.crypto !== null &&
    typeof target.crypto.getRandomValues === "function"
  ) {
    return;
  }

  const shim: Crypto = {
    getRandomValues<T extends ArrayBufferView>(array: T): T {
      if (!isIntegerTypedArray(array)) {
        throw new TypeError(
          "crypto.getRandomValues expects an integer-based TypedArray.",
        );
      }
      if (array.byteLength > MAX_RANDOM_BYTES) {
        throw makeQuotaExceededError();
      }

      const bytes = new Uint8Array(
        array.buffer as ArrayBuffer,
        array.byteOffset,
        array.byteLength,
      );
      fillRandomBytes(bytes);
      return array;
    },
  };

  Object.defineProperty(target, "crypto", {
    configurable: true,
    enumerable: false,
    value: shim,
    writable: true,
  });
  Object.defineProperty(target, "__NEMU_CRYPTO_SHIMMED__", {
    configurable: true,
    enumerable: false,
    value: true,
    writable: false,
  });
}

installCryptoGetRandomValues();
