import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { installArrayFindLast } from "./arrayFindLast";

describe("JSC Array reverse-search polyfill", () => {
  test("implements findLast and findLastIndex with spec-shaped descriptors", () => {
    const prototype = {} as {
      findLast?: (predicate: unknown, ...args: [unknown?]) => unknown;
      findLastIndex?: (predicate: unknown, ...args: [unknown?]) => number;
    };
    installArrayFindLast({ prototype });

    const findLast = prototype.findLast;
    const findLastIndex = prototype.findLastIndex;
    if (!findLast || !findLastIndex) {
      throw new Error("Expected both reverse-search methods to be installed.");
    }

    const values = [1, 2, 3, 2];
    expect(Reflect.apply(findLast, values, [(value: number) => value === 2])).toBe(2);
    expect(
      Reflect.apply(findLastIndex, values, [(value: number) => value === 2]),
    ).toBe(3);
    expect(findLast.length).toBe(1);
    expect(findLastIndex.length).toBe(1);
    expect(Object.getOwnPropertyDescriptor(prototype, "findLast")).toMatchObject({
      configurable: true,
      enumerable: false,
      writable: true,
    });
  });

  test("supports generic receivers, thisArg, and sparse-array visits", () => {
    const prototype = {} as {
      findLast?: (predicate: unknown, ...args: [unknown?]) => unknown;
      findLastIndex?: (predicate: unknown, ...args: [unknown?]) => number;
    };
    installArrayFindLast({ prototype });
    const findLast = prototype.findLast!;
    const findLastIndex = prototype.findLastIndex!;
    const receiver = { 0: "first", 2: "last", length: 3 };
    const context = { expected: "last" };

    expect(
      Reflect.apply(findLast, receiver, [
        function (this: typeof context, value: unknown) {
          return value === this.expected;
        },
        context,
      ]),
    ).toBe("last");
    const visited: Array<[unknown, number]> = [];
    expect(
      Reflect.apply(findLastIndex, receiver, [
        (value: unknown, index: number) => {
          visited.push([value, index]);
          return false;
        },
      ]),
    ).toBe(-1);
    expect(visited).toEqual([
      ["last", 2],
      [undefined, 1],
      ["first", 0],
    ]);
  });

  test("does not replace a future engine implementation and rejects invalid calls", () => {
    const nativeFindLast = () => "native";
    const nativeFindLastIndex = () => 7;
    const prototype = {
      findLast: nativeFindLast,
      findLastIndex: nativeFindLastIndex,
    };
    installArrayFindLast({ prototype });
    expect(prototype.findLast).toBe(nativeFindLast);
    expect(prototype.findLastIndex).toBe(nativeFindLastIndex);

    const emptyPrototype = {} as {
      findLast?: (predicate: unknown, ...args: [unknown?]) => unknown;
    };
    installArrayFindLast({ prototype: emptyPrototype });
    expect(() => Reflect.apply(emptyPrototype.findLast!, null, [() => true])).toThrow(
      TypeError,
    );
    expect(() => Reflect.apply(emptyPrototype.findLast!, [], [null])).toThrow(
      TypeError,
    );
  });

  test("loads before Expo Router evaluates its findLast call sites", () => {
    const entry = readFileSync(path.join(import.meta.dir, "../../index.ts"), "utf8");
    const polyfillImport = entry.indexOf('import "./src/polyfills/arrayFindLast";');
    const expoImport = entry.indexOf('import "expo-router/entry";');
    expect(polyfillImport).toBeGreaterThanOrEqual(0);
    expect(expoImport).toBeGreaterThan(polyfillImport);
  });
});
