import type {
  MobileJapaneseLearningChatMessage,
  MobileJapaneseLearningChatStreamCallbacks,
  MobileJapaneseLearningChatToolCall,
  MobileJapaneseLearningChatToolResult,
} from "./mobileJapaneseLearningChat";

/**
 * Port of web Nemu Chat's stream pacing (`chat/actions.ts`
 * `createChatStreamCallbacks` at Tiger's 469f2315) and the thread helpers of
 * its store (`chat/store.ts`). Keep this a line-for-line mirror: the timings,
 * typing-indicator rules and bubble order are what the owner asked to keep.
 */

// Type-only import above keeps this module free of the network client, so the
// pure helpers stay importable from tests and the reader helpers.
const AUDIO_TAG_REGEX = /\[[^\]]+\]/g;

/** Web `stripAudioTags` (actions.ts). */
function stripAudioTags(text: string): string {
  return text.replace(AUDIO_TAG_REGEX, "").replace(/\s{2,}/g, " ").trim();
}

/** Web `onError` fallback for an empty or JSON-shaped error payload. */
export const MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR =
  "Network error. Please try again.";
/** Web `streamChat` 401 message (untranslated on web in every locale). */
export const MOBILE_JAPANESE_LEARNING_CHAT_SIGN_IN_ERROR =
  "Please sign in to use this feature";

/** Web gap between one speak bubble landing and the next being scheduled. */
export const MOBILE_JAPANESE_LEARNING_CHAT_SPEAK_GAP_MS = 350;
/** Web activity pulse: dots stay this long after the last backend activity. */
export const MOBILE_JAPANESE_LEARNING_CHAT_ACTIVITY_PULSE_MS = 700;
/** Web optimistic dots right after send. */
export const MOBILE_JAPANESE_LEARNING_CHAT_OPTIMISTIC_TYPING_MS = 5000;

/** Web `getSpeakDelay`: 300ms + 25ms per non-space char, clamped to 500–2200ms. */
export function getMobileJapaneseLearningChatSpeakDelay(text: string): number {
  const length = text.replace(/\s+/g, "").length;
  const base = 300;
  const perChar = 25;
  const min = 500;
  const max = 2200;
  return Math.min(max, Math.max(min, base + length * perChar));
}

/** Web store actions the stream callbacks drive. */
export type MobileJapaneseLearningChatStreamStore = {
  addAssistantMessage: (
    content: string,
    toolCalls?: MobileJapaneseLearningChatToolCall[],
    options?: { hidden?: boolean; kind?: "text" | "voice"; ttsText?: string },
  ) => string;
  setStreaming: (streaming: boolean) => void;
  setShowTypingIndicator: (show: boolean) => void;
  setFollowUps: (suggestions: string[]) => void;
  addToolResults: (results: MobileJapaneseLearningChatToolResult[]) => void;
  markLastUserMessageRead: () => void;
  upsertContextSnapshot: (key: string, content: string) => void;
  /** Web `useTtsStore.getState().prefetch(messageId, text, { source: 'voice' })`. */
  prefetchVoice: (messageId: string, ttsText: string) => void;
};

export type MobileJapaneseLearningChatTimers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultTimers: MobileJapaneseLearningChatTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type MobileJapaneseLearningChatStreamController =
  Required<
    Pick<
      MobileJapaneseLearningChatStreamCallbacks,
      | "onStreamStart"
      | "onText"
      | "onSpeak"
      | "onVoice"
      | "onToolCall"
      | "onToolsAwaiting"
      | "onToolResults"
      | "onFollowups"
      | "onActivity"
      | "onContextSnapshot"
      | "onDone"
      | "onError"
    >
  > & {
    /** Web `onCancelled`: a newer request replaced this one mid-flight. */
    onCancelled: () => void;
    /** True once `onDone`, `onError` or `onCancelled` ran (web `streamCompleted`). */
    isCompleted: () => boolean;
  };

