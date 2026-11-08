import { describe, expect, test } from "bun:test";
import { mobileSourceLoginTitle } from "./mobileSourceLoginTitle";

describe("mobileSourceLoginTitle", () => {
  test("a title that only says log in gives way to the localized one", () => {
    for (const title of ["LOGIN", "Login", "login", "Log In", "SIGN IN", "sign-in", "ログイン", "登录", ""]) {
      expect(mobileSourceLoginTitle(title, "Log In")).toBe("Log In");
    }
    expect(mobileSourceLoginTitle(null, "ログイン")).toBe("ログイン");
    expect(mobileSourceLoginTitle(undefined, "登录")).toBe("登录");
  });

  test("other all-caps Latin text is set in title case", () => {
    expect(mobileSourceLoginTitle("MANGA PLUS ACCOUNT", "Log In")).toBe("Manga Plus Account");
  });

  test("anything else stays as the source wrote it", () => {
    expect(mobileSourceLoginTitle("Sign in with Komga", "Log In")).toBe("Sign in with Komga");
    expect(mobileSourceLoginTitle("少年ジャンプ+ アカウント", "Log In")).toBe("少年ジャンプ+ アカウント");
    expect(mobileSourceLoginTitle("A", "Log In")).toBe("A");
  });
});
