type BigIntShimGlobal = typeof globalThis & {
  BigInt?: (value: unknown) => number;
  __NEMU_BIGINT_SHIMMED__?: boolean;
};

function toNumberInteger(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Cannot convert non-finite number to BigInt");
    if (!Number.isInteger(value)) throw new RangeError("Cannot convert non-integer number to BigInt");
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = trimmed.toLowerCase().startsWith("0x")
      ? parseInt(trimmed, 16)
      : Number(trimmed);
    if (!Number.isFinite(parsed)) throw new SyntaxError(`Cannot convert ${value} to BigInt`);
    if (!Number.isInteger(parsed)) throw new RangeError("Cannot convert non-integer number to BigInt");
    return parsed;
  }

  if (typeof value === "boolean") return value ? 1 : 0;

  if (value === null || value === undefined) {
    throw new TypeError(`Cannot convert ${String(value)} to BigInt`);
  }

  const valueOf = (value as { valueOf?: () => unknown }).valueOf;
  if (typeof valueOf === "function") {
    const primitive = valueOf.call(value);
    if (primitive !== value) return toNumberInteger(primitive);
  }

  return toNumberInteger(String(value));
}

const bigintGlobal = globalThis as BigIntShimGlobal;

if (typeof bigintGlobal.BigInt !== "function") {
  Object.defineProperty(bigintGlobal, "BigInt", {
    configurable: true,
    enumerable: false,
    value: (value: unknown) => toNumberInteger(value),
    writable: true,
  });
  Object.defineProperty(bigintGlobal, "__NEMU_BIGINT_SHIMMED__", {
    configurable: true,
    enumerable: false,
    value: true,
    writable: false,
  });
}
