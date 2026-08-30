import {
  installJscSafeUnicodeNormalize,
  type UnicodeNormalizeGlobal,
  type UnicodeNormalizer,
} from "./unicodeNormalize";

const androidJscGlobal = globalThis as UnicodeNormalizeGlobal;
let loadedNormalizer: UnicodeNormalizer | undefined;

function getNormalizer(): UnicodeNormalizer {
  if (!loadedNormalizer) {
    // Metro's fixed-literal require keeps the 143 KiB Unicode table unevaluated
    // until the first non-ASCII normalization call. This matters for cold and
    // headless background launches, whose URL hosts are normally ASCII.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loadedNormalizer = require("unorm") as UnicodeNormalizer;
  }
  return loadedNormalizer;
}

const lazyNormalizer: UnicodeNormalizer = {
  nfc: (value) => getNormalizer().nfc(value),
  nfd: (value) => getNormalizer().nfd(value),
  nfkc: (value) => getNormalizer().nfkc(value),
  nfkd: (value) => getNormalizer().nfkd(value),
};

// Metro resolves this file only for Android. BigInt absence then narrows the
// guard to Nemu's pinned JSC and leaves Hermes or a future working JSC intact.
if (androidJscGlobal.__NEMU_BIGINT_SHIMMED__ === true) {
  installJscSafeUnicodeNormalize({
    normalizer: lazyNormalizer,
    targetGlobal: androidJscGlobal,
  });
}
