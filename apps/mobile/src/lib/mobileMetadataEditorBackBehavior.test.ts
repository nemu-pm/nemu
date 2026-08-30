import { describe, expect, test } from "bun:test";
import {
  canSaveMobileMetadataEditorForm,
  canSelectMobileMetadataStatusOption,
  canStartMobileMetadataEditorAction,
  getMobileMetadataEditorRequestCloseAction,
  getMobileMetadataEditorSaveResultAction,
  isMobileMetadataEditorActionBusy,
} from "./mobileMetadataEditorBackBehavior";

describe("mobile metadata editor back behavior", () => {
  test("keeps the sheet open while metadata work is in flight", () => {
    expect(getMobileMetadataEditorRequestCloseAction({ busy: true })).toBe(
      "ignore",
    );
  });

  test("closes the sheet when the editor is idle", () => {
    expect(getMobileMetadataEditorRequestCloseAction({ busy: false })).toBe(
      "close-sheet",
    );
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
