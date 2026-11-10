import { describe, expect, test } from "bun:test";
import {
  scrubCrashReportBreadcrumb,
  scrubCrashReportEvent,
  scrubCrashReportSpan,
  scrubCrashReportText,
  scrubCrashReportUrl,
  scrubPagePath,
} from "./crash-reporting";

describe("scrubCrashReportUrl", () => {
  test("replaces source, image and self-hosted server URLs entirely", () => {
    expect(scrubCrashReportUrl("https://mangadex.org/title/abc/one-piece?tab=art#x")).toBe(
      "https://[redacted]",
    );
    expect(scrubCrashReportUrl("http://192.168.1.20:4567/api/v1/manga/12/chapter/3")).toBe(
      "http://[redacted]",
    );
    expect(scrubCrashReportUrl("https://user:pass@komga.home.example/api/v1/books")).toBe(
      "https://[redacted]",
    );
    expect(scrubCrashReportUrl("wss://suwayomi.local/api/graphql")).toBe("wss://[redacted]");
    expect(scrubCrashReportUrl("file:///var/mobile/Documents/downloads/One%20Piece/1.cbz")).toBe(
      "file://[redacted]",
    );
  });

  test("keeps first-party API paths but drops queries, fragments and userinfo", () => {
    expect(
      scrubCrashReportUrl("https://happy-otter-123.convex.cloud/api/query?token=abc"),
    ).toBe("https://happy-otter-123.convex.cloud/api/query");
    expect(
      scrubCrashReportUrl(
        "https://service.nemu.pm/proxy?url=https%3A%2F%2Fsource.example%2Fmanga%2F1",
      ),
    ).toBe("https://service.nemu.pm/proxy");
    expect(scrubCrashReportUrl("https://me:secret@ocr.nemu.pm/v1/ocr#frag")).toBe(
      "https://ocr.nemu.pm/v1/ocr",
    );
    // A look-alike host is not first-party.
    expect(scrubCrashReportUrl("https://nemu.pm.evil.example/x")).toBe("https://[redacted]");
    expect(scrubCrashReportUrl("https://notnemu.pm/x")).toBe("https://[redacted]");
  });

  test("keeps only the first path segment of the web app's pages", () => {
    expect(
      scrubCrashReportUrl("https://nemu.pm/sources/aidoku/en.mangadex/abc-123/ch-9?page=3"),
    ).toBe("https://nemu.pm/sources/[redacted]/[redacted]/[redacted]/[redacted]");
    expect(scrubCrashReportUrl("https://nemu.pm/search?q=one+piece")).toBe("https://nemu.pm/search");
    expect(scrubCrashReportUrl("https://nemu.pm/")).toBe("https://nemu.pm/");
    expect(
      scrubCrashReportUrl("http://localhost:5662/library/abc", { pageHosts: ["localhost:5662"] }),
    ).toBe("http://localhost:5662/library/[redacted]");
  });

  test("keeps deep-link actions and the app bundle, nothing after them", () => {
    expect(scrubCrashReportUrl("aidoku://addSourceList?url=https://example.org/index.json")).toBe(
      "aidoku://addSourceList",
    );
    expect(scrubCrashReportUrl("app:///main.jsbundle")).toBe("app:///main.jsbundle");
  });
});

describe("scrubPagePath", () => {
  test("keeps route templates and the first segment", () => {
    expect(scrubPagePath("/sources/$registryId/$sourceId/$mangaId")).toBe(
      "/sources/$registryId/$sourceId/$mangaId",
    );
    expect(scrubPagePath("/sources/[registryId]/[sourceId]")).toBe("/sources/[registryId]/[sourceId]");
    expect(scrubPagePath("/library/collection/abc?x=1")).toBe("/library/[redacted]/[redacted]");
    expect(scrubPagePath("/")).toBe("/");
  });
});

