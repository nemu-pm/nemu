import {
  attachMobileJapaneseLearningChatToolResults,
  markMobileJapaneseLearningChatLastUserMessageRead,
  upsertMobileJapaneseLearningChatContextSnapshot,
  type MobileJapaneseLearningChatStreamController,
  type MobileJapaneseLearningChatStreamStore,
  type MobileJapaneseLearningChatTimers,
} from "./mobileJapaneseLearningChatStream";
import type { JapaneseLearningChatThreadMessage } from "./mobileJapaneseLearningReaderHelpers";

/**
 * Nemu chat outlives a reader screen the way web's `useNemuChatStore` and
 * `chat/actions.ts` do (Tiger's 469f2315): the store and the reply streaming
 * into it are reset only by the plugin's `onUnmount`, which runs when the
 * reader session (`registryId:sourceId:mangaId`) changes or the reader closes.
 * Page turns, chapter changes and closing the drawer all keep the
 * conversation, and a reply in flight keeps streaming.
 *
 * Mobile swaps chapters with `router.replace`, which remounts `ReaderScreen`.
 * So the thread, its flags and the request in flight are owned here, not by a
 * screen: every screen for the same manga reads and writes the one session,
 * and the next chapter's screen simply re-attaches to a reply that is still
 * arriving. A screen retains the session while mounted; when the last one
 * releases it, the session (and any request in flight) ends unless another
 * reader for the same manga mounts within the grace period.
 */

export type MobileJapaneseLearningChatSessionState = {
  messages: JapaneseLearningChatThreadMessage[];
  followUps: string[];
  streaming: boolean;
  showTypingIndicator: boolean;
};

/** One chat request owned by the session (web `currentAbortController`). */
export type MobileJapaneseLearningChatSessionRequest = {
  signal: AbortSignal;
  /** True while no newer request, reset or session end has replaced it. */
  isCurrent: () => boolean;
  /** Settle this request; returns false when it was already replaced. */
  finish: () => boolean;
};

export type MobileJapaneseLearningChatSession = {
  readonly key: string;
  getState: () => MobileJapaneseLearningChatSessionState;
  subscribe: (listener: () => void) => () => void;
  /** Web store `set((s) => ...)`: applied synchronously to the shared thread. */
  updateMessages: (
    updater: (
      current: JapaneseLearningChatThreadMessage[],
    ) => JapaneseLearningChatThreadMessage[],
  ) => void;
  setFollowUps: (followUps: string[]) => void;
  setStreaming: (streaming: boolean) => void;
  setShowTypingIndicator: (show: boolean) => void;
  /** Web `streamChat`: a new request cancels the one in flight. */
  beginRequest: (
    controller: MobileJapaneseLearningChatStreamController,
  ) => MobileJapaneseLearningChatSessionRequest;
  /** Web `useNemuChatStore.reset()` plus aborting the reply in flight. */
  reset: () => void;
  isDisposed: () => boolean;
};

/** Long enough to bridge a `router.replace` remount; short enough that leaving the reader ends the chat. */
export const MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS = 1_000;

/** Stream controllers whose speak queues may still be draining. */
const MAX_TRACKED_CONTROLLERS = 4;

const EMPTY_STATE: MobileJapaneseLearningChatSessionState = {
  messages: [],
  followUps: [],
  streaming: false,
  showTypingIndicator: false,
};

function cancellationError(): Error {
  const error = new Error("Nemu chat request cancelled.");
  error.name = "AbortError";
  return error;
}

type SessionInternals = {
  session: MobileJapaneseLearningChatSession;
  holders: number;
  releaseTimer: unknown;
  releaseTimers: MobileJapaneseLearningChatTimers | null;
  dispose: () => void;
};

/** Live sessions by manga key; normally one (the open reader's manga). */
const sessions = new Map<string, SessionInternals>();
let messageSequence = 0;

export function mobileJapaneseLearningChatSessionKey(input: {
  registryId: string;
  sourceId: string;
  mangaId: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.mangaId]);
}

