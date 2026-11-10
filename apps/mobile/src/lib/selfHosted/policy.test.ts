import { describe, expect, test } from "bun:test";
import { isBlockedByAppTransportSecurity, selfHostedKindTakesApiKey } from "./policy";

describe("self-hosted policy", () => {
  test("plain http to a domain name is what App Transport Security refuses", () => {
    // Refused in a Release build on the simulator (iOS 27.2) with the app's ATS settings.
    expect(isBlockedByAppTransportSecurity("http://10-10-10-36.nip.io:4567")).toBe(true);
    expect(isBlockedByAppTransportSecurity("http://manga.example.synology.me:4567")).toBe(true);
    expect(isBlockedByAppTransportSecurity("http://nas.tail1234.ts.net:4567/suwayomi")).toBe(true);
    expect(isBlockedByAppTransportSecurity("http://nas.lan:4567")).toBe(true);
    // Allowed: IP addresses (LAN, Tailscale), .local and unqualified names, https.
    expect(isBlockedByAppTransportSecurity("http://192.168.1.20:4567")).toBe(false);
    expect(isBlockedByAppTransportSecurity("http://100.101.102.103:4567")).toBe(false);
    expect(isBlockedByAppTransportSecurity("http://[fd00::20]:4567")).toBe(false);
    expect(isBlockedByAppTransportSecurity("http://nas.local:4567")).toBe(false);
    expect(isBlockedByAppTransportSecurity("http://nas:4567")).toBe(false);
    expect(isBlockedByAppTransportSecurity("https://manga.example.com")).toBe(false);
  });

  test("Suwayomi has no API keys", () => {
    expect(selfHostedKindTakesApiKey("suwayomi")).toBe(false);
    expect(selfHostedKindTakesApiKey("komga")).toBe(true);
    expect(selfHostedKindTakesApiKey("kavita")).toBe(true);
  });
});
