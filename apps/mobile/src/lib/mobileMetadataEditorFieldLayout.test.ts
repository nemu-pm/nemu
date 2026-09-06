import { describe, expect, test } from "bun:test";
import { stripMobileMetadataFieldNewlines } from "./mobileMetadataEditorFieldLayout";

describe("mobile metadata editor single-line values", () => {
  test("collapses pasted breaks into spaces", () => {
    expect(stripMobileMetadataFieldNewlines("Attack\r\non Titan")).toBe(
      "Attack on Titan"
    );
    expect(
      stripMobileMetadataFieldNewlines("https://example.test/\ncover.jpg")
    ).toBe("https://example.test/ cover.jpg");
  });

  test("collapses a run of breaks into one space", () => {
    expect(stripMobileMetadataFieldNewlines("one\n\n\ntwo")).toBe("one two");
  });

  test("leaves a clean value untouched", () => {
    expect(stripMobileMetadataFieldNewlines("進撃の巨人")).toBe("進撃の巨人");
  });
});
