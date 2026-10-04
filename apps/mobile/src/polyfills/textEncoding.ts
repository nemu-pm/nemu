type TextEncoderEncodeIntoResult = {
  read: number;
  written: number;
};

type TextDecoderOptions = {
  fatal?: boolean;
  ignoreBOM?: boolean;
};

type TextDecodeOptions = {
  stream?: boolean;
};

function encodeCodePoint(codePoint: number, output: number[]) {
  if (codePoint <= 0x7f) {
    output.push(codePoint);
    return;
  }

  if (codePoint <= 0x7ff) {
    output.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    return;
  }

  if (codePoint <= 0xffff) {
    output.push(
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f)
    );
    return;
  }

  output.push(
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f)
  );
}

function makeOwnedUint8Array(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(length));
}

function copyToOwnedUint8Array(input: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const output = makeOwnedUint8Array(input.length);
  output.set(input);
  return output;
}

function encodeUtf8(input: string): Uint8Array<ArrayBuffer> {
  const output: number[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const value = input.charCodeAt(index);
    if (value >= 0xd800 && value <= 0xdbff) {
      const next = index + 1 < input.length ? input.charCodeAt(index + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        encodeCodePoint(
          0x10000 + ((value - 0xd800) << 10) + (next - 0xdc00),
          output,
        );
        index += 1;
      } else {
        encodeCodePoint(0xfffd, output);
      }
      continue;
    }

    if (value >= 0xdc00 && value <= 0xdfff) {
      encodeCodePoint(0xfffd, output);
      continue;
    }
    encodeCodePoint(value, output);
  }

  return copyToOwnedUint8Array(output);
}

// A view over the caller's bytes, not a copy: decoding only reads them, and
// whatever a stream has to keep for the next call is copied by the decoder.
function toUint8Array(input?: AllowSharedBufferSource): Uint8Array {
  if (!input) {
    return makeOwnedUint8Array(0);
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  return new Uint8Array(input);
}

function replacementOrThrow(fatal: boolean): number {
  if (fatal) {
    throw new TypeError("The encoded data was not valid UTF-8.");
  }
  return 0xfffd;
}

// JSC runs app JavaScript without a JIT, where building a string one character
// at a time costs hundreds of nanoseconds per byte. Code units are therefore
// collected in a scratch buffer and turned into strings a slice at a time;
// String.fromCharCode takes them as call arguments, so a slice stays well
// under every engine's argument limit.
const DECODE_CHUNK = 0x2000;
// ASCII runs at least this long skip the scratch buffer and are converted
// straight from the input bytes.
const ASCII_RUN_MIN = 16;
const decodeUnits = new Uint16Array(DECODE_CHUNK);

function codeUnitsToString(units: Uint8Array | Uint16Array): string {
  return String.fromCharCode.apply(null, units as unknown as number[]);
}

type Utf8DecodeResult = {
  pending: Uint8Array<ArrayBuffer>;
  text: string;
};

function decodeUtf8(
  bytes: Uint8Array,
  fatal: boolean,
  stream: boolean,
): Utf8DecodeResult {
  const length = bytes.length;
  const units = decodeUnits;
  let unitCount = 0;
  let output = "";

  for (let index = 0; index < length; ) {
    // One step adds at most a short ASCII run or a surrogate pair.
    if (unitCount > DECODE_CHUNK - ASCII_RUN_MIN) {
      output += codeUnitsToString(units.subarray(0, unitCount));
      unitCount = 0;
    }

    const first = bytes[index];
    if (first <= 0x7f) {
      let runEnd = index + 1;
      while (runEnd < length && bytes[runEnd] <= 0x7f) runEnd += 1;

      if (runEnd - index < ASCII_RUN_MIN) {
        while (index < runEnd) {
          units[unitCount] = bytes[index];
          unitCount += 1;
          index += 1;
        }
        continue;
      }

      if (unitCount > 0) {
        output += codeUnitsToString(units.subarray(0, unitCount));
        unitCount = 0;
      }
      while (index < runEnd) {
        const sliceEnd = Math.min(index + DECODE_CHUNK, runEnd);
        output += codeUnitsToString(bytes.subarray(index, sliceEnd));
        index = sliceEnd;
      }
      continue;
    }

    let needed = 0;

    if (first >= 0xc2 && first <= 0xdf) {
      needed = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      needed = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      needed = 3;
    } else {
      units[unitCount] = replacementOrThrow(fatal);
      unitCount += 1;
      index += 1;
      continue;
    }

    const second = bytes[index + 1];
    if (
      second !== undefined &&
      ((first === 0xe0 && second < 0xa0) ||
        (first === 0xed && second > 0x9f) ||
        (first === 0xf0 && second < 0x90) ||
        (first === 0xf4 && second > 0x8f))
    ) {
      // These leading-byte constraints reject overlong encodings, UTF-16
      // surrogates, and values above U+10FFFF. Only consume the lead byte so
      // each following continuation byte is handled as its own invalid input,
      // matching the Encoding Standard's maximal-subpart behavior.
      units[unitCount] = replacementOrThrow(fatal);
      unitCount += 1;
      index += 1;
      continue;
    }

    let invalidContinuationOffset = 0;
    for (let offset = 1; offset <= needed; offset += 1) {
      const current = bytes[index + offset];
      if (current === undefined) break;
      if ((current & 0xc0) !== 0x80) {
        invalidContinuationOffset = offset;
        break;
      }
    }

    if (invalidContinuationOffset > 0) {
      units[unitCount] = replacementOrThrow(fatal);
      unitCount += 1;
      // Consume the valid prefix, but leave the non-continuation byte for the
      // next iteration (for example F0 9F 28 becomes U+FFFD followed by "(").
      index += invalidContinuationOffset;
      continue;
    }

    if (index + needed >= length) {
      if (stream) {
        return {
          pending: copyToOwnedUint8Array(bytes.subarray(index)),
          text: output + codeUnitsToString(units.subarray(0, unitCount)),
        };
      }
      units[unitCount] = replacementOrThrow(fatal);
      unitCount += 1;
      index = length;
      continue;
    }

    let codePoint =
      needed === 1 ? first & 0x1f : needed === 2 ? first & 0x0f : first & 0x07;
    for (let offset = 1; offset <= needed; offset += 1) {
      codePoint = (codePoint << 6) | (bytes[index + offset] & 0x3f);
    }

    if (codePoint <= 0xffff) {
      units[unitCount] = codePoint;
      unitCount += 1;
    } else {
      const normalized = codePoint - 0x10000;
      units[unitCount] = 0xd800 + (normalized >> 10);
      units[unitCount + 1] = 0xdc00 + (normalized & 0x3ff);
      unitCount += 2;
    }
    index += needed + 1;
  }

  return {
    pending: makeOwnedUint8Array(0),
    text: output + codeUnitsToString(units.subarray(0, unitCount)),
  };
}

export class SimpleTextEncoder implements TextEncoder {
  get encoding(): string {
    return "utf-8";
  }

  encode(input = ""): Uint8Array<ArrayBuffer> {
    return encodeUtf8(input);
  }

  encodeInto(source: string, destination: Uint8Array): TextEncoderEncodeIntoResult {
    let read = 0;
    let written = 0;

    while (read < source.length) {
      const first = source.charCodeAt(read);
      const hasPair =
        first >= 0xd800 &&
        first <= 0xdbff &&
        read + 1 < source.length &&
        source.charCodeAt(read + 1) >= 0xdc00 &&
        source.charCodeAt(read + 1) <= 0xdfff;
      const codePoint = hasPair
        ? 0x10000 +
          ((first - 0xd800) << 10) +
          (source.charCodeAt(read + 1) - 0xdc00)
        : first >= 0xd800 && first <= 0xdfff
          ? 0xfffd
          : first;
      const encoded: number[] = [];
      encodeCodePoint(codePoint, encoded);
      if (written + encoded.length > destination.length) break;
      destination.set(encoded, written);
      written += encoded.length;
      read += hasPair ? 2 : 1;
    }

    return { read, written };
  }
}

type SimpleTextDecoderState = {
  bomHandled: boolean;
  fatal: boolean;
  ignoreBOM: boolean;
  pending: Uint8Array<ArrayBuffer>;
  streaming: boolean;
};

const decoderStates = new WeakMap<
  SimpleTextDecoder,
  SimpleTextDecoderState
>();

function resetDecoderStream(state: SimpleTextDecoderState): void {
  state.bomHandled = false;
  state.pending = makeOwnedUint8Array(0);
  state.streaming = false;
}

function concatenateBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  if (!first.length) return second;
  if (!second.length) return first;
  const combined = makeOwnedUint8Array(first.length + second.length);
  combined.set(first, 0);
  combined.set(second, first.length);
  return combined;
}

