import { describe, expect, test } from "bun:test";
import {
  MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR,
  MOBILE_COVER_UPLOAD_MAX_BYTES,
  assertMobileCoverUploadByteLength,
  getMobileCoverContentType,
  getMobileCoverPublicUrl,
  uploadMobileCoverBytes,
  uploadMobileRemoteCover,
} from "./mobileCoverUpload";

describe("mobile cover upload helpers", () => {
  test("accepts the cover byte limit exactly and rejects one byte over", () => {
    expect(() =>
      assertMobileCoverUploadByteLength(MOBILE_COVER_UPLOAD_MAX_BYTES),
    ).not.toThrow();
    expect(() =>
      assertMobileCoverUploadByteLength(MOBILE_COVER_UPLOAD_MAX_BYTES + 1),
    ).toThrow("Cover image exceeds");
    expect(() => assertMobileCoverUploadByteLength(Number.NaN)).toThrow(
      "Cover image exceeds",
    );
  });

  test("derives upload content types from picker metadata or URI", () => {
    expect(
      getMobileCoverContentType({ mimeType: "image/webp", uri: "file:///cover.jpg" })
    ).toBe("image/webp");
    expect(getMobileCoverContentType({ uri: "file:///cover.PNG" })).toBe("image/png");
    expect(getMobileCoverContentType({ uri: "file:///cover.heic" })).toBe("image/heic");
    expect(getMobileCoverContentType({ uri: "file:///cover" })).toBe("image/jpeg");
  });

  test("builds public R2 cover URLs", () => {
    expect(getMobileCoverPublicUrl("covers/abc.webp")).toBe(
      "https://r2.nemu.pm/covers/abc.webp"
    );
  });

  test("fails clearly when cloud sync is unavailable", async () => {
    await expect(
      uploadMobileCoverBytes({
        bytes: new Uint8Array([1]),
        client: null,
      })
    ).rejects.toThrow(MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR);
  });

  test("uploads bytes through the R2 client API", async () => {
    const mutationCalls: Array<{ name: string; args: unknown }> = [];
    const client = {
      async mutation(functionReference: unknown, args: unknown) {
        const reference = functionReference as { _name?: string };
        mutationCalls.push({ name: reference._name ?? "unknown", args });
        if (mutationCalls.length === 1) {
          return { key: "covers/generated.jpg", url: "https://upload.test/put" };
        }
        return null;
      },
    };
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 200, statusText: "OK" });
    };

    await expect(
      uploadMobileCoverBytes({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
        client,
        fetcher,
      })
    ).resolves.toBe("https://r2.nemu.pm/covers/generated.jpg");

    expect(mutationCalls.map((call) => call.args)).toEqual([{}, { key: "covers/generated.jpg" }]);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("https://upload.test/put");
    expect(fetchCalls[0]?.init.method).toBe("PUT");
    expect(fetchCalls[0]?.init.headers).toEqual({ "Content-Type": "image/jpeg" });
    expect(fetchCalls[0]?.init.body).toBeInstanceOf(Blob);
  });

  test("fetches remote covers with source headers before uploading to R2", async () => {
    let mutationCount = 0;
    const client = {
      async mutation() {
        mutationCount += 1;
        if (mutationCount === 1) {
          return { key: "covers/remote.webp", url: "https://upload.test/put" };
        }
        return null;
      },
    };
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      if (String(url) === "https://source.test/cover") {
        return new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { "Content-Type": "image/webp" },
        });
      }
      return new Response(null, { status: 200, statusText: "OK" });
    };

    await expect(
      uploadMobileRemoteCover({
        url: "https://source.test/cover",
        headers: { Cookie: "session=1" },
        client,
        fetcher,
      })
    ).resolves.toBe("https://r2.nemu.pm/covers/remote.webp");

    expect(fetchCalls[0]).toEqual({
      url: "https://source.test/cover",
      init: { headers: { Cookie: "session=1" } },
    });
    expect(fetchCalls[1]?.url).toBe("https://upload.test/put");
    expect(fetchCalls[1]?.init.headers).toEqual({ "Content-Type": "image/webp" });
  });
});
