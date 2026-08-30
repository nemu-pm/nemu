import type { AppLanguage, ChapterSummary } from "@/data/schema";
import type { MobileReaderPluginState } from "@/lib/mobileReaderPlugins";
import { getExplainPrompt, getGreetingPrompt } from "@nemu/core";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";
import { createMobileJapaneseLearningAbortScope } from "./mobileJapaneseLearningLifecycle";
import {
  assertMobileJapaneseLearningByteLength,
  assertMobileJapaneseLearningCount,
  assertMobileJapaneseLearningStringLength,
  assertMobileJapaneseLearningUtf8ByteLength,
  awaitMobileJapaneseLearningAbortable,
  readMobileJapaneseLearningBoundedResponseText,
  throwIfMobileJapaneseLearningAborted,
} from "./mobileJapaneseLearningSafety";

export type MobileJapaneseLearningChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: MobileJapaneseLearningChatToolCall[];
    }
  | { role: "tool"; toolResults: MobileJapaneseLearningChatToolResult[] };

export type MobileJapaneseLearningChatToolCall = {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type MobileJapaneseLearningChatToolResult = {
  toolCallId: string;
  toolName: string;
  result: string;
  isError?: boolean;
};

export type MobileJapaneseLearningHiddenContext = {
  mangaTitle: string;
  mangaGenres?: string[];
  chapterTitle?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  currentPage: number;
  pageCount?: number;
  pageTranscript?: string;
  ephemeralContext?: string;
  responseMode?: "app" | "jlpt";
};

export type MobileJapaneseLearningChatResult = {
  kind?: "text" | "voice";
  text: string;
  suggestions: string[];
  ttsText?: string;
};

export type MobileJapaneseLearningChatStreamCallbacks = {
  onStreamStart?: () => void;
  onText?: (text: string) => void;
  onSpeak?: (text: string) => void;
  onVoice?: (text: string) => void;
  onToolCall?: (toolCall: MobileJapaneseLearningChatToolCall) => void;
  onToolsAwaiting?: (
    toolCalls: MobileJapaneseLearningChatToolCall[],
    partialContent: string,
  ) => void;
  onToolResults?: (toolResults: MobileJapaneseLearningChatToolResult[]) => void;
  onFollowups?: (suggestions: string[]) => void;
  onActivity?: (
    activity: MobileChatStreamEvent["activity"],
    toolName?: string,
  ) => void;
  onContextSnapshot?: (key: string, content: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
};

export type MobileJapaneseLearningExplainKind = "sentence" | "word" | "words";

export type MobileJapaneseLearningChatOptions = {
  appLanguage: AppLanguage;
  callbacks?: MobileJapaneseLearningChatStreamCallbacks;
  chapter: ChapterSummary;
  ephemeralContext?: string;
  executeTool?: (
    toolCall: MobileJapaneseLearningChatToolCall,
    options?: { signal: AbortSignal },
  ) => Promise<MobileJapaneseLearningChatToolResult>;
  fetchImpl?: typeof fetch;
  getAuthCookie?: () => string;
  mangaGenres?: string[];
  mangaTitle: string;
  messages?: MobileJapaneseLearningChatMessage[];
  pageCount: number;
  pageNumber: number;
  plugin?: MobileReaderPluginState | null;
  prompt?: string;
  siteUrl?: string | null;
  signal?: AbortSignal;
  transcript?: string;
};

type MobileChatStreamEvent = {
  type?: string;
  content?: string;
  key?: string;
  error?: string;
  code?: string;
  suggestions?: string[];
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  toolCalls?: MobileJapaneseLearningChatToolCall[];
  partialContent?: string;
  activity?: "llm" | "client_tools";
  activityToolName?: string;
};

type MobileChatContextSnapshot = {
  key: string;
  content: string;
};

type MobileJapaneseLearningParsedChatResponse = MobileJapaneseLearningChatResult & {
  contextSnapshots: MobileChatContextSnapshot[];
  partialContent: string;
  toolCalls: MobileJapaneseLearningChatToolCall[];
};

type MobileJapaneseLearningChatAccumulator = {
  contextSnapshots: MobileChatContextSnapshot[];
  error: string | null;
  kind?: "text" | "voice";
  partialContent: string;
  suggestions: string[];
  text: string;
  toolCalls: MobileJapaneseLearningChatToolCall[];
  ttsText: string;
  eventCount: number;
};

const AUDIO_TAG_REGEX = /\[[^\]]+\]/g;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_MESSAGES = 64;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS = 32 * 1024;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_CHARACTERS = 256 * 1024;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES = 512 * 1024;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_OUTPUT_CHARACTERS = 512 * 1024;
export const MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS = 4_096;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_BUFFER_CHARACTERS = 256 * 1024;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_SUGGESTIONS = 16;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_SUGGESTION_CHARACTERS = 512;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_TOOL_CALLS = 16;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_CONTEXT_SNAPSHOTS = 16;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_CONTEXT_CHARACTERS = 128 * 1024;
const MOBILE_JAPANESE_LEARNING_CHAT_MAX_ERROR_RESPONSE_BYTES = 64 * 1024;

export class MobileJapaneseLearningChatContextTooLongError extends Error {
  code = "context_too_long" as const;
  tokenBudget?: number;
  estimatedTokens?: number;
  suggestedClientAction?: string;

  constructor(details?: {
    tokenBudget?: number;
    estimatedTokens?: number;
    suggestedClientAction?: string;
  }) {
    super("context_too_long");
    this.name = "MobileJapaneseLearningChatContextTooLongError";
    this.tokenBudget = details?.tokenBudget;
    this.estimatedTokens = details?.estimatedTokens;
    this.suggestedClientAction = details?.suggestedClientAction;
  }
}

function normalizeBaseUrl(value: string | null | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("Nemu Chat is not configured.");
  return trimmed;
}

function getMobileAuthHeaders(getAuthCookie?: () => string): Record<string, string> {
  const cookie = getAuthCookie?.();
  return cookie ? { "Better-Auth-Cookie": cookie } : {};
}

export function assertMobileJapaneseLearningChatRequestByteLength(
  byteLength: number,
): void {
  assertMobileJapaneseLearningByteLength(
    byteLength,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES,
    "Nemu Chat request",
  );
}

export function assertMobileJapaneseLearningChatResponseByteLength(
  byteLength: number,
): void {
  assertMobileJapaneseLearningByteLength(
    byteLength,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES,
    "Nemu Chat response",
  );
}

function mobileJapaneseLearningChatMessageCharacters(
  message: MobileJapaneseLearningChatMessage,
): number {
  if (message.role === "tool") {
    assertMobileJapaneseLearningCount(
      message.toolResults.length,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_TOOL_CALLS,
      "Nemu Chat tool results",
    );
    return message.toolResults.reduce(
      (total, result) =>
        total +
        result.toolCallId.length +
        result.toolName.length +
        result.result.length,
      0,
    );
  }
  let characters = message.content.length;
  if (message.role === "assistant" && message.toolCalls) {
    assertMobileJapaneseLearningCount(
      message.toolCalls.length,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_TOOL_CALLS,
      "Nemu Chat tool calls",
    );
    for (const toolCall of message.toolCalls) {
      const serializedArguments = JSON.stringify(toolCall.args) ?? "";
      characters +=
        toolCall.toolCallId.length +
        toolCall.toolName.length +
        serializedArguments.length;
    }
  }
  return characters;
}

export function limitMobileJapaneseLearningChatHistory(
  messages: MobileJapaneseLearningChatMessage[],
): MobileJapaneseLearningChatMessage[] {
  const limited =
    messages.length > MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_MESSAGES
      ? messages.slice(-MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_MESSAGES)
      : messages;
  let aggregateCharacters = 0;
  for (const message of limited) {
    const characters = mobileJapaneseLearningChatMessageCharacters(message);
    assertMobileJapaneseLearningCount(
      characters,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
      "Nemu Chat message",
    );
    aggregateCharacters += characters;
    assertMobileJapaneseLearningCount(
      aggregateCharacters,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_HISTORY_CHARACTERS,
      "Nemu Chat history",
    );
  }
  return limited;
}

function boundedMobileJapaneseLearningSuggestions(
  value: unknown,
): string[] {
  const suggestions = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  assertMobileJapaneseLearningCount(
    suggestions.length,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_SUGGESTIONS,
    "Nemu Chat suggestions",
  );
  for (const suggestion of suggestions) {
    assertMobileJapaneseLearningStringLength(
      suggestion,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_SUGGESTION_CHARACTERS,
      "Nemu Chat suggestion",
    );
  }
  return suggestions;
}

function assertMobileJapaneseLearningChatOutputLength(
  value: string,
  label: string,
): void {
  assertMobileJapaneseLearningStringLength(
    value,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_OUTPUT_CHARACTERS,
    label,
  );
}

export function stripMobileJapaneseLearningAudioTags(text: string): string {
  return text.replace(AUDIO_TAG_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

export function parseMobileJapaneseLearningResponseMode(
  value: unknown,
): "app" | "jlpt" | undefined {
  return value === "app" || value === "jlpt" ? value : undefined;
}

/**
 * Explain-prompt builder. Delegates to the shared `@nemu/core` builder so mobile
 * and web produce identical explain prompts. `AppLanguage` ("en"/"zh"/"ja") maps
 * 1:1 onto `resolvePromptLocale`'s output, so behavior is unchanged.
 */
export function getMobileJapaneseLearningExplainPrompt(
  appLanguage: AppLanguage,
  responseMode: "app" | "jlpt" | undefined,
  kind: MobileJapaneseLearningExplainKind,
  text: string,
): string {
  return getExplainPrompt(appLanguage, responseMode, kind, text);
}

export function canRunMobileJapaneseLearningChatAction(
  chatLoading: boolean,
  ocrLoading: boolean,
): boolean {
  return !chatLoading && !ocrLoading;
}

export function canSendMobileJapaneseLearningChatInput(
  input: string,
  canRunChat: boolean,
): boolean {
  return canRunChat && input.trim().length > 0;
}

export function buildMobileJapaneseLearningHiddenContext(
  options: Pick<
    MobileJapaneseLearningChatOptions,
    | "chapter"
    | "ephemeralContext"
    | "mangaGenres"
    | "mangaTitle"
    | "pageCount"
    | "pageNumber"
    | "plugin"
    | "transcript"
  >,
): MobileJapaneseLearningHiddenContext {
  const context: MobileJapaneseLearningHiddenContext = {
    mangaTitle: options.mangaTitle,
    mangaGenres: options.mangaGenres,
    chapterTitle: options.chapter.title,
    chapterNumber: options.chapter.chapterNumber,
    volumeNumber: options.chapter.volumeNumber,
    currentPage: options.pageNumber,
    pageCount: options.pageCount,
    pageTranscript: options.transcript?.trim() || undefined,
    ephemeralContext: options.ephemeralContext?.trim() || undefined,
    responseMode: parseMobileJapaneseLearningResponseMode(
      options.plugin?.values.nemuResponseMode,
    ),
  };
  for (const [label, value] of [
    ["manga title", context.mangaTitle],
    ["chapter title", context.chapterTitle],
    ["page transcript", context.pageTranscript],
    ["ephemeral context", context.ephemeralContext],
  ] as const) {
    if (!value) continue;
    assertMobileJapaneseLearningStringLength(
      value,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_CONTEXT_CHARACTERS,
      `Nemu Chat ${label}`,
    );
  }
  assertMobileJapaneseLearningCount(
    context.mangaGenres?.length ?? 0,
    64,
    "Nemu Chat manga genres",
  );
  for (const genre of context.mangaGenres ?? []) {
    assertMobileJapaneseLearningStringLength(
      genre,
      1_024,
      "Nemu Chat manga genre",
    );
  }
  return context;
}

export function parseMobileJapaneseLearningChatResponse(
  body: string,
): MobileJapaneseLearningChatResult {
  const { kind, text, suggestions, ttsText } =
    parseMobileJapaneseLearningChatResponseInternal(body);
  return {
    ...(kind ? { kind } : {}),
    text,
    suggestions,
    ...(ttsText ? { ttsText } : {}),
  };
}

function isMobileJapaneseLearningChatToolCall(
  value: unknown,
): value is MobileJapaneseLearningChatToolCall {
  const toolCall = value as Partial<MobileJapaneseLearningChatToolCall>;
  return (
    typeof toolCall.toolCallId === "string" &&
    toolCall.toolCallId.trim().length > 0 &&
    typeof toolCall.toolName === "string" &&
    toolCall.toolName.trim().length > 0 &&
    !!toolCall.args &&
    typeof toolCall.args === "object"
  );
}

function createMobileJapaneseLearningChatAccumulator(): MobileJapaneseLearningChatAccumulator {
  return {
    contextSnapshots: [],
    error: null,
    partialContent: "",
    suggestions: [],
    text: "",
    toolCalls: [],
    ttsText: "",
    eventCount: 0,
  };
}

function boundedMobileJapaneseLearningToolCalls(
  value: unknown,
): MobileJapaneseLearningChatToolCall[] {
  const toolCalls = Array.isArray(value)
    ? value.filter(isMobileJapaneseLearningChatToolCall)
    : [];
  assertMobileJapaneseLearningCount(
    toolCalls.length,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_TOOL_CALLS,
    "Nemu Chat tool calls",
  );
  for (const toolCall of toolCalls) {
    assertMobileJapaneseLearningStringLength(
      toolCall.toolCallId,
      512,
      "Nemu Chat tool call id",
    );
    assertMobileJapaneseLearningStringLength(
      toolCall.toolName,
      512,
      "Nemu Chat tool name",
    );
    assertMobileJapaneseLearningStringLength(
      JSON.stringify(toolCall.args) ?? "",
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
      "Nemu Chat tool arguments",
    );
  }
  return toolCalls;
}

function boundedMobileJapaneseLearningToolResults(
  value: unknown[],
): MobileJapaneseLearningChatToolResult[] {
  const toolResults = value.filter(
    (result): result is MobileJapaneseLearningChatToolResult => {
      const candidate = result as Partial<MobileJapaneseLearningChatToolResult>;
      return (
        typeof candidate.toolCallId === "string" &&
        typeof candidate.toolName === "string" &&
        typeof candidate.result === "string"
      );
    },
  );
  assertMobileJapaneseLearningCount(
    toolResults.length,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_TOOL_CALLS,
    "Nemu Chat tool results",
  );
  for (const result of toolResults) {
    assertMobileJapaneseLearningStringLength(
      result.toolCallId,
      512,
      "Nemu Chat tool result id",
    );
    assertMobileJapaneseLearningStringLength(
      result.toolName,
      512,
      "Nemu Chat tool result name",
    );
    assertMobileJapaneseLearningStringLength(
      result.result,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
      "Nemu Chat tool result",
    );
  }
  return toolResults;
}

function mobileJapaneseLearningContextTooLongErrorFromBody(
  body: string,
): MobileJapaneseLearningChatContextTooLongError | null {
  try {
    const parsed = JSON.parse(body) as {
      code?: string;
      error?: string;
      tokenBudget?: number;
      estimatedTokens?: number;
      suggestedClientAction?: string;
    };
    if (parsed.code !== "context_too_long" && parsed.error !== "context_too_long") {
      return null;
    }
    return new MobileJapaneseLearningChatContextTooLongError({
      tokenBudget: parsed.tokenBudget,
      estimatedTokens: parsed.estimatedTokens,
      suggestedClientAction: parsed.suggestedClientAction,
    });
  } catch {
    return null;
  }
}

function applyMobileJapaneseLearningChatStreamEvent(
  event: MobileChatStreamEvent,
  accumulator: MobileJapaneseLearningChatAccumulator,
  callbacks?: MobileJapaneseLearningChatStreamCallbacks,
) {
  accumulator.eventCount += 1;
  assertMobileJapaneseLearningCount(
    accumulator.eventCount,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS,
    "Nemu Chat stream events",
  );
  if (event.type === "text") {
    const content = event.content ?? "";
    accumulator.text += content;
    assertMobileJapaneseLearningChatOutputLength(
      accumulator.text,
      "Nemu Chat text",
    );
    callbacks?.onText?.(content);
    return;
  }
  if (event.type === "speak") {
    const content = event.content ?? "";
    accumulator.text += content;
    assertMobileJapaneseLearningChatOutputLength(
      accumulator.text,
      "Nemu Chat text",
    );
    callbacks?.onSpeak?.(content);
    return;
  }
  if (event.type === "voice") {
    const content = event.content ?? "";
    accumulator.text += stripMobileJapaneseLearningAudioTags(content);
    accumulator.ttsText += content;
    assertMobileJapaneseLearningChatOutputLength(
      accumulator.text,
      "Nemu Chat text",
    );
    assertMobileJapaneseLearningChatOutputLength(
      accumulator.ttsText,
      "Nemu Chat TTS text",
    );
    accumulator.kind = "voice";
    callbacks?.onVoice?.(content);
    return;
  }
  if (event.type === "tool_call") {
    if (event.toolCallId && event.toolName) {
      const [toolCall] = boundedMobileJapaneseLearningToolCalls([{
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args ?? {},
      }]);
      if (toolCall) callbacks?.onToolCall?.(toolCall);
    }
    return;
  }
  if (event.type === "followups") {
    accumulator.suggestions = boundedMobileJapaneseLearningSuggestions(
      event.suggestions,
    );
    callbacks?.onFollowups?.(accumulator.suggestions);
    return;
  }
  if (event.type === "context_snapshot") {
    if (typeof event.key === "string" && typeof event.content === "string") {
      const snapshot = {
        key: event.key,
        content: event.content,
      };
      assertMobileJapaneseLearningCount(
        accumulator.contextSnapshots.length + 1,
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_CONTEXT_SNAPSHOTS,
        "Nemu Chat context snapshots",
      );
      assertMobileJapaneseLearningStringLength(
        snapshot.content,
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_CONTEXT_CHARACTERS,
        "Nemu Chat context snapshot",
      );
      accumulator.contextSnapshots.push(snapshot);
      callbacks?.onContextSnapshot?.(snapshot.key, snapshot.content);
    }
    return;
  }
  if (event.type === "awaiting_tool_results") {
    accumulator.toolCalls = boundedMobileJapaneseLearningToolCalls(
      event.toolCalls,
    );
    accumulator.partialContent =
      typeof event.partialContent === "string" ? event.partialContent : "";
    assertMobileJapaneseLearningChatOutputLength(
      accumulator.partialContent,
      "Nemu Chat partial content",
    );
    callbacks?.onToolsAwaiting?.(accumulator.toolCalls, accumulator.partialContent);
    return;
  }
  if (event.type === "activity") {
    callbacks?.onActivity?.(event.activity, event.activityToolName);
    return;
  }
  if (event.type === "error") {
    if (event.code === "context_too_long" || event.error === "context_too_long") {
      throw new MobileJapaneseLearningChatContextTooLongError();
    }
    accumulator.error = event.error || "Nemu Chat failed.";
    assertMobileJapaneseLearningStringLength(
      accumulator.error,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
      "Nemu Chat error",
    );
    callbacks?.onError?.(accumulator.error);
    return;
  }
  if (event.type === "done") {
    callbacks?.onDone?.();
  }
}

function applyMobileJapaneseLearningChatSseBlock(
  block: string,
  accumulator: MobileJapaneseLearningChatAccumulator,
  callbacks?: MobileJapaneseLearningChatStreamCallbacks,
) {
  assertMobileJapaneseLearningStringLength(
    block,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_BUFFER_CHARACTERS,
    "Nemu Chat stream event",
  );
  const payload = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .join("\n");
  if (!payload) return;
  assertMobileJapaneseLearningStringLength(
    payload,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_BUFFER_CHARACTERS,
    "Nemu Chat stream payload",
  );
  const event = JSON.parse(payload) as MobileChatStreamEvent;
  applyMobileJapaneseLearningChatStreamEvent(event, accumulator, callbacks);
}

function finalizeMobileJapaneseLearningChatAccumulator(
  accumulator: MobileJapaneseLearningChatAccumulator,
): MobileJapaneseLearningParsedChatResponse {
  assertMobileJapaneseLearningChatOutputLength(
    accumulator.text,
    "Nemu Chat text",
  );
  if (accumulator.error) throw new Error(accumulator.error);
  const normalizedText = accumulator.text.trim();
  if (!normalizedText && accumulator.toolCalls.length === 0) {
    throw new Error("Nemu Chat response did not include text.");
  }
  return {
    kind: accumulator.kind,
    text: normalizedText,
    suggestions: accumulator.suggestions,
    ttsText: accumulator.ttsText.trim() || undefined,
    contextSnapshots: accumulator.contextSnapshots,
    partialContent: accumulator.partialContent,
    toolCalls: accumulator.toolCalls,
  };
}

function parseMobileJapaneseLearningChatResponseInternal(
  body: string,
  callbacks?: MobileJapaneseLearningChatStreamCallbacks,
): MobileJapaneseLearningParsedChatResponse {
  assertMobileJapaneseLearningUtf8ByteLength(
    body,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES,
    "Nemu Chat response",
  );
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Nemu Chat response was empty.");

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as {
      text?: string;
      content?: string;
      suggestions?: unknown;
    };
    const text = (parsed.text ?? parsed.content ?? "").trim();
    if (!text) throw new Error("Nemu Chat response did not include text.");
    assertMobileJapaneseLearningChatOutputLength(text, "Nemu Chat text");
    const suggestions = boundedMobileJapaneseLearningSuggestions(
      parsed.suggestions,
    );
    callbacks?.onText?.(text);
    callbacks?.onFollowups?.(suggestions);
    callbacks?.onDone?.();
    return {
      text,
      suggestions,
      contextSnapshots: [],
      partialContent: "",
      toolCalls: [],
    };
  }

  const accumulator = createMobileJapaneseLearningChatAccumulator();

  const blocks = trimmed.split(/\n\n+/);
  assertMobileJapaneseLearningCount(
    blocks.length,
    MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_EVENTS,
    "Nemu Chat stream events",
  );
  for (const block of blocks) {
    applyMobileJapaneseLearningChatSseBlock(block, accumulator, callbacks);
  }

  return finalizeMobileJapaneseLearningChatAccumulator(accumulator);
}

function applyMobileChatContextSnapshots(
  messages: MobileJapaneseLearningChatMessage[],
  snapshots: MobileChatContextSnapshot[],
): MobileJapaneseLearningChatMessage[] {
  let nextMessages = messages;
  for (const snapshot of snapshots) {
    if (!snapshot.content.trim()) continue;
    const last = nextMessages[nextMessages.length - 1];
    if (last?.role === "user") {
      nextMessages = [
        ...nextMessages.slice(0, -1),
        { role: "user", content: snapshot.content },
        last,
      ];
    } else {
      nextMessages = [...nextMessages, { role: "user", content: snapshot.content }];
    }
  }
  return limitMobileJapaneseLearningChatHistory(nextMessages);
}

async function readMobileJapaneseLearningChatResponse(
  response: Response,
  callbacks?: MobileJapaneseLearningChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<MobileJapaneseLearningParsedChatResponse> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength)) {
    assertMobileJapaneseLearningChatResponseByteLength(declaredLength);
  }
  throwIfMobileJapaneseLearningAborted(signal);
  const body = response.body;
  const contentType = response.headers.get("content-type") ?? "";
  const canDecodeStream = typeof TextDecoder !== "undefined";
  const reader =
    contentType.includes("application/json") || !body || !canDecodeStream
      ? null
      : body.getReader?.();

  if (!reader) {
    return parseMobileJapaneseLearningChatResponseInternal(
      await readMobileJapaneseLearningBoundedResponseText(response, {
        maxBytes: MOBILE_JAPANESE_LEARNING_CHAT_MAX_RESPONSE_BYTES,
        label: "Nemu Chat response",
        signal,
      }),
      callbacks,
    );
  }

  const decoder = new TextDecoder();
  const accumulator = createMobileJapaneseLearningChatAccumulator();
  let buffer = "";
  let byteLength = 0;

  try {
    while (true) {
      throwIfMobileJapaneseLearningAborted(signal);
      const { done, value } = await awaitMobileJapaneseLearningAbortable(
        reader.read(),
        signal,
      );
      if (done) break;
      byteLength += value.byteLength;
      assertMobileJapaneseLearningChatResponseByteLength(byteLength);
      buffer += decoder.decode(value, { stream: true });
      assertMobileJapaneseLearningStringLength(
        buffer,
        MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_BUFFER_CHARACTERS,
        "Nemu Chat stream buffer",
      );
      const blocks = buffer.split(/\n\n+/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        applyMobileJapaneseLearningChatSseBlock(block, accumulator, callbacks);
      }
    }

    buffer += decoder.decode();
    assertMobileJapaneseLearningStringLength(
      buffer,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_STREAM_BUFFER_CHARACTERS,
      "Nemu Chat stream buffer",
    );
    if (buffer.trim()) {
      applyMobileJapaneseLearningChatSseBlock(buffer, accumulator, callbacks);
    }

    throwIfMobileJapaneseLearningAborted(signal);
    return finalizeMobileJapaneseLearningChatAccumulator(accumulator);
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  }
}

