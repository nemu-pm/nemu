import { describe, expect, test } from "bun:test";
import {
  MOBILE_READER_RESET_CHAT_ON_PAGE_TURN,
  mobileReaderLearningChatResetKey,
  mobileReaderLearningPageResetKey,
} from "./mobileReaderLearningSession";

const base = { registryId: "r", sourceId: "s", chapterId: "c", pageKey: "p1" };

describe("learning session reset keys", () => {
  test("current behaviour: chat resets on every page turn", () => {
    expect(MOBILE_READER_RESET_CHAT_ON_PAGE_TURN).toBe(true);
    expect(mobileReaderLearningChatResetKey(base)).not.toBe(mobileReaderLearningChatResetKey({ ...base, pageKey: "p2" }));
  });

  test("with the flag off, chat survives page turns but not a chapter or source change", () => {
    const key = (overrides: Partial<typeof base>) => mobileReaderLearningChatResetKey({ ...base, ...overrides, resetOnPageTurn: false });
    expect(key({})).toBe(key({ pageKey: "p2" }));
    expect(key({})).not.toBe(key({ chapterId: "c2" }));
    expect(key({})).not.toBe(key({ sourceId: "s2" }));
  });

  test("page-scoped tools always follow the page", () => {
    expect(mobileReaderLearningPageResetKey(base)).not.toBe(mobileReaderLearningPageResetKey({ ...base, pageKey: "p2" }));
  });
});
