import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import { resolveMobileMetadataEditorCoverSource } from "./mobileMetadataEditorCoverPreview";

function installedSource(id: string): InstalledSource {
  return {
    id,
    registryId: "aidoku-community",
    sourceId: id.split(":").at(-1),
    name: id,
    version: 1,
  };
}

describe("mobile metadata editor cover preview", () => {
  test("uses the fetched source for a source-populated cover", () => {
    const source = installedSource("aidoku-community:en.example");

    expect(
      resolveMobileMetadataEditorCoverSource({
        coverPreview: "https://source.test/cover.jpg",
        hasSelectedCoverAsset: false,
        coverPreviewSourceId: "source-link-1",
        sourceChoices: [{ id: "source-link-1", installedSource: source }],
        initialCoverUrl: "https://initial.test/cover.jpg",
        baseCoverUrl: "https://initial.test/cover.jpg",
      })
    ).toBe(source);
  });

  test("uses the default cover source for the current entry cover", () => {
    const source = installedSource("aidoku-community:en.default");

    expect(
      resolveMobileMetadataEditorCoverSource({
        coverPreview: " https://source.test/base.jpg ",
        hasSelectedCoverAsset: false,
        coverPreviewSourceId: null,
        sourceChoices: [],
        coverSource: source,
        initialCoverUrl: "https://source.test/base.jpg",
        baseCoverUrl: "https://source.test/base.jpg",
      })
    ).toBe(source);
  });

  test("does not use source headers for a manually typed URL", () => {
    const source = installedSource("aidoku-community:en.default");

    expect(
      resolveMobileMetadataEditorCoverSource({
        coverPreview: "https://manual.test/cover.jpg",
        hasSelectedCoverAsset: false,
        coverPreviewSourceId: null,
        sourceChoices: [],
        coverSource: source,
        initialCoverUrl: "https://source.test/base.jpg",
        baseCoverUrl: "https://source.test/base.jpg",
      })
    ).toBeNull();
  });

  test("does not use source headers for a selected local cover asset", () => {
    const source = installedSource("aidoku-community:en.default");

    expect(
      resolveMobileMetadataEditorCoverSource({
        coverPreview: "file:///tmp/cover.jpg",
        hasSelectedCoverAsset: true,
        coverPreviewSourceId: "source-link-1",
        sourceChoices: [{ id: "source-link-1", installedSource: source }],
        coverSource: source,
        initialCoverUrl: "https://source.test/base.jpg",
        baseCoverUrl: "https://source.test/base.jpg",
      })
    ).toBeNull();
  });
});
