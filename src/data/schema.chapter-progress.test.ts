import { describe, expect, test } from "bun:test";
import { LocalChapterProgressSchema } from "./schema";

const CONTENT_IDENTITY =
  `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;

function progress(overrides: Record<string, unknown> = {}) {
  return {
    id: "registry:source:manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: "chapter",
    progress: 0,
    total: 1,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

describe("LocalChapterProgressSchema intra-page state", () => {
  test("accepts absent state and exact boundary fractions", () => {
    expect(LocalChapterProgressSchema.safeParse(progress()).success).toBe(true);
    for (const intraPageProgress of [0, 1]) {
      expect(
        LocalChapterProgressSchema.safeParse(
          progress({
            intraPageProgress,
            intraPageContentIdentity: CONTENT_IDENTITY,
          }),
        ).success,
      ).toBe(true);
    }
  });

  test("strips malformed extensions without losing valid integer progress", () => {
    for (const candidate of [
      { intraPageProgress: 0.5 },
      { intraPageContentIdentity: CONTENT_IDENTITY },
      {
        intraPageProgress: Number.POSITIVE_INFINITY,
        intraPageContentIdentity: CONTENT_IDENTITY,
      },
      {
        intraPageProgress: -0.01,
        intraPageContentIdentity: CONTENT_IDENTITY,
      },
      {
        intraPageProgress: 1.01,
        intraPageContentIdentity: CONTENT_IDENTITY,
      },
      {
        intraPageProgress: 0.5,
        intraPageContentIdentity: CONTENT_IDENTITY.toUpperCase(),
      },
    ]) {
      const parsed = LocalChapterProgressSchema.safeParse(progress(candidate));
      expect(parsed.success).toBe(true);
      if (!parsed.success) continue;
      expect(parsed.data.progress).toBe(0);
      expect(parsed.data).not.toHaveProperty("intraPageProgress");
      expect(parsed.data).not.toHaveProperty("intraPageContentIdentity");
    }
  });
});
