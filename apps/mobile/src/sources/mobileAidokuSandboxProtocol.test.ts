import { describe, expect, test } from "bun:test";
import {
  parseMobileAidokuSandboxResponse,
  stringifyMobileAidokuSandboxValue,
} from "./mobileAidokuSandboxProtocol";

describe("mobile Aidoku sandbox protocol", () => {
  test("round-trips a successful isolated result", () => {
    expect(
      parseMobileAidokuSandboxResponse<{ entries: string[] }>(
        '{"status":"complete","value":{"entries":["manga"]}}',
      ),
    ).toEqual({ entries: ["manga"] });
  });

  test("surfaces bounded runtime failures", () => {
    expect(() =>
      parseMobileAidokuSandboxResponse(
        '{"status":"error","code":"runtime-failed","detail":"source aborted"}',
      ),
    ).toThrow("source aborted");
  });

  test("rejects malformed and oversized bridge payloads", () => {
    expect(() => parseMobileAidokuSandboxResponse("not-json")).toThrow(
      "malformed JSON",
    );
    expect(() =>
      parseMobileAidokuSandboxResponse("x".repeat(4 * 1024 * 1024 + 1)),
    ).toThrow("invalid response");
  });

  test("rejects non-serializable and oversized operations before native", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => stringifyMobileAidokuSandboxValue(cyclic, "Operation")).toThrow(
      "not serializable",
    );
    expect(() =>
      stringifyMobileAidokuSandboxValue(
        { payload: "x".repeat(2 * 1024 * 1024 + 1) },
        "Operation",
      ),
    ).toThrow("safety limit");
  });

  test("preserves the normalized listing name in listing-page operations", () => {
    const operation = {
      kind: "listing-page",
      listing: { id: "Updates", name: "Updates" },
      page: 1,
    };

    expect(
      JSON.parse(
        stringifyMobileAidokuSandboxValue(operation, "Aidoku operation"),
      ),
    ).toEqual(operation);
  });
});
