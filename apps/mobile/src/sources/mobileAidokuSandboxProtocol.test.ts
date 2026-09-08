import { describe, expect, test } from "bun:test";
import {
  parseMobileAidokuSandboxResponse,
  stringifyMobileAidokuSandboxValue,
} from "./mobileAidokuSandboxProtocol";

describe("mobile Aidoku sandbox protocol", () => {
  test("round-trips a successful isolated result", () => {
    expect(
      parseMobileAidokuSandboxResponse<{ entries: string[] }>(
        '{"status":"complete","value":{"entries":["manga"]}}',
      ),
    ).toEqual({ entries: ["manga"] });
  });

  test("surfaces bounded runtime failures", () => {
    expect(() =>
      parseMobileAidokuSandboxResponse(
        '{"status":"error","code":"runtime-failed","detail":"source aborted"}',
      ),
    ).toThrow("source aborted");
  });

  test("rejects malformed and oversized bridge payloads", () => {
    expect(() => parseMobileAidokuSandboxResponse("not-json")).toThrow(
      "malformed JSON",
    );
    expect(() =>
      parseMobileAidokuSandboxResponse("x".repeat(4 * 1024 * 1024 + 1)),
    ).toThrow("invalid response");
  });

  test("rejects non-serializable and oversized operations before native", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => stringifyMobileAidokuSandboxValue(cyclic, "Operation")).toThrow(
      "not serializable",
    );
    expect(() =>
      stringifyMobileAidokuSandboxValue(
        { payload: "x".repeat(2 * 1024 * 1024 + 1) },
        "Operation",
      ),
    ).toThrow("safety limit");
  });

  test("keeps a typed source failure recognizable across the envelope", () => {
    try {
      parseMobileAidokuSandboxResponse(
        '{"status":"error","code":"runtime-failed","detail":"login required",' +
          '"errorName":"AidokuResultError","errorCode":-1}',
      );
      throw new Error("expected the envelope to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("AidokuResultError");
      expect((error as Error).message).toBe("login required");
      expect((error as Error & { code?: number }).code).toBe(-1);
    }
  });

  test("keeps the Cloudflare challenge fields on a blocked round", () => {
    try {
      parseMobileAidokuSandboxResponse(
        '{"status":"error","code":"runtime-failed","detail":"blocked",' +
          '"errorName":"CloudflareBlockedError","errorUrl":"https://host.example/manga",' +
          '"errorHost":"host.example","errorUserAgent":"NemuAgent/1.0"}',
      );
      throw new Error("expected the envelope to throw");
    } catch (error) {
      const blocked = error as Error & {
        url?: string;
        host?: string;
        userAgent?: string;
      };
      expect(blocked.name).toBe("CloudflareBlockedError");
      expect(blocked.url).toBe("https://host.example/manga");
      expect(blocked.host).toBe("host.example");
      expect(blocked.userAgent).toBe("NemuAgent/1.0");
    }
  });

  test("derives the host when the envelope reported only the challenge url", () => {
    try {
      parseMobileAidokuSandboxResponse(
        '{"status":"error","detail":"blocked","errorName":"CloudflareBlockedError",' +
          '"errorUrl":"https://Host.Example:8443/manga?cf=1"}',
      );
      throw new Error("expected the envelope to throw");
    } catch (error) {
      const blocked = error as Error & { url?: string; host?: string };
      expect(blocked.url).toBe("https://Host.Example:8443/manga?cf=1");
      expect(blocked.host).toBe("host.example:8443");
    }
  });

  test("accepts a host that differs from the url only in case", () => {
    try {
      parseMobileAidokuSandboxResponse(
        '{"status":"error","detail":"blocked","errorName":"CloudflareBlockedError",' +
          '"errorUrl":"https://host.example/manga","errorHost":"HOST.example"}',
      );
      throw new Error("expected the envelope to throw");
    } catch (error) {
      const blocked = error as Error & { url?: string; host?: string };
      expect(blocked.url).toBe("https://host.example/manga");
      expect(blocked.host).toBe("HOST.example");
    }
  });

  test("drops an inconsistent or unusable challenge origin", () => {
    // Each of these is a shape a compromised isolate could use to aim the
    // native solver somewhere the request never went. None may survive as a
    // url/host pair, so no solve can be started from the reconstructed error.
    const rejected: Array<[string, string]> = [
      [
        "non-https url",
        '"errorUrl":"http://host.example/manga","errorHost":"host.example"',
      ],
      [
        "non-http scheme",
        '"errorUrl":"javascript:alert(1)","errorHost":"host.example"',
      ],
      [
        "embedded credentials",
        '"errorUrl":"https://user:pass@host.example/manga","errorHost":"host.example"',
      ],
      [
        "mismatched host",
        '"errorUrl":"https://host.example/manga","errorHost":"evil.example"',
      ],
      [
        "host naming only a suffix of the url host",
        '"errorUrl":"https://evil-host.example/manga","errorHost":"host.example"',
      ],
      ["unparsable url", '"errorUrl":"https://","errorHost":"host.example"'],
      [
        "whitespace-padded url",
        '"errorUrl":" https://host.example/manga","errorHost":"host.example"',
      ],
      [
        "oversized url",
        `"errorUrl":"https://host.example/${"a".repeat(2100)}","errorHost":"host.example"`,
      ],
      [
        "oversized host",
        `"errorUrl":"https://host.example/manga","errorHost":"${"h".repeat(300)}"`,
      ],
    ];

    for (const [label, fields] of rejected) {
      try {
        parseMobileAidokuSandboxResponse(
          '{"status":"error","detail":"blocked",' +
            '"errorName":"CloudflareBlockedError","errorUserAgent":"NemuAgent/1.0",' +
            `${fields}}`,
        );
        throw new Error(`expected the envelope to throw for ${label}`);
      } catch (error) {
        const blocked = error as Error & {
          url?: string;
          host?: string;
          userAgent?: string;
        };
        expect(blocked.name, label).toBe("CloudflareBlockedError");
        expect(blocked.url, label).toBeUndefined();
        expect(blocked.host, label).toBeUndefined();
        // The user-agent is not an operational target, so it still rides along.
        expect(blocked.userAgent, label).toBe("NemuAgent/1.0");
      }
    }
  });

  test("refuses to reconstruct an error identity outside the allow-list", () => {
    try {
      parseMobileAidokuSandboxResponse(
        '{"status":"error","detail":"spoofed","errorName":"MobileSourceDisabledError",' +
          '"errorCode":-3,"errorUrl":"https://host.example"}',
      );
      throw new Error("expected the envelope to throw");
    } catch (error) {
      const plain = error as Error & { code?: number; url?: string };
      expect(plain.name).toBe("Error");
      expect(plain.message).toBe("spoofed");
      expect(plain.code).toBeUndefined();
      expect(plain.url).toBeUndefined();
    }
  });

  test("falls back to a bounded message when the envelope has no detail", () => {
    expect(() =>
      parseMobileAidokuSandboxResponse(
        '{"status":"error","errorName":"AidokuResultError","errorCode":-2}',
      ),
    ).toThrow("The isolated Aidoku runtime failed.");
  });

  test("preserves the cover kind in process-cover-image operations", () => {
    const operation = {
      kind: "process-cover-image",
      requestUrl: "https://images.example/cover.jpg",
      requestHeaders: { Referer: "https://source.example" },
      responseCode: 200,
      responseHeaders: { "content-type": "image/jpeg" },
    };

    expect(
      JSON.parse(
        stringifyMobileAidokuSandboxValue(operation, "Aidoku image operation"),
      ),
    ).toEqual(operation);
  });

  test("preserves the normalized listing name in listing-page operations", () => {
    const operation = {
      kind: "listing-page",
      listing: { id: "Updates", name: "Updates" },
      page: 1,
    };

    expect(
      JSON.parse(
        stringifyMobileAidokuSandboxValue(operation, "Aidoku operation"),
      ),
    ).toEqual(operation);
  });
});
