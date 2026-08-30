import { beforeEach, describe, expect, mock, test } from "bun:test";

const getRandomValuesMock = mock((bytes: Uint8Array): Uint8Array => {
  bytes.fill(0x5a);
  return bytes;
});

mock.module("expo-crypto", () => ({
  getRandomValues: getRandomValuesMock,
}));

const { fillSecureRandomBytes } = await import("./secureRandom.native");

describe("native secure random adapter", () => {
  beforeEach(() => {
    getRandomValuesMock.mockClear();
  });

  test("delegates in place to expo-crypto's native CSPRNG", () => {
    const bytes = new Uint8Array(32);

    fillSecureRandomBytes(bytes);

    expect(getRandomValuesMock).toHaveBeenCalledTimes(1);
    expect(getRandomValuesMock).toHaveBeenCalledWith(bytes);
    expect(Array.from(bytes)).toEqual(new Array(32).fill(0x5a));
  });
});