export function createMobileJapaneseLearningChatStreamController(
  store: MobileJapaneseLearningChatStreamStore,
  timers: MobileJapaneseLearningChatTimers = defaultTimers,
): MobileJapaneseLearningChatStreamController {
  const {
    addAssistantMessage,
    setStreaming,
    setShowTypingIndicator,
    setFollowUps,
    addToolResults,
    markLastUserMessageRead,
    upsertContextSnapshot,
  } = store;

  let hasMarkedRead = false;
  let bufferedText = "";
  let streamCompleted = false;
  let currentPhase: "assistant" | "followups" | "client_tools" | null = null;
  let typingMode: "activity" | "client_tools" | "optimistic" | null = null;
  let typingPulseTimer: unknown = null;
  let optimisticTypingTimer: unknown = null;
  const speakQueue: string[] = [];
  let processingSpeak = false;
  let hasShownFirstSpeak = false;
  let speakDelayTimer: unknown = null;
  let speakGapTimer: unknown = null;

  const clearSpeakTimers = () => {
    if (speakDelayTimer) {
      timers.clearTimeout(speakDelayTimer);
      speakDelayTimer = null;
    }
    if (speakGapTimer) {
      timers.clearTimeout(speakGapTimer);
      speakGapTimer = null;
    }
  };

  const clearTypingPulse = () => {
    if (typingPulseTimer) {
      timers.clearTimeout(typingPulseTimer);
      typingPulseTimer = null;
    }
  };

  const clearOptimisticTypingTimer = () => {
    if (optimisticTypingTimer) {
      timers.clearTimeout(optimisticTypingTimer);
      optimisticTypingTimer = null;
    }
  };

  const stopTyping = () => {
    typingMode = null;
    clearTypingPulse();
    clearOptimisticTypingTimer();
    setShowTypingIndicator(false);
  };

  const startClientToolTyping = () => {
    typingMode = "client_tools";
    clearTypingPulse();
    clearOptimisticTypingTimer();
    setShowTypingIndicator(true);
  };

  const pulseTypingFromActivity = () => {
    if (currentPhase === "followups") return;
    if (typingMode === "client_tools") return;
    typingMode = "activity";
    setShowTypingIndicator(true);
    clearTypingPulse();
    clearOptimisticTypingTimer();
    typingPulseTimer = timers.setTimeout(() => {
      typingPulseTimer = null;
      if (typingMode === "activity") {
        typingMode = null;
        setShowTypingIndicator(false);
      }
    }, MOBILE_JAPANESE_LEARNING_CHAT_ACTIVITY_PULSE_MS);
  };

  const markReadIfNeeded = () => {
    if (hasMarkedRead) return;
    markLastUserMessageRead();
    hasMarkedRead = true;
  };

  const maybeFinishStream = () => {
    if (streamCompleted && !processingSpeak && speakQueue.length === 0) {
      stopTyping();
      setStreaming(false);
    }
  };

  const processSpeakQueue = () => {
    if (processingSpeak) return;
    const next = speakQueue.shift();
    if (!next) {
      maybeFinishStream();
      return;
    }
    processingSpeak = true;
    const delay = hasShownFirstSpeak ? getMobileJapaneseLearningChatSpeakDelay(next) : 0;
    const deliverSpeak = () => {
      // Speak bubbles are real output; don't show dots here.
      if (typingMode !== "client_tools") stopTyping();
      addAssistantMessage(next);
      hasShownFirstSpeak = true;
      processingSpeak = false;
      speakGapTimer = timers.setTimeout(() => {
        speakGapTimer = null;
        if (speakQueue.length > 0) {
          processSpeakQueue();
          return;
        }
        if (!streamCompleted) {
          // Don't show dots during silent waiting.
          return;
        }
        maybeFinishStream();
      }, MOBILE_JAPANESE_LEARNING_CHAT_SPEAK_GAP_MS);
    };
    if (delay === 0) {
      deliverSpeak();
      return;
    }
    speakDelayTimer = timers.setTimeout(() => {
      speakDelayTimer = null;
      deliverSpeak();
    }, delay);
  };

  const enqueueSpeak = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    speakQueue.push(trimmed);
    if (!processingSpeak && !speakGapTimer) {
      processSpeakQueue();
    }
  };

  return {
    onStreamStart: () => {
      // Flip read receipt ASAP for snappier UX.
      markReadIfNeeded();

      // Show dots briefly after send, then turn off unless real activity arrives.
      if (currentPhase === "followups") return;
      if (typingMode === "client_tools") return;
      typingMode = "optimistic";
      setShowTypingIndicator(true);
      clearOptimisticTypingTimer();
      optimisticTypingTimer = timers.setTimeout(() => {
        optimisticTypingTimer = null;
        if (typingMode === "optimistic") {
          typingMode = null;
          setShowTypingIndicator(false);
        }
      }, MOBILE_JAPANESE_LEARNING_CHAT_OPTIMISTIC_TYPING_MS);
    },
    onText: (text) => {
      bufferedText += text;
      currentPhase = "assistant";
      pulseTypingFromActivity();
      markReadIfNeeded();
    },
    onSpeak: (text) => {
      enqueueSpeak(text);
      currentPhase = "assistant";
      // No dots here; the speak bubble is the output.
      markReadIfNeeded();
    },
    onVoice: (text) => {
      currentPhase = "assistant";
      const trimmed = text.trim();
      if (!trimmed) return;
      const displayText = stripAudioTags(trimmed);
      const messageId = addAssistantMessage(displayText, undefined, {
        kind: "voice",
        ttsText: trimmed,
      });
      store.prefetchVoice(messageId, trimmed);
      markReadIfNeeded();
    },
    onToolCall: () => {
      pulseTypingFromActivity();
      markReadIfNeeded();
    },
    onToolsAwaiting: (toolCalls, partialContent) => {
      setShowTypingIndicator(true);
      currentPhase = "client_tools";
      startClientToolTyping();
      markReadIfNeeded();
      const shouldHide = !partialContent?.trim();
      addAssistantMessage(partialContent ?? "", toolCalls, { hidden: shouldHide });
    },
    onToolResults: (toolResults) => {
      addToolResults(toolResults);
      // Tool execution completed; don't show dots while waiting for the next backend chunk.
      stopTyping();
    },
    onFollowups: (suggestions) => {
      currentPhase = "followups";
      stopTyping();
      setFollowUps(suggestions);
    },
    onActivity: (activity, toolName) => {
      if (!activity) return;
      if (activity === "llm") {
        // Don't show dots for followups generation.
        if (toolName === "suggest_followups") return;
        pulseTypingFromActivity();
        markReadIfNeeded();
      }
      if (activity === "client_tools") {
        startClientToolTyping();
        markReadIfNeeded();
      }
    },
    onContextSnapshot: (key, content) => {
      upsertContextSnapshot(key, content);
    },
    onDone: () => {
      const trimmed = bufferedText.trim();
      if (trimmed) {
        enqueueSpeak(trimmed);
      }
      bufferedText = "";
      streamCompleted = true;
      maybeFinishStream();
    },
    onError: (error) => {
      const trimmed = error.trim();
      addAssistantMessage(
        trimmed && !trimmed.startsWith("{")
          ? trimmed
          : MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR,
      );
      bufferedText = "";
      streamCompleted = true;
      speakQueue.length = 0;
      processingSpeak = false;
      clearSpeakTimers();
      stopTyping();
      setStreaming(false);
    },
    onCancelled: () => {
      // Cancelled by a new request: only clean up local callback state. The
      // global streaming / typing flags already belong to the new stream.
      bufferedText = "";
      streamCompleted = true;
      speakQueue.length = 0;
      processingSpeak = false;
      clearSpeakTimers();
      clearTypingPulse();
      clearOptimisticTypingTimer();
    },
    isCompleted: () => streamCompleted,
  };
}

