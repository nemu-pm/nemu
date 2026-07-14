import { describe, expect, test } from "bun:test";
import { getMobileImageUriPolicy } from "./mobileImageUriPolicy";

describe("getMobileImageUriPolicy", () => {
  test.each([
    "https://cdn.example/cover.jpg",
    "http://images.example/icon.png?size=2",
  ])("allows source-owned remote URL %s", (uri) => {
    expect(getMobileImageUriPolicy(uri, "source")).toEqual({
      allowed: true,
      kind: "source-remote",
      error: null,
    });
  });

  test.each([
    "file:///private/cover.jpg",
    "content://media/external/images/1",
    "data:image/png;base64,AAAA",
    "blob:https://nemu.pm/id",
    "javascript:alert(1)",
    "custom://source/icon",
    " https://cdn.example/icon.png",
    "https://",
  ])("blocks untrusted source URI %s", (uri) => {
    expect(getMobileImageUriPolicy(uri, "source")).toMatchObject({
      allowed: false,
      kind: "blocked",
    });
  });

  test.each([
    "file:///private/cover.jpg",
    "content://media/external/images/1",
    "data:image/jpeg;base64,AAAA",
    "blob:https://nemu.pm/id",
    "asset:/cover.png",
    "ph://photo-id",
    "assets-library://asset/id=1",
  ])("allows explicitly app-owned local URI %s", (uri) => {
    expect(getMobileImageUriPolicy(uri, "app")).toEqual({
      allowed: true,
      kind: "app-local",
      error: null,
    });
  });

  test.each([
    "https://cdn.example/cover.jpg",
    "http://images.example/icon.png",
    "data:text/html;base64,AAAA",
    "data:image/svg+xml,<svg></svg>",
    "javascript:alert(1)",
    "custom://app/icon",
    "/private/cover.jpg",
  ])("blocks non-local app-owned URI %s", (uri) => {
    expect(getMobileImageUriPolicy(uri, "app")).toMatchObject({
      allowed: false,
      kind: "blocked",
    });
  });
});
