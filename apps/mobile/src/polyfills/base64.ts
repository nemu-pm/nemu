// Deterministic WHATWG `atob` / `btoa` for engines that ship without them.
// The pinned Android JavaScriptEngine and a bare JavaScriptCore context lack
// both, and third-party parsers (entities >= 7 via cheerio) call `atob` while
// their modules initialise, so this must run before any of them load. Kept
// dependency-free so the isolated Aidoku sandbox bundle can share it.

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const DECODE_TABLE = new Int16Array(128).fill(-1);
for (let index = 0; index < ALPHABET.length; index += 1) {
  DECODE_TABLE[ALPHABET.charCodeAt(index)] = index;
}

function invalidCharacter(operation: "atob" | "btoa"): Error {
  const error = new Error(
    operation === "atob"
      ? "Failed to execute 'atob': The string to be decoded is not correctly encoded."
      : "Failed to execute 'btoa': The string to be encoded contains characters outside of the Latin1 range.",
  );
  error.name = "InvalidCharacterError";
  return error;
}

/** Forgiving-base64 decode to a binary (latin1) string, per the HTML spec. */
export function simpleAtob(input: string): string {
  let data = String(input).replace(/[\t\n\f\r ]+/g, "");
  if (data.length % 4 === 0) {
    data = data.replace(/={1,2}$/, "");
  }
  if (data.length % 4 === 1) {
    throw invalidCharacter("atob");
  }

  let output = "";
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < data.length; index += 1) {
    const code = data.charCodeAt(index);
    const value = code < 128 ? DECODE_TABLE[code] : -1;
    if (value < 0) {
      throw invalidCharacter("atob");
    }
    buffer = ((buffer << 6) | value) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/** Encode a binary (latin1) string as base64, per the HTML spec. */
export function simpleBtoa(input: string): string {
  const data = String(input);
  let output = "";
  for (let index = 0; index < data.length; index += 3) {
    const a = data.charCodeAt(index);
    const b = index + 1 < data.length ? data.charCodeAt(index + 1) : -1;
    const c = index + 2 < data.length ? data.charCodeAt(index + 2) : -1;
    if (a > 0xff || b > 0xff || c > 0xff) {
      throw invalidCharacter("btoa");
    }
    const triple = (a << 16) | (Math.max(b, 0) << 8) | Math.max(c, 0);
    output += ALPHABET[(triple >> 18) & 0x3f];
    output += ALPHABET[(triple >> 12) & 0x3f];
    output += b < 0 ? "=" : ALPHABET[(triple >> 6) & 0x3f];
    output += c < 0 ? "=" : ALPHABET[triple & 0x3f];
  }
  return output;
}

if (typeof globalThis.atob !== "function") {
  globalThis.atob = simpleAtob;
}

if (typeof globalThis.btoa !== "function") {
  globalThis.btoa = simpleBtoa;
}
