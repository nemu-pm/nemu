import { describe, expect, test } from "bun:test";
import {
  getMobileJapaneseLearningAuthGateStatus,
  MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR,
  resolveMobileJapaneseLearningAuthGate,
  resolveMobileJapaneseLearningChatSignInFailure,
  mobileJapaneseLearningAwaitsSignIn,
  requireMobileJapaneseLearningAuthOrPrompt,
  resolveMobileJapaneseLearningSignInHost,
} from "./mobileJapaneseLearningAuthGate";
import { MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED } from "./mobileJapaneseLearningAuth";

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

describe("requireMobileJapaneseLearningAuthOrPrompt (a server feature's press)", () => {
  function press(auth: { signedIn: boolean; pending: boolean }) {
    const calls = { signIn: 0, request: 0 };
    if (
      requireMobileJapaneseLearningAuthOrPrompt({
        ...auth,
        promptSignIn: () => {
          calls.signIn += 1;
        },
      })
    ) {
      calls.request += 1;
    }
    return calls;
  }
  test("signed out: no request, the sign-in sheet is requested", () => {
    expect(press({ signedIn: false, pending: false })).toEqual({ signIn: 1, request: 0 });
  });
  test("signed in: the request is made, no sign-in sheet", () => {
    expect(press({ signedIn: true, pending: false })).toEqual({ signIn: 0, request: 1 });
  });
  test("session still loading: neither", () => {
    expect(press({ signedIn: false, pending: true })).toEqual({ signIn: 0, request: 0 });
  });
});

describe("resolveMobileJapaneseLearningChatSignInFailure (a 401 past the press's gate)", () => {
  test("loading: web's loading copy, no prompt", () => {
    expect(resolveMobileJapaneseLearningChatSignInFailure(true)).toEqual({
      message: MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR,
      promptSignIn: false,
    });
    expect(MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR).toBe(
      "Authentication is still loading. Please try again.",
    );
  });
  test("signed out: the sign-in prompt and no bubble", () => {
    expect(resolveMobileJapaneseLearningChatSignInFailure(false)).toEqual({
      message: null,
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
  test("iOS stacks on an open transcript, below the chat and the sentence sheet", () => {
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "ios", chatVisible: false, sentenceVisible: false, transcriptVisible: true }),
    ).toBe("transcript");
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "ios", chatVisible: false, sentenceVisible: true, transcriptVisible: true }),
    ).toBe("sentence");
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "android", chatVisible: false, sentenceVisible: false, transcriptVisible: true }),
    ).toBe("reader");
  });
  test("Android presents from the reader", () => {
    expect(
      resolveMobileJapaneseLearningSignInHost({ platform: "android", chatVisible: true, sentenceVisible: true }),
    ).toBe("reader");
  });
});

describe("mobileJapaneseLearningAwaitsSignIn", () => {
  const signIn = MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED;
  test("only an error whose detail is the sign-in marker waits for a session", () => {
    expect(mobileJapaneseLearningAwaitsSignIn({ status: "error", detail: signIn })).toBe(true);
    expect(mobileJapaneseLearningAwaitsSignIn({ status: "error", detail: "OCR /ocr failed: 521" })).toBe(false);
    expect(mobileJapaneseLearningAwaitsSignIn({ status: "ready" })).toBe(false);
    expect(mobileJapaneseLearningAwaitsSignIn({ status: "loading", detail: signIn })).toBe(false);
  });
});
