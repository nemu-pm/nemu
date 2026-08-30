import { describe, expect, test } from "bun:test";
import {
  MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_MESSAGES,
  MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
  MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES,
  MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES,
  MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS,
  assertMobileJapaneseLearningChatRequestByteLength,
  assertMobileJapaneseLearningChatResponseByteLength,
  buildMobileJapaneseLearningHiddenContext,
  canRunMobileJapaneseLearningChatAction,
  canSendMobileJapaneseLearningChatInput,
  getMobileJapaneseLearningExplainPrompt,
  limitMobileJapaneseLearningChatHistory,
  parseMobileJapaneseLearningChatResponse,
  runMobileJapaneseLearningChat,
} from "./mobileJapaneseLearningChat";

const chapter = {
  id: "chapter-1",
  title: "Chapter 1",
  chapterNumber: 1,
  volumeNumber: 2,
};

describe("mobile Japanese Learning chat", () => {
  test("accepts exact chat byte limits and rejects the next byte", () => {
    expect(() =>
      assertMobileJapaneseLearningChatRequestByteLength(
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningChatRequestByteLength(
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES + 1,
      ),
    ).toThrow("safety limit");
    expect(() =>
      assertMobileJapaneseLearningChatResponseByteLength(
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningChatResponseByteLength(
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES + 1,
      ),
    ).toThrow("safety limit");
  });

  test("bounds chat history and individual messages at exact limits", () => {
    const messages = Array.from(
      { length: MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_MESSAGES + 1 },
      (_, index) => ({ role: "user" as const, content: String(index) }),
    );
    expect(limitMobileJapaneseLearningChatHistory(messages)).toEqual(
      messages.slice(1),
    );
    expect(() =>
      limitMobileJapaneseLearningChatHistory([
        {
          role: "user",
          content: "x".repeat(
            MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
          ),
        },
      ]),
    ).not.toThrow();
    expect(() =>
      limitMobileJapaneseLearningChatHistory([
        {
          role: "user",
          content: "x".repeat(
            MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS + 1,
          ),
        },
      ]),
    ).toThrow("safety limit");
  });

  test("accepts the exact stream-event limit and rejects the next event", () => {
    const block = (index: number) =>
      `data: ${JSON.stringify({
        type:
          index === MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS - 1
            ? "text"
            : "activity",
        ...(index === MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS - 1
          ? { content: "ok" }
          : {}),
      })}`;
    const exact = Array.from(
      { length: MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS },
      (_, index) => block(index),
    ).join("\n\n");
    expect(parseMobileJapaneseLearningChatResponse(exact).text).toBe("ok");
    expect(() =>
      parseMobileJapaneseLearningChatResponse(
        `${exact}\n\ndata: ${JSON.stringify({ type: "done" })}`,
      ),
    ).toThrow("safety limit");
  });

  test("gates chat actions while chat or OCR work is loading", () => {
    expect(canRunMobileJapaneseLearningChatAction(false, false)).toBe(true);
    expect(canRunMobileJapaneseLearningChatAction(true, false)).toBe(false);
    expect(canRunMobileJapaneseLearningChatAction(false, true)).toBe(false);
  });

  test("enables composer send only for nonblank idle input", () => {
    expect(canSendMobileJapaneseLearningChatInput(" explain this ", true)).toBe(true);
    expect(canSendMobileJapaneseLearningChatInput("   ", true)).toBe(false);
    expect(canSendMobileJapaneseLearningChatInput("explain", false)).toBe(false);
  });

  test("builds hidden context from current reader state", () => {
    expect(
      buildMobileJapaneseLearningHiddenContext({
        chapter,
        mangaGenres: ["Drama"],
        mangaTitle: "Example Manga",
        pageCount: 24,
        pageNumber: 3,
        plugin: {
          id: "japanese-learning",
          name: "Japanese Learning",
          description: "",
          icon: "language-outline",
          defaultEnabled: true,
          builtin: true,
          enabled: true,
          settings: [],
          values: { nemuResponseMode: "jlpt" },
        },
        ephemeralContext: "私【わたし】 (Noun) = I; me",
        transcript: "  こんにちは  ",
      }),
    ).toEqual({
      mangaTitle: "Example Manga",
      mangaGenres: ["Drama"],
      chapterTitle: "Chapter 1",
      chapterNumber: 1,
      volumeNumber: 2,
      currentPage: 3,
      pageCount: 24,
      pageTranscript: "こんにちは",
      ephemeralContext: "私【わたし】 (Noun) = I; me",
      responseMode: "jlpt",
    });
  });

  test("builds localized explain prompts with JLPT mode forcing Japanese", () => {
    expect(getMobileJapaneseLearningExplainPrompt("en", "app", "word", "私")).toBe(
      "Explain this word: 「私」",
    );
    expect(getMobileJapaneseLearningExplainPrompt("zh", "app", "words", "私たち")).toBe(
      "请解释这些词：「私たち」",
    );
    expect(getMobileJapaneseLearningExplainPrompt("en", "jlpt", "sentence", "私は学生です")).toBe(
      "この文を説明して: 「私は学生です」",
    );
  });

  test("parses chat SSE text and follow-up events", () => {
    const result = parseMobileJapaneseLearningChatResponse(
      [
        `data: ${JSON.stringify({ type: "text", content: "一つ目。" })}`,
        "",
        `data: ${JSON.stringify({ type: "speak", content: "二つ目。" })}`,
        "",
        `data: ${JSON.stringify({ type: "followups", suggestions: ["文法は？"] })}`,
        "",
        `data: ${JSON.stringify({ type: "done" })}`,
      ].join("\n"),
    );

    expect(result).toEqual({
      text: "一つ目。二つ目。",
      suggestions: ["文法は？"],
    });
  });

  test("parses voice events with display text and raw TTS text", () => {
    const result = parseMobileJapaneseLearningChatResponse(
      [
        `data: ${JSON.stringify({ type: "voice", content: "[happy] こんにちは [pause]" })}`,
        "",
        `data: ${JSON.stringify({ type: "followups", suggestions: ["もう一度"] })}`,
      ].join("\n"),
    );

    expect(result).toEqual({
      kind: "voice",
      text: "こんにちは",
      ttsText: "[happy] こんにちは [pause]",
      suggestions: ["もう一度"],
    });
  });

  test("posts authenticated Nemu Chat requests to the Convex site URL", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "text", content: "読み取れました。" })}\n\n`,
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const result = await runMobileJapaneseLearningChat({
      appLanguage: "en",
      chapter,
      fetchImpl,
      getAuthCookie: () => "; better-auth.session_token=token",
      mangaTitle: "Example Manga",
      pageCount: 10,
      pageNumber: 4,
      siteUrl: "https://convex.example.site/",
      transcript: "テキスト",
    });

    expect(result.text).toBe("読み取れました。");
    expect(requests[0]?.url).toBe("https://convex.example.site/nemu-chat");
    expect(requests[0]?.init?.credentials).toBe("omit");
    expect(requests[0]?.init?.headers).toMatchObject({
      "content-type": "application/json",
      "Better-Auth-Cookie": "; better-auth.session_token=token",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      appLanguage: "en",
      hiddenContext: {
        currentPage: 4,
        mangaTitle: "Example Manga",
        pageTranscript: "テキスト",
      },
      messages: [{ role: "user", content: "Generate a brief, contextual greeting that references the current manga and invites questions." }],
    });
  });

  test("posts existing mobile chat history when provided", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "text", content: "もちろん。" })}\n\n`,
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    await runMobileJapaneseLearningChat({
      appLanguage: "en",
      chapter,
      fetchImpl,
      mangaTitle: "Example Manga",
      messages: [
        { role: "user", content: "Help me understand this manga page." },
        { role: "assistant", content: "This page introduces the speaker." },
        { role: "user", content: "What does this word mean?" },
      ],
      pageCount: 10,
      pageNumber: 4,
      siteUrl: "https://convex.example.site/",
      transcript: "テキスト",
    });

    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      messages: [
        { role: "user", content: "Help me understand this manga page." },
        { role: "assistant", content: "This page introduces the speaker." },
        { role: "user", content: "What does this word mean?" },
      ],
    });
  });

  test("executes requested page tools and continues the mobile chat stream", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      [
        `data: ${JSON.stringify({
          type: "context_snapshot",
          key: "reader",
          content: "Cached reader context",
        })}`,
        "",
        `data: ${JSON.stringify({
          type: "awaiting_tool_results",
          toolCalls: [
            {
              toolCallId: "tool-1",
              toolName: "request_transcript",
              args: { pageNumber: 5 },
            },
          ],
          partialContent: "",
        })}`,
      ].join("\n"),
      [
        `data: ${JSON.stringify({ type: "speak", content: "Page 5 says hello." })}`,
        "",
        `data: ${JSON.stringify({ type: "followups", suggestions: ["Explain grammar"] })}`,
        "",
        `data: ${JSON.stringify({ type: "done" })}`,
      ].join("\n"),
    ];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(new Response(responses.shift() ?? "", { status: 200 }));
    }) as typeof fetch;
    const toolCalls: Array<{ toolName: string; pageNumber: unknown }> = [];

    const result = await runMobileJapaneseLearningChat({
      appLanguage: "en",
      chapter,
      executeTool: async (toolCall) => {
        toolCalls.push({
          toolName: toolCall.toolName,
          pageNumber: toolCall.args.pageNumber,
        });
        return {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          result: "こんにちは",
        };
      },
      fetchImpl,
      mangaTitle: "Example Manga",
      pageCount: 10,
      pageNumber: 4,
      siteUrl: "https://convex.example.site/",
    });

    expect(result).toEqual({
      text: "Page 5 says hello.",
      suggestions: ["Explain grammar"],
    });
    expect(toolCalls).toEqual([
      { toolName: "request_transcript", pageNumber: 5 },
    ]);
    expect(requests).toHaveLength(2);
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({
      messages: [
        { role: "user", content: "Cached reader context" },
        { role: "user", content: "Generate a brief, contextual greeting that references the current manga and invites questions." },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              toolCallId: "tool-1",
              toolName: "request_transcript",
              args: { pageNumber: 5 },
            },
          ],
        },
        {
          role: "tool",
          toolResults: [
            {
              toolCallId: "tool-1",
              toolName: "request_transcript",
              result: "こんにちは",
            },
          ],
        },
      ],
    });
  });

  test("emits stream callbacks while returning the final chat result", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response(
          [
            `data: ${JSON.stringify({ type: "activity", activity: "llm" })}`,
            "",
            `data: ${JSON.stringify({ type: "text", content: "一つ" })}`,
            "",
            `data: ${JSON.stringify({ type: "speak", content: "二つ" })}`,
            "",
            `data: ${JSON.stringify({ type: "followups", suggestions: ["続けて"] })}`,
            "",
            `data: ${JSON.stringify({ type: "done" })}`,
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      )) as unknown as typeof fetch;
    const events: string[] = [];

    const result = await runMobileJapaneseLearningChat({
      appLanguage: "en",
      callbacks: {
        onActivity: (activity) => events.push(`activity:${activity}`),
        onText: (text) => events.push(`text:${text}`),
        onSpeak: (text) => events.push(`speak:${text}`),
        onFollowups: (suggestions) => events.push(`followups:${suggestions.join(",")}`),
        onDone: () => events.push("done"),
      },
      chapter,
      fetchImpl,
      mangaTitle: "Example Manga",
      pageCount: 10,
      pageNumber: 4,
      siteUrl: "https://convex.example.site/",
    });

    expect(result).toEqual({
      text: "一つ二つ",
      suggestions: ["続けて"],
    });
    expect(events).toEqual([
      "activity:llm",
      "text:一つ",
      "speak:二つ",
      "followups:続けて",
      "done",
    ]);
  });

  test("retries once with truncated history when chat context is too long", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      if (requests.length === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "context_too_long",
              tokenBudget: 100,
              estimatedTokens: 200,
              suggestedClientAction: "drop_oldest_half",
            }),
            {
              status: 400,
              statusText: "Bad Request",
              headers: { "content-type": "application/json" },
            },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          `data: ${JSON.stringify({ type: "text", content: "短くしました。" })}\n\n`,
          { status: 200 },
        ),
      );
    }) as typeof fetch;

    const result = await runMobileJapaneseLearningChat({
      appLanguage: "en",
      chapter,
      fetchImpl,
      mangaTitle: "Example Manga",
      messages: [
        { role: "user", content: "old user" },
        { role: "assistant", content: "old assistant" },
        { role: "user", content: "newer user" },
        { role: "assistant", content: "newer assistant" },
      ],
      pageCount: 10,
      pageNumber: 4,
      siteUrl: "https://convex.example.site/",
    });

    expect(result.text).toBe("短くしました。");
    expect(requests).toHaveLength(2);
    expect(JSON.parse(String(requests[1]?.init?.body)).messages).toEqual([
      { role: "user", content: "newer user" },
      { role: "assistant", content: "newer assistant" },
    ]);
  });

  test("surfaces sign-in errors from unauthorized chat requests", async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response("", { status: 401 }))) as unknown as typeof fetch;

    await expect(
      runMobileJapaneseLearningChat({
        appLanguage: "en",
        chapter,
        fetchImpl,
        mangaTitle: "Example Manga",
        pageCount: 1,
        pageNumber: 1,
        siteUrl: "https://convex.example.site",
      }),
    ).rejects.toThrow("auth_required");
  });

  test("cancels an in-flight chat request through the caller signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null = null;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      markFetchStarted();
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const pending = runMobileJapaneseLearningChat({
      appLanguage: "en",
      chapter,
      fetchImpl,
      mangaTitle: "Example Manga",
      pageCount: 1,
      pageNumber: 1,
      signal: controller.signal,
      siteUrl: "https://convex.example.site",
    });
    const rejection = pending.catch((error: unknown) => error);

    await fetchStarted;
    controller.abort(new Error("cancel chat"));

    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("cancel chat");
  });
});