describe("scrubCrashReportText", () => {
  test("replaces URLs inside messages and keeps trailing punctuation", () => {
    expect(
      scrubCrashReportText("Failed to fetch https://manga.example/chapter/1?x=y. Retrying"),
    ).toBe("Failed to fetch https://[redacted]. Retrying");
  });

  test("replaces credentials, emails and IP addresses", () => {
    expect(scrubCrashReportText("Authorization: Bearer abcdefghijklmnop")).toBe(
      "Authorization: [redacted]",
    );
    expect(scrubCrashReportText("header Bearer abc.def-123")).toBe("header Bearer [redacted]");
    expect(scrubCrashReportText("Basic dXNlcjpwYXNz failed")).toBe("Basic [redacted] failed");
    expect(
      scrubCrashReportText("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl here"),
    ).toBe("jwt [redacted] here");
    expect(scrubCrashReportText('{"accessToken":"abc123","x":1}')).toBe(
      '{"accessToken":"[redacted]","x":1}',
    );
    expect(scrubCrashReportText("cookie better-auth.session_token=xyz.sig; Path=/")).toBe(
      "cookie better-auth.session_token=[redacted]; Path=/",
    );
    expect(scrubCrashReportText("ott=abc123 password: hunter2 api_key=k")).toBe(
      "ott=[redacted] password: [redacted] api_key=[redacted]",
    );
    expect(scrubCrashReportText("signed in as someone@example.com")).toBe("signed in as [email]");
    expect(scrubCrashReportText("connect ECONNREFUSED 10.0.0.2:8080")).toBe(
      "connect ECONNREFUSED [ip]:8080",
    );
  });

  test("leaves ordinary error text alone", () => {
    for (const text of [
      "JSON Parse error: Unexpected token: <",
      "TypeError: undefined is not an object (evaluating 'a.b')",
      "Network request failed",
      "Version 1.0.0 build 202611101200",
    ]) {
      expect(scrubCrashReportText(text)).toBe(text);
    }
  });
});

describe("scrubCrashReportBreadcrumb", () => {
  test("drops info console breadcrumbs and reduces warnings to a scrubbed line", () => {
    expect(
      scrubCrashReportBreadcrumb({ category: "console", level: "log", message: "x" }),
    ).toBeNull();
    const warning = scrubCrashReportBreadcrumb({
      category: "console",
      level: "warning",
      message: `loading https://source.example/manga/1 ${"a".repeat(400)}`,
      data: { arguments: ["https://source.example/manga/1", { title: "One Piece" }] },
    });
    expect(warning?.data).toBeUndefined();
    expect(warning?.message?.startsWith("loading https://[redacted] ")).toBe(true);
    expect(warning?.message?.length).toBe(300);
  });

  test("keeps method and status of HTTP breadcrumbs with the URL scrubbed", () => {
    const crumb = scrubCrashReportBreadcrumb({
      category: "fetch",
      data: {
        method: "GET",
        url: "https://img.source.example/covers/1.jpg?token=t",
        status_code: 404,
        request_headers: { Authorization: "Bearer x" },
      },
    });
    expect<unknown>(crumb?.data).toEqual({ method: "GET", url: "https://[redacted]", status_code: 404 });
  });

  test("reduces navigation, DOM and touch breadcrumbs", () => {
    expect(
      scrubCrashReportBreadcrumb({
        category: "navigation",
        data: { from: "/sources/aidoku/x/manga-1", to: "https://nemu.pm/library/abc?y=1" },
      })?.data,
    ).toEqual({
      from: "/sources/[redacted]/[redacted]/[redacted]",
      to: "https://nemu.pm/library/[redacted]",
    });
    expect(
      scrubCrashReportBreadcrumb({
        category: "ui.click",
        message: 'div.grid > img.cover[alt="One Piece"][title=\'Vol 1\']',
      })?.message,
    ).toBe("div.grid > img.cover[alt][title]");
    const touch = scrubCrashReportBreadcrumb({
      category: "touch",
      message: "Touch event within element: One Piece",
      data: { path: [{ name: "MangaCard", label: "One Piece" }] },
    });
    expect<unknown>(
      scrubCrashReportBreadcrumb({
        category: "ui.lifecycle",
        type: "navigation",
        data: { screen: "RNSScreen", title: "One Piece", parentViewController: "RNSNavigationController" },
      })?.data,
    ).toEqual({ screen: "RNSScreen", parentViewController: "RNSNavigationController" });
    expect(touch?.message).toBe("Touch event");
    expect<unknown>(touch?.data).toEqual({ path: [{ name: "MangaCard" }] });
  });
});

