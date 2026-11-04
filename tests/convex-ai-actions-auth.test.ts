import { describe, expect, test } from "bun:test";

// Cloud AI actions are signed-in only: they must reject before touching any
// provider (no API keys are configured in this test, so reaching one would throw
// a different error).
const signedOut = { auth: { getUserIdentity: async () => null } };

function handlerOf(fn: unknown) {
  return (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
}

describe("cloud AI Convex actions require authentication", () => {
  test("ai_metadata actions", async () => {
    const m = await import("../convex/ai_metadata");
    const calls: Array<[unknown, unknown]> = [
      [m.findJapaneseTitle, { title: "t" }],
      [m.findJapaneseDescription, { japaneseTitle: "t" }],
      [m.findAuthorJapaneseName, { englishName: "n" }],
      [m.findChineseTitle, { japaneseTitle: "t" }],
      [m.findChineseDescription, { japaneseTitle: "t" }],
    ];
    for (const [fn, args] of calls) {
      await expect(handlerOf(fn)(signedOut, args)).rejects.toThrow("Not authenticated");
    }
  });

  test("japanese_learning.normalize", async () => {
    const m = await import("../convex/japanese_learning");
    await expect(handlerOf(m.normalize)(signedOut, { text: "こんにちは" })).rejects.toThrow(
      "Not authenticated",
    );
  });
});
