import { describe, expect, test } from "bun:test";
import { getAuthCrossSubDomainCookieConfig } from "../convex/authCookiePolicy";

const crossSubDomain = { enabled: true, domain: ".nemu.pm" };

describe("auth cross-subdomain cookie policy", () => {
  test("enables .nemu.pm cookies only for a matching https response host", () => {
    expect(getAuthCrossSubDomainCookieConfig("https://auth.nemu.pm")).toEqual(
      crossSubDomain,
    );
    expect(getAuthCrossSubDomainCookieConfig("https://nemu.pm")).toEqual(
      crossSubDomain,
    );
    expect(getAuthCrossSubDomainCookieConfig("https://NEMU.PM/")).toEqual(
      crossSubDomain,
    );
    expect(getAuthCrossSubDomainCookieConfig("https://api.nemu.pm.")).toEqual(
      crossSubDomain,
    );
  });

  test("uses host-only cookies on Convex hosts", () => {
    expect(
      getAuthCrossSubDomainCookieConfig(
        "https://fastidious-hare-966.convex.site",
      ),
    ).toBeNull();
  });

  test("fails closed on lookalike hosts, insecure schemes, and bad config", () => {
    expect(
      getAuthCrossSubDomainCookieConfig("https://nemu.pm.evil.example"),
    ).toBeNull();
    expect(getAuthCrossSubDomainCookieConfig("https://evilnemu.pm")).toBeNull();
    expect(
      getAuthCrossSubDomainCookieConfig("https://nemu.pm@evil.example"),
    ).toBeNull();
    expect(getAuthCrossSubDomainCookieConfig("http://nemu.pm")).toBeNull();
    expect(getAuthCrossSubDomainCookieConfig("not a url")).toBeNull();
    expect(getAuthCrossSubDomainCookieConfig("")).toBeNull();
    expect(getAuthCrossSubDomainCookieConfig(undefined)).toBeNull();
  });
});
