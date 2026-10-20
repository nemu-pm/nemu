import { describe, expect, test } from "bun:test";
import {
  getMobileJapaneseLearningAuthGateStatus,
  MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR,
  resolveMobileJapaneseLearningAuthGate,
  resolveMobileJapaneseLearningChatSignInFailure,
  resolveMobileJapaneseLearningSignInHost,
} from "./mobileJapaneseLearningAuthGate";

describe("getMobileJapaneseLearningAuthGateStatus (web getAuthGateStatus)", () => {
  test("a session cookie wins over a session still loading", () => {
    expect(getMobileJapaneseLearningAuthGateStatus({ signedIn: true, pending: true })).toBe(
      "authenticated",
    );
  });
  test("signed out while loading is loading, else unauthenticated", () => {
    expect(getMobileJapaneseLearningAuthGateStatus({ signedIn: false, pending: true })).toBe(
      "loading",
    );
    expect(getMobileJapaneseLearningAuthGateStatus({ signedIn: false, pending: false })).toBe(
      "unauthenticated",
    );
  });
});

describe("resolveMobileJapaneseLearningAuthGate (web requireAuthOrPrompt)", () => {
  test("signed in: the entry goes ahead without a prompt", () => {
    expect(resolveMobileJapaneseLearningAuthGate("authenticated")).toEqual({
      allowed: true,
      promptSignIn: false,
    });
  });
  test("signed out: blocked, and sign-in is shown", () => {
    expect(resolveMobileJapaneseLearningAuthGate("unauthenticated")).toEqual({
      allowed: false,
      promptSignIn: true,
    });
  });
  test("still loading: blocked silently", () => {
    expect(resolveMobileJapaneseLearningAuthGate("loading")).toEqual({
      allowed: false,
      promptSignIn: false,
    });
  });
});

describe("resolveMobileJapaneseLearningChatSignInFailure (web streamChat 401)", () => {
  test("loading: web's loading copy, no prompt", () => {
    expect(resolveMobileJapaneseLearningChatSignInFailure(true, "sign in")).toEqual({
      message: MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR,
      promptSignIn: false,
    });
    expect(MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR).toBe(
      "Authentication is still loading. Please try again.",
    );
  });
  test("signed out: the sign-in bubble and the sign-in prompt", () => {
    expect(resolveMobileJapaneseLearningChatSignInFailure(false, "sign in")).toEqual({
      message: "sign in",
      promptSignIn: true,
    });
  });
});

describe("resolveMobileJapaneseLearningSignInHost", () => {
  test("iOS stacks on the topmost learning sheet", () => {
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "ios", chatVisible: true, sentenceVisible: true }),
    ).toBe("chat");
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "ios", chatVisible: false, sentenceVisible: true }),
    ).toBe("sentence");
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "ios", chatVisible: false, sentenceVisible: false }),
    ).toBe("reader");
  });
  test("Android presents from the reader", () => {
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "android", chatVisible: true, sentenceVisible: true }),
    ).toBe("reader");
  });
});
