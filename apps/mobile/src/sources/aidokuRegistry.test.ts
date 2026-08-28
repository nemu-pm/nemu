import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchAllAidokuRegistrySources,
  fetchAidokuRegistrySources,
  makeAixArtifactCacheKey,
  isAixArtifactCacheKey,
  MOBILE_AIDOKU_REGISTRY_MAX_RESPONSE_BYTES,
  MOBILE_AIDOKU_REGISTRY_MAX_SOURCES,
  type AidokuRegistryDefinition,
} from "./aidokuRegistry";

const registry: AidokuRegistryDefinition = {
  id: "test",
  name: "Test Registry",
  indexUrl: "https://example.com/sources/index.min.json",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchAllAidokuRegistrySources", () => {
  test("preserves AbortError cancellation instead of aggregating it as a registry error", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchAllAidokuRegistrySources([registry], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("deduplicates identical registry failures before surfacing them", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Unacceptable certificate: CN=Example Root");
    }) as unknown as typeof fetch;

    const registries = [
      registry,
      {
        ...registry,
        id: "second",
        indexUrl: "https://second.example.com/index.json",
      },
    ];

    try {
      await fetchAllAidokuRegistrySources(registries);
      throw new Error("Expected the aggregate registry request to fail.");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Unacceptable certificate: CN=Example Root",
      );
    }
  });
});

function installFetch(data: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("fetchAidokuRegistrySources", () => {
  test("requires HTTPS for the registry index request", async () => {
    let observedRedirect: RequestRedirect | undefined;
    globalThis.fetch = (async (_input, init) => {
      observedRedirect = init?.redirect;
      return new Response(JSON.stringify({ sources: [] }));
    }) as typeof fetch;
    await fetchAidokuRegistrySources(registry);
    expect(observedRedirect).toBe("error");
    await expect(
      fetchAidokuRegistrySources({
        ...registry,
        indexUrl: "http://example.com/index.json",
      }),
    ).rejects.toThrow("requires HTTPS");
  });

  test("normalizes the object Aidoku index format", async () => {
    installFetch({
      sources: [
        {
          id: "en.example",
          name: "Example",
          version: 7,
          iconURL: "icons/example.png",
          downloadURL: "sources/example.aix",
          languages: ["EN"],
          contentRating: 0,
          hasAuthentication: true,
          hasCloudflare: false,
        },
      ],
    });

    await expect(fetchAidokuRegistrySources(registry)).resolves.toEqual([
      {
        id: "en.example",
        registryId: "test",
        registryName: "Test Registry",
        name: "Example",
        version: 7,
        icon: "https://example.com/sources/icons/example.png",
        downloadUrl: "https://example.com/sources/sources/example.aix",
        languages: ["en"],
        contentRating: 0,
        hasAuthentication: true,
        hasCloudflare: false,
      },
    ]);
  });

  test("normalizes legacy array indexes and boolean adult ratings", async () => {
    installFetch([
      {
        id: "zh.example",
        name: "ZH Example",
        file: "zh-example.aix",
        icon: "zh-example.png",
        lang: "ZH_CN",
        version: 3,
        nsfw: true,
        hasWebView: true,
        cloudflare: true,
      },
    ]);

    await expect(fetchAidokuRegistrySources(registry)).resolves.toEqual([
      {
        id: "zh.example",
        registryId: "test",
        registryName: "Test Registry",
        name: "ZH Example",
        version: 3,
        icon: "https://example.com/sources/icons/zh-example.png",
        downloadUrl: "https://example.com/sources/sources/zh-example.aix",
        languages: ["zh-cn"],
        contentRating: 2,
        hasAuthentication: true,
        hasCloudflare: true,
      },
    ]);
  });

  test("rejects an oversized registry response before JSON parsing", async () => {
    globalThis.fetch = (async () =>
      new Response(
        "x".repeat(MOBILE_AIDOKU_REGISTRY_MAX_RESPONSE_BYTES + 1),
      )) as unknown as typeof fetch;

    await expect(fetchAidokuRegistrySources(registry)).rejects.toThrow(
      "byte safety limit",
    );
  });

  test("rejects source-count amplification", async () => {
    installFetch({
      sources: Array.from(
        { length: MOBILE_AIDOKU_REGISTRY_MAX_SOURCES + 1 },
        (_, index) => ({ id: `source-${index}` }),
      ),
    });

    await expect(fetchAidokuRegistrySources(registry)).rejects.toThrow(
      "source safety limit",
    );
  });

  test("drops oversized identities and unsafe artifact schemes", async () => {
    installFetch({
      sources: [
        { id: "x".repeat(257), name: "Too Long" },
        {
          id: "safe",
          name: "Safe",
          downloadURL: "file:///private/source.aix",
          iconURL: "data:image/png;base64,AA==",
        },
        {
          id: "legacy-http",
          name: "Legacy HTTP",
          downloadURL: "http://cdn.example.test/source.aix",
          iconURL: "http://cdn.example.test/source.png",
        },
      ],
    });

    await expect(fetchAidokuRegistrySources(registry)).resolves.toEqual([
      {
        id: "safe",
        registryId: "test",
        registryName: "Test Registry",
        name: "Safe",
        version: 1,
      },
      {
        id: "legacy-http",
        registryId: "test",
        registryName: "Test Registry",
        name: "Legacy HTTP",
        version: 1,
        icon: "http://cdn.example.test/source.png",
      },
    ]);
  });
});

describe("makeAixArtifactCacheKey", () => {
  test("is stable and separates executable versions and locations", () => {
    const base = {
      artifactIdentity: "https://example.com/source.aix",
      registryId: "registry",
      sourceId: "en.example",
      version: 1,
    };

    const first = makeAixArtifactCacheKey(base);
    expect(isAixArtifactCacheKey(first)).toBe(true);
    expect(isAixArtifactCacheKey("aix:aidoku-community:en.example")).toBe(
      false,
    );
    expect(first).toBe(makeAixArtifactCacheKey(base));
    expect(first).not.toBe(makeAixArtifactCacheKey({ ...base, version: 2 }));
    expect(first).not.toBe(
      makeAixArtifactCacheKey({
        ...base,
        artifactIdentity: "https://cdn.example.com/source.aix",
      }),
    );
    expect(first).toMatch(/^aix:[0-9a-f]{64}$/);
  });
});