describe("scrubCrashReportSpan", () => {
  test("scrubs HTTP and resource span descriptions and drops host attributes", () => {
    const span = scrubCrashReportSpan({
      op: "http.client",
      description: "GET https://source.example/api/manga?q=one",
      data: {
        url: "https://source.example/api/manga",
        "http.query": "?q=one",
        "server.address": "source.example",
        "http.response.status_code": 200,
      },
    });
    expect(span.description).toBe("GET https://[redacted]");
    expect<unknown>(span.data).toEqual({ url: "https://[redacted]", "http.response.status_code": 200 });
    expect(scrubCrashReportSpan({ op: "navigation", description: "/library/abc" }).description).toBe(
      "/library/[redacted]",
    );
  });
});

describe("scrubCrashReportEvent", () => {
  test("removes identity, request secrets and URLs from an error event", () => {
    const event = scrubCrashReportEvent({
      user: { id: "u1", email: "a@b.co", ip_address: "{{auto}}" },
      server_name: "Alans-iPhone",
      message: "Request to https://manga.example/x failed",
      exception: {
        values: [
          {
            value: "Failed to load http://10.0.0.5:8080/books/9?apikey=k",
            stacktrace: {
              frames: [
                { filename: "app:///main.jsbundle", abs_path: "app:///main.jsbundle" },
                { filename: "https://nemu.pm/assets/index-abc.js" },
                { filename: "https://cdn.source.example/extensions/en/x/index.js" },
              ],
            },
          },
        ],
      },
      request: {
        url: "https://nemu.pm/sources/aidoku/en.x/manga-1?ott=abc",
        query_string: "ott=abc",
        cookies: { "better-auth.session_token": "x" },
        headers: {
          "User-Agent": "Mozilla/5.0",
          Referer: "https://nemu.pm/library/abc?x=1",
          Cookie: "a=b",
          Authorization: "Bearer x",
        },
      },
      breadcrumbs: [
        { category: "console", level: "info", message: "hi" },
        { category: "fetch", data: { url: "https://source.example/a?b=c", method: "GET" } },
      ],
      transaction: "/sources/aidoku/en.x/manga-1",
      extra: { sourceUrl: "https://source.example/manga/1", nested: { refreshToken: "r" } },
      contexts: { app: { app_version: "1.0.1", device_app_hash: "6c64bde16c85" } },
    });

    expect(event.user).toBeUndefined();
    expect(event.server_name).toBeUndefined();
    expect(event.message).toBe("Request to https://[redacted] failed");
    expect(event.exception.values[0]!.value).toBe("Failed to load http://[redacted]");
    expect(event.exception.values[0]!.stacktrace.frames.map((frame) => frame.filename)).toEqual([
      "app:///main.jsbundle",
      "https://nemu.pm/assets/index-abc.js",
      "https://[redacted]",
    ]);
    expect<unknown>(event.request).toEqual({
      url: "https://nemu.pm/sources/[redacted]/[redacted]/[redacted]",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://nemu.pm/library/[redacted]" },
    });
    expect(event.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "https://[redacted]", method: "GET" } },
    ]);
    expect(event.transaction).toBe("/sources/[redacted]/[redacted]/[redacted]");
    expect(event.extra).toEqual({
      sourceUrl: "https://[redacted]",
      nested: { refreshToken: "[redacted]" },
    });
    expect<unknown>(event.contexts).toEqual({ app: { app_version: "1.0.1" } });
  });

  test("is idempotent and keeps IPv6 hosts in one piece", () => {
    const text = "GET http://[fe80::1]:8080/manga/1?x=y and https://nemu.pm/library/abc";
    const once = scrubCrashReportText(text);
    expect(once).toBe("GET http://[redacted] and https://nemu.pm/library/[redacted]");
    expect(scrubCrashReportText(once)).toBe(once);
  });

  test("scrubs the spans of a transaction event", () => {
    const event = scrubCrashReportEvent({
      transaction: "/library/abc",
      spans: [{ op: "resource.img", description: "https://img.example/cover.jpg" }],
    });
    expect(event.transaction).toBe("/library/[redacted]");
    expect(event.spans[0]!.description).toBe("https://[redacted]");
  });
});
