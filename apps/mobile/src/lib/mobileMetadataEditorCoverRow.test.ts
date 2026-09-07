import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  getMobileMetadataCoverRowState,
  getMobileMetadataCoverRowSubtitle,
} from "./mobileMetadataEditorCoverRow";

const strings = getMobileStrings("en");

describe("mobile metadata cover row state", () => {
  test("a picked image outranks whatever URL the form still holds", () => {
    expect(
      getMobileMetadataCoverRowState({
        hasSelectedCoverAsset: true,
        coverUrl: "https://example.test/cover.jpg",
      }),
    ).toBe("local-pick");
    expect(
      getMobileMetadataCoverRowSubtitle({
        hasSelectedCoverAsset: true,
        coverUrl: "https://example.test/cover.jpg",
        strings,
      }),
    ).toBe(strings.metadataEditor.coverSelected);
  });

  test("shows the cover URL when there is one", () => {
    expect(
      getMobileMetadataCoverRowState({
        hasSelectedCoverAsset: false,
        coverUrl: "  https://example.test/cover.jpg  ",
      }),
    ).toBe("url");
    expect(
      getMobileMetadataCoverRowSubtitle({
        hasSelectedCoverAsset: false,
        coverUrl: "  https://example.test/cover.jpg  ",
        strings,
      }),
    ).toBe("https://example.test/cover.jpg");
  });

  test("has nothing to say about a blank cover", () => {
    for (const coverUrl of ["", "   "]) {
      expect(
        getMobileMetadataCoverRowState({
          hasSelectedCoverAsset: false,
          coverUrl,
        }),
      ).toBe("empty");
      expect(
        getMobileMetadataCoverRowSubtitle({
          hasSelectedCoverAsset: false,
          coverUrl,
          strings,
        }),
      ).toBeUndefined();
    }
  });

  test("localizes the picked-image state", () => {
    const japanese = getMobileStrings("ja");

    expect(
      getMobileMetadataCoverRowSubtitle({
        hasSelectedCoverAsset: true,
        coverUrl: "",
        strings: japanese,
      }),
    ).toBe(japanese.metadataEditor.coverSelected);
  });
});
