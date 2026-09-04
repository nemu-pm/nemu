import { describe, expect, test } from "bun:test";
import {
  canSaveMobileMetadataEditorForm,
  canSelectMobileMetadataStatusOption,
  canStartMobileMetadataEditorAction,
  getMobileMetadataEditorDirtyFields,
  getMobileMetadataEditorRequestCloseAction,
  getMobileMetadataEditorSaveResultAction,
  isMobileMetadataEditorActionBusy,
  type MobileMetadataEditorFormSnapshot,
} from "./mobileMetadataEditorBackBehavior";

const BASE_FORM: MobileMetadataEditorFormSnapshot = {
  title: "Frieren",
  authorsText: "Kanehito Yamada",
  description: "After the hero party.",
  tagsText: "Fantasy",
  coverUrl: "https://example.test/cover.jpg",
  status: 1,
};

describe("mobile metadata editor back behavior", () => {
  test("keeps the sheet open while metadata work is in flight", () => {
    expect(
      getMobileMetadataEditorRequestCloseAction({ busy: true, dirty: false }),
    ).toBe("ignore");
    // In-flight work outranks the draft: a save can still land.
    expect(
      getMobileMetadataEditorRequestCloseAction({ busy: true, dirty: true }),
    ).toBe("ignore");
  });

  test("closes the sheet when the editor is idle and untouched", () => {
    expect(
      getMobileMetadataEditorRequestCloseAction({ busy: false, dirty: false }),
    ).toBe("close-sheet");
  });

  test("confirms before an idle sheet throws away a dirty draft", () => {
    expect(
      getMobileMetadataEditorRequestCloseAction({ busy: false, dirty: true }),
    ).toBe("confirm-discard");
  });

  test("names the changed fields in editor order", () => {
    expect(
      getMobileMetadataEditorDirtyFields({
        form: BASE_FORM,
        initialForm: BASE_FORM,
        hasSelectedCoverAsset: false,
      }),
    ).toEqual([]);

    expect(
      getMobileMetadataEditorDirtyFields({
        form: {
          ...BASE_FORM,
          status: 2,
          description: "Rewritten.",
          title: "Frieren: Beyond Journey's End",
        },
        initialForm: BASE_FORM,
        hasSelectedCoverAsset: false,
      }),
    ).toEqual(["title", "description", "status"]);

    expect(
      getMobileMetadataEditorDirtyFields({
        form: { ...BASE_FORM, authorsText: "Tsukasa Abe", tagsText: "Drama" },
        initialForm: BASE_FORM,
        hasSelectedCoverAsset: false,
      }),
    ).toEqual(["authors", "tags"]);
  });

  test("counts a picked cover asset as a cover change", () => {
    expect(
      getMobileMetadataEditorDirtyFields({
        form: BASE_FORM,
        initialForm: BASE_FORM,
        hasSelectedCoverAsset: true,
      }),
    ).toEqual(["cover"]);
    // A picked asset and an edited URL still report the cover once.
    expect(
      getMobileMetadataEditorDirtyFields({
        form: { ...BASE_FORM, coverUrl: "https://example.test/other.jpg" },
        initialForm: BASE_FORM,
        hasSelectedCoverAsset: true,
      }),
    ).toEqual(["cover"]);
  });

  test("keeps the editor open after failed saves so the draft is preserved", () => {
    expect(getMobileMetadataEditorSaveResultAction({ saved: true })).toBe(
      "close-sheet",
    );
    expect(getMobileMetadataEditorSaveResultAction({ saved: false })).toBe(
      "keep-open",
    );
  });

  test("gates editor actions while any metadata work is active", () => {
    const idle = {
      saving: false,
      searchingMatches: false,
      applyingMatch: false,
      fetchingSource: false,
      pickingCover: false,
      uploadingCover: false,
    };

    expect(isMobileMetadataEditorActionBusy(idle)).toBe(false);
    expect(canStartMobileMetadataEditorAction(idle)).toBe(true);
    expect(canStartMobileMetadataEditorAction({ ...idle, saving: true })).toBe(false);
    expect(canStartMobileMetadataEditorAction({ ...idle, searchingMatches: true })).toBe(false);
    expect(canStartMobileMetadataEditorAction({ ...idle, applyingMatch: true })).toBe(false);
    expect(canStartMobileMetadataEditorAction({ ...idle, fetchingSource: true })).toBe(false);
    expect(canStartMobileMetadataEditorAction({ ...idle, pickingCover: true })).toBe(false);
    expect(canStartMobileMetadataEditorAction({ ...idle, uploadingCover: true })).toBe(false);
  });

  test("gates save by dirty state, title, and active work", () => {
    const idle = {
      saving: false,
      searchingMatches: false,
      applyingMatch: false,
      fetchingSource: false,
      pickingCover: false,
      uploadingCover: false,
    };

    expect(
      canSaveMobileMetadataEditorForm({ dirty: true, title: " Frieren ", state: idle }),
    ).toBe(true);
    expect(
      canSaveMobileMetadataEditorForm({ dirty: false, title: "Frieren", state: idle }),
    ).toBe(false);
    expect(
      canSaveMobileMetadataEditorForm({ dirty: true, title: "   ", state: idle }),
    ).toBe(false);
    expect(
      canSaveMobileMetadataEditorForm({
        dirty: true,
        title: "Frieren",
        state: { ...idle, uploadingCover: true },
      }),
    ).toBe(false);
  });

  test("gates selected metadata status chips as no-op selections", () => {
    expect(
      canSelectMobileMetadataStatusOption({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileMetadataStatusOption({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileMetadataStatusOption({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });
});
