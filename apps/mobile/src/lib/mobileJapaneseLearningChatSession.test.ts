import { describe, expect, test } from "bun:test";
import {
  createMobileJapaneseLearningChatStreamController,
  MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR,
  type MobileJapaneseLearningChatTimers,
} from "./mobileJapaneseLearningChatStream";
import {
  createMobileJapaneseLearningChatSessionStreamStore,
  MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS,
  mobileJapaneseLearningChatSessionFor,
  mobileJapaneseLearningChatSessionKey,
  nextMobileJapaneseLearningChatMessageId,
  retainMobileJapaneseLearningChatSession,
  shouldResetMobileJapaneseLearningChatForPluginToggle,
  type MobileJapaneseLearningChatSession,
} from "./mobileJapaneseLearningChatSession";

/** Deterministic stand-in for setTimeout shared by the session and the stream. */
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; callback: () => void }>();
  const timers: MobileJapaneseLearningChatTimers = {
    setTimeout: (callback, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let due: [number, { at: number; callback: () => void }] | null = null;
      for (const entry of pending) {
        if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
      }
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  };
  return { timers, advance };
}

let mangaSequence = 0;
function freshKey() {
  mangaSequence += 1;
  return mobileJapaneseLearningChatSessionKey({
    registryId: "r",
    sourceId: "s",
    mangaId: `m${mangaSequence}`,
  });
}

/** What `ReaderScreen.startJapaneseLearningChatRequest` does, minus the network. */
function sendFromScreen(
  session: MobileJapaneseLearningChatSession,
  timers: MobileJapaneseLearningChatTimers,
  text: string,
) {
  session.updateMessages((messages) => [
    ...messages,
    { id: nextMobileJapaneseLearningChatMessageId(), role: "user", text, createdAt: 0 },
  ]);
  session.setFollowUps([]);
  session.setStreaming(true);
  session.setShowTypingIndicator(false);
  const controller = createMobileJapaneseLearningChatStreamController(
    createMobileJapaneseLearningChatSessionStreamStore(session, {
      prefetchVoice: () => {},
      now: () => 0,
    }),
    timers,
  );
  const request = session.beginRequest(controller);
  controller.onStreamStart();
  return { controller, request };
}

const visibleAssistantTexts = (session: MobileJapaneseLearningChatSession) =>
  session
    .getState()
    .messages.filter((message) => message.role === "assistant" && !message.hidden)
    .map((message) => message.text);

