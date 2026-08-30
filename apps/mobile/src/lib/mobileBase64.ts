const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map<string, number>(
  BASE64_ALPHABET.split("").map((char, index) => [char, index]),
);

export function base64DecodedByteLength(base64: string): number {
  const validLength = base64.replace(/[^A-Za-z0-9+/]/g, "").length;
  return Math.floor((validLength * 3) / 4);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const byteLength = base64DecodedByteLength(clean);
  const output = new Uint8Array(byteLength);
  let outputIndex = 0;

  for (let index = 0; index < clean.length; index += 4) {
    const first = BASE64_LOOKUP.get(clean[index]!) ?? 0;
    const second = BASE64_LOOKUP.get(clean[index + 1]!) ?? 0;
    const third = BASE64_LOOKUP.get(clean[index + 2]!) ?? 0;
    const fourth = BASE64_LOOKUP.get(clean[index + 3]!) ?? 0;
    const triple = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < byteLength) output[outputIndex++] = (triple >> 16) & 0xff;
    if (outputIndex < byteLength) output[outputIndex++] = (triple >> 8) & 0xff;
    if (outputIndex < byteLength) output[outputIndex++] = triple & 0xff;
  }

  return output;
}

/**
 * Decodes a base64 string to bytes. Prefers the native `atob` fast path when
 * available (React Native provides `globalThis.atob`); falls back to a pure-JS
 * streaming decoder for runtimes without it. Used to decode native HTTP
 * response bodies (`bytesBase64`) from the Aidoku native module.
 */
export function decodeBase64(value: string): Uint8Array {
  if (!value) return new Uint8Array(0);

  const atob = globalThis.atob;
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of value.replace(/\s/g, "")) {
    if (char === "=") break;
    const sextet = BASE64_ALPHABET.indexOf(char);
    if (sextet < 0) continue;
    buffer = (buffer << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
