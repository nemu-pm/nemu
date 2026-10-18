import { describe, expect, test } from "bun:test";
import { DEFAULT_SERVICE_URL, resolveServiceUrl } from "./config";

describe("resolveServiceUrl", () => {
  test("defaults to the hosted service", () => {
    expect(DEFAULT_SERVICE_URL).toBe("https://service.nemu.pm");
    expect(resolveServiceUrl(undefined)).toBe(DEFAULT_SERVICE_URL);
    expect(resolveServiceUrl("")).toBe(DEFAULT_SERVICE_URL);
    expect(resolveServiceUrl("   ")).toBe(DEFAULT_SERVICE_URL);
  });

  test("uses an http(s) override without trailing slashes", () => {
    expect(resolveServiceUrl("http://localhost:3001")).toBe("http://localhost:3001");
    expect(resolveServiceUrl(" http://localhost:3001/ ")).toBe("http://localhost:3001");
    expect(resolveServiceUrl("https://proxy.example//")).toBe("https://proxy.example");
  });

  test("ignores a value that is not an http(s) URL", () => {
    expect(resolveServiceUrl("localhost:3001")).toBe(DEFAULT_SERVICE_URL);
    expect(resolveServiceUrl("ftp://proxy.example")).toBe(DEFAULT_SERVICE_URL);
  });
});