// ---------------------------------------------------------------------------
// Thread helpers — web `chat/store.ts`
// ---------------------------------------------------------------------------

export type MobileJapaneseLearningChatStoreMessage = {
  id: string;
  role: "user" | "assistant";
  kind?: "text" | "voice";
  text: string;
  displayText?: string;
  ttsText?: string;
  createdAt: number;
  hidden?: boolean;
  isRead?: boolean;
  toolCalls?: MobileJapaneseLearningChatToolCall[];
  toolResults?: MobileJapaneseLearningChatToolResult[];
};

const CONTEXT_SNAPSHOT_PREFIX = "NEMU_CTX_SNAPSHOT_V1";

/** Web `markLastUserMessageRead`: the newest unread user message becomes read. */
export function markMobileJapaneseLearningChatLastUserMessageRead<
  T extends MobileJapaneseLearningChatStoreMessage,
>(messages: T[]): T[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user" && !message.isRead) {
      const next = [...messages];
      next[index] = { ...message, isRead: true };
      return next;
    }
  }
  return messages;
}

/**
 * Web `upsertContextSnapshot`: dedupe against the newest snapshot only, then
 * insert the hidden snapshot right before the newest visible user message.
 */
export function upsertMobileJapaneseLearningChatContextSnapshot<
  T extends MobileJapaneseLearningChatStoreMessage,
