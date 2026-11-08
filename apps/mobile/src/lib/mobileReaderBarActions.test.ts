import { describe, expect, test } from "bun:test";
import { mobileReaderBarActionStates } from "./mobileReaderBarActions";

describe("reader bar action states", () => {
  const idle = { ocrStatus: "idle", chatMessageCount: 0, chatStreaming: false, dualReadEnabled: false } as const;

  test("Detect text is on from the moment the page has a detection, whatever its outcome", () => {
    expect(mobileReaderBarActionStates(idle).detectTextActive).toBe(false);
    for (const ocrStatus of ["loading", "ready", "error"] as const) {
      expect(mobileReaderBarActionStates({ ...idle, ocrStatus }).detectTextActive).toBe(true);
    }
  });

  test("Nemu Chat is on with a conversation or a reply on its way", () => {
    expect(mobileReaderBarActionStates(idle).nemuChatActive).toBe(false);
    expect(mobileReaderBarActionStates({ ...idle, chatMessageCount: 2 }).nemuChatActive).toBe(true);
    expect(mobileReaderBarActionStates({ ...idle, chatStreaming: true }).nemuChatActive).toBe(true);
  });

  test("the states are independent of each other", () => {
    const states = mobileReaderBarActionStates({ ...idle, ocrStatus: "ready" });
    expect(states).toEqual({ detectTextActive: true, nemuChatActive: false, dualReadEnabled: false });
    expect(mobileReaderBarActionStates({ ...idle, dualReadEnabled: true }).dualReadEnabled).toBe(true);
  });
});
