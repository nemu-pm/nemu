type ArrayFindLastPrototype = {
  findLast?: (predicate: unknown, ...args: [unknown?]) => unknown;
  findLastIndex?: (predicate: unknown, ...args: [unknown?]) => number;
};

const MAX_SAFE_LENGTH = 9_007_199_254_740_991;

function toLength(value: unknown): number {
  const number = Number(value);
  if (Number.isNaN(number) || number <= 0) return 0;
  if (number === Number.POSITIVE_INFINITY) return MAX_SAFE_LENGTH;
  return Math.min(Math.floor(number), MAX_SAFE_LENGTH);
}

function requireObject(value: unknown): Record<number | "length", unknown> {
  if (value === null || value === undefined) {
    throw new TypeError("Array.prototype reverse search called on null or undefined");
  }
  return Object(value) as Record<number | "length", unknown>;
}

function requirePredicate(
  value: unknown,
): (value: unknown, index: number, array: unknown) => unknown {
  if (typeof value !== "function") {
    throw new TypeError("Array.prototype reverse search predicate must be a function");
  }
  return value as (value: unknown, index: number, array: unknown) => unknown;
}

export function installArrayFindLast({
  prototype = Array.prototype as ArrayFindLastPrototype,
}: {
  prototype?: ArrayFindLastPrototype;
} = {}): void {
  if (typeof prototype.findLast !== "function") {
    Object.defineProperty(prototype, "findLast", {
      configurable: true,
      enumerable: false,
      value: function findLast(
        this: unknown,
        predicateValue: unknown,
        ...args: [unknown?]
      ): unknown {
        const array = requireObject(this);
        const predicate = requirePredicate(predicateValue);
        const thisArg = args[0];
        for (let index = toLength(array.length) - 1; index >= 0; index -= 1) {
          const value = array[index];
          if (predicate.call(thisArg, value, index, array)) return value;
        }
        return undefined;
      },
      writable: true,
    });
  }

  if (typeof prototype.findLastIndex !== "function") {
    Object.defineProperty(prototype, "findLastIndex", {
      configurable: true,
      enumerable: false,
      value: function findLastIndex(
        this: unknown,
        predicateValue: unknown,
        ...args: [unknown?]
      ): number {
        const array = requireObject(this);
        const predicate = requirePredicate(predicateValue);
        const thisArg = args[0];
        for (let index = toLength(array.length) - 1; index >= 0; index -= 1) {
          if (predicate.call(thisArg, array[index], index, array)) return index;
        }
        return -1;
      },
      writable: true,
    });
  }
}

installArrayFindLast();
