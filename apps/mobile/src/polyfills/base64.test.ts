import { describe, expect, test } from "bun:test";
import { simpleAtob, simpleBtoa } from "./base64";

describe("JSC base64 polyfill", () => {
  test("round-trips every latin1 byte value through btoa and atob", () => {
    let binary = "";
    for (let code = 0; code < 256; code += 1) {
      binary += String.fromCharCode(code);
    }

    const encoded = simpleBtoa(binary);
    expect(encoded).toBe(Buffer.from(binary, "latin1").toString("base64"));
    expect(simpleAtob(encoded)).toBe(binary);
  });

  test("matches the host implementation on padded and unpadded input", () => {
    for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar"]) {
      const encoded = simpleBtoa(text);
      expect(encoded).toBe(btoa(text));
      expect(simpleAtob(encoded)).toBe(text);
      expect(simpleAtob(encoded.replace(/=+$/, ""))).toBe(text);
    }
  });

  test("ignores ASCII whitespace the way forgiving-base64 requires", () => {
    expect(simpleAtob(" Zm9v\n YmFy\t")).toBe("foobar");
  });

  test("rejects input outside the base64 alphabet or with a dangling sextet", () => {
    expect(() => simpleAtob("Zm9v*")).toThrow("not correctly encoded");
    expect(() => simpleAtob("Zm9vY")).toThrow("not correctly encoded");
    expect(() => simpleAtob("Zm9v===")).toThrow("not correctly encoded");
    expect(() => simpleAtob("猫")).toThrow("not correctly encoded");
  });

  test("refuses to encode characters above latin1", () => {
    expect(() => simpleBtoa("猫")).toThrow("Latin1");
  });

  test("decodes the base64 tables that entities evaluates at module load", () => {
    // entities >= 7 decodes its named-character tables with atob while its
    // module initialises; the sandbox must return the exact byte string.
    const table = simpleAtob("QR08ALkAAgH6AYsDNQR2");
    expect(table).toBe(Buffer.from("QR08ALkAAgH6AYsDNQR2", "base64").toString("latin1"));
    expect(table.length).toBe(15);
  });
});
