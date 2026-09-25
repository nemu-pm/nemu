import { describe, expect, test } from "bun:test";
import {
  decorateMobileSourceImageRequest,
  type MobileSourceImageRequestDecorator,
} from "./mobileSourceImageDecoration";

const SCOPE = "profile::registry:en.reader";

function recordingDecorator(
  answer: (url: string, headers: Record<string, string>) => Record<string, string> | null,
) {
  const calls: Array<{ sourceKey: string; url: string; headers: Record<string, string> }> = [];
  const decorate: MobileSourceImageRequestDecorator = async (sourceKey, url, headers) => {
    calls.push({ sourceKey, url, headers });
    return answer(url, headers);
  };
  return { calls, decorate };
}

describe("decorateMobileSourceImageRequest", () => {
  test("hands a hook-less request to native under the session's own scope", async () => {
    const { calls, decorate } = recordingDecorator((_url, headers) => ({
      ...headers,
      Cookie: "cf_clearance=abc",
      "User-Agent": "Source/17",
    }));
    const request = await decorateMobileSourceImageRequest(
      { url: "https://cdn.reader.example/c.jpg", headers: {} },
      { sourceKey: SCOPE, isAllowedUrl: () => true, decorate },
    );
    expect(calls).toEqual([
      { sourceKey: SCOPE, url: "https://cdn.reader.example/c.jpg", headers: {} },
    ]);
    expect(request).toEqual({
      url: "https://cdn.reader.example/c.jpg",
      headers: { Cookie: "cf_clearance=abc", "User-Agent": "Source/17" },
    });
  });

  test("an undecorated answer keeps the source's headers exactly (no cache-key churn)", async () => {
    const { decorate } = recordingDecorator((_url, headers) => headers);
    const request = await decorateMobileSourceImageRequest(
      { url: "https://cdn.reader.example/c.jpg", headers: {} },
      { sourceKey: SCOPE, isAllowedUrl: () => true, decorate },
    );
    expect(request).toEqual({ url: "https://cdn.reader.example/c.jpg", headers: {} });
  });

  test("never reaches native for a refused url, and falls back on any failure", async () => {
    const refused = recordingDecorator(() => ({ Cookie: "leak=1" }));
    expect(
      await decorateMobileSourceImageRequest(
        { url: "https://10.0.0.1/c.jpg", headers: { Referer: "https://reader.example/" } },
        { sourceKey: SCOPE, isAllowedUrl: () => false, decorate: refused.decorate },
      ),
    ).toEqual({
      url: "https://10.0.0.1/c.jpg",
      headers: { Referer: "https://reader.example/" },
    });
    expect(refused.calls).toHaveLength(0);

    const base = { url: "https://cdn.reader.example/p.jpg", headers: { Referer: "r" } };
    const fallbacks: Array<MobileSourceImageRequestDecorator | undefined> = [
      undefined,
      async () => null,
      async () => {
        throw new Error("E_SOURCE_COOKIE_SCOPE");
      },
      // Output outside the `modify-image-request` bounds is not trusted.
      async () => ({ "Bad\nName": "x" }),
      async () =>
        Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`X-${index}`, "v"])),
    ];
    for (const decorate of fallbacks) {
      expect(
        await decorateMobileSourceImageRequest(base, {
          sourceKey: SCOPE,
          isAllowedUrl: () => true,
          decorate,
        }),
      ).toEqual(base);
    }
  });

  test("bounds a page's own headers before native sees them", async () => {
    const { calls, decorate } = recordingDecorator((_url, headers) => headers);
    const oversized = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`X-${index}`, "v"]),
    );
    const request = await decorateMobileSourceImageRequest(
      { url: "https://cdn.reader.example/p.jpg", headers: oversized },
      { sourceKey: SCOPE, isAllowedUrl: () => true, decorate },
    );
    expect(calls).toHaveLength(0);
    expect(request.headers).toEqual(oversized);
  });
});
