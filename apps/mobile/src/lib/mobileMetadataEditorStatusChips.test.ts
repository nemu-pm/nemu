import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import { MOBILE_MANGA_STATUS_OPTIONS } from "./mobileMetadataOverrides";
import {
  getMobileMetadataStatusChipModels,
  getMobileMetadataStatusLabel,
} from "./mobileMetadataEditorStatusChips";

const strings = getMobileStrings("en");

describe("mobile metadata status chips", () => {
  test("keeps the editor's status order and localized labels", () => {
    const chips = getMobileMetadataStatusChipModels({ status: 0, strings });

    expect(chips.map((chip) => chip.value)).toEqual(
      MOBILE_MANGA_STATUS_OPTIONS.map((option) => option.value),
    );
    expect(chips.map((chip) => chip.label)).toEqual([
      strings.metadataEditor.statusUnknown,
      strings.metadataEditor.statusOngoing,
      strings.metadataEditor.statusCompleted,
      strings.metadataEditor.statusCancelled,
      strings.metadataEditor.statusHiatus,
    ]);
  });

  test("selects exactly the current status", () => {
    const chips = getMobileMetadataStatusChipModels({ status: 2, strings });

    expect(chips.filter((chip) => chip.selected).map((chip) => chip.value)).toEqual([
      2,
    ]);
  });

  test("falls back to the unknown chip for an unrecognised status", () => {
    const chips = getMobileMetadataStatusChipModels({ status: 9, strings });

    expect(chips.some((chip) => chip.selected)).toBe(false);
    expect(getMobileMetadataStatusLabel(9, strings)).toBe(
      strings.metadataEditor.statusUnknown,
    );
  });

  test("names the chip action for assistive technology", () => {
    const chips = getMobileMetadataStatusChipModels({ status: 0, strings });

    expect(chips[1]?.accessibilityLabel).toBe(
      `Set status to ${strings.metadataEditor.statusOngoing}`,
    );
  });

  test("localizes labels with the app language", () => {
    const japanese = getMobileStrings("ja");
    const chips = getMobileMetadataStatusChipModels({
      status: 1,
      strings: japanese,
    });

    expect(chips[1]?.label).toBe(japanese.metadataEditor.statusOngoing);
    expect(chips[1]?.label).not.toBe(strings.metadataEditor.statusOngoing);
  });
});
