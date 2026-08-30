import { describe, expect, test } from "bun:test";
import { imageSize } from "image-size";
import { findBox } from "image-size/dist/types/utils";

function writeAscii(target: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    target[offset + index] = value.charCodeAt(index);
  }
}

function writeUInt32BE(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

describe("patched image-size container parsing", () => {
  test("rejects zero-sized ISO BMFF boxes instead of returning a non-advancing match", () => {
    const box = new Uint8Array(8);
    writeAscii(box, 4, "meta");

    expect(findBox(box, "meta", 0)).toBeUndefined();
  });

  test("rejects zero-length ICNS entries instead of looping", () => {
    const icon = new Uint8Array(16);
    writeAscii(icon, 0, "icns");
    writeUInt32BE(icon, 4, icon.length);
    writeAscii(icon, 8, "icp4");

    expect(() => imageSize(icon)).toThrow("Invalid ICNS image entry length");
  });

  test("continues to parse a minimally valid ICNS entry", () => {
    const icon = new Uint8Array(16);
    writeAscii(icon, 0, "icns");
    writeUInt32BE(icon, 4, icon.length);
    writeAscii(icon, 8, "icp4");
    writeUInt32BE(icon, 12, 8);

    expect(imageSize(icon)).toMatchObject({ height: 16, width: 16 });
  });
});
