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
  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index];
  }
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

function toUint8Array(input?: AllowSharedBufferSource): Uint8Array<ArrayBuffer> {
  if (!input) {
    return makeOwnedUint8Array(0);
  }

  if (input instanceof Uint8Array) {
    return copyToOwnedUint8Array(input);
  }

  if (ArrayBuffer.isView(input)) {
    return copyToOwnedUint8Array(
      new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
    );
  }

  return copyToOwnedUint8Array(new Uint8Array(input));
}

function replacementOrThrow(fatal: boolean): string {
  if (fatal) {
    throw new TypeError("The encoded data was not valid UTF-8.");
  }
  return "\ufffd";
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
  let output = "";

  for (let index = 0; index < bytes.length; ) {
    const first = bytes[index];
    if (first <= 0x7f) {
      output += String.fromCharCode(first);
      index += 1;
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
      output += replacementOrThrow(fatal);
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
      output += replacementOrThrow(fatal);
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
      output += replacementOrThrow(fatal);
      // Consume the valid prefix, but leave the non-continuation byte for the
      // next iteration (for example F0 9F 28 becomes U+FFFD followed by "(").
      index += invalidContinuationOffset;
      continue;
    }

    if (index + needed >= bytes.length) {
      if (stream) {
        return {
          pending: copyToOwnedUint8Array(bytes.subarray(index)),
          text: output,
        };
      }
      output += replacementOrThrow(fatal);
      index = bytes.length;
      continue;
    }

    let codePoint =
      needed === 1 ? first & 0x1f : needed === 2 ? first & 0x0f : first & 0x07;
    for (let offset = 1; offset <= needed; offset += 1) {
      codePoint = (codePoint << 6) | (bytes[index + offset] & 0x3f);
    }

    if (codePoint <= 0xffff) {
      output += String.fromCharCode(codePoint);
    } else {
      const normalized = codePoint - 0x10000;
      output += String.fromCharCode(
        0xd800 + (normalized >> 10),
        0xdc00 + (normalized & 0x3ff)
      );
    }
    index += needed + 1;
  }

  return { pending: makeOwnedUint8Array(0), text: output };
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

function concatenateBytes(
  first: Uint8Array,
  second: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (!first.length) return copyToOwnedUint8Array(second);
  if (!second.length) return copyToOwnedUint8Array(first);
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