export class SimpleTextDecoder implements TextDecoder {
  get encoding(): string {
    return "utf-8";
  }

  get fatal(): boolean {
    return decoderStates.get(this)?.fatal ?? false;
  }

  get ignoreBOM(): boolean {
    return decoderStates.get(this)?.ignoreBOM ?? false;
  }

  constructor(label = "utf-8", options: TextDecoderOptions = {}) {
    if (!/^utf-?8$/i.test(label)) {
      throw new RangeError("Only UTF-8 decoding is supported.");
    }
    decoderStates.set(this, {
      bomHandled: false,
      fatal: options.fatal ?? false,
      ignoreBOM: options.ignoreBOM ?? false,
      pending: makeOwnedUint8Array(0),
      streaming: false,
    });
  }

  decode(input?: AllowSharedBufferSource, options: TextDecodeOptions = {}): string {
    const state = decoderStates.get(this);
    if (!state) throw new TypeError("TextDecoder was not initialized.");

    const stream = options.stream === true;
    const bytes = concatenateBytes(state.pending, toUint8Array(input));

    try {
      const result = decodeUtf8(bytes, state.fatal, stream);
      state.pending = result.pending;
      state.streaming = stream;

      let output = result.text;
      if (!state.bomHandled && output.length > 0) {
        state.bomHandled = true;
        if (!state.ignoreBOM && output.charCodeAt(0) === 0xfeff) {
          output = output.slice(1);
        }
      }

      if (!stream) resetDecoderStream(state);
      return output;
    } catch (error) {
      resetDecoderStream(state);
      throw error;
    }
  }
}

const runtimeGlobal = globalThis as typeof globalThis & {
  TextDecoder?: typeof TextDecoder;
  TextEncoder?: typeof TextEncoder;
};

runtimeGlobal.TextEncoder ??= SimpleTextEncoder;
runtimeGlobal.TextDecoder ??= SimpleTextDecoder;