function createSession(key: string): SessionInternals {
  let state = EMPTY_STATE;
  let disposed = false;
  const listeners = new Set<() => void>();
  let inFlight: { abort: AbortController; controller: MobileJapaneseLearningChatStreamController } | null = null;
  const controllers = new Set<MobileJapaneseLearningChatStreamController>();

  const setState = (next: MobileJapaneseLearningChatSessionState) => {
    if (disposed || next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const patch = (partial: Partial<MobileJapaneseLearningChatSessionState>) => {
    let changed = false;
    for (const name of Object.keys(partial) as (keyof MobileJapaneseLearningChatSessionState)[]) {
      if (partial[name] !== state[name]) changed = true;
    }
    if (changed) setState({ ...state, ...partial });
  };

  const cancelStreams = () => {
    const request = inFlight;
    inFlight = null;
    if (request && !request.abort.signal.aborted) {
      request.abort.abort(cancellationError());
    }
    for (const controller of controllers) controller.onCancelled();
    controllers.clear();
  };

  const session: MobileJapaneseLearningChatSession = {
    key,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateMessages: (updater) => {
      const next = updater(state.messages);
      if (next !== state.messages) setState({ ...state, messages: next });
    },
    setFollowUps: (followUps) => patch({ followUps }),
    setStreaming: (streaming) => patch({ streaming }),
    setShowTypingIndicator: (showTypingIndicator) => patch({ showTypingIndicator }),
    beginRequest: (controller) => {
      const previous = inFlight;
      inFlight = null;
      if (previous) {
        previous.controller.onCancelled();
        if (!previous.abort.signal.aborted) previous.abort.abort(cancellationError());
      }
      const abort = new AbortController();
      if (disposed) abort.abort(cancellationError());
      const request = { abort, controller };
      if (!disposed) {
        inFlight = request;
        controllers.add(controller);
        // Earlier controllers have long drained their speak queues.
        for (const stale of [...controllers].slice(0, -MAX_TRACKED_CONTROLLERS)) {
          controllers.delete(stale);
        }
      }
      return {
        signal: abort.signal,
        isCurrent: () => inFlight === request,
        finish: () => {
          if (inFlight !== request) return false;
          inFlight = null;
          return true;
        },
      };
    },
    reset: () => {
      cancelStreams();
      setState(EMPTY_STATE);
    },
    isDisposed: () => disposed,
  };

  const internals: SessionInternals = {
    session,
    holders: 0,
    releaseTimer: null,
    releaseTimers: null,
    dispose: () => {
      if (disposed) return;
      if (internals.releaseTimer && internals.releaseTimers) {
        internals.releaseTimers.clearTimeout(internals.releaseTimer);
      }
      internals.releaseTimer = null;
      cancelStreams();
      state = EMPTY_STATE;
      disposed = true;
      listeners.clear();
    },
  };
  return internals;
}

/**
 * The chat session for this manga: the live one (reply in flight included)
 * while a reader for it is mounted or within the release grace, otherwise a
 * fresh one. A previous manga's session ends once its reader lets go (web
 * `onUnmount` → `reset()`), not when another manga's reader renders.
 */
export function mobileJapaneseLearningChatSessionFor(
  key: string,
): MobileJapaneseLearningChatSession {
  const existing = sessions.get(key);
  if (existing && !existing.session.isDisposed()) return existing.session;
  const created = createSession(key);
  sessions.set(key, created);
  return created.session;
}

const defaultTimers: MobileJapaneseLearningChatTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Hold the session while a reader screen is mounted; returns the release. */
export function retainMobileJapaneseLearningChatSession(
  session: MobileJapaneseLearningChatSession,
  options: { graceMs?: number; timers?: MobileJapaneseLearningChatTimers } = {},
): () => void {
  const internals = sessions.get(session.key);
  if (!internals || internals.session !== session) return () => {};
  const timers = options.timers ?? defaultTimers;
  const graceMs = options.graceMs ?? MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS;
  internals.holders += 1;
  if (internals.releaseTimer && internals.releaseTimers) {
    internals.releaseTimers.clearTimeout(internals.releaseTimer);
    internals.releaseTimer = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    internals.holders = Math.max(0, internals.holders - 1);
    if (internals.holders > 0 || session.isDisposed()) return;
    if (internals.releaseTimer && internals.releaseTimers) {
      internals.releaseTimers.clearTimeout(internals.releaseTimer);
    }
    internals.releaseTimers = timers;
    internals.releaseTimer = timers.setTimeout(() => {
      internals.releaseTimer = null;
      if (internals.holders > 0) return;
      internals.dispose();
      if (sessions.get(session.key) === internals) sessions.delete(session.key);
    }, graceMs);
  };
}

/** Message ids stay unique across the remounts that share one thread. */
export function nextMobileJapaneseLearningChatMessageId(): string {
  messageSequence += 1;
  return `japanese-learning-chat-${messageSequence}`;
}

/**
 * Web `createChatStreamCallbacks()` bound to the session's store rather than a
 * screen, so a reply keeps landing in the thread after the screen that sent
 * it has gone.
 */
export function createMobileJapaneseLearningChatSessionStreamStore(
  session: MobileJapaneseLearningChatSession,
  options: {
    prefetchVoice: (messageId: string, ttsText: string) => void;
    now?: () => number;
  },
): MobileJapaneseLearningChatStreamStore {
  const now = options.now ?? Date.now;
  return {
    addAssistantMessage: (content, toolCalls, messageOptions) => {
      const id = nextMobileJapaneseLearningChatMessageId();
      const message: JapaneseLearningChatThreadMessage = {
        id,
        role: "assistant",
        kind: messageOptions?.kind ?? "text",
        text: content,
        createdAt: now(),
        toolCalls,
        hidden: messageOptions?.hidden,
        ttsText: messageOptions?.ttsText,
      };
      session.updateMessages((messages) => [...messages, message]);
      return id;
    },
    setStreaming: session.setStreaming,
    setShowTypingIndicator: session.setShowTypingIndicator,
    setFollowUps: session.setFollowUps,
    addToolResults: (results) =>
      session.updateMessages((messages) =>
        attachMobileJapaneseLearningChatToolResults(messages, results),
      ),
    markLastUserMessageRead: () =>
      session.updateMessages(markMobileJapaneseLearningChatLastUserMessageRead),
    upsertContextSnapshot: (key, content) => {
      const trimmedContent = (content ?? "").trim();
      if (!trimmedContent) return;
      session.updateMessages((messages) =>
        upsertMobileJapaneseLearningChatContextSnapshot(messages, key, {
          id: nextMobileJapaneseLearningChatMessageId(),
          role: "user",
          kind: "text",
          text: trimmedContent,
          createdAt: now(),
          hidden: true,
          isRead: true,
        }),
      );
    },
    prefetchVoice: options.prefetchVoice,
  };
}

/**
 * Web's plugin host unmounts a plugin that is disabled while the reader is
 * open, and the Japanese-learning `onUnmount` resets the chat store. Only an
 * observed enabled → disabled transition counts: plugin state that is still
 * loading (`undefined`) or a plugin that was never enabled keeps the thread.
 */
export function shouldResetMobileJapaneseLearningChatForPluginToggle(
  previousEnabled: boolean | undefined,
  nextEnabled: boolean | undefined,
): boolean {
  return previousEnabled === true && nextEnabled === false;
}
