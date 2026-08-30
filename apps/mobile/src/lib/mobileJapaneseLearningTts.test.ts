import { describe, expect, test } from "bun:test";
import {
  MOBILE_TTS_DISK_CACHE_POLICY,
  MOBILE_TTS_MAX_EVENT_STREAM_BYTES,
  clearMobileJapaneseLearningTtsCache,
  createMobileTtsId,
  generateMobileJapaneseLearningTts,
  parseMobileTtsEventStream,
  wavBytesFromPcmChunks,
} from "./mobileJapaneseLearningTts";

describe("mobile Japanese Learning TTS", () => {
  test("keeps the native WAV cache within a deterministic mobile budget", () => {
    expect(MOBILE_TTS_DISK_CACHE_POLICY).toEqual({
      maxBytes: 128 * 1024 * 1024,
      maxEntries: 256,
      maxAgeMs: 30 * 24 * 60 * 60 * 1000,
      maxEntryBytes: 16 * 1024 * 1024,
    });
    expect(MOBILE_TTS_DISK_CACHE_POLICY.maxEntryBytes).toBeLessThanOrEqual(
      MOBILE_TTS_DISK_CACHE_POLICY.maxBytes,
    );
  });

  test("uses different cache ids for the same speech across accounts", () => {
    const first = createMobileTtsId("sentence", "私です", "profile:account-a");
    const second = createMobileTtsId("sentence", "私です", "profile:account-b");

    expect(first).not.toBe(second);
    expect(first).toContain("profile:account-a");
    expect(second).toContain("profile:account-b");
  });

  test("parses TTS event-stream audio chunks", () => {
    const chunks = parseMobileTtsEventStream(
      [
        `data: ${JSON.stringify({ audio_base64: "AQID" })}`,
        "",
        `data: ${JSON.stringify({ audio_base64: "BAU=" })}`,
      ].join("\n"),
    );

    expect(Array.from(chunks[0] ?? [])).toEqual([1, 2, 3]);
    expect(Array.from(chunks[1] ?? [])).toEqual([4, 5]);
  });

  test("accepts exact event/PCM limits and rejects the next byte before decoding", () => {
    const body = `data: ${JSON.stringify({ audio_base64: "AQID" })}`;
    const encodedBytes = new TextEncoder().encode(body).byteLength;

    expect(
      parseMobileTtsEventStream(body, {
        maxEventStreamBytes: encodedBytes,
        maxPcmBytes: 3,
      })[0]?.byteLength,
    ).toBe(3);
    expect(() =>
      parseMobileTtsEventStream(body, {
        maxEventStreamBytes: encodedBytes - 1,
        maxPcmBytes: 3,
      }),
    ).toThrow(/mobile safety limit/);
    expect(() =>
      parseMobileTtsEventStream(body, {
        maxEventStreamBytes: encodedBytes,
        maxPcmBytes: 2,
      }),
    ).toThrow(/mobile safety limit/);
  });

  test("wraps PCM chunks in a WAV header", () => {
    const wav = wavBytesFromPcmChunks([
      new Uint8Array([1, 0, 2, 0]),
      new Uint8Array([3, 0, 4, 0]),
    ]);

    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24000);
    expect(new DataView(wav.buffer).getUint16(22, true)).toBe(1);
    expect(new DataView(wav.buffer).getUint16(34, true)).toBe(16);
    expect(Array.from(wav.slice(44))).toEqual([1, 0, 2, 0, 3, 0, 4, 0]);
  });

  test("posts authenticated TTS requests and writes generated WAV bytes", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let written: { id: string; bytes: Uint8Array } | null = null;
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ audio_base64: "AQIDBA==" })}\n\n`,
          {
            status: 200,
          },
        ),
      );
    }) as typeof fetch;

    const result = await generateMobileJapaneseLearningTts("  私です  ", {
      fetchImpl,
      getAuthCookie: () => "; better-auth.session_token=token",
      readCachedWavFile: async () => null,
      siteUrl: "https://convex.example.site/",
      writeWavFile: async (id, bytes) => {
        written = { id, bytes };
        return `file://${id}.wav`;
      },
    });

    expect(result).toEqual({
      id: createMobileTtsId("sentence", "私です"),
      uri: `file://${createMobileTtsId("sentence", "私です")}.wav`,
    });
    expect(requests[0]?.url).toBe("https://convex.example.site/tts");
    expect(requests[0]?.init?.headers).toMatchObject({
      "content-type": "application/json",
      accept: "text/event-stream",
      "Better-Auth-Cookie": "; better-auth.session_token=token",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      text: "私です",
      skipTagging: false,
      source: "sentence",
    });
    expect(written).not.toBeNull();
    const finalWritten = written as unknown as {
      id: string;
      bytes: Uint8Array;
    };
    expect(finalWritten.id).toBe(createMobileTtsId("sentence", "私です"));
    expect(finalWritten.bytes.byteLength).toBeGreaterThan(44);
  });

  test("supports voice TTS requests for chat playback", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ audio_base64: "AQIDBA==" })}\n\n`,
          {
            status: 200,
          },
        ),
      );
    }) as typeof fetch;

    const result = await generateMobileJapaneseLearningTts("はい。", {
      fetchImpl,
      readCachedWavFile: async () => null,
      siteUrl: "https://convex.example.site/",
      source: "voice",
      writeWavFile: async (id) => `file://${id}.wav`,
    });

    expect(result.id).toBe(createMobileTtsId("voice", "はい。"));
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      text: "はい。",
      skipTagging: true,
      source: "voice",
    });
  });

  test("uses cached WAV files before requesting TTS", async () => {
    let fetchCount = 0;
    let writeCount = 0;
    const result = await generateMobileJapaneseLearningTts("はい。", {
      fetchImpl: (() => {
        fetchCount += 1;
        return Promise.resolve(new Response("", { status: 500 }));
      }) as unknown as typeof fetch,
      readCachedWavFile: async (id) => `file://cached/${id}.wav`,
      siteUrl: "https://convex.example.site/",
      source: "voice",
      writeWavFile: async () => {
        writeCount += 1;
        return "file://unexpected.wav";
      },
    });

    expect(result).toEqual({
      id: createMobileTtsId("voice", "はい。"),
      uri: `file://cached/${createMobileTtsId("voice", "はい。")}.wav`,
    });
    expect(fetchCount).toBe(0);
    expect(writeCount).toBe(0);
  });

  test("falls through to TTS generation when cache lookup fails", async () => {
    let fetchCount = 0;
    const fetchImpl = (() => {
      fetchCount += 1;
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ audio_base64: "AQIDBA==" })}\n\n`,
          {
            status: 200,
          },
        ),
      );
    }) as unknown as typeof fetch;

    const result = await generateMobileJapaneseLearningTts("はい。", {
      fetchImpl,
      readCachedWavFile: async () => {
        throw new Error("cache unavailable");
      },
      siteUrl: "https://convex.example.site/",
      source: "voice",
      writeWavFile: async (id) => `file://${id}.wav`,
    });

    expect(result).toEqual({
      id: createMobileTtsId("voice", "はい。"),
      uri: `file://${createMobileTtsId("voice", "はい。")}.wav`,
    });
    expect(fetchCount).toBe(1);
  });

  test("coalesces concurrent TTS generation for the same mobile cache id", async () => {
    let fetchCount = 0;
    let writeCount = 0;
    const fetchImpl = (() => {
      fetchCount += 1;
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ audio_base64: "AQIDBA==" })}\n\n`,
          {
            status: 200,
          },
        ),
      );
    }) as unknown as typeof fetch;

    const [first, second] = await Promise.all([
      generateMobileJapaneseLearningTts("はい。", {
        fetchImpl,
        readCachedWavFile: async () => null,
        siteUrl: "https://convex.example.site/",
        source: "voice",
        writeWavFile: async (id) => {
          writeCount += 1;
          return `file://${id}.wav`;
        },
      }),
      generateMobileJapaneseLearningTts("はい。", {
        fetchImpl,
        readCachedWavFile: async () => null,
        siteUrl: "https://convex.example.site/",
        source: "voice",
        writeWavFile: async (id) => {
          writeCount += 1;
          return `file://${id}.wav`;
        },
      }),
    ]);

    expect(first).toEqual(second);
    expect(fetchCount).toBe(1);
    expect(writeCount).toBe(1);
  });

  test("one Reader consumer cannot abort a shared TTS generation still in use", async () => {
    const firstOwner = new AbortController();
    const secondOwner = new AbortController();
    const fetchStarted = Promise.withResolvers<void>();
    const responseReady = Promise.withResolvers<Response>();
    const requestSignals: AbortSignal[] = [];
    let fetchCount = 0;
    let writeCount = 0;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      fetchCount += 1;
      requestSignals.push(init?.signal as AbortSignal);
      fetchStarted.resolve();
      return responseReady.promise;
    }) as typeof fetch;
    const options = {
      fetchImpl,
      readCachedWavFile: async () => null,
      siteUrl: "https://convex.example.site/",
      source: "voice" as const,
      writeWavFile: async (id: string) => {
        writeCount += 1;
        return `file://${id}.wav`;
      },
    };

    const first = generateMobileJapaneseLearningTts("shared owner", {
      ...options,
      signal: firstOwner.signal,
    });
    const second = generateMobileJapaneseLearningTts("shared owner", {
      ...options,
      signal: secondOwner.signal,
    });
    await fetchStarted.promise;
    firstOwner.abort(new Error("First Reader left"));

    await expect(first).rejects.toThrow("First Reader left");
    expect(requestSignals[0]?.aborted).toBe(false);
    responseReady.resolve(
      new Response(
        `data: ${JSON.stringify({ audio_base64: "AQIDBA==" })}\n\n`,
        { status: 200 },
      ),
    );
    await expect(second).resolves.toMatchObject({ uri: expect.any(String) });
    expect(fetchCount).toBe(1);
    expect(writeCount).toBe(1);
  });

  test("rejects an oversized response from headers before decoding or writing", async () => {
    let writeCount = 0;
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(`data: ${JSON.stringify({ audio_base64: "AQID" })}\n\n`, {
          status: 200,
          headers: {
            "content-length": String(MOBILE_TTS_MAX_EVENT_STREAM_BYTES + 1),
          },
        }),
      )) as unknown as typeof fetch;

    await expect(
      generateMobileJapaneseLearningTts("oversized", {
        fetchImpl,
        readCachedWavFile: async () => null,
        siteUrl: "https://convex.example.site/",
        writeWavFile: async () => {
          writeCount += 1;
          return "file://unexpected.wav";
        },
      }),
    ).rejects.toThrow(/mobile safety limit/);
    expect(writeCount).toBe(0);
  });

  test("a cache clear invalidates an in-flight response before it can write back", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    let markFetchStarted: (() => void) | undefined;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    let writeCount = 0;
    const fetchImpl = (() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
        markFetchStarted?.();
      })) as unknown as typeof fetch;
    const pending = generateMobileJapaneseLearningTts("pending clear", {
      fetchImpl,
      readCachedWavFile: async () => null,
      siteUrl: "https://convex.example.site/",
      writeWavFile: async () => {
        writeCount += 1;
        return "file://unexpected.wav";
      },
    });
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );

    await fetchStarted;
    await clearMobileJapaneseLearningTtsCache();
    resolveFetch?.(
      new Response(`data: ${JSON.stringify({ audio_base64: "AQID" })}\n\n`, {
        status: 200,
      }),
    );

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/cancelled/);
    expect(writeCount).toBe(0);
  });

  test("an owning Reader abort cancels an in-flight TTS request", async () => {
    const owner = new AbortController();
    const fetchStarted = Promise.withResolvers<void>();
    const requestSignals: AbortSignal[] = [];
    let writeCount = 0;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      const requestSignal = init?.signal as AbortSignal;
      requestSignals.push(requestSignal);
      fetchStarted.resolve();
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason ?? new Error("aborted")),
          { once: true },
        );
      });
    }) as typeof fetch;

    const pending = generateMobileJapaneseLearningTts("leave reader", {
      fetchImpl,
      readCachedWavFile: async () => null,
      signal: owner.signal,
      siteUrl: "https://convex.example.site/",
      writeWavFile: async () => {
        writeCount += 1;
        return "file://unexpected.wav";
      },
    });
    await fetchStarted.promise;
    owner.abort(new Error("Reader unmounted"));

    await expect(pending).rejects.toThrow("Reader unmounted");
    expect(requestSignals[0]?.aborted).toBe(true);
    expect(writeCount).toBe(0);
  });
});