async function assertMobileJapaneseLearningChatResponseOk(
  response: Response,
  signal?: AbortSignal,
) {
  if (response.ok) return;
  if (response.status === 401) {
    throw new Error("auth_required");
  }
  const body = await readMobileJapaneseLearningBoundedResponseText(response, {
    maxBytes: MOBILE_JAPANESE_LEARNING_CHAT_MAX_ERROR_RESPONSE_BYTES,
    label: "Nemu Chat error response",
    signal,
  });
  const contextTooLongError = mobileJapaneseLearningContextTooLongErrorFromBody(body);
  if (contextTooLongError) throw contextTooLongError;
  throw new Error(`Nemu Chat failed: ${response.status} ${response.statusText}`);
}

function truncateMobileJapaneseLearningChatMessagesForRetry(
  messages: MobileJapaneseLearningChatMessage[],
): MobileJapaneseLearningChatMessage[] {
  if (messages.length <= 2) return messages;
  return messages.slice(Math.ceil(messages.length / 2));
}

export async function runMobileJapaneseLearningChat(
  options: MobileJapaneseLearningChatOptions,
): Promise<MobileJapaneseLearningChatResult> {
  const abortScope = createMobileJapaneseLearningAbortScope(options.signal);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const hiddenContext = buildMobileJapaneseLearningHiddenContext(options);
    const prompt =
      options.prompt?.trim() ||
      getGreetingPrompt(options.appLanguage, hiddenContext.responseMode);
    assertMobileJapaneseLearningStringLength(
      prompt,
      MOBILE_JAPANESE_LEARNING_CHAT_MAX_MESSAGE_CHARACTERS,
      "Nemu Chat prompt",
    );
    const messages = limitMobileJapaneseLearningChatHistory(
      options.messages && options.messages.length > 0
        ? options.messages
        : [{ role: "user" as const, content: prompt }],
    );
    const baseUrl = normalizeBaseUrl(options.siteUrl ?? mobileSyncConfig.siteUrl);
    let requestMessages = messages;
    const textParts: string[] = [];
    let textCharacters = 0;
    let lastKind: "text" | "voice" | undefined;
    let lastSuggestions: string[] = [];
    let lastTtsText: string | undefined;
    let retriedContextTooLong = false;

    options.callbacks?.onStreamStart?.();

    for (let round = 0; round < 4; round += 1) {
      abortScope.throwIfAborted();
      let parsed: MobileJapaneseLearningParsedChatResponse;
      try {
        const requestBody = JSON.stringify({
          messages: requestMessages,
          hiddenContext,
          appLanguage: options.appLanguage,
        });
        assertMobileJapaneseLearningUtf8ByteLength(
          requestBody,
          MOBILE_JAPANESE_LEARNING_CHAT_MAX_REQUEST_BYTES,
          "Nemu Chat request",
        );
        const response = await awaitMobileJapaneseLearningAbortable(
          fetchImpl(`${baseUrl}/nemu-chat`, {
            method: "POST",
            credentials: "omit",
            headers: {
              "content-type": "application/json",
              ...getMobileAuthHeaders(options.getAuthCookie),
            },
            body: requestBody,
            signal: abortScope.signal,
          }),
          abortScope.signal,
        );

        await assertMobileJapaneseLearningChatResponseOk(
          response,
          abortScope.signal,
        );
        parsed = await readMobileJapaneseLearningChatResponse(
          response,
          options.callbacks,
          abortScope.signal,
        );
      } catch (error) {
        if (
          error instanceof MobileJapaneseLearningChatContextTooLongError &&
          !retriedContextTooLong &&
          requestMessages.length > 2
        ) {
          requestMessages = limitMobileJapaneseLearningChatHistory(
            truncateMobileJapaneseLearningChatMessagesForRetry(requestMessages),
          );
          retriedContextTooLong = true;
          round -= 1;
          continue;
        }
        throw error;
      }

      if (parsed.text) {
        textCharacters += parsed.text.length;
        assertMobileJapaneseLearningCount(
          textCharacters,
          MOBILE_JAPANESE_LEARNING_CHAT_MAX_OUTPUT_CHARACTERS,
          "Nemu Chat aggregate output",
        );
        textParts.push(parsed.text);
      }
      if (parsed.kind) lastKind = parsed.kind;
      lastSuggestions = parsed.suggestions;
      lastTtsText = parsed.ttsText ?? lastTtsText;

      if (parsed.toolCalls.length === 0) {
        const text = textParts.join("\n\n").trim();
        assertMobileJapaneseLearningChatOutputLength(text, "Nemu Chat text");
        if (!text) throw new Error("Nemu Chat response did not include text.");
        const result: MobileJapaneseLearningChatResult = {
          text,
          suggestions: lastSuggestions,
        };
        if (lastKind) result.kind = lastKind;
        if (lastTtsText) result.ttsText = lastTtsText;
        return result;
      }

      const executeTool = options.executeTool;
      if (!executeTool) {
        throw new Error("Nemu Chat requested page tools that are unavailable.");
      }

      const toolResults = boundedMobileJapaneseLearningToolResults(
        await Promise.all(
          parsed.toolCalls.map(async (toolCall) => {
            abortScope.throwIfAborted();
            const result = await awaitMobileJapaneseLearningAbortable(
              executeTool(toolCall, { signal: abortScope.signal }),
              abortScope.signal,
            );
            abortScope.throwIfAborted();
            return result;
          }),
        ),
      );
      options.callbacks?.onToolResults?.(toolResults);
      requestMessages = limitMobileJapaneseLearningChatHistory([
        ...applyMobileChatContextSnapshots(
          requestMessages,
          parsed.contextSnapshots,
        ),
        {
          role: "assistant",
          content: parsed.partialContent || parsed.text,
          toolCalls: parsed.toolCalls,
        },
        {
          role: "tool",
          toolResults,
        },
      ]);
    }

    throw new Error("Nemu Chat requested too many tool rounds.");
  } finally {
    abortScope.dispose();
  }
}
