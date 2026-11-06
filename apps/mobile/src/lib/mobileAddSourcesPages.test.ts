import { describe, expect, test } from "bun:test";
import {
  ADD_DIRECTORY_PAGE,
  SERVER_PICKER_PAGE,
  mobileAddSourcesEnteredPages,
  mobileServerFormPage,
  mobileServerFormPageKind,
  mobileServerSourceFormBlocksDismiss,
} from "./mobileAddSourcesPages";

const EMPTY = { server: "", name: "", username: "", password: "", apiKey: "" };

describe("mobileServerFormPageKind", () => {
  test("reads the kind back from a server form's page", () => {
    expect(mobileServerFormPageKind(mobileServerFormPage("kavita"))).toBe("kavita");
  });

  test("other pages name no server", () => {
    expect(mobileServerFormPageKind(undefined)).toBeNull();
    expect(mobileServerFormPageKind(SERVER_PICKER_PAGE)).toBeNull();
    expect(mobileServerFormPageKind(ADD_DIRECTORY_PAGE)).toBeNull();
    expect(mobileServerFormPageKind("server-form:unknown")).toBeNull();
  });
});

describe("mobileServerSourceFormBlocksDismiss", () => {
  test("an untouched form comes down with a swipe", () => {
    expect(mobileServerSourceFormBlocksDismiss(EMPTY, false)).toBe(false);
  });

  test("text in any field blocks it", () => {
    for (const field of Object.keys(EMPTY)) {
      expect(mobileServerSourceFormBlocksDismiss({ ...EMPTY, [field]: "x" }, false)).toBe(true);
    }
  });

  test("a connection in flight blocks it", () => {
    expect(mobileServerSourceFormBlocksDismiss(EMPTY, true)).toBe(true);
  });
});

describe("mobileAddSourcesEnteredPages", () => {
  const form = mobileServerFormPage("komga");

  test("a push enters only the new page", () => {
    expect(mobileAddSourcesEnteredPages([SERVER_PICKER_PAGE], [SERVER_PICKER_PAGE, form])).toEqual([form]);
  });

  test("a pop enters nothing", () => {
    expect(mobileAddSourcesEnteredPages([SERVER_PICKER_PAGE, form], [SERVER_PICKER_PAGE])).toEqual([]);
  });
});