>(messages: T[], key: string, snapshot: T): T[] {
  const trimmedKey = (key ?? "").trim();
  if (!trimmedKey) return messages;
  if (!snapshot.text.trim()) return messages;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "user") continue;
    if (!message.hidden) continue;
    if (!message.text.startsWith(CONTEXT_SNAPSHOT_PREFIX)) continue;
    const firstLine = message.text.split("\n", 1)[0] ?? "";
    if (firstLine.includes(`key=${trimmedKey}`)) return messages;
    break;
  }

  let visibleUserIndex: number | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user" && !message.hidden) {
      visibleUserIndex = index;
      break;
    }
  }
  if (visibleUserIndex == null) return [...messages, snapshot];
  const next = [...messages];
  next.splice(visibleUserIndex, 0, snapshot);
  return next;
}

/** Web `addToolResults`: results ride on the last message when it made tool calls. */
export function attachMobileJapaneseLearningChatToolResults<
  T extends MobileJapaneseLearningChatStoreMessage,
>(messages: T[], results: MobileJapaneseLearningChatToolResult[]): T[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant" || !last.toolCalls) return messages;
  return [...messages.slice(0, -1), { ...last, toolResults: results }];
}

/** Web `getMessagesForRequest`: every stored message, hidden ones included. */
export function mobileJapaneseLearningChatMessagesForRequest(
  messages: MobileJapaneseLearningChatStoreMessage[],
): MobileJapaneseLearningChatMessage[] {
  const result: MobileJapaneseLearningChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      result.push({ role: "user", content: message.text });
    } else {
      result.push(
        message.toolCalls
          ? { role: "assistant", content: message.text, toolCalls: message.toolCalls }
          : { role: "assistant", content: message.text },
      );
      if (message.toolResults && message.toolResults.length > 0) {
        result.push({ role: "tool", toolResults: message.toolResults });
      }
    }
  }
  return result;
}

/**
 * Web `truncateOldestHalf` (chat/store.ts): drop the oldest ceil(n/2)
 * messages, keeping everything when there are two or fewer.
 */
export function truncateMobileJapaneseLearningChatOldestHalf<T>(
  messages: readonly T[],
): T[] {
  if (messages.length <= 2) return [...messages];
  return messages.slice(Math.ceil(messages.length / 2));
}

/**
 * Web `sendChatMessage` / `sendChatGreeting` retry after context_too_long:
 * the request is rebuilt from the already-truncated thread. A stored user
 * turn at the end is replaced by the prompt (web `withoutLastUser`); the
 * greeting prompt, never stored, is simply appended.
 */
export function mobileJapaneseLearningChatContextRetryMessages(
  truncatedThread: MobileJapaneseLearningChatStoreMessage[],
  prompt: string,
  storeUserMessage: boolean,
): MobileJapaneseLearningChatMessage[] {
  const request = mobileJapaneseLearningChatMessagesForRequest(truncatedThread);
  const last = request[request.length - 1];
  const base =
    storeUserMessage && last?.role === "user" ? request.slice(0, -1) : request;
  return [...base, { role: "user", content: prompt }];
}
