import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import {
  buildMobileMetadataEditedItem,
  canResetMobileMetadataEditorForm,
  getMobileMetadataFieldOverrideState,
  metadataInputToList,
  mobileMetadataFormFromBase,
  mobileMetadataFormFromEntry,
  resetMobileMetadataField,
} from "./mobileMetadataOverrides";

function libraryEntry(overrides: Partial<LibraryEntry["item"]> = {}): LibraryEntry {
  return {
    item: {
      libraryItemId: "item-1",
      metadata: {
        title: "Base Title",
        cover: "https://example.test/base.jpg",
        authors: ["Author A"],
        description: "Base description",
        tags: ["Action"],
        status: 1,
      },
      inLibrary: true,
      createdAt: 100,
      updatedAt: 100,
      ...overrides,
    },
    sources: [],
  };
}

describe("mobile metadata overrides", () => {
  test("parses comma separated metadata fields with stable de-duplication", () => {
    expect(metadataInputToList(" Action, Drama, Action,  , Sci-Fi ")).toEqual([
      "Action",
      "Drama",
      "Sci-Fi",
    ]);
    expect(metadataInputToList("   ")).toBeUndefined();
  });

  test("builds sparse metadata overrides for edited fields", () => {
    const entry = libraryEntry();
    const edited = buildMobileMetadataEditedItem(
      entry,
      {
        ...mobileMetadataFormFromEntry(entry),
        title: "Custom Title",
        authorsText: "Author A, Author B",
        coverUrl: "https://example.test/custom.jpg",
      },
      500
    );

    expect(edited).toMatchObject({
      updatedAt: 500,
      overrides: {
        metadata: {
          title: "Custom Title",
          authors: ["Author A", "Author B"],
        },
        coverUrl: "https://example.test/custom.jpg",
      },
    });
    expect(edited.overrides?.metadata).not.toHaveProperty("description");
    expect(edited.overrides?.metadata).not.toHaveProperty("tags");
    expect(edited.overrides?.metadata).not.toHaveProperty("status");
  });

  test("reset form removes existing metadata and cover overrides", () => {
    const entry = libraryEntry({
      overrides: {
        metadata: {
          title: "Custom Title",
          description: "Custom description",
          tags: ["Drama"],
        },
        coverUrl: "https://example.test/custom.jpg",
      },
    });

    const edited = buildMobileMetadataEditedItem(entry, mobileMetadataFormFromBase(entry), 600);

    expect(edited.overrides).toBeUndefined();
    expect(edited.updatedAt).toBe(600);
  });

  test("detects field-level overrides relative to source metadata", () => {
    const entry = libraryEntry({
      overrides: {
        metadata: {
          title: "Custom Title",
          status: 2,
          tags: ["Drama"],
        },
        coverUrl: "https://example.test/custom.jpg",
      },
    });

    expect(
      getMobileMetadataFieldOverrideState(
        mobileMetadataFormFromEntry(entry),
        mobileMetadataFormFromBase(entry)
      )
    ).toEqual({
      title: true,
      authorsText: false,
      description: false,
      tagsText: true,
      coverUrl: true,
      status: true,
    });
  });

  test("enables whole-form reset only when the editor has base overrides to clear", () => {
    const entry = libraryEntry();
    const baseForm = mobileMetadataFormFromBase(entry);

    expect(
      canResetMobileMetadataEditorForm({
        form: baseForm,
        baseForm,
        hasSelectedCoverAsset: false,
      }),
    ).toBe(false);
    expect(
      canResetMobileMetadataEditorForm({
        form: { ...baseForm, title: "Custom Title" },
        baseForm,
        hasSelectedCoverAsset: false,
      }),
    ).toBe(true);
    expect(
      canResetMobileMetadataEditorForm({
        form: baseForm,
        baseForm,
        hasSelectedCoverAsset: true,
      }),
    ).toBe(true);
  });

  test("resets one metadata field without discarding the rest of the draft", () => {
    const entry = libraryEntry({
      externalIds: { mal: 1 },
    });
    const baseForm = mobileMetadataFormFromBase(entry);
    const editedForm = {
      ...mobileMetadataFormFromEntry(entry),
      title: "Custom Title",
      authorsText: "Author A, Author B",
      externalIds: { mal: 1, aniList: 22 },
    };

    expect(resetMobileMetadataField(editedForm, baseForm, "title")).toEqual({
      ...editedForm,
      title: "Base Title",
    });
  });

  test("stores empty overrides when the user clears source metadata fields", () => {
    const entry = libraryEntry();
    const edited = buildMobileMetadataEditedItem(
      entry,
      {
        ...mobileMetadataFormFromEntry(entry),
        authorsText: "",
        description: "",
        tagsText: "",
      },
      650
    );

    expect(edited.overrides?.metadata).toEqual({
      authors: [],
      description: "",
      tags: [],
    });
  });

  test("keeps unrelated metadata override keys while editing known fields", () => {
    const entry = libraryEntry({
      overrides: {
        metadata: {
          title: "Custom Title",
          url: "https://example.test/title",
        },
      },
    });

    const edited = buildMobileMetadataEditedItem(
      entry,
      { ...mobileMetadataFormFromEntry(entry), title: "Base Title" },
      700
    );

    expect(edited.overrides).toEqual({
      metadata: {
        url: "https://example.test/title",
      },
    });
  });

  test("carries metadata match external IDs without creating field overrides", () => {
    const entry = libraryEntry({
      externalIds: { mal: 1 },
    });

    const edited = buildMobileMetadataEditedItem(
      entry,
      {
        ...mobileMetadataFormFromEntry(entry),
        externalIds: { mal: 1, aniList: 22 },
      },
      800
    );

    expect(edited.externalIds).toEqual({ mal: 1, aniList: 22 });
    expect(edited.overrides).toBeUndefined();
    expect(edited.updatedAt).toBe(800);
  });
});
