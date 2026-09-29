/**
 * Nemu chat history outlives a reader screen the way web's `useNemuChatStore`
 * does (Tiger's 469f2315): the store is reset only by the plugin's
 * `onUnmount`, which runs when the reader session
 * (`registryId:sourceId:mangaId`) changes or the reader closes. Page turns,
 * chapter changes and closing the drawer all keep the conversation.
 *
 * Mobile swaps chapters with `router.replace`, which remounts `ReaderScreen`,
 * so the thread is parked here between the old screen's unmount and the new
 * screen's mount. A screen retains the session while mounted; when the last
 * one releases it, the thread is dropped unless another reader for the same
 * manga mounts within the grace period.
 */

export type MobileJapaneseLearningChatSessionSnapshot<TMessage> = {
  messages: TMessage[];
  followUps: string[];
};

/** Long enough to bridge a `router.replace` remount; short enough that leaving the reader ends the chat. */
export const MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS = 1_000;

type StoredSession = {
  key: string;
  snapshot: MobileJapaneseLearningChatSessionSnapshot<unknown>;
};

let stored: StoredSession | null = null;
let holders = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let messageSequence = 0;

export function mobileJapaneseLearningChatSessionKey(input: {
  registryId: string;
  sourceId: string;
  mangaId: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.mangaId]);
}

export function readMobileJapaneseLearningChatSession<TMessage>(
  key: string,
): MobileJapaneseLearningChatSessionSnapshot<TMessage> | null {
  if (!stored || stored.key !== key) return null;
  return stored.snapshot as MobileJapaneseLearningChatSessionSnapshot<TMessage>;
}

export function writeMobileJapaneseLearningChatSession<TMessage>(
  key: string,
  snapshot: MobileJapaneseLearningChatSessionSnapshot<TMessage>,
): void {
  stored = { key, snapshot };
}

export function clearMobileJapaneseLearningChatSession(): void {
  stored = null;
}

/** Hold the session while a reader screen is mounted; returns the release. */
export function retainMobileJapaneseLearningChatSession(
  graceMs = MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS,
): () => void {
  holders += 1;
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders > 0) return;
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (holders === 0) stored = null;
    }, graceMs);
  };
}

/** Message ids stay unique across the remounts that share one thread. */
export function nextMobileJapaneseLearningChatMessageId(): string {
  messageSequence += 1;
  return `japanese-learning-chat-${messageSequence}`;
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
