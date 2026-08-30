import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import {
  assertMobileJapaneseLearningBase64Payload,
  assertMobileJapaneseLearningByteLength,
  assertMobileJapaneseLearningCount,
  assertMobileJapaneseLearningStringLength,
  awaitMobileJapaneseLearningAbortable,
  readMobileJapaneseLearningBoundedResponseText,
} from "./mobileJapaneseLearningSafety";
import { createMobileJapaneseLearningAbortScope } from "./mobileJapaneseLearningLifecycle";

describe("mobile Japanese Learning shared safety", () => {
  test("uses inclusive exact limits for bytes, strings, counts, and base64", () => {
    expect(() => assertMobileJapaneseLearningByteLength(4, 4, "bytes")).not.toThrow();
    expect(() => assertMobileJapaneseLearningByteLength(5, 4, "bytes")).toThrow();
    expect(() => assertMobileJapaneseLearningStringLength("1234", 4, "text")).not.toThrow();
    expect(() => assertMobileJapaneseLearningStringLength("12345", 4, "text")).toThrow();
    expect(() => assertMobileJapaneseLearningCount(4, 4, "items")).not.toThrow();
    expect(() => assertMobileJapaneseLearningCount(5, 4, "items")).toThrow();
    expect(() =>
      assertMobileJapaneseLearningBase64Payload(
        "QUJD",
        { maxEncodedCharacters: 4, maxDecodedBytes: 3 },
        "image",
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningBase64Payload(
        "QUJDRA==",
        { maxEncodedCharacters: 8, maxDecodedBytes: 3 },
        "image",
      ),
    ).toThrow();
  });

  test("cancels abortable helper work through an external signal", async () => {
    const controller = new AbortController();
    const scope = createMobileJapaneseLearningAbortScope(controller.signal);
    const pending = Promise.withResolvers<string>();
    const result = awaitMobileJapaneseLearningAbortable(
      pending.promise,
      scope.signal,
    );
    controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled");
    scope.dispose();
  });

  test("bounds streamed responses before retaining the next chunk", async () => {
    const exact = new Response("1234");
    await expect(
      readMobileJapaneseLearningBoundedResponseText(exact, {
        maxBytes: 4,
        label: "response",
      }),
    ).resolves.toBe("1234");
    const over = new Response("12345");
    await expect(
      readMobileJapaneseLearningBoundedResponseText(over, {
        maxBytes: 4,
        label: "response",
      }),
    ).rejects.toThrow("byte safety limit");
  });

  test("native lifecycle aborts when AppState leaves active", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("./mobileJapaneseLearningLifecycle.native.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).toContain('AppState.addEventListener("change"');
    expect(source).toContain('state !== "active"');
    expect(source).toContain("scope.abort(error)");
  });
});
