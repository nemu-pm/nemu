import { afterEach, describe, expect, test } from "bun:test";
import {
  clearMobileJapaneseLearningChatSession,
  mobileJapaneseLearningChatSessionKey,
  nextMobileJapaneseLearningChatMessageId,
  readMobileJapaneseLearningChatSession,
  retainMobileJapaneseLearningChatSession,
  shouldResetMobileJapaneseLearningChatForPluginToggle,
  writeMobileJapaneseLearningChatSession,
} from "./mobileJapaneseLearningChatSession";

const key = mobileJapaneseLearningChatSessionKey({ registryId: "r", sourceId: "s", mangaId: "m" });
const snapshot = { messages: [{ id: "1" }], followUps: ["more?"] };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => clearMobileJapaneseLearningChatSession());

describe("Nemu chat session (web useNemuChatStore lifetime)", () => {
  test("is keyed by manga, not chapter or page", () => {
    writeMobileJapaneseLearningChatSession(key, snapshot);
    expect(readMobileJapaneseLearningChatSession(key)).toEqual(snapshot);
    const otherManga = mobileJapaneseLearningChatSessionKey({ registryId: "r", sourceId: "s", mangaId: "m2" });
    expect(readMobileJapaneseLearningChatSession(otherManga)).toBeNull();
  });

  test("survives a chapter remount (old screen releases, new one retains)", async () => {
    const releaseOld = retainMobileJapaneseLearningChatSession(20);
    writeMobileJapaneseLearningChatSession(key, snapshot);
    releaseOld();
    const releaseNew = retainMobileJapaneseLearningChatSession(20);
    await wait(40);
    expect(readMobileJapaneseLearningChatSession(key)).toEqual(snapshot);
    releaseNew();
  });

  test("ends when the reader closes", async () => {
    const release = retainMobileJapaneseLearningChatSession(10);
    writeMobileJapaneseLearningChatSession(key, snapshot);
    release();
    await wait(30);
    expect(readMobileJapaneseLearningChatSession(key)).toBeNull();
  });

  test("message ids stay unique across remounts", () => {
    expect(nextMobileJapaneseLearningChatMessageId()).not.toBe(nextMobileJapaneseLearningChatMessageId());
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