describe("Nemu chat session (web useNemuChatStore + chat/actions.ts lifetime)", () => {
  test("is keyed by manga, not chapter or page", () => {
    const key = freshKey();
    const session = mobileJapaneseLearningChatSessionFor(key);
    expect(mobileJapaneseLearningChatSessionFor(key)).toBe(session);
    session.updateMessages(() => [{ id: "1", role: "user", text: "hi", createdAt: 0 }]);
    const other = mobileJapaneseLearningChatSessionFor(freshKey());
    expect(other).not.toBe(session);
    expect(other.getState().messages).toEqual([]);
  });

  test("a different manga's reader gets its own thread; the old one ends when its reader lets go", () => {
    const { timers, advance } = createFakeTimers();
    const mangaA = mobileJapaneseLearningChatSessionFor(freshKey());
    const releaseA = retainMobileJapaneseLearningChatSession(mangaA, { timers });
    const { request } = sendFromScreen(mangaA, timers, "about manga A");
    const mangaB = mobileJapaneseLearningChatSessionFor(freshKey());
    const releaseB = retainMobileJapaneseLearningChatSession(mangaB, { timers });
    expect(mangaB.getState().messages).toEqual([]);
    expect(mangaA.isDisposed()).toBe(false);
    releaseA();
    advance(MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS);
    expect(mangaA.isDisposed()).toBe(true);
    expect(request.signal.aborted).toBe(true);
    expect(mangaB.isDisposed()).toBe(false);
    releaseB();
  });

  test("a reply in flight survives a chapter remount and lands in the next screen's thread", () => {
    const { timers, advance } = createFakeTimers();
    const key = freshKey();
    // Chapter 1's screen sends the question.
    const oldScreenSession = mobileJapaneseLearningChatSessionFor(key);
    const releaseOld = retainMobileJapaneseLearningChatSession(oldScreenSession, { timers });
    const { controller, request } = sendFromScreen(oldScreenSession, timers, "what does this mean?");
    controller.onText("It means ");
    advance(100);

    // Next chapter: `router.replace` mounts the new screen, then the old one unmounts.
    const newScreenSession = mobileJapaneseLearningChatSessionFor(key);
    expect(newScreenSession).toBe(oldScreenSession);
    const releaseNew = retainMobileJapaneseLearningChatSession(newScreenSession, { timers });
    releaseOld();
    advance(MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS * 3);

    // The new screen attaches mid-reply: still streaming, the request alive.
    expect(request.signal.aborted).toBe(false);
    expect(request.isCurrent()).toBe(true);
    expect(newScreenSession.getState().streaming).toBe(true);

    controller.onText("hello.");
    controller.onDone();
    expect(request.finish()).toBe(true);
    advance(5_000);

    expect(visibleAssistantTexts(newScreenSession)).toEqual(["It means hello."]);
    expect(newScreenSession.getState().streaming).toBe(false);
    expect(newScreenSession.getState().showTypingIndicator).toBe(false);
    const question = newScreenSession
      .getState()
      .messages.find((message) => message.role === "user" && !message.hidden);
    expect(question?.isRead).toBe(true);
    releaseNew();
  });

  test("a request that fails after the chapter changed still leaves an error bubble", () => {
    const { timers, advance } = createFakeTimers();
    const key = freshKey();
    const session = mobileJapaneseLearningChatSessionFor(key);
    const releaseOld = retainMobileJapaneseLearningChatSession(session, { timers });
    const { controller, request } = sendFromScreen(session, timers, "question");
    const releaseNew = retainMobileJapaneseLearningChatSession(
      mobileJapaneseLearningChatSessionFor(key),
      { timers },
    );
    releaseOld();
    advance(2_000);

    // The screen's rejection handler: settle, then surface the error.
    expect(request.finish()).toBe(true);
    controller.onError("");
    expect(visibleAssistantTexts(session)).toEqual([MOBILE_JAPANESE_LEARNING_CHAT_NETWORK_ERROR]);
    expect(session.getState().streaming).toBe(false);
    releaseNew();
  });

  test("the old screen cannot overwrite what the new screen wrote during the transition", () => {
    const { timers } = createFakeTimers();
    const key = freshKey();
    const oldScreen = mobileJapaneseLearningChatSessionFor(key);
    const releaseOld = retainMobileJapaneseLearningChatSession(oldScreen, { timers });
    const { controller } = sendFromScreen(oldScreen, timers, "first");
    const newScreen = mobileJapaneseLearningChatSessionFor(key);
    const releaseNew = retainMobileJapaneseLearningChatSession(newScreen, { timers });
    // Both screens are mounted: the old one's stream keeps writing while the
    // new one adds its own message. One shared thread keeps both.
    controller.onVoice("old screen reply");
    newScreen.updateMessages((messages) => [
      ...messages,
      { id: "new", role: "user", text: "second", createdAt: 0 },
    ]);
    controller.onVoice("more");
    const texts = newScreen.getState().messages.map((message) => message.text);
    expect(texts).toContain("first");
    expect(texts).toContain("second");
    expect(texts).toContain("old screen reply");
    releaseOld();
    releaseNew();
  });

  test("closing the reader mid-reply ends the session and aborts the request", () => {
    const { timers, advance } = createFakeTimers();
    const key = freshKey();
    const session = mobileJapaneseLearningChatSessionFor(key);
    const release = retainMobileJapaneseLearningChatSession(session, { timers });
    const { controller, request } = sendFromScreen(session, timers, "question");
    release();
    advance(MOBILE_JAPANESE_LEARNING_CHAT_SESSION_RELEASE_GRACE_MS - 1);
    expect(request.signal.aborted).toBe(false);
    advance(1);
    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(false);
    expect(session.isDisposed()).toBe(true);
    // Late stream events from the aborted request go nowhere.
    controller.onText("late");
    controller.onDone();
    advance(5_000);
    expect(session.getState().messages).toEqual([]);
    const reopened = mobileJapaneseLearningChatSessionFor(key);
    expect(reopened).not.toBe(session);
    expect(reopened.getState().messages).toEqual([]);
  });

  test("a new request replaces the one in flight (web streamChat)", () => {
    const { timers } = createFakeTimers();
    const session = mobileJapaneseLearningChatSessionFor(freshKey());
    const first = sendFromScreen(session, timers, "one");
    const second = sendFromScreen(session, timers, "two");
    expect(first.request.signal.aborted).toBe(true);
    expect(first.request.finish()).toBe(false);
    expect(first.controller.isCompleted()).toBe(true);
    expect(second.request.isCurrent()).toBe(true);
  });

  test("reset (plugin disabled) clears the thread and aborts the reply", () => {
    const { timers } = createFakeTimers();
    const session = mobileJapaneseLearningChatSessionFor(freshKey());
    const { request } = sendFromScreen(session, timers, "question");
    session.reset();
    expect(request.signal.aborted).toBe(true);
    expect(session.getState()).toEqual({
      messages: [],
      followUps: [],
      streaming: false,
      showTypingIndicator: false,
    });
    expect(session.isDisposed()).toBe(false);
  });

  test("subscribers hear every change; snapshots are stable between changes", () => {
    const session = mobileJapaneseLearningChatSessionFor(freshKey());
    let calls = 0;
    const unsubscribe = session.subscribe(() => {
      calls += 1;
    });
    const before = session.getState();
    expect(session.getState()).toBe(before);
    session.setStreaming(false); // unchanged → no notification
    expect(calls).toBe(0);
    session.setStreaming(true);
    expect(calls).toBe(1);
    expect(session.getState()).not.toBe(before);
    unsubscribe();
    session.setStreaming(false);
    expect(calls).toBe(1);
  });

  test("message ids stay unique across remounts", () => {
    expect(nextMobileJapaneseLearningChatMessageId()).not.toBe(nextMobileJapaneseLearningChatMessageId());
  });
});

describe("reader wiring", () => {
  test("the screen neither owns nor cancels the chat request; it re-attaches through the session", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "ReaderScreen.tsx"), "utf8");
    expect(screen).toContain("useSyncExternalStore(");
    expect(screen).toContain("japaneseLearningChatSession.subscribe");
    expect(screen).toContain("session.beginRequest(controller)");
    expect(screen).toContain("retainMobileJapaneseLearningChatSession(japaneseLearningChatSession)");
    expect(screen).not.toContain('begin("chat")');
    expect(screen).not.toContain("japaneseLearningChatInFlightRef");
    expect(screen).not.toContain("writeMobileJapaneseLearningChatSession");
    expect(screen).not.toMatch(/controller\.onCancelled\(\)/);
  });
});

describe("plugin disable resets the chat (web onUnmount)", () => {
  test("only an observed enabled -> disabled transition resets", () => {
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(true, false)).toBe(true);
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(false, false)).toBe(false);
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(false, true)).toBe(false);
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(true, true)).toBe(false);
    // Plugin state still loading or reloading never clears the thread.
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(undefined, false)).toBe(false);
    expect(shouldResetMobileJapaneseLearningChatForPluginToggle(true, undefined)).toBe(false);
  });
});
