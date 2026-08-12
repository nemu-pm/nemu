import { describe, expect, test } from "bun:test";
import type { SourcePackageSetting } from "@/data/schema";
import {
  parseMobileSourceWebSession,
  sourceLoginLogoutKeys,
  sourceLoginStoragePatch,
} from "./mobileSourceSettingActions";

const loginSetting = {
  key: "login",
  title: "Log in",
  type: "login",
  method: "basic",
  localStorageKeys: ["token"],
} as SourcePackageSetting;

describe("mobile source setting credential storage", () => {
  test("builds one complete basic-login patch", () => {
    expect(
      sourceLoginStoragePatch(loginSetting, {
        method: "basic",
        username: "reader@example.com",
        password: "secret",
      }),
    ).toEqual({
      login: "logged_in",
      "login.username": "reader@example.com",
      "login.password": "secret",
    });
  });

  test("builds one complete web-session patch", () => {
    expect(
      sourceLoginStoragePatch(loginSetting, {
        method: "web",
        cookies: { session: "abc", locale: "en" },
        localStorage: { token: "xyz", ignored: "drop-me" },
      }),
    ).toEqual({
      login: "logged_in",
      "login.keys": ["locale", "session"],
      "login.values": ["en", "abc"],
      "login.ls.token": "xyz",
    });
  });

  test("enumerates every stored credential key for logout", () => {
    expect(sourceLoginLogoutKeys(loginSetting)).toEqual([
      "login",
      "login.username",
      "login.password",
      "login.keys",
      "login.values",
      "login.codeVerifier",
      "login.ls.token",
    ]);
  });
});

describe("mobile source web-session parsing", () => {
  test("accepts a cookie header and declared local-storage JSON", () => {
    expect(
      parseMobileSourceWebSession(
        "session=abc; locale=en",
        '{"token":"xyz","ignored":"drop-me"}',
        ["token"],
      ),
    ).toEqual({
      cookies: { session: "abc", locale: "en" },
      localStorage: { token: "xyz" },
    });
  });

  test("rejects unsafe or empty session data", () => {
    expect(() => parseMobileSourceWebSession("", "{}", [])).toThrow(
      "Session data is required.",
    );
    expect(() =>
      parseMobileSourceWebSession("bad\nname=value", "{}", []),
    ).toThrow("Cookie name is invalid.");
  });
});
