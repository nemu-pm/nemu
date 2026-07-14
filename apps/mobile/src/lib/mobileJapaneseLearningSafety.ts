export class MobileJapaneseLearningLimitError extends Error {
  readonly code = "MOBILE_JAPANESE_LEARNING_LIMIT_EXCEEDED";

  constructor(message: string) {
    super(message);
    this.name = "MobileJapaneseLearningLimitError";
  }
}

export function assertMobileJapaneseLearningByteLength(
  byteLength: number,
  maxBytes: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    byteLength > maxBytes
  ) {
    throw new MobileJapaneseLearningLimitError(
      `${label} exceeds the ${maxBytes} byte safety limit.`,
    );
  }
}

export function assertMobileJapaneseLearningStringLength(
  value: string,
  maxCharacters: number,
  label: string,
): void {
  if (value.length > maxCharacters) {
    throw new MobileJapaneseLearningLimitError(
      `${label} exceeds the ${maxCharacters} character safety limit.`,
    );
  }
}

export function assertMobileJapaneseLearningCount(
  count: number,
  maxCount: number,
  label: string,
): void {
  if (!Number.isSafeInteger(count) || count < 0 || count > maxCount) {
    throw new MobileJapaneseLearningLimitError(
      `${label} exceeds the ${maxCount} item safety limit.`,
    );
  }
}

export function mobileJapaneseLearningUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertMobileJapaneseLearningUtf8ByteLength(
  value: string,
  maxBytes: number,
  label: string,
): void {
  assertMobileJapaneseLearningByteLength(
    mobileJapaneseLearningUtf8ByteLength(value),
    maxBytes,
    label,
  );
}

export function mobileJapaneseLearningBase64DecodedByteLength(
  encoded: string,
): number {
  let compactLength = 0;
  let last = "";
  let secondLast = "";
  for (let index = 0; index < encoded.length; index += 1) {
    const character = encoded[index]!;
    if (/\s/.test(character)) continue;
    compactLength += 1;
    secondLast = last;
    last = character;
  }
  const padding = last === "=" ? (secondLast === "=" ? 2 : 1) : 0;
  return Math.max(0, Math.floor((compactLength * 3) / 4) - padding);
}

export function assertMobileJapaneseLearningBase64Payload(
  encoded: string,
  limits: { maxEncodedCharacters: number; maxDecodedBytes: number },
  label: string,
): void {
  assertMobileJapaneseLearningStringLength(
    encoded,
    limits.maxEncodedCharacters,
    `${label} encoded payload`,
  );
  assertMobileJapaneseLearningByteLength(
    mobileJapaneseLearningBase64DecodedByteLength(encoded),
    limits.maxDecodedBytes,
    label,
  );
}

export function throwIfMobileJapaneseLearningAborted(
  signal?: AbortSignal,
): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Japanese Learning operation cancelled.");
  error.name = "AbortError";
  throw error;
}

export async function awaitMobileJapaneseLearningAbortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfMobileJapaneseLearningAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        throwIfMobileJapaneseLearningAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export async function readMobileJapaneseLearningBoundedResponseText(
  response: Response,
  options: {
    maxBytes: number;
    label: string;
    signal?: AbortSignal;
  },
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) {
    assertMobileJapaneseLearningByteLength(
      declaredLength,
      options.maxBytes,
      options.label,
    );
  }
  throwIfMobileJapaneseLearningAborted(options.signal);

  const reader = response.body?.getReader?.();
  if (!reader || typeof TextDecoder === "undefined") {
    const text = await response.text();
    throwIfMobileJapaneseLearningAborted(options.signal);
    assertMobileJapaneseLearningUtf8ByteLength(
      text,
      options.maxBytes,
      options.label,
    );
    return text;
  }

  const decoder = new TextDecoder();
  const parts: string[] = [];
  let byteLength = 0;
  try {
    while (true) {
      throwIfMobileJapaneseLearningAborted(options.signal);
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      assertMobileJapaneseLearningByteLength(
        byteLength,
        options.maxBytes,
        options.label,
      );
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    throwIfMobileJapaneseLearningAborted(options.signal);
    return parts.join("");
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
}
